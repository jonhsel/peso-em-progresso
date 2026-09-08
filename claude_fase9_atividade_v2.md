# Fase 9 — Atividade Física (v2, auditada)

**Status:** v2. Auditada contra o código real via `project_knowledge_search`
(`Sidebar.tsx`, `loadUserData.ts`, `PlanGate.tsx`, `database.ts`,
`GoalsForm.tsx`, `BodyMeasurementsSummaryCard.tsx`, `analytics.ts`,
`schema.sql`, `dashboard/page.tsx`, `challenges/page.tsx`,
`achievements/page.tsx`, migrações 0001–0014, `package.json`). Todos os
achados da auditoria v1 (Apêndice A) incorporados. Pronta para handoff ao
Claude Code.

Fase nova, paralela à Fase 8 (Navegação/UX) — não depende dela terminar.

---

## Contexto

Adiciona registro de atividade física (caminhada, musculação, ou qualquer
tipo que o usuário nomear) como um sistema **paralelo** ao de `goals`
existente — não uma extensão do `GoalMetric`. Motivo: `goals`/`Goal`
resolve "onde estou vs. onde deveria estar" via regressão linear até um
alvo (peso, cintura, etc. — grandezas que sobem/descem e comparam com uma
trajetória esperada). Atividade é acumulação dentro do período (soma de
minutos até bater uma meta semanal) — modelo de KPI diferente, mais
parecido com "quantos km você já andou este mês" do que "seu peso está
adiantado ou atrasado".

## Decisões fechadas

1. **Tipos de atividade extensíveis** — usuário cria seus próprios tipos
   (ex: "Caminhada", "Musculação", "Yoga", "Corrida"), não uma lista fixa.
   Mesmo padrão de "templates fixos + customizado" já usado em Desafios
   (Fase 6.3) — o MVP vem com 2 tipos pré-criados no signup ("Caminhada",
   "Musculação") que o usuário edita/remove/adiciona livremente.
2. **Múltiplas sessões por dia** — cada registro tem timestamp próprio
   (`performed_at`), não é upsert por dia como Fotos/Medidas.
3. **Meta semanal por tipo** — cada tipo de atividade tem sua própria meta
   de minutos/semana (não uma meta global somando tudo).
4. **Pro-only** — página inteira atrás de `PlanGate`, mesmo padrão de
   Medidas Corporais e Fotos de Progresso.
5. **Teaser no Dashboard** — card resumido mostrando progresso da semana
   por tipo de atividade, com link pra `/dashboard/activity`.
6. **Semana de atividade = semana civil** — sempre usa
   `startOfWeek`/`endOfWeek` com `weekStartsOn` do perfil, ignora
   `period_mode` (rolling/anchored). Decisão consciente: atividade é
   acumulação semanal, não projeção de meta. Os modos de período fazem
   sentido pra KPIs de peso (onde o baseline importa), mas "corri 90 dos
   150 min esta semana" é naturalmente civil. Pode virar Fase 9.x se
   houver demanda pro modo rolling em atividade.

## Fora de escopo (explícito)

- Correlação com a tendência de peso (o "atividade explica o platô")
  discutido antes — fica pra uma fase futura, depois que os dados de
  atividade existirem de verdade pra validar a correlação.
- Integração com o `StreakCard` existente (esse é sobre check-ins de
  peso) — atividade não mexe nele nesta fase.
- Integração com Conquistas (`user_achievements`/`evaluateAchievements`)
  — pode vir depois, precisa de critérios próprios.
- Pacing "dentro do ritmo da semana" (tipo o `expectedWeightNowKg` do KPI
  de peso) — v1 mostra só total-feito vs meta-da-semana, sem projeção
  intra-semana. Pode ser Fase 9.x depois.
- Estimativa de calorias/gasto energético — decisão consciente de não
  entrar nessa precisão (mesma lógica de não fazer isso pra nutrição).
