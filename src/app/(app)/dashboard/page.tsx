import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  getPrimaryWeightGoal,
  METRIC_UNIT,
  type PeriodKpi,
} from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import GoalTabs, { type GoalPredictions } from "@/components/GoalTabs";
import KpiWeeklyTeaser from "@/components/KpiWeeklyTeaser";
import StreakCard from "@/components/StreakCard";
import AchievementsCard from "@/components/AchievementsCard";
import TrendBadge from "@/components/TrendBadge";
import WeightChart, { type WeightGoalKpi } from "@/components/WeightChart";
import BodyMeasurementsSummaryCard from "@/components/BodyMeasurementsSummaryCard";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default async function DashboardPage() {
  const { user, profile, entries, measurements, activeGoals, goalsHistory, achievements } = await loadUserData();
  const theme = await getTheme();

  // KPIs por meta ativa (Fase 6.2): cada meta é avaliada de forma
  // independente, contra a série temporal da sua própria métrica.
  const kpisByGoal: Record<string, PeriodKpi[]> = Object.fromEntries(
    activeGoals.map((goal) => {
      const points = extractMetricPoints(goal.metric, entries, measurements);
      const history = goalsHistory.filter((h) => h.goal_id === goal.id);
      return [
        goal.id,
        computeAllKpis(points, history, new Date(), profile.period_mode, profile.week_starts_on, METRIC_UNIT[goal.metric]),
      ];
    })
  );

  // Previsão (Fase 5.1) continua exclusiva de peso — computeTrend só opera
  // sobre weight_entries (fora de escopo generalizar pra outras métricas
  // nesta sub-fase). Uma previsão por meta de peso ativa.
  const trend = computeTrend(entries);
  const predictionsByGoal: Record<string, GoalPredictions> = {};
  for (const goal of activeGoals) {
    if (goal.metric !== "weight") continue;
    const kpis = kpisByGoal[goal.id] ?? [];
    const weekKpi = kpis.find((k) => k.period === "week");
    const monthKpi = kpis.find((k) => k.period === "month");
    predictionsByGoal[goal.id] = {
      week: weekKpi ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
      month: monthKpi ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
    };
  }

  // Meta de peso "primária" (mais antiga ativa) — alimenta o teaser da
  // semana, o gráfico (índice 0, cores/visual idênticos a antes) e as
  // conquistas, que continuam peso-only.
  const primaryWeightGoal = getPrimaryWeightGoal(activeGoals);
  const primaryWeekKpi = primaryWeightGoal
    ? kpisByGoal[primaryWeightGoal.id]?.find((k) => k.period === "week") ?? null
    : null;

  // Todas as metas de peso ativas (não só a primária) alimentam o gráfico —
  // 1 linha "esperado" por meta (Fase 6.2).
  const weightGoals = activeGoals.filter((g) => g.metric === "weight");
  const weightGoalKpis: WeightGoalKpi[] = weightGoals.map((goal) => ({
    goal,
    weekKpi: kpisByGoal[goal.id]?.find((k) => k.period === "week") ?? null,
  }));

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
          primaryWeightGoal={primaryWeightGoal}
          achievements={achievements}
          userId={user.id}
        />

        {primaryWeekKpi && <KpiWeeklyTeaser kpi={primaryWeekKpi} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <WeightChart entries={entries} weightGoals={weightGoalKpis} />
          </div>
          <TrendBadge trend={trend} />
        </div>

        <GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={predictionsByGoal} />

        <BodyMeasurementsSummaryCard measurements={measurements} />
      </main>
    </div>
  );
}
