import Link from "next/link";
import type { GoalPrediction, PeriodKpi } from "@/lib/analytics";

// O dot/ring seguem os tokens signal-* (hex fixo, iguais nos dois temas).
// O texto do status usa os pares --badge-*-text (globals.css) via valor
// arbitrário do Tailwind — em vez de signal-* puro — porque texto solto
// sobre bg-base-surface claro quebra contraste (especialmente caution,
// ~2:1). Em dark os valores são idênticos ao hex antigo, então isso não
// muda nada visualmente ali.
const STATUS_STYLES: Record<PeriodKpi["status"], { dot: string; text: string; ring: string }> = {
  ahead: { dot: "bg-signal-ahead", text: "text-[var(--badge-ahead-text)]", ring: "border-t-signal-ahead" },
  on_pace: { dot: "bg-signal-onpace", text: "text-[var(--badge-onpace-text)]", ring: "border-t-signal-onpace" },
  caution: { dot: "bg-signal-caution", text: "text-[var(--badge-caution-text)]", ring: "border-t-signal-caution" },
  behind: { dot: "bg-signal-behind", text: "text-[var(--badge-behind-text)]", ring: "border-t-signal-behind" },
};

export default function KpiCard({
  kpi,
  prediction,
  unit = "kg",
  predictionLocked = false,
}: {
  kpi: PeriodKpi;
  prediction?: GoalPrediction;
  unit?: string;
  predictionLocked?: boolean;
}) {
  const style = STATUS_STYLES[kpi.status];
  const hasData = kpi.currentWeightKg !== null && kpi.baselineWeightKg !== null;

  return (
    <div className={`bg-base-surface border border-base-border border-t-[3px] ${style.ring} rounded-card p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-muted">{kpi.label}</span>
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      </div>

      {hasData ? (
        <>
          <div className="flex items-baseline gap-1.5 font-mono">
            <span className="text-3xl font-black tracking-tight">
              {kpi.actualLossKg !== null && kpi.actualLossKg >= 0
                ? `-${kpi.actualLossKg.toFixed(2)}`
                : `+${Math.abs(kpi.actualLossKg ?? 0).toFixed(2)}`}
            </span>
            <span className="text-sm text-ink-faint">/ -{kpi.targetLossKg.toFixed(2)} {unit} meta</span>
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
              Hoje você está em <span className="text-ink-muted">{kpi.currentWeightKg?.toFixed(1)} {unit}</span>{" "}
              · esperado pela meta: <span className="text-ink-muted">{kpi.expectedWeightNowKg.toFixed(1)} {unit}</span>
            </p>
          )}

          {predictionLocked && !prediction && (
            <p className="text-xs text-ink-faint">
              <Link href="/dashboard/upgrade" className="inline-flex items-center gap-1 text-accent hover:text-accent-hover transition">
                🔒 Previsão da meta é Pro
              </Link>
            </p>
          )}

          {prediction && (
            <p className="text-xs text-ink-faint">
              {prediction.kind === "projected" && (
                <>
                  📈 No ritmo atual, meta em ~{prediction.daysFromNow} dias{" "}
                  <span className="text-ink-muted">
                    (previsão: {prediction.estimatedDate.split("-").reverse().join("/")})
                  </span>
                </>
              )}
              {prediction.kind === "insufficient_data" && (
                <>Sem dados suficientes para projetar (mínimo 2 registros nos últimos 21 dias).</>
              )}
              {prediction.kind === "wrong_direction" && (
                <>No ritmo atual, a meta não será alcançada — tendência dos últimos 21 dias não é de perda.</>
              )}
              {prediction.kind === "already_reached" && prediction.withTarget && (
                <>Meta já alcançada! 🎉</>
              )}
              {prediction.kind === "already_reached" && !prediction.withTarget && (
                <>Meta deste período já batida. ✅</>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-faint">Registre pesagens para ver o progresso deste período.</p>
      )}
    </div>
  );
}