- PDF export — atividade não entra no relatório nesta fase.
- Distância só faz sentido pra alguns tipos (ex: caminhada, corrida) —
  campo opcional por tipo, não obrigatório.
- Coach: `loadCoachClientData` não carrega atividade — sem mudança.

---

## 1. Migração SQL — `supabase/migrations/0015_activity.sql`

**Confirmar antes de aplicar:** verificar no repo real que `0014` é de
fato a última migração existente (`0014_period_anchor.sql`, confirmado
pela auditoria). Se houver uma migração posterior já criada desde então,
ajustar o número.

**Nota sobre coexistência de triggers em `auth.users`:** esta migração
cria um 3º trigger `AFTER INSERT ON auth.users`
(`on_auth_user_created_activity_types`), coexistindo com
`on_auth_user_created` (`handle_new_user` — profile + conciliação Kiwify)
e `on_auth_user_created_goals` (`handle_new_user_goals` — meta de peso
padrão). Isso é o padrão do projeto: Postgres executa múltiplos triggers
do mesmo evento em ordem alfabética de nome. Os 3 triggers são
independentes entre si (não dependem de dados criados por outro), então a
ordem não importa.

**Rodar cada bloco separadamente no SQL Editor do Supabase Dashboard**
(lição documentada do projeto: multi-statement em transação única —
falha em qualquer bloco reverte tudo).

```sql
-- Bloco 1: Tipos de atividade (catálogo por usuário)
create table if not exists public.activity_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  track_distance boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists activity_types_user_id_idx
  on public.activity_types (user_id);

alter table public.activity_types enable row level security;

create policy "activity_types_select_own" on public.activity_types
  for select using (auth.uid() = user_id);
create policy "activity_types_insert_own" on public.activity_types
  for insert with check (auth.uid() = user_id);
create policy "activity_types_update_own" on public.activity_types
  for update using (auth.uid() = user_id);
create policy "activity_types_delete_own" on public.activity_types
  for delete using (auth.uid() = user_id);
```

```sql
-- Bloco 2: Sessões de atividade
create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type_id uuid not null references public.activity_types(id) on delete cascade,
  performed_at timestamptz not null default now(),
  duration_minutes numeric(5,1) not null check (duration_minutes > 0),
  distance_km numeric(6,2) check (distance_km is null or distance_km > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists activity_sessions_user_id_idx
  on public.activity_sessions (user_id, performed_at desc);
create index if not exists activity_sessions_type_id_idx
  on public.activity_sessions (activity_type_id);

alter table public.activity_sessions enable row level security;

create policy "activity_sessions_select_own" on public.activity_sessions
  for select using (auth.uid() = user_id);
create policy "activity_sessions_insert_own" on public.activity_sessions
  for insert with check (auth.uid() = user_id);
create policy "activity_sessions_update_own" on public.activity_sessions
  for update using (auth.uid() = user_id);
create policy "activity_sessions_delete_own" on public.activity_sessions
  for delete using (auth.uid() = user_id);
```

```sql
-- Bloco 3: Meta semanal por tipo (1 meta ativa por tipo — unique parcial)
create table if not exists public.activity_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type_id uuid not null references public.activity_types(id) on delete cascade,
  weekly_minutes_target numeric(5,1) not null check (weekly_minutes_target > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists activity_goals_one_active_per_type
  on public.activity_goals (activity_type_id)
  where is_active;

alter table public.activity_goals enable row level security;

create policy "activity_goals_select_own" on public.activity_goals
  for select using (auth.uid() = user_id);
create policy "activity_goals_insert_own" on public.activity_goals
  for insert with check (auth.uid() = user_id);
create policy "activity_goals_update_own" on public.activity_goals
  for update using (auth.uid() = user_id);
create policy "activity_goals_delete_own" on public.activity_goals
  for delete using (auth.uid() = user_id);
```

