# claude_fase0.md — Landing pública + Onboarding guiado (v3)

> v3 = v2 + 3 melhorias de UI no dashboard:
> 1. Gráficos maiores e layout mais largo (max-w-4xl → max-w-6xl em todas as rotas)
> 2. Peso atual com destaque visual real (tamanho 5xl + glow sutil)
> 3. Variação desde o primeiro registro com destaque (badge colorido)
>
> Se já rodou a v2, aplique só a seção "8. Patches de UI (v3)" — o resto é idêntico.
> Se está montando do zero, rode tudo de 1 a 8.

> Baseado no repositório real peso-em-progresso (lido via knowledge base). Convenções
> conferidas contra tailwind.config.ts, GoalsForm.tsx, KpiCard.tsx e loadUserData.ts.


## Objetivo

1. Landing pública em pesoemprogresso.com.br/ com pitch do produto e 3 planos
   (Grátis / Básico R$5,90 / Completo R$9,90), sem lógica de cobrança.
2. Onboarding guiado de 3 telas em /onboarding (boas-vindas -> explicação dos KPIs ->
   configurar 1a meta), gatilhado por profiles.onboarded_at.
3. app.pesoemprogresso.com.br/ pula a landing e vai direto pro /login ou /dashboard —
   é o mesmo deploy respondendo nos dois domínios, diferenciado só por um redirect
   condicional por host no middleware.

## Pré-requisito de infra (fora do código, fazer antes)

- pesoemprogresso.com.br com DNS delegado pros nameservers da Vercel (ns1/ns2.vercel-dns.com).
- app.pesoemprogresso.com.br adicionado como domínio no mesmo projeto Vercel.

## Ordem de execução

1. Rodar a migração SQL (seção 1).
2. Criar os arquivos novos, incluindo src/lib/app-url.ts (seção 2).
3. Substituir src/app/page.tsx — já com os CTAs apontando pro subdomínio (seção 3).
4. Aplicar os 4 patches em arquivos existentes (seção 4).
5. Definir NEXT_PUBLIC_APP_URL local e na Vercel (seção 4).
6. Atualizar Site URL / Redirect URLs no Supabase (seção 4, ação manual).
7. npx tsc --noEmit && npm run build.
8. Testar o fluxo fim a fim (checklist na seção 5).

---

## 1. Migração SQL

Criar supabase/migrations/0002_onboarding.sql:

```sql
-- =========================================================
-- Fase 0 — Onboarding guiado
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

comment on column public.profiles.onboarded_at is
  'Preenchido quando o usuário conclui o fluxo de onboarding (3 telas). NULL = ainda não passou pelo onboarding.';
```

Rodar no Supabase Dashboard -> SQL Editor (idempotente, seguro repetir).

---

## 2. Arquivos novos

### `src/lib/app-url.ts`

```ts
// URL base do app (dashboard/login), usada pela landing pública em "/" pra
// linkar pro subdomínio correto — apex e "app." são origens diferentes, um
// <Link href="/login"> relativo ficaria preso no domínio da landing.
//
// Em dev local não existe subdomínio, então o default aponta pro próprio
// localhost. Em produção, defina NEXT_PUBLIC_APP_URL=https://app.SEUDOMINIO
// nas env vars do projeto na Vercel (Production e Preview).
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function appPath(path: string) {
  return `${APP_URL}${path}`;
}
```

### `src/lib/pricing.ts`

```tsx
// Definição dos planos exibidos na landing pública (/).
// Fase 0: só vitrine, sem cobrança — o CTA de todos os planos leva pra /login.
// Fase 3 vai ligar `id` a um gate real (profiles.plan + Stripe); quando isso
// acontecer, importe daqui em vez de duplicar os valores.

export type PlanId = "gratis" | "basico" | "completo";

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
    tagline: "Pra registrar o peso e ver se o hábito pega.",
    features: [
      "Registro diário de peso",
      "Gráfico de evolução",
      "1 meta ativa (semanal)",
    ],
    cta: "Criar conta grátis",
  },
  {
    id: "basico",
    name: "Básico",
    price: "R$ 5,90",
    priceSuffix: "/mês",
    tagline: "Pra quem já decidiu que vai levar a sério.",
    features: [
      "Tudo do Grátis",
      "Metas por semana, mês, trimestre e semestre",
      "KPI de ritmo (adiantado / no ritmo / atenção / atrasado)",
      "Histórico completo com diff dia a dia",
    ],
    cta: "Assinar Básico",
    highlighted: true,
  },
  {
    id: "completo",
    name: "Completo",
    price: "R$ 9,90",
    priceSuffix: "/mês",
    tagline: "Pra quem treina com mais gente ou usa balança boa.",
    features: [
      "Tudo do Básico",
      "Múltiplos usuários (família/treino) com dados isolados",
      "Importação de CSV (Fitdays e outras balanças)",
      "Aviso por e-mail quando uma meta sai do ritmo",
    ],
    cta: "Assinar Completo",
  },
];
```

