# Spec — Fase 8.1.3: Página de Exportação de Dados

**Status:** v2. Auditada contra o código real via `project_knowledge_search`
(`Sidebar.tsx`, `entries/page.tsx`, `ReportsClient.tsx`, `ExportButtons.tsx`,
`PlanGate.tsx`, `loadUserData.ts`, `types/database.ts`, rotas
`api/export/csv`, `api/export/pdf`, `api/export/report-pdf`). Todas as
pendências da v1 (Apêndice A) fechadas — achados incorporados nas seções
de diff. Pronta para handoff ao Claude Code.

Terceira e última sub-fase da Fase 8.1 (itens `comingSoon` da Sidebar
ganhando página própria): previsão da meta (8.1.1, implementada) →
conquistas (8.1.2, implementada) → **exportação de dados (8.1.3)**.

## Contexto

Hoje "Exportar Dados" é `comingSoon: true` na Sidebar. As exportações que
já existem em produção estão espalhadas em duas telas:

1. `dashboard/entries/page.tsx` — `ExportButtons.tsx` (CSV genérico +
   PDF genérico via `/api/export/csv` e `/api/export/pdf`), visível só
   pra Pro (free vê link "Exportar (Pro)" pra `/dashboard/upgrade`).
2. `dashboard/reports/ReportsClient.tsx` — botão "Salvar em PDF" que
   baixa o PDF do relatório (`/api/export/report-pdf?period=&goalId=`)
   da meta/período selecionados na tela.

Decisões de escopo fechadas com o usuário antes deste spec:

1. **A nova página `/dashboard/export` centraliza as três exportações**
   (CSV genérico, PDF genérico, PDF de relatório) — não é só uma tela
   de atalhos, é o único lugar daqui pra frente.
2. **PDF de relatório ganha seletor de período próprio na página**
   (semana/mês/trimestre/semestre — mesmos 4 valores de `ReportsClient`),
   pra não depender de vir de `/dashboard/reports` com estado na URL.
3. **Os botões antigos são removidos** — `ExportButtons` sai de
   `entries/page.tsx`, e o botão "Salvar em PDF" sai de `ReportsClient.tsx`.
4. **Texto informativo sem tabela nova** — contagem de pesagens e período
   coberto (primeira → última pesagem), calculado a partir de `entries`
   já carregado por `loadUserData()`, sem nova query.

## Decisões fechadas (não reabrir sem motivo)

1. **Padrão de página: Server Component + wrapper Client**, mesmo padrão
   de `dashboard/achievements/page.tsx` (8.1.2) e `dashboard/prediction/
   page.tsx` (8.1.1): `loadUserData()` + `getTheme()` + `Sidebar` +
   `PlanGate featureName="Exportar Dados"` envolvendo todo o conteúdo +
   wrapper `<div className="flex flex-col sm:flex-row min-h-screen">`.
   Nenhuma escrita em nenhuma tabela — página é 100% leitura/links.
2. **Seletor de meta para o PDF de relatório: reaproveita o padrão de
   `ReportsClient.tsx`, não o componente em si.** `ReportsClient.tsx` é
   acoplado a `KpiCard`/`WeightChart`/`GoalPredictions`, que não fazem
   sentido numa tela só de exportação. O seletor de meta + período vive
   em um Client Component novo e menor, só com os `<a href>` de download.
3. **`ExportButtons.tsx` é absorvido pela página nova, não reaproveitado
   como está.** Hoje ele é Server Component sem lógica de plano (quem
   decide se aparece é o caller). Na página nova, CSV e PDF genérico
   ficam como dois `<a href>` simples direto no JSX da página (Server
   Component) — não vale a pena manter um componente à parte para 2
   links estáticos que só existem num lugar agora.
4. **Gate é só na página — nenhuma rota de API muda.** `/api/export/csv`,
   `/api/export/pdf` e `/api/export/report-pdf` já retornam 403 pra
   quem não é Pro (Fase 7). `PlanGate` na página cobre a UI; a proteção
   real de dado continua nas 3 rotas, sem alteração.
