"use client";

import type { PeriodKpi } from "@/lib/analytics";

// Mesmo mapeamento status → cor usado em KpiCard.tsx (dot/ring signal-*,
// texto via --badge-*-text para contraste em tema claro). Mantenha os dois
// sincronizados se a paleta signal-* mudar — mesmo padrão de sincronização
// manual já usado em ExportDocument.tsx/TrajectoryGraphic.tsx.
const STATUS_DOT: Record<PeriodKpi["status"], string> = {
  ahead: "bg-signal-ahead",
  on_pace: "bg-signal-onpace",
  caution: "bg-signal-caution",
  behind: "bg-signal-behind",
};

const STATUS_LABEL: Record<PeriodKpi["status"], string> = {
  ahead: "Adiantado",
  on_pace: "No ritmo",
  caution: "Atenção",
  behind: "Atrasado",
};

const STATUS_VERB: Record<PeriodKpi["status"], string> = {
  ahead: "você está à frente da meta semanal",
  on_pace: "você está no ritmo da meta semanal",
  caution: "começando a ficar atrás da meta semanal",
  behind: "atrás da meta semanal",
};

export default function KpiWeeklyTeaser({ kpi }: { kpi: PeriodKpi }) {
  // Mesmo critério de "sem dado suficiente" usado em KpiCard — evita que um
  // status `caution` por falta de baseline (não por estar atrás da meta)
  // apareça como "começando a ficar atrás da meta semanal".
  const hasData = kpi.currentWeightKg !== null && kpi.baselineWeightKg !== null;

  const handleClick = () => {
    document
      .getElementById("kpi-details")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-between gap-3 rounded-card border border-base-border bg-base-surface px-4 py-3 text-left transition hover:border-ink-faint"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[kpi.status]}`}
          aria-hidden="true"
        />
        <p className="text-sm text-ink truncate">
          {hasData ? (
            <>
              <span className="font-medium">{STATUS_LABEL[kpi.status]}</span>
              <span className="text-ink-muted"> — {STATUS_VERB[kpi.status]}</span>
            </>
          ) : (
            <span className="text-ink-muted">Registre pesagens para ver seu progresso da semana</span>
          )}
        </p>
      </div>
      <span className="font-mono text-xs text-ink-faint shrink-0">ver metas ↓</span>
    </button>
  );
}