### `src/lib/kpi-status.ts`

```tsx
// Espelha os 4 status retornados por computePeriodKpi (src/lib/analytics.ts)
// e as classes já usadas em KpiCard.tsx (signal-ahead/onpace/caution/behind
// definidos em tailwind.config.ts). Centralizado aqui porque tanto a landing
// (/) quanto o onboarding (/onboarding) explicam o mesmo conceito.

export const KPI_STATUSES = [
  {
    key: "ahead",
    label: "adiantado",
    dot: "bg-signal-ahead",
    text: "text-signal-ahead",
    hex: "#34D399",
    description: "À frente da meta.",
  },
  {
    key: "on_pace",
    label: "no ritmo",
    dot: "bg-signal-onpace",
    text: "text-signal-onpace",
    hex: "#60A5FA",
    description: "Exatamente onde a meta previa pra hoje.",
  },
  {
    key: "caution",
    label: "atenção",
    dot: "bg-signal-caution",
    text: "text-signal-caution",
    hex: "#FBBF24",
    description: "Começando a ficar pra trás — dá pra ajustar.",
  },
  {
    key: "behind",
    label: "atrasado",
    dot: "bg-signal-behind",
    text: "text-signal-behind",
    hex: "#FB7185",
    description: "Fora do ritmo (inclusive se o peso subiu).",
  },
] as const;
```

### `src/components/marketing/TrajectoryGraphic.tsx`

