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
