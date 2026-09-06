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
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import KpiCard from "@/components/KpiCard";
import PredictionChart from "@/components/PredictionChart";
import PredictionExplainer from "@/components/PredictionExplainer";
import type { GoalPredictions } from "@/components/GoalTabs";

export const dynamic = "force-dynamic";

export default async function PredictionPage() {
  const { profile, entries, measurements, activeGoals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  const weightGoals = activeGoals.filter((g) => g.metric === "weight");

  const kpisByGoal: Record<string, PeriodKpi[]> = Object.fromEntries(
    weightGoals.map((goal) => {
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
  for (const goal of weightGoals) {
    const kpis = kpisByGoal[goal.id] ?? [];
    const weekKpi = kpis.find((k) => k.period === "week");
    const monthKpi = kpis.find((k) => k.period === "month");
    predictionsByGoal[goal.id] = {
      week: weekKpi ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
      month: monthKpi ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
    };
  }

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-6xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Previsão da Meta">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Previsão da Meta</p>
              {weightGoals.length === 0 ? (
                <div className="bg-base-surface border border-base-border rounded-card p-5">
                  <p className="text-sm text-ink-faint">
                    Nenhuma meta de peso ativa. A previsão funciona sobre metas de peso —
                    crie uma em <a href="/dashboard/goals" className="text-accent hover:text-accent-hover underline">Metas</a>.
                  </p>
                </div>
              ) : (
                weightGoals.map((goal) => {
                  const kpis = kpisByGoal[goal.id] ?? [];
                  const weekKpi = kpis.find((k) => k.period === "week") ?? null;
                  const monthKpi = kpis.find((k) => k.period === "month") ?? null;
                  const predictions = predictionsByGoal[goal.id] ?? {};
                  // Usar a previsão do mês pro gráfico (período mais longo
                  // = projeção mais intuitiva); fallback pra semana.
                  const chartPrediction = predictions.month ?? predictions.week;
                  return (
                    <section key={goal.id} className="space-y-4">
                      {weightGoals.length > 1 && (
                        <h2 className="font-display font-bold text-lg">
                          {goal.label ?? "Meta de peso"}
                        </h2>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {weekKpi && <KpiCard kpi={weekKpi} prediction={predictions.week} />}
                        {monthKpi && <KpiCard kpi={monthKpi} prediction={predictions.month} />}
                      </div>
                      <PredictionChart
                        entries={entries}
                        goal={goal}
                        prediction={chartPrediction}
                      />
                      <PredictionExplainer prediction={chartPrediction} />
                    </section>
                  );
                })
              )}
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
