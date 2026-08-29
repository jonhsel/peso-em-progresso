# Fase 2.3 — Histórico de metas (v2)

## Contexto para o Claude Code

Último item da Fase 2 (`claude_fases.md`): "Histórico de metas (transformar
`goals` em log com `created_at`)". Depois desta feature, a Fase 2 está
completa e pronta pra virar gatilho de "plano completo" na Fase 3.

**Antes de aplicar:** confirme lendo os arquivos reais que os trechos abaixo
ainda batem — em especial `src/lib/analytics.ts` (assinatura de
`computePeriodKpi`/`computeAllKpis`, tipo de `GOAL_FIELD`),
`src/types/database.ts` (tipo `Goals`), `src/lib/loadUserData.ts`,
`src/components/GoalsForm.tsx`, `src/components/onboarding/OnboardingFlow.tsx`,
e `src/app/api/export/pdf/route.tsx`. Se algo mudou, ajustar o patch de
acordo, mantendo o comportamento descrito aqui.

**Changelog v2 (auditoria):**
- **Bug 1 corrigido:** trigger trocado de AFTER INSERT pra AFTER INSERT OR
  UPDATE em `goals` — cobre onboarding (upsert = UPDATE) e edições futuras.
  Com isso, insert client-side em `GoalsForm` e `OnboardingFlow` é
  desnecessário; toda escrita em `goals` gera histórico automaticamente.
- **Bug 2 corrigido:** `GOAL_FIELD` trocado de `Record<Period, keyof Goals>`
  pra `Record<Period, GoalFieldKey>` com tipo literal dos 4 campos de meta
  — evita mismatch de tipo entre `Goals` e `GoalsHistoryEntry` no `tsc`.
- **Bug 3 corrigido:** rota PDF (`api/export/pdf/route.tsx`) agora tem
  instruções explícitas de patch (query `goals_history` + fallback + troca
  do argumento de `computeAllKpis`).
- Confirmado: rota CSV não usa `computeAllKpis` — não precisa de mudança.
- `dashboard/page.tsx` agora com diff explícito de desestruturação.

### Decisão de design (não reabrir sem motivo)

Hoje `goals` é uma tabela singleton: `user_id` é PRIMARY KEY, cada edição faz
upsert e sobrescreve a linha. Não há como saber qual era a meta há duas
semanas.

A decisão para esta feature é:

1. **Nova tabela `goals_history`** — log append-only. Toda escrita em
   `goals` (INSERT pelo trigger de signup, UPDATE pelo onboarding ou
   `GoalsForm`) dispara um trigger `AFTER INSERT OR UPDATE` que grava
   automaticamente em `goals_history`.
   `goals` continua existindo como snapshot da meta *ativa atual* — outras
   partes do app como `OnboardingFlow.tsx` e o trigger de signup continuam
   funcionando sem mudança.
2. **`computePeriodKpi` passa a resolver a meta vigente por período**, em vez
   de receber sempre a meta atual. "Vigente" = o registro de `goals_history`
   mais recente com `created_at <= periodStart(period, now)`; se não houver
   nenhum (conta criada depois do início do período), cai no primeiro
   registro existente (o mais antigo) como fallback.
3. **`/dashboard/goals` ganha uma lista "Metas anteriores"** abaixo do
   formulário, somente leitura, mostrando os registros de `goals_history` em
   ordem decrescente por `created_at`.

Isso é uma mudança real na assinatura de `computePeriodKpi`/`computeAllKpis`
(passam a receber a lista de histórico, não mais um único `Goals`), então
todo caller precisa ser atualizado: `dashboard/page.tsx` e
`api/export/pdf/route.tsx`.

---

## 1. Migração de banco

Criar `supabase/migrations/0004_goals_history.sql`:

```sql
-- ---------------------------------------------------------
-- Histórico de metas (log append-only, complementar a `goals`)
-- `goals` continua sendo o snapshot da meta ATIVA (1 linha/usuário,
-- usado por formulários e valores-padrão). `goals_history` é o log
-- completo de toda meta que já existiu, usado pelo KPI pra saber
-- qual meta valia em cada período passado e pela tela de histórico.
-- ---------------------------------------------------------
create table if not exists public.goals_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekly_loss_kg numeric(5,2) not null,
  monthly_loss_kg numeric(5,2) not null,
  quarterly_loss_kg numeric(5,2) not null,
  semester_loss_kg numeric(5,2) not null,
  target_weight_kg numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists goals_history_user_created_idx
  on public.goals_history (user_id, created_at desc);

alter table public.goals_history enable row level security;

create policy "goals_history_select_own"
  on public.goals_history for select
  using (auth.uid() = user_id);

create policy "goals_history_insert_own"
  on public.goals_history for insert
  with check (auth.uid() = user_id);

-- Sem policy de update/delete: log é append-only por design.

-- Trigger: toda escrita em `goals` (INSERT ou UPDATE) espelha em
-- `goals_history`. Isso cobre:
--   • Signup: trigger handle_new_user_goals faz INSERT em goals → dispara
--   • Onboarding: OnboardingFlow.handleFinish faz upsert (= UPDATE) → dispara
--   • GoalsForm: edição faz upsert (= UPDATE) → dispara
-- Sem precisar de insert client-side em nenhum desses lugares.
create or replace function public.handle_goals_history_sync()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.goals_history
    (user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
     semester_loss_kg, target_weight_kg)
  values
    (new.user_id, new.weekly_loss_kg, new.monthly_loss_kg,
     new.quarterly_loss_kg, new.semester_loss_kg, new.target_weight_kg);
  return new;
end;
$$;

drop trigger if exists on_goals_changed_history on public.goals;
create trigger on_goals_changed_history
  after insert or update on public.goals
  for each row execute procedure public.handle_goals_history_sync();

-- Backfill: todo usuário que já tem uma linha em `goals` mas nenhuma em
-- `goals_history` ganha um primeiro registro com o valor atual.
-- Sem isso, o fallback de resolveGoalsForPeriod ficaria vazio pra quem
-- já tinha conta antes desta migração.
-- O WHERE NOT EXISTS evita duplicata se o trigger acima já tiver disparado
-- (ex.: se a migração rodar depois de algum UPDATE em `goals`).
insert into public.goals_history
  (user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
   semester_loss_kg, target_weight_kg, created_at)
select
  user_id, weekly_loss_kg, monthly_loss_kg, quarterly_loss_kg,
  semester_loss_kg, target_weight_kg, updated_at
from public.goals g
where not exists (
  select 1 from public.goals_history gh where gh.user_id = g.user_id
);
```

Colar o mesmo bloco (menos o `INSERT...SELECT` de backfill, que é
migração pontual, não schema) ao final de `supabase/schema.sql`, com
comentário apontando pra `0004_goals_history.sql`.

**Executar manualmente no Supabase Dashboard > SQL Editor**, mesmo padrão
das migrações anteriores (0002, 0003).

---

## 2. `src/types/database.ts`

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

+export type GoalsHistoryEntry = {
+  id: string;
+  user_id: string;
+  weekly_loss_kg: number;
+  monthly_loss_kg: number;
+  quarterly_loss_kg: number;
+  semester_loss_kg: number;
+  target_weight_kg: number | null;
+  created_at: string;
+};
+
 export type Database = {
   public: {
     Tables: {
       profiles: { ... };
       weight_entries: { ... };
       goals: { ... };
       body_measurements: { ... };
+      goals_history: {
+        Row: GoalsHistoryEntry;
+        Insert: Partial<GoalsHistoryEntry> & {
+          user_id: string;
+          weekly_loss_kg: number;
+          monthly_loss_kg: number;
+          quarterly_loss_kg: number;
+          semester_loss_kg: number;
+        };
+        Update: never; // append-only, sem policy de update
+        Relationships: [];
+      };
     };
     ...
   };
 };
