# Fase 6.1 — Fotos de progresso (spec v2)

**Status:** v2, auditada contra o código real via `project_knowledge_search`
(`NavBar.tsx`, `loadUserData.ts`, `database.ts`, `supabase/server.ts`,
`supabase/client.ts`, `get-theme.ts`, `WeightEntryForm.tsx`,
`BodyMeasurementForm.tsx`, `CsvImporter.tsx`, `GoalsForm.tsx`,
`goals/page.tsx`, `api/export/pdf/route.tsx`, `streak.ts`, `schema.sql`).
Pronta para handoff ao Claude Code.

Primeiro item da Fase 6 (Ticket alto): Fotos de progresso (Supabase Storage
+ comparação lado a lado).

---

## 1. Decisões fechadas com o usuário

1. **1 foto por dia**, mesmo padrão de `weight_entries`/`body_measurements`
   — enviar uma nova foto no mesmo dia sobrescreve a anterior (upsert).
2. **Comparação lado a lado por escolha livre de 2 datas** (dois `<select>`
   com as datas que têm foto), não uma comparação fixa "primeira vs mais
   recente".
3. **Página nova dedicada** `/dashboard/photos`, com link próprio no
   `NavBar` — não é uma aba dentro de `/dashboard/measurements`.

## 2. Decisões técnicas (confirmadas pela auditoria)

- **Bucket privado** no Supabase Storage (`progress-photos`), não público —
  mesma filosofia de RLS-first do resto do projeto (decisão 3 do
  `CLAUDE.md`). Leitura via signed URL, geradas no server a cada
  carregamento da página (expiração 1h).
- **Caminho do arquivo = `{user_id}/{photo_date}.jpg`** — sempre `.jpg`,
  normalizado no client antes do upload. O "1 foto por dia" é garantido
  pelo próprio path (upload com `upsert: true` sobrescreve), sem lógica
  extra de "deletar o antigo antes de subir o novo".
- **Redimensionamento + conversão pra JPEG no client**, via `<canvas>`,
  antes do upload: lado maior limitado a 1600px, qualidade 0.85.
- **RLS de Storage por pasta**: política usa
  `(storage.foldername(name))[1] = auth.uid()::text`.
- **Página não altera `loadUserData()`** — chama `loadUserData()` só pra
  obter `user`/`profile`/tema (mesmo padrão de `goals/page.tsx`), e faz sua
  própria query de `progress_photos` + `createSignedUrls` direto na página.
  Fotos não são consumidas por nenhuma outra página.
- **`createClient()` server-side é síncrono** (confirmado:
  `src/lib/supabase/server.ts` retorna direto o resultado de
  `createServerClient`, sem `await`) — chamá-lo sem `await` na
  `photos/page.tsx` é correto, mesmo padrão de `loadUserData.ts`,
  `goals/page.tsx`, `api/export/pdf/route.tsx`.
- **`createClient()` client-side é síncrono** (confirmado:
  `src/lib/supabase/client.ts` retorna `createBrowserClient`, sem `await`)
  — pode ser chamado no corpo do componente (fora de `useEffect`), mesmo
  padrão de `WeightEntryForm`, `CsvImporter`, `GoalsForm`.
- **`getTheme()` é async** (confirmado: `src/lib/get-theme.ts` faz
  `await cookies()`, retorna `Promise<Theme>`) — precisa de `await` no
  Server Component, mesmo padrão de todas as páginas do dashboard.
- **Token de cor para mensagem de erro: `text-signal-behind`** (confirmado:
  `WeightEntryForm.tsx`, `BodyMeasurementForm.tsx`, `GoalsForm.tsx`,
  `CsvImporter.tsx` — todos usam `text-signal-behind` para mensagens de
  erro, com sizing `text-sm`). Não existe token de erro dedicado; o padrão
  do projeto é reusar `signal-behind`.
