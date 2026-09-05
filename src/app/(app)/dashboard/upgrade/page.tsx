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
