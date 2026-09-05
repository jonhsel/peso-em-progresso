-- =========================================================
-- Peso em Progresso — schema do banco (Supabase / Postgres)
-- =========================================================
-- Como usar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- Pressupõe o Supabase Auth já habilitado (auth.users é criado automaticamente).

-- ---------------------------------------------------------
-- 1. Perfis (1 linha por usuário, criada automaticamente no signup)
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário',
  height_cm numeric(5,1),
  created_at timestamptz not null default now(),
  onboarded_at timestamptz,
  period_mode text not null default 'fixed' check (period_mode in ('fixed', 'rolling')),
  week_starts_on text not null default 'monday' check (week_starts_on in ('monday', 'sunday')),
  checkin_hour smallint check (checkin_hour is null or (checkin_hour >= 0 and checkin_hour <= 23)),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  kiwify_order_id text
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Cria o perfil automaticamente quando um usuário se cadastra. A partir da
-- Fase 7, também concilia um pagamento pendente (Kiwify) porventura já
-- aprovado pra esse email antes da conta existir — ver seção 12.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pending record;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select * into pending
  from public.pending_payments
  where email = new.email and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.profiles
    set plan = 'pro',
        plan_expires_at = pending.expires_at,
        kiwify_order_id = pending.kiwify_order_id
    where id = new.id;

    update public.pending_payments
    set status = 'applied', applied_at = now()
    where id = pending.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- 2. Registros de peso
-- ---------------------------------------------------------
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(5,2) not null check (weight_kg > 0 and weight_kg < 500),
  note text,
  source text not null default 'manual', -- 'manual' | 'import'
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);

create index if not exists weight_entries_user_date_idx
  on public.weight_entries (user_id, measured_at desc);

alter table public.weight_entries enable row level security;

create policy "weight_entries_select_own"
  on public.weight_entries for select
  using (auth.uid() = user_id);

create policy "weight_entries_insert_own"
  on public.weight_entries for insert
  with check (auth.uid() = user_id);

create policy "weight_entries_update_own"
  on public.weight_entries for update
  using (auth.uid() = user_id);

create policy "weight_entries_delete_own"
  on public.weight_entries for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 3. Metas (até 3 linhas ATIVAS por usuário, cada uma com sua métrica —
--    peso, cintura, quadril, braço ou %gordura. Ver Fase 6.2,
--    supabase/migrations/0009_multi_goals.sql, para o histórico de como
--    isso deixou de ser singleton.)
-- ---------------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null default 'weight'
    check (metric in ('weight', 'waist', 'hip', 'arm', 'body_fat')),
  label text,
  weekly_rate numeric(5,2) not null default 0.25,
  monthly_rate numeric(5,2) not null default 1.0,
  quarterly_rate numeric(5,2) not null default 3.0,
  semester_rate numeric(5,2) not null default 6.0,
  target_value numeric(5,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "goals_select_own"
  on public.goals for select
  using (auth.uid() = user_id);

create policy "goals_upsert_own"
  on public.goals for insert
  with check (auth.uid() = user_id);

create policy "goals_update_own"
  on public.goals for update
  using (auth.uid() = user_id);

-- Trava de no máximo 3 metas ativas simultâneas por usuário.
-- Fase 7: o limite de metas ativas passou a depender do plano (1 para
-- free, 3 para pro) — ver seção 12.
create or replace function public.enforce_max_active_goals()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count integer;
  user_plan text;
  max_allowed integer;
begin
  if new.is_active then
    select plan into user_plan from public.profiles where id = new.user_id;
    max_allowed := case when user_plan = 'pro' then 3 else 1 end;

    select count(*) into active_count
    from public.goals
    where user_id = new.user_id
      and is_active = true
      and id <> new.id;

    if active_count >= max_allowed then
      raise exception 'Limite de % meta(s) ativa(s) atingido para o plano %', max_allowed, coalesce(user_plan, 'free');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_goals_max_active on public.goals;
create trigger on_goals_max_active
  before insert or update on public.goals
  for each row execute procedure public.enforce_max_active_goals();

-- Cria a meta de peso padrão (250g/semana, 1kg/mês) junto com o perfil
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

drop trigger if exists on_auth_user_created_goals on auth.users;
create trigger on_auth_user_created_goals
  after insert on auth.users
  for each row execute procedure public.handle_new_user_goals();

-- ---------------------------------------------------------
-- 4. Medidas corporais (opcional, complementar a weight_entries)
-- Ver supabase/migrations/0003_body_measurements.sql
-- ---------------------------------------------------------

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  waist_cm numeric(5,1) check (waist_cm is null or (waist_cm > 0 and waist_cm < 300)),
  hip_cm numeric(5,1) check (hip_cm is null or (hip_cm > 0 and hip_cm < 300)),
  arm_cm numeric(5,1) check (arm_cm is null or (arm_cm > 0 and arm_cm < 100)),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct < 100)),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at),
  constraint body_measurements_at_least_one_field check (
    waist_cm is not null or hip_cm is not null or arm_cm is not null or body_fat_pct is not null
  )
);

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_at desc);