5. **Remoção dos botões antigos é só de UI — nenhuma rota é removida.**
   `ExportButtons.tsx` deixa de ser importado por `entries/page.tsx` mas
   o arquivo do componente permanece (pode ser limpo depois se nenhum
   outro caller aparecer — mesmo critério cauteloso já usado pro
   `NavBar.tsx` na Fase 8 original). O botão "Salvar em PDF" sai do JSX
   de `ReportsClient.tsx`, sem mudar as props que o componente recebe de
   `reports/page.tsx` (o `goal`/`selectedPeriod` que alimentavam o botão
   continuam existindo pra o `KpiCard`).
6. **Texto informativo: contagem de pesagens + intervalo de datas.**
   Calculado inline na página (Server Component) a partir de `entries`
   (`entries.length`, `entries[0].measured_at`, `entries[entries.length -
   1].measured_at` — `entries` já vem ordenado ascendente por
   `measured_at` de `loadUserData()`, confirmado no código real). Sem
   nova query, sem novo arquivo em `analytics.ts`. Formatação de data via
   `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`,
   mesma regra do projeto (nunca `.toISOString()`).
7. **0 pesagens: página abre normalmente, mas os cards de export ficam
   avisando que não há dados.** Em vez de esconder os links (o que
   deixaria a tela vazia pra quem acabou de assinar Pro sem nunca ter
   registrado nada), os 3 cards mostram texto "Nenhuma pesagem registrada
   ainda." no lugar da contagem, e os links continuam clicáveis — as
   rotas de API já tratam o caso de 0 entradas graciosamente (CSV só com
   cabeçalho, PDF com mensagem "Nenhuma pesagem registrada ainda.",
   confirmado no spec da Fase 1). Consistente com o padrão do projeto de
   nunca bloquear uma ação que a API já trata sem erro.
8. **`comingSoon: true` sai do item "Exportar Dados" em `Sidebar.tsx`**
   — é o próprio objetivo desta sub-fase, mesmo padrão de 8.1.1 e 8.1.2.

## Fora de escopo

- Qualquer exportação nova além das 3 já existentes (ex: exportar fotos,
  exportar medidas isoladamente) — mencionado como possível iteração
  futura, não faz parte deste spec.
- Histórico de exportações (quando foi a última vez que o usuário
  exportou) — não existe hoje, não será criado.
- Mudar o formato/conteúdo de qualquer um dos 3 PDFs ou do CSV — os
  arquivos gerados continuam byte-a-byte iguais ao que já é gerado hoje;
  a única mudança é de onde os links partem.
- Mudar as políticas de gate das rotas de API (já corretas desde a
  Fase 7).
- Remover o arquivo `ExportButtons.tsx` do repositório (mantido por
  cautela, ver decisão 5).

## Migração SQL

Nenhuma — leitura pura sobre dados já existentes (`entries`, `activeGoals`
já carregados por `loadUserData()`).

## Mudanças de tipos

Nenhuma.

---

## 1. Arquivo novo: `src/app/(app)/dashboard/export/page.tsx`

Server Component. Mesmo padrão de `dashboard/achievements/page.tsx`.

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import ReportExportCard from "@/components/export/ReportExportCard";

export const dynamic = "force-dynamic";

function formatDateBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(iso)
  );
}

