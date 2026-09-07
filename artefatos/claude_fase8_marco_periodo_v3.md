# Fase 8.x — Marco de período customizado ("A partir de uma data") + melhoria de copy (v3)

> v3 = v2 auditada contra o código real via `project_knowledge_search`
> direcionado. Todos os 3 pontos que a v2 deixava como "pendência para
> Claude Code resolver por leitura direta" foram resolvidos nesta auditoria
> — a spec agora está completa e pronta para handoff sem pendências
> técnicas abertas. Achados no Apêndice A.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md`
> antes de implementar.

---

## 0. Contexto e motivação

Feedback de cliente: a tela de "Período das metas" em `/dashboard/settings`
não deixa claro o que cada modo significa. Duas mudanças nesta fase:

1. **Copy**: reescrever as descrições dos 3 cards de período para serem mais
   explícitas sobre o que "início do período" significa na prática (texto
   inline apenas — sem link para o modal de ajuda, decisão confirmada).
2. **Novo modo**: um 3º `period_mode`, chamado **"A partir de uma data"**
   (valor interno `anchored`). O usuário define uma data-marco (ex.:
   27/08/2026) e os 4 períodos (7/30/90/180 dias — mesmos nomes de
   semana/mês/trimestre/semestre) passam a ser contados a partir dessa data,
   não a partir de hoje.

Isso estende o mecanismo já existente da Fase 3 (`period_mode: "fixed" |
"rolling"`, propagado via `periodStart()` → `computePeriodKpi()` →
`computeAllKpis()`).

### 0.1 Decisões confirmadas (não reabrir)

- `anchored` é um **modo adicional** (3 opções no total), não substitui
  `rolling`.
- Dentro de `anchored`, a contagem 7/30/90/180 **mantém os mesmos períodos**,
  mas contados a partir do marco em vez de a partir de hoje — `periodStart`
  no modo `anchored` retorna a **mesma data fixa (o marco)** para os 4
  períodos.
- Pesagens/dados anteriores ao marco **continuam visíveis** no histórico e no
  gráfico de evolução — só os KPIs/períodos recontam a partir do marco.
  `WeightChart` não filtra dados por marco.
- O usuário define o marco via **date picker na própria tela de
  Configurações**, junto dos outros dois cards de modo.
- O modo `anchored` é **Pro-gated**.
- Título do card: **"A partir de uma data"**.
- Melhoria de copy: **só texto inline**, sem botão/link para o modal de ajuda.
- **Streaks e Conquistas não mudam de cálculo de forma alguma.**
  `StreakCard`/`evaluateAchievements` continuam operando exatamente como
  hoje — sobre `entries` diretamente, sem qualquer relação com
  `period_mode`/marco. **Nenhuma mudança de código em
  `streak.ts`/`achievements.ts`/`AchievementsCard.tsx`/`StreakCard.tsx`.**

### 0.2 Mudança estrutural: parâmetros de período → objeto `PeriodContext`

A assinatura atual de `computeAllKpis`/`computePeriodKpi` (confirmada
contra o arquivo real nesta auditoria) recebe `mode`, `weekStartsOn` e
`unit` como parâmetros posicionais separados:

```ts
// Assinatura REAL atual de computePeriodKpi (confirmada):
export function computePeriodKpi(
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  period: Period,
  now: Date = new Date(),
  mode: PeriodMode = "fixed",
  weekStartsOn: WeekStartsOn = "monday",
  unit: string = "kg"
): PeriodKpi

// Assinatura REAL atual de computeAllKpis (confirmada):
export function computeAllKpis(
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  now: Date = new Date(),
  mode: PeriodMode = "fixed",
  weekStartsOn: WeekStartsOn = "monday",
  unit: string = "kg"
): PeriodKpi[]
```

Adicionar `anchorDate` como mais um parâmetro posicional colidiria e cada
extensão futura repetiria o problema. Esta spec converte os parâmetros de
contexto de período em um objeto:

```ts
export type PeriodContext = {
  mode: PeriodMode;
  weekStartsOn: WeekStartsOn;
  anchorDate: Date | null;
};