```

---

## 3. `src/lib/analytics.ts` — meta vigente por período

### 3.1 Import e tipo `GoalFieldKey`

```diff
 import type { WeightEntry, Goals } from "@/types/database";
+import type { GoalsHistoryEntry } from "@/types/database";
```

(Ou juntar no import existente: `import type { WeightEntry, Goals, GoalsHistoryEntry } from "@/types/database";`)

Trocar o tipo de `GOAL_FIELD` — `keyof Goals` inclui campos como
`updated_at` e `user_id` que não existem em `GoalsHistoryEntry`, causando
erro de tipo quando `resolveGoalsForPeriod` retorna `GoalsHistoryEntry` e
o código faz `activeGoals[GOAL_FIELD[period]]`:

```diff
-const GOAL_FIELD: Record<Period, keyof Goals> = {
+// Campos de meta de perda que existem tanto em Goals quanto em GoalsHistoryEntry.
+type GoalFieldKey = "weekly_loss_kg" | "monthly_loss_kg" | "quarterly_loss_kg" | "semester_loss_kg";
+
+const GOAL_FIELD: Record<Period, GoalFieldKey> = {
   week: "weekly_loss_kg",
   month: "monthly_loss_kg",
   quarter: "quarterly_loss_kg",
   semester: "semester_loss_kg",
 };
```

### 3.2 Nova função `resolveGoalsForPeriod`

Adicionar antes de `computePeriodKpi`:

```ts
/**
 * Resolve qual meta estava vigente no início de um período, usando o
 * histórico completo (goals_history). A função ordena internamente —
 * a ordem de entrada não importa.
 *
 * "Vigente" = o registro mais recente com created_at <= início do período.
 * Se não houver nenhum (conta criada depois do início do período, ou
 * histórico vazio), cai no registro mais antigo disponível como fallback —
 * nunca retorna null, porque toda conta tem ao menos 1 registro desde o
 * signup (trigger handle_goals_history_sync ou backfill da migração 0004).
 * Só retorna null se `history` estiver genuinamente vazio (não deveria
 * acontecer em produção, mas evita throw se acontecer).
 */
export function resolveGoalsForPeriod(
  history: GoalsHistoryEntry[],
  periodStartDate: Date
): GoalsHistoryEntry | null {
  if (history.length === 0) return null;

  const sorted = [...history].sort(
    (a, b) => parseISO(a.created_at).getTime() - parseISO(b.created_at).getTime()
  );

  // Último registro com created_at <= início do período.
  let candidate: GoalsHistoryEntry | null = null;
  for (const g of sorted) {
    if (parseISO(g.created_at).getTime() <= periodStartDate.getTime()) {
      candidate = g;
    } else {
      break;
    }
  }

  // Fallback: nenhum registro é anterior ao início do período (conta nova
  // no meio do período) — usa o mais antigo disponível em vez de null.
  return candidate ?? sorted[0];
}
```

### 3.3 Assinatura de `computePeriodKpi` e `computeAllKpis`

```diff
 export function computePeriodKpi(
   entries: WeightEntry[],
-  goals: Goals,
+  goalsHistory: GoalsHistoryEntry[],
   period: Period,
   now: Date = new Date()
 ): PeriodKpi {
   const points = toPoints(entries);
   const start = periodStart(period, now);
-  const targetLossKg = Number(goals[GOAL_FIELD[period]] ?? 0);
+  const activeGoals = resolveGoalsForPeriod(goalsHistory, start);
+  const targetLossKg = Number(activeGoals?.[GOAL_FIELD[period]] ?? 0);

   const baseline = baselineWeight(points, start, period);
   ...
```

```diff
-export function computeAllKpis(entries: WeightEntry[], goals: Goals, now: Date = new Date()): PeriodKpi[] {
+export function computeAllKpis(
+  entries: WeightEntry[],
+  goalsHistory: GoalsHistoryEntry[],
+  now: Date = new Date()
+): PeriodKpi[] {
   return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
-    computePeriodKpi(entries, goals, p, now)
+    computePeriodKpi(entries, goalsHistory, p, now)
   );
 }
```

**Não mexer em mais nada dentro de `computePeriodKpi`** — `baselineWeight`,
o cálculo de `expectedWeightNow`/`deltaVsExpected`/`actualLoss`/`progressPct`,
os thresholds de status, tudo continua igual. Só a origem de `targetLossKg`
muda (era `goals[campo]` fixo, agora é a meta resolvida pro período).

**Nota sobre o import de `Goals`:** se nada mais em `analytics.ts` usar o
tipo `Goals` após esta mudança, o import pode ser removido. Verificar antes
de remover — se `Goals` ainda for usado em algum outro lugar do arquivo, ou
se algum re-export depender dele, manter.

---

## 4. `src/lib/loadUserData.ts` — carregar o histórico

```diff
 import { createClient } from "@/lib/supabase/server";
-import type { Goals, Profile, WeightEntry, BodyMeasurement } from "@/types/database";
+import type { Goals, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement } from "@/types/database";

 export async function loadUserData() {
   ...
-  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }] =
+  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }, { data: goalsHistory }] =
     await Promise.all([
       supabase.from("profiles").select("*").eq("id", user.id).single(),
       supabase.from("weight_entries").select("*").eq("user_id", user.id).order("measured_at", { ascending: true }),
       supabase.from("goals").select("*").eq("user_id", user.id).single(),
       supabase.from("body_measurements").select("*").eq("user_id", user.id).order("measured_at", { ascending: true }),
+      supabase.from("goals_history").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
     ]);

   ...

   return {
     user,
     profile: (profile as Profile) ?? { ... },
     entries: (entries as WeightEntry[]) ?? [],
     measurements: (measurements as BodyMeasurement[]) ?? [],
+    goalsHistory:
+      (goalsHistory as GoalsHistoryEntry[])?.length
+        ? (goalsHistory as GoalsHistoryEntry[])
+        : [
+            {
+              id: "fallback",
+              user_id: user.id,
+              weekly_loss_kg: 0.25,
+              monthly_loss_kg: 1,
+              quarterly_loss_kg: 3,
+              semester_loss_kg: 6,
+              target_weight_kg: null,
+              created_at: new Date(0).toISOString(),
+            },
+          ],
     goals:
       (goals as Goals) ??
       ({ ... } as Goals),
   };
 }
