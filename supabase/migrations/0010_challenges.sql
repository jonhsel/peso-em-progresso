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