- **Data de hoje usa `Intl.DateTimeFormat("en-CA", { timeZone:
  "America/Sao_Paulo" })`** (confirmado em `streak.ts`; o
  `WeightEntryForm.tsx` usa `format(new Date(), "yyyy-MM-dd")` do date-fns,
  que retorna a data no fuso local do processo — correto no browser mas
  arriscado em SSR). Para consistência com o resto do projeto, o
  `PhotoUploadForm` usa o helper `Intl` explícito.
- **`max` do input date = hoje em SP** (evita data futura, mesmo padrão de
  `WeightEntryForm` e `BodyMeasurementForm` — no `WeightEntryForm` é
  `format(new Date(), "yyyy-MM-dd")`, no nosso caso usamos `todayIso()` com
  `Intl` pra consistência de fuso).

## 3. Migração SQL — `supabase/migrations/0008_progress_photos.sql`

```sql
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
```

**Rodar manualmente no Supabase Dashboard > SQL Editor** — sem ela,
`/dashboard/photos` quebra em produção (bucket e tabela inexistentes).

Também adicionar ao `supabase/schema.sql`, seção nova
"9. Fotos de progresso" (sem o `insert into storage.buckets`, que é
migração pontual):

```sql
-- ---------------------------------------------------------
-- 9. Fotos de progresso
-- Ver supabase/migrations/0008_progress_photos.sql
-- ---------------------------------------------------------
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
```

## 4. Tipos — `src/types/database.ts`

Adicionar o tipo e registrar em `Database.Tables`:

```diff
+export type ProgressPhoto = {
+  id: string;
+  user_id: string;
+  photo_date: string; // formato YYYY-MM-DD
+  storage_path: string;
+  created_at: string;
+};
+
 export type Database = {
   public: {
     Tables: {
       ...
+      progress_photos: {
+        Row: ProgressPhoto;
+        Insert: Partial<ProgressPhoto> & { user_id: string; photo_date: string; storage_path: string };
+        Update: Partial<ProgressPhoto>;
+        Relationships: [];
+      };
     };
   };
 };
```

**Posição:** tipo `ProgressPhoto` logo depois de `UserAchievement`; entrada
de `progress_photos` no final de `Tables`, depois de `user_achievements`.

**Contexto expandido para `str_replace`** — inserir `ProgressPhoto` depois
de `UserAchievement`:

```
OLD:
export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
};

export type Database = {

NEW:
export type UserAchievement = {
  id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: string;
};

export type ProgressPhoto = {
  id: string;
  user_id: string;
  photo_date: string; // formato YYYY-MM-DD
  storage_path: string;
  created_at: string;
};

export type Database = {
```

E no `Tables`, inserir depois de `user_achievements`:

```
OLD:
      user_achievements: {
        Row: UserAchievement;
        Insert: Partial<UserAchievement> & { user_id: string; achievement_key: string };
        Update: never; // conquistas não são editáveis
        Relationships: [];
      };
    };

NEW:
      user_achievements: {
        Row: UserAchievement;
        Insert: Partial<UserAchievement> & { user_id: string; achievement_key: string };
        Update: never; // conquistas não são editáveis
        Relationships: [];
      };
      progress_photos: {
        Row: ProgressPhoto;
        Insert: Partial<ProgressPhoto> & { user_id: string; photo_date: string; storage_path: string };
        Update: Partial<ProgressPhoto>;
        Relationships: [];
      };
    };
```

## 5. Arquivo novo — `src/lib/image.ts`

Função pura de client (usa `document`/`Image`/`canvas`, não roda em
Server Component). Sem dependência de libs externas.

```ts
/**
 * Redimensiona e converte uma imagem para JPEG antes do upload.
 * Lado maior limitado a maxDimension; qualidade fixa em 0.85.
 * Roda inteiramente no browser (canvas), sem chamada de rede.
 */
export async function resizeImageToJpeg(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("invalid_image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unsupported");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error("encode_failed");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
```

## 6. Arquivo novo — `src/components/photos/PhotoUploadForm.tsx`

