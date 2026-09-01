-- ---------------------------------------------------------
-- Fase 6.1: Fotos de progresso
-- ---------------------------------------------------------

-- Bucket privado (idempotente)
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

-- Tabela de metadados (1 linha por foto/dia/usuário)
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_date date not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  constraint progress_photos_unique unique (user_id, photo_date)
);

create index if not exists progress_photos_user_idx
  on public.progress_photos (user_id, photo_date);

alter table public.progress_photos enable row level security;

create policy "progress_photos_select_own"
  on public.progress_photos for select
  using (auth.uid() = user_id);

create policy "progress_photos_insert_own"
  on public.progress_photos for insert
  with check (auth.uid() = user_id);

create policy "progress_photos_update_own"
  on public.progress_photos for update
  using (auth.uid() = user_id);

create policy "progress_photos_delete_own"
  on public.progress_photos for delete
  using (auth.uid() = user_id);

comment on table public.progress_photos is
  'Metadados de fotos de progresso. 1 foto por (user_id, photo_date) — upload no mesmo dia sobrescreve. O arquivo em si vive no bucket privado progress-photos, path {user_id}/{photo_date}.jpg.';

-- RLS do bucket: cada usuário só acessa objetos na própria pasta
create policy "progress_photos_storage_select_own"
  on storage.objects for select
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "progress_photos_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "progress_photos_storage_update_own"
  on storage.objects for update
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "progress_photos_storage_delete_own"
  on storage.objects for delete
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
