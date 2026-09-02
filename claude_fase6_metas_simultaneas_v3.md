# Fase 6.2 — Múltiplas metas simultâneas (spec v3)

**Status:** v3, resultado de 2ª auditoria completa contra o repositório
real (`github.com/jonhsel/peso-em-progresso`, branch padrão). Substitui
v1 e v2 — apagar os dois arquivos anteriores.

Segundo item da Fase 6 (Ticket alto): Múltiplas metas simultâneas
(generalizar `lib/analytics.ts`).

---

## 1. Decisões fechadas com o usuário

1. "Metas simultâneas" cobre múltiplos pesos-alvo com ritmos diferentes
   **e** metas de métricas diferentes (peso, cintura, quadril, braço,
   %gordura) rodando ao mesmo tempo.
2. Sem meta "principal" no dashboard: os 4 KPIs são recalculados
   independentemente pra **cada meta ativa**.
3. **Limite de 3 metas ativas simultâneas por usuário.**
4. Cada meta mantém o modelo de 4 campos de ritmo de hoje
   (semanal/mensal/trimestral/semestral), generalizados pra unidade da
   métrica (kg peso, cm cintura/quadril/braço, p.p. %gordura).
5. Dashboard usa **abas/seletor por meta** pros 4 cards de KPI.
6. `WeightChart` mostra **1 linha "esperado" por meta de peso ativa**,
   cores diferentes.
7. **Relatórios, export em PDF e Conquistas também generalizam** pra
   múltiplas metas nesta mesma sub-fase.

## 2. Decisões técnicas (não-negociáveis, travadas na auditoria)

- **`PeriodKpi` mantém os nomes de campo em `*Kg`** (`targetLossKg`,
  `baselineWeightKg`, etc.) — não renomear. O conteúdo é genérico, o
  nome é herança histórica. Débito técnico registrado.
- **`WeightChart` lê cores em runtime via `getComputedStyle`** — Recharts
  não aceita `className`. Os tokens `signal-*` já são hex fixo nos dois
  temas (confirmado em `tailwind.config`); não precisa de CSS var nova.
- **Conquistas não ganham badges novos por métrica** (seção 3 do v2
  mantida). `evaluateAchievements` avalia só regras de peso, contra a
  meta de peso mais antiga ativa.
- Sem suporte a direção da meta (perder/ganhar/manter) — fase futura.

## 3. Inventário completo de arquivos impactados

A 2ª auditoria contra o repo revelou que o v2 tinha esquecido 4 arquivos.
Lista completa abaixo — **nenhum arquivo fora desta lista deve ser
assumido como "não precisa de patch"**:

### Banco
1. `supabase/migrations/0009_multi_goals.sql` (novo)
2. `supabase/schema.sql` (atualizar pra refletir estado final)

### Tipos
3. `src/types/database.ts`

### Lógica
4. `src/lib/analytics.ts`
5. `src/lib/loadUserData.ts`
6. `src/lib/achievements.ts`

### Componentes — dashboard
7. `src/components/GoalTabs.tsx` (novo)
8. `src/components/KpiCard.tsx`
9. `src/components/KpiWeeklyTeaser.tsx` ← **NOVO no v3**
10. `src/components/WeightChart.tsx`
11. `src/components/GoalsForm.tsx` ← **CORRIGIDO no v3**
12. `src/components/GoalsHistoryList.tsx` ← **NOVO no v3**
13. `src/components/AchievementsCard.tsx`
14. `src/app/(app)/dashboard/page.tsx`
15. `src/app/(app)/dashboard/goals/page.tsx`

### Componentes — relatórios
16. `src/app/(app)/dashboard/reports/page.tsx`
17. `src/app/(app)/dashboard/reports/ReportsClient.tsx`

### PDF — export geral
18. `src/app/api/export/pdf/route.tsx`
19. `src/lib/pdf/ExportDocument.tsx`

### PDF — relatório por período ← **NOVOS no v3**
20. `src/app/api/export/report-pdf/route.tsx`
21. `src/lib/pdf/ReportDocument.tsx`

### Onboarding
22. `src/components/onboarding/OnboardingFlow.tsx`

---

## 4. Migração de banco — `supabase/migrations/0009_multi_goals.sql`

Sem mudança em relação ao v2. DDL completo:

```sql
-- 1. Nova coluna de identidade própria (goals deixa de ser singleton)
alter table public.goals
  add column if not exists id uuid not null default gen_random_uuid();

-- 2. Métrica da meta
alter table public.goals
  add column if not exists metric text not null default 'weight'
    check (metric in ('weight', 'waist', 'hip', 'arm', 'body_fat'));

-- 3. Flag de ativa
alter table public.goals
  add column if not exists is_active boolean not null default true;

-- 4. Rótulo opcional
alter table public.goals
  add column if not exists label text;

-- 5. created_at
alter table public.goals
  add column if not exists created_at timestamptz not null default now();

-- 6. Renomear campos de ritmo pra nomes genéricos
alter table public.goals rename column weekly_loss_kg to weekly_rate;
alter table public.goals rename column monthly_loss_kg to monthly_rate;
alter table public.goals rename column quarterly_loss_kg to quarterly_rate;
alter table public.goals rename column semester_loss_kg to semester_rate;
alter table public.goals rename column target_weight_kg to target_value;

-- 7. Trocar PK
alter table public.goals drop constraint goals_pkey;
alter table public.goals add constraint goals_pkey primary key (id);

-- 8. Trava de 3 metas ativas
create or replace function public.enforce_max_active_goals()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count integer;
begin
  if new.is_active then
    select count(*) into active_count
    from public.goals
    where user_id = new.user_id
      and is_active = true
      and id <> new.id;
    if active_count >= 3 then
      raise exception 'Máximo de 3 metas ativas por usuário';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_goals_max_active on public.goals;
create trigger on_goals_max_active
  before insert or update on public.goals
  for each row execute procedure public.enforce_max_active_goals();

-- 9. Trigger de signup (reescrito — o "on conflict (user_id) do nothing"
--    original só fazia sentido com user_id como PK única)
create or replace function public.handle_new_user_goals()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.goals (user_id, metric) values (new.id, 'weight');
  return new;
end;
$$;
```

### 4.1 `goals_history` — generalização

```sql
alter table public.goals_history add column if not exists goal_id uuid;
alter table public.goals_history add column if not exists metric text not null default 'weight';

alter table public.goals_history rename column weekly_loss_kg to weekly_rate;
alter table public.goals_history rename column monthly_loss_kg to monthly_rate;
alter table public.goals_history rename column quarterly_loss_kg to quarterly_rate;
alter table public.goals_history rename column semester_loss_kg to semester_rate;
alter table public.goals_history rename column target_weight_kg to target_value;

create index if not exists goals_history_goal_id_idx
  on public.goals_history (goal_id, created_at desc);
```

Trigger (nome real confirmado na migração 0004:
`on_goals_changed_history`, função `handle_goals_history_sync`):

```sql
create or replace function public.handle_goals_history_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.goals_history
    (goal_id, user_id, metric, weekly_rate, monthly_rate, quarterly_rate,
     semester_rate, target_value)
  values
    (new.id, new.user_id, new.metric, new.weekly_rate, new.monthly_rate,
     new.quarterly_rate, new.semester_rate, new.target_value);
  return new;
end;
$$;
```

## 5. Tipos (`src/types/database.ts`)

```diff
-export type Goals = {
-  user_id: string;
-  weekly_loss_kg: number;
-  monthly_loss_kg: number;
-  quarterly_loss_kg: number;
-  semester_loss_kg: number;
-  target_weight_kg: number | null;
-  updated_at: string;
-};
+export type GoalMetric = "weight" | "waist" | "hip" | "arm" | "body_fat";
+
+export type Goal = {
+  id: string;
+  user_id: string;
+  metric: GoalMetric;
+  label: string | null;
+  weekly_rate: number;
+  monthly_rate: number;
+  quarterly_rate: number;
+  semester_rate: number;
+  target_value: number | null;
+  is_active: boolean;
+  created_at: string;
+  updated_at: string;
+};

-export type GoalsHistoryEntry = {
-  id: string;
-  user_id: string;
-  weekly_loss_kg: number;
-  monthly_loss_kg: number;
-  quarterly_loss_kg: number;
-  semester_loss_kg: number;
-  target_weight_kg: number | null;
-  created_at: string;
-};
+export type GoalsHistoryEntry = {
+  id: string;
+  goal_id: string;
+  user_id: string;
+  metric: GoalMetric;
+  weekly_rate: number;
+  monthly_rate: number;
+  quarterly_rate: number;
+  semester_rate: number;
+  target_value: number | null;
+  created_at: string;
+};
```

`Database["public"]["Tables"]` ajustar `goals` (`Row: Goal`,
`Insert: Partial<Goal> & { user_id: string; metric: GoalMetric }`,
`Update: Partial<Goal>`) e `goals_history`
(`Insert` com `weekly_rate`/`monthly_rate`/etc. obrigatórios em vez dos
nomes antigos `weekly_loss_kg`/etc.).

### 5.1 Todos os imports de `Goals` (singular, antigo) a trocar

Confirmados na 2ª auditoria — lista exaustiva:

| Arquivo | Import/uso |
|---|---|
| `src/lib/loadUserData.ts` | `import type { Goals, ... }` → `Goal`; `.single()` → array; fallback |
| `src/components/GoalsForm.tsx` | `import type { Goals }` → `Goal`; prop `goals: Goals` → `goal: Goal` |
| `src/components/AchievementsCard.tsx` | `import type { Goals, ... }` → `Goal`; prop `goals: Goals` → `primaryWeightGoal: Goal \| null` |
| `src/lib/achievements.ts` | `import type { Goals, ... }` → `Goal`; param `goals: Goals` → `primaryWeightGoal: Goal \| null` |
| `src/app/api/export/pdf/route.tsx` | `import type { Goals, ... }` → `Goal`; `DEFAULT_GOALS` |
| `src/app/api/export/report-pdf/route.tsx` | `import type { Goals, ... }` → `Goal`; `DEFAULT_GOALS`; `.single()` |
| `src/types/database.ts` | `Database.Tables.goals.Row: Goals` → `Goal` |

