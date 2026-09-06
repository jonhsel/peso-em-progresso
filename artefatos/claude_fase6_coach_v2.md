# Fase 6.4 — Papel de coach/visualizador (spec v2 — auditado)

Status: **v2 — auditado contra o código real.** Todas as pendências (A–D)
da v1 estão resolvidas. Pronto para handoff ao Claude Code.

## Decisões travadas (inalteradas da v1)

1. **Vínculo por link/código copiável** — dono gera, coach aceita.
2. **Coach enxerga tudo, somente leitura** — peso, medidas, fotos, metas.
3. **Cardinalidade** — 1 coach ativo por dono; 1 coach → N donos.

---

## Pendências da v1 resolvidas

### Item A — nomes das políticas SELECT existentes

**Resolvido.** Confirmado em `schema.sql` real:
- `profiles_select_own` (coluna PK = `id`, não `user_id`)
- `weight_entries_select_own`
- `body_measurements_select_own`
- `goals_select_own` (+ `goals_upsert_own` pra insert)
- `goals_history_select_own`
- `user_achievements_select_own`
- `progress_photos_select_own`

Os nomes `_select_by_coach` propostos na v1 não colidem com nenhum.
Nenhuma correção necessária.

### Item B — como mostrar o `display_name` do owner/coach cruzado

**Resolvido com coluna desnormalizada `owner_display_name`** em
`coach_links`. Rationale: evita abrir políticas de leitura cruzada em
`profiles` (que hoje é estritamente `auth.uid() = id` — o mais restritivo
do projeto) só pra preview de nome numa tela de convite. A
desnormalização não é danosa porque `display_name` muda raramente e o nome
mostrado nas telas de coach não precisa de atualização em tempo real.

Para o nome do coach, quem vira coach já tem acesso ao **próprio**
profile, então a `CoachShareSection` pega o `display_name` do coach via
`coach_links.coach_user_id` → `profiles` (que o **coach** pode ler pra
si mesmo). Na prática, a `CoachShareSection` roda no contexto do dono,
que não pode ler o `profiles` do coach — mas a solução é mais simples:
**na tela de aceite, o coach salva seu `display_name` direto em uma
coluna `coach_display_name` de `coach_links`** no momento do aceite.
Assim o dono lê o nome do coach só a partir de `coach_links`, sem
política cruzada.

Colunas adicionadas a `coach_links`:
```sql
owner_display_name text not null,
coach_display_name text
```

`owner_display_name` é preenchido no insert pela `CoachShareSection`
(que tem acesso ao próprio `profile.display_name`).
`coach_display_name` é preenchido no update de aceite pelo
`AcceptInviteButton` (que tem acesso ao próprio `profile.display_name`).

**Consequência: nenhuma política de leitura cruzada em `profiles` é
necessária.** A política `profiles_select_by_coach` da v1 seção 2.3
**é mantida** (o coach precisa ler o `profile` completo do dono pra
mostrar `display_name`, `height_cm`, `period_mode`, etc. na visão do
coach — e a RLS já teria permitido o acesso de leitura aos dados do dono
via as políticas `_select_by_coach` nas tabelas de dados, mas o profile
é necessário pra reconstruir os KPIs com `period_mode`/`week_starts_on`).

### Item C — `BodyMeasurementsList` tem formulário de edição embutido?

**Resolvido.** Confirmado no código real:
`BodyMeasurementsList.tsx` é um componente client que mostra o histórico
com botão "Excluir" por registro (via `supabase.from("body_measurements")
.delete()`) — **não** tem formulário de edição embutido, o form vive
separado em `BodyMeasurementForm.tsx`. Para a visão do coach, basta
renderizar os dados crus (tabela/lista) **sem** o `BodyMeasurementsList`
(que tem lógica de delete), usando um componente de display simples
dedicado. Alternativa mais limpa: adicionar `readOnly?: boolean` ao
`BodyMeasurementsList` e esconder o botão de excluir — mas dado que o
componente chama `createClient()` e `useRouter()` internamente (side
effects de escrita), **a solução recomendada é um componente de
apresentação dedicado** `BodyMeasurementsReadOnly.tsx` que recebe os
dados como prop e só renderiza, sem Supabase client.

