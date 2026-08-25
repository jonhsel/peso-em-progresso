"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Goals } from "@/types/database";

export default function GoalsForm({ userId, goals }: { userId: string; goals: Goals }) {
  const router = useRouter();
  const supabase = createClient();

  const [weekly, setWeekly] = useState(String(goals.weekly_loss_kg));
  const [monthly, setMonthly] = useState(String(goals.monthly_loss_kg));
  const [quarterly, setQuarterly] = useState(String(goals.quarterly_loss_kg));
  const [semester, setSemester] = useState(String(goals.semester_loss_kg));
  const [target, setTarget] = useState(goals.target_weight_kg ? String(goals.target_weight_kg) : "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (v: string) => Number(v.replace(",", "."));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const payload = {
      user_id: userId,
      weekly_loss_kg: num(weekly),
      monthly_loss_kg: num(monthly),
      quarterly_loss_kg: num(quarterly),
      semester_loss_kg: num(semester),
      target_weight_kg: target ? num(target) : null,
      updated_at: new Date().toISOString(),
    };

    if (Object.values(payload).some((v) => typeof v === "number" && (isNaN(v) || v < 0))) {
      setError("Verifique se todos os valores são números válidos.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("goals").upsert(payload, { onConflict: "user_id" });
    setLoading(false);

    if (error) {
      setError("Não foi possível salvar as metas.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-5 space-y-4 max-w-md">
      <div>
        <p className="font-display font-bold text-lg mb-1">Suas metas de perda de peso</p>
        <p className="text-sm text-ink-faint">
          Defina quanto deseja perder em cada período. Os KPIs do painel usam esses valores.
        </p>
      </div>

      <Field label="Meta semanal (kg)" value={weekly} onChange={setWeekly} placeholder="0.25" />
      <Field label="Meta mensal (kg)" value={monthly} onChange={setMonthly} placeholder="1.0" />
      <Field label="Meta trimestral (kg)" value={quarterly} onChange={setQuarterly} placeholder="3.0" />
      <Field label="Meta semestral (kg)" value={semester} onChange={setSemester} placeholder="6.0" />
      <Field label="Peso alvo final (kg) — opcional" value={target} onChange={setTarget} placeholder="ex: 80" />

      {error && <p className="text-sm text-signal-behind">{error}</p>}
      {saved && <p className="text-sm text-signal-ahead">Metas atualizadas.</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-signal-onpace text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:brightness-110"
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
        className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-signal-onpace"
      />
    </div>
  );
}
