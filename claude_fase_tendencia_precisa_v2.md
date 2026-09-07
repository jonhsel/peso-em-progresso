# Fase 8.x — Tendência precisa (v2, auditado)

**Status:** v2 — auditado contra `src/lib/analytics.ts`,
`src/components/TrendBadge.tsx`, `src/components/PredictionChart.tsx`,
`src/components/PredictionExplainer.tsx`,
`src/app/(app)/dashboard/prediction/page.tsx`,
`src/lib/pdf/ExportDocument.tsx` e `src/lib/pdf/ReportDocument.tsx` reais
(via `project_knowledge_search`). Pronto para handoff ao Claude Code.

---

## Contexto / problema relatado

1. O card de Tendência (`TrendBadge.tsx`, "TENDÊNCIA (21 DIAS)") mostra só
   um rótulo qualitativo ("Estável") e uma frase genérica
   ("Peso estável, sem variação significativa."), sem nenhum número que
   sustente a classificação. Num caso real (peso oscilando entre ~109 e
   ~111 kg em 21 dias), o usuário não consegue saber *por quê* o app
   classificou como "Estável" nem quão confiável é essa leitura.

2. A página `/dashboard/prediction` (`PredictionChart.tsx` +
   `PredictionExplainer.tsx`), quando a tendência não é de perda
   (`wrong_direction`) ou a meta não tem peso-alvo definido, renderiza só
   o histórico de peso — visualmente idêntico ao card "Evolução do Peso"
   do Dashboard. A página perde sua razão de existir justamente no caso
   mais comum (usuário estável ou sem meta de peso final).

## Decisões

1. **`computeTrend` ganha 3 campos novos**, calculados a partir dos mesmos
   `xs`/`ys` que já existem na função — nenhuma mudança na lógica de
   classificação (`label`) nem nos thresholds:
   - `totalChangeKg`: variação entre o primeiro e o último ponto da janela
     de 21 dias (`ys[n-1] - ys[0]`).
   - `dataPointsCount`: `recent.length` — quantas pesagens sustentam a
     leitura.
   - `r2`: coeficiente de determinação da regressão (0 a 1) — mede o quanto
     a reta ajustada explica a variação real. Baixo `r2` com peso oscilando
     pra cima e pra baixo (como no caso relatado) é exatamente o sinal que
     falta hoje: a tendência pode estar "Estável" *e* ao mesmo tempo pouco
     confiável por causa da oscilação.

2. **`TrendBadge` exibe 3 linhas de métricas** abaixo do texto existente:
   ritmo (`kg/semana`), variação total no período, e nº de pesagens — mais
   um qualificador de consistência derivado de `r2` (Alta/Moderada/Baixa),
   nunca escondendo o texto qualitativo atual, só complementando.

3. **Nova função `computeTrendLine`** em `analytics.ts`: retorna os 2 pontos
   (início e fim da janela de 21 dias) da reta de regressão já calculada
   por `computeTrend` — não recalcula nada, é geometria pura sobre o
   mesmo `slopeKgPerWeek`/intercepto. Serve pra desenhar a reta ajustada
   no gráfico, independente de haver ou não projeção de meta.

4. **`PredictionChart` sempre desenha a linha de tendência** (cinza claro,
   pontilhada, curta — só dentro da janela de 21 dias, sem extrapolar pro
   futuro) além da linha de projeção existente (quando houver). Isso
   resolve o problema #2: mesmo sem projeção de meta, a página de previsão
   passa a mostrar algo que o Dashboard não mostra — o ajuste linear real
   sobre o peso, visualmente distinto da oscilação bruta.

5. **`PredictionExplainer` ganha um bloco "Detalhes do cálculo"** com os
   mesmos números do `TrendBadge` (ritmo, variação, consistência, nº de
   pesagens) — hoje o texto do explainer é fixo e idêntico em qualquer
   situação, sem nenhum dado do usuário.

## Fora de escopo

- Mudar os thresholds/labels de classificação (`perdendo_rapido` etc.) —
  só adiciona métricas, não muda quando cada label aparece.
