"use client";

import { useState } from "react";
import ActivityGoalForm from "./ActivityGoalForm";
import type { ActivityGoal } from "@/types/database";
import type { ActivityWeeklyKpi } from "@/lib/activity";

export default function ActivityWeekCard({
  kpi,
  goal,
  userId,
  activityTypeId,
}: {
  kpi: ActivityWeeklyKpi;
  goal: ActivityGoal | null;
  userId: string;
  activityTypeId: string;
}) {
  const [editingGoal, setEditingGoal] = useState(false);

  const hasTarget = kpi.targetMinutes !== null;

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-sm">{kpi.activityTypeName}</p>
        <button
          type="button"
          onClick={() => setEditingGoal((v) => !v)}
          className="text-xs text-ink-faint transition hover:text-accent"
        >
          {hasTarget ? "Editar meta" : "Definir meta semanal"}
        </button>
      </div>

      {hasTarget && kpi.progressPct !== null ? (
        <div>
          <div className="h-2 rounded-full bg-base-surface2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${kpi.progressPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {kpi.actualMinutes.toFixed(0)} de {kpi.targetMinutes?.toFixed(0)} min esta semana
          </p>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          {kpi.actualMinutes.toFixed(0)} min esta semana
        </p>
      )}

      <p className="text-xs text-ink-faint">
        {kpi.sessionsCount} {kpi.sessionsCount === 1 ? "sessão" : "sessões"}
        {kpi.trackDistance && kpi.totalDistanceKm !== null && kpi.totalDistanceKm > 0
          ? ` · ${kpi.totalDistanceKm.toFixed(1).replace(".", ",")} km esta semana`
          : ""}
      </p>

      {editingGoal && (
        <div className="pt-2 border-t border-base-border">
          <ActivityGoalForm
            userId={userId}
            activityTypeId={activityTypeId}
            currentGoal={goal}
            onSaved={() => setEditingGoal(false)}
          />
        </div>
      )}
    </div>
  );
}
