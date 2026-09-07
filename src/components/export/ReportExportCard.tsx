"use client";

import { useState } from "react";
import { METRIC_LABEL } from "@/lib/analytics";
import type { Goal } from "@/types/database";

type Period = "week" | "month" | "quarter" | "semester";

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "semester", label: "Semestre" },
];

export default function ReportExportCard({ goals }: { goals: Goal[] }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(goals[0]?.id ?? null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("week");

  if (goals.length === 0) {
    return (
      <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
        <p className="font-display font-bold text-sm">Relatório por período (PDF)</p>
        <p className="text-xs text-ink-muted mt-1">
          Nenhuma meta ativa — configure uma em Metas para gerar este PDF.
        </p>
      </div>
    );
  }

  const goal = goals.find((g) => g.id === selectedGoalId) ?? goals[0];

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 space-y-3">
      <div>
        <p className="font-display font-bold text-sm">Relatório por período (PDF)</p>
        <p className="text-xs text-ink-muted mt-1">
          KPI e gráfico de uma meta específica, no período escolhido — o
          mesmo PDF disponível na tela de Relatórios.
        </p>
      </div>

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
        <a
          href={`/api/export/report-pdf?period=${selectedPeriod}&goalId=${goal.id}`}
          className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
        >
          Baixar PDF
        </a>
      </div>
    </div>
  );
}