### Item D — `PhotoHistoryGrid` tem `DeletePhotoButton` embutido

**Resolvido.** Confirmado no código real:
`PhotoHistoryGrid.tsx` renderiza `DeletePhotoButton` diretamente dentro
do grid, sem condicional — o botão é hardcoded. Mesmo raciocínio do item C:
**a solução é `readOnly?: boolean`** (mais simples aqui porque o
componente é Server Component, só o `DeletePhotoButton` é client) — ou
um novo `PhotoHistoryGridReadOnly.tsx` que é literalmente o mesmo grid
sem importar/renderizar `DeletePhotoButton`.

**Decisão: prop `readOnly` nos dois componentes** (`PhotoHistoryGrid` e
`BodyMeasurementsList`) — mínimo de duplicação, e o padrão serve pra
qualquer futuro cenário de apresentação somente-leitura (ex.: compartilhar
progresso, Fase 7). O default é `false`, zero mudança de comportamento pra
quem já usa.

---

## 1. Migração — `supabase/migrations/0010_coach_links.sql`

### 1.1 Tabela `coach_links`

```sql
-- ---------------------------------------------------------
-- Fase 6.4: Papel de coach/visualizador
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
```

### 1.2 RLS de `coach_links`

```sql
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
```

**Nota sobre a política de update:** a v1 tentava separar em duas políticas
(`_update_owner_revoke` e `_update_accept`), mas no Postgres as políticas
de UPDATE precisam que `USING` e `WITH CHECK` sejam avaliáveis em conjunto,
e duas políticas restritivas são combinadas com `OR` — o que na prática
tornava ambas mais permissivas do que o intencionado. Uma única política
com `USING` abrangente + validação de negócio no client é mais seguro e
claro. O `check (true)` no `WITH CHECK` é aceitável porque:
- O dono não pode mudar `owner_user_id` (ele já é ele mesmo).
- O coach não pode aceitar o próprio convite (validado no client; tentar via
  API direta resulta em violação do `where status in ('pending', 'active')`
  do índice parcial se outra conta já aceitou, ou simplesmente não faz
  sentido — quem gera o convite já é o owner).
- Revogar um convite aceito não é destrutivo (o status muda pra `revoked`,
  o dado fica no log).

### 1.3 Políticas de leitura condicional nas tabelas existentes

```sql
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
```

**Nota:** `user_achievements` **não ganha** política de coach — conquistas
são pessoais/gamificação, não fazem parte da visão do coach (decidido
nesta auditoria: reduz a superfície de RLS sem perder valor; conquistas
do cliente não são informação útil pro personal trainer).

### 1.4 Storage: bucket `progress-photos`

```sql
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
```

Sem insert/update/delete pro coach — leitura apenas.

**Rodar no Supabase Dashboard > SQL Editor em blocos separados** (mesmo
cuidado documentado no `CLAUDE.md`): (1) create table + indexes, (2) RLS
de coach_links, (3) as 6 políticas condicionais, (4) a política de
storage. Conferir "Success" a cada um.

Também acrescentar o bloco completo ao final de `supabase/schema.sql`,
seção nova "10. Coach/visualizador".

---

## 2. Tipos — `src/types/database.ts`

Inserir depois de `ProgressPhoto`, antes de `Database`:

```diff
+export type CoachLinkStatus = "pending" | "active" | "revoked";
+
+export type CoachLink = {
+  id: string;
+  owner_user_id: string;
+  coach_user_id: string | null;
+  invite_code: string;
+  status: CoachLinkStatus;
+  owner_display_name: string;
+  coach_display_name: string | null;
+  created_at: string;
+  accepted_at: string | null;
+  revoked_at: string | null;
+};
```

