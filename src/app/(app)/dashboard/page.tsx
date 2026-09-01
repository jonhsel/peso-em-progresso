import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import KpiCard from "@/components/KpiCard";
import KpiWeeklyTeaser from "@/components/KpiWeeklyTeaser";
import StreakCard from "@/components/StreakCard";
import AchievementsCard from "@/components/AchievementsCard";
import TrendBadge from "@/components/TrendBadge";
import WeightChart from "@/components/WeightChart";
import BodyMeasurementsSummaryCard from "@/components/BodyMeasurementsSummaryCard";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default async function DashboardPage() {
  const { user, profile, entries, measurements, goals, goalsHistory, achievements } = await loadUserData();
  const theme = await getTheme();

  const kpis = computeAllKpis(entries, goalsHistory, new Date(), profile.period_mode, profile.week_starts_on);
  const weekKpi = kpis.find((kpi) => kpi.period === "week");
  const monthKpi = kpis.find((kpi) => kpi.period === "month");
  const trend = computeTrend(entries);
  const weekPrediction = weekKpi ? computeGoalPrediction(trend, weekKpi, goals.target_weight_kg) : undefined;
  const monthPrediction = monthKpi ? computeGoalPrediction(trend, monthKpi, goals.target_weight_kg) : undefined;
  const latest = entries[entries.length - 1] ?? null;
  const first = entries[0] ?? null;
  const totalChange = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : null;

  const lastMeasuredLabel = latest
    ? `${format(parseISO(latest.measured_at), "dd/MM/yyyy", { locale: ptBR })} às ${new Intl.DateTimeFormat(
        "pt-BR",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
      ).format(new Date(latest.created_at))}`
    : null;

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Visão geral</p>
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight">
              {latest ? (
                <>
                  <span className="text-ink" style={{ textShadow: "0 0 40px var(--accent-glow)" }}>
                    {Number(latest.weight_kg).toFixed(1)}
                  </span>
                  <span className="text-2xl sm:text-3xl text-ink-muted font-medium ml-1">kg</span>
                </>
              ) : (
                <span className="text-ink-muted">Sem registros</span>
              )}
            </h1>
            {lastMeasuredLabel && (
              <p className="mt-1.5 text-xs text-ink-faint">Última pesagem: {lastMeasuredLabel}</p>
            )}
            {totalChange !== null && (
              <div className="mt-3 inline-flex items-center gap-2 bg-base-surface border border-base-border rounded-full px-3 py-1.5">
                <span className={`text-sm font-mono font-bold ${totalChange <= 0 ? "text-signal-ahead" : "text-signal-behind"}`}>
                  {totalChange <= 0 ? "↓" : "↑"} {Math.abs(totalChange).toFixed(1)} kg
                </span>
                <span className="text-xs text-ink-faint">desde o primeiro registro</span>
              </div>
            )}
          </div>
          <Link
            href="/dashboard/entries"
            className="text-sm rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 hover:bg-accent-hover transition"
          >
            Registrar pesagem
          </Link>
        </div>

        <StreakCard entries={entries} checkinHour={profile.checkin_hour} />
        <AchievementsCard
          entries={entries}
          goals={goals}
          achievements={achievements}
          userId={user.id}
        />

        {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <WeightChart
              entries={entries}
              targetWeightKg={goals.target_weight_kg}
              weekKpi={weekKpi ?? null}
            />
          </div>
          <TrendBadge trend={trend} />
        </div>

        <div id="kpi-details">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Metas por período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.period}
                kpi={kpi}
                prediction={
                  kpi.period === "week" ? weekPrediction : kpi.period === "month" ? monthPrediction : undefined
                }
              />
            ))}
          </div>
        </div>

        <BodyMeasurementsSummaryCard measurements={measurements} />
      </main>
    </div>
  );
}