- Mudar `computeGoalPrediction`, `computePeriodKpi`, `computeAllKpis`.
- Extrapolar a linha de tendência para o futuro (isso é papel da linha de
  projeção existente, que já cobre o caso "com meta e tendência de perda").
- PDF export (`ExportDocument.tsx`, `ReportDocument.tsx`) — ficam com o
  texto atual (`TREND_LABEL[trend.label]`); acrescentar os números lá é
  um patch separado se for desejado depois. Os novos campos em
  `TrendResult` são aditivos — nenhum caller existente quebra.
- Mudança de schema/migração — tudo aqui é cálculo derivado, sem
  persistência nova.

---

## 1. `src/lib/analytics.ts`

### 1.1 Tipo `TrendResult`

```diff
 export type TrendResult = {
   slopeKgPerWeek: number;
   label: "perdendo_rapido" | "perdendo" | "estavel" | "ganhando" | "insufficient_data";
   description: string;
+  totalChangeKg: number;
+  dataPointsCount: number;
+  r2: number;
 };
```

### 1.2 `computeTrend` — casos de dados insuficientes

Os dois early-returns (`points.length < 2` e `recent.length < 2`) também
precisam dos campos novos, com valores neutros:

**`str_replace` #1 — OLD:**

```ts
  if (points.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: "Registre ao menos 2 pesagens para calcular a tendência.",
    };
  }
```

**NEW:**

```ts
  if (points.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: "Registre ao menos 2 pesagens para calcular a tendência.",
      totalChangeKg: 0,
      dataPointsCount: points.length,
      r2: 0,
    };
  }
```

**`str_replace` #2 — OLD:**

```ts
  if (recent.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: `Menos de 2 pesagens nos últimos ${windowDays} dias — pese com mais frequência para ver a tendência atual.`,
    };
  }
```

**NEW:**

```ts
  if (recent.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: `Menos de 2 pesagens nos últimos ${windowDays} dias — pese com mais frequência para ver a tendência atual.`,
      totalChangeKg: 0,
      dataPointsCount: recent.length,
      r2: 0,
    };
  }
```

### 1.3 Cálculo de `r2` e `totalChangeKg`

Inserir logo depois do cálculo de `slopeKgPerWeek` (que já usa
`sumX`/`sumY`/`sumXY`/`sumXX`/`denom`), antes do bloco `let label = ...`:

**`str_replace` — OLD:**

```ts
  const denom = n * sumXX - sumX * sumX;
  const slopePerDay = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const slopeKgPerWeek = Number((slopePerDay * 7).toFixed(3));

  let label: TrendResult["label"] = "estavel";
```

**NEW:**

```ts
  const denom = n * sumXX - sumX * sumX;
  const slopePerDay = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const slopeKgPerWeek = Number((slopePerDay * 7).toFixed(3));

  // Intercepto da reta ajustada (necessário só pro r2 aqui; computeTrendLine
  // recalcula o seu próprio par de pontos a partir de slopeKgPerWeek).
  const meanX = sumX / n;
  const meanY = sumY / n;
  const intercept = meanY - slopePerDay * meanX;

  // R² — quão bem a reta explica a variação real dos pontos. 1 = ajuste
  // perfeito, 0 = a reta não explica nada (peso oscilando sem padrão linear
  // claro dentro da janela).
  const ssTot = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssRes = xs.reduce((acc, x, i) => {
    const predicted = intercept + slopePerDay * x;
    return acc + (ys[i] - predicted) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const totalChangeKg = Number((ys[n - 1] - ys[0]).toFixed(2));

  let label: TrendResult["label"] = "estavel";
```

### 1.4 Return final

O `return` que fecha a função `computeTrend`. O `}` final é o fechamento
da própria função.

**`str_replace` — OLD:**

```ts
  return { slopeKgPerWeek, label, description };
}
```

**NEW:**

```ts
  return {
    slopeKgPerWeek,
    label,
    description,
    totalChangeKg,
    dataPointsCount: n,
    r2: Number(r2.toFixed(3)),
  };
}
```