export default async function ExportPage() {
  const { profile, entries, activeGoals } = await loadUserData();
  const theme = await getTheme();

  const hasEntries = entries.length > 0;
  const rangeText = hasEntries
    ? `${entries.length} pesagem${entries.length > 1 ? "ns" : ""} registrada${
        entries.length > 1 ? "s" : ""
      }, de ${formatDateBR(entries[0].measured_at)} a ${formatDateBR(
        entries[entries.length - 1].measured_at
      )}.`
    : "Nenhuma pesagem registrada ainda.";

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        theme={theme}
        plan={profile.plan}
        activeGoals={activeGoals}
      />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Exportar Dados">
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
                  Exportar Dados
                </p>
                <p className="text-sm text-ink-muted">{rangeText}</p>
              </div>

              {/* Card 1 — CSV genérico */}
              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm">Planilha (CSV)</p>
                  <p className="text-xs text-ink-muted mt-1">
                    Todas as pesagens registradas, em formato compatível com
                    Excel e Google Sheets.
                  </p>
                </div>
                <a
                  href="/api/export/csv"
                  className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                >
                  Baixar CSV
                </a>
              </div>

              {/* Card 2 — PDF genérico */}
              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm">Relatório completo (PDF)</p>
                  <p className="text-xs text-ink-muted mt-1">
                    Resumo de todas as metas ativas com os 4 KPIs de cada uma
                    e o histórico completo de pesagens.
                  </p>
                </div>
                <a
                  href="/api/export/pdf"
                  className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                >
                  Baixar PDF
                </a>
              </div>

              {/* Card 3 — PDF de relatório por período/meta */}
              <ReportExportCard goals={activeGoals} />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
```

**Notas de conformidade com o código real:**

- `loadUserData()` retorna `entries` já ordenado ascendente por
  `measured_at` (`order("measured_at", { ascending: true })`, confirmado
  em `loadUserData.ts`) — `entries[0]` é a mais antiga, `entries[entries
  .length - 1]` é a mais recente. Sem necessidade de reordenar.
- `PlanGate` espera `plan: "free" | "pro"` (não aceita `undefined`) —
  `profile.plan` já é tipado assim em todos os outros callers
  (`achievements/page.tsx`, `challenges/page.tsx`, etc.), sem cast
  necessário.
- Wrapper `flex flex-col sm:flex-row min-h-screen` — confirmado como
  padrão atual (pós hotfix 3) em `entries/page.tsx` e `achievements/
  page.tsx`, substitui o `flex min-h-screen` da v4 original do spec da
  Sidebar.

---

## 2. Arquivo novo: `src/components/export/ReportExportCard.tsx`

Client Component — único motivo do `"use client"` é o estado dos dois
seletores (meta e período), mesmo padrão de `ReportsClient.tsx`.

```tsx
"use client";

import { useState } from "react";
import { METRIC_LABEL } from "@/lib/analytics";
import type { Goal } from "@/types/database";

type Period = "week" | "month" | "quarter" | "semester";

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "semester", label: "Semestre" },
];