Client component. Formulário: input de data (default hoje em SP,
`max` = hoje em SP) + input de arquivo (`accept="image/*"`).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resizeImageToJpeg } from "@/lib/image";

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default function PhotoUploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [photoDate, setPhotoDate] = useState(todayIso());
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo depois de um erro
    if (!file) return;

    setError(null);
    setIsUploading(true);
    try {
      const jpeg = await resizeImageToJpeg(file);
      const path = `${userId}/${photoDate}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("progress-photos")
        .upload(path, jpeg, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from("progress_photos")
        .upsert(
          { user_id: userId, photo_date: photoDate, storage_path: path },
          { onConflict: "user_id,photo_date" }
        );
      if (dbError) throw dbError;

      router.refresh();
    } catch {
      setError("Não foi possível processar essa imagem, tente novamente com JPG ou PNG.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="rounded-card border border-base-border bg-base-surface p-6 space-y-4">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Enviar foto</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Data da foto</label>
          <input
            type="date"
            value={photoDate}
            max={todayIso()}
            onChange={(e) => setPhotoDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Foto</label>
          <label className="flex items-center justify-center w-full rounded-lg border border-dashed border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink-muted cursor-pointer hover:border-accent transition">
            {isUploading ? "Enviando..." : "Escolher imagem"}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <p className="text-xs text-ink-faint">
        Enviar uma foto no mesmo dia substitui a anterior.
      </p>
    </div>
  );
}
```

**Diferenças da v1 → v2:**
- Input de arquivo agora usa `label` estilizado com `cursor-pointer` em vez
  de `<input type="file">` nativo — mais consistente visualmente com o
  padrão do projeto (botões estilizados, não controles nativos do browser).
- Grid 2 colunas (`grid grid-cols-2 gap-3`) alinhando data + botão de
  escolher imagem, mesmo layout de `WeightEntryForm` (confirmado: `grid
  grid-cols-2 gap-3` com data à esquerda).
- Classe do input date idêntica à de `WeightEntryForm`/`BodyMeasurementForm`
  (confirmado: `w-full rounded-lg bg-base-surface2 border border-base-border
  px-3 py-2 text-sm outline-none focus:border-accent`).
- Cabeçalho `text-xs uppercase tracking-wide text-ink-muted` — mesmo padrão
  de `WeightEntryForm` ("Registrar pesagem") e `BodyMeasurementForm`
  ("Registrar medidas").

## 7. Arquivo novo — `src/components/photos/DeletePhotoButton.tsx`

Client component. `window.confirm` para exclusão, mesmo padrão de
`BodyMeasurementsList.tsx` e `EntriesList.tsx`.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeletePhotoButton({
  userId,
  photoDate,
  storagePath,
}: {
  userId: string;
  photoDate: string;
  storagePath: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Excluir a foto de ${photoDate}?`)) return;
    setIsDeleting(true);
    try {
      await supabase.storage.from("progress-photos").remove([storagePath]);
      await supabase
        .from("progress_photos")
        .delete()
        .eq("user_id", userId)
        .eq("photo_date", photoDate);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-xs text-ink-faint hover:text-signal-behind transition"
    >
      {isDeleting ? "..." : "Excluir"}
    </button>
  );
}
```

**Diferença da v1 → v2:** botão mostra "..." durante deleção (mesmo padrão
de `BodyMeasurementsList` que mostra `opacity-60` no item sendo deletado).

## 8. Arquivo novo — `src/components/photos/PhotoHistoryGrid.tsx`

Server component (sem `"use client"` — a única interação é
`DeletePhotoButton`, que é client isolado). Grid responsivo de thumbnails,
mais recente primeiro (a query na `page.tsx` já ordena `photo_date desc`).

```tsx
import DeletePhotoButton from "./DeletePhotoButton";

type PhotoWithUrl = {
  photo_date: string;
  storage_path: string;
  url: string;
};

export default function PhotoHistoryGrid({
  userId,
  photos,
}: {
  userId: string;
  photos: PhotoWithUrl[];
}) {
  if (photos.length === 0) {
    return (
      <div className="rounded-card border border-base-border bg-base-surface p-6 text-center text-sm text-ink-faint">
        Nenhuma foto ainda. Envie a primeira acima.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {photos.map((p) => (
        <div key={p.photo_date} className="space-y-1">
          <img
            src={p.url}
            alt={`Foto de progresso de ${p.photo_date}`}
            className="rounded-card border border-base-border aspect-[3/4] object-cover w-full"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">{p.photo_date}</span>
            <DeletePhotoButton
              userId={userId}
              photoDate={p.photo_date}
              storagePath={p.storage_path}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Nota sobre `aspect-[3/4]`:** não existe precedente no projeto de
aspect ratio em imagem. `aspect-[3/4]` é proporção retrato comum para
fotos de progresso (corpo inteiro). Tailwind `aspect-[3/4]` gera
`aspect-ratio: 3/4` — é classe estática (sem template literal), safe
para purge.

## 9. Arquivo novo — `src/components/photos/PhotoComparisonView.tsx`

Client component (`useState` pra controlar as 2 datas selecionadas).

```tsx
"use client";

import { useState } from "react";

type PhotoWithUrl = { photo_date: string; url: string };

export default function PhotoComparisonView({ photos }: { photos: PhotoWithUrl[] }) {
  // Default: mais antiga à esquerda, mais recente à direita
  // (photos vem ordenado desc da page, então [last] = mais antiga, [0] = mais recente)
  const [leftDate, setLeftDate] = useState(photos.at(-1)?.photo_date ?? "");
  const [rightDate, setRightDate] = useState(photos[0]?.photo_date ?? "");

  if (photos.length < 2) {
    return (
      <p className="text-sm text-ink-faint">
        Envie fotos em pelo menos 2 datas diferentes para comparar lado a lado.
      </p>
    );
  }

  const left = photos.find((p) => p.photo_date === leftDate);
  const right = photos.find((p) => p.photo_date === rightDate);

  // Ordenar datas crescente para os selects (mais intuitivo: antiga→recente)
  const sortedPhotos = [...photos].sort((a, b) =>
    a.photo_date.localeCompare(b.photo_date)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Antes</label>
          <select
            value={leftDate}
            onChange={(e) => setLeftDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {sortedPhotos.map((p) => (
              <option key={p.photo_date} value={p.photo_date}>
                {p.photo_date}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Depois</label>
          <select
            value={rightDate}
            onChange={(e) => setRightDate(e.target.value)}
            className="w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {sortedPhotos.map((p) => (
              <option key={p.photo_date} value={p.photo_date}>
                {p.photo_date}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {left ? (
          <img
            src={left.url}
            alt={`Foto de ${left.photo_date}`}
            className="rounded-card border border-base-border w-full"
          />
        ) : (
          <div className="rounded-card border border-base-border bg-base-surface2 aspect-[3/4]" />
        )}
        {right ? (
          <img
            src={right.url}
            alt={`Foto de ${right.photo_date}`}
            className="rounded-card border border-base-border w-full"
          />
        ) : (
          <div className="rounded-card border border-base-border bg-base-surface2 aspect-[3/4]" />
        )}
      </div>
    </div>
  );
}
```

**Diferenças da v1 → v2:**
- Labels "Antes"/"Depois" acima dos selects (mais claro que selects sem
  contexto) — mesma estrutura `<label className="block text-xs
  text-ink-muted mb-1.5">` dos forms do projeto.
- Classe do `<select>` alinhada com os `<input>` do projeto: `w-full
  rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm
  outline-none focus:border-accent`.
- Datas ordenadas crescente nos selects (mais intuitivo para "antes/depois").
- Placeholder div tem `bg-base-surface2` (não transparente).
- Os dois `<select>` continuam independentes (sem bloquear mesma data nos
  dois lados — decisão deliberada, caso inofensivo).

## 10. Arquivo novo — `src/app/(app)/dashboard/photos/page.tsx`

Server Component. Segue o padrão de `goals/page.tsx`: chama
`loadUserData()` só pelo que precisa (`user`, `profile`), mais
`getTheme()`, e faz sua própria query.

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import PhotoUploadForm from "@/components/photos/PhotoUploadForm";
import PhotoHistoryGrid from "@/components/photos/PhotoHistoryGrid";
import PhotoComparisonView from "@/components/photos/PhotoComparisonView";
import type { ProgressPhoto } from "@/types/database";

export default async function PhotosPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("photo_date", { ascending: false });

  const photoRows = (rows as ProgressPhoto[]) ?? [];

  let photos: { photo_date: string; storage_path: string; url: string }[] = [];
  if (photoRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(
        photoRows.map((p) => p.storage_path),
        3600
      );
    photos = photoRows.map((p, i) => ({
      photo_date: p.photo_date,
      storage_path: p.storage_path,
      url: signed?.[i]?.signedUrl ?? "",
    }));
  }

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <PhotoUploadForm userId={user.id} />
        <section>
          <h2 className="font-display font-bold text-lg mb-3">Comparar</h2>
          <PhotoComparisonView photos={photos} />
        </section>
        <section>
          <h2 className="font-display font-bold text-lg mb-3">Histórico</h2>
          <PhotoHistoryGrid userId={user.id} photos={photos} />
        </section>
      </main>
    </div>
  );
}
```

**Notas de auditoria:**
- `createClient()` sem `await` — correto (confirmado: server-side
  `createClient` é síncrono).
- `createSignedUrls` (plural) retorna resultados na mesma ordem dos paths
  de entrada — o `.map((p, i) => ...)` assume isso (documentado no
  supabase-js). Se um path individual falhar (arquivo removido do bucket
  fora do fluxo), `signedUrl` fica ausente; fallback `?? ""` renderiza
  `<img>` quebrada — aceitável pro escopo.
- `max-w-6xl` — confirmado como container do dashboard (CLAUDE.md:
  "Containers do dashboard usam `max-w-6xl`").
- `font-display font-bold text-lg` — mesma tipografia de títulos de seção
  em `GoalsForm` ("Suas metas de perda de peso").

## 11. Patch — `src/components/NavBar.tsx`

**Contexto expandido para `str_replace`:**

```
OLD:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/settings", label: "Configurações" },
];

NEW:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/photos", label: "Fotos" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/settings", label: "Configurações" },
];
```

"Fotos" entra depois de "Medidas" (registros físicos periódicos, mesma
vizinhança temática). Isso leva o array a 7 itens + "Ajuda" (`<button>`
fora do `.map()`) = **8 elementos visuais em mobile** — o `overflow-x-auto`
do `<nav className="sm:hidden ...">` já cobria 7 elementos (Fase 5.4
adicionou "Relatórios"). **Checklist de teste deve confirmar** que 8 ainda
cabe sem cortar labels ilegivelmente em telas ≥ 320px.

## 12. Fora de escopo (não implementar nesta sub-fase)

- Múltiplas fotos por dia (frente/lado/costas simultâneos).
- Slider de comparação (arrastar) — comparação é lado a lado estático.
- Fotos no PDF exportado (`api/export/pdf/route.tsx` não muda).
- Fotos no CSV de export/import.
- Gate de plano (Básico vs Completo) — Fase 7.
- Suporte formal a HEIC — best-effort via canvas.
- Marca d'água ou processamento além de resize+compressão.
- Compartilhamento de fotos fora do app.
- Mudança em `loadUserData.ts` (fotos ficam fora — query isolada na página).
- Mudança em `api/export/pdf/route.tsx` ou `api/export/csv/route.ts`.

## 13. Checklist de teste

- [ ] Rodar `supabase/migrations/0008_progress_photos.sql` no Supabase
      Dashboard — conferir bucket `progress-photos` privado, tabela
      `progress_photos` criada, 8 políticas de RLS ativas (4 tabela +
      4 storage).
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Link "Fotos" aparece no `NavBar` (desktop e mobile), entre "Medidas"
      e "Metas" — 8 elementos visuais em mobile.
- [ ] Upload de foto grande (celular, >5MB): completa sem erro, arquivo no
      Storage é bem menor (~JPEG redimensionado).
- [ ] Upload de segunda foto na mesma data: sobrescreve (mesmo path), não
      duplica na tabela nem no bucket.
- [ ] Upload em datas diferentes: registros separados no histórico,
      ordenados do mais recente pro mais antigo.
- [ ] Tentar data futura no input: bloqueado pelo `max`.
- [ ] Comparação: 2 `<select>` listam todas as datas; trocar qualquer um
      atualiza a imagem sem nova query.
- [ ] 0 ou 1 foto: seção "Comparar" mostra mensagem, sem quebrar.
- [ ] Excluir foto: `window.confirm`, some do histórico e da comparação,
      arquivo removido do bucket.
- [ ] RLS: usuário A não vê fotos do usuário B.
- [ ] Signed URLs expiram em 1h — reabrir gera novas URLs.
- [ ] Tema claro/escuro: bordas, `ink-faint`, botão de excluir com
      contraste adequado.
- [ ] Mobile: grid histórico (2 colunas em telas pequenas) e selects de
      comparação sem overflow horizontal.
- [ ] Conta nova (nunca fez upload): página carrega sem erro, mostra
      formulário de upload + "Nenhuma foto ainda" no histórico +
      mensagem de "envie 2 datas" na comparação.

## 14. Ordem de execução

1. Rodar `supabase/migrations/0008_progress_photos.sql` no Supabase
   Dashboard (SQL Editor).
2. Atualizar `supabase/schema.sql` (seção 9, conforme seção 3 acima).
3. Atualizar `src/types/database.ts` (seção 4, com contexto expandido).
4. Criar `src/lib/image.ts` (seção 5).
5. Criar `src/components/photos/PhotoUploadForm.tsx` (seção 6).
6. Criar `src/components/photos/DeletePhotoButton.tsx` (seção 7).
7. Criar `src/components/photos/PhotoHistoryGrid.tsx` (seção 8).
8. Criar `src/components/photos/PhotoComparisonView.tsx` (seção 9).
9. Criar `src/app/(app)/dashboard/photos/page.tsx` (seção 10).
10. Aplicar patch em `src/components/NavBar.tsx` (seção 11).
11. `npx tsc --noEmit` e `npm run build`.
12. Rodar checklist de teste manual (seção 13).
13. Atualizar `CLAUDE.md` (nova seção "Fase 6.1 — Fotos de progresso") e
    marcar o item em `claude_fases.md`.

---

## Apêndice A — Correções da auditoria v1 → v2

### A1. `getTheme()` é async (SEVERIDADE: BAIXA — correto na v1 por analogia)

**v1 dizia:** "confirmar nome exato da função e assinatura".
**Código real:** `export async function getTheme(): Promise<Theme>` em
`src/lib/get-theme.ts` — faz `await cookies()`, retorna `Promise<Theme>`.
**v1 já usava `await getTheme()` na `page.tsx`, então estava correto.
Confirmado sem mudança.**

### A2. `createClient()` server é síncrono (SEVERIDADE: BAIXA — correto na v1)

**v1 dizia:** "confirmar que é síncrono".
**Código real:** `src/lib/supabase/server.ts` — `export function
createClient()` retorna `createServerClient(...)` direto, sem `async/await`.
**v1 já chamava sem `await`, correto. Confirmado sem mudança.**

### A3. `createClient()` client é síncrono (SEVERIDADE: BAIXA — correto na v1)

**Código real:** `src/lib/supabase/client.ts` — `export function
createClient()` retorna `createBrowserClient(...)` direto.
**Confirmado sem mudança.**

### A4. Token de erro é `text-signal-behind` (SEVERIDADE: BAIXA)

**v1 dizia:** "confirmar se `text-signal-behind` é o token certo ou se
existe um dedicado".
**Código real:** `WeightEntryForm.tsx`, `BodyMeasurementForm.tsx`,
`GoalsForm.tsx`, `CsvImporter.tsx` — todos usam:
```
{error && <p className="text-sm text-signal-behind">{error}</p>}
```
**Não existe token de erro dedicado. `text-signal-behind` é o padrão.
v1 estava correto. Confirmado sem mudança.**

### A5. Classes de input/select alinhadas com o projeto (SEVERIDADE: MÉDIA)

**v1 tinha:** classes parciais nos inputs (faltava `w-full`, `outline-none`,
`focus:border-accent`).
**Código real:** padrão consistente em todos os forms:
`w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2
text-sm outline-none focus:border-accent`.
**Correção:** todas as classes de input e select na v2 agora replicam
exatamente esse padrão.

### A6. Input de arquivo nativo → label estilizado (SEVERIDADE: MÉDIA)

**v1 tinha:** `<input type="file" className="text-sm">` — controle nativo
do browser, visualmente inconsistente com o resto do app.
**Correção:** v2 usa `<label>` estilizado com `cursor-pointer` e `<input
className="hidden">` dentro — mesmo padrão visual de botões do projeto.

### A7. Layout do formulário de upload (SEVERIDADE: MÉDIA)

**v1 tinha:** campos empilhados verticalmente (espaçamento genérico).
**Código real:** `WeightEntryForm` usa `grid grid-cols-2 gap-3` para data +
peso lado a lado.
**Correção:** v2 usa o mesmo `grid grid-cols-2 gap-3`, com data à esquerda
e botão de escolher imagem à direita.

### A8. Cabeçalho do card de upload (SEVERIDADE: BAIXA)

**v1 não tinha** cabeçalho `text-xs uppercase tracking-wide text-ink-muted`.
**Código real:** `WeightEntryForm` ("Registrar pesagem"),
`BodyMeasurementForm` ("Registrar medidas") — todos têm.
**Correção:** v2 adiciona "Enviar foto" no mesmo estilo.

### A9. Estado vazio do histórico (SEVERIDADE: BAIXA)

**v1 tinha:** `<p>` simples para estado vazio.
**Código real:** `BodyMeasurementsList` envolve o estado vazio em
`rounded-card border border-base-border bg-base-surface p-6 text-center`.
**Correção:** v2 usa o mesmo container para o estado vazio do histórico.

### A10. `PhotoComparisonView` — labels e ordem dos selects (SEVERIDADE: MÉDIA)

**v1 tinha:** selects sem label, datas na ordem que vieram (desc).
**Correção:** v2 adiciona labels "Antes"/"Depois", ordena datas crescente
nos selects (mais intuitivo).

### A11. `todayIso()` usando `Intl` em vez de `date-fns` (SEVERIDADE: BAIXA)

**v1 já usava `Intl.DateTimeFormat("en-CA", { timeZone:
"America/Sao_Paulo" })`.** Confirmado como o padrão correto do projeto
(documentado no `streak.ts` e no `CLAUDE.md`: "Sempre usar
`America/Sao_Paulo` via `Intl.DateTimeFormat`"). `WeightEntryForm` usa
`format(new Date(), "yyyy-MM-dd")` do date-fns (que usa fuso do processo —
correto no browser client component, mas o padrão `Intl` é mais explícito).
**Sem mudança — v1 já estava correto.**

### A12. `DeletePhotoButton` — feedback visual durante deleção (SEVERIDADE: BAIXA)

**v1 não mostrava** indicação de que a deleção está em andamento.
**Correção:** v2 mostra "..." no texto do botão durante `isDeleting`.
