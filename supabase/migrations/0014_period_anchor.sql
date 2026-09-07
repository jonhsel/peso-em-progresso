-- Fase 8.x: expandir period_mode para incluir 'anchored' ("A partir de uma
-- data") + coluna period_anchor_date.
--
-- Nota: a spec original (claude_fase8_marco_periodo_v3.md) previa este
-- arquivo como 0013_period_anchor.sql, mas 0013 já estava em uso
-- (0013_get_user_id_by_email.sql, Fase 7) — renumerado para 0014.
--
-- Rodar cada bloco separadamente no SQL Editor do Supabase Dashboard
-- (lição documentada do projeto: multi-statement em transação única —
-- falha em qualquer bloco reverte tudo).

-- Bloco 1:
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_period_mode_check;

-- Bloco 2:
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_period_mode_check
    CHECK (period_mode IN ('fixed', 'rolling', 'anchored'));

-- Bloco 3:
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS period_anchor_date date;

COMMENT ON COLUMN public.profiles.period_mode IS
  'fixed = períodos civis; rolling = N dias corridos atrás de hoje;
   anchored = todos os KPIs contam a partir de period_anchor_date.
   anchored é Pro-gated.';
COMMENT ON COLUMN public.profiles.period_anchor_date IS
  'Data-marco quando period_mode = anchored. Pode permanecer preenchida
   se o modo mudar (permite reativar sem redigitar). Pesagens anteriores
   ao marco continuam visíveis, só os KPIs recontam a partir dela.';
