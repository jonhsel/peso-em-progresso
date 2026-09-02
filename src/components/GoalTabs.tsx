"use client";

import { useState } from "react";
import Link from "next/link";
import KpiCard from "@/components/KpiCard";
import { METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
import type { PeriodKpi, GoalPrediction } from "@/lib/analytics";
import type { Goal } from "@/types/database";

export type GoalPredictions = { week?: GoalPrediction; month?: GoalPrediction };

/**
 * Substitui o grid fixo de 4 KpiCard do dashboard/relatórios por uma versão
 * com abas — 1 aba por meta ativa (Fase 6.2). Com só 1 meta ativa (caso
 * comum hoje, quem nunca criou uma 2ª meta), as abas ficam escondidas e o
 * visual é idêntico ao grid fixo de antes.
 */
export default function GoalTabs({
  goals,
  kpisByGoal,
  predictionsByGoal,
}: {
  goals: Goal[];
  kpisByGoal: Record<string, PeriodKpi[]>;
  predictionsByGoal: Record<string, GoalPredictions>;
}) {
  const [activeId, setActiveId] = useState<string | null>(goals[0]?.id ?? null);

  if (goals.length === 0) {
    return (
      <div id="kpi-details" className="bg-base-surface border border-base-border rounded-card p-5">
        <p className="text-sm text-ink-faint">
          Nenhuma meta ativa.{" "}
          <Link href="/dashboard/goals" className="text-accent hover:text-accent-hover underline">
            Configure uma em Metas
          </Link>
          .
        </p>
      </div>
    );
  }

  const active = goals.find((g) => g.id === activeId) ?? goals[0];
  const kpis = kpisByGoal[active.id] ?? [];
  const predictions = predictionsByGoal[active.id] ?? {};
  const unit = METRIC_UNIT[active.metric];

  return (
    <div id="kpi-details">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Metas por período</p>
        {goals.length > 1 && (
          <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveId(g.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  g.id === active.id ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                {METRIC_LABEL[g.metric]}
                {g.label ? ` — ${g.label}` : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.period}
            kpi={kpi}
            unit={unit}
            prediction={
              kpi.period === "week" ? predictions.week : kpi.period === "month" ? predictions.month : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