Nenhum outro arquivo importa `Goals`.

## 6. `src/lib/analytics.ts` — generalização

### 6.1 Constantes e tipos atualizados

```diff
-type GoalFieldKey = "weekly_loss_kg" | "monthly_loss_kg" | "quarterly_loss_kg" | "semester_loss_kg";
+type GoalFieldKey = "weekly_rate" | "monthly_rate" | "quarterly_rate" | "semester_rate";

 const GOAL_FIELD: Record<Period, GoalFieldKey> = {
-  week: "weekly_loss_kg",
-  month: "monthly_loss_kg",
-  quarter: "quarterly_loss_kg",
-  semester: "semester_loss_kg",
+  week: "weekly_rate",
+  month: "monthly_rate",
+  quarter: "quarterly_rate",
+  semester: "semester_rate",
 };
```

### 6.2 `extractMetricPoints` (novo)

```ts
import type { GoalMetric, BodyMeasurement } from "@/types/database";

export function extractMetricPoints(
  metric: GoalMetric,
  weightEntries: WeightEntry[],
  measurements: BodyMeasurement[]
): EntryPoint[] {
  if (metric === "weight") return toPoints(weightEntries);
  const field: Record<Exclude<GoalMetric, "weight">, keyof BodyMeasurement> = {
    waist: "waist_cm",
    hip: "hip_cm",
    arm: "arm_cm",
    body_fat: "body_fat_pct",
  };
  const key = field[metric];
  return measurements
    .filter((m) => m[key] != null)
    .map((m) => ({ date: parseISO(m.measured_at), weight: Number(m[key]) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
```

### 6.3 `computePeriodKpi` — assinatura e "kg" hardcoded

```diff
 export function computePeriodKpi(
-  entries: WeightEntry[],
+  points: EntryPoint[],
   goalsHistory: GoalsHistoryEntry[],
   period: Period,
   now: Date = new Date(),
   mode: PeriodMode = "fixed",
-  weekStartsOn: WeekStartsOn = "monday"
+  weekStartsOn: WeekStartsOn = "monday",
+  unit: string = "kg"
 ): PeriodKpi {
-  const points = toPoints(entries);
   const start = periodStart(period, now, mode, weekStartsOn);
```

**4 pontos exatos onde "kg" aparece hardcoded dentro de
`computePeriodKpi` (linhas reais no repo):**

