# Fase 6.3 — Desafios (spec v2)

> v2 = v1 auditada contra o código real do projeto. Achados da auditoria no
> final (Apêndice A). Todas as correções já estão incorporadas ao corpo do
> spec — rodar direto, não aplicar a v1 e depois a v2.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md` antes
> de implementar — este documento assume as convenções já estabelecidas no
> projeto (design tokens, route group `(app)`, funções puras em `src/lib/`,
> componentes Server por padrão, etc.).

---

## 0. Contexto e objetivo

Item do roadmap: "Desafios (conceito novo — ainda sem definição de regra;
especificar antes de começar)".

Diferente de metas (`goals`, ritmo contínuo sem prazo) e conquistas
(`user_achievements`, marcos que nunca expiram), um desafio é **um
compromisso pontual com prazo fixo**: "perca 2 kg em 30 dias", "registre 7
dias seguidos". Ele pode ser vencido ou perdido, e isso fica visível — dá um
motivo pra abrir o app com mais frequência que metas/conquistas.

## 1. Decisões fechadas com o usuário

1. **Dois tipos coexistindo:**
   - **Progresso** — reduzir uma métrica em X unidades até um prazo (ex.:
     "-2 kg em 30 dias", "-2 cm de cintura em 30 dias").
   - **Hábito** — registrar pesagem em N dias consecutivos (ex.: "7 dias
     seguidos").
2. **Templates fixos + criação customizada.** O usuário escolhe um template
   pronto ou define os próprios parâmetros (tipo, métrica, valor-alvo,
   duração).
3. **Camada nova, separada de metas/conquistas/streak** — tabela própria
   (`challenges`), sem reaproveitar `goals` nem `user_achievements`. Reaproveita
   **infraestrutura** (não schema): `extractMetricPoints`/`METRIC_UNIT` de
   `analytics.ts` pros desafios de progresso, a mesma regra de "dia com
   registro" de `streak.ts` pros desafios de hábito.
4. **Desafio de progresso generaliza pra qualquer métrica** (peso, cintura,
   quadril, braço, %gordura) — mesma lista de métricas da Fase 6.2 (tipo
   `GoalMetric` de `database.ts`), mesma lógica de origem de dado
   (`weight_entries` pra peso, `body_measurements` pras outras 4).
5. **UI:** card-resumo no dashboard (`ChallengesCard`, mostra desafios ativos
   + progresso) **e** página dedicada `/dashboard/challenges` (criar, listar
   ativos, ver histórico completo — concluídos e falhos).
6. **Limite de 3 desafios ativos simultâneos** (mesmo padrão do limite de 3
   metas ativas da Fase 6.2). Quando o prazo passa sem bater a meta, o
   desafio vira **`failed`** e **permanece visível no histórico** — nunca é
   apagado nem escondido.

## 2. Decisões técnicas adicionais

- **Direção sempre "redução"** — consistente com o resto do app (direção de
  meta perder/ganhar/manter é fase futura).
- **Baseline capturado na criação:** ao criar um desafio de progresso, o
  valor mais recente da métrica (na data de criação) é gravado em
  `baseline_value`. Sucesso = valor atual ≤ `baseline_value − target_value`,
  a qualquer momento antes de `end_date`. Se o usuário não tiver nenhum
  registro daquela métrica ainda, a criação é bloqueada no client com uma
  mensagem ("registre ao menos uma medição de [métrica] antes de criar esse
  desafio").
- **Desafio de hábito — regra estrita, sem tolerância:** sucesso =
  `target_value` dias consecutivos com registro em `weight_entries`, a
  partir de `start_date`, sem nenhuma falha no meio, alcançados antes de
  `end_date`. `end_date` é sempre `start_date + target_value` dias. Pular um
  dia no meio = falha imediata (`brokeEarly`). **[Auditoria #A5]** Diferente
  do streak global (que tolera 1 dia), o desafio é uma aposta explícita —
  furou, perdeu. Comportamento validado como decisão de produto.
- **Status é persistido** (`challenges.status`), não só calculado on-the-fly
  — porque "falhou" precisa sobreviver no histórico mesmo que dados sejam
  editados retroativamente. Recalculado e persistido (transições
  `active → completed`/`active → failed`) a cada carga do dashboard,
  fire-and-forget — mesmo padrão de `AchievementsCard` (confirmado:
  `"use client"`, `useEffect` com `didPersist` ref + `createClient()` dentro
  do efeito).
- **Sem notificação/e-mail** quando um desafio está perto do prazo.

## 3. Migração SQL — `supabase/migrations/0010_challenges.sql`

Número 0010: última migração existente é 0009 (`multi_goals`, Fase 6.2).

```sql
-- ---------------------------------------------------------
-- Fase 6.3 — Desafios
-- Compromissos pontuais com prazo fixo, dois tipos: progresso (reduzir uma
-- métrica em X unidades) e hábito (registrar N dias seguidos). Ver
-- claude_fase6_desafios_v2.md.
-- ---------------------------------------------------------

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('progress', 'habit')),
  metric text check (metric in ('weight', 'waist', 'hip', 'arm', 'body_fat')),
  template_key text,
  label text not null,
  target_value numeric not null check (target_value > 0),
  baseline_value numeric,
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint challenges_metric_matches_type check (
    (type = 'progress' and metric is not null) or
    (type = 'habit' and metric is null)
  ),
  constraint challenges_end_after_start check (end_date > start_date)
);

