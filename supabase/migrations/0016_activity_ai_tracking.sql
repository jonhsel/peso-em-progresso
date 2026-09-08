-- Fase 9.x — Contagem de repetições por IA
-- Colunas novas em activity_sessions: source (manual vs ai_tracked)
-- e reps_count (nº de repetições contadas pela IA).
-- Sessões existentes (criadas antes desta migração) recebem
-- source = 'manual' automaticamente via DEFAULT.

alter table public.activity_sessions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_tracked')),
  add column if not exists reps_count integer
    check (reps_count is null or reps_count > 0);