```sql
-- Bloco 4: Seed de 2 tipos padrão no signup
create or replace function public.handle_new_user_activity_types()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.activity_types (user_id, name, track_distance) values
    (new.id, 'Caminhada', true),
    (new.id, 'Musculação', false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_activity_types on auth.users;
create trigger on_auth_user_created_activity_types
  after insert on auth.users
  for each row execute procedure public.handle_new_user_activity_types();
```

Também atualizar `supabase/schema.sql` (referência, não executado) com as
3 tabelas, índices, RLS, e o trigger, no padrão das seções existentes.

---

## 2. Tipos — `src/types/database.ts`

### 2.1 Novos tipos

Inserir antes do bloco `export type Database = {`:

```ts
export type ActivityType = {
  id: string;
  user_id: string;
  name: string;
  track_distance: boolean;
  created_at: string;
};

export type ActivitySession = {
  id: string;
  user_id: string;
  activity_type_id: string;
  performed_at: string; // ISO datetime
  duration_minutes: number;
  distance_km: number | null;
  note: string | null;
  created_at: string;
};

export type ActivityGoal = {
  id: string;
  user_id: string;
  activity_type_id: string;
  weekly_minutes_target: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
```

### 2.2 Registrar em `Database["public"]["Tables"]`

Dentro do bloco `Tables: { ... }`, depois de `coach_links`, adicionar:

```ts
      activity_types: {
        Row: ActivityType;
        Insert: Partial<ActivityType> & { user_id: string; name: string };
        Update: Partial<ActivityType>;
        Relationships: [];
      };
      activity_sessions: {
        Row: ActivitySession;
        Insert: Partial<ActivitySession> & {
          user_id: string;
          activity_type_id: string;
          duration_minutes: number;
        };
        Update: Partial<ActivitySession>;
        Relationships: [];
      };
      activity_goals: {
        Row: ActivityGoal;
        Insert: Partial<ActivityGoal> & {
          user_id: string;
          activity_type_id: string;
          weekly_minutes_target: number;
        };
        Update: Partial<ActivityGoal>;
        Relationships: [];
      };
```

---

## 3. `src/lib/activity.ts` (novo arquivo — paralelo a `analytics.ts`)

Decisão de arquitetura: **não** colocar essa lógica dentro de
`analytics.ts` — esse arquivo já é grande e é sobre a família
peso/medidas (`computeTrend`/`computePeriodKpi`/`computeGoalPrediction`).
Atividade tem seu próprio modelo de KPI (soma, não regressão), então vive
em módulo próprio.

```ts
import { startOfWeek, endOfWeek } from "date-fns";
import type { ActivitySession, ActivityGoal, ActivityType } from "@/types/database";
import type { WeekStartsOn } from "@/types/database";

export type ActivityWeeklyKpi = {
  activityTypeId: string;
  activityTypeName: string;
  trackDistance: boolean;
  actualMinutes: number;
  totalDistanceKm: number | null;
  targetMinutes: number | null; // null = sem meta ativa pra esse tipo
  progressPct: number | null;
  sessionsCount: number;
};

/**
 * Soma os minutos de sessões de um tipo dentro da semana corrente
 * (respeitando week_starts_on do perfil) e compara com a meta ativa
 * daquele tipo, se existir.
 *
 * Semana de atividade é sempre semana civil (startOfWeek/endOfWeek) —
 * não respeita period_mode (rolling/anchored). Ver decisão 6 no topo
 * da spec.
 */
export function computeActivityWeeklyKpis(
  types: ActivityType[],
  sessions: ActivitySession[],
  goals: ActivityGoal[],
  weekStartsOn: WeekStartsOn = "monday",
  now: Date = new Date()
): ActivityWeeklyKpi[] {
  const weekStartsOnNumber = weekStartsOn === "sunday" ? 0 : 1;
  const start = startOfWeek(now, { weekStartsOn: weekStartsOnNumber });
  const end = endOfWeek(now, { weekStartsOn: weekStartsOnNumber });

  return types.map((type) => {
    const typeSessions = sessions.filter((s) => {
      if (s.activity_type_id !== type.id) return false;
      const d = new Date(s.performed_at);
      return d >= start && d <= end;
    });
    const actualMinutes = typeSessions.reduce(
      (sum, s) => sum + Number(s.duration_minutes),
      0
    );
    const totalDistanceKm = type.track_distance
      ? typeSessions.reduce(
          (sum, s) => sum + (s.distance_km ? Number(s.distance_km) : 0),
          0
        )
      : null;
    const goal = goals.find(
      (g) => g.activity_type_id === type.id && g.is_active
    );
    const targetMinutes = goal ? Number(goal.weekly_minutes_target) : null;
    const progressPct =
      targetMinutes && targetMinutes > 0
        ? Math.min(100, Math.round((actualMinutes / targetMinutes) * 100))
        : null;

    return {
      activityTypeId: type.id,
      activityTypeName: type.name,
      trackDistance: type.track_distance,
      actualMinutes,
      totalDistanceKm,
      targetMinutes,
      progressPct,
      sessionsCount: typeSessions.length,
    };
  });
}
```

