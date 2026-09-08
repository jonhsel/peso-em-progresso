"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ActivityGoal } from "@/types/database";

export default function ActivityGoalForm({
  userId,
  activityTypeId,
  currentGoal,
  onSaved,
}: {
  userId: string;
  activityTypeId: string;
  currentGoal: ActivityGoal | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [minutes, setMinutes] = useState(
    currentGoal ? String(currentGoal.weekly_minutes_target) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = minutes.trim();
    const value = Number(trimmed.replace(",", "."));
    if (trimmed === "" || !Number.isFinite(value) || value <= 0) {
      setError("Informe um número de minutos válido, maior que zero.");
      return;
    }

    setLoading(true);
    const { error: supaError } = currentGoal
      ? await supabase
          .from("activity_goals")
          .update({
            weekly_minutes_target: value,
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentGoal.id)
      : await supabase.from("activity_goals").insert({
          user_id: userId,
          activity_type_id: activityTypeId,
          weekly_minutes_target: value,
        });
    setLoading(false);

    if (supaError) {
      setError("Não foi possível salvar a meta.");
      return;
    }

    router.refresh();
    onSaved?.();
  }

  async function handleRemove() {
    if (!currentGoal) return;
    setLoading(true);
    const { error: supaError } = await supabase
      .from("activity_goals")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", currentGoal.id);
    setLoading(false);

    if (supaError) {
      setError("Não foi possível remover a meta.");
      return;
    }

    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label className="block text-xs text-ink-muted mb-1.5">
          Meta semanal (minutos)
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="ex: 150"
          className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm font-mono outline-none focus:border-accent"
        />
        {error && <p className="mt-1.5 text-xs text-signal-behind">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
      >
        {loading ? "Salvando..." : "Salvar"}
      </button>
      {currentGoal && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={loading}
          className="rounded-lg border border-base-border px-3 py-2 text-sm text-ink-muted disabled:opacity-60 transition hover:text-signal-behind"
        >
          Remover meta
        </button>
      )}
    </form>
  );
}
