# Fase 7 — Monetização em camadas (spec v3)

> v3 = v2 + 2ª auditoria. Achados da 2ª auditoria no Apêndice B. Todas as
> correções já estão incorporadas — rodar direto.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md` antes
> de implementar — este documento assume as convenções já estabelecidas no
> projeto (design tokens, route group `(app)`, sem Server Actions pra escrita
> de tabela, RLS, migrações idempotentes numeradas).

---

## 0. Decisões tomadas

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Estrutura de planos | **2 tiers: Grátis / Pro** |
| 2 | Features no free | Divisão sugerida no v1, **exceto Conquistas: completas no free** |
| 3 | Assinatura vs lifetime | **Assinatura mensal recorrente** |
| 4 | Vinculação Kiwify → Supabase | **Por email, com `pending_payments` como fallback** |
| 5 | Schema `profiles.plan` | `'free' \| 'pro'` — **mais `plan_expires_at`/`kiwify_order_id`, necessários dado que o modelo é recorrente (decisão 3)** |
| 6 | UX do gate | **Mostrar mas trancar (CTA de upgrade)** |
| 7 | Página de upgrade | **`/dashboard/upgrade`, com botão que leva ao checkout Kiwify** |
| 8 | Segurança do webhook | **Token compartilhado, confirmado** |
| 9 | Downgrade | **Imediato** |
| 10 | Preço | **Grátis: R$ 0 — Pro: R$ 11,90/mês** |

---

## 1. Divisão de features — versão final

**Grátis:**
- Registro diário de peso (sem limite)
- Gráfico de evolução (sem média móvel, sem seletor de período)
- 1 meta ativa (só métrica peso, só ritmo semanal)
- KPI semanal (4 status: adiantado/no ritmo/atenção/atrasado)
- Streak básico (sequência atual, sem melhor histórica)
- **Conquistas completas** (decisão: engajamento > incentivo de upgrade aqui)
- Guia de ajuda

**Pro (tudo do Grátis +):**
- Metas por mês/trimestre/semestre, além de semana
- Até 3 metas simultâneas, qualquer métrica (peso/cintura/quadril/braço/%gordura)
- Média móvel de 7 dias no gráfico
- Seletor de período no gráfico (1s/1m/3m/6m)
- Previsão da meta
- Medidas corporais
- Fotos de progresso
- Desafios
- Relatórios
- Exportar dados (CSV/PDF)
- Importação de CSV
- Coach/visualizador
- Configurações de período fixo/móvel
- Compartilhar progresso (item 3 da fase, spec futura)

---

## 2. Migração SQL — `supabase/migrations/0012_plan_gate.sql`

```sql
-- ---------------------------------------------------------
-- Fase 7 — Gate free/pro + integração Kiwify
-- Assinatura mensal recorrente (R$ 11,90/mês). Ver claude_fase7_monetizacao_v3.md.
-- ---------------------------------------------------------

-- 1. Coluna de plano em profiles
alter table public.profiles
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'pro'));

alter table public.profiles
  add column if not exists plan_expires_at timestamptz;

alter table public.profiles
  add column if not exists kiwify_order_id text;

comment on column public.profiles.plan is
  'free | pro. pro é assinatura mensal via Kiwify — ver plan_expires_at para validade.';
comment on column public.profiles.plan_expires_at is
  'Data de expiração da assinatura pro. null quando plan = free. Atualizado a cada
   compra_aprovada/subscription_renewed; downgrade para free é imediato em
   subscription_canceled/subscription_late/compra_reembolsada/chargeback (não espera
   plan_expires_at vencer).';
comment on column public.profiles.kiwify_order_id is
  'Id da última venda/assinatura Kiwify associada — rastreabilidade para suporte.';

