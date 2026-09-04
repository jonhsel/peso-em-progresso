-- ---------------------------------------------------------
-- Fase 6.4 — Papel de coach/visualizador
-- Vínculo por link/código copiável: dono gera convite, coach aceita. Coach
-- enxerga tudo do dono, somente leitura (peso, medidas, fotos, metas).
-- 1 coach ativo por dono; 1 coach pode acompanhar N donos.
-- Ver claude_fase6_coach_v2.md.
--
-- Nota de numeração: o spec original chamava este arquivo de
-- 0010_coach_links.sql, mas 0010 já foi usado por challenges (Fase 6.3,
-- implementada antes desta sessão) — renumerado para 0011 sem nenhuma
-- outra mudança de conteúdo.
-- ---------------------------------------------------------

-- ---------------------------------------------------------
-- 1. Tabela coach_links
-- ---------------------------------------------------------
create table if not exists public.coach_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  coach_user_id uuid references auth.users(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  owner_display_name text not null,
  coach_display_name text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists coach_links_owner_idx
  on public.coach_links (owner_user_id);

create index if not exists coach_links_coach_idx
  on public.coach_links (coach_user_id);

-- 1 vínculo pendente OU ativo por dono por vez.
create unique index if not exists coach_links_one_open_per_owner
  on public.coach_links (owner_user_id)
  where status in ('pending', 'active');

comment on table public.coach_links is
  'Vínculo coach/cliente por convite. owner = dono dos dados; coach = quem acompanha (preenchido ao aceitar). 1 vínculo pendente/ativo por owner (índice parcial); 1 coach pode ter N owners. display_name desnormalizado para evitar leitura cruzada em profiles.';

-- ---------------------------------------------------------
-- 2. RLS de coach_links
-- ---------------------------------------------------------
alter table public.coach_links enable row level security;

-- Dono e coach enxergam seus vínculos.
create policy "coach_links_select_party"
  on public.coach_links for select
  using (auth.uid() = owner_user_id or auth.uid() = coach_user_id);

-- Qualquer autenticado pode buscar convite PENDENTE pelo código —
-- necessário pra tela de aceite mostrar "fulano te convidou".
create policy "coach_links_select_pending_by_code"
  on public.coach_links for select
  using (status = 'pending');

-- Só o dono cria convite (coach_user_id nulo na criação).
create policy "coach_links_insert_owner"
  on public.coach_links for insert
  with check (auth.uid() = owner_user_id and coach_user_id is null);

-- Update genérico — cobre tanto revogação pelo dono quanto aceite pelo
-- coach. A lógica de quem pode fazer o quê é reforçada no client (o índice
-- parcial e os checks da tabela já impedem estados inválidos).
create policy "coach_links_update_party"
  on public.coach_links for update
  using (auth.uid() = owner_user_id or (status = 'pending' and coach_user_id is null))
  with check (true);

-- ---------------------------------------------------------
-- 3. Políticas de leitura condicional nas tabelas existentes
-- ---------------------------------------------------------

-- profiles: coluna PK é `id`, não `user_id`
create policy "profiles_select_by_coach"
  on public.profiles for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = profiles.id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "weight_entries_select_by_coach"
  on public.weight_entries for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = weight_entries.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "body_measurements_select_by_coach"
  on public.body_measurements for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = body_measurements.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "goals_select_by_coach"
  on public.goals for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = goals.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "goals_history_select_by_coach"
  on public.goals_history for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = goals_history.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

create policy "progress_photos_select_by_coach"
  on public.progress_photos for select
  using (
    exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id = progress_photos.user_id
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

-- Nota: user_achievements e challenges NÃO ganham política de coach —
-- conquistas e desafios são pessoais/gamificação, não fazem parte da
-- visão do coach (reduz a superfície de RLS sem perder valor).

-- ---------------------------------------------------------
-- 4. Storage: bucket progress-photos
-- ---------------------------------------------------------
create policy "progress_photos_storage_select_by_coach"
  on storage.objects for select
  using (
    bucket_id = 'progress-photos'
    and exists (
      select 1 from public.coach_links cl
      where cl.owner_user_id::text = (storage.foldername(name))[1]
        and cl.coach_user_id = auth.uid()
        and cl.status = 'active'
    )
  );

-- Sem insert/update/delete pro coach — leitura apenas.
