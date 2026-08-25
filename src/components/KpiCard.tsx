import type { PeriodKpi } from "@/lib/analytics";

const STATUS_STYLES: Record<PeriodKpi["status"], { dot: string; text: string; ring: string }> = {
  ahead: { dot: "bg-signal-ahead", text: "text-signal-ahead", ring: "border-signal-ahead/30" },
  on_pace: { dot: "bg-signal-onpace", text: "text-signal-onpace", ring: "border-signal-onpace/30" },
  caution: { dot: "bg-signal-caution", text: "text-signal-caution", ring: "border-signal-caution/30" },
  behind: { dot: "bg-signal-behind", text: "text-signal-behind", ring: "border-signal-behind/30" },
};

export default function KpiCard({ kpi }: { kpi: PeriodKpi }) {
  const style = STATUS_STYLES[kpi.status];
  const hasData = kpi.currentWeightKg !== null && kpi.baselineWeightKg !== null;

  return (
    <div className={`bg-base-surface border ${style.ring} rounded-card p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-muted">{kpi.label}</span>
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-2xl font-bold">
              {kpi.actualLossKg !== null && kpi.actualLossKg >= 0
                ? `-${kpi.actualLossKg.toFixed(2)}`
                : `+${Math.abs(kpi.actualLossKg ?? 0).toFixed(2)}`}
            </span>
            <span className="text-sm text-ink-faint">/ -{kpi.targetLossKg.toFixed(2)} kg meta</span>
          </div>

          <div className="h-1.5 rounded-full bg-base-surface2 overflow-hidden">
            <div
              className={`h-full rounded-full ${style.dot}`}
              style={{
                width: `${Math.max(0, Math.min(100, kpi.progressToGoalPct ?? 0))}%`,
              }}
            />
          </div>

          <p className={`text-sm ${style.text}`}>{kpi.statusLabel}</p>

          {kpi.expectedWeightNowKg !== null && (
            <p className="text-xs text-ink-faint">
              Hoje você está em <span className="text-ink-muted">{kpi.currentWeightKg?.toFixed(1)} kg</span>{" "}
              · esperado pela meta: <span className="text-ink-muted">{kpi.expectedWeightNowKg.toFixed(1)} kg</span>
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-faint">Registre pesagens para ver o progresso deste período.</p>
      )}
    </div>
  );
}