-- 2. Tabela de pagamentos pendentes (fallback quando o email do checkout
--    ainda não tem conta no app no momento do webhook)
create table if not exists public.pending_payments (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kiwify_order_id text,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists pending_payments_email_status_idx
  on public.pending_payments (email, status);

-- RLS ativado, SEM policies: só acessível via service role (webhook) e via
-- funções security definer (trigger de signup abaixo). Client nunca lê/escreve
-- aqui diretamente.
alter table public.pending_payments enable row level security;

comment on table public.pending_payments is
  'Fila de conciliação: pagamento aprovado na Kiwify pra um email que ainda não
   tinha conta no app no momento do webhook. handle_new_user() concilia
   automaticamente no signup. Sem RLS de client — só service role e triggers.';

-- 3. Trigger de signup: reescrito para conciliar pending_payments automaticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pending record;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  select * into pending
  from public.pending_payments
  where email = new.email and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.profiles
    set plan = 'pro',
        plan_expires_at = pending.expires_at,
        kiwify_order_id = pending.kiwify_order_id
    where id = new.id;

    update public.pending_payments
    set status = 'applied', applied_at = now()
    where id = pending.id;
  end if;

  return new;
end;
$$;

-- Trigger on_auth_user_created já existe e aponta pra esta função — não
-- precisa recriar o trigger, só a função (CREATE OR REPLACE já resolve).

-- 4. Trava de metas ativas por plano.
create or replace function public.enforce_max_active_goals()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  active_count integer;
  user_plan text;
  max_allowed integer;
begin
  if new.is_active then
    select plan into user_plan from public.profiles where id = new.user_id;
    max_allowed := case when user_plan = 'pro' then 3 else 1 end;

    select count(*) into active_count
    from public.goals
    where user_id = new.user_id
      and is_active = true
      and id <> new.id;

    if active_count >= max_allowed then
      raise exception 'Limite de % meta(s) ativa(s) atingido para o plano %', max_allowed, coalesce(user_plan, 'free');
    end if;
  end if;
  return new;
end;
$$;
```

**Executar no Supabase Dashboard > SQL Editor em blocos separados**: (1) `ALTER TABLE profiles` (3 comandos + 3 comments), (2) `CREATE TABLE pending_payments` + índice + RLS + comment, (3) `CREATE OR REPLACE FUNCTION handle_new_user`, (4) `CREATE OR REPLACE FUNCTION enforce_max_active_goals`. Conferir "Success" a cada um.

Também atualizar `supabase/schema.sql` (referência): adicionar seção "12. Plano (free/pro) + pagamentos pendentes" e substituir as definições de `handle_new_user`/`enforce_max_active_goals` já existentes (não duplicar).

---

## 3. Tipos — `src/types/database.ts`

```diff
 export type Profile = {
   id: string;
   display_name: string;
   height_cm: number | null;
   created_at: string;
   onboarded_at: string | null;
   period_mode: PeriodMode;
   week_starts_on: WeekStartsOn;
   checkin_hour: number | null;
+  plan: "free" | "pro";
+  plan_expires_at: string | null;
+  kiwify_order_id: string | null;
 };
```

Não adicionar `pending_payments` ao `Database.Tables` — nenhum código client-side a acessa.

---

## 4. `src/lib/loadUserData.ts` — fallback de profile

**[Correção #B15]** O fallback quando `profile` é `null` precisa dos 3 campos novos. Diff contra o código real:

```diff
   return {
     user,
     profile: (profile as Profile) ?? {
       id: user.id,
       display_name: user.email ?? "Usuário",
       height_cm: null,
       created_at: "",
       onboarded_at: null,
       period_mode: "fixed" as const,
       week_starts_on: "monday" as const,
       checkin_hour: null,
+      plan: "free" as const,
+      plan_expires_at: null,
+      kiwify_order_id: null,
     },
     entries: (entries as WeightEntry[]) ?? [],
     ...
   };
```

---

## 5. Arquivo novo — `src/lib/plan.ts`

Helpers puros de gate:

```ts
import type { Profile } from "@/types/database";

export const FREE_GOAL_LIMIT = 1;
export const PRO_GOAL_LIMIT = 3;

export function isPro(profile: Pick<Profile, "plan">): boolean {
  return profile.plan === "pro";
}

export function goalLimitFor(profile: Pick<Profile, "plan">): number {
  return isPro(profile) ? PRO_GOAL_LIMIT : FREE_GOAL_LIMIT;
}

export function allowedGoalMetricsFor(profile: Pick<Profile, "plan">) {
  return isPro(profile)
    ? (["weight", "waist", "hip", "arm", "body_fat"] as const)
    : (["weight"] as const);
}
```

---

## 6. Arquivo novo — `src/lib/supabase/admin.ts`

Client com service role key, usado **só** pelo webhook:

```ts
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
```

**Nova env var:** `SUPABASE_SERVICE_ROLE_KEY` — Project Settings > API no Supabase Dashboard.

---

## 7. Arquivo novo — `src/app/api/webhooks/kiwify/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

const SUBSCRIPTION_DAYS = 30;

const GRANT_EVENTS = new Set(["compra_aprovada", "subscription_renewed"]);
const REVOKE_EVENTS = new Set([
  "subscription_canceled",
  "subscription_late",
  "compra_reembolsada",
  "chargeback",
]);

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const eventType: string = body.event ?? body.type;
  const email: string | undefined = body?.data?.customer?.email ?? body?.Customer?.email;
  const orderId: string | undefined = body?.data?.id ?? body?.order_id;
  const eventCreatedAt: string = body?.created_at ?? new Date().toISOString();

  if (!email) {
    return NextResponse.json({ ok: true, skipped: "no email" });
  }

  const supabase = createAdminClient();

  if (GRANT_EVENTS.has(eventType)) {
    const expiresAt = addDays(new Date(eventCreatedAt), SUBSCRIPTION_DAYS).toISOString();

    const { data: authUser } = await supabase
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (authUser) {
      await supabase
        .from("profiles")
        .update({ plan: "pro", plan_expires_at: expiresAt, kiwify_order_id: orderId ?? null })
        .eq("id", authUser.id);
    } else {
      await supabase.from("pending_payments").insert({
        email,
        kiwify_order_id: orderId ?? null,
        expires_at: expiresAt,
      });
    }
  } else if (REVOKE_EVENTS.has(eventType)) {
    const { data: authUser } = await supabase
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (authUser) {
      await supabase
        .from("profiles")
        .update({ plan: "free", plan_expires_at: null })
        .eq("id", authUser.id);
    }
    await supabase
      .from("pending_payments")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("email", email)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true });
}
```

**⚠️ Pendências de confirmação contra a Kiwify real (pré-requisito antes de deploy em produção):**
1. Nome exato dos campos no payload — `body.event`/`body.type`, `body.data.customer.email` — disparar um "Test Webhook" pelo painel da Kiwify contra webhook.site e ajustar os paths.
2. Como o `token` é entregue — body vs header. Se vier em header, trocar `body.token` por `req.headers.get("x-kiwify-token")`.
3. `supabase.schema("auth")` — funciona com service role key; se não, criar função Postgres `security definer` chamada via `.rpc()`.

---

## 8. `src/lib/pricing.ts` — reescrito para 2 tiers

```diff
-// Definição dos planos exibidos na landing pública (/).
-// Fase 0: só vitrine, sem cobrança — o CTA de todos os planos leva pra /login.
-// Fase 3 vai ligar `id` a um gate real (profiles.plan + Stripe); quando isso
-// acontecer, importe daqui em vez de duplicar os valores.
+// Definição dos planos exibidos na landing pública (/) e em /dashboard/upgrade.
+// Fase 7: gate real via profiles.plan + Kiwify.

