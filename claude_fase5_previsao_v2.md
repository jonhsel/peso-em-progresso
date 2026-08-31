# Fase 5.1 — Previsão da meta (v2, auditado)

**Status:** v2 — auditado contra `src/lib/analytics.ts`, `src/components/KpiCard.tsx`,
`src/app/(app)/dashboard/page.tsx`, `src/lib/loadUserData.ts`,
`src/app/api/export/pdf/route.tsx` e `src/types/database.ts` reais (via
`project_knowledge_search`). Pronto para handoff ao Claude Code.

---

## Contexto

Primeira sub-fase da Fase 5 (Inteligência sobre os dados). Adiciona uma
previsão de data estimada aos cards de KPI de **semana** e **mês**, reaproveitando
a regressão de 21 dias de `computeTrend`. É uma camada de leitura adicional —
não mexe em nenhuma função existente, não cria tabela/coluna, não toca em
`computePeriodKpi`/`computeAllKpis`/`baselineWeight`.

## Decisões fechadas

1. **Escopo dos cards:** só **semana** e **mês** ganham a previsão. Trimestre e
   semestre ficam de fora.
2. **Base de cálculo:** reaproveita `computeTrend(entries)` (regressão linear
   sobre os últimos 21 dias). Campo relevante: `slopeKgPerWeek` (tipo `number`).
3. **Dois modos, mutuamente exclusivos por usuário (não por card):**
   - **Com `target_weight_kg` definido:** ambos os cards mostram a mesma
     previsão — data estimada de chegada no peso alvo.
   - **Sem `target_weight_kg`:** cada card projeta a data em que a meta de perda
     daquele período (`weekly_loss_kg` / `monthly_loss_kg`) será atingida no
     ritmo atual.
4. **Casos sem previsão possível** → mensagem explicativa por caso, card
   permanece visível.
5. **Onde exibir:** linha extra dentro do `KpiCard` existente (semana/mês), não
   um card novo.
6. **Não persiste nada** — cálculo puro, sem migração.

## Apêndice A — Achados da auditoria e correções aplicadas

### A1. Nome do campo: `slopeKgPerWeek`, não `rateKgPerWeek`

**v1 dizia:** `trend.rateKgPerWeek`
**Código real:** `TrendResult.slopeKgPerWeek`

O tipo `TrendResult` exportado de `analytics.ts` é:
```ts
export type TrendResult = {
  slopeKgPerWeek: number;
  label: "perdendo_rapido" | "perdendo" | "estavel" | "ganhando" | "insufficient_data";
  description: string;
};
```

**Correção:** todos os trechos do spec agora usam `slopeKgPerWeek`.

### A2. Convenção de sinal — CRÍTICO

**v1 assumia:** positivo = perdendo peso.
**Código real:** `slopeKgPerWeek` é o slope bruto da regressão linear — **negativo
quando perdendo peso** (peso caindo ao longo do tempo → slope negativo).

Thresholds do código real:
- `<= -0.35` → `perdendo_rapido`
- `<= -0.05` → `perdendo`
- `>= 0.1`  → `ganhando`
- Fora desses → `estavel`

**Correção:** a `computeGoalPrediction` usa `Math.abs(slopeKgPerWeek)` como
taxa de perda por semana quando a label confirma que a tendência é de perda.
Jamais dividir diretamente por `slopeKgPerWeek` (negativo → resultado negativo
→ data no passado = bug silencioso).

### A3. Labels exatas do `computeTrend` — confirmadas

`"perdendo_rapido" | "perdendo" | "estavel" | "ganhando" | "insufficient_data"`

Grafia confirmada (snake_case em português, sem acentos). Para checar
"tendência é de perda", basta testar:
```ts
trend.label === "perdendo" || trend.label === "perdendo_rapido"
```

### A4. Componente de card: `src/components/KpiCard.tsx` (arquivo separado)

**v1 dizia:** "confirmar se é componente separado ou inline na page."
**Código real:** `KpiCard.tsx`, componente Server (sem `"use client"`), props:
`{ kpi: PeriodKpi }`.