```

Ordenação `created_at DESC` na query: serve pra `GoalsHistoryList` (precisa
decrescente) e pra `resolveGoalsForPeriod` (que reordena internamente, então
a ordem de entrada não importa pra ela).

O fallback `created_at: new Date(0)` (época Unix) garante que esse registro
sintético nunca "vence" um registro real por ser mais recente; existe só pra
`resolveGoalsForPeriod` não receber lista vazia no edge case de conta sem
trigger/migração.

---

## 5. Callers de `computeAllKpis`/`computePeriodKpi`

Localizar com:

```bash
grep -rn "computeAllKpis\|computePeriodKpi" src/
```

### 5.1 `src/app/(app)/dashboard/page.tsx`

```diff
 export default async function DashboardPage() {
-  const { user, profile, entries, goals } = await loadUserData();
+  const { user, profile, entries, goals, goalsHistory } = await loadUserData();
   ...
-  const kpis = computeAllKpis(entries, goals);
+  const kpis = computeAllKpis(entries, goalsHistory);
```

**`goals` continua sendo desestruturado e usado normalmente** para
`targetWeightKg` (peso alvo, `ReferenceLine` do gráfico) e qualquer outro
uso fora de `computeAllKpis` — só o argumento do KPI muda.

### 5.2 `src/app/api/export/pdf/route.tsx`

Esta rota faz sua própria query ao banco (não reutiliza `loadUserData()`).
Precisa de patch explícito:

```diff
 import { createClient } from "@/lib/supabase/server";
 import { computeAllKpis, computeTrend } from "@/lib/analytics";
 import { ExportDocument } from "@/lib/pdf/ExportDocument";
-import type { WeightEntry, Goals } from "@/types/database";
+import type { WeightEntry, Goals, GoalsHistoryEntry } from "@/types/database";

 ...

 export async function GET() {
   ...
-  const [{ data: profile }, { data: entries, error: entriesError }, { data: goals }] =
+  const [{ data: profile }, { data: entries, error: entriesError }, { data: goals }, { data: goalsHistory }] =
     await Promise.all([
       supabase.from("profiles").select("display_name").eq("id", user.id).single(),
       supabase
         .from("weight_entries")
         .select("*")
         .eq("user_id", user.id)
         .order("measured_at", { ascending: true }),
       supabase.from("goals").select("*").eq("user_id", user.id).single(),
+      supabase
+        .from("goals_history")
+        .select("*")
+        .eq("user_id", user.id)
+        .order("created_at", { ascending: false }),
     ]);

   ...

-  const typedGoals: Goals = goals
-    ? (goals as Goals)
-    : { user_id: user.id, updated_at: "", ...DEFAULT_GOALS };
+  const typedGoalsHistory: GoalsHistoryEntry[] =
+    (goalsHistory as GoalsHistoryEntry[])?.length
+      ? (goalsHistory as GoalsHistoryEntry[])
+      : [
+          {
+            id: "fallback",
+            user_id: user.id,
+            weekly_loss_kg: DEFAULT_GOALS.weekly_loss_kg,
+            monthly_loss_kg: DEFAULT_GOALS.monthly_loss_kg,
+            quarterly_loss_kg: DEFAULT_GOALS.quarterly_loss_kg,
+            semester_loss_kg: DEFAULT_GOALS.semester_loss_kg,
+            target_weight_kg: DEFAULT_GOALS.target_weight_kg,
+            created_at: new Date(0).toISOString(),
+          },
+        ];

-  const kpis = computeAllKpis(typedEntries, typedGoals);
+  const kpis = computeAllKpis(typedEntries, typedGoalsHistory);
```

O `DEFAULT_GOALS` existente pode ser reaproveitado pro fallback em vez de
duplicar os valores.

A variável `typedGoals` / o objeto `goals` pode ser removida se não for
usada em mais nada na rota (confirmar lendo — hoje parece que não).

### 5.3 `src/app/api/export/csv/route.ts`

**Não precisa de mudança.** Confirmado: esta rota faz dump bruto de
`weight_entries`, não chama `computeAllKpis` nem `computePeriodKpi`.

### 5.4 Componentes que **não** precisam mudar

- `WeightChart.tsx` — recebe `weekKpi: PeriodKpi | null` já calculado,
  não chama `computePeriodKpi` diretamente.
- `KpiWeeklyTeaser.tsx`, `KpiCard.tsx` — consomem `PeriodKpi[]` já pronto.

---

## 6. `src/components/GoalsForm.tsx` — NÃO precisa gravar no histórico

O trigger `on_goals_changed_history` (AFTER INSERT OR UPDATE em `goals`)
cuida disso automaticamente. Quando o `GoalsForm` faz
`supabase.from("goals").upsert(...)`, o Postgres dispara o trigger e grava
em `goals_history` sem intervenção client-side.

**Não adicionar insert manual em `goals_history` neste componente.** Isso
eliminaria duplicação de lógica, evitaria inconsistências se um dos dois
inserts falhasse, e simplifica o código.

Pelo mesmo motivo, **`OnboardingFlow.tsx` também não precisa de mudança** —
o upsert em `goals` que ele já faz dispara o trigger.

---

## 7. `src/components/GoalsHistoryList.tsx` (novo componente)

Lista somente-leitura, mesmo padrão visual de `BodyMeasurementsList.tsx`
(cards em `bg-base-surface`/`border-base-border`), sem diff (não faz
sentido comparar "diferença" entre metas sucessivas — os 4 campos mudam
juntos e o que importa é o valor absoluto de cada um, não a variação).

```tsx
"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { GoalsHistoryEntry } from "@/types/database";

export default function GoalsHistoryList({ history }: { history: GoalsHistoryEntry[] }) {
  // history vem ordenado decrescente (created_at DESC) de loadUserData().
  // A entrada mais recente é a meta ATIVA (já mostrada no formulário acima),
  // então a lista mostra só as anteriores — evita repetir a mesma info 2x.
  const previous = history.length > 1 ? history.slice(1) : [];

  if (previous.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
        <p className="font-display font-bold text-lg mb-1">Metas anteriores</p>
        <p className="text-sm text-ink-faint">
          Ainda não há histórico — esta é sua primeira meta configurada.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
      <p className="font-display font-bold text-lg mb-1">Metas anteriores</p>
      <p className="text-sm text-ink-faint mb-4">
        Valores que já estiveram em vigor antes da meta atual.
      </p>
      <ul className="space-y-3">
        {previous.map((g) => (
          <li
            key={g.id}
            className="text-sm border-t border-base-border pt-3 first:border-t-0 first:pt-0"
          >
            <p className="text-xs text-ink-faint font-mono mb-1">
              {format(parseISO(g.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <p className="text-ink">
              {g.weekly_loss_kg} kg/semana · {g.monthly_loss_kg} kg/mês ·{" "}
              {g.quarterly_loss_kg} kg/trimestre · {g.semester_loss_kg} kg/semestre
              {g.target_weight_kg ? ` · alvo ${g.target_weight_kg} kg` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**Nota:** `history.slice(1)` assume que `history[0]` é a meta ativa (mais
recente). Isso é garantido pela ordenação `created_at DESC` em `loadUserData`.
O double-click protection do `GoalsForm` (estado `loading` que desabilita o
botão durante a operação) é essencial pra evitar dois registros com o mesmo
timestamp, o que poderia quebrar essa suposição — já está implementado e não
precisa de mudança.

---

## 8. `src/app/(app)/dashboard/goals/page.tsx`

```diff
 import { loadUserData } from "@/lib/loadUserData";
 import { getTheme } from "@/lib/get-theme";
 import NavBar from "@/components/NavBar";
 import GoalsForm from "@/components/GoalsForm";
+import GoalsHistoryList from "@/components/GoalsHistoryList";

 export default async function GoalsPage() {
-  const { user, profile, goals } = await loadUserData();
+  const { user, profile, goals, goalsHistory } = await loadUserData();
   const theme = await getTheme();

   return (
     <div>
       <NavBar displayName={profile.display_name} theme={theme} />
       <main className="max-w-6xl mx-auto px-4 py-8">
-        <GoalsForm userId={user.id} goals={goals} />
+        <div className="space-y-6">
+          <GoalsForm userId={user.id} goals={goals} />
+          <GoalsHistoryList history={goalsHistory} />
+        </div>
       </main>
     </div>
   );
 }
```

Layout empilhado (`space-y-6`), não lado a lado — diferente do padrão
"form fixo + histórico" de `entries/page.tsx` e `measurements/page.tsx`.
Histórico de metas tende a ter poucos registros (edita-se meta raramente,
não diariamente), então uma coluna única é suficiente e mais simples.

---

## 9. Fora de escopo (não fazer nesta entrega)

- **Sem edição/exclusão de registros de `goals_history`** — é log,
  append-only por design (sem policy de update/delete na migração).
- **Sem paginação na lista de metas anteriores** — histórico de metas cresce
  devagar (o usuário edita raramente).
- **`targetWeightKg`/`target_weight_kg` não entra na resolução por
  período** — só os 4 campos de ritmo de perda (`*_loss_kg`) afetam o KPI
  via `resolveGoalsForPeriod`; o peso alvo final continua vindo sempre da
  meta ativa (`goals.target_weight_kg`), sem versionamento por data.
- **CSV export**: não usa `computeAllKpis`, não precisa de mudança.

---

## 10. Checklist de teste

- [ ] Rodar `supabase/migrations/0004_goals_history.sql` no Supabase
      Dashboard — conferir que o backfill criou 1 linha em `goals_history`
      pra cada usuário que já tinha `goals`.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Criar conta nova → completar onboarding → `goals_history` deve ter
      **2** registros: 1 do trigger de signup (defaults) e 1 do onboarding
      (valores configurados pelo usuário). O mais recente deve refletir o
      que o usuário escolheu no onboarding, não os defaults 0.25/1/3/6.
- [ ] Editar metas em `/dashboard/goals` duas vezes seguidas com valores
      diferentes → `goals_history` ganha 1 linha por edição (não sobrescreve);
      `goals` reflete só a última.
- [ ] Lista "Metas anteriores" mostra as edições em ordem decrescente,
      omitindo a meta atual (já visível no formulário acima); estado vazio
      ("ainda não há histórico") aparece corretamente pra conta com só 1
      registro.
- [ ] KPI da semana/mês/trimestre/semestre continua calculando igual a antes
      **para quem nunca editou metas** (só 1 registro no histórico — meta
      resolvida é sempre a mesma, comportamento idêntico ao pré-migração).
- [ ] Cenário principal da feature: editar a meta semanal hoje, depois olhar
      o KPI do **mês** (período que começou antes da edição) — o KPI do mês
      deve usar a meta *anterior* à edição (a que estava vigente no início
      do mês), enquanto o KPI da **semana**, se a semana atual começou depois
      da edição, usa a meta nova. Confirmar com valores de teste que geram
      números visivelmente diferentes entre as duas metas.
- [ ] Linha tracejada do gráfico (`WeightChart.tsx`, Fase 2.2) continua
      funcionando sem alteração visual de comportamento — ela usa
      `weekKpi.baselineWeightKg`/`expectedWeightNowKg`, que já refletem a
      meta resolvida internamente.
- [ ] Exportação PDF (`api/export/pdf`) gera KPIs consistentes com o
      dashboard pro mesmo usuário/período.
- [ ] RLS: usuário A não consegue ler `goals_history` do usuário B (testar
      com 2 contas, se possível). Confirmar também que não há policy de
      update/delete (`goals_history` é append-only mesmo via API direta).
- [ ] `GoalsForm` NÃO faz insert manual em `goals_history` — verificar que
      o trigger está cuidando disso (consultar `goals_history` antes e depois
      de salvar, sem insert client-side no código).

## Depois de validar em produção

Atualizar `claude_fases.md`: marcar os 3 itens da Fase 2 como concluídos:

```
- [x] Importação de CSV do Fitdays (`source='import'` já existe no schema)
- [x] Medidas corporais (cintura, quadril, braço, % gordura) — tabela `body_measurements`
- [x] Histórico de metas (transformar `goals` em log com `created_at`)
```

Isso fecha a Fase 2 inteira, que é o gatilho documentado pra "criar plano
completo vs. plano básico" (já specced em `claude_fase3_planos.md`, pendente
só da conta Kiwify).

Adicionar uma seção "Fase 2.3 — Histórico de metas" em `CLAUDE.md`, mesmo
padrão das seções anteriores: o que foi implementado, decisões tomadas,
desvios do spec (se houver), e o checklist de validação em produção ainda
pendente.