-export type PlanId = "gratis" | "basico" | "completo";
+export type PlanId = "gratis" | "pro";

 export interface Plan {
   id: PlanId;
   name: string;
   price: string;
   priceSuffix?: string;
   tagline: string;
   features: string[];
   cta: string;
   highlighted?: boolean;
 }

 export const plans: Plan[] = [
   {
     id: "gratis",
     name: "Grátis",
     price: "R$ 0",
-    tagline: "Pra registrar o peso e ver se o hábito pega.",
+    tagline: "Pra registrar o peso e construir o hábito.",
     features: [
       "Registro diário de peso",
       "Gráfico de evolução",
-      "1 meta ativa (semanal)",
+      "1 meta ativa (peso, ritmo semanal)",
+      "Conquistas",
     ],
     cta: "Criar conta grátis",
   },
   {
-    id: "basico",
-    name: "Básico",
-    price: "R$ 5,90",
+    id: "pro",
+    name: "Pro",
+    price: "R$ 11,90",
     priceSuffix: "/mês",
-    tagline: "Pra quem já decidiu que vai levar a sério.",
+    tagline: "Pra quem quer o quadro completo — metas, medidas, fotos e mais.",
     features: [
-      "Tudo do Grátis",
-      "Metas por semana, mês, trimestre e semestre",
-      "KPI de ritmo (adiantado / no ritmo / atenção / atrasado)",
-      "Histórico completo com diff dia a dia",
-    ],
-    cta: "Assinar Básico",
-    highlighted: true,
-  },
-  {
-    id: "completo",
-    name: "Completo",
-    price: "R$ 9,90",
-    priceSuffix: "/mês",
-    tagline: "Pra quem treina com mais gente ou usa balança boa.",
-    features: [
-      "Tudo do Básico",
-      "Múltiplos usuários (família/treino) com dados isolados",
-      "Importação de CSV (Fitdays e outras balanças)",
-      "Aviso por e-mail quando uma meta sai do ritmo",
+      "Tudo do Grátis",
+      "Até 3 metas simultâneas (peso, cintura, quadril, braço, %gordura)",
+      "Medidas corporais e fotos de progresso",
+      "Previsão de meta e relatórios",
+      "Desafios",
+      "Exportar dados (CSV/PDF) e importar CSV",
+      "Coach/visualizador",
     ],
-    cta: "Assinar Completo",
+    cta: "Assinar Pro",
+    highlighted: true,
   },
 ];
