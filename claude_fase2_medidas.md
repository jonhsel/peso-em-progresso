# Fase 2, item 2 — Medidas corporais (`body_measurements`)

Spec para implementar cintura, quadril, braço e % de gordura como tabela nova,
seguindo o padrão já estabelecido em `weight_entries` (1 registro/dia/usuário,
upsert client-side, RLS por `auth.uid() = user_id`).

**Decisões de design desta feature:**

1. **Tabela separada de `weight_entries`**, não colunas extras nela — medidas
   corporais são registradas com frequência menor que peso (semanal/quinzenal,
   não diária), e nem todo mundo vai preencher os 4 campos toda vez. Uma tabela
   própria com todos os campos opcionais evita linhas de `weight_entries` cheias
   de `null`.
2. **Todos os 4 campos são opcionais, mas pelo menos 1 é obrigatório** — replicado
   em 3 camadas: `CHECK` no banco (`body_measurements_at_least_one_field`),
   validação no client antes do insert, e placeholder nos inputs deixando claro
   que dá pra preencher só o que foi medido.
3. **Mesma armadilha de `Number("")` documentada no `CLAUDE.md`** (decisão que
   quebrou os KPIs de meta) se aplica aqui em dobro, porque aqui campo vazio
   **precisa** virar `null` (medida não tirada), não `0` nem erro. O parser
   (`parseOptionalNumber`) trata string vazia como `null` explicitamente antes
   de qualquer `Number()`.
4. **Sem cor semântica no diff do histórico** (diferente de `EntriesList`, que
   pinta perda de peso de verde/`signal-ahead`) — cintura menor é "bom", mas
   braço menor geralmente não é (perda de massa magra), e isso varia por pessoa/
   objetivo. O diff aparece em `text-ink-faint` neutro, só o número com sinal.
5. **1 medida por dia por usuário** (`unique(user_id, measured_at)`), igual
   `weight_entries` — registrar de novo no mesmo dia faz upsert.

---

## 1. Arquivo novo: `supabase/migrations/0003_body_measurements.sql`

Como aplicar: Supabase Dashboard > SQL Editor > cole e rode. Idempotente.

```sql
-- =========================================================
-- Fase 2.2 — Medidas corporais
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  waist_cm numeric(5,1) check (waist_cm is null or (waist_cm > 0 and waist_cm < 300)),
  hip_cm numeric(5,1) check (hip_cm is null or (hip_cm > 0 and hip_cm < 300)),
  arm_cm numeric(5,1) check (arm_cm is null or (arm_cm > 0 and arm_cm < 100)),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct < 100)),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at),
  constraint body_measurements_at_least_one_field check (
    waist_cm is not null or hip_cm is not null or arm_cm is not null or body_fat_pct is not null
  )
);

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_at desc);

alter table public.body_measurements enable row level security;

create policy "body_measurements_select_own"
  on public.body_measurements for select
  using (auth.uid() = user_id);

create policy "body_measurements_insert_own"
  on public.body_measurements for insert
  with check (auth.uid() = user_id);

create policy "body_measurements_update_own"
  on public.body_measurements for update
  using (auth.uid() = user_id);

create policy "body_measurements_delete_own"
  on public.body_measurements for delete
  using (auth.uid() = user_id);

comment on table public.body_measurements is
  'Medidas corporais opcionais (cintura, quadril, braço, % gordura) — 1 registro por dia por usuário, mesmo padrão de weight_entries.';
```

Também acrescentar o mesmo bloco ao final de `supabase/schema.sql` (fonte de
verdade do schema completo), com um comentário apontando pra migração:

```sql
-- ---------------------------------------------------------
-- 4. Medidas corporais (opcional, complementar a weight_entries)
-- Ver supabase/migrations/0003_body_measurements.sql
-- ---------------------------------------------------------
-- [colar o mesmo bloco create table / index / RLS acima]
```

---

## 2. Patch: `src/types/database.ts`

Adicionar o tipo novo e registrá-lo em `Database.Tables`:

```diff
 export type Goals = {
   user_id: string;
   weekly_loss_kg: number;
   monthly_loss_kg: number;
   quarterly_loss_kg: number;
   semester_loss_kg: number;
   target_weight_kg: number | null;
   updated_at: string;
 };

+export type BodyMeasurement = {
+  id: string;
+  user_id: string;
+  measured_at: string; // YYYY-MM-DD
+  waist_cm: number | null;
+  hip_cm: number | null;
+  arm_cm: number | null;
+  body_fat_pct: number | null;
+  note: string | null;
+  created_at: string;
+};
+
 export type Database = {
   public: {
     Tables: {
       profiles: { ... };
       weight_entries: { ... };
       goals: { ... };
+      body_measurements: {
+        Row: BodyMeasurement;
+        Insert: Partial<BodyMeasurement> & { user_id: string; measured_at: string };
+        Update: Partial<BodyMeasurement>;
+        Relationships: [];
+      };
     };
     ...
   };
 };
```

---

## 3. Patch: `src/lib/loadUserData.ts`

```diff
 import { redirect } from "next/navigation";
 import { createClient } from "@/lib/supabase/server";
-import type { Goals, Profile, WeightEntry } from "@/types/database";
+import type { Goals, Profile, WeightEntry, BodyMeasurement } from "@/types/database";

 export async function loadUserData() {
   const supabase = createClient();
   const {
     data: { user },
   } = await supabase.auth.getUser();

   if (!user) redirect("/login");

-  const [{ data: profile }, { data: entries }, { data: goals }] = await Promise.all([
+  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }] =
+    await Promise.all([
     supabase.from("profiles").select("*").eq("id", user.id).single(),
     supabase
       .from("weight_entries")
       .select("*")
       .eq("user_id", user.id)
       .order("measured_at", { ascending: true }),
     supabase.from("goals").select("*").eq("user_id", user.id).single(),
-  ]);
+    supabase
+      .from("body_measurements")
+      .select("*")
+      .eq("user_id", user.id)
+      .order("measured_at", { ascending: true }),
+  ]);

   // Fase 0: quem nunca concluiu o onboarding é redirecionado antes de ver
   // qualquer tela do dashboard.
   if (profile && !(profile as Profile).onboarded_at) {
     redirect("/onboarding");
   }

   return {
     user,
     profile: (profile as Profile) ?? { id: user.id, display_name: user.email ?? "Usuário", height_cm: null, created_at: "", onboarded_at: null },
     entries: (entries as WeightEntry[]) ?? [],
+    measurements: (measurements as BodyMeasurement[]) ?? [],
     goals:
       (goals as Goals) ??
       ({
         user_id: user.id,
         weekly_loss_kg: 0.25,
         monthly_loss_kg: 1,
         quarterly_loss_kg: 3,
         semester_loss_kg: 6,
         target_weight_kg: null,
         updated_at: "",
       } as Goals),
   };
 }
```

---

## 4. Arquivo novo: `src/components/BodyMeasurementForm.tsx`

Client component, mesmo padrão de `WeightEntryForm.tsx` (upsert direto via
`@supabase/ssr` client, sem Server Action).

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELD_LIMITS: Record<FieldKey, { min: number; max: number; label: string }> = {
  waist_cm: { min: 0, max: 300, label: "Cintura" },
  hip_cm: { min: 0, max: 300, label: "Quadril" },
  arm_cm: { min: 0, max: 100, label: "Braço" },
  body_fat_pct: { min: 0, max: 100, label: "% gordura" },
};

// Campo vazio precisa virar `null` (medida não tirada), nunca `0` —
// Number("") === 0 já quebrou os KPIs de meta uma vez neste projeto.
function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (Number.isNaN(n)) return "invalid";
  return n;
}