```diff
   // Linha 310:
-    statusLabel = `${Math.abs(deltaVsExpected).toFixed(2)} kg à frente da meta`;
+    statusLabel = `${Math.abs(deltaVsExpected).toFixed(2)} ${unit} à frente da meta`;

   // Linha 316:
-    statusLabel = `${deltaVsExpected.toFixed(2)} kg atrás da meta`;
+    statusLabel = `${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`;

   // Linha 321:
-      ? `Ganhou ${Math.abs(actualLoss).toFixed(2)} kg no período — ${deltaVsExpected.toFixed(2)} kg atrás da meta`
+      ? `Ganhou ${Math.abs(actualLoss).toFixed(2)} ${unit} no período — ${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`

   // Linha 322:
-      : `${deltaVsExpected.toFixed(2)} kg atrás da meta`;
+      : `${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`;
```

Mesma troca na mensagem de status "caution" sem dados (linhas 304-307) —
"Sem pesagens registradas" / "Sem pesagem recente..." ficam generalizados
pra "Sem registros" / "Sem registro recente para servir de referência"
(evita dizer "pesagem" pra meta de cintura).

### 6.4 `computeAllKpis` — mesma mudança de assinatura

```diff
 export function computeAllKpis(
-  entries: WeightEntry[],
+  points: EntryPoint[],
   goalsHistory: GoalsHistoryEntry[],
   now: Date = new Date(),
   mode: PeriodMode = "fixed",
-  weekStartsOn: WeekStartsOn = "monday"
+  weekStartsOn: WeekStartsOn = "monday",
+  unit: string = "kg"
 ): PeriodKpi[] {
   return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
-    computePeriodKpi(entries, goalsHistory, p, now, mode, weekStartsOn)
+    computePeriodKpi(points, goalsHistory, p, now, mode, weekStartsOn, unit)
   );
 }
```

### 6.5 `computeGoalPrediction` — trocar param name

```diff
 export function computeGoalPrediction(
   trend: TrendResult,
   kpi: PeriodKpi,
-  targetWeightKg: number | null
+  targetValue: number | null
 ): GoalPrediction {
   // corpo idêntico, só trocando `targetWeightKg` → `targetValue`
 }
```

### 6.6 Helpers novos

```ts
export const METRIC_UNIT: Record<GoalMetric, string> = {
  weight: "kg", waist: "cm", hip: "cm", arm: "cm", body_fat: "p.p.",
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  weight: "Peso", waist: "Cintura", hip: "Quadril", arm: "Braço", body_fat: "% Gordura",
};

export function getPrimaryWeightGoal(activeGoals: Goal[]): Goal | null {
  return activeGoals
    .filter((g) => g.metric === "weight")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
}
```

`computeTrend`/`computeMovingAverage` — **sem mudança** (exclusivos de
peso, fora de escopo).

## 7. `src/lib/loadUserData.ts`

```diff
 import type {
-  Goals, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
+  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
 } from "@/types/database";

   // ...dentro do Promise.all:
-  supabase.from("goals").select("*").eq("user_id", user.id).single(),
+  supabase.from("goals").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at"),

   // ...no return:
-    goals: (goals as Goals) ?? ({ ... } as Goals),
+    activeGoals: (activeGoals as Goal[]) ?? [],
```

`measurements` já é buscado — sem query nova.

Fallback de `goalsHistory`: manter o array vazio/fallback sintético, mas
agora montado a partir de cada meta em `activeGoals` se `goalsHistory`
vier vazio.

## 8. Patches por componente/rota

### 8.1 `dashboard/page.tsx`

```diff
- const { user, profile, entries, measurements, goals, goalsHistory, achievements } = await loadUserData();
+ const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements } = await loadUserData();
+ import { extractMetricPoints, computeAllKpis, computeTrend, computeGoalPrediction, getPrimaryWeightGoal, METRIC_UNIT } from "@/lib/analytics";

- const kpis = computeAllKpis(entries, goalsHistory, new Date(), profile.period_mode, profile.week_starts_on);
+ const kpisByGoal: Record<string, PeriodKpi[]> = Object.fromEntries(
+   activeGoals.map((goal) => {
+     const points = extractMetricPoints(goal.metric, entries, measurements);
+     const history = goalsHistory.filter((h) => h.goal_id === goal.id);
+     return [goal.id, computeAllKpis(points, history, new Date(), profile.period_mode, profile.week_starts_on, METRIC_UNIT[goal.metric])];
+   })
+ );
+ const primaryWeightGoal = getPrimaryWeightGoal(activeGoals);
```

- `<GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={...} />`
  substitui o grid fixo de `KpiCard` (linhas 97-110 de hoje).
- `<AchievementsCard>` recebe `primaryWeightGoal` em vez de `goals`.
- `<WeightChart>` recebe `weightGoals` array (ver 8.6).
- `<KpiWeeklyTeaser>` recebe o `weekKpi` da meta de peso mais antiga
  (ver 8.5).

### 8.2 `GoalTabs.tsx` (novo)

Sem mudança em relação ao v2. Client component, abas visíveis só quando
`goals.length > 1`, grid de 4 `KpiCard` trocando por `activeId`.

`KpiCard` recebe `unit` extra pra generalizar "kg" → unidade certa:

```diff
 export default function KpiCard({
   kpi,
   prediction,
+  unit = "kg",
 }: {
   kpi: PeriodKpi;
   prediction?: GoalPrediction;
+  unit?: string;
 }) {
```

### 8.3 `KpiCard.tsx` — **3 pontos exatos de "kg" hardcoded** (linhas reais)

```diff
   // Linha 41:
-  <span className="text-sm text-ink-faint">/ -{kpi.targetLossKg.toFixed(2)} kg meta</span>
+  <span className="text-sm text-ink-faint">/ -{kpi.targetLossKg.toFixed(2)} {unit} meta</span>

   // Linha 57:
-  Hoje você está em <span ...>{kpi.currentWeightKg?.toFixed(1)} kg</span>{" "}
+  Hoje você está em <span ...>{kpi.currentWeightKg?.toFixed(1)} {unit}</span>{" "}

   // Linha 58:
-  · esperado pela meta: <span ...>{kpi.expectedWeightNowKg.toFixed(1)} kg</span>
+  · esperado pela meta: <span ...>{kpi.expectedWeightNowKg.toFixed(1)} {unit}</span>
```

**Linha 79** — prediction text no JSX:

```diff
-  <>Meta de peso já alcançada! 🎉</>
+  <>Meta já alcançada! 🎉</>
```

**Linha 73** — prediction "sem dados suficientes":

```diff
-  <>Sem dados suficientes para projetar (mínimo 2 pesagens nos últimos 21 dias).</>
+  <>Sem dados suficientes para projetar (mínimo 2 registros nos últimos 21 dias).</>
```

### 8.4 `KpiWeeklyTeaser.tsx` — **NOVO no v3**

Este componente ficou fora do v2. Ele mostra um teaser do `weekKpi`
acima do gráfico (dashboard, linha 84) com textos tipo "você está à
frente da meta semanal".

Com múltiplas metas, **usar o `weekKpi` da meta de peso mais antiga**
(mesma que alimenta o `WeightChart` e as conquistas). Se não houver meta
de peso ativa, esconder o teaser.

```diff
- {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
+ {primaryWeekKpi && <KpiWeeklyTeaser kpi={primaryWeekKpi} />}
```

Dentro do componente, o texto de `STATUS_VERB` diz "meta semanal"
(genérico o suficiente) — não precisa de mudança. O label
"Registre pesagens para ver..." pode virar "Registre dados para ver..." se
quiser generalizar pra métricas não-peso, mas como o teaser está
amarrado à meta de peso primária, **deixar como está é aceitável**.

### 8.5 `GoalsForm.tsx` — **BUG CORRIGIDO no v3**

O v2 mencionava o `GoalsForm` no inventário genérico mas não tratava o
ponto crítico: **linha 80 faz `upsert` com `onConflict: "user_id"`**,
que quebra com `user_id` deixando de ser PK/unique.

O `GoalsForm` precisa ser refatorado pra receber **1 meta individual**
como prop (não mais o singleton) e fazer `update` por `goal.id`:

```diff
- export default function GoalsForm({ userId, goals }: { userId: string; goals: Goals }) {
+ export default function GoalsForm({ userId, goal }: { userId: string; goal: Goal }) {

   // ...nos useState iniciais:
-  const [weekly, setWeekly] = useState(String(goals.weekly_loss_kg));
-  const [monthly, setMonthly] = useState(String(goals.monthly_loss_kg));
-  const [quarterly, setQuarterly] = useState(String(goals.quarterly_loss_kg));
-  const [semester, setSemester] = useState(String(goals.semester_loss_kg));
-  const [target, setTarget] = useState(goals.target_weight_kg ? String(goals.target_weight_kg) : "");
+  const [weekly, setWeekly] = useState(String(goal.weekly_rate));
+  const [monthly, setMonthly] = useState(String(goal.monthly_rate));
+  const [quarterly, setQuarterly] = useState(String(goal.quarterly_rate));
+  const [semester, setSemester] = useState(String(goal.semester_rate));
+  const [target, setTarget] = useState(goal.target_value ? String(goal.target_value) : "");

   // ...no submit:
-  const payload = { user_id: userId, weekly_loss_kg: w, ..., target_weight_kg: t, updated_at: ... };
-  const { error: supaError } = await supabase.from("goals").upsert(payload, { onConflict: "user_id" });
+  const payload = { weekly_rate: w, monthly_rate: m, quarterly_rate: q, semester_rate: s, target_value: t, updated_at: new Date().toISOString() };
+  const { error: supaError } = await supabase.from("goals").update(payload).eq("id", goal.id);
```

Labels do formulário também precisam generalizar "kg" pra a unidade da
métrica: `METRIC_UNIT[goal.metric]` em vez de "kg" fixo nos placeholders
e labels das `<Field>` (linhas 100-104).

O **gerenciador de lista** (listar as até 3 metas ativas, com
editar/desativar/adicionar) pode ser um componente wrapper
`GoalsManager.tsx` que renderiza 1 `GoalsForm` por meta selecionada +
lista das metas + botão "Adicionar". Ou pode ser refatorado dentro de
`dashboard/goals/page.tsx`. **Decisão de arquitetura de arquivo fica pro
Claude Code** — o que importa é que:

- Lista mostra as metas ativas como cards resumidos.
- "Editar" abre o `GoalsForm` com aquela meta.
- "Desativar" faz `update goals set is_active = false where id = ...`
  com `window.confirm` antes.
- "Adicionar meta" (se `activeGoals.length < 3`) cria uma nova linha
  com `<select>` de métrica.
- Se `activeGoals.length >= 3`, botão desabilitado com tooltip.

### 8.6 `GoalsHistoryList.tsx` — **NOVO no v3**

O v2 não mencionava esse componente. Ele tem "kg" e os nomes de campo
antigos hardcoded nas linhas 40-42:

```diff
   // Linha 40-42:
-  {g.weekly_loss_kg} kg/semana · {g.monthly_loss_kg} kg/mês ·{" "}
-  {g.quarterly_loss_kg} kg/trimestre · {g.semester_loss_kg} kg/semestre
-  {g.target_weight_kg ? ` · alvo ${g.target_weight_kg} kg` : ""}
+  {g.weekly_rate} {unit}/semana · {g.monthly_rate} {unit}/mês ·{" "}
+  {g.quarterly_rate} {unit}/trimestre · {g.semester_rate} {unit}/semestre
+  {g.target_value ? ` · alvo ${g.target_value} ${unit}` : ""}
```

Recebe `unit` como prop (ou recebe `metric` e deriva via
`METRIC_UNIT[metric]`). Também filtra `history` por `goal_id` antes de
renderizar (hoje mostra tudo misturado porque era singleton).

### 8.7 `WeightChart.tsx`

Sem mudança em relação ao v2:

```diff
 export default function WeightChart({
   entries,
-  targetWeightKg,
-  weekKpi,
+  weightGoals,
 }: {
   entries: WeightEntry[];
-  targetWeightKg: number | null;
-  weekKpi: PeriodKpi | null;
+  weightGoals: { goal: Goal; weekKpi: PeriodKpi | null }[];
 }) {
```

Cores por posição (mais antiga primeiro), hex fixo:
```ts
const EXPECTED_LINE_COLORS = ["#5B6584", "#60A5FA", "#FB7185"];
const TARGET_LINE_COLORS = ["#34D399", "#60A5FA", "#FB7185"];
```

1ª meta de peso mantém exatamente as cores de hoje (`colors.axis` pro
esperado, `#34D399` pra meta) — zero mudança visual pra quem só tem
1 meta.

`data` ganha `esperado_0`, `esperado_1`, `esperado_2` (uma chave por
meta de peso), cada com a mesma matemática de interpolação (linhas
226-243) usando o respectivo `weekKpi`.

### 8.8 `AchievementsCard.tsx` + `lib/achievements.ts`

```diff
 // AchievementsCard.tsx:
-  goals: Goals;
+  primaryWeightGoal: Goal | null;

 // lib/achievements.ts:
-export function evaluateAchievements(entries: WeightEntry[], goals: Goals, existing: UserAchievement[])
+export function evaluateAchievements(entries: WeightEntry[], primaryWeightGoal: Goal | null, existing: UserAchievement[])

-  const targetWeight = goals.target_weight_kg;
+  const targetWeight = primaryWeightGoal?.target_value ?? null;
```

### 8.9 `dashboard/reports/page.tsx` + `ReportsClient.tsx`

Mesmo padrão de 8.1 — troca `goals`/`goalsHistory` únicos por
`activeGoals`/`kpisByGoal`. `ReportsClient` ganha seletor de **meta**
(abas) acima do seletor de **período** existente — 2 dimensões de
escolha. `WeightChart` dentro do `ReportsClient` recebe as mesmas
props novas de 8.7.

### 8.10 `api/export/pdf/route.tsx` + `lib/pdf/ExportDocument.tsx`

Rota isolada (não usa `loadUserData()`). Patches:

```diff
   // route.tsx — queries:
-  supabase.from("goals_history").select("*")... // hoje só busca goals_history
+  supabase.from("goals").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at"),
+  supabase.from("goals_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
+  supabase.from("body_measurements").select("*").eq("user_id", user.id).order("measured_at", { ascending: true }),
```

`ExportDocument.tsx` ganha 1 seção de KPIs por meta ativa. "kg"
hardcoded nas strings do PDF (confirmado: "Peso atual", "kg" nos
valores) — generalizar com `METRIC_UNIT[goal.metric]`.

`DEFAULT_GOALS` (fallback com nomes antigos `weekly_loss_kg`, etc.)
precisa ser atualizado pra nomes novos ou removido se `activeGoals`
vier vazio.

### 8.11 `api/export/report-pdf/route.tsx` + `lib/pdf/ReportDocument.tsx` — **NOVOS no v3**

**Estes 2 arquivos estavam completamente fora do v2.** Mesma estrutura
de isolamento do `api/export/pdf/route.tsx`, com risco idêntico de
esquecimento.

#### `report-pdf/route.tsx` (93 linhas hoje):

```diff
   // Linha 7 — import do tipo Goals antigo:
-  import type { WeightEntry, Goals, GoalsHistoryEntry, PeriodMode, WeekStartsOn } from "@/types/database";
+  import type { WeightEntry, Goal, GoalsHistoryEntry, PeriodMode, WeekStartsOn } from "@/types/database";

   // Linhas 12-18 — DEFAULT_GOALS com nomes antigos:
-  const DEFAULT_GOALS: Omit<Goals, "user_id" | "updated_at"> = {
-    weekly_loss_kg: 0.25, monthly_loss_kg: 1, quarterly_loss_kg: 3,
-    semester_loss_kg: 6, target_weight_kg: null,
-  };
+  // Atualizar pra nomes novos ou remover se desnecessário

   // Linha 45 — query com .single():
-  supabase.from("goals").select("target_weight_kg").eq("user_id", user.id).single(),
+  supabase.from("goals").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at"),

   // Linha 73 — acesso .target_weight_kg:
-  const targetWeightKg = (goals?.target_weight_kg as number | null) ?? null;
+  const primaryWeight = getPrimaryWeightGoal(activeGoals as Goal[]);
+  const targetValue = primaryWeight?.target_value ?? null;

   // Linhas 75-81 — computeAllKpis recebe entries direto:
   // Mudar pra extractMetricPoints + filter por goal_id, igual 8.1.
   // Pra simplificar esta rota (que é "relatório de 1 período"), escolher
   // a meta de peso primária e gerar KPIs só dela — coerente com o
   // comportamento de hoje que é peso-only.

   // Linha 88 — computeGoalPrediction:
-  computeGoalPrediction(computeTrend(typedEntries), kpi, targetWeightKg)
+  computeGoalPrediction(computeTrend(typedEntries), kpi, targetValue)

   // Linha 103 — prop pro ReportDocument:
-  targetWeightKg={targetWeightKg}
+  targetValue={targetValue}
```

#### `lib/pdf/ReportDocument.tsx` (250 linhas):

**4 pontos de "kg" hardcoded** (linhas reais):

```diff
   // Linha 183 — dentro do KPI box:
-  <Text style={styles.numbersTarget}>/ -{kpi.targetLossKg.toFixed(2)} kg meta</Text>
+  <Text style={styles.numbersTarget}>/ -{kpi.targetLossKg.toFixed(2)} {unit} meta</Text>

   // Linha 202:
-  Hoje você está em {kpi.currentWeightKg?.toFixed(1)} kg · esperado pela meta: {kpi.expectedWeightNowKg.toFixed(1)} kg
+  Hoje você está em {kpi.currentWeightKg?.toFixed(1)} {unit} · esperado pela meta: {kpi.expectedWeightNowKg.toFixed(1)} {unit}

   // Linha 219 — prediction text:
-  "Meta de peso já alcançada!"
+  "Meta já alcançada!"

   // SimpleWeightChart — prop targetWeightKg → targetValue (já funciona,
   // mas renomear pra consistência).
```

`ReportDocument` recebe `unit` como prop extra (default `"kg"`).

### 8.12 `OnboardingFlow.tsx`

Sem mudança em relação ao v2 — trocar `upsert` com `onConflict: "user_id"`
(linhas 59-67) por `select` da meta de peso já criada pelo trigger de
signup + `update` por `id`:

```diff
-  const { error: goalsError } = await supabase.from("goals").upsert(
-    { user_id: userId, ...deriveGoals(weekly), target_weight_kg: target, updated_at: ... },
-    { onConflict: "user_id" }
-  );
+  const { data: existingGoal } = await supabase
+    .from("goals")
+    .select("id")
+    .eq("user_id", userId)
+    .eq("metric", "weight")
+    .eq("is_active", true)
+    .order("created_at")
+    .limit(1)
+    .single();
+  const { error: goalsError } = await supabase
+    .from("goals")
+    .update({ ...deriveGoals(weekly), target_value: target, updated_at: new Date().toISOString() })
+    .eq("id", existingGoal!.id);
```

`deriveGoals()` (linhas 14-20) atualizar os nomes dos campos retornados:

```diff
 function deriveGoals(weeklyLossKg: number) {
   return {
-    weekly_loss_kg: weeklyLossKg,
-    monthly_loss_kg: Number((weeklyLossKg * 4.345).toFixed(2)),
-    quarterly_loss_kg: Number((weeklyLossKg * 13.04).toFixed(2)),
-    semester_loss_kg: Number((weeklyLossKg * 26.07).toFixed(2)),
+    weekly_rate: weeklyLossKg,
+    monthly_rate: Number((weeklyLossKg * 4.345).toFixed(2)),
+    quarterly_rate: Number((weeklyLossKg * 13.04).toFixed(2)),
+    semester_rate: Number((weeklyLossKg * 26.07).toFixed(2)),
   };
 }
```

## 9. Fora de escopo

- Direção da meta (perder/ganhar/manter) — fase futura separada.
- Tela de "metas encerradas/desativadas" (consulta via UI).
- Generalizar `computeTrend`/`computeMovingAverage` pra não-peso.
- Badges de conquista novos por métrica.
- Reordenar manualmente a ordem das abas (ordem fixa por `created_at`).
- Gate de plano (quantas metas por plano Básico/Completo) — Fase 7.
- Editar a métrica de uma meta existente (desativar + criar nova).

## 10. Checklist de teste

- [ ] Migração `0009` roda limpa; backfill preserva a meta de peso
      existente como 1 meta ativa.
- [ ] Trigger de limite de 3 rejeita a 4ª ativação.
- [ ] Trigger de signup cria meta de peso sem erro de conflito.
- [ ] Criar meta de cintura + peso: 2 abas no dashboard, KPIs com
      unidade certa (cm vs kg).
- [ ] Criar 2 metas de peso: `WeightChart` desenha 2 linhas "esperado"
      de cores diferentes; com 1 meta, visual idêntico ao de hoje.
- [ ] Desativar uma meta: some do dashboard/gráfico.
- [ ] `/dashboard/goals`: `GoalsForm` salva via `.update(..).eq("id", ...)`
      sem erro; lista mostra todas as ativas; desativar funciona.
- [ ] `KpiWeeklyTeaser` mostra status da meta de peso primária.
- [ ] `/dashboard/reports`: seletor de meta + seletor de período
      funcionam.
- [ ] Conquistas contra meta de peso primária, sem regressão.
- [ ] **PDF geral** (`/api/export/pdf`) tem seção por meta ativa.
- [ ] **PDF de relatório** (`/api/export/report-pdf`) funciona sem
      `.single()`, sem `target_weight_kg`, com nomes novos.
- [ ] `GoalsHistoryList` mostra histórico filtrado por meta com
      unidade certa.
- [ ] Onboarding (conta nova) cria 1 meta de peso, fluxo idêntico.
- [ ] RLS: isolamento entre usuários.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.

## 11. Ordem de execução sugerida

1. `0009_multi_goals.sql` (seção 4 + 4.1) no Supabase Dashboard.
2. `supabase/schema.sql`.
3. `src/types/database.ts` (seção 5).
4. `src/lib/analytics.ts` (seção 6).
5. `src/lib/loadUserData.ts` (seção 7).
6. `src/lib/achievements.ts` + `AchievementsCard.tsx` (8.8).
7. `GoalsForm.tsx` refatorado + `GoalsHistoryList.tsx` + `goals/page.tsx`
   (8.5, 8.6, 8.1).
8. `GoalTabs.tsx` novo + `KpiCard.tsx` (8.2, 8.3).
9. `KpiWeeklyTeaser.tsx` (8.4).
10. `dashboard/page.tsx` + `WeightChart.tsx` (8.1, 8.7).
11. `reports/page.tsx` + `ReportsClient.tsx` (8.9).
12. `api/export/pdf/route.tsx` + `ExportDocument.tsx` (8.10).
13. **`api/export/report-pdf/route.tsx` + `ReportDocument.tsx` (8.11).**
14. `OnboardingFlow.tsx` (8.12).
15. `npx tsc --noEmit` e `npm run build`.
16. Checklist de teste manual (seção 10).
17. Atualizar `CLAUDE.md` e `claude_fases.md`.

---

## Apêndice A — Correções da 2ª auditoria (v2 → v3)

5 problemas encontrados ao re-auditar o v2 contra o repositório real.
Todos integrados no corpo desta v3:

### Bug 1 (grave) — 2 arquivos faltando no escopo

`src/app/api/export/report-pdf/route.tsx` e
`src/lib/pdf/ReportDocument.tsx` não apareciam em nenhuma seção do v2.
Ambos leem `Goals` (tipo antigo), usam `target_weight_kg`, fazem
`.single()` em `goals`, e têm `DEFAULT_GOALS` com nomes antigos — o
Claude Code geraria build failure por tipo inexistente + campo
inexistente.

**Corrigido:** seção 8.11 nova, ambos no inventário (seção 3 itens
20-21), ambos na checklist de teste e na ordem de execução (passo 13).

### Bug 2 (grave) — `GoalsForm.tsx` upsert com `onConflict: "user_id"`

Linha 80 de `GoalsForm.tsx`:
`supabase.from("goals").upsert(payload, { onConflict: "user_id" })`.
Com `user_id` deixando de ser PK/unique, isso falha silenciosamente
(Supabase ≥2.x joga erro no `onConflict` se não há constraint unique
correspondente) ou cria duplicatas inesperadas.

**Corrigido:** seção 8.5, convertido de `upsert`+`onConflict` pra
`update`+`.eq("id", goal.id)`.

### Bug 3 (médio) — `GoalsHistoryList.tsx` com nomes antigos e "kg" fixo

Linhas 40-42 usam `g.weekly_loss_kg`, `g.monthly_loss_kg`, etc. (campos
renomeados pra `weekly_rate`/etc.) e "kg" literal (deveria ser a unidade
da métrica da meta).

**Corrigido:** seção 8.6, patch com nomes novos + `unit` como prop.

### Bug 4 (médio) — `KpiWeeklyTeaser.tsx` sem tratamento

Componente renderiza um teaser do `weekKpi` acima do gráfico. Com
múltiplas metas, qual `weekKpi` usar? O v2 não decidia.

**Corrigido:** seção 8.4, usa `weekKpi` da meta de peso primária
(mais antiga). Se não houver meta de peso, esconde o teaser.

### Bug 5 (cosmético) — pontos exatos de "kg" hardcoded não listados

O v2 dizia "trocar kg" em `analytics.ts` e `KpiCard.tsx` mas não listava
as linhas exatas (requerido pelo Claude Code pra `str_replace`
inequívoco).

**Corrigido:** seção 6.3 (4 pontos em `analytics.ts` com linhas reais)
e seção 8.3 (3 pontos em `KpiCard.tsx` com linhas reais) + seção 8.11
(4 pontos em `ReportDocument.tsx` com linhas reais).

---

## Apêndice B — Auditoria anterior (v1 → v2)

(Mantido por referência — mesma lista documentada no v2 original.)

1. PK `goals_pkey` confirmada.
2. `computePeriodKpi`/`computeAllKpis` já tinham `mode`/`weekStartsOn`.
3. Campos de `PeriodKpi` mantidos com sufixo "Kg".
4. "kg" hardcoded em `computePeriodKpi` (4 pontos).
5. Cor de `WeightChart` é runtime via `getComputedStyle`.
6. Linha "esperado" cobre só a semana atual.
7. 3 arquivos novos no escopo: `reports/page.tsx`, `ReportsClient.tsx`,
   `AchievementsCard.tsx`, `achievements.ts`.
8. `loadUserData()` já carrega `body_measurements`.
9. `handle_new_user_goals` usa `on conflict` que quebra.
10. `api/export/pdf/route.tsx` não busca `goals` hoje, só `goals_history`.
11. Conquistas (`ACHIEVEMENT_RULES`) são copy literal em kg.