### 1.5 Nova função `computeTrendLine`

Inserir logo após `computeTrend` (mesmo arquivo). Recalcula os `xs`/`ys`/
regressão sobre a mesma janela — não reaproveita estado interno de
`computeTrend` porque essa função não expõe intercepto/pontos, só o
resultado agregado; duplicar ~15 linhas de regressão é mais simples e
seguro do que mudar a assinatura de `computeTrend` (que tem 2+ callers
já em produção) só pra vazar dados internos.

```ts
export type TrendLine = {
  start: { date: string; weightKg: number };
  end: { date: string; weightKg: number };
};

/**
 * Retorna os 2 pontos (início/fim da janela de `windowDays`) da reta de
 * regressão usada por `computeTrend`, para desenhar a "linha de tendência"
 * no gráfico de previsão. Não extrapola além do fim da janela — isso é
 * papel da linha de projeção (`GoalPrediction`), que já existe e cobre o
 * caso com meta + tendência de perda.
 * Retorna `null` nos mesmos casos em que `computeTrend` retorna
 * `insufficient_data` (sem pontos suficientes pra traçar uma reta).
 */
export function computeTrendLine(entries: WeightEntry[], windowDays = 21): TrendLine | null {
  const points = toPoints(entries);
  if (points.length < 2) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = points.filter((p) => p.date >= cutoff);
  if (recent.length < 2) return null;

  const t0 = recent[0].date.getTime();
  const xs = recent.map((p) => (p.date.getTime() - t0) / 86_400_000);
  const ys = recent.map((p) => p.weight);
  const n = xs.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slopePerDay = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const meanX = sumX / n;
  const meanY = sumY / n;
  const intercept = meanY - slopePerDay * meanX;

  const firstX = xs[0];
  const lastX = xs[n - 1];

  return {
    start: {
      date: formatISO(recent[0].date, { representation: "date" }),
      weightKg: Number((intercept + slopePerDay * firstX).toFixed(2)),
    },
    end: {
      date: formatISO(recent[n - 1].date, { representation: "date" }),
      weightKg: Number((intercept + slopePerDay * lastX).toFixed(2)),
    },
  };
}
```

**Nota:** `formatISO` já está importado de `date-fns` no topo de
`analytics.ts` — confirmado no código real (usado por
`computeMovingAverage`, `computePeriodKpi`, `formatISODate` interno).
Nenhum import novo necessário.

**`TrendLine` é serializable** (só strings e numbers) — pode ser passado
de Server Component (`prediction/page.tsx`) para Client Component
(`PredictionChart.tsx`) sem conversão.

---

## 2. `src/components/TrendBadge.tsx`

Componente atual (confirmado verbatim via `project_knowledge_search`):

```tsx
import type { TrendResult } from "@/lib/analytics";

const STYLES: Record<TrendResult["label"], { icon: string; color: string; text: string }> = {
  perdendo_rapido: { icon: "↓↓", color: "text-signal-ahead", text: "Perdendo rápido" },
  perdendo: { icon: "↓", color: "text-signal-onpace", text: "Perdendo peso" },
  estavel: { icon: "→", color: "text-ink-muted", text: "Estável" },
  ganhando: { icon: "↑", color: "text-signal-behind", text: "Ganhando peso" },
  insufficient_data: { icon: "—", color: "text-ink-faint", text: "Sem dados recentes" },
};

export default function TrendBadge({ trend }: { trend: TrendResult }) {
  const s = STYLES[trend.label];
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Tendência (21 dias)</span>
        <span className={`font-mono text-lg ${s.color}`}>{s.icon}</span>
      </div>
      <p className={`font-display font-bold text-xl ${s.color}`}>{s.text}</p>
      <p className="text-sm text-ink-faint mt-1">{trend.description}</p>
    </div>
  );
}
```

### 2.1 Helper de consistência (função local)

Adicionar dentro do próprio `TrendBadge.tsx`, antes do componente:

```ts
function consistencyLabel(r2: number): { text: string; color: string } {
  if (r2 >= 0.6) return { text: "Alta consistência", color: "text-signal-ahead" };
  if (r2 >= 0.3) return { text: "Consistência moderada", color: "text-[var(--badge-caution-text)]" };
  return { text: "Baixa consistência — peso oscilando bastante", color: "text-signal-behind" };
}
```

**Nota sobre contraste (achado A3 da auditoria — CRÍTICO):**
`text-signal-caution` (`#FBBF24`, amarelo puro) falha WCAG AA em fundo
claro — razão de contraste ~2:1 contra `bg-base-surface` no tema light.
A correção já aplicada no projeto (Fase dark mode, documentada no
`CLAUDE.md` item 12) é usar `text-[var(--badge-caution-text)]` em vez de
`text-signal-caution` para texto sobre fundo claro. A var
`--badge-caution-text` resolve para `#8A5A0B` em light (contrast ratio
~7:1) e para o valor original em dark (sem mudança visual). As classes
`text-signal-ahead` e `text-signal-behind` não têm esse problema de
contraste e podem ser usadas diretamente.

### 2.2 Patch completo do componente

**`str_replace` — OLD:**

```tsx
export default function TrendBadge({ trend }: { trend: TrendResult }) {
  const s = STYLES[trend.label];
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Tendência (21 dias)</span>
        <span className={`font-mono text-lg ${s.color}`}>{s.icon}</span>
      </div>
      <p className={`font-display font-bold text-xl ${s.color}`}>{s.text}</p>
      <p className="text-sm text-ink-faint mt-1">{trend.description}</p>
    </div>
  );
}
```

**NEW:**