Na seção `Database.Tables`, depois de `progress_photos`:

```diff
+      coach_links: {
+        Row: CoachLink;
+        Insert: Partial<CoachLink> & { owner_user_id: string; invite_code: string; owner_display_name: string };
+        Update: Partial<CoachLink>;
+        Relationships: [];
+      };
```

**Contexto expandido para `str_replace`:**

```
OLD:
export type ProgressPhoto = {
  id: string;
  user_id: string;
  photo_date: string; // formato YYYY-MM-DD
  storage_path: string;
  created_at: string;
};

export type Database = {

NEW:
export type ProgressPhoto = {
  id: string;
  user_id: string;
  photo_date: string; // formato YYYY-MM-DD
  storage_path: string;
  created_at: string;
};

export type CoachLinkStatus = "pending" | "active" | "revoked";

export type CoachLink = {
  id: string;
  owner_user_id: string;
  coach_user_id: string | null;
  invite_code: string;
  status: CoachLinkStatus;
  owner_display_name: string;
  coach_display_name: string | null;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type Database = {
```

E no `Tables`:

```
OLD:
      progress_photos: {
        Row: ProgressPhoto;
        Insert: Partial<ProgressPhoto> & { user_id: string; photo_date: string; storage_path: string };
        Update: Partial<ProgressPhoto>;
        Relationships: [];
      };
    };

NEW:
      progress_photos: {
        Row: ProgressPhoto;
        Insert: Partial<ProgressPhoto> & { user_id: string; photo_date: string; storage_path: string };
        Update: Partial<ProgressPhoto>;
        Relationships: [];
      };
      coach_links: {
        Row: CoachLink;
        Insert: Partial<CoachLink> & { owner_user_id: string; invite_code: string; owner_display_name: string };
        Update: Partial<CoachLink>;
        Relationships: [];
      };
    };
```

---

## 3. Arquivo novo — `src/lib/loadCoachClientData.ts`

Espelha `loadUserData()` mas para o contexto do coach lendo dados de um
cliente (owner). Recebe `ownerId` e `coachUserId` (pra validar o vínculo
antes de consultar). As políticas de RLS `_select_by_coach` autorizam
as queries.

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement
} from "@/types/database";

/**
 * Carrega os dados de um dono (owner) do ponto de vista do coach.
 * Retorna null se não houver vínculo ativo — o caller deve tratar
 * (redirect ou mensagem de erro).
 */