export const DEFAULT_PERIOD_CONTEXT: PeriodContext = {
  mode: "fixed",
  weekStartsOn: "monday",
  anchorDate: null,
};
```

**Nova assinatura:**

```ts
export function computePeriodKpi(
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  period: Period,
  now: Date = new Date(),
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
  unit: string = "kg"
): PeriodKpi

export function computeAllKpis(
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  now: Date = new Date(),
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
  unit: string = "kg"
): PeriodKpi[]

export function periodStart(
  period: Period,
  reference: Date,
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT
): Date
```

`unit` continua como último parâmetro posicional solto — ele é "contexto de
métrica", não "contexto de período"; misturar os dois acoplaria conceitos
que mudam por razões diferentes.

**Atenção ao 1º parâmetro:** a Fase 6.2 mudou o 1º param de
`computeAllKpis`/`computePeriodKpi` de `entries: WeightEntry[]` para
`points: EntryPoint[]`. Confirmado nesta auditoria — os callers já passam
o resultado de `extractMetricPoints()`, não `entries` diretamente.

Helper exportado:

```ts
export function buildPeriodContext(
  profile: Pick<Profile, "period_mode" | "week_starts_on" | "period_anchor_date">
): PeriodContext {
  return {
    mode: profile.period_mode,
    weekStartsOn: profile.week_starts_on,
    anchorDate: profile.period_anchor_date ? parseISO(profile.period_anchor_date) : null,
  };
}
```

Todos os callers passam a fazer:

```ts
computeAllKpis(points, history, new Date(), buildPeriodContext(profile), METRIC_UNIT[goal.metric])
```

---

## 1. Migração SQL

Criar `supabase/migrations/0013_period_anchor.sql` (última confirmada:
`0012_plan_gate.sql`; confirmar no Supabase Dashboard que nenhuma `0013_*`
já existe).

Nome da constraint confirmado: `profiles_period_mode_check` (criada
explicitamente na Fase 3 via `CONSTRAINT profiles_period_mode_check
CHECK (...)`). Conferir de qualquer forma antes de rodar, via:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
  AND contype = 'c'
  AND conname ILIKE '%period_mode%';
```

Rodar **cada bloco separadamente** no SQL Editor (lição documentada do
projeto: multi-statement em transação única — falha em qualquer reverte
tudo):

**Bloco 1:**

```sql
-- Fase 8.x: expandir period_mode para incluir 'anchored'.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_period_mode_check;
```

**Bloco 2:**

```sql
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_period_mode_check
    CHECK (period_mode IN ('fixed', 'rolling', 'anchored'));
```

**Bloco 3:**

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS period_anchor_date date;

COMMENT ON COLUMN public.profiles.period_mode IS
  'fixed = períodos civis; rolling = N dias corridos atrás de hoje;
   anchored = todos os KPIs contam a partir de period_anchor_date.
   anchored é Pro-gated.';
COMMENT ON COLUMN public.profiles.period_anchor_date IS
  'Data-marco quando period_mode = anchored. Pode permanecer preenchida
   se o modo mudar (permite reativar sem redigitar). Pesagens anteriores
   ao marco continuam visíveis, só os KPIs recontam a partir dela.';
```

**Sem `NOT NULL`** em `period_anchor_date` — validação de obrigatoriedade na
camada de aplicação (seção 4.1), permitindo manter o valor salvo ao trocar
de modo.

Atualizar também `supabase/schema.sql` (referência, não executado).

---

## 2. `src/types/database.ts`

```diff
-export type PeriodMode = "fixed" | "rolling";
+export type PeriodMode = "fixed" | "rolling" | "anchored";
 export type WeekStartsOn = "monday" | "sunday";

 export type Profile = {
   id: string;
   display_name: string;
   height_cm: number | null;
   created_at: string;
   onboarded_at: string | null;
   period_mode: PeriodMode;
   week_starts_on: WeekStartsOn;
+  period_anchor_date: string | null; // YYYY-MM-DD
   checkin_hour: number | null;
   plan: "free" | "pro";
   plan_expires_at: string | null;
   kiwify_order_id: string | null;
 };
