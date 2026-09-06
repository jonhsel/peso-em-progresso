# Fase 8.1.1 — Página de Previsão da Meta (spec v2)

> v2 = v1 + auditoria completa contra o código real. Todos os achados da
> auditoria estão incorporados no texto principal. Apêndice B documenta
> o que mudou de v1 → v2. Pronta para handoff ao Claude Code.
>
> Ler `CLAUDE.md` e `claude_fases.md` antes de implementar — este documento
> assume as convenções já estabelecidas no projeto (design tokens, route
> group `(app)`, sem Server Actions pra escrita de tabela, RLS, wrapper
> `flex flex-col sm:flex-row min-h-screen`).

---

## 0. Decisões tomadas (com o usuário)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Gate de plano | **Pro-only na página nova E no dashboard atual** — fecha o gap |
| 2 | Escopo de metas | **Todas as metas de peso ativas** (Fase 6.2) |
| 3 | Conteúdo da página | **Cards semana/mês + gráfico de tendência projetada + texto explicando o cálculo** |

---

## 1. Problema do gate atual (achado, não regressão)

`dashboard/page.tsx` calcula `predictionsByGoal` e passa pro `GoalTabs` sem
checar `profile.plan`. O `GoalTabs` (código real confirmado) recebe:

```ts
export default function GoalTabs({
  goals,
  kpisByGoal,
  predictionsByGoal,
}: { ... })
```

**Não recebe `plan`.** Ou seja, hoje um usuário Grátis vê a previsão
completa (📈 "meta em ~N dias") no dashboard principal — a Sidebar marca o
item como Pro desde o hotfix 1, mas a proteção real nunca foi aplicada.

**Abordagem:** o KPI de 4 status é feature Grátis (o card inteiro não pode
ficar atrás de `PlanGate`). A *linha de previsão* dentro do card é que deve
ser Pro. O `KpiCard` ganha uma variação "trancada" da linha — teaser com
link de upgrade. Na página nova, `PlanGate` de bloco normal (tudo Pro).

---

## 2. Patch em `GoalTabs.tsx` — nova prop `plan`

**Código real confirmado** — `GoalTabs` é `"use client"` e já importa `Link`
de `next/link`. A prop `plan` é nova:

```diff
 export default function GoalTabs({
   goals,
   kpisByGoal,
   predictionsByGoal,
+  plan,
 }: {
   goals: Goal[];
   kpisByGoal: Record<string, PeriodKpi[]>;
   predictionsByGoal: Record<string, GoalPredictions>;
+  plan?: "free" | "pro";
 }) {
```

Na renderização dos `KpiCard`, adicionar `predictionLocked`:

```diff
           <KpiCard
             key={kpi.period}
             kpi={kpi}
             unit={unit}
             prediction={
               kpi.period === "week" ? predictions.week : kpi.period === "month" ? predictions.month : undefined
             }
+            predictionLocked={plan === "free" && (kpi.period === "week" || kpi.period === "month")}
           />
```

---

## 3. Patch em `dashboard/page.tsx` — não calcular previsão pro Grátis + passar `plan`

**Código real confirmado** — `dashboard/page.tsx` chama `<GoalTabs>` assim:

```tsx
<GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={predictionsByGoal} />
```

### 3.1 Não calcular previsão real pro free

```diff
   for (const goal of activeGoals) {
     if (goal.metric !== "weight") continue;
     const kpis = kpisByGoal[goal.id] ?? [];
     const weekKpi = kpis.find((k) => k.period === "week");
     const monthKpi = kpis.find((k) => k.period === "month");
     predictionsByGoal[goal.id] = {
-      week: weekKpi ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
-      month: monthKpi ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
+      week: weekKpi && profile.plan === "pro" ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
+      month: monthKpi && profile.plan === "pro" ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
     };
   }
```

### 3.2 Passar `plan` pro `GoalTabs`

```diff
-        <GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={predictionsByGoal} />
+        <GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={predictionsByGoal} plan={profile.plan} />
```

### 3.3 Propagação — quem mais chama `<GoalTabs>`?

Confirmado por busca no código real:

| Caller | Arquivo | Ação |
|---|---|---|
| Dashboard | `dashboard/page.tsx` | Patch acima |
| Coach (visão) | `dashboard/coach/[ownerId]/page.tsx` | **Não passar `plan`** — coach sempre vê tudo (undefined → sem lock, comportamento Pro). Sem mudança. |

