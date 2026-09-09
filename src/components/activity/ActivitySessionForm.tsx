"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ActivityType } from "@/types/database";

function nowInSaoPauloForInput(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(" ", "T");
}

/** Converte string do input em número. String vazia → NaN (não zero). */
const parseRequired = (v: string): number => {
  const trimmed = v.trim();
  if (trimmed === "") return NaN;
  return Number(trimmed.replace(",", "."));
};

const parseOptional = (v: string): number | null => {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function ActivitySessionForm({
  userId,
  types,
}: {
  userId: string;
  types: ActivityType[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [performedAt, setPerformedAt] = useState(nowInSaoPauloForInput());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const selectedType = types.find((t) => t.id === typeId) ?? null;

  if (types.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-4">
        <p className="text-sm text-ink-muted">
          Crie um tipo de atividade abaixo antes de registrar uma sessão.
        </p>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (!typeId) {
      setError("Selecione um tipo de atividade.");
      return;
    }

    const durationValue = parseRequired(duration);
    if (isNaN(durationValue) || durationValue <= 0) {
      setError("Duração: informe um número de minutos válido, maior que zero.");
      return;
    }

    const distanceValue = selectedType?.track_distance ? parseOptional(distance) : null;

    if (!performedAt) {
      setError("Informe a data/hora da sessão.");
      return;
    }

    setLoading(true);
    const { error: supaError } = await supabase.from("activity_sessions").insert({
      user_id: userId,
      activity_type_id: typeId,
      duration_minutes: durationValue,
      distance_km: distanceValue,
      performed_at: new Date(performedAt).toISOString(),
      note: note.trim() || null,
    });
    setLoading(false);

    if (supaError) {
      setError("Não foi possível salvar a sessão.");
      return;
    }

    setDuration("");
    setDistance("");
    setNote("");
    setPerformedAt(nowInSaoPauloForInput());
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Registrar sessão</p>

      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Tipo</label>
        <select
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Duração (min)</label>
          <input
            type="text"
            inputMode="decimal"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="ex: 30"
            className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        {selectedType?.track_distance && (
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Distância (km)</label>
            <input
              type="text"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="ex: 5,0"
              className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Quando</label>
        <input
          type="datetime-local"
          value={performedAt}
          onChange={(e) => setPerformedAt(e.target.value)}
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs text-ink-muted mb-1.5">Nota (opcional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex: treino de pernas..."
          rows={2}
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {error && <p className="text-sm text-signal-behind">{error}</p>}
      {saved && <p className="text-sm text-signal-ahead">Sessão registrada.</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Registrar sessão"}
      </button>
    </form>
  );
}
