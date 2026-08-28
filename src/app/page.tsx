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
  const steps = [
    {
      number: "01",
      title: "Defina sua meta",
      description:
        "Escolha uma meta de peso por período — semana, mês, trimestre ou semestre. Por exemplo, perder 250g por semana. Muda quando você quiser.",
    },
    {
      number: "02",
      title: "Registre seu peso",
      description:
        "Uma pesagem por dia, direto da balança. Leva uns 10 segundos e fica salvo no seu histórico particular.",
    },
    {
      number: "03",
      title: "Veja se está no ritmo",
      description:
        "O app compara seu peso de hoje com o que era esperado nesse ponto da meta e te mostra um status claro.",
    },
  ];

  return (
    <section id="como-funciona" className="border-t border-base-border py-20">
      <div className="max-w-4xl mx-auto px-4">
        <p className="text-xs uppercase tracking-wide text-ink-faint font-mono mb-3">
          Como funciona
        </p>
        <h2 className="font-display font-bold text-2xl sm:text-3xl max-w-lg">
          A cada pesagem, um veredito — não só um número.
        </h2>
        <p className="mt-3 text-ink-muted text-[15px] leading-relaxed max-w-lg">
          Você define a meta. O app projeta onde seu peso deveria estar hoje
          e compara com o que você acabou de registrar — sem planilha, sem
          adivinhação.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="rounded-card border border-base-border bg-base-surface p-5"
            >
              <span className="font-mono text-xs text-ink-faint">{step.number}</span>
              <h3 className="font-display font-bold text-base mt-2 mb-1.5">
                {step.title}
              </h3>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-14 mb-4 text-xs uppercase tracking-wide text-ink-faint font-mono">
          O status que você vê no dashboard
        </p>
        <div className="grid sm:grid-cols-4 gap-3">
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
