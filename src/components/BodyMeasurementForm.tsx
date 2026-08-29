"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELD_LIMITS: Record<FieldKey, { min: number; max: number; label: string }> = {
  waist_cm: { min: 0, max: 300, label: "Cintura" },
  hip_cm: { min: 0, max: 300, label: "Quadril" },
  arm_cm: { min: 0, max: 100, label: "Braço" },
  body_fat_pct: { min: 0, max: 100, label: "% gordura" },
};

// Campo vazio precisa virar `null` (medida não tirada), nunca `0` —
// Number("") === 0 já quebrou os KPIs de meta uma vez neste projeto.
function parseOptionalNumber(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (Number.isNaN(n)) return "invalid";
  return n;
}

export default function BodyMeasurementForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [arm, setArm] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed: Record<FieldKey, number | null | "invalid"> = {
      waist_cm: parseOptionalNumber(waist),
      hip_cm: parseOptionalNumber(hip),
      arm_cm: parseOptionalNumber(arm),
      body_fat_pct: parseOptionalNumber(bodyFat),
    };

    for (const key of Object.keys(parsed) as FieldKey[]) {
      const value = parsed[key];
      const { min, max, label } = FIELD_LIMITS[key];
      if (value === "invalid") {
        setError(`${label}: valor inválido.`);
        return;
      }
      if (value !== null && (value <= min || value >= max)) {
        setError(`${label}: valor fora do intervalo esperado.`);
        return;
      }
    }

    if (
      parsed.waist_cm === null &&
      parsed.hip_cm === null &&
      parsed.arm_cm === null &&
      parsed.body_fat_pct === null
    ) {
      setError("Preencha ao menos uma medida.");
      return;
    }

    setLoading(true);
    const { error: supaError } = await supabase.from("body_measurements").upsert(
      {
        user_id: userId,
        measured_at: date,
        waist_cm: parsed.waist_cm as number | null,
        hip_cm: parsed.hip_cm as number | null,
        arm_cm: parsed.arm_cm as number | null,
        body_fat_pct: parsed.body_fat_pct as number | null,
        note: note || null,
      },
      { onConflict: "user_id,measured_at" }
    );

    setLoading(false);
    if (supaError) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }

    setWaist("");
    setHip("");
    setArm("");
    setBodyFat("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Registrar medidas</p>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Data</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={format(new Date(), "yyyy-MM-dd")}
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Cintura (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            placeholder="ex: 82,5"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Quadril (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={hip}
            onChange={(e) => setHip(e.target.value)}
            placeholder="ex: 98,0"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Braço (cm)</label>
          <input
            type="text"
            inputMode="decimal"
            value={arm}
            onChange={(e) => setArm(e.target.value)}
            placeholder="ex: 32,0"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">% gordura</label>
          <input
            type="text"
            inputMode="decimal"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="ex: 18,5"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Nota (opcional)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex: medido em jejum..."
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Salvar medidas"}
      </button>
      <p className="text-xs text-ink-faint">
        Preencha só o que tiver medido — não precisa dos 4 campos toda vez. Já
        existe registro na data escolhida? Ele será atualizado.
      </p>
    </form>
  );
}
