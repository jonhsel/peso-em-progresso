# Fase 3 — Período de meta: fixo vs. móvel + tela de Configurações (v2)

> v2 = v1 auditada contra o código real do projeto. Achados da auditoria no
> final (Apêndice A). Todas as correções já estão incorporadas ao corpo do
> spec — rodar direto, não aplicar a v1 e depois a v2.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md` antes
> de implementar — este documento assume as convenções já estabelecidas no
> projeto (design tokens, route group `(app)`, Server Actions, RLS, etc.).

---

## 0. Contexto e objetivo

Hoje os 4 períodos de KPI (semana/mês/trimestre/semestre) são sempre calculados
como **período civil fixo**: semana a partir de segunda-feira, mês a partir do
dia 1, trimestre e semestre a partir do início civil correspondente. Isso está
implementado na função `periodStart(period, reference)` em
`src/lib/analytics.ts`, exportada.

Esta fase dá ao usuário controle sobre **como** os períodos são medidos, sem
mudar **o que** é medido (thresholds de status, baseline, `resolveGoalsForPeriod`
continuam intocados — só a data de início de cada período muda de origem).

Dois campos novos em `profiles`:
- `period_mode`: `'fixed' | 'rolling'`, default `'fixed'`, **1 escolha global**
  que vale para os 4 períodos (não é por período).
- `week_starts_on`: `'monday' | 'sunday'`, sempre perguntada (mesmo que o modo
  seja `rolling`, onde não é usada agora, mas fica configurada de antemão —
  evita uma segunda pergunta se o usuário trocar pra `fixed` depois), usada
  apenas quando `period_mode = 'fixed'`.

Além disso, esta fase resolve duas pendências soltas do backlog (decisão
tomada nesta sessão — aproveitar a tela nova de Configurações):
- Editar `profiles.display_name` (hoje sem UI).
- Editar `profiles.height_cm` (hoje sem UI).

---

## 1. Migração SQL

Criar `supabase/migrations/0005_period_mode.sql`, idempotente, mesmo padrão
das migrations anteriores (`ADD COLUMN IF NOT EXISTS`, comentário de coluna):

```sql
-- Fase 3: período de meta fixo vs. móvel, configurável por usuário.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS period_mode text NOT NULL DEFAULT 'fixed'
    CONSTRAINT profiles_period_mode_check CHECK (period_mode IN ('fixed', 'rolling')),
  ADD COLUMN IF NOT EXISTS week_starts_on text NOT NULL DEFAULT 'monday'
    CONSTRAINT profiles_week_starts_on_check CHECK (week_starts_on IN ('monday', 'sunday'));

COMMENT ON COLUMN public.profiles.period_mode IS
  'fixed = períodos civis (semana a partir de week_starts_on, mês/trimestre/semestre civis);
   rolling = N dias corridos atrás de hoje (7/30/90/180). Escolha única, vale para os 4 períodos.';
COMMENT ON COLUMN public.profiles.week_starts_on IS
  'monday | sunday — início da semana quando period_mode = fixed. Também usado pelo
   seletor "1 semana" do gráfico de evolução (Fase 5) quando fixed.';
```

Também atualizar `supabase/schema.sql` (arquivo de referência, não executado)
adicionando as duas colunas à definição de `public.profiles`:

```sql
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  display_name text NOT NULL DEFAULT 'Usuário'::text,
  height_cm numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  onboarded_at timestamp with time zone,
  period_mode text NOT NULL DEFAULT 'fixed' CHECK (period_mode IN ('fixed', 'rolling')),
  week_starts_on text NOT NULL DEFAULT 'monday' CHECK (week_starts_on IN ('monday', 'sunday')),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
```

**Não precisa de trigger novo** — `handle_new_user` já cria a linha em
`profiles`; os `DEFAULT` das colunas cobrem contas novas. Contas existentes
recebem os defaults via `ADD COLUMN ... DEFAULT`.

---

## 2. `src/types/database.ts` — tipos novos

O arquivo real exporta os tipos como tipos nomeados separados (não Zod,
não interfaces). Adicionar os tipos auxiliares e expandir `Profile`:

```diff
+export type PeriodMode = "fixed" | "rolling";
+export type WeekStartsOn = "monday" | "sunday";
+
 export type Profile = {
   id: string;
   display_name: string;
   height_cm: number | null;
   created_at: string;
   onboarded_at: string | null;
+  period_mode: PeriodMode;
+  week_starts_on: WeekStartsOn;
 };
