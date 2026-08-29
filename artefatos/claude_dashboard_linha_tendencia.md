# Dashboard — Linha de tendência da semana no gráfico de evolução

## Contexto para o Claude Code

Pedido veio de feedback direto do usuário olhando `/dashboard` em produção: o
`WeightChart.tsx` mostra a linha real do peso e uma `ReferenceLine` horizontal
verde pra meta final (`targetWeightKg`), mas não mostra o conceito central do
produto — "onde eu deveria estar hoje, seguindo o ritmo da meta" — que já
existe visualmente na landing (`src/components/marketing/TrajectoryGraphic.tsx`,
usado no hero de `/` e na tela 2 do onboarding) como a "linha esperada" tracejada
contra a "linha real".

O `WeightChart.tsx` do dashboard nunca ganhou essa segunda linha. A matemática
já existe e está centralizada em `computePeriodKpi` (`src/lib/analytics.ts`):
para o período `"week"`, o retorno já traz `periodStart`, `baselineWeightKg` e
`expectedWeightNowKg` — os dois pontos que definem a reta esperada da semana.
Não deve haver lógica nova de cálculo, só desenhar o que já é calculado.

**Sem mudança de schema, sem novo endpoint. Patch em 2 arquivos existentes.**
Isso não é uma fase nova do `claude_fases.md` — é um patch de UI no dashboard,
mesmo padrão de `claude_dashboard_kpi_teaser.md` e `claude_landing_como_funciona.md`.

**Antes de aplicar:** confirme lendo os arquivos reais que:
- `src/app/(app)/dashboard/page.tsx` já calcula `kpis` via `computeAllKpis` e já
  tem (ou consegue ter) `const weekKpi = kpis.find((k) => k.period === "week")`
  — usado hoje por `KpiWeeklyTeaser`. Reaproveitar essa mesma variável, não
  recalcular.
- `PeriodKpi` (tipo exportado de `src/lib/analytics.ts`) ainda tem os campos
  `periodStart: string`, `baselineWeightKg: number | null`,
  `expectedWeightNowKg: number | null`. Se os nomes mudaram, ajustar abaixo.
- `date-fns` já está nas dependências (`WeightChart.tsx` já importa `format`,
  `parseISO`) — vamos usar também `differenceInCalendarDays`, que já é
  dependência transitiva do pacote, mas confirmar que não precisa de import
  extra além do já existente.

---

## 1. `src/components/WeightChart.tsx`

### 1.1 Nova prop `weekKpi`

Trocar a assinatura do componente:

```diff
+import type { PeriodKpi } from "@/lib/analytics";
+import { differenceInCalendarDays } from "date-fns";

 export default function WeightChart({
   entries,
   targetWeightKg,
+  weekKpi,
 }: {
   entries: WeightEntry[];
   targetWeightKg: number | null;
+  weekKpi: PeriodKpi | null;
 }) {
```

### 1.2 Merge da linha esperada nos dados do gráfico

Substituir o bloco que monta `data`:

```diff
-  const data = [...entries]
-    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
-    .map((e) => ({
-      date: e.measured_at,
-      label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
-      peso: Number(e.weight_kg),
-    }));
+  // Linha "esperado": mesma matemática de computePeriodKpi (analytics.ts),
+  // só desenhada. baselineWeightKg = peso no início da semana (ou mais
+  // próximo dele), expectedWeightNowKg = onde a meta prevê que eu esteja
+  // hoje. A reta entre esses dois pontos, no tempo, é o "ritmo da semana" —
+  // mesmo conceito da linha tracejada em TrajectoryGraphic.tsx (landing).
+  // Não recalcula nada: usa o resultado já pronto de computePeriodKpi.
+  const weekStart =
+    weekKpi?.periodStart ? parseISO(weekKpi.periodStart) : null;
+  const hasWeeklyTrend =
+    weekStart !== null &&
+    weekKpi?.baselineWeightKg != null &&
+    weekKpi?.expectedWeightNowKg != null;
+
+  const totalElapsedDays = weekStart
+    ? differenceInCalendarDays(new Date(), weekStart)
+    : 0;
+
+  const data = [...entries]
+    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
+    .map((e) => {
+      const point: {
+        date: string;
+        label: string;
+        peso: number;
+        esperado?: number;
+      } = {
+        date: e.measured_at,
+        label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
+        peso: Number(e.weight_kg),
+      };
+
+      // Só marca "esperado" pra pesagens dentro da semana atual — fora
+      // desse intervalo a reta não tem significado (é um KPI por período).
+      if (hasWeeklyTrend && weekStart) {
+        const entryDate = parseISO(e.measured_at);
+        const elapsedAtEntry = differenceInCalendarDays(entryDate, weekStart);
+        if (elapsedAtEntry >= 0) {
+          const frac =
+            totalElapsedDays > 0
+              ? Math.min(1, elapsedAtEntry / totalElapsedDays)
+              : elapsedAtEntry === 0
+              ? 0
+              : null;
+          if (frac !== null) {
+            point.esperado = Number(
+              (
+                weekKpi!.baselineWeightKg! +
+                (weekKpi!.expectedWeightNowKg! - weekKpi!.baselineWeightKg!) * frac
+              ).toFixed(2)
+            );
+          }
+        }
+      }
+
+      return point;
+    });
```

Nota sobre `totalElapsedDays > 0`: se hoje é o próprio primeiro dia da semana
(`elapsedAtEntry === 0` e `totalElapsedDays === 0`), a reta ainda não tem pra
onde apontar — mostramos só o ponto inicial (`frac = 0`, ou seja
`esperado = baselineWeightKg`), sem desenhar segmento. Recharts com um único
ponto válido não desenha linha visível, o que é o comportamento certo (não
há "ritmo da semana" definido com 1 dia de dado).

