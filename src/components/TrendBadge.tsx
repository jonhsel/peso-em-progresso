import type { TrendResult } from "@/lib/analytics";

const STYLES: Record<TrendResult["label"], { icon: string; color: string; text: string }> = {
  perdendo_rapido: { icon: "↓↓", color: "text-signal-ahead", text: "Perdendo rápido" },
  perdendo: { icon: "↓", color: "text-signal-onpace", text: "Perdendo peso" },
  estavel: { icon: "→", color: "text-ink-muted", text: "Estável" },
  ganhando: { icon: "↑", color: "text-signal-behind", text: "Ganhando peso" },
  insufficient_data: { icon: "—", color: "text-ink-faint", text: "Sem dados recentes" },
};

export default function TrendBadge({ trend }: { trend: TrendResult }) {
  const s = STYLES[trend.label];
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Tendência (21 dias)</span>
        <span className={`font-mono text-lg ${s.color}`}>{s.icon}</span>
      </div>
      <p className={`font-display font-bold text-xl ${s.color}`}>{s.text}</p>
      <p className="text-sm text-ink-faint mt-1">{trend.description}</p>
    </div>
  );
}
