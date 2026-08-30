import { computeStreak } from "@/lib/streak";
import type { WeightEntry } from "@/types/database";

export default function StreakCard({ entries }: { entries: WeightEntry[] }) {
  const { currentStreak, bestStreak, isActiveToday, last7Days } = computeStreak(entries);
  const hasHistory = entries.length > 0;

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        {hasHistory ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-2xl text-accent">{currentStreak}</span>
              <span className="text-xs text-ink-muted">
                {currentStreak === 1 ? "dia seguido" : "dias seguidos"}
              </span>
            </div>
            {!isActiveToday && currentStreak > 0 && (
              <span className="text-xs text-[var(--badge-caution-text)]">registre hoje pra manter</span>
            )}
            {bestStreak > 0 && (
              <span className="text-xs text-ink-faint font-mono">
                melhor: {bestStreak} {bestStreak === 1 ? "dia" : "dias"}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-ink-muted">Registre hoje pra começar sua sequência</span>
        )}
      </div>
      <div className="flex items-center gap-1.5" aria-label="Últimos 7 dias">
        {last7Days.map((d) => (
          <span
            key={d.date}
            title={d.date}
            className={`h-2.5 w-2.5 rounded-full ${
              d.hasEntry ? "bg-accent" : "border border-base-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