**Implicação:** a prop `prediction` pode ser adicionada diretamente — sem
precisar converter pra Client Component, já que `GoalPrediction` é data
serializável (sem callbacks, sem state).

### A5. "Peso atual" — não há função utilitária, dashboard usa inline

**Código real do dashboard:**
```ts
const latest = entries[entries.length - 1] ?? null;
```
E dentro de `computePeriodKpi`:
```ts
const latest = points.length ? points[points.length - 1] : null;
const current = latest ? latest.weight : null;
```
Onde `points = toPoints(entries)` (ordena por data).

**Correção:** `computeGoalPrediction` recebe o KPI já calculado (`PeriodKpi`)
que já traz `currentWeightKg` — não precisa acessar `entries` nem `toPoints`
diretamente.

### A6. `baselineWeight` e `periodStart` — acessibilidade

- `periodStart`: **exportada** (`export function`).
- `baselineWeight`: **privada** (sem `export`).
- `periodLengthDays`: **privada**.
- `toPoints`: **privada**.

**Impacto no spec v1:** a lógica "sem target_weight_kg" precisava do baseline
do período e da perda acumulada, que o v1 planejava calcular manualmente
chamando `baselineWeight` — impossível sem export.

**Solução (v2):** redesenho da assinatura de `computeGoalPrediction` para
receber `PeriodKpi` já calculado. O `PeriodKpi` já traz:
- `actualLossKg` (= baseline - current, positivo = perdeu peso)
- `targetLossKg` (meta de perda do período)
- `currentWeightKg`
- `baselineWeightKg`

Isso elimina completamente a necessidade de acessar `baselineWeight`,
`toPoints` ou `periodStart` dentro da previsão.

### A7. Classes Tailwind do `KpiCard` — confirmadas

Textos secundários existentes no card:
- Status label: `text-sm ${style.text}` (cores semânticas via CSS vars)
- Peso esperado: `text-xs text-ink-faint`
- Meta alvo: `text-sm text-ink-faint`

A previsão usará `text-xs text-ink-faint` para manter hierarquia visual
(informação complementar, abaixo do status principal).

### A8. Dashboard já tem todos os dados necessários

```ts
// dashboard/page.tsx — já existe:
const kpis = computeAllKpis(entries, goalsHistory, new Date(), profile.period_mode, profile.week_starts_on);
const weekKpi = kpis.find((kpi) => kpi.period === "week");
const trend = computeTrend(entries);
```

E `goals` (com `target_weight_kg`) vem de `loadUserData()`. Nenhum dado novo
precisa ser carregado.

### A9. `target_weight_kg` vive em `goals`, não em `goalsHistory`

Confirmado: o peso alvo final vem sempre da meta ativa (`goals.target_weight_kg`),
sem versionamento por período. A `resolveGoalsForPeriod` só resolve os campos
`*_loss_kg`.

### A10. PDF export — fora de escopo

`src/app/api/export/pdf/route.tsx` faz suas próprias queries e renderiza via
`@react-pdf/renderer`. A previsão é UI do dashboard, não do PDF. Se no futuro
quisermos no PDF, será patch explícito nessa rota (já documentado como padrão
do projeto).

---

## Mudanças de tipos

Nenhuma mudança em `src/types/database.ts` — sem coluna nova.

Novo tipo local em `src/lib/analytics.ts`:

```ts
export type GoalPrediction =
  | { kind: "insufficient_data" }
  | { kind: "wrong_direction" }
  | { kind: "already_reached"; withTarget: boolean }
  | { kind: "projected"; estimatedDate: string; daysFromNow: number };
```

`estimatedDate` é string ISO date (`YYYY-MM-DD`), não `Date`, para ser
serializável como prop de Server Component sem conversão.

`withTarget` em `already_reached` distingue o copy da UI:
- `true` → "Meta de peso já alcançada! 🎉"
- `false` → "Meta deste período já batida."

---

## Função nova: `computeGoalPrediction`

**Localização:** `src/lib/analytics.ts`, logo após `computeAllKpis`.

**Assinatura (redesenhada na auditoria — A5/A6):**