export default function BodyMeasurementForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [arm, setArm] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed: Record<FieldKey, number | null | "invalid"> = {
      waist_cm: parseOptionalNumber(waist),
      hip_cm: parseOptionalNumber(hip),
      arm_cm: parseOptionalNumber(arm),
      body_fat_pct: parseOptionalNumber(bodyFat),
    };

    for (const key of Object.keys(parsed) as FieldKey[]) {
      const value = parsed[key];
      const { min, max, label } = FIELD_LIMITS[key];
      if (value === "invalid") {
        setError(`${label}: valor inválido.`);
        return;
      }
      if (value !== null && (value <= min || value >= max)) {
        setError(`${label}: valor fora do intervalo esperado.`);
        return;
      }
    }

    if (
      parsed.waist_cm === null &&
      parsed.hip_cm === null &&
      parsed.arm_cm === null &&
      parsed.body_fat_pct === null
    ) {
      setError("Preencha ao menos uma medida.");
      return;
    }

    setLoading(true);
    const { error: supaError } = await supabase.from("body_measurements").upsert(
      {
        user_id: userId,
        measured_at: date,
        waist_cm: parsed.waist_cm as number | null,
        hip_cm: parsed.hip_cm as number | null,
        arm_cm: parsed.arm_cm as number | null,
        body_fat_pct: parsed.body_fat_pct as number | null,
        note: note || null,
      },
      { onConflict: "user_id,measured_at" }
    );

    setLoading(false);
    if (supaError) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }

    setWaist("");
    setHip("");
    setArm("");
    setBodyFat("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Registrar medidas</p>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={format(new Date(), "yyyy-MM-dd")}
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Cintura (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            placeholder="ex: 82,5"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Quadril (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={hip}
            onChange={(e) => setHip(e.target.value)}
            placeholder="ex: 98,0"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Braço (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={arm}
            onChange={(e) => setArm(e.target.value)}
            placeholder="ex: 32,0"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">% gordura</label>
          <input
            type="text"
            inputMode="decimal"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="ex: 18,5"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Nota (opcional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex: medido em jejum..."
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Salvar medidas"}
      </button>
      <p className="text-xs text-ink-faint">
        Preencha só o que tiver medido — não precisa dos 4 campos toda vez. Já
        existe registro na data escolhida? Ele será atualizado.
      </p>
    </form>
  );
}
```

---

## 5. Arquivo novo: `src/components/BodyMeasurementsList.tsx`

Mesmo padrão de `EntriesList.tsx` (histórico + exclusão com `window.confirm`),
adaptado para 4 campos opcionais por linha.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BodyMeasurement } from "@/types/database";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "arm_cm", label: "Braço", unit: "cm" },
  { key: "body_fat_pct", label: "% gordura", unit: "%" },
];

export default function BodyMeasurementsList({ measurements }: { measurements: BodyMeasurement[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...measurements].sort((a, b) => b.measured_at.localeCompare(a.measured_at));

  async function handleDelete(m: BodyMeasurement) {
    const dateLabel = format(parseISO(m.measured_at), "dd 'de' MMMM, yyyy", { locale: ptBR });
    const ok = window.confirm(`Excluir as medidas de ${dateLabel}?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    setError(null);
    setDeletingId(m.id);

    const { error: supaError } = await supabase.from("body_measurements").delete().eq("id", m.id);

    setDeletingId(null);
    if (supaError) {
      setError("Não foi possível excluir. Tente novamente.");
      return;
    }
    router.refresh();
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-6 text-center text-sm text-ink-faint">
        Nenhuma medida registrada ainda.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-signal-behind bg-base-surface border border-signal-behind/40 rounded-card px-4 py-2">
          {error}
        </p>
      )}
      <div className="bg-base-surface border border-base-border rounded-card divide-y divide-base-border">
        {sorted.map((m, i) => {
          const isDeleting = deletingId === m.id;
          // Diff contra o registro anterior (mais antigo na lista) que também
          // tenha esse campo preenchido — sem cor semântica (ver decisão #4 no
          // topo do spec: "menor" nem sempre é "melhor" dependendo do campo).
          const prevWithField = (key: FieldKey) => sorted.slice(i + 1).find((p) => p[key] !== null) ?? null;

          return (
            <div key={m.id} className="flex items-start justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-faint mb-1.5">
                  {format(parseISO(m.measured_at), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {FIELDS.map(({ key, label, unit }) => {
                    const value = m[key];
                    if (value === null) return null;
                    const prev = prevWithField(key);
                    const diff = prev ? Number(value) - Number(prev[key]) : null;
                    return (
                      <div key={key} className="text-sm font-mono">
                        <span className="text-ink-faint text-xs mr-1">{label}</span>
                        {Number(value).toFixed(1)}
                        {unit}
                        {diff !== null && diff !== 0 && (
                          <span className="text-xs ml-1 text-ink-faint">
                            ({diff > 0 ? "+" : ""}
                            {diff.toFixed(1)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => handleDelete(m)}
                disabled={isDeleting}
                className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50 disabled:cursor-wait shrink-0"
                aria-label="Excluir medidas"
              >
                {isDeleting ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

---

## 6. Arquivo novo: `src/app/(app)/dashboard/measurements/page.tsx`

Mesmo padrão de `entries/page.tsx` (grid 2 colunas: form fixo + histórico).

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import BodyMeasurementForm from "@/components/BodyMeasurementForm";
import BodyMeasurementsList from "@/components/BodyMeasurementsList";

export default async function MeasurementsPage() {
  const { user, profile, measurements } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:sticky md:top-8 self-start">
          <BodyMeasurementForm userId={user.id} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Histórico</p>
          <BodyMeasurementsList measurements={measurements} />
        </div>
      </main>
    </div>
  );
}
```

---

## 7. Patch: `src/components/NavBar.tsx`

```diff
 const links = [
   { href: "/dashboard", label: "Visão geral" },
   { href: "/dashboard/entries", label: "Pesagens" },
+  { href: "/dashboard/measurements", label: "Medidas" },
   { href: "/dashboard/goals", label: "Metas" },
 ];
```

---

## Ordem de execução

1. Rodar `supabase/migrations/0003_body_measurements.sql` no Supabase Dashboard
   (SQL Editor) e acrescentar o mesmo bloco a `supabase/schema.sql` (seção 1).
2. Aplicar patch em `src/types/database.ts` (seção 2).
3. Aplicar patch em `src/lib/loadUserData.ts` (seção 3).
4. Criar `src/components/BodyMeasurementForm.tsx` (seção 4).
5. Criar `src/components/BodyMeasurementsList.tsx` (seção 5).
6. Criar `src/app/(app)/dashboard/measurements/page.tsx` (seção 6).
7. Aplicar patch em `src/components/NavBar.tsx` (seção 7).
8. `npx tsc --noEmit` e `npm run build`.
9. Atualizar `CLAUDE.md` (seção "Status atual" e "Decisões importantes") e
   marcar o item 2 da Fase 2 em `claude_fases.md`.

## Checklist de validação manual

- [ ] Salvar medidas preenchendo só 1 dos 4 campos → aceita normalmente.
- [ ] Tentar salvar sem preencher nenhum campo → erro "Preencha ao menos uma
      medida.", nada é gravado.
- [ ] Salvar medidas na mesma data de um registro existente → atualiza (upsert),
      não duplica linha.
- [ ] Valor fora do intervalo (ex: cintura 999) → erro de validação, sem round-trip
      ao banco.
- [ ] Excluir uma medida → some da lista, `window.confirm` aparece antes.
- [ ] Histórico mostra o diff correto pulando registros onde aquele campo
      específico estava vazio (ex: 3 registros, só o 1º e o 3º têm cintura —
      diff do 3º deve comparar com o 1º, não com o 2º).
- [ ] Link "Medidas" aparece na NavBar (desktop e mobile) e destaca quando ativo.
- [ ] RLS: usuário A não consegue ver/editar medidas do usuário B (testar com
      2 contas, se possível).