`reports/page.tsx` **não** usa `GoalTabs` — usa `ReportsClient` com lógica
própria, e a página inteira já está atrás de `PlanGate featureName="Relatórios"`.
Sem mudança.

---

## 4. Patch em `KpiCard.tsx` — prop `predictionLocked`

**Código real confirmado** — `KpiCard` é Server Component (sem `"use client"`),
**não** importa `Link` de `next/link`. A prop nova `predictionLocked`
requer acrescentar o import de `Link`.

### 4.1 Import novo

```diff
+import Link from "next/link";
 import type { GoalPrediction, PeriodKpi } from "@/lib/analytics";
```

`KpiCard` é Server Component — `<Link>` funciona sem virar Client Component
(confirmado: `Link` é exportado de `next/link` como componente acessível em
Server Components desde o Next 13).

### 4.2 Prop nova

```diff
 export default function KpiCard({
   kpi,
   prediction,
   unit = "kg",
+  predictionLocked = false,
 }: {
   kpi: PeriodKpi;
   prediction?: GoalPrediction;
   unit?: string;
+  predictionLocked?: boolean;
 }) {
```

### 4.3 Renderização do teaser trancado

Inserir **antes** do bloco `{prediction && (...)}` já existente, dentro do
ramo `hasData`, logo após o bloco `{kpi.expectedWeightNowKg !== null && ...}`:

**`str_replace` — OLD (verbatim do código real):**

```tsx
          {prediction && (
            <p className="text-xs text-ink-faint">
```

**`str_replace` — NEW:**

```tsx
          {predictionLocked && !prediction && (
            <p className="text-xs text-ink-faint">
              <Link href="/dashboard/upgrade" className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition">
                🔒 Previsão da meta é Pro
              </Link>
            </p>
          )}

          {prediction && (
            <p className="text-xs text-ink-faint">
```

`predictionLocked && !prediction` — o teaser só aparece quando a previsão
não é passada (free) e o flag está ativo. Se por acidente ambos forem
passados, `prediction` vence (dados > teaser).

---

## 5. Nova rota: `src/app/(app)/dashboard/prediction/page.tsx`

Server Component, mesmo padrão de `reports/page.tsx` (confirmado:
`loadUserData()` + `getTheme()` + `Sidebar` + `PlanGate` + wrapper
`flex flex-col sm:flex-row min-h-screen`, conteúdo em
`max-w-6xl mx-auto px-4 py-8`).

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  METRIC_UNIT,
  type PeriodKpi,
} from "@/lib/analytics";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import KpiCard from "@/components/KpiCard";
import PredictionChart from "@/components/PredictionChart";
import PredictionExplainer from "@/components/PredictionExplainer";
import type { GoalPredictions } from "@/components/GoalTabs";

export const dynamic = "force-dynamic";