---

## 4. `src/lib/loadUserData.ts`

### 4.1 Import

```
OLD:
import type {
  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement, Challenge
} from "@/types/database";

NEW:
import type {
  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement, Challenge,
  ActivityType, ActivitySession, ActivityGoal
} from "@/types/database";
```

### 4.2 Promise.all — 3 queries novas (total: 10)

```
OLD:
  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }, { data: achievements }, { data: challenges }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_achievements")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("challenges")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

NEW:
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }, { data: achievements }, { data: challenges }, { data: activityTypes }, { data: activitySessions }, { data: activityGoals }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_achievements")
        .select("*")
        .eq("user_id", user.id),
      supabase
        .from("challenges")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_types")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at"),
      supabase
        .from("activity_sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("performed_at", ninetyDaysAgo)
        .order("performed_at", { ascending: false }),
      supabase
        .from("activity_goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
```

### 4.3 Return — 3 chaves novas

Dentro do `return { ... }`, depois de `challenges`:

```
OLD:
    challenges: (challenges as Challenge[]) ?? [],
  };

NEW:
    challenges: (challenges as Challenge[]) ?? [],
    activityTypes: (activityTypes as ActivityType[]) ?? [],
    activitySessions: (activitySessions as ActivitySession[]) ?? [],
    activityGoals: (activityGoals as ActivityGoal[]) ?? [],
  };
```

---

## 5. Componentes novos

### 5.1 `src/components/activity/ActivityTypeManager.tsx` (client)

`"use client"` — CRUD de tipos de atividade.

Props: `{ userId: string; types: ActivityType[] }`.

Funcionalidades:
- Listar tipos existentes com ícone de edição.
- Criar novo tipo: campo `name` (texto) + toggle `track_distance` (checkbox
  "Registrar distância"). Validação: nome não vazio, nome não duplicado
  (case-insensitive contra os tipos existentes).
- Editar tipo: mesmos campos, update por `id`.
- Excluir tipo: `window.confirm` avisando "Todas as sessões desse tipo
  serão apagadas" (cascade via FK). Delete por `id`.

Padrão de persistência: `supabase.from("activity_types").insert/update/delete`
direto do client + `router.refresh()` — mesmo padrão de `GoalsForm.tsx`,
`SettingsForm.tsx`, `BodyMeasurementForm.tsx`.

### 5.2 `src/components/activity/ActivitySessionForm.tsx` (client)

`"use client"` — formulário de registro de sessão.

Props: `{ userId: string; types: ActivityType[] }`.

Campos:
- Seletor de tipo (dropdown dos `activity_types` do usuário).
- `duration_minutes` — input numérico, obrigatório, > 0.
- `distance_km` — input numérico, só aparece se `track_distance` do tipo
  selecionado for `true`. Opcional (nullable na tabela).