```tsx
export default function TrendBadge({ trend }: { trend: TrendResult }) {
  const s = STYLES[trend.label];
  const hasMetrics = trend.label !== "insufficient_data";
  const consistency = hasMetrics ? consistencyLabel(trend.r2) : null;

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Tendência (21 dias)</span>
        <span className={`font-mono text-lg ${s.color}`}>{s.icon}</span>
      </div>
      <p className={`font-display font-bold text-xl ${s.color}`}>{s.text}</p>
      <p className="text-sm text-ink-faint mt-1">{trend.description}</p>

      {hasMetrics && (
        <div className="mt-3 pt-3 border-t border-base-border space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Ritmo</span>
            <span className="font-mono text-ink">
              {Math.abs(trend.slopeKgPerWeek).toFixed(2)} kg/sem
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Variação no período</span>
            <span className="font-mono text-ink">
              {trend.totalChangeKg > 0 ? "+" : ""}
              {trend.totalChangeKg.toFixed(1)} kg
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Baseado em</span>
            <span className="font-mono text-ink">
              {trend.dataPointsCount} {trend.dataPointsCount === 1 ? "pesagem" : "pesagens"}
            </span>
          </div>
          {consistency && (
            <p className={`text-xs ${consistency.color} pt-1`}>{consistency.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Nota sobre Tailwind dinâmico:** todas as classes acima são strings
estáticas completas (`text-signal-ahead`,
`text-[var(--badge-caution-text)]`, `text-signal-behind`) já usadas em
outros componentes do projeto — sem template literal montando nome de
classe, respeitando a regra do `CLAUDE.md` sobre purge safety.

---

## 3. `src/components/PredictionChart.tsx`

### 3.1 Import novo e prop nova

**`str_replace` — OLD:**

```tsx
import type { GoalPrediction } from "@/lib/analytics";
```

**NEW:**

```tsx
import type { GoalPrediction, TrendLine } from "@/lib/analytics";
```

**`str_replace` — OLD:**

```tsx
export default function PredictionChart({
  entries,
  goal,
  prediction,
}: {
  entries: WeightEntry[];
  goal: Goal;
  prediction?: GoalPrediction;
}) {
```

**NEW:**

```tsx
export default function PredictionChart({
  entries,
  goal,
  prediction,
  trendLine,
}: {
  entries: WeightEntry[];
  goal: Goal;
  prediction?: GoalPrediction;
  trendLine?: TrendLine;
}) {
```

### 3.2 Injetar os 2 pontos da linha de tendência no dataset

A linha de tendência usa uma `dataKey` própria (`tendencia`) pra não
conflitar com `peso`/`projetado`. Como `data` é indexado por `label`
(`dd/MM`), o jeito mais simples é achar (ou criar) as entradas
correspondentes às datas de `trendLine.start`/`trendLine.end` dentro do
array `data` já montado, evitando duplicar pontos quando a data já existe.

Inserir logo depois do bloco que monta a linha de projeção (`hasProjection`
+ `if (hasProjection && projectionTarget !== null ...)`), antes do cálculo
de `min`/`max` (`const allWeights = ...`):

**`str_replace` — OLD:**

```ts
  const allWeights = data.map((d) => d.peso).filter((w) => w != null && !isNaN(w));
  const allValues = [...allWeights];
  if (projectionTarget !== null) allValues.push(projectionTarget);
  if (goal.target_value != null) allValues.push(goal.target_value);
```

**NEW:**

```ts
  // Linha de tendência (regressão de 21 dias) — sempre desenhada quando
  // disponível, independente de haver projeção de meta. Resolve o caso em
  // que a tendência não é de perda (ou a meta não tem target_value): a
  // página de previsão continua mostrando algo que o Dashboard não mostra.
  if (trendLine) {
    const addTrendPoint = (date: string, weightKg: number) => {
      const existing = data.find((d) => d.date === date);
      if (existing) {
        existing.tendencia = weightKg;
      } else {
        data.push({
          label: format(parseISO(date), "dd/MM", { locale: ptBR }),
          date,
          peso: undefined as unknown as number,
          tendencia: weightKg,
        });
      }
    };
    addTrendPoint(trendLine.start.date, trendLine.start.weightKg);
    addTrendPoint(trendLine.end.date, trendLine.end.weightKg);
    data.sort((a, b) => a.date.localeCompare(b.date));
  }

  const allWeights = data.map((d) => d.peso).filter((w) => w != null && !isNaN(w));
  const allValues = [...allWeights];
  const trendValues = data.map((d) => d.tendencia).filter((w): w is number => w != null && !isNaN(w));
  allValues.push(...trendValues);
  if (projectionTarget !== null) allValues.push(projectionTarget);
  if (goal.target_value != null) allValues.push(goal.target_value);
```

### 3.3 Tipo `DataPoint` — novo campo opcional

**`str_replace` — OLD:**

```ts
  type DataPoint = { label: string; date: string; peso: number; projetado?: number };
```

**NEW:**

```ts
  type DataPoint = { label: string; date: string; peso: number; projetado?: number; tendencia?: number };
```

### 3.4 Nova `<Line>` no `ComposedChart`

Inserir logo antes da `<Line dataKey="projetado" ...>` já existente (ordem
não afeta renderização, mas mantém as duas linhas de "linha derivada"
juntas no JSX):

**`str_replace` — OLD:**

```tsx
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
```

**NEW:**

```tsx
          {trendLine && (
            <Line
              type="linear"
              dataKey="tendencia"
              name="Linha de tendência"
              stroke={colors.axis}
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          )}
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
```

`colors.axis` já existe no objeto de cores retornado por `readChartColors`
(lê `--ink-faint`, confirmado no código real) — visualmente discreta, não
compete com `peso` (laranja/accent) nem `projetado` (azul `#60A5FA`).

### 3.5 Legenda

Adicionar um item à legenda manual que já existe (bloco com `peso real` /
`projeção`):

**`str_replace` — OLD:**

```tsx
        {hasProjection && projectionTarget !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.projected, opacity: 0.8 }} />
            projeção
          </span>
        )}
      </div>
```

**NEW:**

```tsx
        {hasProjection && projectionTarget !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.projected, opacity: 0.8 }} />
            projeção
          </span>
        )}
        {trendLine && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.axis, opacity: 0.8 }} />
            linha de tendência
          </span>
        )}
      </div>
```

---

## 4. `src/components/PredictionExplainer.tsx`

### 4.1 Import e prop novos

**`str_replace` — OLD:**

```tsx
import type { GoalPrediction } from "@/lib/analytics";

export default function PredictionExplainer({
  prediction,
}: {
  prediction?: GoalPrediction;
}) {
```

**NEW:**

```tsx
import type { GoalPrediction, TrendResult } from "@/lib/analytics";

export default function PredictionExplainer({
  prediction,
  trend,
}: {
  prediction?: GoalPrediction;
  trend?: TrendResult;
}) {
```

### 4.2 Bloco "Detalhes do cálculo"

Inserir logo depois do fechamento do `<div className="space-y-2 ...">` que
contém os 3 parágrafos explicativos, e antes dos avisos condicionais por
`prediction.kind`.

**`str_replace` — OLD:**

```tsx
        <p>
          A previsão precisa de pelo menos 2 pesagens dentro dos últimos
          21 dias e de uma tendência de perda de peso para funcionar.
        </p>
      </div>
      {prediction?.kind === "insufficient_data" && (
```

**NEW:**

```tsx
        <p>
          A previsão precisa de pelo menos 2 pesagens dentro dos últimos
          21 dias e de uma tendência de perda de peso para funcionar.
        </p>
      </div>

      {trend && trend.label !== "insufficient_data" && (
        <div className="pt-2 border-t border-base-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-ink-faint">Ritmo</p>
            <p className="font-mono text-ink">{Math.abs(trend.slopeKgPerWeek).toFixed(2)} kg/sem</p>
          </div>
          <div>
            <p className="text-ink-faint">Variação (21d)</p>
            <p className="font-mono text-ink">
              {trend.totalChangeKg > 0 ? "+" : ""}
              {trend.totalChangeKg.toFixed(1)} kg
            </p>
          </div>
          <div>
            <p className="text-ink-faint">Pesagens usadas</p>
            <p className="font-mono text-ink">{trend.dataPointsCount}</p>
          </div>
          <div>
            <p className="text-ink-faint">Consistência</p>
            <p className="font-mono text-ink">{(trend.r2 * 100).toFixed(0)}%</p>
          </div>
        </div>
      )}

      {prediction?.kind === "insufficient_data" && (
```

**Nota:** o `</div>` que fecha `<div className="space-y-2 text-sm
text-ink-muted">` já está presente no OLD acima — o bloco de detalhes fica
**fora** desse div (hierarquia visual diferente: grid de métricas com
`text-xs`, não `text-sm text-ink-muted`). O `str_replace` preserva essa
estrutura corretamente.

---

## 5. `src/app/(app)/dashboard/prediction/page.tsx`

### 5.1 Import

**`str_replace` — OLD:**

```tsx
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  METRIC_UNIT,
  buildPeriodContext,
  type PeriodKpi,
} from "@/lib/analytics";
```

**NEW:**

```tsx
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  computeTrendLine,
  METRIC_UNIT,
  buildPeriodContext,
  type PeriodKpi,
} from "@/lib/analytics";
```

### 5.2 Calcular `trendLine` uma vez (não depende da meta)

Inserir logo após `const trend = computeTrend(entries);`:

**`str_replace` — OLD:**

```tsx
  const trend = computeTrend(entries);
  const predictionsByGoal: Record<string, GoalPredictions> = {};
```

**NEW:**

```tsx
  const trend = computeTrend(entries);
  const trendLine = computeTrendLine(entries);
  const predictionsByGoal: Record<string, GoalPredictions> = {};
```

### 5.3 Passar as props novas

**`str_replace` — OLD:**

```tsx
                      <PredictionChart
                        entries={entries}
                        goal={goal}
                        prediction={chartPrediction}
                      />
                      <PredictionExplainer prediction={chartPrediction} />
```

**NEW:**

```tsx
                      <PredictionChart
                        entries={entries}
                        goal={goal}
                        prediction={chartPrediction}
                        trendLine={trendLine ?? undefined}
                      />
                      <PredictionExplainer prediction={chartPrediction} trend={trend} />
```

**Nota:** `trendLine` é calculado uma vez sobre `entries` completo (não
por meta) porque a tendência de peso é uma característica dos dados do
usuário, não da meta — mesmo critério já usado por `computeTrend` hoje
(chamado 1x, reaproveitado pras N metas de peso ativas).

`trendLine ?? undefined` converte `null` (retorno de `computeTrendLine`
quando sem dados) para `undefined` (prop opcional do componente) — padrão
TypeScript para props opcionais.

---

## 6. Migração SQL / mudança de tipos

Nenhuma. Tudo aqui é cálculo derivado sobre `entries` já carregado por
`loadUserData()`.

---

## 7. Callers existentes — verificação de retrocompatibilidade

Callers confirmados de `TrendResult` que **não são tocados** neste spec:

| Arquivo | Como usa | Impacto |
|---|---|---|
| `dashboard/page.tsx` | `computeTrend(entries)` → passa pra `TrendBadge` e `computeGoalPrediction` | Nenhum — campos novos são aditivos |
| `dashboard/reports/page.tsx` | `computeTrend(entries)` → passa pra KPIs | Nenhum |
| `ExportDocument.tsx` | Recebe `trend: TrendResult` como prop, lê `trend.label` | Nenhum — `TREND_LABEL[trend.label]` continua funcionando |
| `ReportDocument.tsx` | Recebe `TrendResult` como tipo importado | Nenhum — campos aditivos |

---

## Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Dashboard: `TrendBadge` mostra **ritmo**, variação e nº de pesagens
      em qualquer label (`perdendo_rapido`/`perdendo`/`estavel`/`ganhando`).
- [ ] `TrendBadge` com `insufficient_data`: bloco de métricas não aparece
      (só o texto genérico atual).
- [ ] Caso do print relatado (peso oscilando ~109–111kg, label "Estável"):
      consistência aparece como "Baixa" ou "Moderada", não "Alta" — validar
      visualmente que o r² captura a oscilação.
- [ ] **Tema claro**: texto "Consistência moderada" usa
      `--badge-caution-text` (`#8A5A0B`) e é legível — NÃO amarelo puro.
- [ ] `/dashboard/prediction`, tendência `wrong_direction` (ou `estavel`)
      e meta sem `target_value`: gráfico agora mostra a linha pontilhada
      de tendência (cinza) sobre o histórico — visualmente diferente do
      card do Dashboard.
- [ ] `/dashboard/prediction`, tendência de perda + meta com `target_value`:
      as duas linhas (tendência cinza + projeção azul) aparecem juntas sem
      sobreposição confusa — validar legibilidade.
- [ ] `PredictionExplainer`: bloco "Detalhes do cálculo" some quando
      `trend.label === "insufficient_data"`.
- [ ] `PredictionExplainer`: bloco mostra ritmo, variação, pesagens e
      consistência (%) quando trend tem dados suficientes.
- [ ] Tema claro/escuro: contraste da linha de tendência (`colors.axis`) e
      dos textos novos em ambos os temas.
- [ ] Mobile: grid de 4 métricas no `PredictionExplainer` quebra pra 2
      colunas (`grid-cols-2 sm:grid-cols-4`) sem cortar texto.
- [ ] Mobile: 3 linhas de métricas no `TrendBadge` (ritmo + variação +
      pesagens) não quebram layout do card.
- [ ] Conferir que `ExportDocument.tsx` (PDF) não quebrou — não foi tocado
      neste spec, mas usa `TrendResult` (novos campos são adicionais, não
      quebram o tipo existente).

---

## Ordem de execução sugerida

1. `src/lib/analytics.ts` — `TrendResult` tipo (1.1).
2. `src/lib/analytics.ts` — `computeTrend` early-returns (1.2).
3. `src/lib/analytics.ts` — `computeTrend` cálculo R²/totalChangeKg (1.3).
4. `src/lib/analytics.ts` — `computeTrend` return final (1.4).
5. `npx tsc --noEmit` isolado (garantir que a mudança de tipo não quebra
   nenhum caller existente de `computeTrend` antes de seguir).
6. `src/lib/analytics.ts` — `computeTrendLine` (1.5).
7. `npx tsc --noEmit` isolado.
8. `TrendBadge.tsx` — helper `consistencyLabel` + patch do componente (2).
9. `PredictionChart.tsx` — imports, prop, DataPoint, dataset, Line,
   legenda (3).
10. `PredictionExplainer.tsx` — import, prop, bloco de detalhes (4).
11. `dashboard/prediction/page.tsx` — import, trendLine, props (5).
12. `npx tsc --noEmit` e `npm run build` completos.

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. Tipo `TrendLine` — retorno `| null` na assinatura

**v1 dizia:** tipo `TrendLine = { ... } | null` mas assinatura da função
era `): TrendLine {` — sem o `| null`. A função retorna `null` em dois
early-returns, o que quebraria `tsc`.

**Correção (v2):** tipo separado como objeto puro, assinatura da função
como `): TrendLine | null {`. Padrão mais claro que permite ao caller
fazer `trendLine ?? undefined` na passagem de prop.

### A2. `text-signal-caution` — contraste insuficiente em tema claro (CRÍTICO)

**v1 dizia:** `consistencyLabel` retornava
`color: "text-signal-caution"` para consistência moderada.

**Código real / CLAUDE.md:** `text-signal-caution` (`#FBBF24`, amarelo
puro) falha WCAG AA em fundo claro (`bg-base-surface`). O projeto já
corrigiu isso nos badges de KPI usando `text-[var(--badge-caution-text)]`
(resolve para `#8A5A0B` em light, valor original em dark).

**Correção (v2):** `consistencyLabel` usa
`text-[var(--badge-caution-text)]` em vez de `text-signal-caution`.

### A3. Linha de ritmo (kg/semana) faltando no `TrendBadge`

**v1 dizia (seção de decisões):** "3 linhas de métricas: ritmo (kg/semana),
variação total no período, e nº de pesagens". Porém, o patch do
componente (seção 2.2) mostrava apenas variação + pesagens + consistência,
sem o ritmo.

**Correção (v2):** adicionada a linha "Ritmo" com
`Math.abs(trend.slopeKgPerWeek).toFixed(2) kg/sem` como primeira métrica
do bloco — consistente com a decisão e com o que o
`PredictionExplainer` já mostrava.

### A4. `str_replace` do `PredictionExplainer` — contexto insuficiente

**v1 dizia:** "inserir logo depois do parágrafo 'A previsão precisa...'"
mas o OLD/NEW não incluía contexto suficiente para `str_replace`
unambíguo.

**Correção (v2):** OLD expandido para incluir o fechamento do `</div>` e
a abertura do `{prediction?.kind === "insufficient_data"` — duas âncoras
que garantem match único.

### A5. Import de `buildPeriodContext` — confirmação

**v1 dizia (seção 5.1):** import de `computeTrendLine` sem listar
`buildPeriodContext`. Código real já importa `buildPeriodContext`.

**Correção (v2):** OLD do import expandido para incluir
`buildPeriodContext` na lista real, evitando que o `str_replace` falhe por
contexto diferente.

### A6. Callers de `TrendResult` — verificação completa

**v1 deixava pendente:** "conferir callers fora do dashboard".

**Auditoria confirmou:** `ExportDocument.tsx`, `ReportDocument.tsx`,
`dashboard/page.tsx`, `dashboard/reports/page.tsx` — todos usam
`TrendResult` como tipo de prop ou variável, lendo apenas campos
existentes (`label`, `slopeKgPerWeek`, `description`). Os 3 campos novos
(`totalChangeKg`, `dataPointsCount`, `r2`) são aditivos — nenhum caller
quebra. Seção 7 adicionada ao spec com tabela de verificação.
