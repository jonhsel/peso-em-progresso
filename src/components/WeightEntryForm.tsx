"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

export default function WeightEntryForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const weightNum = Number(weight.replace(",", "."));
    if (!weightNum || weightNum <= 0 || weightNum >= 500) {
      setError("Informe um peso válido em kg.");
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from("weight_entries")
      .upsert(
        {
          user_id: userId,
          measured_at: date,
          weight_kg: weightNum,
          note: note || null,
          source: "manual",
        },
        { onConflict: "user_id,measured_at" }
      );

    setLoading(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }

    setWeight("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-wide text-ink-muted">Registrar pesagem</p>
      <div className="grid grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Peso (kg)</label>
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="ex: 92,4"
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
          placeholder="ex: pós-treino, em jejum..."
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Salvar pesagem"}
      </button>
      <p className="text-xs text-ink-faint">
        Já existe um registro na data escolhida? Ele será atualizado (1 pesagem por dia).
      </p>
    </form>
  );
}
