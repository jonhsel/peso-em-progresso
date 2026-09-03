# Spec — Fase 5.4: Relatórios e Insights

**Status:** v3. Auditada contra o código real via project knowledge
(`loadUserData.ts`, `dashboard/page.tsx`, `KpiCard.tsx`, `WeightChart.tsx`,
`NavBar.tsx`, `ConfirmDialog.tsx`, `HelpModal.tsx`, `analytics.ts`,
`entries/page.tsx`, `measurements/page.tsx`, `settings/page.tsx`,
`goals/page.tsx`). Todas as pendências do Apêndice A da v2 foram fechadas.
Pronta para handoff ao Claude Code.

Quarta sub-fase da Fase 5 (Inteligência sobre os dados): previsão da meta
(5.1, implementada) → média móvel de 7 dias (5.2, implementada) → seletor
de período do gráfico (5.3, implementada) → **relatórios e insights (5.4)**
→ widget de medidas corporais (5.5, ainda não specced).

## Contexto

Do `claude_fases.md`: "Relatórios e Insights (resumos periódicos reaproveitando
`computeAllKpis`)."

Decisões de escopo fechadas com o usuário antes deste spec:

1. **Nova rota `/dashboard/reports`** — mesmo padrão de
   `/dashboard/settings`/`/dashboard/measurements`.
2. **Períodos: os 4 já existentes** — semana/mês/trimestre/semestre.
3. **Conteúdo: KpiCard + WeightChart** — sem geração de frases de insight.

## Decisões fechadas (não reabrir sem motivo)

1. **Padrão de página: Server Component + wrapper Client.** A rota `reports/
   page.tsx` é Server Component (mesmo padrão de `dashboard/page.tsx`,
   `entries/page.tsx`, `measurements/page.tsx`, `settings/page.tsx`,
   `goals/page.tsx`): chama `loadUserData()` + `getTheme()`, renderiza
   `NavBar`, e passa dados computados ao `ReportsClient` (Client Component
   — ver decisão 2). Nenhuma escrita em `profiles` ou qualquer tabela.
2. **`ReportsClient.tsx` é Client Component** (`"use client"`) apenas por
   causa do `useState` para a tab de período selecionada. Todo o fetch de
   dados acontece no Server Component pai — `ReportsClient` recebe os 4 KPIs
   já calculados como prop, sem disparar queries.
3. **Tabs de período: componente local, NÃO reaproveita `PeriodPills` do
   `WeightChart`.** `PeriodPills` (Fase 5.3) opera sobre o tipo `ChartPeriod`
   (`"week" | "month" | "3months" | "6months"`) com labels abreviadas
   (`"1s"/"1m"/"3m"/"6m"`), é componente privado interno ao `WeightChart.tsx`
   (não exportado), e tem sizing compacto (`text-[11px]`, `px-2 py-0.5`)
   otimizado pro header do gráfico. As tabs do relatório operam sobre
   `Period` (`"week" | "month" | "quarter" | "semester"`) com labels por
   extenso (`"Semana"/"Mês"/"Trimestre"/"Semestre"`), e vivem como
   componente em `ReportsClient.tsx`. Mesma paleta visual (`bg-accent
   text-base-bg` ativo, `text-ink-faint` inativo) mas sizing levemente
   maior (`text-xs`, `px-3 py-1`) — proporcional ao fato de ser um elemento
   de navegação de página, não um controle dentro de um card.
4. **`KpiCard` reaproveitado sem nenhuma alteração.** Props já existentes
   confirmadas no código real: `{ kpi: PeriodKpi; prediction?: GoalPrediction
   }`. Trimestre/semestre passam `prediction={undefined}` — o componente já
   trata esse caso (`{prediction && ...}` não renderiza nada). Nenhum novo
   import, nenhuma nova prop.
