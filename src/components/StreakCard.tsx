import { computeStreak, isPastCheckinHour } from "@/lib/streak";
import type { WeightEntry } from "@/types/database";

export default function StreakCard({
  entries,
  checkinHour,
}: {
  entries: WeightEntry[];
  checkinHour: number | null;
}) {
  // Mesmo instante ("agora") usado tanto pro cálculo de streak quanto pro
  // check-in — nunca duas instâncias de "agora" com fuso diferente (ver
  // comentário sobre isso em streak.ts).
  const reference = new Date();
  const { currentStreak, bestStreak, isActiveToday, last7Days } = computeStreak(entries, reference);
  const hasHistory = entries.length > 0;

  const showStreakWarning = !isActiveToday && currentStreak > 0;
  const showCheckinWarning = checkinHour !== null && isPastCheckinHour(checkinHour, reference) && !isActiveToday;

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 flex-wrap">
          {hasHistory ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display font-bold text-2xl text-accent">{currentStreak}</span>
                <span className="text-xs text-ink-muted">
                  {currentStreak === 1 ? "dia seguido" : "dias seguidos"}
                </span>
              </div>
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

        {checkinHour !== null && (
          <span className="text-xs text-ink-muted">
            Seu horário de registro: {String(checkinHour).padStart(2, "0")}:00
          </span>
        )}

        {(showStreakWarning || showCheckinWarning) && (
          <div className="flex flex-col">
            {showStreakWarning && (
              <span className="text-xs text-[var(--badge-caution-text)]">registre hoje pra manter</span>
            )}
            {showCheckinWarning && (
              <span className="text-xs text-[var(--badge-caution-text)]">Já passou do seu horário de registro</span>
            )}
          </div>
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