alter table public.body_measurements enable row level security;

create policy "body_measurements_select_own"
  on public.body_measurements for select
  using (auth.uid() = user_id);

create policy "body_measurements_insert_own"
  on public.body_measurements for insert
  with check (auth.uid() = user_id);

create policy "body_measurements_update_own"
  on public.body_measurements for update
  using (auth.uid() = user_id);

create policy "body_measurements_delete_own"
  on public.body_measurements for delete
  using (auth.uid() = user_id);

comment on table public.body_measurements is
  'Medidas corporais opcionais (cintura, quadril, braço, % gordura) — 1 registro por dia por usuário, mesmo padrão de weight_entries.';

-- ---------------------------------------------------------
-- Histórico de metas (log append-only, complementar a `goals`)
-- `goals` guarda o snapshot de cada meta ATIVA (até 3 linhas/usuário desde
-- a Fase 6.2). `goals_history` é o log completo de toda meta que já
-- existiu, uma linha por (goal_id) e edição, usado pelo KPI pra saber
-- qual meta valia em cada período passado e pela tela de histórico.
-- Ver supabase/migrations/0004_goals_history.sql (criação + backfill
-- original) e 0009_multi_goals.sql (generalização por goal_id/metric).
-- ---------------------------------------------------------
create table if not exists public.goals_history (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  metric text not null default 'weight',
  weekly_rate numeric(5,2) not null,
  monthly_rate numeric(5,2) not null,
  quarterly_rate numeric(5,2) not null,
  semester_rate numeric(5,2) not null,
  target_value numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists goals_history_user_created_idx
  on public.goals_history (user_id, created_at desc);

create index if not exists goals_history_goal_id_idx
  on public.goals_history (goal_id, created_at desc);

alter table public.goals_history enable row level security;

create policy "goals_history_select_own"
  on public.goals_history for select
  using (auth.uid() = user_id);

create policy "goals_history_insert_own"
  on public.goals_history for insert
  with check (auth.uid() = user_id);

-- Sem policy de update/delete: log é append-only por design.

-- Trigger: toda escrita em `goals` (INSERT ou UPDATE) espelha em
-- `goals_history`. Isso cobre:
--   • Signup: trigger handle_new_user_goals faz INSERT em goals → dispara
--   • Onboarding: OnboardingFlow.handleFinish faz update por id → dispara
--   • GoalsForm: edição faz update por id → dispara
--   • GoalsManager: criar/desativar meta faz insert/update → dispara
-- Sem precisar de insert client-side em nenhum desses lugares.
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

drop trigger if exists on_goals_changed_history on public.goals;
create trigger on_goals_changed_history
  after insert or update on public.goals
  for each row execute procedure public.handle_goals_history_sync();

comment on table public.goals_history is
  'Log append-only de toda meta que já existiu por usuário, por goal_id — usado para resolver qual meta valia em cada período passado (ver resolveGoalsForPeriod em src/lib/analytics.ts) e pela tela de histórico em /dashboard/goals.';

-- ---------------------------------------------------------
-- 6. Conquistas (achievements)
-- Ver supabase/migrations/0006_user_achievements.sql
-- ---------------------------------------------------------
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  constraint user_achievements_unique unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "user_achievements_insert_own"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

comment on table public.user_achievements is
  'Conquistas desbloqueadas por usuário. Chave única (user_id, achievement_key) impede duplicata. Sem update/delete — uma vez desbloqueada, permanece.';

-- ---------------------------------------------------------
-- 9. Fotos de progresso
-- Ver supabase/migrations/0008_progress_photos.sql
-- ---------------------------------------------------------
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_date date not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint progress_photos_unique unique (user_id, photo_date)
);

create index if not exists progress_photos_user_idx
  on public.progress_photos (user_id, photo_date);

alter table public.progress_photos enable row level security;

create policy "progress_photos_select_own"
  on public.progress_photos for select
  using (auth.uid() = user_id);

create policy "progress_photos_insert_own"
  on public.progress_photos for insert
  with check (auth.uid() = user_id);

create policy "progress_photos_update_own"
  on public.progress_photos for update
  using (auth.uid() = user_id);

create policy "progress_photos_delete_own"
  on public.progress_photos for delete
  using (auth.uid() = user_id);

comment on table public.progress_photos is
  'Metadados de fotos de progresso. 1 foto por (user_id, photo_date) — upload no mesmo dia sobrescreve. O arquivo em si vive no bucket privado progress-photos, path {user_id}/{photo_date}.jpg.';