5. **`WeightChart` reaproveitado sem nenhuma alteração.** Props já existentes
   confirmadas: `{ entries: WeightEntry[]; targetWeightKg: number | null;
   weekKpi: PeriodKpi | null }`. Renderizado uma única vez na página (não
   muda com a tab de período), com suas próprias pills internas 1s/1m/3m/6m
   (Fase 5.3), independentes da tab do relatório. Os dois seletores de
   período são intencionalmente independentes.
6. **Link "Relatórios" no `NavBar.tsx`** — novo item no array `links` (que é
   `{ href: string; label: string }[]`, confirmado no código real). Todos os
   itens viram `<Link>`, "Ajuda" é o único `<button>` fora do `.map()`.
   Ordem atual do array: Visão geral → Pesagens → Medidas → Metas →
   Configurações. "Relatórios" entra entre "Metas" e "Configurações":

   ```ts
   const links = [
     { href: "/dashboard", label: "Visão geral" },
     { href: "/dashboard/entries", label: "Pesagens" },
     { href: "/dashboard/measurements", label: "Medidas" },
     { href: "/dashboard/goals", label: "Metas" },
     { href: "/dashboard/reports", label: "Relatórios" },
     { href: "/dashboard/settings", label: "Configurações" },
   ];
   ```

   Isso leva o array a 6 itens (+ "Ajuda" como `<button>` fora do `.map()`).
   Mobile: `overflow-x-auto` + `whitespace-nowrap` no `<nav
   className="sm:hidden ...">` já comportam N itens sem quebrar — a Fase 3
   adicionou o 5º item, a Fase 4.4 adicionou "Ajuda" como 6º elemento
   visual (embora fora do array), e isso será o 7º elemento visual. Pode
   ficar apertado em telas < 360px, mas o scroll horizontal genérico cobre
   — incluir no checklist de teste.
7. **Título da página: "Relatórios".** Sem "e Insights" — a parte de insight
   textual gerado fica como iteração futura, fora deste spec. O rótulo no
   `NavBar` é o mesmo: "Relatórios".
8. **Sem exportação PDF nova.** A rota `api/export/pdf/route.tsx` já exporta
   os 4 KPIs; este relatório é uma visualização interativa complementar.

## Migração SQL

Nenhuma — leitura pura sobre dados já existentes.

## Mudanças de tipos

Nenhuma — não há novo dado persistido nem novo shape de dado.

## Diffs função a função

### 1. Arquivo novo: `src/app/(app)/dashboard/reports/page.tsx`

Server Component. Mesmo padrão de `dashboard/page.tsx` (desestruturação de
`loadUserData()`, `getTheme()`, `NavBar`, cálculos via `analytics.ts`).

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const { profile, entries, goals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  const kpis = computeAllKpis(
    entries,
    goalsHistory,
    new Date(),
    profile.period_mode,
    profile.week_starts_on
  );
  const trend = computeTrend(entries);
  const weekKpi = kpis.find((k) => k.period === "week")!;
  const monthKpi = kpis.find((k) => k.period === "month")!;
  const weekPrediction = computeGoalPrediction(trend, weekKpi, goals.target_weight_kg);
  const monthPrediction = computeGoalPrediction(trend, monthKpi, goals.target_weight_kg);

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Relatórios</p>
        <ReportsClient
          kpis={kpis}
          weekPrediction={weekPrediction}
          monthPrediction={monthPrediction}
          entries={entries}
          targetWeightKg={goals.target_weight_kg}
          weekKpi={weekKpi ?? null}
        />
      </main>
    </div>
  );
}
```

**Notas de conformidade com o código real:**

- `loadUserData()` retorna `{ user, profile, entries, measurements,
  goalsHistory, goals, achievements }` — confirmado. `user` e `measurements`
  e `achievements` não são usados nesta página (não desestruturados).
- `goals.target_weight_kg` é o campo correto (vem da tabela `goals`,
  confirmado).
- `computeAllKpis` recebe `(entries, goalsHistory, now, mode, weekStartsOn)`
  — confirmado, mesma chamada que `dashboard/page.tsx` faz.
- `computeGoalPrediction` recebe `(trend, kpi, targetWeightKg)` — confirmado,
  mesma chamada que `dashboard/page.tsx` faz.
- `NavBar` recebe `{ displayName, theme }` — confirmado contra todos os
  callers existentes (`entries/page.tsx`, `measurements/page.tsx`,
  `settings/page.tsx`, `goals/page.tsx`, `dashboard/page.tsx`).

### 2. Arquivo novo: `src/app/(app)/dashboard/reports/ReportsClient.tsx`

Client Component. Único motivo para `"use client"`: estado da tab.

```tsx
"use client";

