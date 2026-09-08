-- ---------------------------------------------------------
-- Fase 9 — Atividade Física
-- Registro de sessões de atividade física (caminhada, musculação, etc.),
-- tipos extensíveis por usuário e meta semanal por tipo. Ver
-- claude_fase9_atividade_v2.md.
--
-- Rodar cada bloco separadamente no SQL Editor do Supabase Dashboard —
-- multi-statement em transação única falha em qualquer bloco reverte tudo.
-- ---------------------------------------------------------

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

-- ---------------------------------------------------------

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

-- ---------------------------------------------------------

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

-- ---------------------------------------------------------

-- Bloco 4: Seed de 2 tipos padrão no signup
-- Nota sobre coexistência de triggers em auth.users: este é o 3º trigger
-- AFTER INSERT nessa tabela, coexistindo com on_auth_user_created
-- (handle_new_user — profile + conciliação Kiwify) e
-- on_auth_user_created_goals (handle_new_user_goals — meta de peso
-- padrão). Postgres executa múltiplos triggers do mesmo evento em ordem
-- alfabética de nome; os 3 são independentes entre si, a ordem não importa.
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
