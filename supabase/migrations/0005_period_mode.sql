-- Fase 3: período de meta fixo vs. móvel, configurável por usuário.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS period_mode text NOT NULL DEFAULT 'fixed'
    CONSTRAINT profiles_period_mode_check CHECK (period_mode IN ('fixed', 'rolling')),
  ADD COLUMN IF NOT EXISTS week_starts_on text NOT NULL DEFAULT 'monday'
    CONSTRAINT profiles_week_starts_on_check CHECK (week_starts_on IN ('monday', 'sunday'));

COMMENT ON COLUMN public.profiles.period_mode IS
  'fixed = períodos civis (semana a partir de week_starts_on, mês/trimestre/semestre civis);
   rolling = N dias corridos atrás de hoje (7/30/90/180). Escolha única, vale para os 4 períodos.';
COMMENT ON COLUMN public.profiles.week_starts_on IS
  'monday | sunday — início da semana quando period_mode = fixed. Também usado pelo
   seletor "1 semana" do gráfico de evolução (Fase 5) quando fixed.';