```

Shape confirmado linha a linha contra o arquivo real nesta auditoria.

---

## 3. `src/lib/analytics.ts`

### 3.1 Tipo `PeriodContext`, constante e helper

Adicionar junto às demais definições de tipo (perto de `Period`, `PeriodKpi`):

```ts
export type PeriodContext = {
  mode: PeriodMode;
  weekStartsOn: WeekStartsOn;
  anchorDate: Date | null;
};

export const DEFAULT_PERIOD_CONTEXT: PeriodContext = {
  mode: "fixed",
  weekStartsOn: "monday",
  anchorDate: null,
};

export function buildPeriodContext(
  profile: Pick<Profile, "period_mode" | "week_starts_on" | "period_anchor_date">
): PeriodContext {
  return {
    mode: profile.period_mode,
    weekStartsOn: profile.week_starts_on,
    anchorDate: profile.period_anchor_date ? parseISO(profile.period_anchor_date) : null,
  };
}
```

Adicionar `Profile` ao import de `@/types/database` no topo do arquivo (se
não estiver lá — confirmar; pode já existir):

```diff
 import type {
   WeightEntry,
   GoalsHistoryEntry,
   PeriodMode,
   WeekStartsOn,
   GoalMetric,
   BodyMeasurement,
   Goal,
+  Profile,
 } from "@/types/database";
