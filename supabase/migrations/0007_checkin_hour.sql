-- Fase 4.3: horário preferido de check-in (opcional, sem default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS checkin_hour smallint;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_checkin_hour_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_checkin_hour_check
    CHECK (checkin_hour IS NULL OR (checkin_hour >= 0 AND checkin_hour <= 23));
