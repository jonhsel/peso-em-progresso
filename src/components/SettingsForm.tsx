"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

// Mesma armadilha de Number("") === 0: aqui o efeito seria pior que meta
// zerada — checkin_hour = 0 (meia-noite) sendo salvo por engano em vez de
// null ("não definido"). "" tem que virar null antes de qualquer Number().
function parseOptionalCheckinHour(value: string): number | null {
  if (value === "") return null;
  return Number(value);
}

const CHECKIN_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

const PERIOD_MODE_OPTIONS = [
  {
    value: "fixed" as const,
    title: "Semana/mês corrido",
    desc:
      "Sua semana reinicia toda segunda (ou domingo, como preferir) e " +
      "seu mês reinicia no dia 1 — como num calendário normal. Os KPIs " +
      "de trimestre e semestre também seguem esse calendário civil.",
  },
  {
    value: "rolling" as const,
    title: "Últimos N dias",
    desc:
      "Os KPIs olham sempre para trás a partir de hoje: os últimos 7 " +
      "dias para a meta semanal, os últimos 30 para a mensal, e assim " +
      "por diante. Não depende de qual dia do mês ou da semana é hoje.",
  },
  {
    value: "anchored" as const,
    title: "A partir de uma data",
    desc:
      "Você escolhe uma data de início (ex.: quando começou este ciclo " +
      "de emagrecimento) e todos os KPIs passam a contar o progresso a " +
      "partir dela, não a partir de hoje. Pesagens anteriores a essa " +
      "data continuam aparecendo no seu histórico e gráfico normalmente.",
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
  checkinHour,
  plan,
  periodAnchorDate,
}: {
  userId: string;
  displayName: string;
  heightCm: number | null;
  periodMode: PeriodMode;
  weekStartsOn: WeekStartsOn;
  checkinHour: number | null;
  plan: "free" | "pro";
  periodAnchorDate: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(displayName);
  const [height, setHeight] = useState(heightCm !== null ? String(heightCm) : "");
  const [mode, setMode] = useState<PeriodMode>(periodMode);
  const [weekStart, setWeekStart] = useState<WeekStartsOn>(weekStartsOn);
  const [anchorDate, setAnchorDate] = useState<string>(periodAnchorDate ?? "");
  const [checkinHourInput, setCheckinHourInput] = useState(checkinHour !== null ? String(checkinHour) : "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  // Some com a mensagem "Configurações atualizadas" após 3s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  function validate(): { display_name: string; height_cm: number | null; checkin_hour: number | null } | null {
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

    const parsedCheckinHour = parseOptionalCheckinHour(checkinHourInput);

    if (mode === "anchored") {
      if (!anchorDate) {
        setError("Escolha uma data de início.");
        return null;
      }
      if (anchorDate > todayStr) {
        setError("A data de início não pode ser no futuro.");
        return null;
      }
    }

    return { display_name: trimmedName, height_cm: parsedHeight, checkin_hour: parsedCheckinHour };
  }

  async function persist(values: { display_name: string; height_cm: number | null; checkin_hour: number | null }) {
    setLoading(true);
    setError(null);

    const { error: supaError } = await supabase
      .from("profiles")
      .update({
        display_name: values.display_name,
        height_cm: values.height_cm,
        period_mode: mode,
        week_starts_on: weekStart,
        checkin_hour: values.checkin_hour,
        ...(mode === "anchored" ? { period_anchor_date: anchorDate } : {}),
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

          <div id="checkin" className="scroll-mt-8">
            <label className="block text-xs text-ink-muted mb-1.5">
              Horário de registro — opcional
            </label>
            <select
              value={checkinHourInput}
              onChange={(e) => setCheckinHourInput(e.target.value)}
              className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Não definir</option>
              {CHECKIN_HOUR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-base-surface border border-base-border rounded-card p-5 space-y-4">
          <div className={plan === "free" ? "opacity-50 pointer-events-none" : ""}>
            <div>
              <p className="font-display font-bold text-lg mb-1">
                Período das metas
                {plan === "free" && (
                  <Link
                    href="/dashboard/upgrade"
                    className="ml-2 text-xs text-accent hover:underline pointer-events-auto"
                  >
                    (Pro)
                  </Link>
                )}
              </p>
              <p className="text-sm text-ink-faint">
                Define quando cada período (semana/mês/trimestre/semestre) começa
                pra calcular seus KPIs.
              </p>
            </div>

            <div className="space-y-3 mt-4">
              {PERIOD_MODE_OPTIONS.map((opt) => {
                const isAnchoredLocked = opt.value === "anchored" && plan !== "pro";
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isAnchoredLocked}
                    onClick={() => {
                      if (!isAnchoredLocked) setMode(opt.value);
                    }}
                    className={`w-full text-left rounded-card border p-4 transition ${
                      mode === opt.value
                        ? "border-accent bg-base-surface2"
                        : "border-base-border bg-base-surface hover:border-ink-faint"
                    } ${isAnchoredLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="text-sm font-medium text-ink">
                      {opt.title}
                      {isAnchoredLocked && (
                        <Link
                          href="/dashboard/upgrade"
                          className="ml-2 text-xs text-accent hover:underline pointer-events-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
                          (Pro)
                        </Link>
                      )}
                    </span>
                    <span className="block mt-1 text-[13px] text-ink-muted">{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {mode === "anchored" && (
              <label className="block mt-4">
                <span className="text-xs text-ink-muted mb-1.5 block">
                  Data de início do período:
                </span>
                <input
                  type="date"
                  value={anchorDate}
                  max={todayStr}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
                  required
                />
              </label>
            )}

            <label className="block mt-4">
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
              <p className="text-xs text-ink-faint mt-4">
                Quando em modo &quot;Semana/mês corrido&quot;, o início de semana
                configurado aqui também será usado pelo seletor de período do
                gráfico.
              </p>
            )}
          </div>
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
