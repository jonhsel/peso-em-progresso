"use client";

import { useState } from "react";
import type { PeriodKpi, GoalPrediction } from "@/lib/analytics";
import type { WeightEntry } from "@/types/database";
import KpiCard from "@/components/KpiCard";
import WeightChart from "@/components/WeightChart";

type Period = PeriodKpi["period"];

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "semester", label: "Semestre" },
];

export default function ReportsClient({
  kpis,
  weekPrediction,
  monthPrediction,
  entries,
  targetWeightKg,
  weekKpi,
}: {
  kpis: PeriodKpi[];
  weekPrediction?: GoalPrediction;
  monthPrediction?: GoalPrediction;
  entries: WeightEntry[];
  targetWeightKg: number | null;
  weekKpi: PeriodKpi | null;
}) {
  const [selected, setSelected] = useState<Period>("week");
  const kpi = kpis.find((k) => k.period === selected)!;
  const prediction =
    selected === "week"
      ? weekPrediction
      : selected === "month"
      ? monthPrediction
      : undefined;

  return (
    <div className="space-y-6">
      {/* Tabs de período + botão de exportação do período selecionado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setSelected(t.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                selected === t.value
                  ? "bg-accent text-base-bg"
                  : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Link, não fetch — mesmo padrão de ExportButtons.tsx (o navegador
            trata a resposta application/pdf como download). ?period reflete
            a tab selecionada no momento do clique. */}
        <a
          href={`/api/export/report-pdf?period=${selected}`}
          className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
        >
          Salvar em PDF
        </a>
      </div>

      {/* KPI do período selecionado */}
      <KpiCard kpi={kpi} prediction={prediction} />

      {/* Gráfico de evolução (independente da tab, com suas próprias pills) */}
      <WeightChart
        entries={entries}
        targetWeightKg={targetWeightKg}
        weekKpi={weekKpi}
      />
    </div>
  );
}
