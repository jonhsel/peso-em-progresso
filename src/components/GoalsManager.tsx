"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GoalsForm from "@/components/GoalsForm";
import GoalsHistoryList from "@/components/GoalsHistoryList";
import { METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
import { goalLimitFor, allowedGoalMetricsFor } from "@/lib/plan";
import type { Goal, GoalMetric, GoalsHistoryEntry } from "@/types/database";

/**
 * Gerencia as até 3 metas ativas do usuário (Fase 6.2): lista resumida com
 * seleção/edição/desativação, e criação de meta nova por métrica. A meta
 * selecionada é editada abaixo via GoalsForm (1 meta por vez) + seu
 * histórico filtrado (GoalsHistoryList).
 *
 * Fase 7: limite de metas e métricas permitidas dependem do plano
 * (src/lib/plan.ts) — free trava em 1 meta, só peso; pro sobe pra 3,
 * qualquer métrica. A trava de verdade é o trigger Postgres
 * (enforce_max_active_goals); isto aqui só evita a viagem ao banco.
 */
export default function GoalsManager({
  userId,
  activeGoals,
  goalsHistory,
  plan,
}: {
  userId: string;
  activeGoals: Goal[];
  goalsHistory: GoalsHistoryEntry[];
  plan: "free" | "pro";
}) {
  const router = useRouter();
  const supabase = createClient();
  const METRIC_OPTIONS = allowedGoalMetricsFor({ plan });
  const goalLimit = goalLimitFor({ plan });
  const [selectedId, setSelectedId] = useState<string | null>(activeGoals[0]?.id ?? null);
  const [adding, setAdding] = useState(false);
  const [newMetric, setNewMetric] = useState<GoalMetric>("weight");
  const [savingNew, setSavingNew] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedGoal = activeGoals.find((g) => g.id === selectedId) ?? null;
  const canAddMore = activeGoals.length < goalLimit;

  async function handleDeactivate(goal: Goal) {
    const label = `${METRIC_LABEL[goal.metric]}${goal.label ? ` — ${goal.label}` : ""}`;
    if (
      !window.confirm(
        `Desativar a meta "${label}"? Ela sai do dashboard, mas o histórico é preservado.`
      )
    ) {
      return;
    }
    setDeactivatingId(goal.id);
    setError(null);
    const { error: supaError } = await supabase
      .from("goals")
      .update({ is_active: false })
      .eq("id", goal.id);
    setDeactivatingId(null);

    if (supaError) {
      setError("Não foi possível desativar essa meta.");
      return;
    }
    if (selectedId === goal.id) setSelectedId(null);
    router.refresh();
  }

  async function handleAdd() {
    setError(null);
    setSavingNew(true);
    const { error: supaError } = await supabase.from("goals").insert({
      user_id: userId,
      metric: newMetric,
    });
    setSavingNew(false);

    if (supaError) {
      setError(
        `Não foi possível criar essa meta (talvez o limite de ${goalLimit} meta(s) ativa(s) já tenha sido atingido).`
      );
      return;
    }
    setAdding(false);
    setNewMetric("weight");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
        <p className="font-display font-bold text-lg mb-3">Suas metas ativas</p>

        <ul className="space-y-2">
          {activeGoals.map((goal) => (
            <li
              key={goal.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition ${
                goal.id === selectedId ? "border-accent bg-base-surface2" : "border-base-border"
              }`}
            >
              <button type="button" onClick={() => setSelectedId(goal.id)} className="flex-1 text-left">
                <span className="text-sm text-ink">
                  {METRIC_LABEL[goal.metric]}
                  {goal.label ? ` — ${goal.label}` : ""}
                </span>
                <span className="block text-xs text-ink-faint font-mono mt-0.5">
                  {goal.weekly_rate} {METRIC_UNIT[goal.metric]}/semana
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(goal)}
                disabled={deactivatingId === goal.id}
                className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50"
              >
                {deactivatingId === goal.id ? "..." : "Desativar"}
              </button>
            </li>
          ))}
          {activeGoals.length === 0 && <p className="text-sm text-ink-faint">Nenhuma meta ativa.</p>}
        </ul>

        {error && <p className="mt-3 text-sm text-signal-behind">{error}</p>}

        <div className="mt-4 pt-4 border-t border-base-border">
          {adding ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-ink-muted mb-1.5 block">Métrica da nova meta</span>
                <select
                  value={newMetric}
                  onChange={(e) => setNewMetric(e.target.value as GoalMetric)}
                  className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {METRIC_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink-muted hover:text-ink transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={savingNew}
                  className="flex-1 rounded-lg bg-accent text-base-bg font-medium py-2 text-sm hover:bg-accent-hover transition disabled:opacity-60"
                >
                  {savingNew ? "Criando..." : "Criar meta"}
                </button>
              </div>
              <p className="text-xs text-ink-faint">
                A nova meta começa com os valores padrão (0.25/1/3/6) — edite-os depois de criada.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={!canAddMore}
              title={
                !canAddMore
                  ? `Limite de ${goalLimit} meta(s) ativa(s) atingido${plan === "free" ? " — faça upgrade pra mais" : ""}`
                  : undefined
              }
              className="w-full rounded-lg border border-dashed border-base-border px-3 py-2 text-sm text-ink-muted hover:text-ink hover:border-ink-faint transition disabled:opacity-40 disabled:hover:border-base-border disabled:hover:text-ink-muted"
            >
              + Adicionar meta{!canAddMore ? ` (limite de ${goalLimit} atingido)` : ""}
            </button>
          )}
        </div>
      </div>

      {selectedGoal && (
        <>
          <GoalsForm userId={userId} goal={selectedGoal} />
          <GoalsHistoryList
            history={goalsHistory.filter((h) => h.goal_id === selectedGoal.id)}
            unit={METRIC_UNIT[selectedGoal.metric]}
          />
        </>
      )}
    </div>
  );
}