- `performed_at` — `datetime-local`, default agora em São Paulo:
  `new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  minute: "2-digit" }).format(new Date()).replace(" ", "T")`.
- `note` — textarea opcional.

Validação: usa padrão `parseRequired`/`parseOptional` inline (mesma lógica
de `GoalsForm.tsx` — função local, não importada):

```ts
const parseRequired = (v: string): number => {
  const trimmed = v.trim();
  if (trimmed === "") return NaN;
  return Number(trimmed.replace(",", "."));
};

const parseOptional = (v: string): number | null => {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
```

Persistência: `supabase.from("activity_sessions").insert({ user_id, activity_type_id, duration_minutes, distance_km, performed_at, note })` + `router.refresh()`.

### 5.3 `src/components/activity/ActivityGoalForm.tsx` (client)

`"use client"` — definir/editar meta semanal por tipo.

Props: `{ userId: string; activityTypeId: string; currentGoal: ActivityGoal | null }`.

Se `currentGoal` existe: edita (update `weekly_minutes_target` por `id` +
`updated_at: new Date().toISOString()`). Senão: cria (insert).

Campo: `weekly_minutes_target` — input numérico, obrigatório, > 0.

Botão "Remover meta" quando `currentGoal` existe: update `is_active = false`
(soft delete, preserva histórico — mesma lógica de desativar meta em `goals`).

### 5.4 `src/components/activity/ActivityWeekCard.tsx` (client)

`"use client"` — cada card mostra o progresso semanal de um tipo.

Props: `{ kpi: ActivityWeeklyKpi; goal: ActivityGoal | null; userId: string; activityTypeId: string }`.

O card é client porque contém um toggle/accordion para abrir o
`ActivityGoalForm` inline (editar/criar meta sem sair do card). Se
preferir manter server com modal separado, ver alternativa; a decisão é
por simplicidade de UX (menos cliques).

Conteúdo:
- Nome do tipo (`kpi.activityTypeName`).
- Barra de progresso (`kpi.actualMinutes` / `kpi.targetMinutes`) — cor
  `accent` preenchendo proporcionalmente, fundo `base-surface2`. Usa
  classes Tailwind estáticas (`bg-accent` pra preenchimento,
  `bg-base-surface2` pra fundo, largura via `style={{ width: ... }}`).
- Texto "X de Y min esta semana" (com meta) ou "X min esta semana" (sem).
- Nº de sessões (`kpi.sessionsCount`).
- Se `kpi.trackDistance && kpi.totalDistanceKm !== null`:
  "X,X km esta semana".
- Sem meta ativa: sem barra, com CTA "Definir meta semanal" que abre o
  `ActivityGoalForm`.

### 5.5 `src/components/activity/ActivityTeaserCard.tsx` (server)

Server Component — sem interação, só `<Link>`.

Props: `{ kpis: ActivityWeeklyKpi[] }`.

Card compacto no Dashboard, mesmo estilo de
`BodyMeasurementsSummaryCard`: `<Link href="/dashboard/activity">` com
`hover:border-ink-faint`.

Conteúdo:
- Header "Atividade física" + link discreto "Ver completo →".
- Lista de até 3 tipos (os que têm mais sessões na semana, ou os que
  têm meta ativa, priorizados), cada um com mini-barra de progresso
  (altura `h-1.5`, `rounded-full`, `bg-accent` / `bg-base-surface2`) e
  texto "X/Y min" (ou "X min" sem meta).

Condição de renderização: só aparece se `kpis.length > 0 &&
(kpis.some(k => k.sessionsCount > 0) || kpis.some(k => k.targetMinutes !== null))`.
Evita card vazio pra quem nunca usou a feature ou não tem nenhum tipo.

