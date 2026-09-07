import Link from "next/link";
import {
  getNextMilestone,
  type EvaluatedAchievement,
  type AchievementMetrics,
} from "@/lib/achievements";

export default function AchievementsProgress({
  all,
  metrics,
}: {
  all: EvaluatedAchievement[];
  metrics: AchievementMetrics;
}) {
  const nextAbsolute = getNextMilestone(all, "absolute");
  const nextPercentage = getNextMilestone(all, "percentage");

  return (
    <div className="space-y-4">
      {nextAbsolute ? (
        <ProgressRow
          label={`Próxima: ${nextAbsolute.rule.label}`}
          current={metrics.totalLostKg}
          target={nextAbsolute.rule.threshold}
          unit="kg"
        />
      ) : (
        <p className="text-sm text-ink-muted">
          🎉 Todas as conquistas de perda de peso desbloqueadas.
        </p>
      )}

      {nextPercentage?.status === "blocked" ? (
        <p className="text-sm text-ink-faint">
          {nextPercentage.blockedReason}
          {nextPercentage.blockedReason?.includes("Defina") && (
            <>
              {" — "}
              <Link href="/dashboard/goals" className="text-accent hover:text-accent-hover underline">
                ir para Metas
              </Link>
            </>
          )}
        </p>
      ) : nextPercentage ? (
        <ProgressRow
          label={`Próxima: ${nextPercentage.rule.label}`}
          current={metrics.progressPct ?? 0}
          target={nextPercentage.rule.threshold}
          unit="%"
        />
      ) : (
        <p className="text-sm text-ink-muted">
          🎉 Meta atingida — todas as conquistas de percentual desbloqueadas.
        </p>
      )}
    </div>
  );
}

function ProgressRow({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-mono">
          {current.toFixed(1)}/{target} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-base-surface2 overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