```

**Não criar `src/lib/types.ts`** — o projeto não tem esse arquivo; todos os
tipos de banco vivem em `src/types/database.ts`.

---

## 3. `src/lib/analytics.ts` — os dois modos

### 3.1 Assinatura de `periodStart`

A função real hoje é:

```ts
export function periodStart(period: Period, reference: Date): Date {
  switch (period) {
    case "week":
      return startOfWeek(reference, { weekStartsOn: 1 });
    case "month":
      return startOfMonth(reference);
    case "quarter":
      return startOfQuarter(reference);
    case "semester": {
      const month = reference.getMonth();
      const semesterStartMonth = month < 6 ? 0 : 6;
      return new Date(reference.getFullYear(), semesterStartMonth, 1);
    }
  }
}
```

Adicionar os dois parâmetros novos (import de `subDays` de `date-fns`):

```diff
+import { subDays } from "date-fns";
+import type { PeriodMode, WeekStartsOn } from "@/types/database";
 ...

-export function periodStart(period: Period, reference: Date): Date {
+export function periodStart(
+  period: Period,
+  reference: Date,
+  mode: PeriodMode = "fixed",
+  weekStartsOn: WeekStartsOn = "monday"
+): Date {
+  if (mode === "rolling") {
+    const rollingDays: Record<Period, number> = {
+      week: 7,
+      month: 30,
+      quarter: 90,
+      semester: 180,
+    };
+    return subDays(reference, rollingDays[period]);
+  }
+
   switch (period) {
     case "week":
-      return startOfWeek(reference, { weekStartsOn: 1 });
+      return startOfWeek(reference, { weekStartsOn: weekStartsOn === "sunday" ? 0 : 1 });
     case "month":
       return startOfMonth(reference);
     case "quarter":
       return startOfQuarter(reference);
     case "semester": {
       const month = reference.getMonth();
       const semesterStartMonth = month < 6 ? 0 : 6;
       return new Date(reference.getFullYear(), semesterStartMonth, 1);
     }
   }
 }
```

Os defaults `"fixed"` e `"monday"` garantem que callers existentes que não
passarem os novos parâmetros continuem funcionando sem erro de tipo — mas na
prática todos os callers devem ser atualizados pra propagar os valores do
profile (ver seção 7).

### 3.2 `periodLengthDays` — ajuste pro modo rolling

A função `periodLengthDays` hoje retorna valores aproximados de comprimento
civil (`30.4`, `91.3`, `182.6`). No modo `rolling`, o comprimento é exato:

```diff
-function periodLengthDays(period: Period): number {
+function periodLengthDays(period: Period, mode: PeriodMode = "fixed"): number {
+  if (mode === "rolling") {
+    const exact: Record<Period, number> = { week: 7, month: 30, quarter: 90, semester: 180 };
+    return exact[period];
+  }
   switch (period) {
     case "week":
       return 7;
     case "month":
       return 30.4;
     case "quarter":
       return 91.3;
     case "semester":
       return 182.6;
   }
 }
```

### 3.3 `computePeriodKpi` e `computeAllKpis` — propagar os parâmetros

```diff
 export function computePeriodKpi(
   entries: WeightEntry[],
   goalsHistory: GoalsHistoryEntry[],
   period: Period,
-  now: Date = new Date()
+  now: Date = new Date(),
+  mode: PeriodMode = "fixed",
+  weekStartsOn: WeekStartsOn = "monday"
 ): PeriodKpi {
   const points = toPoints(entries);
-  const start = periodStart(period, now);
+  const start = periodStart(period, now, mode, weekStartsOn);
   const activeGoals = resolveGoalsForPeriod(goalsHistory, start);
   const targetLossKg = Number(activeGoals?.[GOAL_FIELD[period]] ?? 0);

   const baseline = baselineWeight(points, start, period);
   ...
-  const lengthDays = periodLengthDays(period);
+  const lengthDays = periodLengthDays(period, mode);
   ...
```

```diff
 export function computeAllKpis(
   entries: WeightEntry[],
   goalsHistory: GoalsHistoryEntry[],
-  now: Date = new Date()
+  now: Date = new Date(),
+  mode: PeriodMode = "fixed",
+  weekStartsOn: WeekStartsOn = "monday"
 ): PeriodKpi[] {
   return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
-    computePeriodKpi(entries, goalsHistory, p, now)
+    computePeriodKpi(entries, goalsHistory, p, now, mode, weekStartsOn)
   );
 }
```

### 3.4 O que NÃO muda

- `baselineWeight` e `BASELINE_MAX_DAYS_BEFORE` — continuam recebendo a data
  de início do período (agora vinda de um dos dois modos) e aplicando o mesmo
  horizonte de frescor já existente, sem alteração de lógica interna.
- Thresholds de status (`ahead/on_pace/caution/behind`) — intocados.
- `resolveGoalsForPeriod` — continua resolvendo a meta vigente pelo
  `created_at <= início do período`; só a origem do "início do período" muda.
- `computeTrend` (janela fixa de 21 dias) — não tem relação com `period_mode`.
- **Tipo `GoalFieldKey` e `GOAL_FIELD`** — sem alteração (já corretos desde a
  Fase 2.3).

---

## 4. `src/lib/loadUserData.ts`

A query de profiles hoje é `supabase.from("profiles").select("*")`, que
automaticamente inclui as colunas novas sem precisar de mudança na query.
O que precisa mudar é o **fallback** no return, pra cobrir o caso de
migração 0005 ainda não aplicada:

```diff
   return {
     user,
     profile: (profile as Profile) ?? {
       id: user.id,
       display_name: user.email ?? "Usuário",
       height_cm: null,
       created_at: "",
       onboarded_at: null,
+      period_mode: "fixed" as const,
+      week_starts_on: "monday" as const,
     },
     ...
```

Isso garante que o tipo `Profile` retornado sempre tem os campos novos, mesmo
sem migração. `as const` evita que o TS alargue pra `string`.

---

## 5. Onboarding — tela nova (step 3 de 4)

### 5.1 `TOTAL_STEPS` muda de 3 para 4

O componente `OnboardingFlow.tsx` tem `const TOTAL_STEPS = 3` usado pelos
`StepDots`. Trocar para `4`.

### 5.2 Fluxo atualizado

1. **Step 1** — `StepWelcome` (sem mudança)
2. **Step 2** — `StepKpiExplainer` (sem mudança, mas `onNext` agora vai pro
   step 3 em vez do step 3 antigo)
3. **Step 3 (novo)** — `StepPeriodMode` — escolha de período e início de semana
4. **Step 4** — `StepFirstGoal` (era step 3, sem mudança de conteúdo, só
   número do step)

### 5.3 Componente `StepPeriodMode`

Novo componente interno em `OnboardingFlow.tsx` (mesmo padrão dos outros
Step*, não é arquivo separado):

```tsx
function StepPeriodMode({
  periodMode,
  weekStartsOn,
  onPeriodModeChange,
  onWeekStartsOnChange,
  onNext,
  onBack,
}: {
  periodMode: "fixed" | "rolling";
  weekStartsOn: "monday" | "sunday";
  onPeriodModeChange: (v: "fixed" | "rolling") => void;
  onWeekStartsOnChange: (v: "monday" | "sunday") => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-accent font-mono">
        período das metas
      </p>
      <h2 className="mt-3 font-display font-bold text-2xl">
        Como você quer contar suas semanas e meses?
      </h2>
      <p className="mt-3 text-ink-muted text-[14px] leading-relaxed">
        Isso define quando cada período começa pra calcular se você está no
        ritmo. Dá pra trocar depois em Configurações.
      </p>

      <div className="mt-6 space-y-3">
        {([
          {
            value: "fixed" as const,
            title: "Semana/mês corrido",
            desc: "Semana de segunda a domingo, mês do dia 1 ao fim.",
          },
          {
            value: "rolling" as const,
            title: "Últimos N dias",
            desc: "Sempre os últimos 7/30/90/180 dias a partir de hoje.",
          },
        ]).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPeriodModeChange(opt.value)}
            className={`w-full text-left rounded-card border p-4 transition ${
              periodMode === opt.value
                ? "border-accent bg-base-surface2"
                : "border-base-border bg-base-surface hover:border-ink-faint"
            }`}
          >
            <span className="text-sm font-medium text-ink">{opt.title}</span>
            <span className="block mt-1 text-[13px] text-ink-muted">{opt.desc}</span>
          </button>
        ))}
      </div>

      <label className="block mt-6">
        <span className="text-xs text-ink-muted mb-1.5 block">
          Sua semana começa em:
        </span>
        <div className="flex gap-3">
          {([
            { value: "monday" as const, label: "Segunda-feira" },
            { value: "sunday" as const, label: "Domingo" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onWeekStartsOnChange(opt.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                weekStartsOn === opt.value
                  ? "border-accent bg-base-surface2 text-ink"
                  : "border-base-border text-ink-muted hover:border-ink-faint"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </label>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-base-border px-5 py-3 text-sm text-ink-muted hover:text-ink transition"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-lg bg-accent text-base-bg font-medium py-3 text-sm hover:bg-accent-hover transition"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
```

### 5.4 State e `handleFinish`

No componente `OnboardingFlow`, adicionar estados:

```ts
const [periodMode, setPeriodMode] = useState<"fixed" | "rolling">("fixed");
const [weekStartsOn, setWeekStartsOn] = useState<"monday" | "sunday">("monday");
```

No `handleFinish`, **depois** do upsert de `goals` e **antes** do update de
`onboarded_at`, adicionar o update de `period_mode`/`week_starts_on`:

```ts
// Gravar period_mode e week_starts_on junto com onboarded_at
const { error: profileError } = await supabase
  .from("profiles")
  .update({
    period_mode: periodMode,
    week_starts_on: weekStartsOn,
    onboarded_at: new Date().toISOString(),
  })
  .eq("id", userId);
```

Isso **substitui** o update existente que só grava `onboarded_at` — não
adicionar um segundo update, combinar no mesmo.

### 5.5 Navegação entre steps

O render condicional muda:

```tsx
{step === 1 && (
  <StepWelcome displayName={displayName} onNext={() => setStep(2)} />
)}
{step === 2 && (
  <StepKpiExplainer onNext={() => setStep(3)} onBack={() => setStep(1)} />
)}
{step === 3 && (
  <StepPeriodMode
    periodMode={periodMode}
    weekStartsOn={weekStartsOn}
    onPeriodModeChange={setPeriodMode}
    onWeekStartsOnChange={setWeekStartsOn}
    onNext={() => setStep(4)}
    onBack={() => setStep(2)}
  />
)}
{step === 4 && (
  <StepFirstGoal
    weeklyLossKg={weeklyLossKg}
    targetWeightKg={targetWeightKg}
    onWeeklyLossChange={setWeeklyLossKg}
    onTargetWeightChange={setTargetWeightKg}
    onBack={() => setStep(3)}
    onFinish={handleFinish}
    loading={loading}
    error={error}
  />
)}
```

---

## 6. Tela de Configurações (nova) — `/dashboard/settings`

### 6.1 Server Component: `src/app/(app)/dashboard/settings/page.tsx`

Seguir exatamente o padrão de `goals/page.tsx` (que é o mais próximo):

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <SettingsForm
          userId={user.id}
          displayName={profile.display_name}
          heightCm={profile.height_cm}
          periodMode={profile.period_mode}
          weekStartsOn={profile.week_starts_on}
        />
      </main>
    </div>
  );
}
```

### 6.2 Client Component: `src/components/SettingsForm.tsx`

Client component `"use client"`, com:
- Seção **Perfil**: `display_name` (input text, obrigatório não-vazio),
  `height_cm` (input numérico opcional, usar `parseOptionalNumber` — copiar
  o padrão de `BodyMeasurementForm.tsx`, que já trata `Number("") === 0`).
- Seção **Período das metas**: seletor `period_mode` (mesmo visual de cards
  selecionáveis do `StepPeriodMode` acima, reutilizando copy e padrão — se
  der pra extrair as options como constante compartilhada, ótimo; senão,
  duplicar é aceitável pro escopo desta fase). Seletor `week_starts_on`
  (botões, mesmo padrão).
- **Aviso permanente** (parágrafo `text-xs text-ink-faint`, não modal)
  abaixo dos seletores, sempre visível quando `period_mode === 'fixed'`:
  "Quando em modo 'Semana/mês corrido', o início de semana configurado aqui
  também será usado pelo seletor de período do gráfico (funcionalidade
  futura)." — texto intencionalmente vago sobre Fase 5.
- Botão "Salvar".

**Persistência:** `supabase.from("profiles").update({...}).eq("id", userId)`
client-side seguido de `router.refresh()`, mesmo padrão já usado em
`GoalsForm.tsx` e `BodyMeasurementForm.tsx` (não usar Server Action — o
projeto não usa Server Actions para updates de tabelas com RLS; `theme-actions.ts`
é Server Action porque escreve num **cookie**, não em tabela Supabase).

**Validação de `display_name`:** rejeitar string vazia ou só whitespace.
Trimmar antes de salvar.

**Validação de `height_cm`:** aceitar vazio (→ `null`), rejeitar valores
≤ 0 ou ≥ 300 (consistente com ranges de `body_measurements`). Usar
`parseOptionalNumber` ou replicar o padrão: `const trimmed = raw.trim(); if
(trimmed === "") return null; const n = Number(trimmed.replace(",", "."));
if (!Number.isFinite(n) || n <= 0 || n >= 300) return "invalid";`

**Feedback de sucesso:** mensagem "Configurações atualizadas" com auto-hide
após 3 segundos, mesmo padrão de `GoalsForm` (que já tem esse comportamento).

### 6.3 Modal de confirmação: `src/components/ConfirmDialog.tsx`

Componente reutilizável (não existe precedente no projeto — este é o primeiro
modal):

```tsx
"use client";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative rounded-card border border-base-border bg-base-surface p-6 mx-4 max-w-sm w-full shadow-lg">
        <h3 className="font-display font-bold text-lg">{title}</h3>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">{message}</p>
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink-muted hover:text-ink transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Regra de disparo no `SettingsForm`:** o modal aparece **apenas quando o
valor de `period_mode` no formulário é diferente do valor salvo (prop
`periodMode` original)** no momento do submit. Se só `week_starts_on` /
`display_name` / `height_cm` mudaram, salva direto sem modal.

Texto do modal:
- title: "Mudar modo de período"
- message: "Isso vai mudar como suas metas são medidas. Os KPIs de semana,
  mês, trimestre e semestre vão recalcular na hora. Tem certeza?"

Fluxo:
1. Usuário clica "Salvar" com `period_mode` diferente do original.
2. Modal abre.
3. "Cancelar" → fecha modal, nada é salvo, formulário fica como estava.
4. "Confirmar" → fecha modal, faz o update no Supabase, `router.refresh()`.

### 6.4 Link de navegação no NavBar

O `NavBar.tsx` tem um array `links` hardcoded. Adicionar "Configurações":

```diff
 const links = [
   { href: "/dashboard", label: "Visão geral" },
   { href: "/dashboard/entries", label: "Pesagens" },
   { href: "/dashboard/measurements", label: "Medidas" },
   { href: "/dashboard/goals", label: "Metas" },
+  { href: "/dashboard/settings", label: "Configurações" },
 ];
```

**Atenção ao mobile:** o NavBar renderiza `links` duas vezes — uma vez dentro
de `<nav className="hidden sm:flex ...">` e outra em `<nav className="sm:hidden
...">`. O array é reusado nos dois, então a adição no array basta. No entanto,
com 5 links (antes eram 4), **verificar visualmente** se o layout mobile (a
segunda `<nav>`) não estoura ou trunca de forma ilegível. Se estoura, uma
opção razoável é abreviar o label para "Config." no array ou usar overflow
horizontal (`overflow-x-auto`). Decisão de implementação.

**Nota: `/dashboard/import` NÃO está no array `links` do NavBar** — o link
de importação vive em `entries/page.tsx`, ao lado do ExportButtons, não no
NavBar. Não mudou, e a spec não deve adicioná-lo.

---

## 7. Callers de `computeAllKpis` — propagar `period_mode`/`week_starts_on`

### 7.1 `src/app/(app)/dashboard/page.tsx`

```diff
 export default async function DashboardPage() {
   const { profile, entries, goals, goalsHistory } = await loadUserData();
   ...
-  const kpis = computeAllKpis(entries, goalsHistory);
+  const kpis = computeAllKpis(entries, goalsHistory, new Date(), profile.period_mode, profile.week_starts_on);
```

### 7.2 `src/app/api/export/pdf/route.tsx`

Esta rota faz sua própria query ao banco (não reutiliza `loadUserData()`).
A query de profile hoje é
`supabase.from("profiles").select("display_name").eq("id", user.id).single()`.
Precisa expandir o select para incluir `period_mode, week_starts_on`:

```diff
-  supabase.from("profiles").select("display_name").eq("id", user.id).single(),
+  supabase.from("profiles").select("display_name, period_mode, week_starts_on").eq("id", user.id).single(),
```

E propagar na chamada de `computeAllKpis`:

```diff
-  const kpis = computeAllKpis(typedEntries, typedGoalsHistory);
+  const kpis = computeAllKpis(
+    typedEntries,
+    typedGoalsHistory,
+    new Date(),
+    (profile?.period_mode as PeriodMode) ?? "fixed",
+    (profile?.week_starts_on as WeekStartsOn) ?? "monday"
+  );
```

Adicionar import de `PeriodMode, WeekStartsOn` de `@/types/database`.

### 7.3 Outros callers

`api/export/csv/route.ts` **não** usa `computeAllKpis` — sem mudança (mesma
observação da Fase 2.3).

`WeightChart.tsx` recebe `weekKpi` como prop e usa `weekKpi.periodStart` (já
resolvido por `computePeriodKpi`) — não precisa saber o modo, o cálculo já
está feito antes de chegar nele.

---

## 8. O que fica fora de escopo (não implementar nesta fase)

- Seletor de período no gráfico de evolução (1 semana/1 mês/3 meses/6 meses)
  — é Fase 5, já documentado ali com a dependência explícita de
  `period_mode`/`week_starts_on` desta fase.
- Qualquer mudança em `goals_history`, `resolveGoalsForPeriod` em si, ou nos
  thresholds de status — só a origem da data de início de período muda.
- Notificação por e-mail sobre troca de modo.
- Trocar `period_mode`/`week_starts_on` do onboarding que já aconteceu para
  contas existentes — elas ficam com o default `fixed`/`monday` até mudarem
  em `/dashboard/settings`.

---

## 9. Ordem de execução

1. Rodar `supabase/migrations/0005_period_mode.sql` (Supabase Dashboard).
2. Atualizar `supabase/schema.sql` (referência).
3. Atualizar `src/types/database.ts` (seção 2).
4. Atualizar `src/lib/analytics.ts` (seção 3).
5. Atualizar `src/lib/loadUserData.ts` (seção 4).
6. Atualizar `src/components/onboarding/OnboardingFlow.tsx` (seção 5).
7. Criar `src/components/ConfirmDialog.tsx` (seção 6.3).
8. Criar `src/components/SettingsForm.tsx` (seção 6.2).
9. Criar `src/app/(app)/dashboard/settings/page.tsx` (seção 6.1).
10. Atualizar `src/components/NavBar.tsx` (seção 6.4).
11. Atualizar `src/app/(app)/dashboard/page.tsx` (seção 7.1).
12. Atualizar `src/app/api/export/pdf/route.tsx` (seção 7.2).
13. `npx tsc --noEmit` e `npm run build`.

---

## 10. Checklist de validação em produção

- [ ] Rodar `supabase/migrations/0005_period_mode.sql` no Supabase Dashboard —
      conferir que contas existentes ganharam `period_mode='fixed'` e
      `week_starts_on='monday'` via default.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Onboarding de conta nova: tela de período aparece entre a explicação de
      KPI e a meta semanal (steps 2→3→4), salva corretamente em `profiles`,
      e o restante do fluxo (`goals` + `onboarded_at`) continua funcionando.
      `StepDots` mostra 4 dots.
- [ ] `/dashboard/settings`: editar `display_name` e `height_cm` isoladamente
      → salva sem exigir modal, display_name atualizado aparece no NavBar
      após refresh.
- [ ] `/dashboard/settings`: trocar `week_starts_on` sozinho (sem trocar
      `period_mode`) → salva sem modal.
- [ ] `/dashboard/settings`: trocar `period_mode` de `fixed` para `rolling` →
      modal aparece; "Cancelar" não salva nada; "Confirmar" salva e os 4 KPIs
      em `/dashboard` recalculam imediatamente após o refresh.
- [ ] Cenário de verificação numérica: com `period_mode='fixed'` e
      `week_starts_on='monday'`, KPI da semana bate com o cálculo civil atual
      (comportamento idêntico ao pré-migração). Trocar para `rolling` e
      confirmar que o KPI da semana passa a comparar contra exatamente 7 dias
      corridos atrás, com número visivelmente diferente do modo `fixed` (usar
      dados de teste que gerem essa diferença visível; ex.: hoje é
      quarta-feira — modo fixed usa segunda como início, modo rolling usa
      "há 7 dias", datas diferentes).
- [ ] Trocar `week_starts_on` de segunda pra domingo com `period_mode='fixed'`
      → KPI da semana muda o início considerado.
- [ ] Exportação PDF (`api/export/pdf`) reflete o `period_mode`/
      `week_starts_on` do usuário — comparar com o dashboard.
- [ ] `goals_history`/`resolveGoalsForPeriod` continuam funcionando sem
      alteração de comportamento (regressão da Fase 2.3) — editar meta,
      olhar KPI do mês, confirmar resolução de meta anterior.
- [ ] RLS: `/dashboard/settings` não permite ler/editar `profiles` de outro
      usuário.
- [ ] NavBar mobile com 5 links: verificar que não estoura ou trunca.
- [ ] `display_name` vazio ou só espaços → erro de validação, nada salvo.
- [ ] `height_cm` com valor inválido (0, -10, 999) → erro de validação.
- [ ] `height_cm` vazio → salva como `null` sem erro.

---

## Depois de validar em produção

Atualizar `claude_fases.md`: marcar os 4 itens da Fase 3 como concluídos.
Adicionar seção "Fase 3 — Período de meta" em `CLAUDE.md` com o resumo do
que foi implementado, decisões tomadas (nomes reais de função, padrão de
modal, se `week_starts_on` exigiu confirmação ou não), e checklist de
validação pendente, copiando o padrão das seções "Fase 2.x" existentes.

Mover decisões relevantes para "Decisões importantes" do `CLAUDE.md`:
- Persistência de settings via client-side update (não Server Action) —
  Server Actions no projeto são só para cookies.
- `ConfirmDialog.tsx` como primeiro modal do projeto — referência pra futuras
  confirmações destrutivas.

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. Caminho errado dos tipos (SEVERIDADE: ALTA — causaria erro de build)

**v1 dizia:** "Em `src/lib/types.ts` (ou onde `Profile`/tipos equivalentes
estiverem definidos)"

**Problema:** O projeto não tem `src/lib/types.ts`. Todos os tipos de banco
vivem em `src/types/database.ts`. Um Claude Code seguindo a v1 ao pé da
letra criaria um arquivo novo no lugar errado, e os imports de
`@/types/database` existentes (10+ arquivos) não veriam os tipos novos.

**Corrigido na v2:** Seção 2 aponta diretamente para `src/types/database.ts`
com diff exato no tipo `Profile` real.

### A2. `periodStart` — nome e assinatura confirmados (SEVERIDADE: BAIXA)

**v1 dizia:** "provavelmente algo como `periodStart(period: Period,
referenceDate: Date): Date` ou equivalente inline"

**Realidade:** A função existe exatamente como `periodStart(period, reference)`
e é exportada. Não é inline. O hardcoded `weekStartsOn: 1` em
`startOfWeek(reference, { weekStartsOn: 1 })` precisa virar dinâmico.

**Corrigido na v2:** Seção 3.1 mostra o diff exato contra o código real, com
o mapeamento `weekStartsOn === "sunday" ? 0 : 1` para o parâmetro de
`date-fns` (que usa `0 = sunday, 1 = monday`).

### A3. `periodLengthDays` não acompanhou o rolling (SEVERIDADE: ALTA — KPI numericamente errado)

**v1 não mencionava** `periodLengthDays` — só dizia que `periodStart` muda.
Mas `computePeriodKpi` usa `periodLengthDays(period)` para calcular
`fractionElapsed = elapsedDays / lengthDays`. No modo fixed, `30.4` para
mês é uma aproximação razoável de meses civis; no modo rolling, o período
**é exatamente 30 dias**, então usar `30.4` inflaria o denominador e geraria
`fractionElapsed` sempre um pouco abaixo de 1 mesmo no último dia do
período, fazendo o `expectedWeightNow` convergir mais devagar que o esperado.

Para semestre o erro seria mais notável: `180` dias rolling vs. `182.6` de
denominador → ~1.4% de diferença na fração, o que em uma meta de 6 kg
significa ~0.08 kg de erro no `expectedWeightNow`. Pequeno mas desnecessário,
e acumula com trimestre (90 vs 91.3).

**Corrigido na v2:** Seção 3.2 ajusta `periodLengthDays` para receber `mode`
e retornar valores exatos no rolling.

### A4. Onboarding — `TOTAL_STEPS` hardcoded (SEVERIDADE: ALTA — UX quebrada)

**v1 dizia:** "tela nova dentro do fluxo existente" mas não mencionava que
`TOTAL_STEPS = 3` está hardcoded no componente e é usado pelo `StepDots`
para renderizar os indicadores de progresso. Um Claude Code que adicionasse
o step 3 (novo) e não atualizasse `TOTAL_STEPS` ficaria com 3 dots pra 4
telas — a última tela não teria dot, ou os dots ficariam dessincronizados.

**Corrigido na v2:** Seção 5.1 manda trocar para `TOTAL_STEPS = 4`
explicitamente, e seção 5.5 mostra o remapeamento completo dos steps.

### A5. Onboarding — gravar `period_mode`/`week_starts_on` junto com `onboarded_at` (SEVERIDADE: MÉDIA — dados não gravados)

**v1 dizia:** "gravar period_mode e week_starts_on em profiles junto com
o que já é gravado hoje (goals + onboarded_at), no mesmo upsert ou em
paralelo"

**Problema:** O `handleFinish` real faz **dois** calls sequenciais ao
Supabase: um `upsert` em `goals` e um `update` em `profiles` (só
`onboarded_at`). Não é um upsert único. A instrução "no mesmo upsert" é
ambígua — um Claude Code poderia tentar juntar goals e profiles num único
upsert (que falharia, são tabelas diferentes) ou criar um terceiro call.

**Corrigido na v2:** Seção 5.4 mostra o diff exato: combinar
`period_mode`/`week_starts_on`/`onboarded_at` no **mesmo update de
`profiles`** que já existe, substituindo-o (não adicionando um segundo).

### A6. NavBar — `/dashboard/import` não está nos links (SEVERIDADE: BAIXA — cosmético)

**v1 dizia:** "junto aos links existentes (`/dashboard`, `/dashboard/entries`,
`/dashboard/measurements`, `/dashboard/goals`, `/dashboard/import`)"

**Realidade:** `/dashboard/import` **não** está no array `links` do NavBar.
O link de importação vive em `entries/page.tsx`, ao lado do ExportButtons.
Listar `/dashboard/import` como link existente no NavBar pode confundir o
implementador.

**Corrigido na v2:** Seção 6.4 mostra o array real com 4 links e adiciona
só "Configurações". Nota explícita sobre `/dashboard/import` não estar ali.

### A7. Persistência — Server Action vs. client-side update (SEVERIDADE: MÉDIA — padrão errado)

**v1 dizia:** "Server Action (mesmo padrão de `theme-actions.ts`) ou
`supabase.from('profiles').update(...)` client-side"

**Problema:** `theme-actions.ts` é Server Action porque escreve num
**cookie** (não no Supabase). Todos os updates de tabela com RLS no projeto
(`GoalsForm`, `BodyMeasurementForm`, `WeightEntryForm`, `OnboardingFlow`)
usam client-side `supabase.from(...).update()/upsert()`. Sugerir Server
Action como padrão equivalente é enganoso — criaria um padrão diferente do
restante do projeto sem motivo.

**Corrigido na v2:** Seção 6.2 especifica client-side update explicitamente,
com justificativa.

### A8. Falta de seção "Ordem de execução" (SEVERIDADE: BAIXA — conveniência)

**v1 não tinha** uma seção de ordem, que é padrão em todos os specs
anteriores do projeto (Fase 0 v3, Fase 2 import, Fase 2 medidas, Fase 2.3
histórico). Sem ela, um Claude Code pode executar fora de ordem e ter erros
de tipo transitórios.

**Corrigido na v2:** Seção 9.

### A9. Aviso permanente condicional (SEVERIDADE: BAIXA — UX)

**v1 dizia:** "quando `period_mode === 'fixed'`, mostrar [aviso]"

**Observação mantida:** O aviso só aparece em modo `fixed` porque no modo
`rolling` o início de semana não é usado pra nada (ainda). Isso é correto
e não foi alterado, mas documentado explicitamente na seção 6.2 para que o
implementador não esqueça de condicionar a renderização.

### A10. `export/pdf` — select parcial de profile (SEVERIDADE: ALTA — runtime crash)

**v1 dizia:** "Ambos precisam passar `period_mode`/`week_starts_on` do
profile" mas não mencionava que a rota de PDF faz
`select("display_name")` — um select parcial que **não** traz os campos
novos. Sem expandir o select, `profile.period_mode` seria `undefined` no
runtime, e o `computeAllKpis` receberia `undefined` em vez de `"fixed"`,
o que causaria NaN em `subDays(reference, undefined)` no modo rolling
(ou funcionaria por acaso no modo fixed via default, escondendo o bug
até alguém de fato trocar pra rolling e exportar PDF).

**Corrigido na v2:** Seção 7.2 mostra o diff do select e a cast necessária.