**Nota para free:** o teaser mostra no Dashboard mas como resumo visual
mínimo, com o link apontando pra `/dashboard/activity` que tem `PlanGate`.
Mesmo padrão do `BodyMeasurementsSummaryCard` (mostra pro free, link
leva pro gate). Se quiser esconder inteiramente pro free, basta envolver
o `<ActivityTeaserCard>` em `{profile.plan === "pro" && ...}` em
`dashboard/page.tsx`.

---

## 6. Nova rota — `src/app/(app)/dashboard/activity/page.tsx`

Server Component, mesmo padrão de `dashboard/challenges/page.tsx` e
`dashboard/achievements/page.tsx` (`loadUserData()` + `getTheme()` +
`Sidebar` + `PlanGate` + wrapper `flex flex-col sm:flex-row min-h-screen`).

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { computeActivityWeeklyKpis } from "@/lib/activity";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import ActivityTypeManager from "@/components/activity/ActivityTypeManager";
import ActivitySessionForm from "@/components/activity/ActivitySessionForm";
import ActivityWeekCard from "@/components/activity/ActivityWeekCard";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const {
    user,
    profile,
    activeGoals,
    activityTypes,
    activitySessions,
    activityGoals,
  } = await loadUserData();
  const theme = await getTheme();

  const kpis = computeActivityWeeklyKpis(
    activityTypes,
    activitySessions,
    activityGoals,
    profile.week_starts_on
  );

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
          <PlanGate plan={profile.plan} featureName="Atividade Física">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Atividade Física
              </p>

              <ActivitySessionForm
                userId={user.id}
                types={activityTypes}
              />

              {kpis.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Esta semana
                  </p>
                  {kpis.map((kpi) => (
                    <ActivityWeekCard
                      key={kpi.activityTypeId}
                      kpi={kpi}
                      goal={
                        activityGoals.find(
                          (g) =>
                            g.activity_type_id === kpi.activityTypeId &&
                            g.is_active
                        ) ?? null
                      }
                      userId={user.id}
                      activityTypeId={kpi.activityTypeId}
                    />
                  ))}
                </div>
              )}

              <ActivityTypeManager
                userId={user.id}
                types={activityTypes}
              />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
```

---

## 7. `src/components/Sidebar.tsx`

### 7.1 Import do ícone

```
OLD:
import {
  LayoutDashboard,
  Scale,
  Ruler,
  Camera,
  Target,
  FileBarChart,
  TrendingUp,
  Award,
  Swords,
  Users,
  Bell,
  Download,
  Settings,
  HelpCircle,
  LogOut,
  Pencil,
  Menu,
  Lock,
} from "lucide-react";

NEW:
import {
  LayoutDashboard,
  Scale,
  Ruler,
  Camera,
  Target,
  FileBarChart,
  TrendingUp,
  Award,
  Swords,
  Users,
  Bell,
  Download,
  Activity,
  Settings,
  HelpCircle,
  LogOut,
  Pencil,
  Menu,
  Lock,
} from "lucide-react";
```

(`Activity` confirmado existente em `lucide-react@0.454.0`.)

### 7.2 Array `links` — novo item

Inserir entre "Exportar Dados" e "Configurações":

```
OLD:
  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },

NEW:
  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true },
  { href: "/dashboard/activity", label: "Atividade Física", icon: Activity, premium: true },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
```

"Configurações" continua como último item antes de "Sair", por ser
meta/sistema (não feature). "Atividade Física" fica como penúltimo item
da seção de features Pro, agrupado com os demais.

---

## 8. Dashboard — `src/app/(app)/dashboard/page.tsx`

### 8.1 Import

```
OLD:
import BodyMeasurementsSummaryCard from "@/components/BodyMeasurementsSummaryCard";

NEW:
import BodyMeasurementsSummaryCard from "@/components/BodyMeasurementsSummaryCard";
import ActivityTeaserCard from "@/components/activity/ActivityTeaserCard";
import { computeActivityWeeklyKpis } from "@/lib/activity";
```

### 8.2 Desestruturar novos campos

```
OLD:
  const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements, challenges } = await loadUserData();

