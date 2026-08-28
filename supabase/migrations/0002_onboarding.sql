-- =========================================================
-- Fase 0 — Onboarding guiado
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

comment on column public.profiles.onboarded_at is
  'Preenchido quando o usuário conclui o fluxo de onboarding (3 telas). NULL = ainda não passou pelo onboarding.';