export default function ReportExportCard({ goals }: { goals: Goal[] }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goals[0]?.id ?? null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("week");

  if (goals.length === 0) {
    return (
      <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
        <p className="font-display font-bold text-sm">Relatório por período (PDF)</p>
        <p className="text-xs text-ink-muted mt-1">
          Nenhuma meta ativa — configure uma em Metas para gerar este PDF.
        </p>
      </div>
    );
  }

  const goal = goals.find((g) => g.id === selectedGoalId) ?? goals[0];

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 space-y-3">
      <div>
        <p className="font-display font-bold text-sm">Relatório por período (PDF)</p>
        <p className="text-xs text-ink-muted mt-1">
          KPI e gráfico de uma meta específica, no período escolhido — o
          mesmo PDF disponível na tela de Relatórios.
        </p>
      </div>

      {goals.length > 1 && (
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit flex-wrap">
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGoalId(g.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                g.id === goal.id ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {METRIC_LABEL[g.metric]}
              {g.label ? ` — ${g.label}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelectedPeriod(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedPeriod === t.value
                  ? "bg-accent text-base-bg"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <a
          href={`/api/export/report-pdf?period=${selectedPeriod}&goalId=${goal.id}`}
          className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
        >
          Baixar PDF
        </a>
      </div>
    </div>
  );
}
```

**Notas de conformidade com o código real:**

- `METRIC_LABEL` importado de `@/lib/analytics` — confirmado, mesmo uso
  de `ReportsClient.tsx`.
- Query string `?period=&goalId=` — confirmado formato exato usado hoje
  em `ReportsClient.tsx` (`/api/export/report-pdf?period=${selectedPeriod}
  &goalId=${goal.id}`).
- `goals` aqui é `activeGoals` vindo de `loadUserData()` na página — todas
  as metas ativas, não só as de peso (mesma fonte de dados de
  `ReportsClient`/`GoalTabs`).

---

## 3. Patch: `src/app/(app)/dashboard/entries/page.tsx`

Remove `ExportButtons` e o link condicional de upgrade — a exportação
agora vive só em `/dashboard/export`. Mantém o link de "Importar CSV",
que é uma ação diferente (entrada de dados, não exportação) e não faz
parte do escopo desta spec.

Dois `str_replace` neste arquivo:

### 3.1 Remover imports órfãos

**[Auditoria #A1]** — `Link` (de `next/link`) e `ExportButtons` ficam sem
uso após a remoção do trecho de exportação. Ambos devem ser removidos.

```
OLD:
import ExportButtons from "@/components/entries/ExportButtons";
import Link from "next/link";

NEW:
(vazio — remover as duas linhas inteiras)
```

### 3.2 Simplificar o bloco de barra (Histórico + botões)

```
OLD:
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
            <div className="flex items-center gap-2">
              <a
                href="/dashboard/import"
                className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
              >
                Importar CSV
              </a>
              {entries.length > 0 &&
                (profile.plan === "pro" ? (
                  <ExportButtons />
                ) : (
                  <Link
                    href="/dashboard/upgrade"
                    className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                  >
                    Exportar (Pro)
                  </Link>
                ))}
            </div>
          </div>

NEW:
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
            <a
              href="/dashboard/import"
              className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
            >
              Importar CSV
            </a>
          </div>
```

`activeGoals` continua desestruturado de `loadUserData()` (usado pela
`Sidebar`) — sem mudança nessa linha. `profile` continua desestruturado
(usado pela `Sidebar` e `WeightEntryForm`) — sem mudança.

---

## 4. Patch: `src/app/(app)/dashboard/reports/ReportsClient.tsx`

Remove só o botão "Salvar em PDF" — as tabs de período e o `goal`
selecionado continuam existindo, pois alimentam o `KpiCard` normalmente.

Um `str_replace`:

**[Auditoria #A2]** — Após remoção do `<a href>`, `goal.id` continua
usado em `kpisByGoal[goal.id]`, `predictionsByGoal[goal.id]` e
`METRIC_UNIT[goal.metric]`. Nenhuma variável fica órfã. Nenhum import fica
sem uso (checado: `Goal` continua usado na tipagem de `goals: Goal[]`;
`METRIC_LABEL` continua usado no seletor de metas).

```
OLD:
      {/* Tabs de período + botão de exportação do período/meta selecionados */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelectedPeriod(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedPeriod === t.value
                  ? "bg-accent text-base-bg"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Link, não fetch — mesmo padrão de ExportButtons.tsx (o navegador
            trata a resposta application/pdf como download). ?period/?goalId
            refletem a seleção atual no momento do clique. */}
        <a
          href={`/api/export/report-pdf?period=${selectedPeriod}&goalId=${goal.id}`}
          className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
        >
          Salvar em PDF
        </a>
      </div>

NEW:
      {/* Tabs de período — exportação em PDF centralizada em
          /dashboard/export (Fase 8.1.3). */}
      <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
        {PERIOD_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setSelectedPeriod(t.value)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              selectedPeriod === t.value
                ? "bg-accent text-base-bg"
                : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
```

Nenhuma prop do componente muda — `goal.id` continua usado logo abaixo
(no `KpiCard`/`WeightChart`), só o `<a href>` de download é removido.

**Decisão fechada com o usuário:** remoção sem substituto — nenhum link
apontando pra `/dashboard/export` fica no lugar do botão removido. A
tela de Relatórios volta a ser só sobre visualização (KPI + gráfico);
descoberta da exportação passa a ser exclusivamente via Sidebar →
"Exportar Dados".

---

## 5. Patch: `src/components/Sidebar.tsx`

Remove `comingSoon: true` do item "Exportar Dados" — único campo que
muda no array `links`.

```diff
-  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true, comingSoon: true },
+  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true },
```

Nenhuma outra linha do array muda.

---

## Ordem de execução

1. Criar `src/components/export/ReportExportCard.tsx` (seção 2).
2. Criar `src/app/(app)/dashboard/export/page.tsx` (seção 1).
3. Aplicar patch em `entries/page.tsx` (seção 3).
4. Aplicar patch em `reports/ReportsClient.tsx` (seção 4).
5. Aplicar patch em `Sidebar.tsx` (seção 5).
6. `npx tsc --noEmit` e `npm run build`.
7. Deploy.

## Checklist de validação

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Sidebar: item "Exportar Dados" navega normalmente (não é mais
      `<span>` desabilitado); badge "Pro" continua aparecendo pra free,
      some pra pro (hotfix 4, sem mudança de comportamento).
- [ ] `/dashboard/export` free: `PlanGate` bloqueia com "Exportar Dados é
      Pro", nenhum dos 3 cards nem a contagem de pesagens aparece.
- [ ] `/dashboard/export` pro, com pesagens: texto "N pesagens
      registradas, de DD/MM/AAAA a DD/MM/AAAA." correto (singular
      "1 pesagem registrada" com N=1).
- [ ] `/dashboard/export` pro, sem pesagens: texto "Nenhuma pesagem
      registrada ainda."; os 3 cards continuam com os links clicáveis.
- [ ] Card 1 (CSV) baixa `/api/export/csv` — arquivo idêntico ao gerado
      antes da mudança (mesma rota, sem alteração).
- [ ] Card 2 (PDF genérico) baixa `/api/export/pdf` — arquivo idêntico.
- [ ] Card 3 (PDF de relatório): com 1 meta ativa, sem seletor de meta
      visível; com 2+ metas, seletor aparece e `goalId` no link muda
      corretamente ao trocar de aba. Trocar de período muda o `period`
      no link sem reload.
- [ ] Card 3 sem nenhuma meta ativa: mensagem "Nenhuma meta ativa —
      configure uma em Metas.", sem link de download.
- [ ] `/dashboard/entries`: botões de exportação sumiram; link "Importar
      CSV" continua funcionando normalmente, sozinho na barra.
- [ ] `/dashboard/reports`: botão "Salvar em PDF" sumiu; tabs de período
      continuam funcionando e atualizando o `KpiCard` normalmente.
- [ ] Deslogado em qualquer uma das 3 rotas de API → 401 (sem mudança,
      já coberto pela Fase 7 — só confirmar que nada quebrou).
- [ ] Free tentando acessar as 3 rotas de API diretamente pela URL → 403
      (sem mudança, já coberto pela Fase 7 — só confirmar).

## Apêndice A — o que mudou da v1 pra v2

Todas as pendências do Apêndice A da v1 foram fechadas na auditoria.

## Apêndice B — achados da auditoria v2

Quatro itens verificados, todos resolvidos:

| # | O que | Onde | Achado | Ação |
|---|---|---|---|---|
| A1 | Imports órfãos em `entries/page.tsx` | Seção 3 | `import Link from "next/link"` e `import ExportButtons` ficam sem uso | Adicionado `str_replace` 3.1 removendo ambos |
| A2 | Variáveis órfãs em `ReportsClient.tsx` | Seção 4 | `goal.id` continua usado em `kpisByGoal`, `predictionsByGoal`, `METRIC_UNIT` — nenhuma variável órfã | Nenhuma correção necessária (nota adicionada) |
| A3 | Tipo de `Goal["label"]` | Seção 2 (`ReportExportCard`) | Confirmado `string \| null` em `types/database.ts`. Padrão `g.label ? ` — ${g.label}` : ""` idêntico a `ReportsClient.tsx`/`GoalTabs.tsx` | Nenhuma correção necessária |
| A4 | `comingSoon` fora do array `links` | Seção 5 | `comingSoon` lido em exatamente 2 lugares no `renderNavItem` de `Sidebar.tsx` (ternário de classes + `if` que retorna `<span>` vs `<Link>`). Nenhum outro componente lê o campo | Nenhuma correção necessária — remover do array é suficiente |

Decisão fechada com o usuário (v1, incorporada na v2): remoção do botão
"Salvar em PDF" de `ReportsClient.tsx` sem substituto (nenhum link apontando
pra `/dashboard/export` fica no lugar).
