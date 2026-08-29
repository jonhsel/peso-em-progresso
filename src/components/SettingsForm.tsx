"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PeriodMode, WeekStartsOn } from "@/types/database";
import ConfirmDialog from "@/components/ConfirmDialog";

// Campo vazio precisa virar `null` (altura não informada), nunca `0` —
// Number("") === 0 já quebrou os KPIs de meta uma vez neste projeto
// (ver BodyMeasurementForm.tsx / GoalsForm.tsx).
function parseOptionalHeight(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n >= 300) return "invalid";
  return n;
}

const PERIOD_MODE_OPTIONS = [
  {
    value: "fixed" as const,
    title: "Semana/mês corrido",
    desc: "Semana de segunda a domingo, mês do dia 1 ao fim.",
  },
  {
    value: "rolling" as const,
    title: "Últimos N dias",
    desc: "Sempre os últimos 7/30/90/180 dias a partir de hoje.",
  },
];

const WEEK_STARTS_ON_OPTIONS = [
  { value: "monday" as const, label: "Segunda-feira" },
  { value: "sunday" as const, label: "Domingo" },
];

export default function SettingsForm({
  userId,
  displayName,
  heightCm,
  periodMode,
  weekStartsOn,
}: {
  userId: string;
  displayName: string;
  heightCm: number | null;
  periodMode: PeriodMode;
  weekStartsOn: WeekStartsOn;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(displayName);
  const [height, setHeight] = useState(heightCm !== null ? String(heightCm) : "");
  const [mode, setMode] = useState<PeriodMode>(periodMode);
  const [weekStart, setWeekStart] = useState<WeekStartsOn>(weekStartsOn);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Some com a mensagem "Configurações atualizadas" após 3s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  function validate(): { display_name: string; height_cm: number | null } | null {
    const trimmedName = name.trim();
    if (trimmedName === "") {
      setError("Nome: informe um valor.");
      return null;
    }

    const parsedHeight = parseOptionalHeight(height);
    if (parsedHeight === "invalid") {
      setError("Altura: informe um número entre 0 e 300 cm (ou deixe em branco).");
      return null;
    }

    return { display_name: trimmedName, height_cm: parsedHeight };
  }

  async function persist(values: { display_name: string; height_cm: number | null }) {
    setLoading(true);
    setError(null);

    const { error: supaError } = await supabase
      .from("profiles")
      .update({
        display_name: values.display_name,
        height_cm: values.height_cm,
        period_mode: mode,
        week_starts_on: weekStart,
      })
      .eq("id", userId);

    setLoading(false);

    if (supaError) {
      setError("Não foi possível salvar as configurações.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const values = validate();
    if (!values) return;

    if (mode !== periodMode) {
      setConfirmOpen(true);
      return;
    }

    await persist(values);
  }

  function handleConfirmModeChange() {
    setConfirmOpen(false);
    const values = validate();
    if (!values) return;
    persist(values);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-base-surface border border-base-border rounded-card p-5 space-y-4">
          <div>
            <p className="font-display font-bold text-lg mb-1">Perfil</p>
            <p className="text-sm text-ink-faint">Como você aparece no app.</p>
          </div>

          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Altura (cm) — opcional</label>
            <input
              type="text"
              inputMode="decimal"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="ex: 175"
              className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="bg-base-surface border border-base-border rounded-card p-5 space-y-4">
          <div>
            <p className="font-display font-bold text-lg mb-1">Período das metas</p>
            <p className="text-sm text-ink-faint">
              Define quando cada período (semana/mês/trimestre/semestre) começa
              pra calcular seus KPIs.
            </p>
          </div>

          <div className="space-y-3">
            {PERIOD_MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`w-full text-left rounded-card border p-4 transition ${
                  mode === opt.value
                    ? "border-accent bg-base-surface2"
                    : "border-base-border bg-base-surface hover:border-ink-faint"
                }`}
              >
                <span className="text-sm font-medium text-ink">{opt.title}</span>
                <span className="block mt-1 text-[13px] text-ink-muted">{opt.desc}</span>
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-xs text-ink-muted mb-1.5 block">Sua semana começa em:</span>
            <div className="flex gap-3">
              {WEEK_STARTS_ON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWeekStart(opt.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    weekStart === opt.value
                      ? "border-accent bg-base-surface2 text-ink"
                      : "border-base-border text-ink-muted hover:border-ink-faint"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>

          {mode === "fixed" && (
            <p className="text-xs text-ink-faint">
              Quando em modo &quot;Semana/mês corrido&quot;, o início de semana
              configurado aqui também será usado pelo seletor de período do
              gráfico (funcionalidade futura).
            </p>
          )}
        </div>

        {error && <p className="text-sm text-signal-behind">{error}</p>}
        {saved && <p className="text-sm text-signal-ahead">Configurações atualizadas.</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full max-w-md rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Mudar modo de período"
        message="Isso vai mudar como suas metas são medidas. Os KPIs de semana, mês, trimestre e semestre vão recalcular na hora. Tem certeza?"
        onConfirm={handleConfirmModeChange}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