-- ---------------------------------------------------------
-- 10. Desafios
-- Ver supabase/migrations/0010_challenges.sql
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

-- ---------------------------------------------------------
-- 11. Coach/visualizador
-- Ver supabase/migrations/0011_coach_links.sql
-- ---------------------------------------------------------
create table if not exists public.coach_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  coach_user_id uuid references auth.users(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  owner_display_name text not null,
  coach_display_name text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists coach_links_owner_idx
  on public.coach_links (owner_user_id);

create index if not exists coach_links_coach_idx
  on public.coach_links (coach_user_id);

create unique index if not exists coach_links_one_open_per_owner
  on public.coach_links (owner_user_id)
  where status in ('pending', 'active');

alter table public.coach_links enable row level security;

create policy "coach_links_select_party"
  on public.coach_links for select
  using (auth.uid() = owner_user_id or auth.uid() = coach_user_id);

create policy "coach_links_select_pending_by_code"
  on public.coach_links for select
  using (status = 'pending');

create policy "coach_links_insert_owner"
  on public.coach_links for insert
  with check (auth.uid() = owner_user_id and coach_user_id is null);

create policy "coach_links_update_party"
  on public.coach_links for update
  using (auth.uid() = owner_user_id or (status = 'pending' and coach_user_id is null))
  with check (true);

create policy "profiles_select_by_coach"
  on public.profiles for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = profiles.id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "weight_entries_select_by_coach"
  on public.weight_entries for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = weight_entries.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "body_measurements_select_by_coach"
  on public.body_measurements for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = body_measurements.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "goals_select_by_coach"
  on public.goals for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = goals.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "goals_history_select_by_coach"
  on public.goals_history for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = goals_history.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "progress_photos_select_by_coach"
  on public.progress_photos for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = progress_photos.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "progress_photos_storage_select_by_coach"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id::text = (storage.foldername(name))[1]
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

comment on table public.coach_links is
  'Vínculo coach/cliente por convite. owner = dono dos dados; coach = quem acompanha (preenchido ao aceitar). 1 vínculo pendente/ativo por owner (índice parcial); 1 coach pode ter N owners. display_name desnormalizado para evitar leitura cruzada em profiles.';

-- ---------------------------------------------------------
-- 12. Plano (free/pro) + pagamentos pendentes
-- Ver supabase/migrations/0012_plan_gate.sql. profiles.plan/plan_expires_at/
-- kiwify_order_id já fazem parte da definição de profiles acima (seção 1);
-- esta seção cobre só a tabela de conciliação de pagamentos pendentes.
-- ---------------------------------------------------------
create table if not exists public.pending_payments (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kiwify_order_id text,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists pending_payments_email_status_idx
  on public.pending_payments (email, status);

-- RLS ativado, SEM policies: só acessível via service role (webhook) e via
-- funções security definer (handle_new_user, seção 1). Client nunca lê/
-- escreve aqui diretamente.
alter table public.pending_payments enable row level security;

comment on table public.pending_payments is
  'Fila de conciliação: pagamento aprovado na Kiwify pra um email que ainda não
   tinha conta no app no momento do webhook. handle_new_user() concilia
   automaticamente no signup. Sem RLS de client — só service role e triggers.';

-- supabase.schema("auth") não funciona via @supabase/supabase-js com service
-- role key — o PostgREST só expõe o schema "public" pela API REST por
-- padrão (restrição do gateway HTTP, não de RLS; a service role key não
-- contorna). Confirmado com um teste real em 05/09/2026 (ver CLAUDE.md Fase
-- 7). Função security definer abaixo, em "public" (schema exposto), lê
-- auth.users por dentro do Postgres — chamada via supabase.rpc(), nunca
-- .schema("auth").from("users").
create or replace function public.get_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where email = lookup_email limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
revoke all on function public.get_user_id_by_email(text) from anon;
revoke all on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

comment on function public.get_user_id_by_email(text) is
  'Lookup de auth.users por email via security definer — necessário porque
   a API REST do Supabase (mesmo com service role key) não expõe o schema
   auth por padrão. Usado só pelo webhook da Kiwify, chamado via .rpc(),
   nunca pelo client anon/authenticated (revogado explicitamente acima).';

-- ---------------------------------------------------------
-- Notas de arquitetura:
-- * RLS garante que cada usuário (amigo/familiar) só vê os próprios dados,
--   mesmo estando todos no mesmo projeto Supabase.
-- * "unique (user_id, measured_at)" permite no máximo 1 pesagem por dia
--   por usuário; o app faz upsert nesse par.
-- * source='import' fica reservado para uma futura importação de CSV
--   exportado do app Fitdays (ver README — Fitdays não expõe API pública).
-- ---------------------------------------------------------
