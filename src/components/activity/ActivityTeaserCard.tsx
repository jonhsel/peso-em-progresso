import Link from "next/link";
import type { ActivityWeeklyKpi } from "@/lib/activity";

export default function ActivityTeaserCard({ kpis }: { kpis: ActivityWeeklyKpi[] }) {
  const hasAnyData =
    kpis.length > 0 &&
    (kpis.some((k) => k.sessionsCount > 0) || kpis.some((k) => k.targetMinutes !== null));

  if (!hasAnyData) return null;

  // Prioriza tipos com meta ativa, depois os com mais sessões na semana.
  const top = [...kpis]
    .sort((a, b) => {
      const aHasGoal = a.targetMinutes !== null ? 1 : 0;
      const bHasGoal = b.targetMinutes !== null ? 1 : 0;
      if (aHasGoal !== bHasGoal) return bHasGoal - aHasGoal;
      return b.sessionsCount - a.sessionsCount;
    })
    .slice(0, 3);

  return (
    <Link
      href="/dashboard/activity"
      className="block rounded-card border border-base-border bg-base-surface p-5 transition hover:border-ink-faint"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Atividade física</p>
        <span className="text-xs text-ink-faint">Ver completo →</span>
      </div>
      <div className="space-y-3">
        {top.map((k) => (
          <div key={k.activityTypeId}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-ink">{k.activityTypeName}</p>
              <p className="text-xs text-ink-faint">
                {k.targetMinutes !== null
                  ? `${k.actualMinutes.toFixed(0)}/${k.targetMinutes.toFixed(0)} min`
                  : `${k.actualMinutes.toFixed(0)} min`}
                {k.totalReps !== null && k.totalReps > 0 ? ` · ${k.totalReps} reps` : ""}
              </p>
            </div>
            {k.targetMinutes !== null && k.progressPct !== null && (
              <div className="h-1.5 rounded-full bg-base-surface2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${k.progressPct}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