NEW:
  const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements, challenges, activityTypes, activitySessions, activityGoals } = await loadUserData();
```

### 8.3 Calcular KPIs de atividade

Inserir após o bloco de `computeTrend` / `predictionsByGoal` existente:

```ts
  const activityKpis = computeActivityWeeklyKpis(
    activityTypes,
    activitySessions,
    activityGoals,
    profile.week_starts_on
  );
```

### 8.4 Inserir teaser no JSX

Inserir **depois** de `<BodyMeasurementsSummaryCard>` (último card antes
do `</main>`), mesma posição de "card menos acionável no dia a dia":

```
OLD:
        <BodyMeasurementsSummaryCard measurements={measurements} />
        </main>

NEW:
        <BodyMeasurementsSummaryCard measurements={measurements} />

        <ActivityTeaserCard kpis={activityKpis} />
        </main>
```

---

## Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Signup novo: 2 tipos padrão ("Caminhada", "Musculação") criados
      automaticamente via trigger.
- [ ] Criar tipo customizado, com e sem `track_distance` — campo distância
      só aparece no formulário de sessão quando aplicável.
- [ ] Registrar 2+ sessões no mesmo dia, tipos diferentes — ambas contam
      separadamente na soma semanal.
- [ ] Meta semanal por tipo: progresso soma corretamente, trava em 100%
      visualmente mesmo passando da meta.
- [ ] Tipo sem meta ativa: card mostra total, sem barra de progresso,
      com CTA "Definir meta semanal".
- [ ] Remover meta (soft delete `is_active = false`): card volta ao estado
      "sem meta", barra some.
- [ ] Excluir tipo com sessões associadas: confirmação avisa que as
      sessões serão apagadas; cascade funciona.
- [ ] `PlanGate`: conta Grátis não acessa `/dashboard/activity` (mostra
      card de bloqueio "Atividade Física é Pro").
- [ ] Teaser do Dashboard não aparece pra usuário sem nenhuma atividade
      registrada nem meta ativa.
- [ ] Teaser aparece com dados, link "Ver completo" navega pra
      `/dashboard/activity`.
- [ ] RLS: usuário A não consegue ler/editar tipos, sessões ou metas do
      usuário B (testar via SQL Editor com `set role` ou 2 contas reais).
- [ ] Mobile: formulário de sessão e cards de progresso responsivos; sidebar
      drawer lista "Atividade Física" com badge Pro.
- [ ] Tema claro/escuro: barra de progresso e cores respeitam tokens do
      design system (`accent` / `base-surface2`).
- [ ] Sidebar: item "Atividade Física" aparece com ícone `Activity` e
      badge "Pro" (pra free); navega corretamente pra `/dashboard/activity`.
- [ ] `week_starts_on = "sunday"`: KPI de atividade recalcula corretamente
      a semana (domingo–sábado em vez de segunda–domingo).
- [ ] Tipo com `track_distance = true`: teaser e card mostram distância
      acumulada da semana.

---

## Passos de execução sugeridos

1. Migração SQL — rodar os 4 blocos isolados no SQL Editor, confirmar
   sucesso de cada um antes de seguir.
2. `src/types/database.ts` — 3 tipos novos + `Database.Tables`.
3. `src/lib/activity.ts` — novo arquivo.
4. `src/lib/loadUserData.ts` — import + 3 queries + 3 chaves no return.
5. Componentes (seção 5), na ordem:
   - `ActivityGoalForm` (mais simples, sem dependência)
   - `ActivityWeekCard` (depende de `ActivityGoalForm`)
   - `ActivitySessionForm`
   - `ActivityTypeManager`
   - `ActivityTeaserCard`
6. Rota `/dashboard/activity` (seção 6).
7. `Sidebar.tsx` (seção 7) — import `Activity` + item no array.
8. `dashboard/page.tsx` (seção 8) — import + desestruturar + calcular +
   teaser.
9. `npx tsc --noEmit` e `npm run build`.
10. Atualizar `supabase/schema.sql` (referência).
11. Deploy e validação em produção (checklist acima).
12. Atualizar `CLAUDE.md` com seção da Fase 9.

---

## Apêndice A — O que mudou da v1 pra v2

| # | Achado | Resolução |
|---|--------|-----------|
| A1 | Número da migração errado (`0013`). `0013` e `0014` já existem. | Renumerado pra `0015`. |
| A2 | Trigger de seed em `auth.users`: documentar coexistência. | Nota explícita adicionada na seção 1 sobre 3 triggers coexistindo. |
| A3 | `loadUserData.ts`: faltava diff verbatim com OLD/NEW. | Seção 4 com diff completo (import + Promise.all + return). |
| A4 | `loadUserData.ts`: faltava cast e fallback no return. | 3 chaves com `as Type[]` e `?? []` no return (seção 4.3). |
| A5 | `Database["public"]["Tables"]`: faltava shape completo. | 3 blocos completos (`Row`, `Insert`, `Update`, `Relationships`) na seção 2.2. |
| A6 | Sidebar: diff desatualizado (assumia `comingSoon` em itens já implementados). | Diff contra array real atual confirmado (sem `comingSoon` em nenhum item); item novo inserido entre "Exportar Dados" e "Configurações" (seção 7.2). |
| A7 | `WeekStartsOn` importado do lugar errado (`analytics.ts` vs `database.ts`). | Import corrigido pra `from "@/types/database"` em `activity.ts` (seção 3). |
| A8 | `startOfWeek` vs `periodStart`: inconsistência com modos rolling/anchored. | Decisão fechada e documentada (decisão 6): atividade sempre usa semana civil, independente de `period_mode`. Nota no topo da spec e no docstring de `computeActivityWeeklyKpis`. |
| A9 | `ActivityWeekCard` marcado server mas precisa de interação. | Trocado pra client (`"use client"`) com toggle inline pro `ActivityGoalForm` (seção 5.4). |
| A10 | `ActivityTeaserCard` server vs client. | Confirmado server — é só `<Link>`, sem interação (seção 5.5). |
| A11 | Posição do teaser no dashboard não especificada. | Posição exata: depois de `BodyMeasurementsSummaryCard`, antes do `</main>`, com diff OLD/NEW (seção 8.4). |
| A12 | `activity_goals.updated_at` sem trigger. | Mantido sem trigger (mesmo padrão de `goals.updated_at` — client envia `updated_at` no update). Documentado como decisão consciente, consistente com achado pendente 7 da auditoria original do projeto. |
| A13 | Ícone `Activity` do `lucide-react`. | Confirmado existente em `lucide-react@0.454.0`. |
| A16 | Faltava wrapper completo da página. | JSX completo de `activity/page.tsx` na seção 6 com `flex flex-col sm:flex-row min-h-screen` + `Sidebar` + `PlanGate`. |
| A17 | Faltava `export const dynamic = "force-dynamic"`. | Adicionado na seção 6. |
| A20 | `distance_km numeric` sem precisão. | Corrigido pra `numeric(6,2)`. |
| A21 | `duration_minutes numeric` sem precisão. | Corrigido pra `numeric(5,1)`. |
| — | `activity.ts`: `ActivityWeeklyKpi` ganhou `trackDistance` e `totalDistanceKm`. | Campos novos pra suportar a distância acumulada no teaser e no card semanal. |
| — | Coach (`loadCoachClientData`): não carrega atividade. | Documentado em "Fora de escopo". |
| — | Blocos SQL separados. | Cada tabela em bloco próprio (4 blocos) pra respeitar a regra de execução isolada do projeto. |