import { useState } from "react";
import type { PeriodKpi, GoalPrediction } from "@/lib/analytics";
import type { WeightEntry } from "@/types/database";
import KpiCard from "@/components/KpiCard";
import WeightChart from "@/components/WeightChart";

type Period = PeriodKpi["period"];

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "semester", label: "Semestre" },
];

export default function ReportsClient({
  kpis,
  weekPrediction,
  monthPrediction,
  entries,
  targetWeightKg,
  weekKpi,
}: {
  kpis: PeriodKpi[];
  weekPrediction: GoalPrediction;
  monthPrediction: GoalPrediction;
  entries: WeightEntry[];
  targetWeightKg: number | null;
  weekKpi: PeriodKpi | null;
}) {
  const [selected, setSelected] = useState<Period>("week");
  const kpi = kpis.find((k) => k.period === selected)!;
  const prediction =
    selected === "week"
      ? weekPrediction
      : selected === "month"
      ? monthPrediction
      : undefined;

  return (
    <div className="space-y-6">
      {/* Tabs de período */}
      <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
        {PERIOD_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setSelected(t.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              selected === t.value
                ? "bg-accent text-base-bg"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI do período selecionado */}
      <KpiCard kpi={kpi} prediction={prediction} />

      {/* Gráfico de evolução (independente da tab, com suas próprias pills) */}
      <WeightChart
        entries={entries}
        targetWeightKg={targetWeightKg}
        weekKpi={weekKpi}
      />
    </div>
  );
}
```

**Notas de conformidade com o código real:**

- `KpiCard` importado de `@/components/KpiCard` — confirmado. Props: `{ kpi:
  PeriodKpi; prediction?: GoalPrediction }`. `prediction={undefined}` (para
  trimestre/semestre) não renderiza nada — confirmado no código real
  (`{prediction && ...}`).
- `WeightChart` importado de `@/components/WeightChart` — confirmado. Props:
  `{ entries: WeightEntry[]; targetWeightKg: number | null; weekKpi:
  PeriodKpi | null }`. Nenhuma prop nova.
- `GoalPrediction` exportado de `@/lib/analytics` — confirmado (Fase 5.1).
- `WeightEntry` importado de `@/types/database` — confirmado.
- Estilo das tabs: `bg-accent text-base-bg` ativo, `text-ink-faint
  hover:text-ink-muted` inativo, `bg-base-surface2` container, `border
  border-base-border` outline — mesmo vocabulário visual do `PeriodPills` do
  `WeightChart` (confirmado) e do `SettingsForm.tsx` (botões segmentados de
  `period_mode`/`week_starts_on`). Sizing `text-xs px-3 py-1` é levemente
  maior que `PeriodPills` (`text-[11px] px-2 py-0.5`), intencional para
  tabs de página vs. controle de card.

### 3. `src/components/NavBar.tsx` — patch

Única mudança: novo item no array `links`.

```diff
 const links = [
   { href: "/dashboard", label: "Visão geral" },
   { href: "/dashboard/entries", label: "Pesagens" },
   { href: "/dashboard/measurements", label: "Medidas" },
   { href: "/dashboard/goals", label: "Metas" },
+  { href: "/dashboard/reports", label: "Relatórios" },
   { href: "/dashboard/settings", label: "Configurações" },
 ];
```

Nenhuma outra mudança no `NavBar.tsx`. O `<button>` "Ajuda" fica fora do
`.map()` (desktop e mobile), inalterado. O `<nav className="sm:hidden ...
overflow-x-auto">` continua funcionando com N itens — scroll horizontal
genérico.

**Contexto expandido para `str_replace`** (verbatim do código real):

```
OLD:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/settings", label: "Configurações" },
];

NEW:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/settings", label: "Configurações" },
];
```

## Fora de escopo

- Geração de texto de insight automático (iteração futura).
- Qualquer mudança em `analytics.ts`, `WeightChart.tsx`, ou `KpiCard.tsx`.
- Exportação PDF nova ou mudança em `api/export/pdf/route.tsx`.
- Unificar o seletor de período do relatório com as pills do `WeightChart`.
- Widget de medidas corporais (5.5, spec separado).
- Migração SQL / mudança em `database.ts`.

## Checklist de teste

- [ ] Antes de codar: reler `NavBar.tsx`, `KpiCard.tsx`, `WeightChart.tsx`
      reais para confirmar que nada mudou out-of-band desde esta auditoria.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Link "Relatórios" aparece no `NavBar` (desktop e mobile), entre "Metas"
      e "Configurações", sem quebrar layout — mobile com 7 elementos visuais
      (6 links + "Ajuda"), overflow horizontal funcionando.
- [ ] Rota `/dashboard/reports` carrega com tab "Semana" selecionada por
      padrão.
- [ ] Trocar de tab atualiza o `KpiCard` instantaneamente, sem reload/nova
      query.
- [ ] Tab "Semana" mostra previsão (quando aplicável, mesmas regras da
      Fase 5.1); tab "Mês" idem; "Trimestre"/"Semestre" nunca mostram
      previsão.
- [ ] Gráfico de evolução aparece abaixo, com suas próprias pills 1s/1m/3m/6m
      funcionando independente da tab do relatório.
- [ ] Conta nova (sem pesagens suficientes): `KpiCard` mostra o mesmo estado
      de "sem dados" que já mostra no dashboard; gráfico mostra a mesma
      mensagem de sempre (Fase 5.3, Caso A — sem pills).
- [ ] Tema claro/escuro: contraste da tab ativa (`bg-accent text-base-bg`) e
      inativa (`text-ink-faint`) consistente com o resto do app; `KpiCard`
      usa `--badge-*-text` (não `signal-*` bruto) para contraste em light.
- [ ] Nenhuma escrita no banco ao trocar de tab ou carregar a página (conferir
      Network/Supabase logs).
- [ ] Mobile: tabs de período + `KpiCard` + `WeightChart` empilham sem
      overflow horizontal. Tabs com labels por extenso ("Semana"/"Mês"/
      "Trimestre"/"Semestre") cabem em telas >= 360px — se apertarem,
      considerar abreviar ("Sem"/"Mês"/"Tri"/"Sem6"), mas testar antes.

## Passos de execução (ordem)

1. Reler `NavBar.tsx`, `KpiCard.tsx`, `WeightChart.tsx` reais para confirmar
   que nada mudou out-of-band.
2. Criar `src/app/(app)/dashboard/reports/page.tsx`.
3. Criar `src/app/(app)/dashboard/reports/ReportsClient.tsx`.
4. Aplicar patch no array `links` de `NavBar.tsx`.
5. `npx tsc --noEmit` e `npm run build`.
6. Rodar checklist de teste manual.
7. Atualizar `CLAUDE.md` (nova seção "Fase 5.4 — Relatórios e Insights") e
   marcar o item em `claude_fases.md`.

---

## Apêndice A — Correções da auditoria v2 → v3

### A1. Tabs: componente local, não `PeriodPills`

**v2 dizia:** "Pendente de confirmação — reaproveitar `PeriodPills` do
`WeightChart.tsx` ou criar um novo."
**Código real:** `PeriodPills` é componente privado (não exportado) dentro de
`WeightChart.tsx`, opera sobre `ChartPeriod` (`"week" | "month" | "3months" |
"6months"`) com labels `"1s"/"1m"/"3m"/"6m"` e sizing `text-[11px] px-2
py-0.5`. Não é reutilizável para os períodos do relatório (`"week" | "month"
| "quarter" | "semester"` com labels por extenso).
**Correção:** tabs definidas como array + `.map()` local em
`ReportsClient.tsx`, com mesma paleta visual mas sizing levemente maior
(`text-xs px-3 py-1`). Não vale exportar `PeriodPills` nem criar componente
compartilhado — os dois seletores operam sobre tipos e labels diferentes.

### A2. Ordem do `links` no `NavBar.tsx` — confirmada

**v2 dizia:** "Pendente de confirmação — ordem exata do array."
**Código real:** `[Visão geral, Pesagens, Medidas, Metas, Configurações]`,
5 itens. "Ajuda" é `<button>` avulso fora do `.map()`, renderizado tanto
no desktop `<nav>` quanto no mobile `<nav>` separadamente.
**Correção:** "Relatórios" entra entre "Metas" e "Configurações" (posição 4,
0-indexed). Agora 6 itens no array + "Ajuda" fora = 7 elementos visuais em
mobile. `overflow-x-auto` cobre.

### A3. Título: "Relatórios" sem "e Insights"

**v2 dizia:** "Pendente — 'Relatórios' ou 'Relatórios e Insights'."
**Correção:** "Relatórios". A parte de insight textual gerado não está neste
spec.

### A4. Shape de `loadUserData()` — confirmado

**v2 dizia:** "Pendente — nomes dos campos."
**Código real:** retorna `{ user, profile, entries, measurements,
goalsHistory, goals, achievements }`. `goals` é `Goals` (tabela `goals`,
com `target_weight_kg`), `goalsHistory` é `GoalsHistoryEntry[]` (tabela
`goals_history`). `dashboard/page.tsx` usa `goals.target_weight_kg`
diretamente para `computeGoalPrediction`.
**Correção v2 → v3:** o v2 acessava `goals.target_weight_kg` via objeto
`predictions` montado no server. O v3 passa `weekPrediction` e
`monthPrediction` como props separadas (mais explícito, sem criar um shape
intermediário), e `goals.target_weight_kg` diretamente como
`targetWeightKg` para o `WeightChart`.

### A5. `KpiCard` — `prediction` é prop opcional, confirmado

**v2 dizia:** "Pendente — confirmar que `prediction` é prop opcional."
**Código real:** `export default function KpiCard({ kpi, prediction }: {
kpi: PeriodKpi; prediction?: GoalPrediction })` — confirmado. Quando
`prediction` é `undefined`, o bloco `{prediction && ...}` não renderiza
nada. Nenhuma mudança necessária.

### A6. Layout da página: consistência com `dashboard/page.tsx`

**Achado novo (não estava na v2):** `dashboard/page.tsx` usa `<main
className="max-w-6xl mx-auto px-4 py-8 space-y-6">`. As outras páginas
(`entries`, `measurements`) usam `grid grid-cols-1 md:grid-cols-2 gap-6`.
`settings/page.tsx` usa `max-w-2xl mx-auto px-4 py-8` (coluna estreita).
A página de relatórios deve usar `max-w-6xl mx-auto px-4 py-8 space-y-6`
(mesmo que o dashboard), já que contém `KpiCard` + `WeightChart` empilhados,
mesmos componentes do dashboard.

### A7. `TrendBadge` — não incluído

**Achado novo:** `dashboard/page.tsx` renderiza `TrendBadge` ao lado do
`WeightChart` num grid `md:grid-cols-3` (gráfico em `md:col-span-2`, badge
em 1 coluna). Na página de relatórios, o gráfico aparece full-width (sem
`TrendBadge` ao lado) para simplificar — a tendência já está implícita na
previsão do `KpiCard`. Se no futuro quisermos o badge, é patch trivial.