```ts
export function computeGoalPrediction(
  trend: TrendResult,
  kpi: PeriodKpi,
  targetWeightKg: number | null,
): GoalPrediction {
```

**Parâmetros:**
- `trend` — resultado de `computeTrend(entries)`, já calculado no dashboard.
- `kpi` — resultado de `computePeriodKpi` para o período (`week`/`month`), já
  calculado no dashboard via `computeAllKpis`.
- `targetWeightKg` — vindo de `goals.target_weight_kg` (pode ser `null`).

**Lógica:**

```ts
export function computeGoalPrediction(
  trend: TrendResult,
  kpi: PeriodKpi,
  targetWeightKg: number | null,
): GoalPrediction {
  // 1. Dados insuficientes para tendência
  if (trend.label === "insufficient_data") {
    return { kind: "insufficient_data" };
  }

  // 2. Tendência não é de perda (estável ou ganhando)
  const isLosing = trend.label === "perdendo" || trend.label === "perdendo_rapido";
  if (!isLosing) {
    return { kind: "wrong_direction" };
  }

  // 3. Taxa de perda por semana (positiva, em kg)
  //    slopeKgPerWeek é NEGATIVO quando perdendo → Math.abs
  const lossPerWeek = Math.abs(trend.slopeKgPerWeek);

  // 4. Peso atual (do KPI já calculado)
  const currentWeight = kpi.currentWeightKg;
  if (currentWeight === null) {
    return { kind: "insufficient_data" };
  }

  // 5. Modo com target_weight_kg
  if (targetWeightKg !== null) {
    if (currentWeight <= targetWeightKg) {
      return { kind: "already_reached", withTarget: true };
    }
    const kgToLose = currentWeight - targetWeightKg;
    const weeksToTarget = kgToLose / lossPerWeek;
    const daysFromNow = Math.round(weeksToTarget * 7);
    const estimated = new Date();
    estimated.setDate(estimated.getDate() + daysFromNow);
    return {
      kind: "projected",
      estimatedDate: formatISODate(estimated),
      daysFromNow,
    };
  }

  // 6. Modo sem target — projetar quando a meta de perda do período será batida
  const actualLoss = kpi.actualLossKg; // positivo = perdeu peso
  const targetLoss = kpi.targetLossKg; // meta de perda do período (sempre positivo)

  if (actualLoss !== null && actualLoss >= targetLoss && targetLoss > 0) {
    return { kind: "already_reached", withTarget: false };
  }

  if (targetLoss <= 0) {
    // Sem meta de perda configurada para este período — não dá pra projetar
    return { kind: "insufficient_data" };
  }

  const remaining = targetLoss - (actualLoss ?? 0);
  if (remaining <= 0) {
    return { kind: "already_reached", withTarget: false };
  }

  const weeksToGoal = remaining / lossPerWeek;
  const daysFromNow = Math.round(weeksToGoal * 7);
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + daysFromNow);
  return {
    kind: "projected",
    estimatedDate: formatISODate(estimated),
    daysFromNow,
  };
}
```

**Helper `formatISODate`** (se não existir no arquivo — confirmar; se existir,
reaproveitar):

```ts
function formatISODate(d: Date): string {
  return formatISO(d, { representation: "date" });
}
```

`formatISO` já é importado de `date-fns` no topo de `analytics.ts` (confirmado
no código real).

---

## Mudança de UI: `src/components/KpiCard.tsx`

### Prop nova

```diff
+import type { GoalPrediction } from "@/lib/analytics";

-export default function KpiCard({ kpi }: { kpi: PeriodKpi }) {
+export default function KpiCard({
+  kpi,
+  prediction,
+}: {
+  kpi: PeriodKpi;
+  prediction?: GoalPrediction;
+}) {
```

### Renderização da previsão

Inserir **após** o bloco `{kpi.expectedWeightNowKg !== null && (...)}` e
**antes** do fechamento do `<>` fragment, dentro do ramo `hasData`:

```tsx
          {prediction && (
            <p className="text-xs text-ink-faint">
              {prediction.kind === "projected" && (
                <>
                  📈 No ritmo atual, meta em ~{prediction.daysFromNow} dias
                  {" "}
                  <span className="text-ink-muted">
                    (previsão: {prediction.estimatedDate.split("-").reverse().join("/")})
                  </span>
                </>
              )}
              {prediction.kind === "insufficient_data" && (
                <>Sem dados suficientes para projetar (mínimo 2 pesagens nos últimos 21 dias).</>
              )}
              {prediction.kind === "wrong_direction" && (
                <>No ritmo atual, a meta não será alcançada — tendência dos últimos 21 dias não é de perda.</>
              )}
              {prediction.kind === "already_reached" && prediction.withTarget && (
                <>Meta de peso já alcançada! 🎉</>
              )}
              {prediction.kind === "already_reached" && !prediction.withTarget && (
                <>Meta deste período já batida. ✅</>
              )}
            </p>
          )}
```

**Nota sobre o bloco de inserção (contexto expandido para `str_replace`):**

O trecho completo do KpiCard onde a previsão entra fica assim — o `str_replace`
deve usar o bloco `{kpi.expectedWeightNowKg !== null && ...}` existente como
âncora:

```
OLD (bloco a localizar):
          {kpi.expectedWeightNowKg !== null && (
            <p className="text-xs text-ink-faint">
              Hoje você está em <span className="text-ink-muted">{kpi.currentWeightKg?.toFixed(1)} kg</span>{" "}
              · esperado pela meta: <span className="text-ink-muted">{kpi.expectedWeightNowKg.toFixed(1)} kg</span>
            </p>
          )}
        </>

NEW (mesmo bloco + previsão antes do fechamento):
          {kpi.expectedWeightNowKg !== null && (
            <p className="text-xs text-ink-faint">
              Hoje você está em <span className="text-ink-muted">{kpi.currentWeightKg?.toFixed(1)} kg</span>{" "}
              · esperado pela meta: <span className="text-ink-muted">{kpi.expectedWeightNowKg.toFixed(1)} kg</span>
            </p>
          )}

          {prediction && (
            <p className="text-xs text-ink-faint">
              {prediction.kind === "projected" && (
                <>
                  📈 No ritmo atual, meta em ~{prediction.daysFromNow} dias
                  {" "}
                  <span className="text-ink-muted">
                    (previsão: {prediction.estimatedDate.split("-").reverse().join("/")})
                  </span>
                </>
              )}
              {prediction.kind === "insufficient_data" && (
                <>Sem dados suficientes para projetar (mínimo 2 pesagens nos últimos 21 dias).</>
              )}
              {prediction.kind === "wrong_direction" && (
                <>No ritmo atual, a meta não será alcançada — tendência dos últimos 21 dias não é de perda.</>
              )}
              {prediction.kind === "already_reached" && prediction.withTarget && (
                <>Meta de peso já alcançada! 🎉</>
              )}
              {prediction.kind === "already_reached" && !prediction.withTarget && (
                <>Meta deste período já batida. ✅</>
              )}
            </p>
          )}
        </>
```

Cards de **trimestre** e **semestre** não recebem `prediction` — a prop é
`prediction?: GoalPrediction` (opcional), então simplesmente não é passada,
e o `{prediction && ...}` não renderiza nada.

---

## Mudança no chamador: `src/app/(app)/dashboard/page.tsx`

### Import

```diff
-import { computeAllKpis, computeTrend } from "@/lib/analytics";
+import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
```

### Cálculo das previsões

Inserir logo após `const trend = computeTrend(entries);` (que já existe):

```ts
  const weekKpiObj = kpis.find((kpi) => kpi.period === "week")!;
  const monthKpiObj = kpis.find((kpi) => kpi.period === "month")!;
  const weekPrediction = computeGoalPrediction(trend, weekKpiObj, goals.target_weight_kg);
  const monthPrediction = computeGoalPrediction(trend, monthKpiObj, goals.target_weight_kg);
```

**Nota:** `weekKpi` já existe como variável (`const weekKpi = kpis.find(...)`),
usada pelo `KpiWeeklyTeaser`. Se o nome conflitar, reaproveitar a mesma variável
em vez de criar outra. Confirmar no código real se `weekKpi` já está declarada
nesse escopo — se sim, fazer:

```ts
  const monthKpi = kpis.find((kpi) => kpi.period === "month")!;
  const weekPrediction = computeGoalPrediction(trend, weekKpi!, goals.target_weight_kg);
  const monthPrediction = computeGoalPrediction(trend, monthKpi, goals.target_weight_kg);
```

### Passagem da prop para os KpiCards

O dashboard renderiza os 4 cards num grid. Localizar o bloco que faz
`kpis.map(...)` ou renderiza os `<KpiCard>` individualmente, e passar
`prediction` condicionalmente:

```tsx
{kpis.map((kpi) => (
  <KpiCard
    key={kpi.period}
    kpi={kpi}
    prediction={
      kpi.period === "week"
        ? weekPrediction
        : kpi.period === "month"
        ? monthPrediction
        : undefined
    }
  />
))}
```

Se os cards não forem renderizados via `.map()` mas individualmente, passar
a prop em cada um dos 2 cards relevantes.

---

## Fora de escopo

- Previsão nos cards de trimestre/semestre.
- Qualquer mudança em `computeTrend`, `computePeriodKpi`, `computeAllKpis`,
  `baselineWeight`, `BASELINE_MAX_DAYS_BEFORE`.
- Qualquer mudança em `period_mode`/`week_starts_on`.
- PDF export (`api/export/pdf/route.tsx`) — previsão é só UI do dashboard.
- Demais itens da Fase 5 (média móvel, seletor de período, relatórios, widget
  de medidas).
- Migração SQL / mudança em `database.ts` — nenhuma necessária.

---

## Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta com `target_weight_kg` definido + tendência de perda (`perdendo` ou
      `perdendo_rapido`): cards de semana e mês mostram a **mesma** data estimada.
- [ ] Conta sem `target_weight_kg` + tendência de perda: card de semana mostra
      previsão baseada em `weekly_loss_kg`, card de mês em `monthly_loss_kg` —
      datas **diferentes** entre si.
- [ ] Conta nova (< 2 pesagens nos últimos 21 dias): mensagem de
      `insufficient_data` nos dois cards.
- [ ] Conta ganhando peso (tendência `ganhando` ou `estavel`): mensagem de
      `wrong_direction`.
- [ ] Com target: peso atual <= `target_weight_kg` → "Meta de peso já
      alcançada! 🎉"
- [ ] Sem target: `actualLossKg >= targetLossKg` → "Meta deste período já
      batida. ✅"
- [ ] Trocar `period_mode` de `fixed` pra `rolling` em Configurações e
      conferir que a previsão sem-target recalcula (o KPI muda, a previsão
      acompanha automaticamente pois recebe o `PeriodKpi` já recalculado).
- [ ] Cards de trimestre/semestre inalterados visualmente (sem linha de
      previsão, sem prop extra).
- [ ] Tema claro/escuro: contraste de `text-xs text-ink-faint` adequado
      (mesmo padrão já usado na linha "Hoje você está em X kg").
- [ ] Mobile: linha de previsão não quebra o layout do card.
- [ ] Emoji 📈 renderiza corretamente no navegador (não depende de filtro
      CSS; é texto inline, não está sob `grayscale`).

## Passos de execução (ordem)

1. Ler `src/lib/analytics.ts` real para confirmar que `formatISO` já é
   importado (é — confirmado na auditoria, mas verificar antes de codar).
2. Adicionar tipo `GoalPrediction` e função `computeGoalPrediction` em
   `analytics.ts`.
3. Atualizar `src/components/KpiCard.tsx`: nova prop `prediction?`, bloco
   de render condicional.
4. Atualizar `src/app/(app)/dashboard/page.tsx`: import, cálculo das 2
   previsões, passagem da prop nos cards de semana/mês.
5. `npx tsc --noEmit` e `npm run build`.
6. Rodar checklist de teste manual.
7. Atualizar `CLAUDE.md` (nova seção "Fase 5.1 — Previsão da meta") e
   marcar o item em `claude_fases.md`.