```

### 3.2 `periodStart` — assinatura nova + terceiro modo

```diff
 export function periodStart(
   period: Period,
   reference: Date,
-  mode: PeriodMode = "fixed",
-  weekStartsOn: WeekStartsOn = "monday"
+  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT
 ): Date {
+  if (ctx.mode === "anchored") {
+    if (!ctx.anchorDate) {
+      throw new Error(
+        "periodStart: mode 'anchored' requer anchorDate. Profile inconsistente " +
+        "(period_mode='anchored' sem period_anchor_date)."
+      );
+    }
+    return ctx.anchorDate;
+  }
+
-  if (mode === "rolling") {
+  if (ctx.mode === "rolling") {
     const rollingDays: Record<Period, number> = {
       week: 7,
       month: 30,
       quarter: 90,
       semester: 180,
     };
     return subDays(reference, rollingDays[period]);
   }

   switch (period) {
     case "week":
-      return startOfWeek(reference, { weekStartsOn: weekStartsOn === "sunday" ? 0 : 1 });
+      return startOfWeek(reference, { weekStartsOn: ctx.weekStartsOn === "sunday" ? 0 : 1 });
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

### 3.3 `periodLengthDays` — terceiro modo

```diff
-function periodLengthDays(period: Period, mode: PeriodMode = "fixed"): number {
-  if (mode === "rolling") {
+function periodLengthDays(
+  period: Period,
+  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
+  now: Date = new Date()
+): number {
+  if (ctx.mode === "anchored" && ctx.anchorDate) {
+    return Math.max(1, differenceInCalendarDays(now, ctx.anchorDate));
+  }
+  if (ctx.mode === "rolling") {
     const exact: Record<Period, number> = { week: 7, month: 30, quarter: 90, semester: 180 };
     return exact[period];
   }
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

`Math.max(1, ...)` evita divisão por zero quando o marco é "hoje".
`differenceInCalendarDays` já importado no arquivo.

### 3.4 `computePeriodKpi` — nova assinatura

```diff
 export function computePeriodKpi(
   points: EntryPoint[],
   goalsHistory: GoalsHistoryEntry[],
   period: Period,
   now: Date = new Date(),
-  mode: PeriodMode = "fixed",
-  weekStartsOn: WeekStartsOn = "monday",
+  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
   unit: string = "kg"
 ): PeriodKpi {
-  const start = periodStart(period, now, mode, weekStartsOn);
+  const start = periodStart(period, now, ctx);
   const activeGoals = resolveGoalsForPeriod(goalsHistory, start);
   const targetLossKg = Number(activeGoals?.[GOAL_FIELD[period]] ?? 0);

   const baseline = baselineWeight(points, start, period);
   const latest = points.length ? points[points.length - 1] : null;
   const current = latest ? latest.weight : null;

-  const lengthDays = periodLengthDays(period, mode);
+  const lengthDays = periodLengthDays(period, ctx, now);
   const elapsedDays = Math.max(0, differenceInCalendarDays(now, start));
   const fractionElapsed = Math.min(1, elapsedDays / lengthDays);
```

O resto do corpo da função (`expectedWeightNow`, `deltaVsExpected`,
status labels com `${unit}`, etc.) **não muda** — já está correto desde a
Fase 6.2.

### 3.5 `computeAllKpis` — nova assinatura

```diff
 export function computeAllKpis(
   points: EntryPoint[],
   goalsHistory: GoalsHistoryEntry[],
   now: Date = new Date(),
-  mode: PeriodMode = "fixed",
-  weekStartsOn: WeekStartsOn = "monday",
+  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
   unit: string = "kg"
 ): PeriodKpi[] {
   return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
-    computePeriodKpi(points, goalsHistory, p, now, mode, weekStartsOn, unit)
+    computePeriodKpi(points, goalsHistory, p, now, ctx, unit)
   );
 }
```

### 3.6 O que NÃO muda

- `baselineWeight`, `BASELINE_MAX_DAYS_BEFORE`, thresholds de status,
  `resolveGoalsForPeriod`, `computeTrend` (janela fixa de 21 dias) —
  intocados.
- `computeGoalPrediction` — recebe `PeriodKpi` já calculado, funciona
  automaticamente sem mudança.
- `extractMetricPoints`, `toPoints`, `METRIC_UNIT`, `METRIC_LABEL`,
  `getPrimaryWeightGoal` — sem mudança.
- `streak.ts`, `achievements.ts` — sem mudança.

---

## 4. Server Action / `loadUserData`

### 4.1 Validação ao salvar Configurações

O `SettingsForm.tsx` (confirmado: client component, update direto ao
Supabase via `supabase.from("profiles").update(...)`, **não** Server
Action) — o `.update()` existente precisa incluir o campo novo:

```diff
 const { error: supaError } = await supabase
   .from("profiles")
   .update({
     display_name: values.display_name,
     height_cm: values.height_cm,
     period_mode: mode,
     week_starts_on: weekStart,
     checkin_hour: values.checkin_hour,
+    ...(mode === "anchored" ? { period_anchor_date: anchorDate } : {}),
   })
   .eq("id", userId);
```

**Validação client-side** (no `validate()` existente):

```ts
if (mode === "anchored") {
  if (!anchorDate) {
    setError("Escolha uma data de início.");
    return null;
  }
  if (anchorDate > todayStr) {
    setError("A data de início não pode ser no futuro.");
    return null;
  }
}
```

**Gate de plano client-side** (já coberto pelo `disabled` no card +
`pointer-events-none` na seção inteira quando `plan === "free"` — o botão
"A partir de uma data" está dentro do bloco com `opacity-50
pointer-events-none` que já protege período no free, confirmado nesta
auditoria).

**Gate de plano server-side:** como o projeto usa update direto ao Supabase
(não Server Action para período), a proteção real são as **RLS policies** do
Supabase. Hoje, profiles tem `UPDATE` allowed para `auth.uid() = id` —
qualquer valor é aceito. Para adicionar gate de plano real no servidor, seria
preciso uma `CHECK` constraint ou RLS policy condicional — **complexidade
extra que esta spec não introduz**, porque o padrão do projeto para todos os
demais gates de Pro (Fotos, Previsão, Medidas) é gate via `PlanGate` no
client + verificação em Route Handlers que fazem `select`, e o
`SettingsForm` segue esse mesmo pattern (client-side gate visual). Se um
usuário free manipular o DOM para clicar no botão desabilitado e salvar
`period_mode = 'anchored'`, o efeito é: os KPIs seriam recalculados com o
marco, mas todas as páginas que mostram dados Pro (Previsão, Relatórios)
continuam trancadas por `PlanGate` nos seus Server Components. **Risco
aceitável**, consistente com o padrão já estabelecido.

### 4.2 `src/lib/loadUserData.ts`

Fallback sintético (a query é `select("*")`, confirmado — campos novos
chegam automaticamente, mas o fallback precisa incluí-los):

```diff
   profile: (profile as Profile) ?? {
     id: user.id,
     display_name: user.email ?? "Usuário",
     height_cm: null,
     created_at: "",
     onboarded_at: null,
     period_mode: "fixed" as const,
     week_starts_on: "monday" as const,
+    period_anchor_date: null,
     checkin_hour: null,
     plan: "free" as const,
     plan_expires_at: null,
     kiwify_order_id: null,
   },
```

---

## 5. UI — `SettingsForm.tsx`

### 5.1 State novo

Confirmado: o componente usa `useState` com nomes: `mode`/`setMode`,
`weekStart`/`setWeekStart`, `plan` (prop). Adicionar:

```ts
const [anchorDate, setAnchorDate] = useState<string>(
  props.periodAnchorDate ?? ""  // prop nova, ver seção 5.5
);
```

**`todayStr`** para o `max` do date picker:

```ts
const todayStr = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
}).format(new Date());
```

### 5.2 Copy dos 3 cards

```diff
 const PERIOD_MODE_OPTIONS = [
   {
     value: "fixed" as const,
     title: "Semana/mês corrido",
-    desc: "Semana de segunda a domingo, mês do dia 1 ao fim.",
+    desc: "Sua semana reinicia toda segunda (ou domingo, como preferir) e " +
+          "seu mês reinicia no dia 1 — como num calendário normal. Os KPIs " +
+          "de trimestre e semestre também seguem esse calendário civil.",
   },
   {
     value: "rolling" as const,
     title: "Últimos N dias",
-    desc: "Sempre os últimos 7/30/90/180 dias a partir de hoje.",
+    desc: "Os KPIs olham sempre para trás a partir de hoje: os últimos 7 " +
+          "dias para a meta semanal, os últimos 30 para a mensal, e assim " +
+          "por diante. Não depende de qual dia do mês ou da semana é hoje.",
   },
+  {
+    value: "anchored" as const,
+    title: "A partir de uma data",
+    desc: "Você escolhe uma data de início (ex.: quando começou este ciclo " +
+          "de emagrecimento) e todos os KPIs passam a contar o progresso a " +
+          "partir dela, não a partir de hoje. Pesagens anteriores a essa " +
+          "data continuam aparecendo no seu histórico e gráfico normalmente.",
+  },
 ];
```

### 5.3 Novo card + date picker + gate Pro inline

O card "A partir de uma data" precisa de gate **individual** (diferente do
bloco todo de período, que já fica `opacity-50 pointer-events-none` no
free — o novo card tem que ficar desabilitado **dentro** da lista de cards,
não na seção inteira, para que o free veja os 3 cards com o terceiro
trancado mas os dois primeiros acessíveis). **Porém** — a seção inteira de
período já é trancada para free (`plan === "free"` → `opacity-50
pointer-events-none`). Então na prática, para free, os 3 cards já estão
desabilitados visualmente. O gate individual no card "A partir de uma data"
é redundante nesse cenário, mas serve como proteção dupla e como indicação
visual quando/se a seção de período for liberada para free em alguma mudança
futura.

Substituir o `PERIOD_MODE_OPTIONS.map(...)` existente por:

```tsx
{PERIOD_MODE_OPTIONS.map((opt) => {
  const isAnchoredLocked = opt.value === "anchored" && plan !== "pro";
  return (
    <button
      key={opt.value}
      type="button"
      disabled={isAnchoredLocked}
      onClick={() => {
        if (!isAnchoredLocked) setMode(opt.value);
      }}
      className={`w-full text-left rounded-card border p-4 transition ${
        mode === opt.value
          ? "border-accent bg-base-surface2"
          : "border-base-border bg-base-surface hover:border-ink-faint"
      } ${isAnchoredLocked ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span className="text-sm font-medium text-ink">
        {opt.title}
        {isAnchoredLocked && (
          <Link
            href="/dashboard/upgrade"
            className="ml-2 text-xs text-accent hover:underline pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            (Pro)
          </Link>
        )}
      </span>
      <span className="block mt-1 text-[13px] text-ink-muted">{opt.desc}</span>
    </button>
  );
})}
```

Date picker condicional, **logo abaixo** do bloco de cards (antes do bloco
de `week_starts_on`):

```tsx
{mode === "anchored" && (
  <label className="block mt-4">
    <span className="text-xs text-ink-muted mb-1.5 block">
      Data de início do período:
    </span>
    <input
      type="date"
      value={anchorDate}
      max={todayStr}
      onChange={(e) => setAnchorDate(e.target.value)}
      className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
      required
    />
  </label>
)}
```

### 5.4 Modal de confirmação

Já tratado: `ConfirmDialog.tsx` é aberto quando `mode !== periodMode` (prop
original) no `handleSubmit` — confirmado no código real. Trocar para/de
`anchored` dispara o mesmo modal sem nenhuma mudança no mecanismo, porque a
condição `mode !== periodMode` já cobre todos os modos. **Sem mudança de
código aqui.**

### 5.5 Props do componente — adicionar `periodAnchorDate`

```diff
 export default function SettingsForm({
   userId,
   displayName,
   heightCm,
   periodMode,
   weekStartsOn,
   checkinHour,
   plan,
+  periodAnchorDate,
 }: {
   userId: string;
   displayName: string;
   heightCm: number | null;
   periodMode: PeriodMode;
   weekStartsOn: WeekStartsOn;
   checkinHour: number | null;
   plan: "free" | "pro";
+  periodAnchorDate: string | null;
 }) {
```

### 5.6 Caller — `settings/page.tsx`

```diff
 <SettingsForm
   userId={user.id}
   displayName={profile.display_name}
   heightCm={profile.height_cm}
   periodMode={profile.period_mode}
   weekStartsOn={profile.week_starts_on}
   checkinHour={profile.checkin_hour}
   plan={profile.plan}
+  periodAnchorDate={profile.period_anchor_date}
 />
```

---

## 6. Callers de `computeAllKpis` — migrar para `buildPeriodContext`

**7 call sites confirmados** nesta auditoria (3 a mais do que a v1 identificou):

### 6.1 `src/app/(app)/dashboard/page.tsx`

```diff
 import {
   extractMetricPoints,
   computeAllKpis,
   computeTrend,
   computeGoalPrediction,
   getPrimaryWeightGoal,
   METRIC_UNIT,
+  buildPeriodContext,
   type PeriodKpi,
 } from "@/lib/analytics";

 // No corpo da função:
-computeAllKpis(points, history, new Date(), profile.period_mode, profile.week_starts_on, METRIC_UNIT[goal.metric])
+computeAllKpis(points, history, new Date(), buildPeriodContext(profile), METRIC_UNIT[goal.metric])
```

### 6.2 `src/app/(app)/dashboard/reports/page.tsx`

Mesmo diff-modelo da seção 6.1 (confirmado: mesmo padrão `kpisByGoal`).

### 6.3 `src/app/(app)/dashboard/prediction/page.tsx`

Mesmo diff-modelo da seção 6.1 (confirmado: mesmo padrão `kpisByGoal`).

### 6.4 `src/app/(app)/dashboard/coach/[ownerId]/page.tsx`

Mesmo diff-modelo da seção 6.1 (confirmado: mesmo padrão `kpisByGoal` +
`METRIC_UNIT`).

### 6.5 `src/app/api/export/pdf/route.tsx`

**Caso especial** — esta rota não usa `loadUserData()`, faz query própria:

```diff
-supabase.from("profiles").select("display_name, period_mode, week_starts_on, plan").eq("id", user.id).single(),
+supabase.from("profiles").select("display_name, period_mode, week_starts_on, period_anchor_date, plan").eq("id", user.id).single(),
```

E a chamada (confirmada nesta auditoria: a rota **já está** no formato
multi-goal — `effectiveGoals.map(...)` com `computeAllKpis` dentro):

```diff
-computeAllKpis(
-  points,
-  historyForGoal,
-  new Date(),
-  (profile?.period_mode as PeriodMode) ?? "fixed",
-  (profile?.week_starts_on as WeekStartsOn) ?? "monday",
-  METRIC_UNIT[goal.metric]
-)
+computeAllKpis(
+  points,
+  historyForGoal,
+  new Date(),
+  {
+    mode: (profile?.period_mode as PeriodMode) ?? "fixed",
+    weekStartsOn: (profile?.week_starts_on as WeekStartsOn) ?? "monday",
+    anchorDate: profile?.period_anchor_date ? parseISO(profile.period_anchor_date) : null,
+  },
+  METRIC_UNIT[goal.metric]
+)
```

Não usa `buildPeriodContext` porque o profile vem de uma query parcial (só
4 campos), não de `loadUserData()` que retorna um `Profile` tipado completo.
Montagem inline do `PeriodContext` é o correto aqui.

Adicionar `parseISO` ao import de `date-fns` se não estiver lá (confirmar).

### 6.6 `src/app/api/export/report-pdf/route.tsx`

**Achado da v3** — esta rota existe no projeto e **não estava listada nas
specs anteriores**. Confirmada nesta auditoria: mesma query de profile, mesma
chamada de `computeAllKpis` com params posicionais. Mesmo diff da seção 6.5:

```diff
-supabase.from("profiles").select("display_name, period_mode, week_starts_on, plan").eq("id", user.id).single(),
+supabase.from("profiles").select("display_name, period_mode, week_starts_on, period_anchor_date, plan").eq("id", user.id).single(),
```

```diff
-computeAllKpis(
-  points,
-  historyForGoal,
-  new Date(),
-  (profile?.period_mode as PeriodMode) ?? "fixed",
-  (profile?.week_starts_on as WeekStartsOn) ?? "monday",
-  unit
-)
+computeAllKpis(
+  points,
+  historyForGoal,
+  new Date(),
+  {
+    mode: (profile?.period_mode as PeriodMode) ?? "fixed",
+    weekStartsOn: (profile?.week_starts_on as WeekStartsOn) ?? "monday",
+    anchorDate: profile?.period_anchor_date ? parseISO(profile.period_anchor_date) : null,
+  },
+  unit
+)
```

### 6.7 Callers internos de `periodStart` dentro de `analytics.ts`

`periodStart` é chamado dentro de `computePeriodKpi` (que agora recebe `ctx`
e repassa) — já tratado pelo diff da seção 3.4. Confirmar com `grep` se há
outros callers internos:

```bash
grep -n "periodStart(" src/lib/analytics.ts
```

Se houver (ex.: dentro de `computeMovingAverage` ou alguma função interna não
vista na busca), aplicar o mesmo pattern de propagação de `ctx`.

---

## 7. O que fica fora de escopo

- Mudança em `streak.ts`/`achievements.ts`/`AchievementsCard.tsx`/
  `StreakCard.tsx` — confirmado.
- Ocultar cards de trimestre/semestre quando marco é recente — decisão
  visual pós-deploy.
- Múltiplos marcos (um por meta) — marco global no profile.
- Gate server-side via RLS/constraint — padrão do projeto é gate visual +
  PlanGate client (seção 4.1).
- Qualquer mudança em `goals_history`, `resolveGoalsForPeriod`, thresholds,
  `computeTrend`.

---

## 8. Ordem de execução

1. Confirmar constraint name e último migration number no Supabase Dashboard.
2. Rodar migration `0013_period_anchor.sql`, cada bloco separado.
3. Atualizar `supabase/schema.sql` (referência).
4. Atualizar `src/types/database.ts` (seção 2).
5. Atualizar `src/lib/analytics.ts` — `PeriodContext` + `buildPeriodContext`
   + `periodStart` + `periodLengthDays` + `computePeriodKpi` +
   `computeAllKpis` (seções 3.1–3.5).
6. Atualizar `src/lib/loadUserData.ts` fallback (seção 4.2).
7. Atualizar `src/components/SettingsForm.tsx` — state + copy + card + date
   picker + prop + validate + persist (seções 5.1–5.5).
8. Atualizar `src/app/(app)/dashboard/settings/page.tsx` caller (seção 5.6).
9. Atualizar os 7 callers de `computeAllKpis` (seção 6), na ordem:
   dashboard → reports → prediction → coach → export/pdf → export/report-pdf
   → internos de analytics.ts.
10. `npx tsc --noEmit` e `npm run build`.

---

## 9. Checklist de teste manual

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta Free: card "A partir de uma data" aparece com badge "(Pro)",
      desabilitado, link leva para `/dashboard/upgrade`. Seção inteira de
      período continua `opacity-50 pointer-events-none` no free.
- [ ] Conta Pro: seleciona "A partir de uma data" → date picker aparece →
      tenta salvar sem preencher data → `setError("Escolha uma data de
      início.")`.
- [ ] Conta Pro: tenta salvar data futura → `setError("A data de início
      não pode ser no futuro.")`.
- [ ] Conta Pro: preenche marco (ex.: 27/08/2026, com pesagens antes e
      depois dessa data) → salva → modal de confirmação → confirma → 4 KPIs
      no dashboard recalculam com marco como início.
- [ ] `WeightChart` continua mostrando pesagens anteriores ao marco.
- [ ] `/dashboard/prediction`: previsão calculada com KPI do modo
      `anchored`.
- [ ] `/dashboard/reports`: KPIs consistentes com dashboard.
- [ ] `/dashboard/coach/[ownerId]`: coach vê KPIs consistentes.
- [ ] Exportação PDF (`/api/export/pdf`): `period_mode='anchored'` não
      quebra, `period_anchor_date` incluído no select.
- [ ] Exportação Report PDF (`/api/export/report-pdf`): idem.
- [ ] Trocar de `anchored` para `fixed`/`rolling` e voltar: marco anterior
      preservado.
- [ ] Streak e Conquistas: sem mudança de comportamento.
- [ ] Tema claro/escuro: card e date picker usam tokens.
- [ ] Mobile: 3 cards empilhados, copy mais longa não quebra layout.
- [ ] Multi-goal (Fase 6.2): 2+ metas ativas + modo `anchored` — `kpisByGoal`
      calcula corretamente por meta com o mesmo marco global.

---

## Apêndice A — Achados da auditoria (v2 → v3)

1. **Assinatura real de `computeAllKpis`/`computePeriodKpi` confirmada.**
   O 1º parâmetro é `points: EntryPoint[]` (não `entries: WeightEntry[]`),
   e `unit: string = "kg"` é o 7º/6º param posicional respectivamente.
   A spec v2 já mostrava a assinatura correta na seção 0.2, mas a v1 não.
   Nenhuma correção necessária na v3, mas o achado resolve a pendência #5
   do Apêndice A da v2.

2. **`api/export/pdf/route.tsx` confirmado já em formato multi-goal.**
   Usa `effectiveGoals.map(...)` com `computeAllKpis` dentro. O diff da
   seção 6.5 da v2 precisava do formato correto — já estava certo
   (construção inline de `PeriodContext`, não `buildPeriodContext`). Resolve
   pendência #6 da v2.

3. **`api/export/report-pdf/route.tsx` — rota encontrada pela primeira vez.**
   Não estava em nenhuma spec anterior. Mesmo pattern de `export/pdf` (query
   própria, `computeAllKpis` com params posicionais, sem `loadUserData`).
   Adicionado como seção 6.6 — sem isso, a exportação de relatório em PDF
   ficaria com `period_mode` desincronizado.

4. **Nomes de state e props de `SettingsForm.tsx` confirmados linha a
   linha:** `mode`/`setMode` (state, tipo `PeriodMode`), `weekStart`/
   `setWeekStart` (state, tipo `WeekStartsOn`), `plan` (prop, já existente
   desde Fase 7). O `.update()` é `supabase.from("profiles").update({...})`
   direto (client-side, não Server Action). `ConfirmDialog` abre quando
   `mode !== periodMode` (prop). Resolve pendência #7 da v2.

5. **Validação é client-side, não Server Action.** O `SettingsForm`
   confirmado como `"use client"`, update direto ao Supabase (mesmo padrão
   de `GoalsForm`/`BodyMeasurementForm`, documentado no `CLAUDE.md`). Seção
   4.1 reescrita para refletir o mecanismo real (client-side validate +
   update, não Server Action).

6. **`settings/page.tsx` já passa `plan`** — confirmado. Só falta
   `periodAnchorDate`. Adicionado na seção 5.6.