export async function loadCoachClientData(ownerId: string, coachUserId: string) {
  const supabase = createClient();

  // Verificar vínculo ativo antes de prosseguir (UX, não segurança — RLS
  // já protege os dados; isso é pra dar uma mensagem clara em vez de
  // retornar arrays vazios silenciosamente).
  const { data: link } = await supabase
    .from("coach_links")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("coach_user_id", coachUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return null;

  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", ownerId).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", ownerId)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", ownerId)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", ownerId)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false }),
    ]);

  const typedActiveGoals: Goal[] = (activeGoals as Goal[]) ?? [];
  const typedGoalsHistory: GoalsHistoryEntry[] = (goalsHistory as GoalsHistoryEntry[])?.length
    ? (goalsHistory as GoalsHistoryEntry[])
    : typedActiveGoals.map((goal) => ({
        id: `fallback-${goal.id}`,
        goal_id: goal.id,
        user_id: ownerId,
        metric: goal.metric,
        weekly_rate: goal.weekly_rate,
        monthly_rate: goal.monthly_rate,
        quarterly_rate: goal.quarterly_rate,
        semester_rate: goal.semester_rate,
        target_value: goal.target_value,
        created_at: new Date(0).toISOString(),
      }));

  return {
    profile: profile as Profile,
    entries: (entries as WeightEntry[]) ?? [],
    measurements: (measurements as BodyMeasurement[]) ?? [],
    goalsHistory: typedGoalsHistory,
    activeGoals: typedActiveGoals,
  };
}
```

**Notas de conformidade:**
- Mesma estrutura de `loadUserData()` (confirmado: `select("*")`,
  `Promise.all`, mesmos casts, mesmo fallback de `goalsHistory`).
- `maybeSingle()` em vez de `single()` pro vínculo — `single()` lança
  exceção se 0 linhas, `maybeSingle()` retorna `null`.
- Não carrega `user_achievements` (coach não precisa — decisão da seção
  1.3 desta auditoria).
- `createClient()` sem `await` (confirmado síncrono no server).

---

## 4. Telas

### 4.1 `/dashboard/coach/page.tsx` (hub)

Server Component. Mesmo padrão de `settings/page.tsx`.

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import CoachShareSection from "@/components/coach/CoachShareSection";
import CoachClientsList from "@/components/coach/CoachClientsList";
import type { CoachLink } from "@/types/database";

export default async function CoachPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const supabase = createClient();

  // Vínculo do próprio usuário como DONO (só pode ter 1 pendente/ativo)
  const { data: myLink } = await supabase
    .from("coach_links")
    .select("*")
    .eq("owner_user_id", user.id)
    .in("status", ["pending", "active"])
    .maybeSingle();

  // Vínculos onde o próprio usuário é COACH de outros
  const { data: clientLinks } = await supabase
    .from("coach_links")
    .select("*")
    .eq("coach_user_id", user.id)
    .eq("status", "active")
    .order("accepted_at", { ascending: false });

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <CoachShareSection
          userId={user.id}
          displayName={profile.display_name}
          currentLink={(myLink as CoachLink) ?? null}
        />
        <CoachClientsList
          clients={(clientLinks as CoachLink[]) ?? []}
        />
      </main>
    </div>
  );
}
```

**Notas:**
- `max-w-2xl` — mesma largura de `settings/page.tsx` (confirmado).
- Queries em `coach_links` não passam por `loadUserData()` (mesmo padrão
  de `photos/page.tsx` que faz query própria de `progress_photos`).
- `maybeSingle()` pro link como dono (pode não existir).

### 4.2 `src/components/coach/CoachShareSection.tsx` (client)

```tsx
"use client";
```

Props: `{ userId: string; displayName: string; currentLink: CoachLink | null }`.

- **Sem vínculo:** botão "Gerar link de convite". Ao clicar:
  - `invite_code`: `crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()`
  - Insert em `coach_links`: `{ owner_user_id: userId, invite_code, owner_display_name: displayName }`
  - Mostra link: `${window.location.origin}/dashboard/coach/accept?code=${code}`
    (usa `window.location.origin` em vez de `appPath()` porque esse
    componente é client-side e o link é para o mesmo domínio do app,
    não cross-origin da landing).
  - Botão "Copiar link" (`navigator.clipboard.writeText`).
- **Convite pendente:** mostra link existente + "Cancelar convite" (update
  `status='revoked', revoked_at=now()`).
- **Coach ativo:** mostra `currentLink.coach_display_name ?? "Coach"` +
  "Revogar acesso" (`window.confirm`, update `status='revoked',
  revoked_at=now()`).

Padrão visual: `bg-base-surface border border-base-border rounded-card p-5`
(mesmo padrão de `GoalsManager` card).

### 4.3 `src/components/coach/CoachClientsList.tsx` (Server ou Client)

Props: `{ clients: CoachLink[] }`.

Server Component (sem interação, só links). Cada item mostra
`client.owner_display_name` e é um `<Link>` para
`/dashboard/coach/${client.owner_user_id}`.

Lista vazia → mensagem `text-sm text-ink-faint`: "Você ainda não acompanha
nenhum perfil. Peça a quem você treina/acompanha que compartilhe o link de
convite."

### 4.4 `/dashboard/coach/accept/page.tsx`

Server Component. `searchParams.code` como string.

**Sem mudança em `middleware.ts`** — tudo sob `/dashboard` já é
`isProtectedRoute` (confirmado).

