import type { GoalPrediction, TrendResult } from "@/lib/analytics";

export default function PredictionExplainer({
  prediction,
  trend,
}: {
  prediction?: GoalPrediction;
  trend?: TrendResult;
}) {
  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5 space-y-3">
      <p className="text-sm font-medium text-ink">Como funciona a previsão</p>
      <div className="space-y-2 text-sm text-ink-muted">
        <p>
          Usamos uma regressão linear sobre suas pesagens dos últimos 21 dias
          para estimar o ritmo real de mudança de peso — não o ritmo planejado
          da meta, mas o que os dados mostram que está acontecendo de fato.
        </p>
        <p>
          A partir desse ritmo, projetamos quando você deve alcançar o
          peso-alvo. Se não houver peso-alvo definido na meta, a previsão
          calcula quando a meta de perda do período atual será batida no
          ritmo atual.
        </p>
        <p>
          A previsão precisa de pelo menos 2 pesagens dentro dos últimos
          21 dias e de uma tendência de perda de peso para funcionar.
        </p>
      </div>

      {trend && trend.label !== "insufficient_data" && (
        <div className="pt-2 border-t border-base-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-ink-faint">Ritmo</p>
            <p className="font-mono text-ink">{Math.abs(trend.slopeKgPerWeek).toFixed(2)} kg/sem</p>
          </div>
          <div>
            <p className="text-ink-faint">Variação (21d)</p>
            <p className="font-mono text-ink">
              {trend.totalChangeKg > 0 ? "+" : ""}
              {trend.totalChangeKg.toFixed(1)} kg
            </p>
          </div>
          <div>
            <p className="text-ink-faint">Pesagens usadas</p>
            <p className="font-mono text-ink">{trend.dataPointsCount}</p>
          </div>
          <div>
            <p className="text-ink-faint">Consistência</p>
            <p className="font-mono text-ink">{(trend.r2 * 100).toFixed(0)}%</p>
          </div>
        </div>
      )}

      {prediction?.kind === "insufficient_data" && (
        <p className="text-sm text-signal-caution">
          Registre ao menos 2 pesagens nos últimos 21 dias para ativar a previsão.
        </p>
      )}
      {prediction?.kind === "wrong_direction" && (
        <p className="text-sm text-signal-behind">
          A tendência dos últimos 21 dias não é de perda — a previsão de
          chegada na meta não se aplica enquanto isso não mudar.
        </p>
      )}
      {prediction?.kind === "already_reached" && (
        <p className="text-sm text-signal-ahead">
          {prediction.withTarget
            ? "Parabéns — seu peso já está no valor da meta ou abaixo dele!"
            : "A meta de perda deste período já foi batida!"}
        </p>
      )}
    </div>
  );
}