create index if not exists challenges_user_idx on public.challenges (user_id);
create index if not exists challenges_user_active_idx
  on public.challenges (user_id) where status = 'active';

alter table public.challenges enable row level security;

create policy "challenges_select_own"
  on public.challenges for select
  using (auth.uid() = user_id);

create policy "challenges_insert_own"
  on public.challenges for insert
  with check (auth.uid() = user_id);

create policy "challenges_update_own"
  on public.challenges for update
  using (auth.uid() = user_id);

-- Sem policy de delete: desafio concluído ou falho permanece no histórico
-- pra sempre, mesma filosofia de goals_history/user_achievements.

-- Trava de 3 desafios ativos simultâneos, mesmo padrão do
-- enforce_max_active_goals da Fase 6.2.
create or replace function public.enforce_max_active_challenges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count integer;
begin
  if new.status = 'active' then
    select count(*) into active_count
    from public.challenges
    where user_id = new.user_id
      and status = 'active'
      and id <> new.id;
    if active_count >= 3 then
      raise exception 'Máximo de 3 desafios ativos por usuário';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_challenges_max_active on public.challenges;
create trigger on_challenges_max_active
  before insert or update on public.challenges
  for each row execute procedure public.enforce_max_active_challenges();

comment on table public.challenges is
  'Desafios com prazo fixo (progresso ou hábito). status transiciona active -> completed/failed via recálculo no client (ChallengesCard), nunca via cron/trigger de tempo — Postgres não sabe "hoje" sem uma query ativa.';
```

**Executar manualmente no Supabase Dashboard > SQL Editor**, mesmo padrão
das migrações anteriores. Também acrescentar a definição ao fim de
`supabase/schema.sql` (referência), apontando pra esta migração.

## 4. Tipos — `src/types/database.ts`

**[Auditoria #A7]** — Confirmado: `GoalMetric` já é exportado com exatamente
`"weight" | "waist" | "hip" | "arm" | "body_fat"`.

Adicionar tipos novos logo depois de `ProgressPhoto`:

```diff
+export type ChallengeType = "progress" | "habit";
+export type ChallengeStatus = "active" | "completed" | "failed";
+
+export type Challenge = {
+  id: string;
+  user_id: string;
+  type: ChallengeType;
+  metric: GoalMetric | null; // null quando type === "habit"
+  template_key: string | null;
+  label: string;
+  // progress: quantidade a reduzir, na unidade da métrica (kg/cm/p.p.)
+  // habit: número de dias consecutivos
+  target_value: number;
+  // progress: valor da métrica capturado na criação. habit: sempre null.
+  baseline_value: number | null;
+  start_date: string; // YYYY-MM-DD
+  end_date: string; // YYYY-MM-DD
+  status: ChallengeStatus;
+  completed_at: string | null;
+  created_at: string;
+};
```

Registrar em `Database.Tables` (após `progress_photos`):

```diff
       progress_photos: { ... };
+      challenges: {
+        Row: Challenge;
+        Insert: Partial<Challenge> & {
+          user_id: string;
+          type: ChallengeType;
+          label: string;
+          target_value: number;
+          end_date: string;
+        };
+        Update: Partial<Challenge>;
+        Relationships: [];
+      };
```

## 5. `src/lib/challenges.ts` (novo arquivo)

Templates fixos + funções puras de avaliação, mesmo padrão de
`achievements.ts`/`streak.ts` (sem dependência de React/Supabase).

**[Auditoria #A6]** — Usa `extractMetricPoints` (confirmado: named export de
`analytics.ts`, retorna `EntryPoint[]` com campo `.weight` que carrega o
valor de qualquer métrica, não só peso) e `METRIC_UNIT`/`METRIC_LABEL`
(confirmados: named exports de `analytics.ts` com exatamente esses nomes).

```ts
import type {
  Challenge,
  ChallengeType,
  GoalMetric,
  WeightEntry,
  BodyMeasurement,
} from "@/types/database";
import { extractMetricPoints, METRIC_UNIT, METRIC_LABEL } from "@/lib/analytics";

