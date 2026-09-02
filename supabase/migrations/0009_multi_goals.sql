-- ---------------------------------------------------------
-- Fase 6.2 — Múltiplas metas simultâneas
-- `goals` deixa de ser singleton (1 linha/usuário) e passa a admitir até
-- 3 linhas ativas por usuário, cada uma com sua própria métrica (peso,
-- cintura, quadril, braço, %gordura). `goals_history` acompanha a mesma
-- generalização, agora referenciando a meta (`goal_id`) a que pertence.
-- Ver claude_fase6_metas_simultaneas_v3.md.
-- ---------------------------------------------------------

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

-- 7. Trocar PK (user_id deixa de ser único — um usuário pode ter até 3
--    linhas em goals agora)
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

-- ---------------------------------------------------------
-- 4.1 `goals_history` — generalização
-- ---------------------------------------------------------

alter table public.goals_history add column if not exists goal_id uuid;
alter table public.goals_history add column if not exists metric text not null default 'weight';

alter table public.goals_history rename column weekly_loss_kg to weekly_rate;
alter table public.goals_history rename column monthly_loss_kg to monthly_rate;
alter table public.goals_history rename column quarterly_loss_kg to quarterly_rate;
alter table public.goals_history rename column semester_loss_kg to semester_rate;
alter table public.goals_history rename column target_weight_kg to target_value;

-- Backfill: até este ponto da migração, todo usuário tem exatamente 1 linha
-- em `goals` (o singleton pré-existente), então o mapeamento por user_id é
-- inequívoco — sem isso, `goal_id` ficaria null em todo o histórico já
-- existente e a filtragem por meta (dashboard, GoalsHistoryList, PDFs)
-- não teria como associar registros antigos à meta de peso migrada.
update public.goals_history gh
set goal_id = g.id,
    metric = g.metric
from public.goals g
where gh.user_id = g.user_id
  and gh.goal_id is null;

alter table public.goals_history alter column goal_id set not null;

alter table public.goals_history
  add constraint goals_history_goal_id_fkey
  foreign key (goal_id) references public.goals(id) on delete cascade;

create index if not exists goals_history_goal_id_idx
  on public.goals_history (goal_id, created_at desc);

-- Trigger (nome real confirmado na migração 0004: on_goals_changed_history,
-- função handle_goals_history_sync) — reescrita pra gravar goal_id/metric.
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
