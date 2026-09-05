"use client";

import { useState } from "react";
import type { PeriodKpi } from "@/lib/analytics";
import { METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
import type { WeightEntry, Goal } from "@/types/database";
import KpiCard from "@/components/KpiCard";
import WeightChart, { type WeightGoalKpi } from "@/components/WeightChart";
import type { GoalPredictions } from "@/components/GoalTabs";

type Period = PeriodKpi["period"];

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "semester", label: "Semestre" },
];

export default function ReportsClient({
  goals,
  kpisByGoal,
  predictionsByGoal,
  entries,
  weightGoals,
  plan,
}: {
  goals: Goal[];
  kpisByGoal: Record<string, PeriodKpi[]>;
  predictionsByGoal: Record<string, GoalPredictions>;
  entries: WeightEntry[];
  weightGoals: WeightGoalKpi[];
  plan?: "free" | "pro";
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goals[0]?.id ?? null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("week");

  if (goals.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-base-surface border border-base-border rounded-card p-5">
          <p className="text-sm text-ink-faint">Nenhuma meta ativa. Configure uma em Metas.</p>
        </div>
        <WeightChart entries={entries} weightGoals={weightGoals} plan={plan} />
      </div>
    );
  }

  const goal = goals.find((g) => g.id === selectedGoalId) ?? goals[0];
  const kpis = kpisByGoal[goal.id] ?? [];
  const kpi = kpis.find((k) => k.period === selectedPeriod)!;
  const predictions = predictionsByGoal[goal.id] ?? {};
  const prediction =
    selectedPeriod === "week" ? predictions.week : selectedPeriod === "month" ? predictions.month : undefined;
  const unit = METRIC_UNIT[goal.metric];

  return (
    <div className="space-y-6">
      {/* Seletor de meta — 2ª dimensão de escolha (Fase 6.2), só aparece
          com mais de 1 meta ativa (visual idêntico a antes com só 1). */}
      {goals.length > 1 && (
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit flex-wrap">
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGoalId(g.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                g.id === goal.id ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {METRIC_LABEL[g.metric]}
              {g.label ? ` — ${g.label}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Tabs de período + botão de exportação do período/meta selecionados */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelectedPeriod(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selectedPeriod === t.value
                  ? "bg-accent text-base-bg"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Link, não fetch — mesmo padrão de ExportButtons.tsx (o navegador
            trata a resposta application/pdf como download). ?period/?goalId
            refletem a seleção atual no momento do clique. */}
        <a
          href={`/api/export/report-pdf?period=${selectedPeriod}&goalId=${goal.id}`}
          className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
        >
          Salvar em PDF
        </a>
      </div>

      {/* KPI da meta/período selecionados */}
      <KpiCard kpi={kpi} prediction={prediction} unit={unit} />

      {/* Gráfico de evolução (independente das tabs, com suas próprias pills) */}
      <WeightChart entries={entries} weightGoals={weightGoals} />
    </div>
  );
}