// --- Templates ---

export type ChallengeTemplate = {
  key: string;
  type: ChallengeType;
  metric: GoalMetric | null;
  label: string;
  targetValue: number;
  durationDays: number;
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  { key: "lose_2kg_30d", type: "progress", metric: "weight", label: "Perca 2 kg em 30 dias", targetValue: 2, durationDays: 30 },
  { key: "waist_2cm_30d", type: "progress", metric: "waist", label: "Reduza 2 cm de cintura em 30 dias", targetValue: 2, durationDays: 30 },
  { key: "bodyfat_1pp_60d", type: "progress", metric: "body_fat", label: "Reduza 1 p.p. de %gordura em 60 dias", targetValue: 1, durationDays: 60 },
  { key: "streak_7d", type: "habit", metric: null, label: "Registre 7 dias seguidos", targetValue: 7, durationDays: 7 },
  { key: "streak_30d", type: "habit", metric: null, label: "Registre 30 dias seguidos", targetValue: 30, durationDays: 30 },
];

// --- Avaliação ---

export type ChallengeEvaluation = {
  challenge: Challenge;
  /** progress: valor atual da métrica. habit: dias consecutivos registrados desde start_date. */
  currentValue: number | null;
  /** 0-100, clamped. */
  progressPct: number;
  /** pode diferir de challenge.status até o caller persistir a transição. */
  resolvedStatus: Challenge["status"];
  /** negativo = prazo já passou. */
  daysRemaining: number;
};

// Mesmo Intl formatter usado em streak.ts — locale "en-CA" retorna YYYY-MM-DD.
const SP_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function todayInSaoPaulo(reference: Date): string {
  return SP_FMT.format(reference);
}

/**
 * Avalia um desafio contra os dados atuais. NÃO persiste nada — o caller
 * (ChallengesCard) decide se precisa fazer update quando resolvedStatus
 * difere de challenge.status.
 *
 * Desafios já resolvidos (completed/failed) retornam o status congelado —
 * uma vez failed, não "ressuscita" mesmo que dados voltem a bater.
 */
export function evaluateChallenge(
  challenge: Challenge,
  entries: WeightEntry[],
  measurements: BodyMeasurement[],
  reference: Date = new Date()
): ChallengeEvaluation {
  const today = todayInSaoPaulo(reference);

  // Status congelado: já resolvido, sem recalcular.
  if (challenge.status !== "active") {
    return {
      challenge,
      currentValue: null,
      progressPct: challenge.status === "completed" ? 100 : 0,
      resolvedStatus: challenge.status,
      daysRemaining: 0,
    };
  }

  const pastDeadline = today > challenge.end_date;

  if (challenge.type === "progress") {
    return evaluateProgress(challenge, entries, measurements, today, pastDeadline);
  }

  return evaluateHabit(challenge, entries, today, pastDeadline);
}

function evaluateProgress(
  challenge: Challenge,
  entries: WeightEntry[],
  measurements: BodyMeasurement[],
  today: string,
  pastDeadline: boolean
): ChallengeEvaluation {
  const metric = challenge.metric!;
  const points = extractMetricPoints(metric, entries, measurements)
    .filter((p) => SP_FMT.format(p.date) <= today);
  const latest = points.at(-1)?.weight ?? null;
  const baseline = challenge.baseline_value ?? latest;
  const reduced = latest != null && baseline != null ? baseline - latest : 0;
  const progressPct = challenge.target_value > 0
    ? Math.max(0, Math.min(100, (reduced / challenge.target_value) * 100))
    : 0;
  const achieved = reduced >= challenge.target_value;

  return {
    challenge,
    currentValue: latest,
    progressPct,
    resolvedStatus: achieved ? "completed" : pastDeadline ? "failed" : "active",
    daysRemaining: daysBetween(today, challenge.end_date),
  };
}

/**
 * Desafio de hábito — regra estrita (sem tolerância de 1 dia como no streak
 * global). Dias consecutivos com registro em `weight_entries`, a partir de
 * `start_date`, sem falha no meio. Qualquer dia sem registro dentro da
 * janela quebra a sequência e o desafio falha imediatamente.
 *
 * [Auditoria #A5] brokeEarly: se a sequência contígua parou num dia que já
 * passou (cursor < today), o desafio falha mesmo que sobrem dias no prazo —
 * não há como "recuperar" um dia sem registro retroativamente.
 */