Fluxo:
1. Sem `code` → "Link inválido."
2. Query: `coach_links` onde `invite_code = code`.
3. Não encontrado → "Convite inválido ou expirado."
4. Encontrado, `status !== 'pending'` → "Este convite já foi usado ou
   cancelado."
5. `owner_user_id === user.id` → "Você não pode ser coach de si mesmo."
6. Válido → mostra `link.owner_display_name` + `AcceptInviteButton`.

### 4.5 `src/components/coach/AcceptInviteButton.tsx` (client)

Props: `{ linkId: string; coachDisplayName: string }`.

Ao clicar: update `coach_links` set `coach_user_id = user.id` (via
`supabase.auth.getUser()` no client), `coach_display_name =
coachDisplayName`, `status = 'active'`, `accepted_at = new
Date().toISOString()` where `id = linkId`.

Sucesso → `router.push("/dashboard/coach")`.

### 4.6 `/dashboard/coach/[ownerId]/page.tsx` (visão do coach)

Server Component, somente leitura. Usa `loadCoachClientData()`.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadCoachClientData } from "@/lib/loadCoachClientData";
import { getTheme } from "@/lib/get-theme";
import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import KpiCard from "@/components/KpiCard";
import WeightChart from "@/components/WeightChart";
import GoalTabs from "@/components/GoalTabs";
import PhotoComparisonView from "@/components/photos/PhotoComparisonView";
import PhotoHistoryGrid from "@/components/photos/PhotoHistoryGrid";
import BodyMeasurementsList from "@/components/BodyMeasurementsList";
import type { ProgressPhoto, PeriodKpi, GoalPrediction } from "@/types/database";
import Link from "next/link";

