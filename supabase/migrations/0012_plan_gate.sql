-- ---------------------------------------------------------
-- Fase 7 — Gate free/pro + integração Kiwify
-- Assinatura mensal recorrente (R$ 11,90/mês). Ver claude_fase7_monetizacao_v3.md.
-- ---------------------------------------------------------

-- 1. Coluna de plano em profiles
alter table public.profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro'));

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

alter table public.profiles
  add column if not exists kiwify_order_id text;

comment on column public.profiles.plan is
  'free | pro. pro é assinatura mensal via Kiwify — ver plan_expires_at para validade.';
comment on column public.profiles.plan_expires_at is
  'Data de expiração da assinatura pro. null quando plan = free. Atualizado a cada
   compra_aprovada/subscription_renewed; downgrade para free é imediato em
   subscription_canceled/subscription_late/compra_reembolsada/chargeback (não espera
   plan_expires_at vencer).';
comment on column public.profiles.kiwify_order_id is
  'Id da última venda/assinatura Kiwify associada — rastreabilidade para suporte.';

-- 2. Tabela de pagamentos pendentes (fallback quando o email do checkout
--    ainda não tem conta no app no momento do webhook)
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
-- funções security definer (trigger de signup abaixo). Client nunca lê/escreve
-- aqui diretamente.
alter table public.pending_payments enable row level security;

comment on table public.pending_payments is
  'Fila de conciliação: pagamento aprovado na Kiwify pra um email que ainda não
   tinha conta no app no momento do webhook. handle_new_user() concilia
   automaticamente no signup. Sem RLS de client — só service role e triggers.';

-- 3. Trigger de signup: reescrito para conciliar pending_payments automaticamente.
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

-- Trigger on_auth_user_created já existe e aponta pra esta função — não
-- precisa recriar o trigger, só a função (CREATE OR REPLACE já resolve).

-- 4. Trava de metas ativas por plano.
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
