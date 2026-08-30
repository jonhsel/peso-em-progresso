-- =========================================================
-- Fase 4.2 — Conquistas (achievements)
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

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

-- Sem policy de update/delete: conquistas não são revogadas.

comment on table public.user_achievements is
  'Conquistas desbloqueadas por usuário. Chave única (user_id, achievement_key) impede duplicata. Sem update/delete — uma vez desbloqueada, permanece.';