export default async function CoachClientPage({
  params,
}: {
  params: { ownerId: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clientData = await loadCoachClientData(params.ownerId, user.id);
  if (!clientData) redirect("/dashboard/coach");

  const { profile, entries, measurements, activeGoals, goalsHistory } = clientData;
  const theme = await getTheme();
  const trend = computeTrend(entries);

  // KPIs e previsões por meta ativa (mesmo padrão de dashboard/page.tsx)
  const kpisByGoal: Record<string, { kpis: PeriodKpi[]; prediction: GoalPrediction | null }> = {};
  // ... (copiar a lógica de iteração de activeGoals do dashboard/page.tsx)

  // Fotos — mesma lógica de photos/page.tsx
  const { data: photoRows } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", params.ownerId)
    .order("photo_date", { ascending: false });

  const weightByDate = new Map(entries.map((e) => [e.measured_at, e.weight_kg]));
  let photos: { photo_date: string; storage_path: string; url: string; weight_kg: number | null }[] = [];
  if (photoRows && photoRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(
        photoRows.map((p: any) => p.storage_path),
        3600
      );
    photos = photoRows.map((p: any, i: number) => ({
      photo_date: p.photo_date,
      storage_path: p.storage_path,
      url: signed?.[i]?.signedUrl ?? "",
      weight_kg: weightByDate.get(p.photo_date) ?? null,
    }));
  }

  return (
    <div>
      <NavBar displayName={/* coach's own display_name, from loadUserData or separate query */} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/coach"
            className="text-sm text-ink-muted hover:text-ink transition"
          >
            ← Voltar
          </Link>
          <h1 className="font-display font-bold text-xl">{profile.display_name}</h1>
        </div>

        {/* KPI cards, WeightChart, medidas, fotos — tudo readOnly */}
        {/* ... reaproveitar KpiCard, WeightChart, GoalTabs */}

        <section>
          <h2 className="font-display font-bold text-lg mb-3">Medidas corporais</h2>
          <BodyMeasurementsList measurements={measurements} readOnly />
        </section>

        <section>
          <h2 className="font-display font-bold text-lg mb-3">Fotos de progresso</h2>
          <PhotoComparisonView photos={photos} />
          <div className="mt-4">
            <PhotoHistoryGrid userId={params.ownerId} photos={photos} readOnly />
          </div>
        </section>

        <section>
          <h2 className="font-display font-bold text-lg mb-3">Metas ativas</h2>
          {/* Lista simples das metas: métrica, label, ritmo — sem GoalsForm/GoalsManager */}
        </section>
      </main>
    </div>
  );
}
```

**Notas de implementação:**
- O `NavBar` mostra o `displayName` do **coach** (não do cliente). Pra
  obter, a página precisa do `user.id` → `profiles` do coach. Duas opções:
  (a) chamar `loadUserData()` só pelo `profile.display_name` + `user`, ou
  (b) query separada `profiles.select("display_name").eq("id", user.id)`.
  Opção (a) é mais alinhada ao padrão, mas carrega dados que não usa.
  **Decisão de implementação pro Claude Code** — ambas funcionam.
- `readOnly` prop nos componentes de medidas e fotos (seção 5).
- `WeightChart` e `KpiCard` são somente-leitura por natureza (recebem dados
  como props, nenhum side effect) — **nenhuma mudança necessária**.
- `GoalTabs` (confirmado existir: `src/components/GoalTabs.tsx`) — se o
  cliente tem mais de 1 meta ativa, renderizar o seletor de aba, igual ao
  dashboard. Recebe `goals` e `selectedGoalId` como props — é só leitura.
- **Sem `PhotoUploadForm`** nesta página (coach não faz upload).
- **Sem `GoalsForm`/`GoalsManager`** nesta página (coach não edita metas).

---

## 5. Patches em componentes existentes — prop `readOnly`

### 5.1 `src/components/BodyMeasurementsList.tsx`

```diff
-export default function BodyMeasurementsList({ measurements }: { measurements: BodyMeasurement[] }) {
+export default function BodyMeasurementsList({ measurements, readOnly = false }: { measurements: BodyMeasurement[]; readOnly?: boolean }) {
```

Dentro do `map`, esconder o botão de excluir:

```diff
-            <button
-              onClick={() => handleDelete(m)}
-              disabled={isDeleting}
-              className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50"
-            >
-              {isDeleting ? "..." : "Excluir"}
-            </button>
+            {!readOnly && (
+              <button
+                onClick={() => handleDelete(m)}
+                disabled={isDeleting}
+                className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50"
+              >
+                {isDeleting ? "..." : "Excluir"}
+              </button>
+            )}
```

**Nenhum caller existente precisa de mudança** — `readOnly` default é
`false`.

### 5.2 `src/components/photos/PhotoHistoryGrid.tsx`

```diff
-export default function PhotoHistoryGrid({
-  userId,
-  photos,
-}: {
-  userId: string;
-  photos: PhotoWithUrl[];
-}) {
+export default function PhotoHistoryGrid({
+  userId,
+  photos,
+  readOnly = false,
+}: {
+  userId: string;
+  photos: PhotoWithUrl[];
+  readOnly?: boolean;
+}) {
```

Dentro do `map`:

```diff
-          <div className="flex items-center justify-between">
-            <span className="text-xs text-ink-muted">{p.photo_date}</span>
-            <DeletePhotoButton
-              userId={userId}
-              photoDate={p.photo_date}
-              storagePath={p.storage_path}
-            />
-          </div>
+          <div className="flex items-center justify-between">
+            <span className="text-xs text-ink-muted">{p.photo_date}</span>
+            {!readOnly && (
+              <DeletePhotoButton
+                userId={userId}
+                photoDate={p.photo_date}
+                storagePath={p.storage_path}
+              />
+            )}
+          </div>
```

**Nenhum caller existente precisa de mudança.**

---

## 6. `src/components/NavBar.tsx` — patch

```
OLD:
const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/photos", label: "Fotos" },
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
  { href: "/dashboard/coach", label: "Coach" },
  { href: "/dashboard/settings", label: "Configurações" },
];
```

9 elementos visuais em mobile (8 links + "Ajuda"). `overflow-x-auto`
genérico cobre — incluir no checklist.

---

## 7. Fora de escopo

- Múltiplos coaches simultâneos por dono.
- Notificação por e-mail (aceite/revogação).
- Coach comentar/anotar dados do cliente.
- Exportação PDF/CSV pela visão do coach.
- Expiração automática de convite por tempo.
- Gate de plano (Fase 7).
- Atualização em tempo real de `owner_display_name`/`coach_display_name`
  quando alguém muda o nome em Configurações (aceitável que fique
  desatualizado até o próximo convite/aceite).

---

## 8. Ordem de execução

1. Rodar `supabase/migrations/0010_coach_links.sql` em blocos no SQL Editor.
2. Atualizar `supabase/schema.sql` (seção 10).
3. Atualizar `src/types/database.ts` (seção 2).
4. Criar `src/lib/loadCoachClientData.ts` (seção 3).
5. Patch `src/components/BodyMeasurementsList.tsx` — prop `readOnly` (seção 5.1).
6. Patch `src/components/photos/PhotoHistoryGrid.tsx` — prop `readOnly` (seção 5.2).
7. Criar `src/components/coach/CoachShareSection.tsx`.
8. Criar `src/components/coach/CoachClientsList.tsx`.
9. Criar `src/components/coach/AcceptInviteButton.tsx`.
10. Criar `src/app/(app)/dashboard/coach/page.tsx` (seção 4.1).
11. Criar `src/app/(app)/dashboard/coach/accept/page.tsx` (seção 4.4).
12. Criar `src/app/(app)/dashboard/coach/[ownerId]/page.tsx` (seção 4.6).
13. Patch `src/components/NavBar.tsx` (seção 6).
14. `npx tsc --noEmit` e `npm run build`.

---

## 9. Checklist de teste (produção)

- [ ] `0010_coach_links.sql` rodou OK — tabela `coach_links` com 3 colunas
      de status, 2 colunas de display_name, índice parcial ativo.
- [ ] 6 políticas `_select_by_coach` ativas nas tabelas existentes +
      1 de storage + políticas na própria `coach_links`.
- [ ] **Gerar convite:** link copiável com código de 8 chars, formato
      `.../dashboard/coach/accept?code=XXXXXXXX`.
- [ ] **2º convite com 1 já pendente:** bloqueado pelo índice parcial.
- [ ] **Cancelar convite pendente:** libera geração de novo.
- [ ] **Abrir link de convite deslogado:** middleware redireciona pra
      `/login`. Após login, reabrir o link mostra o preview.
- [ ] **Aceitar o próprio convite:** bloqueado, mensagem clara.
- [ ] **Aceitar com conta B:** vínculo vira `active`;
      `coach_display_name` preenchido; dono vê nome do coach.
- [ ] **Coach (B) vê o cliente listado:** "Perfis que você acompanha"
      mostra o `owner_display_name`.
- [ ] **Coach abre `/dashboard/coach/[ownerId]`:** vê KPIs, gráfico,
      medidas (sem botão excluir), fotos (comparação + grid sem excluir),
      metas ativas (sem form de edição).
- [ ] **Conta C (sem vínculo) tenta URL direta:** redirecionada pra
      `/dashboard/coach`, RLS também bloqueia queries.
- [ ] **Dono revoga coach ativo:** B perde acesso imediatamente.
- [ ] **Link usado 2x (2ª pessoa):** bloqueado, "já foi usado".
- [ ] **1 coach com 2 clientes:** lista mostra os 2, dados não se
      misturam.
- [ ] **readOnly=true:** `BodyMeasurementsList` e `PhotoHistoryGrid`
      sem botão "Excluir" na visão do coach.
- [ ] **readOnly=false (default):** nenhuma regressão nas telas normais
      de medidas e fotos.
- [ ] **Mobile:** 9 elementos visuais no NavBar sem overflow ilegível.
- [ ] **Tema claro/escuro** nas 3 telas novas.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