### 1.3 Renderizar a linha tracejada

Adicionar `Line` aos imports do Recharts:

```diff
 import {
   ResponsiveContainer,
   AreaChart,
   Area,
+  Line,
   XAxis,
   YAxis,
   CartesianGrid,
   Tooltip,
   ReferenceLine,
 } from "recharts";
```

E no JSX, logo depois da `Area` do peso real (ordem importa: desenhar a linha
esperada por cima garante que ela não fica escondida atrás do preenchimento
do gradiente):

```diff
           <Area
             type="monotone"
             dataKey="peso"
             stroke={colors.accent}
             strokeWidth={2}
             fill="url(#pesoGradient)"
             dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
             activeDot={{ r: 4 }}
           />
+          {hasWeeklyTrend && (
+            <Line
+              type="linear"
+              dataKey="esperado"
+              stroke={colors.axis}
+              strokeWidth={1.5}
+              strokeDasharray="4 4"
+              dot={false}
+              activeDot={false}
+              connectNulls
+              isAnimationActive={false}
+              legendType="none"
+            />
+          )}
         </AreaChart>
```

`connectNulls` é necessário porque pesagens fora da semana atual não têm a
chave `esperado` (`undefined`), e sem isso o Recharts corta a linha em cada
gap em vez de simplesmente não desenhar fora do intervalo da semana (o efeito
visual é o mesmo — só os pontos dentro da semana têm valor — mas
`connectNulls` evita comportamento inconsistente entre versões do Recharts
quando o primeiro/último ponto do dataset cai fora do intervalo).

### 1.4 Legenda curta abaixo do gráfico (opcional, mas recomendado)

Mesmo padrão da landing (`peso real` / `no ritmo`, ver `src/app/page.tsx`
hero). Só aparece quando `hasWeeklyTrend` é verdadeiro, pra não poluir o
card quando não há meta semanal definida:

```diff
       <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 px-1">Evolução do peso</p>
+      {hasWeeklyTrend && (
+        <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint">
+          <span className="flex items-center gap-1.5">
+            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
+            peso real
+          </span>
+          <span className="flex items-center gap-1.5">
+            <span
+              className="h-0.5 w-3"
+              style={{ backgroundColor: colors.axis, opacity: 0.8 }}
+            />
+            ritmo da semana
+          </span>
+        </div>
+      )}
       <ResponsiveContainer width="100%" height="90%">
```

Cor via `style` inline (não classe Tailwind) pelo mesmo motivo documentado no
topo do arquivo: essas cores só existem como CSS var lida em runtime
(`colors.accent`/`colors.axis`), não como classe estática.

---

## 2. `src/app/(app)/dashboard/page.tsx`

Só precisa passar a prop nova pro componente já usado — `weekKpi` já existe
nessa página (usado por `<KpiWeeklyTeaser kpi={weekKpi} />` alguns blocos
abaixo). Se por algum motivo essa variável ainda não existir isolada, extrair
de `kpis.find((k) => k.period === "week")` antes do JSX.

```diff
           <div className="md:col-span-2">
-            <WeightChart entries={entries} targetWeightKg={goals.target_weight_kg} />
+            <WeightChart
+              entries={entries}
+              targetWeightKg={goals.target_weight_kg}
+              weekKpi={weekKpi ?? null}
+            />
           </div>
```

---

## 3. O que NÃO muda

- `ReferenceLine` verde (`Meta`, peso-alvo final) continua exatamente como
  está — é um conceito diferente (meta absoluta de peso) da linha nova
  (ritmo esperado da semana corrente). As duas convivem no mesmo gráfico sem
  conflito visual: uma é horizontal e verde, a outra é diagonal e cinza.
- Nenhuma mudança em `computePeriodKpi`/`analytics.ts` — só consumo do que já
  existe.
- Nenhuma mudança de schema, RLS, ou rota.
- Tema claro/escuro: `colors.axis` já é lido via `getComputedStyle` no mesmo
  `useEffect`/`MutationObserver` existente — a linha tracejada troca de cor
  sozinha ao alternar `data-theme`, sem código extra.

---

## 4. Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos
- [ ] Ver renderizado num navegador real: linha tracejada aparece só quando
      há meta semanal e pesagem de baseline confiável (mesmo critério do
      `KpiWeeklyTeaser` — se `weekKpi.baselineWeightKg` ou
      `expectedWeightNowKg` forem `null`, a linha simplesmente não aparece,
      sem erro)
- [ ] Legenda "peso real / ritmo da semana" só aparece junto com a linha
- [ ] Alternar tema dark/light com o gráfico já montado — linha tracejada
      muda de cor junto com o grid/eixos (mesmo `MutationObserver`)
- [ ] Usuário sem meta semanal definida (`goals.meta_semana_kg` zerada ou
      ausente) — gráfico continua funcionando normalmente, só sem a linha
- [ ] Usuário com pesagens só fora da semana atual (ex.: não pesa há 10 dias)
      — linha não aparece (não há ponto dentro do intervalo pra ancorar)
- [ ] Conferir visualmente que a linha tracejada não fica "escondida" atrás
      do gradiente de preenchimento da área de peso real

## Depois de validar em produção

Adicionar uma entrada em `CLAUDE.md` (mesmo padrão das outras, ex. "Dashboard
— teaser de KPI acima da dobra") documentando: patch aplicado, motivado por
pedido direto (linha de tendência semanal, espelhando `TrajectoryGraphic` da
landing), e que a reta é interpolação linear entre `baselineWeightKg` e
`expectedWeightNowKg` de `computePeriodKpi("week")` — sem cálculo novo.
