-- ---------------------------------------------------------
-- Histórico de metas (log append-only, complementar a `goals`)
-- `goals` continua sendo o snapshot da meta ATIVA (1 linha/usuário,
-- usado por formulários e valores-padrão). `goals_history` é o log
-- completo de toda meta que já existiu, usado pelo KPI pra saber
-- qual meta valia em cada período passado e pela tela de histórico.
-- ---------------------------------------------------------
create table if not exists public.goals_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_loss_kg numeric(5,2) not null,
  monthly_loss_kg numeric(5,2) not null,
  quarterly_loss_kg numeric(5,2) not null,
  semester_loss_kg numeric(5,2) not null,
  target_weight_kg numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists goals_history_user_created_idx
  on public.goals_history (user_id, created_at desc);

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
--   • Onboarding: OnboardingFlow.handleFinish faz upsert (= UPDATE) → dispara
--   • GoalsForm: edição faz upsert (= UPDATE) → dispara
-- Sem precisar de insert client-side em nenhum desses lugares.
create or replace function public.handle_goals_history_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.goals_history
    (user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
     semester_loss_kg, target_weight_kg)
  values
    (new.user_id, new.weekly_loss_kg, new.monthly_loss_kg,
     new.quarterly_loss_kg, new.semester_loss_kg, new.target_weight_kg);
  return new;
end;
$$;

drop trigger if exists on_goals_changed_history on public.goals;
create trigger on_goals_changed_history
  after insert or update on public.goals
  for each row execute procedure public.handle_goals_history_sync();

-- Backfill: todo usuário que já tem uma linha em `goals` mas nenhuma em
-- `goals_history` ganha um primeiro registro com o valor atual.
-- Sem isso, o fallback de resolveGoalsForPeriod ficaria vazio pra quem
-- já tinha conta antes desta migração.
-- O WHERE NOT EXISTS evita duplicata se o trigger acima já tiver disparado
-- (ex.: se a migração rodar depois de algum UPDATE em `goals`).
insert into public.goals_history
  (user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
   semester_loss_kg, target_weight_kg, created_at)
select
  user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
  semester_loss_kg, target_weight_kg, updated_at
from public.goals g
where not exists (
  select 1 from public.goals_history gh where gh.user_id = g.user_id
);