```tsx
"use client";

/**
 * Elemento de assinatura visual do produto: a "linha esperada" (meta,
 * projeção linear) contra a "linha real" (peso registrado). É o mesmo
 * conceito central de computePeriodKpi em src/lib/analytics.ts, desenhado.
 *
 * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
 * tailwind.config.ts: signal.onpace #60A5FA, ink.faint #5B6584,
 * base.bg #0B1220.
 *
 * Usado no hero da landing (variant="hero", animado) e na tela 2 do
 * onboarding (variant="compact", estático).
 */

const ACTUAL_PATH =
  "M 20 46 C 70 60, 90 52, 130 78 C 170 104, 150 96, 190 118 C 230 140, 245 116, 280 132 C 315 148, 305 150, 340 158 C 375 166, 400 162, 440 176";

const EXPECTED_PATH = "M 20 40 L 440 182";

const MEASURE_POINTS = [
  { x: 20, y: 46 },
  { x: 130, y: 78 },
  { x: 190, y: 118 },
  { x: 280, y: 132 },
  { x: 340, y: 158 },
  { x: 440, y: 176 },
];

export function TrajectoryGraphic({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "compact";
  className?: string;
}) {
  const animated = variant === "hero";

  return (
    <svg
      viewBox="0 0 460 200"
      className={className}
      role="img"
      aria-label="Gráfico ilustrativo: peso real acompanhando a meta ao longo do tempo"
    >
      <defs>
        <linearGradient id="traj-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* área sob a linha real */}
      <path
        d={`${ACTUAL_PATH} L 440 200 L 20 200 Z`}
        fill="url(#traj-fade)"
        opacity={animated ? 0 : 1}
        className={animated ? "traj-fill" : ""}
      />

      {/* linha esperada (meta) */}
      <path
        d={EXPECTED_PATH}
        fill="none"
        stroke="#5B6584"
        strokeWidth="1.5"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <text x="440" y="196" textAnchor="end" fontSize="10" fill="#5B6584">
        meta
      </text>

      {/* linha real */}
      <path
        d={ACTUAL_PATH}
        fill="none"
        stroke="#60A5FA"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={animated ? "traj-line" : ""}
      />

      {MEASURE_POINTS.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === MEASURE_POINTS.length - 1 ? 4 : 2.5}
          fill="#0B1220"
          stroke="#60A5FA"
          strokeWidth="2"
          className={animated ? "traj-dot" : ""}
          style={animated ? { animationDelay: `${0.9 + i * 0.12}s` } : undefined}
        />
      ))}

      {animated && (
        <style>{`
          .traj-line {
            stroke-dasharray: 620;
            stroke-dashoffset: 620;
            animation: traj-draw 1.3s ease-out forwards;
          }
          .traj-fill {
            animation: traj-appear 0.6s ease-out 1.2s forwards;
          }
          .traj-dot {
            opacity: 0;
            transform-origin: center;
            transform: scale(0.4);
            animation: traj-pop 0.35s ease-out forwards;
          }
          @keyframes traj-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes traj-appear {
            to { opacity: 1; }
          }
          @keyframes traj-pop {
            to { opacity: 1; transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .traj-line, .traj-fill, .traj-dot {
              animation: none !important;
              opacity: 1 !important;
              stroke-dashoffset: 0 !important;
              transform: scale(1) !important;
            }
          }
        `}</style>
      )}
    </svg>
  );
}
```

### `src/components/onboarding/OnboardingFlow.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TrajectoryGraphic } from "@/components/marketing/TrajectoryGraphic";
import { KPI_STATUSES } from "@/lib/kpi-status";

const TOTAL_STEPS = 3;

// Deriva metas de mês/trimestre/semestre a partir da meta semanal, como
// ponto de partida — tudo continua editável em /dashboard/goals depois.
// Coerente com os defaults do schema (0.25/1/3/6).
function deriveGoals(weeklyLossKg: number) {
  return {
    weekly_loss_kg: weeklyLossKg,
    monthly_loss_kg: Number((weeklyLossKg * 4.345).toFixed(2)),
    quarterly_loss_kg: Number((weeklyLossKg * 13.04).toFixed(2)),
    semester_loss_kg: Number((weeklyLossKg * 26.07).toFixed(2)),
  };
}

export function OnboardingFlow({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [weeklyLossKg, setWeeklyLossKg] = useState("0.25");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    setError(null);

    const weekly = Number(weeklyLossKg.trim().replace(",", "."));
    const targetRaw = targetWeightKg.trim();
    const target = targetRaw ? Number(targetRaw.replace(",", ".")) : null;

    if (!Number.isFinite(weekly) || weekly <= 0) {
      setError("Informe uma meta semanal válida (ex: 0.25).");
      return;
    }
    if (target !== null && (Number.isNaN(target) || target <= 0 || target >= 500)) {
      setError("Peso alvo: informe um número entre 0 e 500 kg (ou deixe em branco).");
      return;
    }

    setLoading(true);

    const { error: goalsError } = await supabase.from("goals").upsert(
      {
        user_id: userId,
        ...deriveGoals(weekly),
        target_weight_kg: target,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (goalsError) {
      setLoading(false);
      setError("Não foi possível salvar sua meta. Tente novamente.");
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", userId);

    setLoading(false);

    if (profileError) {
      setError("Não foi possível concluir o onboarding. Tente novamente.");
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <StepDots current={step} />

      {step === 1 && (
        <StepWelcome displayName={displayName} onNext={() => setStep(2)} />
      )}

      {step === 2 && (
        <StepKpiExplainer onNext={() => setStep(3)} onBack={() => setStep(1)} />
      )}

      {step === 3 && (
        <StepFirstGoal
          weeklyLossKg={weeklyLossKg}
          targetWeightKg={targetWeightKg}
          onWeeklyLossChange={setWeeklyLossKg}
          onTargetWeightChange={setTargetWeightKg}
          onBack={() => setStep(2)}
          onFinish={handleFinish}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i + 1 === current
              ? "w-8 bg-signal-onpace"
              : i + 1 < current
                ? "w-1.5 bg-signal-onpace/50"
                : "w-1.5 bg-base-border"
          }`}
        />
      ))}
    </div>
  );
}

function StepWelcome({
  displayName,
  onNext,
}: {
  displayName: string;
  onNext: () => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-signal-onpace font-mono">
        bem-vindo(a)
      </p>
      <h1 className="mt-3 font-display font-bold text-3xl">
        Fala, {displayName.split(" ")[0]}.
      </h1>
      <p className="mt-4 text-ink-muted text-[15px] leading-relaxed">
        Antes de registrar a primeira pesagem, duas coisas rápidas: como o
        app mede seu progresso, e qual vai ser sua meta inicial. Menos de um
        minuto.
      </p>
      <button
        onClick={onNext}
        className="mt-8 w-full rounded-lg bg-signal-onpace text-base-bg font-medium py-3 text-sm hover:brightness-110 transition"
      >
        Vamos lá
      </button>
    </div>
  );
}

function StepKpiExplainer({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-signal-onpace font-mono">
        como o app mede
      </p>
      <h2 className="mt-3 font-display font-bold text-2xl">
        Peso descendo não é a mesma coisa que estar no ritmo.
      </h2>

      <div className="mt-6 bg-base-surface border border-base-border rounded-card p-4">
        <TrajectoryGraphic variant="compact" className="w-full" />
      </div>

      <p className="mt-5 text-ink-muted text-[14px] leading-relaxed">
        A cada pesagem, o app compara seu peso real com o peso que a{" "}
        <em>meta</em> previa pra hoje, e te dá um destes 4 status:
      </p>

      <ul className="mt-4 space-y-2.5">
        {KPI_STATUSES.map((s) => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
            <span className="text-[13px] leading-snug text-ink">
              <span className={`mr-1.5 text-[11px] uppercase font-mono ${s.text}`}>
                {s.label}
              </span>
              — {s.description}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-base-border px-5 py-3 text-sm text-ink-muted hover:text-ink transition"
        >
          Voltar
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-lg bg-signal-onpace text-base-bg font-medium py-3 text-sm hover:brightness-110 transition"
        >
          Entendi, configurar minha meta
        </button>
      </div>
    </div>
  );
}

function StepFirstGoal({
  weeklyLossKg,
  targetWeightKg,
  onWeeklyLossChange,
  onTargetWeightChange,
  onBack,
  onFinish,
  loading,
  error,
}: {
  weeklyLossKg: string;
  targetWeightKg: string;
  onWeeklyLossChange: (v: string) => void;
  onTargetWeightChange: (v: string) => void;
  onBack: () => void;
  onFinish: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-signal-onpace font-mono">
        última etapa
      </p>
      <h2 className="mt-3 font-display font-bold text-2xl">
        Qual o ritmo pra começar?
      </h2>
      <p className="mt-3 text-ink-muted text-[14px] leading-relaxed">
        Dá pra mudar isso a qualquer momento em Metas. 250 g/semana é um
        ritmo comum e sustentável — só um ponto de partida.
      </p>

      <label className="block mt-7">
        <span className="text-xs text-ink-muted mb-1.5 block">
          Meta semanal (kg)
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={weeklyLossKg}
          onChange={(e) => onWeeklyLossChange(e.target.value)}
          placeholder="0.25"
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-signal-onpace"
        />
      </label>

      <label className="block mt-4">
        <span className="text-xs text-ink-muted mb-1.5 block">
          Peso alvo (kg) — opcional
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={targetWeightKg}
          onChange={(e) => onTargetWeightChange(e.target.value)}
          placeholder="Deixe em branco se ainda não sabe"
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-signal-onpace"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm text-signal-behind" role="alert">
          {error}
        </p>
      )}

      <div className="mt-8 flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="rounded-lg border border-base-border px-5 py-3 text-sm text-ink-muted hover:text-ink transition disabled:opacity-50"
        >
          Voltar
        </button>
        <button
          onClick={onFinish}
          disabled={loading}
          className="flex-1 rounded-lg bg-signal-onpace text-base-bg font-medium py-3 text-sm hover:brightness-110 transition disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Concluir e ir pro dashboard"}
        </button>
      </div>
    </div>
  );
}
```

### `src/app/onboarding/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .single();

  // Já passou pelo onboarding — não deixa revisitar via URL direta.
  if (profile?.onboarded_at) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen">
      <OnboardingFlow
        userId={user.id}
        displayName={profile?.display_name ?? "Usuário"}
      />
    </main>
  );
}
```

---

## 3. Arquivo substituído: `src/app/page.tsx`

O arquivo original só faz `redirect(user ? "/dashboard" : "/login")`. Este já vem
com os CTAs ("Entrar", "Criar conta grátis", botões dos planos) apontando pro
subdomínio do app via `appPath()`, em vez de rota relativa — evita o retrabalho de
trocar isso depois:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrajectoryGraphic } from "@/components/marketing/TrajectoryGraphic";
import { plans } from "@/lib/pricing";
import { KPI_STATUSES } from "@/lib/kpi-status";
import { appPath } from "@/lib/app-url";

// Todo CTA desta página aponta pro subdomínio do app (appPath), não pra rota
// relativa — landing (apex) e app (app.*) são origens diferentes. Por isso
// usamos <a> em vez de <Link>: é navegação cross-origin, next/link não traz
// vantagem nenhuma aqui (sem prefetch, sem client-side routing possível).

export const metadata = {
  title: "Peso em Progresso — acompanhe o peso sem se enganar",
  description:
    "Registre seu peso e veja se está realmente no ritmo da sua meta — não só se está descendo.",
};

export default async function Home() {
  // Quem já tem conta não precisa ver a vitrine — vai direto pro dashboard.
  // Anônimo vê a landing (antes disso, este arquivo só redirecionava pro /login).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div>
      <Header />
      <Hero />
      <HowItWorks />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
      <span className="font-display font-bold text-lg">Peso em Progresso</span>
      <nav className="flex items-center gap-6 text-sm text-ink-muted">
        <a href="#como-funciona" className="hidden sm:inline hover:text-ink transition">
          Como funciona
        </a>
        <a href="#planos" className="hidden sm:inline hover:text-ink transition">
          Planos
        </a>
        <a
          href={appPath("/login")}
          className="border border-base-border rounded-lg px-3 py-1.5 text-xs hover:text-ink transition"
        >
          Entrar
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-4xl mx-auto px-4 pt-10 pb-20 sm:pt-16 grid sm:grid-cols-2 gap-10 sm:items-center">
      <div>
        <p className="text-xs uppercase tracking-wide text-signal-onpace font-mono mb-3">
          Não é só um diário de peso
        </p>
        <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.1]">
          Descer o peso é fácil de ver.
          <br />
          Descer <span className="text-signal-onpace">no ritmo certo</span> é
          a parte que ninguém mostra.
        </h1>
        <p className="mt-5 text-ink-muted text-[15px] leading-relaxed max-w-md">
          Você define a meta — 250 g por semana, 1 kg por mês, o que fizer
          sentido pra você. A cada pesagem, o app compara onde você está com
          onde deveria estar. Sem planilha, sem se enganar.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <a
            href={appPath("/login")}
            className="rounded-lg bg-signal-onpace text-base-bg font-medium px-6 py-3 text-sm hover:brightness-110 transition"
          >
            Criar conta grátis
          </a>
          <a
            href="#planos"
            className="text-sm text-ink-muted underline decoration-base-border underline-offset-4 hover:text-ink transition"
          >
            ver planos
          </a>
        </div>
      </div>

      <div className="bg-base-surface border border-base-border rounded-card p-6">
        <TrajectoryGraphic variant="hero" className="w-full" />
        <div className="mt-4 flex items-center justify-between font-mono text-xs text-ink-faint">
          <span>peso real</span>
          <span className="flex items-center gap-1.5 text-signal-onpace">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-onpace" />
            no ritmo
          </span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="border-t border-base-border py-20">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="font-display font-bold text-2xl sm:text-3xl max-w-lg">
          A cada pesagem, um veredito — não só um número.
        </h2>
        <p className="mt-3 text-ink-muted text-[15px] leading-relaxed max-w-lg">
          O app projeta onde seu peso deveria estar hoje, dado o dia em que
          você começou a meta, e compara com o que você acabou de registrar.
        </p>

        <div className="mt-10 grid sm:grid-cols-4 gap-3">
          {KPI_STATUSES.map((s) => (
            <div
              key={s.key}
              className="bg-base-surface border border-base-border rounded-card p-4"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
              <p className={`mt-3 text-xs uppercase tracking-wide font-mono ${s.text}`}>
                {s.label}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="planos" className="py-20">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="font-display font-bold text-2xl sm:text-3xl">Planos</h2>
        <p className="mt-2 text-ink-muted text-[15px]">
          Comece grátis. Mude quando fizer sentido — sem fidelidade.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-card border p-6 bg-base-surface ${
                plan.highlighted ? "border-signal-onpace" : "border-base-border"
              }`}
            >
              {plan.highlighted && (
                <span className="mb-3 w-fit rounded-full bg-signal-onpace/10 px-2.5 py-1 text-[10px] uppercase tracking-wide font-mono text-signal-onpace">
                  mais escolhido
                </span>
              )}
              <h3 className="font-display font-bold text-lg">{plan.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">{plan.tagline}</p>

              <p className="mt-5 flex items-baseline gap-1 font-mono">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.priceSuffix && (
                  <span className="text-sm text-ink-muted">{plan.priceSuffix}</span>
                )}
              </p>

              <ul className="mt-6 space-y-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-[13px] leading-snug text-ink">
                    <span className="text-signal-onpace mt-0.5">＋</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={appPath("/login")}
                className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-medium text-center transition ${
                  plan.highlighted
                    ? "bg-signal-onpace text-base-bg hover:brightness-110"
                    : "border border-base-border text-ink hover:border-signal-onpace hover:text-signal-onpace"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-ink-faint">
          Cobrança ainda não está ativa nesta versão — os planos pagos abrem
          fila de espera ao criar conta.
        </p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-base-border py-16 text-center px-4">
      <h2 className="font-display font-bold text-2xl">
        Sua próxima pesagem já pode virar dado, não só número.
      </h2>
      <a
        href={appPath("/login")}
        className="mt-6 inline-block rounded-lg bg-signal-onpace text-base-bg font-medium px-6 py-3 text-sm hover:brightness-110 transition"
      >
        Criar conta grátis
      </a>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-base-border py-8 px-4">
      <div className="max-w-4xl mx-auto flex items-center justify-between font-mono text-xs text-ink-faint">
        <span>Peso em Progresso</span>
        <a href={appPath("/login")} className="hover:text-ink-muted transition">
          entrar
        </a>
      </div>
    </footer>
  );
}
```

---

## 4. Patches em arquivos existentes

### 4.1 `src/types/database.ts`

Adicionar `onboarded_at` ao tipo `Profile`:

```diff
 export type Profile = {
   id: string;
   display_name: string;
   height_cm: number | null;
   created_at: string;
+  onboarded_at: string | null;
 };
```

---

### 4.2 `src/lib/loadUserData.ts`

Esse arquivo é usado pelas 3 páginas do dashboard (`/dashboard`,
`/dashboard/entries`, `/dashboard/goals`), então é o único lugar que precisa
do redirect — fecha o loop pra quem nunca passou pelo onboarding sem editar
cada página:

```diff
 import { redirect } from "next/navigation";
 import { createClient } from "@/lib/supabase/server";
 import type { Goals, Profile, WeightEntry } from "@/types/database";

 export async function loadUserData() {
   const supabase = createClient();
   const {
     data: { user },
   } = await supabase.auth.getUser();

   if (!user) redirect("/login");

   const [{ data: profile }, { data: entries }, { data: goals }] = await Promise.all([
     supabase.from("profiles").select("*").eq("id", user.id).single(),
     supabase
       .from("weight_entries")
       .select("*")
       .eq("user_id", user.id)
       .order("measured_at", { ascending: true }),
     supabase.from("goals").select("*").eq("user_id", user.id).single(),
   ]);

+  // Fase 0: quem nunca concluiu o onboarding é redirecionado antes de ver
+  // qualquer tela do dashboard.
+  if (profile && !(profile as Profile).onboarded_at) {
+    redirect("/onboarding");
+  }
+
   return {
     user,
     profile: (profile as Profile) ?? { id: user.id, display_name: user.email ?? "Usuário", height_cm: null, created_at: "" },
     entries: (entries as WeightEntry[]) ?? [],
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

Nota: se `profile` vier `null` (não deveria acontecer, o trigger
`handle_new_user` cria automaticamente), o redirect é pulado e cai no
fallback existente — mantém o comportamento atual pra esse caso extremo.

---

### 4.3 `src/lib/supabase/middleware.ts` — proteger `/onboarding`

Só pra manter o `/onboarding` protegido no edge, igual ao `/dashboard`
(evita renderizar a página pra depois redirecionar — mais rápido pra quem
não está logado tentar acessar a URL direto):

```diff
   const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
-  const isProtectedRoute = request.nextUrl.pathname.startsWith("/dashboard");
+  const isProtectedRoute =
+    request.nextUrl.pathname.startsWith("/dashboard") ||
+    request.nextUrl.pathname.startsWith("/onboarding");
```

---

### 4.4 `src/lib/supabase/middleware.ts` — separação por domínio

Adicionar a lógica abaixo dentro de `updateSession`, depois dos dois `if`
existentes (`!user && isProtectedRoute` / `user && isAuthRoute`) e antes do
`return response;` final:

```diff
   if (user && isAuthRoute) {
     const url = request.nextUrl.clone();
     url.pathname = "/dashboard";
     return NextResponse.redirect(url);
   }

+  // No subdomínio do app, a raiz "/" pula a landing (que só existe pro
+  // domínio apex) e vai direto pro fluxo de login/dashboard, igual o
+  // comportamento antigo de page.tsx antes da landing existir.
+  const host = request.headers.get("host") ?? "";
+  const isAppHost = host.startsWith("app.");
+
+  if (isAppHost && request.nextUrl.pathname === "/") {
+    const url = request.nextUrl.clone();
+    url.pathname = user ? "/dashboard" : "/login";
+    return NextResponse.redirect(url);
+  }
+
   return response;
 }
```

## 5. Variável de ambiente

Adicionar em `.env.local` (dev) e nas env vars do projeto na Vercel (Production
**e** Preview):

```
NEXT_PUBLIC_APP_URL=https://app.pesoemprogresso.com.br
```

Em dev local, sem essa variável definida, cai no fallback `http://localhost:3000`
(já tratado em `src/lib/app-url.ts`).

## 6. Ação manual (fora do código): Supabase

Authentication → URL Configuration:
- **Site URL**: `https://app.pesoemprogresso.com.br`
- **Redirect URLs**: adicionar `https://app.pesoemprogresso.com.br/**`

Sem isso o link de confirmação de e-mail do signup quebra em produção.

---

## 7. Checklist de teste

- [ ] npx tsc --noEmit limpo
- [ ] npm run build limpo
- [ ] Criar conta nova -> deve cair em /onboarding, não em /dashboard
- [ ] Completar as 3 telas -> deve gravar goals e profiles.onboarded_at, redirecionar pro /dashboard
- [ ] Acessar /onboarding manualmente depois de concluído -> deve redirecionar pro /dashboard
- [ ] pesoemprogresso.com.br/ deslogado -> mostra a landing
- [ ] pesoemprogresso.com.br/ logado -> redireciona pro /dashboard
- [ ] app.pesoemprogresso.com.br/ deslogado -> redireciona pro /login
- [ ] app.pesoemprogresso.com.br/ logado -> redireciona pro /dashboard
- [ ] Botões "Criar conta grátis" / "Entrar" na landing -> abrem app.pesoemprogresso.com.br/login
- [ ] Signup novo -> e-mail de confirmação -> link aponta pro subdomínio certo

---

## O que NÃO está incluído (fora do escopo da Fase 0)

- Lógica de cobrança — os 3 planos são só vitrine, todos os CTAs levam pro login.
  Isso é Fase 3.
- Nenhuma mudança em NavBar, /dashboard, /dashboard/entries ou /dashboard/goals além
  do patch em loadUserData.ts.
- Bloquear acesso ao app pelo domínio apex (pesoemprogresso.com.br/dashboard ainda
  funciona, por ser o mesmo deploy) — não é requisito da Fase 0, só cosmético.

## Depois de validar em produção

Marcar em claude_fases.md:

```
- [x] Landing page de preço (rota pública com planos, sem lógica de cobrança ainda)
- [x] Onboarding guiado (3 telas no primeiro login; coluna `profiles.onboarded_at`)
```

---

## 8. Patches de UI — Dashboard (v3)

Estas 5 alterações podem ser aplicadas independentemente da Fase 0 — são patches
em arquivos que já existem no projeto. Se você já rodou a v2, aplique só esta seção.

### 8.1 Layout mais largo em todas as rotas do dashboard

O `max-w-4xl` (896px) deixa muito espaço vago em telas maiores. Trocar por
`max-w-6xl` (1152px) em todos os 4 arquivos que usam esse container:

**`src/components/NavBar.tsx`** — 2 ocorrências:

```diff
-      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
+      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
```

**`src/app/dashboard/page.tsx`**:

```diff
-      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
+      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
```

**`src/app/dashboard/entries/page.tsx`**:

```diff
-      <main className="max-w-4xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
+      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
```

**`src/app/dashboard/goals/page.tsx`**:

```diff
-      <main className="max-w-4xl mx-auto px-4 py-8">
+      <main className="max-w-6xl mx-auto px-4 py-8">
```

---

### 8.2 Gráfico de peso mais alto

O `WeightChart` atual tem `h-72` (288px) — pouco pra uma tela de 1080p+.
Trocar por `h-96` (384px) em ambos os estados (com dados e sem dados):

**`src/components/WeightChart.tsx`** — 2 ocorrências:

```diff
-    <div className="bg-base-surface border border-base-border rounded-card p-4 h-72">
+    <div className="bg-base-surface border border-base-border rounded-card p-4 h-96">
```

```diff
-      <div className="bg-base-surface border border-base-border rounded-card p-6 h-72 flex items-center justify-center">
+      <div className="bg-base-surface border border-base-border rounded-card p-6 h-96 flex items-center justify-center">
```

---

### 8.3 Peso atual com destaque visual

O peso hoje (`109.7 kg`) aparece como um `text-3xl` comum — se perde no layout.
Trocar o bloco do peso atual e da variação no `src/app/dashboard/page.tsx`.

Substituir este bloco inteiro:

```tsx
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Visão geral</p>
            <h1 className="font-display font-bold text-3xl">
              {latest ? `${Number(latest.weight_kg).toFixed(1)} kg` : "Sem registros"}
            </h1>
            {totalChange !== null && (
              <p className="text-sm text-ink-faint mt-1">
                {totalChange <= 0 ? "-" : "+"}
                {Math.abs(totalChange).toFixed(1)} kg desde o primeiro registro
              </p>
            )}
          </div>
          <Link
            href="/dashboard/entries"
            className="text-sm rounded-lg bg-signal-onpace text-base-bg font-medium px-4 py-2 hover:brightness-110 transition"
          >
            Registrar pesagem
          </Link>
        </div>
```

Por este:

```tsx
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Visão geral</p>
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight">
              {latest ? (
                <>
                  <span className="text-ink" style={{ textShadow: "0 0 40px rgba(96,165,250,0.25)" }}>
                    {Number(latest.weight_kg).toFixed(1)}
                  </span>
                  <span className="text-2xl sm:text-3xl text-ink-muted font-medium ml-1">kg</span>
                </>
              ) : (
                <span className="text-ink-muted">Sem registros</span>
              )}
            </h1>
            {totalChange !== null && (
              <div className="mt-3 inline-flex items-center gap-2 bg-base-surface border border-base-border rounded-full px-3 py-1.5">
                <span className={`text-sm font-mono font-bold ${totalChange <= 0 ? "text-signal-ahead" : "text-signal-behind"}`}>
                  {totalChange <= 0 ? "↓" : "↑"} {Math.abs(totalChange).toFixed(1)} kg
                </span>
                <span className="text-xs text-ink-faint">desde o primeiro registro</span>
              </div>
            )}
          </div>
          <Link
            href="/dashboard/entries"
            className="text-sm rounded-lg bg-signal-onpace text-base-bg font-medium px-5 py-2.5 hover:brightness-110 transition"
          >
            Registrar pesagem
          </Link>
        </div>
```

O que muda:
- Peso de `text-3xl` para `text-5xl sm:text-6xl` com um glow sutil azul
  (`textShadow: 0 0 40px rgba(96,165,250,0.25)`) que respira sem parecer neon.
- "kg" separado em span menor, na cor `ink-muted`, pra não competir com o número.
- A variação sai de um `<p>` discreto para um **badge pill** com fundo `base-surface`,
  borda, e a seta ↓/↑ colorida (verde se desceu, rosa se subiu) — visualmente
  parece um chip de status, não uma nota de rodapé.

---

### Checklist adicional (v3)

- [ ] Nenhuma classe hardcoded nova (`bg-[#...]`, `text-[#...]`) — o glow usa
      `style` inline só pro `textShadow` porque Tailwind não tem utilitário de
      text-shadow; as cores vêm das variáveis CSS que o token `signal-onpace`
      (#60A5FA) já define.
- [ ] O `max-w-6xl` também se aplica à landing (`max-w-4xl` → `max-w-5xl`)?
      Não — a landing já usa `max-w-5xl` com design próprio; esta mudança é só
      pro dashboard.
- [ ] O gráfico com `h-96` precisa de ajuste no `ResponsiveContainer height`?
      Não — o `height="90%"` existente é relativo ao container, funciona igual.