function evaluateHabit(
  challenge: Challenge,
  entries: WeightEntry[],
  today: string,
  pastDeadline: boolean
): ChallengeEvaluation {
  const days = new Set(entries.map((e) => e.measured_at));
  let run = 0;
  let cursor = challenge.start_date;
  while (cursor <= today && cursor <= challenge.end_date && days.has(cursor)) {
    run++;
    cursor = addDays(cursor, 1);
  }
  const achieved = run >= challenge.target_value;
  // Falhou se: (1) prazo passou sem atingir, OU (2) sequência quebrou —
  // cursor parou num dia que já passou sem registro.
  const brokeEarly = !achieved && cursor < today && cursor <= challenge.end_date;

  return {
    challenge,
    currentValue: run,
    progressPct: Math.max(0, Math.min(100, (run / challenge.target_value) * 100)),
    resolvedStatus: achieved ? "completed" : pastDeadline || brokeEarly ? "failed" : "active",
    daysRemaining: daysBetween(today, challenge.end_date),
  };
}

// --- Helpers de data (YYYY-MM-DD, fuso fixo America/Sao_Paulo) ---
// Mesmo padrão de streak.ts — nunca .toISOString().

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`); // meio-dia evita virada de DST
  d.setDate(d.getDate() + days);
  return SP_FMT.format(d);
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T12:00:00`);
  const to = new Date(`${toStr}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
```

## 6. `src/lib/loadUserData.ts` — nova query

**[Auditoria #A1]** — Forma real confirmada. O arquivo importa de
`@/types/database` e o `Promise.all` hoje tem **6 queries**:
`profile, entries, activeGoals, measurements, goalsHistory, achievements`.

Desafios entram em `loadUserData()` (diferente de `progress_photos`, que
fica em query isolada na página de fotos) — o dashboard precisa do resumo a
cada visita, mesmo padrão de `achievements`.

### 6.1 Import

```diff
 import type {
-  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
+  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement, Challenge
 } from "@/types/database";
```

### 6.2 Promise.all — 7ª query

Contexto expandido (verbatim do código real):

```
OLD:
  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }, { data: achievements }] =
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
    ]);

NEW:
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
```

Traz **todos** os desafios (ativos + histórico) — a página
`/dashboard/challenges` precisa do histórico completo, e o
`ChallengesCard` filtra `status === "active"` no client. Ordenação
`created_at desc` — mais recentes primeiro, conveniente pro histórico.

### 6.3 Retorno

Adicionar ao final do objeto de retorno (verbatim do código real):

```
OLD:
    achievements: (achievements as UserAchievement[]) ?? [],
  };
}

NEW:
    achievements: (achievements as UserAchievement[]) ?? [],
    challenges: (challenges as Challenge[]) ?? [],
  };
}
```

## 7. Componentes novos

### 7.1 `src/components/ChallengesCard.tsx` (novo, client component)

**[Auditoria #A2]** — Corrigido: `createClient()` criado **dentro** do
`useEffect`, não no corpo do componente (mesmo padrão do
`AchievementsCard.tsx` real, confirmado). Adicionado `didPersist` ref guard
(mesmo padrão, evita re-execução em StrictMode).

Renderizado no dashboard, entre `AchievementsCard` e `KpiWeeklyTeaser`
**[Auditoria #A3]** — posição confirmada no JSX real da `dashboard/page.tsx`:
streak (hábito) → conquistas (resultado acumulado) → **desafios (compromisso
pontual)** → KPI teaser (progresso).

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { evaluateChallenge } from "@/lib/challenges";
import Link from "next/link";
import type { Challenge, WeightEntry, BodyMeasurement } from "@/types/database";

export default function ChallengesCard({
  challenges,
  entries,
  measurements,
}: {
  challenges: Challenge[];
  entries: WeightEntry[];
  measurements: BodyMeasurement[];
}) {
  const router = useRouter();
  const didPersist = useRef(false);
  const active = challenges.filter((c) => c.status === "active");
  const evaluations = active.map((c) => evaluateChallenge(c, entries, measurements));

  // Persistir transições active → completed/failed (fire-and-forget).
  // createClient() dentro do efeito (não no corpo) — mesmo padrão de
  // AchievementsCard (evita dep instável).
  // didPersist ref evita re-execução em StrictMode.
  // `router` omitido das deps (estável na prática, guard por ref impede loop).
  useEffect(() => {
    const toResolve = evaluations.filter((e) => e.resolvedStatus !== "active");
    if (toResolve.length === 0 || didPersist.current) return;
    didPersist.current = true;

    const supabase = createClient();
    Promise.all(
      toResolve.map((e) =>
        supabase
          .from("challenges")
          .update({
            status: e.resolvedStatus,
            completed_at: e.resolvedStatus === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", e.challenge.id)
      )
    ).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  if (active.length === 0) {
    return (
      <Link
        href="/dashboard/challenges"
        className="block rounded-card border border-base-border bg-base-surface px-4 py-3 hover:border-ink-faint transition"
      >
        <p className="text-sm text-ink-muted">Nenhum desafio ativo — que tal começar um?</p>
      </Link>
    );
  }

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Desafios</span>
        <Link href="/dashboard/challenges" className="text-xs text-accent hover:text-accent-hover transition">
          ver todos
        </Link>
      </div>
      {evaluations.map((e) => (
        <div key={e.challenge.id} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-ink truncate">{e.challenge.label}</span>
            <span className="text-ink-muted whitespace-nowrap ml-2">
              {e.daysRemaining > 0 ? `${e.daysRemaining}d` : "hoje"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-base-surface2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${e.progressPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 7.2 `/dashboard/challenges/page.tsx` (novo, Server Component)

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import ChallengesManager from "@/components/ChallengesManager";
import type { Challenge } from "@/types/database";

export default async function ChallengesPage() {
  const { user, profile, entries, measurements, challenges } = await loadUserData();
  const theme = await getTheme();

  const active = challenges.filter((c: Challenge) => c.status === "active");
  const history = challenges.filter((c: Challenge) => c.status !== "active");

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Desafios</p>
        <ChallengesManager
          userId={user.id}
          active={active}
          history={history}
          entries={entries}
          measurements={measurements}
        />
      </main>
    </div>
  );
}
```

### 7.3 `src/components/ChallengesManager.tsx` (novo, client component)

Mesmo padrão de `GoalsManager.tsx` (confirmado: client component, usa
`useState`, `createClient()` para insert, `router.refresh()`). Seletor de
template (lista) + opção "customizado" que libera campos de
tipo/métrica/valor/duração. Baseline capturado no client a partir da série
mais recente (`extractMetricPoints(...).at(-1)?.weight`).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CHALLENGE_TEMPLATES,
  evaluateChallenge,
  type ChallengeTemplate,
} from "@/lib/challenges";
import { extractMetricPoints, METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
import type {
  Challenge,
  ChallengeType,
  GoalMetric,
  WeightEntry,
  BodyMeasurement,
} from "@/types/database";

const METRIC_OPTIONS: GoalMetric[] = ["weight", "waist", "hip", "arm", "body_fat"];

export default function ChallengesManager({
  userId,
  active,
  history,
  entries,
  measurements,
}: {
  userId: string;
  active: Challenge[];
  history: Challenge[];
  entries: WeightEntry[];
  measurements: BodyMeasurement[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"template" | "custom">("template");

  // Custom fields
  const [customType, setCustomType] = useState<ChallengeType>("progress");
  const [customMetric, setCustomMetric] = useState<GoalMetric>("weight");
  const [customTarget, setCustomTarget] = useState("");
  const [customDays, setCustomDays] = useState("");

  const canAdd = active.length < 3;

  function getBaseline(metric: GoalMetric): number | null {
    const points = extractMetricPoints(metric, entries, measurements);
    return points.at(-1)?.weight ?? null;
  }

  function addDaysToToday(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  }

  async function handleTemplateSelect(tpl: ChallengeTemplate) {
    if (!canAdd) return;
    setError(null);

    if (tpl.type === "progress" && tpl.metric) {
      const bl = getBaseline(tpl.metric);
      if (bl == null) {
        setError(`Registre ao menos uma medição de ${METRIC_LABEL[tpl.metric]} antes de criar esse desafio.`);
        return;
      }
      await insertChallenge({
        type: tpl.type,
        metric: tpl.metric,
        template_key: tpl.key,
        label: tpl.label,
        target_value: tpl.targetValue,
        baseline_value: bl,
        end_date: addDaysToToday(tpl.durationDays),
      });
    } else {
      await insertChallenge({
        type: tpl.type,
        metric: null,
        template_key: tpl.key,
        label: tpl.label,
        target_value: tpl.targetValue,
        baseline_value: null,
        end_date: addDaysToToday(tpl.durationDays),
      });
    }
  }

  async function handleCustomSubmit() {
    if (!canAdd) return;
    setError(null);

    const target = Number(customTarget);
    const days = Number(customDays);
    if (!target || target <= 0 || !days || days <= 0) {
      setError("Valor e duração devem ser maiores que zero.");
      return;
    }

    if (customType === "progress") {
      const bl = getBaseline(customMetric);
      if (bl == null) {
        setError(`Registre ao menos uma medição de ${METRIC_LABEL[customMetric]} antes de criar esse desafio.`);
        return;
      }
      const label = `Reduza ${target} ${METRIC_UNIT[customMetric]} de ${METRIC_LABEL[customMetric].toLowerCase()} em ${days} dias`;
      await insertChallenge({
        type: "progress",
        metric: customMetric,
        label,
        target_value: target,
        baseline_value: bl,
        end_date: addDaysToToday(days),
      });
    } else {
      const label = `Registre ${target} dias seguidos`;
      await insertChallenge({
        type: "habit",
        metric: null,
        label,
        target_value: target,
        baseline_value: null,
        end_date: addDaysToToday(target), // janela = exatamente target dias
      });
    }
  }

  async function insertChallenge(fields: Record<string, unknown>) {
    setSaving(true);
    const supabase = createClient();
    const { error: supaError } = await supabase.from("challenges").insert({
      user_id: userId,
      ...fields,
    });
    setSaving(false);
    if (supaError) {
      setError("Não foi possível criar o desafio (talvez o limite de 3 ativos já tenha sido atingido).");
      return;
    }
    setCustomTarget("");
    setCustomDays("");
    router.refresh();
  }

  // Avaliações dos ativos (mesma lógica de ChallengesCard, pra mostrar
  // progresso detalhado na página dedicada).
  const activeEvals = active.map((c) => evaluateChallenge(c, entries, measurements));

  return (
    <div className="space-y-6">
      {/* Desafios ativos */}
      {activeEvals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Ativos</p>
          {activeEvals.map((e) => (
            <div key={e.challenge.id} className="rounded-card border border-base-border bg-base-surface px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink font-medium">{e.challenge.label}</span>
                <span className="text-ink-muted">{e.daysRemaining > 0 ? `${e.daysRemaining} dias restantes` : "último dia"}</span>
              </div>
              <div className="h-2 rounded-full bg-base-surface2 overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${e.progressPct}%` }} />
              </div>
              <p className="text-xs text-ink-faint">
                {e.challenge.type === "progress"
                  ? `Atual: ${e.currentValue?.toFixed(1) ?? "—"} ${METRIC_UNIT[e.challenge.metric!]} · Baseline: ${e.challenge.baseline_value?.toFixed(1)} · Meta: reduzir ${e.challenge.target_value}`
                  : `${e.currentValue ?? 0} de ${e.challenge.target_value} dias consecutivos`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Criar novo */}
      {canAdd ? (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Novo desafio</p>

          {/* Toggle template / custom */}
          <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === "template" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === "custom" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              Customizado
            </button>
          </div>

          {mode === "template" ? (
            <div className="space-y-2">
              {CHALLENGE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  disabled={saving}
                  onClick={() => handleTemplateSelect(tpl)}
                  className="w-full text-left rounded-card border border-base-border bg-base-surface px-4 py-3 text-sm text-ink hover:border-ink-faint transition disabled:opacity-50"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tipo */}
              <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => setCustomType("progress")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    customType === "progress" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
                  }`}
                >
                  Progresso
                </button>
                <button
                  type="button"
                  onClick={() => setCustomType("habit")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    customType === "habit" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
                  }`}
                >
                  Hábito
                </button>
              </div>

              {/* Métrica (só progresso) */}
              {customType === "progress" && (
                <select
                  value={customMetric}
                  onChange={(e) => setCustomMetric(e.target.value as GoalMetric)}
                  className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m} value={m}>{METRIC_LABEL[m]}</option>
                  ))}
                </select>
              )}

              {/* Valor */}
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder={customType === "progress" ? "Valor a reduzir" : "Dias consecutivos"}
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
              />

              {/* Duração (só progresso — hábito usa target como duração) */}
              {customType === "progress" && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Duração em dias"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
                />
              )}

              <button
                type="button"
                disabled={saving}
                onClick={handleCustomSubmit}
                className="rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 hover:bg-accent-hover transition disabled:opacity-50 text-sm"
              >
                {saving ? "Criando..." : "Criar desafio"}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-[var(--badge-caution-text)]">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Limite de 3 desafios ativos atingido.</p>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
          {history.map((c) => (
            <div key={c.id} className="rounded-card border border-base-border bg-base-surface px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-ink">{c.label}</p>
                <p className="text-xs text-ink-faint">
                  {c.start_date} → {c.end_date}
                </p>
              </div>
              <span className={`text-xs font-medium ${
                c.status === "completed" ? "text-signal-ahead" : "text-signal-behind"
              }`}>
                {c.status === "completed" ? "Concluído" : "Falhou"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 8. `src/app/(app)/dashboard/page.tsx` — patch

### 8.1 Import

```diff
 import AchievementsCard from "@/components/AchievementsCard";
+import ChallengesCard from "@/components/ChallengesCard";
 import TrendBadge from "@/components/TrendBadge";
```

### 8.2 Desestruturar `challenges`

**[Auditoria #A3]** — Contexto verbatim do código real:

```
OLD:
  const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements } = await loadUserData();

NEW:
  const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements, challenges } = await loadUserData();
```

### 8.3 JSX — inserir entre AchievementsCard e KpiWeeklyTeaser

Contexto expandido (verbatim do código real):

```
OLD:
        <AchievementsCard
          entries={entries}
          primaryWeightGoal={primaryWeightGoal}
          achievements={achievements}
          userId={user.id}
        />

        {primaryWeekKpi && <KpiWeeklyTeaser kpi={primaryWeekKpi} />}

NEW:
        <AchievementsCard
          entries={entries}
          primaryWeightGoal={primaryWeightGoal}
          achievements={achievements}
          userId={user.id}
        />
        <ChallengesCard
          challenges={challenges}
          entries={entries}
          measurements={measurements}
        />

        {primaryWeekKpi && <KpiWeeklyTeaser kpi={primaryWeekKpi} />}
```

## 9. `src/components/NavBar.tsx` — novo link

**[Auditoria #A2/A4]** — Ordem atual confirmada (verbatim):

```
OLD:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/photos", label: "Fotos" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/settings", label: "Configurações" },
];

NEW:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/photos", label: "Fotos" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/challenges", label: "Desafios" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/settings", label: "Configurações" },
];
```

Isso leva a 8 itens no array + "Ajuda" (botão fora do `.map()`) = **9
elementos visuais em mobile**. O `overflow-x-auto` do
`<nav className="sm:hidden ...">` deve continuar funcionando, mas o
**checklist de teste deve confirmar visualmente em tela ≥ 320px** — 9 itens
é o mais largo até agora.

## 10. Rotas de export — `api/export/pdf/route.tsx` e `api/export/report-pdf/route.tsx`

**Sem mudança.** Desafios não aparecem no PDF exportado — fora de escopo.
Essas rotas fazem suas próprias queries (não usam `loadUserData()`) e não
precisam de `challenges`.

## 11. Fora de escopo (não implementar nesta sub-fase)

- Desafios sociais/entre usuários (depende de Fase 6.4).
- Desafios com direção "ganhar"/"manter".
- Notificação/e-mail de prazo próximo do fim.
- Desafios no PDF exportado ou no CSV.
- Editar/abandonar um desafio já criado (criar e deixar rodar até resolver).
- Gate de plano (Fase 7).

## 12. Checklist de teste

- [ ] Rodar `supabase/migrations/0010_challenges.sql` no Supabase Dashboard
      — conferir tabela `challenges`, RLS ativo (3 policies), trigger
      `on_challenges_max_active`, índices.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Criar desafio de progresso por template ("Perca 2 kg em 30 dias"):
      baseline capturado corretamente a partir do registro mais recente de
      peso.
- [ ] Criar desafio de progresso sem nenhum registro da métrica: bloqueado
      no client com mensagem "registre ao menos uma medição de [...]".
- [ ] Atingir a meta de um desafio de progresso antes do prazo (ajustar peso
      manualmente se necessário): vira `completed` na próxima visita ao
      dashboard, sai da lista de ativos, aparece no histórico com
      "Concluído" em `text-signal-ahead`.
- [ ] Deixar o prazo passar sem atingir (ajustar `end_date` no banco se
      necessário): vira `failed`, aparece no histórico com "Falhou" em
      `text-signal-behind`.
- [ ] Desafio de hábito de 7 dias: registrar dias 1-7 consecutivos →
      `completed`. Registrar dias 1-3, pular dia 4, registrar dia 5 → 
      `failed` imediato (testar `brokeEarly` — sem tolerância).
- [ ] Criar o 4º desafio ativo: trigger do banco rejeita, client mostra
      mensagem de erro.
- [ ] RLS: usuário A não vê/edita desafios do usuário B (testar via
      Supabase SQL Editor com `auth.uid()` diferente, se possível).
- [ ] Link "Desafios" no `NavBar` — desktop (entre "Metas" e "Relatórios")
      e mobile (9 elementos visuais, scroll horizontal sem cortar labels
      em tela ≥ 320px).
- [ ] Dashboard: `ChallengesCard` aparece entre `AchievementsCard` e
      `KpiWeeklyTeaser`; sem desafios ativos, mostra link pro
      `/dashboard/challenges`.
- [ ] Página `/dashboard/challenges`: templates clicáveis, modo customizado
      com campos de tipo/métrica/valor/duração, lista de ativos com barra
      de progresso, histórico abaixo.
- [ ] Alternar tema claro/escuro: barra de progresso (`bg-accent`), status
      "Concluído"/"Falhou" (`signal-ahead`/`signal-behind`), mensagem de
      erro (`--badge-caution-text`) com contraste adequado nos dois temas.

---

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 6 —
Ticket alto → "Desafios") e adicionar seção "Fase 6.3 — Desafios" no
`CLAUDE.md`, mesmo padrão das seções anteriores.

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. Diff de `loadUserData.ts` impreciso (SEVERIDADE: MÉDIA)

**v1 dizia:** diff simplificado mostrando `challenges` entrando no
`Promise.all` com `...` no meio.

**Problema:** O `Promise.all` real tem 6 queries com nomes específicos de
desestruturação (`{ data: profile }, { data: entries }, { data: activeGoals },
{ data: measurements }, { data: goalsHistory }, { data: achievements }`). O
diff preciso é necessário para `str_replace` do Claude Code.

**Correção:** seção 6 agora mostra o contexto verbatim completo (OLD/NEW)
para localização exata pelo Claude Code.

### A2. `ChallengesCard` criava `supabase` fora do `useEffect` (SEVERIDADE: MÉDIA)

**v1 tinha:** `const supabase = createClient();` no corpo do componente,
usado dentro do `useEffect`.

**Problema:** `createClient()` retorna novo objeto a cada render → dep
instável. O `AchievementsCard.tsx` real (confirmado na auditoria) cria
`createClient()` **dentro** do `useEffect`, com `didPersist` ref como guard.

**Correção:** `createClient()` movido para dentro do `useEffect`,
`didPersist` ref adicionado (seção 7.1).

### A3. Posição do `ChallengesCard` no dashboard não especificada (SEVERIDADE: BAIXA)

**v1 dizia:** "mesma vizinhança de `StreakCard`/`KpiWeeklyTeaser`" sem
especificar a posição exata.

**Confirmado no código real:** ordem é StreakCard → AchievementsCard →
KpiWeeklyTeaser → grid(WeightChart+TrendBadge) → GoalTabs →
BodyMeasurementsSummaryCard. `ChallengesCard` entra entre
`AchievementsCard` e `KpiWeeklyTeaser`.

**Correção:** seção 8.3 agora tem contexto expandido verbatim.

### A4. Ordem do array `links` no `NavBar` confirmada (SEVERIDADE: BAIXA)

**v1 tinha a ordem correta** (7 itens: Visão geral, Pesagens, Medidas,
Fotos, Metas, Relatórios, Configurações + Ajuda fora do array). Confirmado
contra `NavBar.tsx` real. "Desafios" entra entre "Metas" e "Relatórios".
9 elementos visuais em mobile — vale conferir no checklist.

### A5. Regra `brokeEarly` do desafio de hábito validada (SEVERIDADE: ALTA — decisão de produto)

**v1 sinalizava como pendência de validação.** Regra: se a sequência
contígua parou num dia que já passou (`cursor < today`), o desafio falha
imediatamente, sem esperar o prazo original. Diferente do streak global
(tolerância de 1 dia), o desafio é uma aposta explícita — mais rígido.

**Decisão:** manter. Comportamento é intencional — desafio é a camada "dura"
do engajamento. Se for rígido demais na prática, pode ser relaxado numa
iteração futura sem quebrar o schema (basta mudar a lógica em
`evaluateHabit`).

### A6. Exports de `analytics.ts` confirmados (SEVERIDADE: BAIXA)

**v1 assumia** que `extractMetricPoints`, `METRIC_UNIT`, `METRIC_LABEL` e
`EntryPoint` eram named exports com esses nomes exatos.

**Confirmado no código real:**
- `export function extractMetricPoints(metric: GoalMetric, weightEntries: WeightEntry[], measurements: BodyMeasurement[]): EntryPoint[]` ✓
- `export const METRIC_UNIT: Record<GoalMetric, string>` ✓
- `export const METRIC_LABEL: Record<GoalMetric, string>` ✓
- `export type EntryPoint = { date: Date; weight: number }` ✓ (campo
  `.weight` carrega o valor de qualquer métrica — naming legacy, não só peso)

### A7. `GoalMetric` confirmado (SEVERIDADE: BAIXA)

**Confirmado em `database.ts`:**
`export type GoalMetric = "weight" | "waist" | "hip" | "arm" | "body_fat"` ✓

Nenhuma pendência restante. Spec pronto para handoff ao Claude Code.
