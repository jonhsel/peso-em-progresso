"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { METRIC_UNIT, METRIC_LABEL } from "@/lib/analytics";
import type { Goal } from "@/types/database";

export default function GoalsForm({ userId, goal }: { userId: string; goal: Goal }) {
  const router = useRouter();
  const supabase = createClient();
  const unit = METRIC_UNIT[goal.metric];

  const [weekly, setWeekly] = useState(String(goal.weekly_rate));
  const [monthly, setMonthly] = useState(String(goal.monthly_rate));
  const [quarterly, setQuarterly] = useState(String(goal.quarterly_rate));
  const [semester, setSemester] = useState(String(goal.semester_rate));
  const [target, setTarget] = useState(goal.target_value ? String(goal.target_value) : "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseta os campos quando a meta selecionada muda (troca de aba/edição).
  useEffect(() => {
    setWeekly(String(goal.weekly_rate));
    setMonthly(String(goal.monthly_rate));
    setQuarterly(String(goal.quarterly_rate));
    setSemester(String(goal.semester_rate));
    setTarget(goal.target_value ? String(goal.target_value) : "");
    setError(null);
    setSaved(false);
  }, [goal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Converte string do input em número. String vazia → NaN (não zero). */
  const parseRequired = (v: string): number => {
    const trimmed = v.trim();
    if (trimmed === "") return NaN;
    return Number(trimmed.replace(",", "."));
  };

  const parseOptional = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    return Number(trimmed.replace(",", "."));
  };

  // Some com a mensagem "Metas atualizadas" após 3s
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const w = parseRequired(weekly);
    const m = parseRequired(monthly);
    const q = parseRequired(quarterly);
    const s = parseRequired(semester);
    const t = parseOptional(target);

    const requiredValues = { "Meta semanal": w, "Meta mensal": m, "Meta trimestral": q, "Meta semestral": s };
    for (const [label, value] of Object.entries(requiredValues)) {
      if (isNaN(value)) {
        setError(`${label}: informe um número válido (use ponto ou vírgula).`);
        return;
      }
      if (value < 0) {
        setError(`${label}: não pode ser negativa.`);
        return;
      }
    }

    if (t !== null && (isNaN(t) || t <= 0 || t >= 500)) {
      setError(`Valor alvo: informe um número entre 0 e 500 ${unit} (ou deixe em branco).`);
      return;
    }

    const payload = {
      weekly_rate: w,
      monthly_rate: m,
      quarterly_rate: q,
      semester_rate: s,
      target_value: t,
      updated_at: new Date().toISOString(),
    };

    setLoading(true);
    const { error: supaError } = await supabase.from("goals").update(payload).eq("id", goal.id);
    setLoading(false);

    if (supaError) {
      setError("Não foi possível salvar as metas.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-5 space-y-4 max-w-md">
      <div>
        <p className="font-display font-bold text-lg mb-1">
          Meta de {METRIC_LABEL[goal.metric]}
          {goal.label ? ` — ${goal.label}` : ""}
        </p>
        <p className="text-sm text-ink-faint">
          Defina quanto deseja mudar em cada período. Os KPIs desta meta usam esses valores.
        </p>
      </div>

      <Field label={`Meta semanal (${unit})`} value={weekly} onChange={setWeekly} placeholder="0.25" />
      <Field label={`Meta mensal (${unit})`} value={monthly} onChange={setMonthly} placeholder="1.0" />
      <Field label={`Meta trimestral (${unit})`} value={quarterly} onChange={setQuarterly} placeholder="3.0" />
      <Field label={`Meta semestral (${unit})`} value={semester} onChange={setSemester} placeholder="6.0" />
      <Field label={`Valor alvo final (${unit}) — opcional`} value={target} onChange={setTarget} placeholder="ex: 80" />

      {error && <p className="text-sm text-signal-behind">{error}</p>}
      {saved && <p className="text-sm text-signal-ahead">Metas atualizadas.</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Salvar metas"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1.5">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
      />
    </div>
  );
}