```

---

## 9. `src/app/page.tsx` — landing page

```diff
               <a
-                href={appPath("/login")}
+                href={plan.id === "pro" ? process.env.NEXT_PUBLIC_KIWIFY_CHECKOUT_URL : appPath("/login")}
                 className={...}
               >
                 {plan.cta}
               </a>
             </div>
           ))}
         </div>

-        <p className="mt-6 text-xs text-ink-faint">
-          Cobrança ainda não está ativa nesta versão — os planos pagos abrem
-          fila de espera ao criar conta.
-        </p>
       </div>
     </section>
```

**Nova env var:** `NEXT_PUBLIC_KIWIFY_CHECKOUT_URL`.

---

## 10. `PlanGate.tsx` (novo arquivo)

```tsx
"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

export default function PlanGate({
  plan,
  featureName,
  children,
}: {
  plan: "free" | "pro";
  featureName: string;
  children: React.ReactNode;
}) {
  if (plan === "pro") return <>{children}</>;

  return (
    <div className="rounded-card border border-dashed border-base-border bg-base-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-ink-faint" />
      <p className="mt-3 font-display font-bold text-base">{featureName} é Pro</p>
      <p className="mt-1 text-sm text-ink-muted">
        Disponível no plano Pro — R$ 11,90/mês.
      </p>
      <Link
        href="/dashboard/upgrade"
        className="mt-4 inline-block rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
      >
        Fazer upgrade
      </Link>
    </div>
  );
}
```

**Páginas inteiras que usam `PlanGate` ao redor do conteúdo (mantendo `NavBar` fora do gate):**

| Página | Arquivo | `featureName` |
|---|---|---|
| Medidas corporais | `dashboard/measurements/page.tsx` | `"Medidas corporais"` |
| Fotos de progresso | `dashboard/photos/page.tsx` | `"Fotos de progresso"` |
| Desafios | `dashboard/challenges/page.tsx` | `"Desafios"` |
| Relatórios | `dashboard/reports/page.tsx` | `"Relatórios"` |
| Coach | `dashboard/coach/page.tsx` | `"Coach"` |
| Coach (visão) | `dashboard/coach/[ownerId]/page.tsx` | `"Coach"` |
| Importar CSV | `dashboard/import/page.tsx` | `"Importação de CSV"` |

Padrão de diff (idêntico em cada página):

```diff
+import PlanGate from "@/components/PlanGate";

 export default async function XPage() {
   const { profile, ... } = await loadUserData();
   ...
   return (
     <div>
       <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
       <main ...>
+        <PlanGate plan={profile.plan} featureName="Nome da feature">
           {/* conteúdo existente */}
+        </PlanGate>
       </main>
     </div>
   );
 }
```

**API Routes de export — checagem server-side independente** (3 rotas: `csv/route.ts`, `pdf/route.tsx`, `report-pdf/route.tsx`):

```diff
+  // Gate de plano — logo após a checagem de autenticação
+  const { data: planCheck } = await supabase
+    .from("profiles")
+    .select("plan")
+    .eq("id", user.id)
+    .single();
+  if (planCheck?.plan !== "pro") {
+    return NextResponse.json({ error: "Exportação disponível no plano Pro" }, { status: 403 });
+  }
```

**Nota sobre `api/export/pdf/route.tsx` e `api/export/report-pdf/route.tsx`:** ambas já fazem `.from("profiles").select(...)` mais adiante no código. A checagem de `plan` pode ser incorporada no select existente em vez de criar uma query separada — ex: expandir o `select("display_name, period_mode, week_starts_on")` pra `select("display_name, period_mode, week_starts_on, plan")` e checar `profile?.plan !== "pro"` logo após o `Promise.all`. Fica a critério do Claude Code.

**`ExportButtons.tsx`** — o componente hoje é server component (só `<a>` links). Pra esconder/desabilitar os botões no free, o approach mais simples é passar `plan` como prop (precisa virar client component, ou o parent pode envolver em `PlanGate`):

```diff
+import PlanGate from "@/components/PlanGate";

 // Em entries/page.tsx, ao redor dos ExportButtons:
-{entries.length > 0 && <ExportButtons />}
+{entries.length > 0 && (
+  <PlanGate plan={profile.plan} featureName="Exportar dados">
+    <ExportButtons />
+  </PlanGate>
+)}
```

Alternativa mais limpa (se `PlanGate` visual ficar desproporcional ao lado de botões pequenos): não usar `PlanGate`, e sim ocultar os botões inteiros se `plan !== "pro"` e mostrar um link "Exportar (Pro)" que leva a `/dashboard/upgrade`. **Decisão de implementação pro Claude Code — o importante é que a API Route protege com 403 de qualquer jeito.**

---

## 11. `WeightChart.tsx` — gate de média móvel e seletor de período

**[Correção #B11]** — diff explícito. O componente real recebe `{ entries: WeightEntry[]; weightGoals: WeightGoalKpi[] }`. Adicionar `plan`:

```diff
 export default function WeightChart({
   entries,
   weightGoals,
+  plan,
 }: {
   entries: WeightEntry[];
   weightGoals: WeightGoalKpi[];
+  plan?: "free" | "pro";
 }) {
```

`plan` **opcional** (default `undefined` → sem gate = Pro behavior) — mantém compatibilidade com callers que não passam, incluindo `coach/[ownerId]/page.tsx` onde o coach sempre vê tudo do cliente independente do próprio plano.

**Seletor de período (pills):** renderizar condicionalmente.

```diff
   // No JSX, onde as pills aparecem:
-  <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
+  {plan !== "free" && (
+    <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
+  )}
```

Quando `plan === "free"`, `selectedPeriod` fica no default `"month"` (restaurado do `localStorage` que, pra um free, nunca terá sido salvo com outro valor) — mas como não existe seletor, o gráfico mostra a visão de 1 mês fixa. **Alternativa:** free mostra visão completa (sem filtro de período), o que é mais generoso. Se visão completa for preferida:

```diff
   // Forçar visão completa no free:
+  const effectivePeriod = plan === "free" ? null : selectedPeriod;
   const visibleEntries = sorted.filter((e) =>
-    isWithinChartPeriod(e.measured_at, selectedPeriod, primaryWeekKpi, now)
+    effectivePeriod ? isWithinChartPeriod(e.measured_at, effectivePeriod, primaryWeekKpi, now) : true
   );
```

**Decisão para o Claude Code: opção "visão completa sem pills no free"** — é a mais consistente com "gráfico de evolução" listado no free (seção 1).

**Média móvel:** condicionar o desenho da linha e a legenda.

```diff
+  const showMovingAverage = plan !== "free" && hasMovingAverage;

   // Na legenda condicional:
-  {(anyWeeklyTrend || hasMovingAverage) && (
+  {(anyWeeklyTrend || showMovingAverage) && (
     <div className="flex items-center gap-4 ...">
       ...
-      {hasMovingAverage && (
+      {showMovingAverage && (
         <span ...>... média 7d</span>
       )}
     </div>
   )}

   // Na Line do ComposedChart:
-  {hasMovingAverage && (
+  {showMovingAverage && (
     <Line dataKey="mediaMovel" ... />
   )}
```

O cálculo de `movingAverage`/`movingAverageByDate` continua acontecendo (não quebra `data.map` que já popula `point.mediaMovel`) — só o desenho é suprimido. Sem risco de erro.

**Callers de `WeightChart` que precisam passar `plan`:**

| Caller | Arquivo | Como passar |
|---|---|---|
| Dashboard | `dashboard/page.tsx` | `plan={profile.plan}` |
| Relatórios | `dashboard/reports/ReportsClient.tsx` | Recebe `plan` como prop de `reports/page.tsx` |
| Coach (visão) | `dashboard/coach/[ownerId]/page.tsx` | **Não passa `plan`** (undefined → coach sempre vê tudo) |

`ReportsClient.tsx` precisa de nova prop:

```diff
 export default function ReportsClient({
   goals,
   kpisByGoal,
   predictionsByGoal,
   entries,
   weightGoals,
+  plan,
 }: {
   goals: Goal[];
   kpisByGoal: Record<string, PeriodKpi[]>;
   predictionsByGoal: Record<string, GoalPredictions>;
   entries: WeightEntry[];
   weightGoals: WeightGoalKpi[];
+  plan?: "free" | "pro";
 }) {
   ...
   return (
     <div className="space-y-6">
       ...
-      <WeightChart entries={entries} weightGoals={weightGoals} />
+      <WeightChart entries={entries} weightGoals={weightGoals} plan={plan} />
     </div>
   );
 }
```

E em `reports/page.tsx`:

```diff
         <ReportsClient
           goals={activeGoals}
           kpisByGoal={kpisByGoal}
           predictionsByGoal={predictionsByGoal}
           entries={entries}
           weightGoals={weightGoalKpis}
+          plan={profile.plan}
         />
```

---

## 12. `SettingsForm.tsx` — seção de período trancar no free

**[Correção #B13]** — O `SettingsForm` renderiza `period_mode`/`week_starts_on` como seletores interativos. No free, esses campos devem estar **desabilitados visualmente mas presentes no estado** (pro `persist()` continuar enviando os valores existentes sem quebrar).

```diff
 export default function SettingsForm({
   userId,
   displayName,
   heightCm,
   periodMode,
   weekStartsOn,
   checkinHour,
+  plan,
 }: {
   userId: string;
   displayName: string;
   heightCm: number | null;
   periodMode: PeriodMode;
   weekStartsOn: WeekStartsOn;
   checkinHour: number | null;
+  plan: "free" | "pro";
 }) {
```

Envolver a seção de período com indicação visual de gate:

```tsx
{/* Seção Período das metas */}
<div className={plan === "free" ? "opacity-50 pointer-events-none" : ""}>
  <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">
    Período das metas
    {plan === "free" && (
      <Link href="/dashboard/upgrade" className="ml-2 text-accent hover:underline normal-case tracking-normal">
        (Pro)
      </Link>
    )}
  </p>
  {/* seletores de period_mode e week_starts_on, inalterados */}
</div>
```

`pointer-events-none` + `opacity-50` desabilita toda interação sem remover os campos do DOM — os states `mode`/`weekStart` mantêm os valores atuais do profile, e `persist()` os envia normalmente. Sem risco de enviar `undefined`.

**Caller** (`dashboard/settings/page.tsx`):

```diff
         <SettingsForm
           userId={user.id}
           displayName={profile.display_name}
           heightCm={profile.height_cm}
           periodMode={profile.period_mode}
           weekStartsOn={profile.week_starts_on}
           checkinHour={profile.checkin_hour}
+          plan={profile.plan}
         />
```

---

## 13. Arquivo novo — `src/app/(app)/dashboard/upgrade/page.tsx`

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import { plans } from "@/lib/pricing";

export default async function UpgradePage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const isPro = profile.plan === "pro";

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          {isPro ? "Seu plano" : "Fazer upgrade"}
        </p>
        <h1 className="font-display font-bold text-2xl mt-1">
          {isPro ? "Você é Pro 🎉" : "Desbloqueie o app completo"}
        </h1>

        {isPro ? (
          <p className="mt-3 text-sm text-ink-muted">
            {profile.plan_expires_at
              ? `Sua assinatura renova em ${new Date(profile.plan_expires_at).toLocaleDateString("pt-BR")}.`
              : "Assinatura ativa."}
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink-muted">
              Compare o que muda entre os planos:
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-5">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`rounded-card border p-6 bg-base-surface ${
                    plan.highlighted ? "border-signal-onpace" : "border-base-border"
                  }`}
                >
                  <h3 className="font-display font-bold text-lg">{plan.name}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{plan.tagline}</p>
                  <p className="mt-4 flex items-baseline gap-1 font-mono">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    {plan.priceSuffix && (
                      <span className="text-sm text-ink-muted">{plan.priceSuffix}</span>
                    )}
                  </p>
                  <ul className="mt-4 space-y-2 text-[13px] text-ink">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-signal-onpace">＋</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {plan.id === "pro" && (
                    <a
                      href={`${process.env.NEXT_PUBLIC_KIWIFY_CHECKOUT_URL}?email=${encodeURIComponent(user.email ?? "")}`}
                      className="mt-5 block text-center rounded-lg bg-signal-onpace text-base-bg font-medium py-2.5 text-sm hover:brightness-110 transition"
                    >
                      {plan.cta}
                    </a>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-ink-faint">
              Use o mesmo email da sua conta no app para que o plano seja ativado automaticamente.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
```

**⚠️ Pendente:** se o checkout Kiwify aceita `?email=` como query param para pré-preencher. Se não aceitar, remover o query param e manter só a mensagem "use o mesmo email".

---

## 14. `NavBar.tsx` — CTA de upgrade fora do array `links`

```diff
-export default function NavBar({ displayName, theme }: { displayName: string; theme: Theme }) {
+export default function NavBar({
+  displayName,
+  theme,
+  plan,
+}: {
+  displayName: string;
+  theme: Theme;
+  plan?: "free" | "pro";
+}) {
```

No JSX, próximo ao `ThemeToggle`:

```tsx
{plan === "free" && (
  <Link
    href="/dashboard/upgrade"
    className="text-xs font-medium rounded-lg px-3 py-1.5 bg-signal-onpace text-base-bg hover:brightness-110 transition"
  >
    Upgrade
  </Link>
)}
```

**Todos os callers passam `plan={profile.plan}`** — lista exaustiva:

`dashboard/page.tsx`, `dashboard/entries/page.tsx`, `dashboard/measurements/page.tsx`, `dashboard/photos/page.tsx`, `dashboard/goals/page.tsx`, `dashboard/challenges/page.tsx`, `dashboard/reports/page.tsx`, `dashboard/coach/page.tsx`, `dashboard/coach/[ownerId]/page.tsx`, `dashboard/settings/page.tsx`, `dashboard/upgrade/page.tsx`, `dashboard/import/page.tsx`.

```diff
-<NavBar displayName={profile.display_name} theme={theme} />
+<NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
```

**Exceção `coach/[ownerId]/page.tsx`** — usa `coachProfile` (coach logado):
```diff
-<NavBar displayName={coachProfile.display_name} theme={theme} />
+<NavBar displayName={coachProfile.display_name} theme={theme} plan={coachProfile.plan} />
```

---

## 15. `GoalsManager.tsx` — limite de metas por plano

```diff
 import { METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
+import { goalLimitFor, allowedGoalMetricsFor } from "@/lib/plan";
 import type { Goal, GoalMetric, GoalsHistoryEntry } from "@/types/database";
-
-const METRIC_OPTIONS: GoalMetric[] = ["weight", "waist", "hip", "arm", "body_fat"];

 export default function GoalsManager({
   userId,
   activeGoals,
   goalsHistory,
+  plan,
 }: {
   userId: string;
   activeGoals: Goal[];
   goalsHistory: GoalsHistoryEntry[];
+  plan: "free" | "pro";
 }) {
   ...
+  const METRIC_OPTIONS = allowedGoalMetricsFor({ plan });
+  const goalLimit = goalLimitFor({ plan });
   ...
-  const canAddMore = activeGoals.length < 3;
+  const canAddMore = activeGoals.length < goalLimit;
```

Botão de adicionar meta:
```diff
-              title={!canAddMore ? "Limite de 3 metas ativas atingido" : undefined}
+              title={!canAddMore ? `Limite de ${goalLimit} meta(s) ativa(s) atingido${plan === "free" ? " — faça upgrade pra mais" : ""}` : undefined}
               ...
-              + Adicionar meta{!canAddMore ? " (limite de 3 atingido)" : ""}
+              + Adicionar meta{!canAddMore ? ` (limite de ${goalLimit} atingido)` : ""}
```

Mensagem de erro:
```diff
-        "Não foi possível criar essa meta (talvez o limite de 3 metas ativas já tenha sido atingido)."
+        `Não foi possível criar essa meta (talvez o limite de ${goalLimit} meta(s) ativa(s) já tenha sido atingido).`
```

**Caller** (`dashboard/goals/page.tsx` — localização `src/app/(app)/dashboard/goals/page.tsx`, segue padrão idêntico às demais páginas):

```diff
         <GoalsManager
           userId={user.id}
           activeGoals={activeGoals}
           goalsHistory={goalsHistory}
+          plan={profile.plan}
         />
```

---

## 16. Variáveis de ambiente novas (resumo)

| Variável | Onde usar | Descrição |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` (server-only) | Service role key do Supabase — bypassa RLS |
| `KIWIFY_WEBHOOK_TOKEN` | `src/app/api/webhooks/kiwify/route.ts` (server-only) | Token compartilhado configurado no dashboard da Kiwify |
| `NEXT_PUBLIC_KIWIFY_CHECKOUT_URL` | `src/app/page.tsx`, `dashboard/upgrade/page.tsx` (client-side) | Link de checkout do produto Pro na Kiwify |

Adicionar as 3 na Vercel (Production e Preview) e no `.env.local`.

---

## 17. Fora de escopo (explícito)

- Grace period ou preservação de leitura no downgrade — decisão 9 define downgrade imediato.
- Múltiplos produtos Kiwify (cupom, plano anual) — só 1 produto mensal.
- Painel de suporte pra conciliar `pending_payments` manualmente.
- Notificação de renovação/cobrança por e-mail.
- Reconciliação retroativa de `subscription_late` → `subscription_renewed` já cobre.
- Item 3 da fase (compartilhar progresso) — spec separada.
- Gate na visão do coach — o coach **sempre** vê tudo do cliente; se o **dono** for free, o gate acontece nas páginas do dono, não na visão do coach. Se a feature de Coach inteira virar Pro, a proteção é na página `/dashboard/coach` (já coberta pela tabela de `PlanGate` na seção 10). Nota futura: a checagem deve ser sobre o plano do **dono** (quem concedeu acesso), não do coach.

---

## Checklist de teste

1. Rodar `0012_plan_gate.sql` em blocos — conferir "Success"; contas existentes ganham `plan = 'free'`.
2. Conta nova sem pagamento: `plan = 'free'`, gate ativo em todas as páginas Pro.
3. Webhook `compra_aprovada` com email de conta existente: `profiles.plan → 'pro'`, `plan_expires_at` ~30 dias, gate libera.
4. Webhook `compra_aprovada` com email sem conta: cria `pending_payments`. Criar conta com mesmo email: `handle_new_user()` concilia, conta nasce `pro`.
5. Webhook `subscription_canceled`: `plan → 'free'` imediato, `plan_expires_at → null`.
6. Token inválido no webhook: 401, sem mudança.
7. `GoalsManager` free: não cria 2ª meta, não cria meta ≠ peso. Testar via SQL direto (trigger rejeita).
8. Pro cria 3 metas: sem bloqueio.
9. `/dashboard/upgrade` free: 2 planos + checkout. Pro: "Você é Pro" + data.
10. Export CSV/PDF free: 403 na API. Botões escondidos/desabilitados no client.
11. NavBar: "Upgrade" só pra free.
12. `WeightChart` free: sem pills, sem média móvel, visão completa do gráfico.
13. `SettingsForm` free: seção de período desabilitada visualmente, demais campos editáveis normalmente. Salvar não quebra `period_mode`/`week_starts_on`.
14. `dashboard/coach/[ownerId]` com coach free: coach vê tudo do cliente (sem gate na visão), gráfico com pills e média (sem `plan` passado = tudo liberado).
15. `npx tsc --noEmit` e `npm run build` limpos.

---

## Apêndice A — Achados da 1ª auditoria (v1 → v2, já incorporados)

1. `pricing.ts` mencionava "Stripe" e "Fase 3" — corrigido para "Kiwify"/"Fase 7" (seção 8).
2. NavBar já tem 9 links + "Ajuda" — CTA fora do array (seção 14).
3. Lista de features incompleta — completa (seção 1).
4. `Profile` precisa de 3 campos — seção 3.
5. `api/export/pdf` faz query própria — gate independente (seção 10).
6. `handle_new_user()` reescrito pra conciliar — seção 2.
7. Webhook precisa service role key — seção 6.
8. Texto "Cobrança não ativa" removido — seção 9.
9. `enforce_max_active_goals` hardcoda 3 — reescrito (seção 2).
10. `GoalsManager` hardcoda 3 + métricas — seção 15.

## Apêndice B — Achados da 2ª auditoria (v2 → v3, incorporados acima)

11. **WeightChart** precisava de `plan` como prop + diffs de pills/média móvel — seção 11 com diff completo.
12. **ReportsClient** — confirmado: proteção real é na API Route (403), `PlanGate` da página de Relatórios já cobre o client. Sem achado real.
13. **SettingsForm** precisava de `plan` + seção de período desabilitada — seção 12 com diff.
14. **`dashboard/goals/page.tsx`** localização confirmada (`src/app/(app)/dashboard/goals/page.tsx`) — caller de `GoalsManager` documentado na seção 15.
15. **`loadUserData()` fallback** faltava `plan`/`plan_expires_at`/`kiwify_order_id` — seção 4 com diff.
16. **`loadCoachClientData`** propaga `Profile` automaticamente (tipo muda) — nota futura documentada na seção 17.
17. **`api/export/pdf/route.tsx`** real já usa `activeGoals`/multi-goal (Fase 6.2) — gate se encaixa no código atual, confirmado.
18. **`api/export/csv/route.ts`** — gate no mesmo ponto das demais rotas, padrão confirmado.
19. **Onboarding** cria meta `weight` via trigger `handle_new_user_goals` — correto pro free, sem mudança necessária.
