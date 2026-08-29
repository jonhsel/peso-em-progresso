-- =========================================================
-- Fase 2.2 — Medidas corporais
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

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
