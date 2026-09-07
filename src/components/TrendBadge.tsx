import type { TrendResult } from "@/lib/analytics";

const STYLES: Record<TrendResult["label"], { icon: string; color: string; text: string }> = {
  perdendo_rapido: { icon: "↓↓", color: "text-signal-ahead", text: "Perdendo rápido" },
  perdendo: { icon: "↓", color: "text-signal-onpace", text: "Perdendo peso" },
  estavel: { icon: "→", color: "text-ink-muted", text: "Estável" },
  ganhando: { icon: "↑", color: "text-signal-behind", text: "Ganhando peso" },
  insufficient_data: { icon: "—", color: "text-ink-faint", text: "Sem dados recentes" },
};

function consistencyLabel(r2: number): { text: string; color: string } {
  if (r2 >= 0.6) return { text: "Alta consistência", color: "text-signal-ahead" };
  if (r2 >= 0.3) return { text: "Consistência moderada", color: "text-[var(--badge-caution-text)]" };
  return { text: "Baixa consistência — peso oscilando bastante", color: "text-signal-behind" };
}

export default function TrendBadge({ trend }: { trend: TrendResult }) {
  const s = STYLES[trend.label];
  const hasMetrics = trend.label !== "insufficient_data";
  const consistency = hasMetrics ? consistencyLabel(trend.r2) : null;

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Tendência (21 dias)</span>
        <span className={`font-mono text-lg ${s.color}`}>{s.icon}</span>
      </div>
      <p className={`font-display font-bold text-xl ${s.color}`}>{s.text}</p>
      <p className="text-sm text-ink-faint mt-1">{trend.description}</p>

      {hasMetrics && (
        <div className="mt-3 pt-3 border-t border-base-border space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Ritmo</span>
            <span className="font-mono text-ink">
              {Math.abs(trend.slopeKgPerWeek).toFixed(2)} kg/sem
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Variação no período</span>
            <span className="font-mono text-ink">
              {trend.totalChangeKg > 0 ? "+" : ""}
              {trend.totalChangeKg.toFixed(1)} kg
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Baseado em</span>
            <span className="font-mono text-ink">
              {trend.dataPointsCount} {trend.dataPointsCount === 1 ? "pesagem" : "pesagens"}
            </span>
          </div>
          {consistency && (
            <p className={`text-xs ${consistency.color} pt-1`}>{consistency.text}</p>
          )}
        </div>
      )}
    </div>
  );
}
