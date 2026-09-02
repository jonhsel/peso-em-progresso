import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  METRIC_UNIT,
  type PeriodKpi,
} from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import ReportsClient from "./ReportsClient";
import type { WeightGoalKpi } from "@/components/WeightChart";
import type { GoalPredictions } from "@/components/GoalTabs";

export default async function ReportsPage() {
  const { profile, entries, measurements, activeGoals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  // Mesmo padrão de dashboard/page.tsx (8.1): 1 conjunto de KPIs por meta
  // ativa, calculado sobre a série temporal da métrica correspondente.
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

  const weightGoals = activeGoals.filter((g) => g.metric === "weight");
  const weightGoalKpis: WeightGoalKpi[] = weightGoals.map((goal) => ({
    goal,
    weekKpi: kpisByGoal[goal.id]?.find((k) => k.period === "week") ?? null,
  }));

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Relatórios</p>
        <ReportsClient
          goals={activeGoals}
          kpisByGoal={kpisByGoal}
          predictionsByGoal={predictionsByGoal}
          entries={entries}
          weightGoals={weightGoalKpis}
        />
      </main>
    </div>
  );
}