export default async function PredictionPage() {
  const { profile, entries, measurements, activeGoals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  const weightGoals = activeGoals.filter((g) => g.metric === "weight");

  const kpisByGoal: Record<string, PeriodKpi[]> = Object.fromEntries(
    weightGoals.map((goal) => {
      const points = extractMetricPoints(goal.metric, entries, measurements);
      const history = goalsHistory.filter((h) => h.goal_id === goal.id);
      return [
        goal.id,
        computeAllKpis(points, history, new Date(), profile.period_mode, profile.week_starts_on, METRIC_UNIT[goal.metric]),
      ];
    })
  );

  const trend = computeTrend(entries);
  const predictionsByGoal: Record<string, GoalPredictions> = {};
  for (const goal of weightGoals) {
    const kpis = kpisByGoal[goal.id] ?? [];
    const weekKpi = kpis.find((k) => k.period === "week");
    const monthKpi = kpis.find((k) => k.period === "month");
    predictionsByGoal[goal.id] = {
      week: weekKpi ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
      month: monthKpi ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
    };
  }

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-6xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Previsão da Meta">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Previsão da Meta</p>
              {weightGoals.length === 0 ? (
                <div className="bg-base-surface border border-base-border rounded-card p-5">
                  <p className="text-sm text-ink-faint">
                    Nenhuma meta de peso ativa. A previsão funciona sobre metas de peso —
                    crie uma em <a href="/dashboard/goals" className="text-accent hover:text-accent-hover underline">Metas</a>.
                  </p>
                </div>
              ) : (
                weightGoals.map((goal) => {
                  const kpis = kpisByGoal[goal.id] ?? [];
                  const weekKpi = kpis.find((k) => k.period === "week") ?? null;
                  const monthKpi = kpis.find((k) => k.period === "month") ?? null;
                  const predictions = predictionsByGoal[goal.id] ?? {};
                  // Usar a previsão do mês pro gráfico (período mais longo
                  // = projeção mais intuitiva); fallback pra semana.
                  const chartPrediction = predictions.month ?? predictions.week;
                  return (
                    <section key={goal.id} className="space-y-4">
                      {weightGoals.length > 1 && (
                        <h2 className="font-display font-bold text-lg">
                          {goal.label ?? "Meta de peso"}
                        </h2>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {weekKpi && <KpiCard kpi={weekKpi} prediction={predictions.week} />}
                        {monthKpi && <KpiCard kpi={monthKpi} prediction={predictions.month} />}
                      </div>
                      <PredictionChart
                        entries={entries}
                        goal={goal}
                        prediction={chartPrediction}
                      />
                      <PredictionExplainer prediction={chartPrediction} />
                    </section>
                  );
                })
              )}
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
```

Notas de conformidade:
- `export const dynamic = "force-dynamic"` — obrigatório em rotas com
  dados pessoais (padrão do projeto: `Cache-Control: no-store, private`).
- Dentro do `PlanGate`, `KpiCard` recebe `prediction` real sem
  `predictionLocked` — quem está na página já passou pelo gate.
- `activeGoals` (não `weightGoals`) passado pro `Sidebar` — a Sidebar
  mostra a meta de peso no bloco de perfil, filtrada internamente.
- `<a>` em vez de `<Link>` no estado vazio porque é Server Component e
  o target é outra rota — funciona igual, sem overhead de client nav.

---

## 6. Novo componente: `src/components/PredictionChart.tsx` (client)

Gráfico dedicado da página de previsão, **isolado** do `WeightChart.tsx`
compartilhado (que já é complexo e tem 6+ callers — não vale mexer pra
isso). Usa Recharts (já no projeto), mesma técnica de leitura de CSS vars.

### 6.1 Decisão: reutilizar `readChartColors` ou duplicar?

**Código real confirmado:** `readChartColors` é função privada (não
exportada) dentro de `WeightChart.tsx`, junto com `FALLBACK_CHART_COLORS`.
Bloco de ~10 linhas.

**Decisão: duplicar.** Extrair pra `lib/chart-colors.ts` toca em
`WeightChart.tsx` (altera imports de um arquivo compartilhado por 6+
páginas) — risco desproporcional ao benefício de DRY num bloco de 10
linhas. Pra reaproveitar sem tocar no `WeightChart`, teria que exportar de
lá, o que polui o contrato público dele. Duplicar aqui é mais seguro. Se
no futuro aparecer um 3º componente de gráfico, aí vale a extração — mas
não nesta spec.

### 6.2 Implementação completa

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry, Goal } from "@/types/database";
import type { GoalPrediction } from "@/lib/analytics";

// Duplicado de WeightChart.tsx — ver decisão 6.1 no spec.
const FALLBACK_CHART_COLORS = {
  grid: "#26314A",
  axis: "#5B6584",
  tooltipBg: "#1B2438",
  tooltipBorder: "#26314A",
  tooltipLabel: "#8C97B4",
  accent: "#D97A45",
  projected: "#60A5FA",
};

function readChartColors(el: HTMLElement) {
  const s = getComputedStyle(el);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    grid: v("--base-border") || FALLBACK_CHART_COLORS.grid,
    axis: v("--ink-faint") || FALLBACK_CHART_COLORS.axis,
    tooltipBg: v("--base-surface") || FALLBACK_CHART_COLORS.tooltipBg,
    tooltipBorder: v("--base-border") || FALLBACK_CHART_COLORS.tooltipBorder,
    tooltipLabel: v("--ink-muted") || FALLBACK_CHART_COLORS.tooltipLabel,
    accent: v("--accent") || FALLBACK_CHART_COLORS.accent,
    projected: FALLBACK_CHART_COLORS.projected,
  };
}

export default function PredictionChart({
  entries,
  goal,
  prediction,
}: {
  entries: WeightEntry[];
  goal: Goal;
  prediction?: GoalPrediction;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(FALLBACK_CHART_COLORS);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setColors(readChartColors(el));

    const themeRoot = document.getElementById("app-theme-root");
    if (!themeRoot) return;
    const observer = new MutationObserver(() => setColors(readChartColors(el)));
    observer.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Filtrar últimos 90 dias de entries (peso)
  const now = new Date();
  const cutoff = subDays(now, 90);
  const sorted = entries
    .filter((e) => parseISO(e.measured_at) >= cutoff)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));

  if (sorted.length === 0) {
    return (
      <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-5">
        <p className="text-sm text-ink-faint">Sem pesagens nos últimos 90 dias para exibir o gráfico.</p>
      </div>
    );
  }

  // Pontos reais
  type DataPoint = { label: string; date: string; peso: number; projetado?: number };
  const data: DataPoint[] = sorted.map((e) => ({
    label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
    date: e.measured_at,
    peso: e.weight,
  }));

  // Linha projetada: do último ponto real até a data estimada
  const lastEntry = sorted[sorted.length - 1];
  const hasProjection = prediction?.kind === "projected";
  let projectionTarget: number | null = null;

  if (hasProjection && prediction.kind === "projected") {
    // Se a meta tem target_value, o destino é o target_value.
    // Senão, estimar: peso atual - (targetLossKg - actualLossKg), mas
    // como a prediction só guarda estimatedDate/daysFromNow, usamos o
    // slopeKgPerWeek implícito via a previsão:
    //   peso_alvo = peso_atual - (daysFromNow / 7) * lossPerWeek
    // Porém, não temos lossPerWeek aqui (seria precisar de trend).
    // Solução mais simples e confiável: se goal.target_value existe,
    // usar; se não, o ponto final da linha é calculado como
    //   lastWeight - (lastWeight - expectedFinalWeight)
    // onde expectedFinalWeight é o que daria "already_reached".
    // Na prática, sem target_value a prediction é sobre bater o
    // targetLossKg do período — não há um "peso de chegada" claro pra
    // desenhar. Nesse caso, não desenhamos a projeção (só o texto).
    projectionTarget = goal.target_value;
  }

  if (hasProjection && projectionTarget !== null && prediction.kind === "projected") {
    // Adicionar o último ponto real com `projetado` = peso real (ponto de
    // partida da linha tracejada)
    data[data.length - 1].projetado = lastEntry.weight;

    // Ponto final: data estimada, peso alvo
    data.push({
      label: format(parseISO(prediction.estimatedDate), "dd/MM", { locale: ptBR }),
      date: prediction.estimatedDate,
      peso: undefined as unknown as number, // sem peso real nesse ponto
      projetado: projectionTarget,
    });
  }

  const allWeights = data.map((d) => d.peso).filter((w) => w != null && !isNaN(w));
  const allValues = [...allWeights];
  if (projectionTarget !== null) allValues.push(projectionTarget);
  if (goal.target_value != null) allValues.push(goal.target_value);

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = Math.max(0.5, (max - min) * 0.15);

  return (
    <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-4 h-80">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Projeção de tendência (últimos 90 dias)</p>
      </div>
      <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
          peso real
        </span>
        {hasProjection && projectionTarget !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.projected, opacity: 0.8 }} />
            projeção
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="predGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke={colors.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
            minTickGap={24}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            stroke={colors.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: colors.tooltipLabel }}
            formatter={(value: number, name: string) => {
              if (value == null || isNaN(value)) return ["-", name];
              return [`${value.toFixed(1)} kg`, name];
            }}
          />
          {goal.target_value != null && (
            <ReferenceLine
              y={goal.target_value}
              stroke="#34D399"
              strokeDasharray="4 4"
              label={{
                value: "Meta",
                fill: "#34D399",
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="peso"
            name="Peso"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#predGradient)"
            dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
          {hasProjection && projectionTarget !== null && (
            <Line
              type="linear"
              dataKey="projetado"
              name="Projeção"
              stroke={colors.projected}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: colors.tooltipBg, stroke: colors.projected, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

Notas:
- `ComposedChart`, não `AreaChart` — mesma lição do bug da Fase 5.2 documentado
  no `CLAUDE.md` (recharts descarta `<Line>` dentro de `<AreaChart>`).
- `connectNulls={false}` no `Area` e `connectNulls` (true) no `Line` — o ponto
  de projeção não tem `peso`, e o último ponto real não tem `projetado` no
  início, mas sim no ponto de junção.
- Sem seletor de período (não é necessário numa página de previsão — janela
  fixa de 90 dias pra contexto).
- Linha projetada só aparece se a meta tem `target_value` definido **e**
  `prediction.kind === "projected"`. Sem `target_value`, não há destino
  claro pra desenhar a linha (o card de texto já explica a situação).
- `#34D399` fixo pra `ReferenceLine` da meta — mesma cor usada em
  `WeightChart.tsx` (confirmado no código real).

---

## 7. Novo componente: `src/components/PredictionExplainer.tsx`

Server Component puro, sem estado:

```tsx
import type { GoalPrediction } from "@/lib/analytics";

export default function PredictionExplainer({
  prediction,
}: {
  prediction?: GoalPrediction;
}) {
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5 space-y-3">
      <p className="text-sm font-medium text-ink">Como funciona a previsão</p>
      <div className="space-y-2 text-sm text-ink-muted">
        <p>
          Usamos uma regressão linear sobre suas pesagens dos últimos 21 dias
          para estimar o ritmo real de mudança de peso — não o ritmo planejado
          da meta, mas o que os dados mostram que está acontecendo de fato.
        </p>
        <p>
          A partir desse ritmo, projetamos quando você deve alcançar o
          peso-alvo. Se não houver peso-alvo definido na meta, a previsão
          calcula quando a meta de perda do período atual será batida no
          ritmo atual.
        </p>
        <p>
          A previsão precisa de pelo menos 2 pesagens dentro dos últimos
          21 dias e de uma tendência de perda de peso para funcionar.
        </p>
      </div>
      {prediction?.kind === "insufficient_data" && (
        <p className="text-sm text-signal-caution">
          Registre ao menos 2 pesagens nos últimos 21 dias para ativar a previsão.
        </p>
      )}
      {prediction?.kind === "wrong_direction" && (
        <p className="text-sm text-signal-behind">
          A tendência dos últimos 21 dias não é de perda — a previsão de
          chegada na meta não se aplica enquanto isso não mudar.
        </p>
      )}
      {prediction?.kind === "already_reached" && (
        <p className="text-sm text-signal-ahead">
          {prediction.withTarget
            ? "Parabéns — seu peso já está no valor da meta ou abaixo dele!"
            : "A meta de perda deste período já foi batida!"}
        </p>
      )}
    </div>
  );
}
```

---

## 8. `Sidebar.tsx` — remover `comingSoon` do item

**Código real confirmado** (ver busca acima — item exato no array `links`):

**`str_replace` — OLD:**

```tsx
  { href: "/dashboard/prediction", label: "Previsão da Meta", icon: TrendingUp, premium: true, comingSoon: true },
```

**`str_replace` — NEW:**

```tsx
  { href: "/dashboard/prediction", label: "Previsão da Meta", icon: TrendingUp, premium: true },
```

---

## 9. Migração SQL

Nenhuma — leitura pura sobre dados já existentes.

## 10. Mudanças de tipos (`database.ts`)

Nenhuma — sem coluna nova, sem type novo.

---

## 11. Fora de escopo (explícito)

- Previsão para métricas além de peso — `computeTrend` é exclusivo de
  `weight_entries` (decisão técnica Fase 6.2).
- Previsão de trimestre/semestre (mesma decisão Fase 5.1).
- Qualquer mudança em `computeTrend`/`computePeriodKpi`/`computeAllKpis`.
- Mudar o `WeightChart.tsx` compartilhado — o gráfico de projeção é
  componente isolado (`PredictionChart.tsx`).
- PDF/relatório de previsão — só UI in-app.
- Linha de projeção sem `target_value` definido — sem destino visual
  claro, o texto do card já cobre a informação.
- Sub-fases 8.1.2 (Conquistas) e 8.1.3 (Exportar Dados).
- Notificação quando a previsão muda de categoria.

---

## Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] **Gate no dashboard (Grátis):** KPI de semana/mês aparece
      normalmente, mas a linha de previsão é substituída por
      "🔒 Previsão da meta é Pro" com link pra `/dashboard/upgrade`.
- [ ] **Gate na página (Grátis):** `/dashboard/prediction` mostra o bloco
      de `PlanGate` (trancado), sem dados vazando.
- [ ] **Conta Pro, 1 meta de peso com `target_value`:** `/dashboard/prediction`
      mostra 2 cards (semana/mês) + gráfico com `ReferenceLine` verde na
      meta + linha tracejada azul até a data estimada + texto explicativo.
- [ ] **Conta Pro, 1 meta de peso sem `target_value`:** gráfico mostra
      só a `Area` de peso real (sem linha de projeção), cards mostram a
      previsão baseada em `targetLossKg`, texto explica.
- [ ] **Conta Pro, 2+ metas de peso:** uma `<section>` por meta, cada uma
      com seu gráfico/previsão independente.
- [ ] **Sem nenhuma meta de peso ativa:** mensagem "Nenhuma meta de peso
      ativa" com link pra Metas.
- [ ] **Tendência `insufficient_data`:** gráfico sem projeção, texto
      amarelo no `PredictionExplainer`.
- [ ] **Tendência `wrong_direction`:** gráfico sem projeção, texto
      vermelho no `PredictionExplainer`.
- [ ] **Meta `already_reached`:** sem projeção (sem futuro a desenhar),
      texto verde.
- [ ] **Sidebar:** "Previsão da Meta" agora navega (não é mais `<span>`
      desabilitado cinza). Badge Pro continua.
- [ ] **Tema claro/escuro:** gráfico novo respeita CSS vars, teaser
      "🔒" tem contraste adequado.
- [ ] **Mobile:** gráfico `h-80` responsivo, cards empilham em
      `grid-cols-1`.
- [ ] **`reports/page.tsx`:** sem mudança, previsão continua funcionando
      (protegida pelo PlanGate de Relatórios).
- [ ] **`coach/[ownerId]/page.tsx`:** sem mudança, coach continua vendo
      previsão (sem `plan` passado pro GoalTabs = sem lock).

---

## Passos de execução (ordem)

1. Ler `src/components/KpiCard.tsx` real — confirmar que não importa `Link`.
2. Patch `KpiCard.tsx`: add `import Link`, add prop `predictionLocked`,
   add bloco de teaser trancado.
3. Patch `GoalTabs.tsx`: add prop `plan`, add `predictionLocked` nos cards.
4. Patch `dashboard/page.tsx`: condicionar previsão ao `plan === "pro"`,
   passar `plan` pro `GoalTabs`.
5. Criar `src/components/PredictionExplainer.tsx`.
6. Criar `src/components/PredictionChart.tsx`.
7. Criar `src/app/(app)/dashboard/prediction/page.tsx`.
8. Patch `Sidebar.tsx`: remover `comingSoon: true` do item de previsão.
9. `npx tsc --noEmit` e `npm run build`.
10. Rodar checklist de teste manual.
11. Atualizar `CLAUDE.md` (nova seção "Fase 8.1.1 — Página de Previsão da
    Meta") e marcar o item em `claude_fases.md`.

---

## Apêndice B — Achados da auditoria v1 → v2

| # | Pendência v1 | Resolução |
|---|---|---|
| B1 | `dashboard/page.tsx` passa `plan` pro `<GoalTabs>`? | **Não passa.** Adicionado como novo diff (seção 3.2). |
| B2 | Peso-alvo implícito sem `target_value` (seção 4.1 do v1) | **Não desenhar linha de projeção sem `target_value`** — sem destino visual claro; o texto do card já cobre. Decisão fechada (seção 6.2). |
| B3 | `PredictionChart.tsx` em pseudocódigo | **Implementação completa** (seção 6.2), incluindo tratamento de 0 pontos, ponto de junção real→projetado, `connectNulls`, `ComposedChart`. |
| B4 | Extração de `readChartColors` pra `lib/` | **Duplicar** — menor risco que tocar em `WeightChart.tsx` com 6+ callers (seção 6.1). |
| B5 | Import de `Link` em `KpiCard.tsx` | **Confirmado Server Component, sem `"use client"`, sem import de `Link` hoje.** `Link` funciona em Server Components. Adicionado no diff (seção 4.1). |
| B6 | Altura visual do teaser trancado no grid | O teaser "🔒 Previsão da meta é Pro" é 1 linha `text-xs`, mesma hierarquia visual da previsão real (1 `<p>` de `text-xs text-ink-faint`). Sem mudança de altura do card — mesma quantidade de linhas em ambos os estados. |
| B7 | `GoalTabs` callers — coach passa `plan`? | **Não deve passar.** Coach sempre vê tudo do cliente (decisão Fase 7 documentada). `plan` fica `undefined` = sem lock. Sem mudança. |
| B8 | `export const dynamic` faltando na rota nova | Adicionado `export const dynamic = "force-dynamic"` — padrão do projeto pra rotas com dados pessoais. |
