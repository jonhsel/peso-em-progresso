import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const { profile, entries, goals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  const kpis = computeAllKpis(
    entries,
    goalsHistory,
    new Date(),
    profile.period_mode,
    profile.week_starts_on
  );
  const trend = computeTrend(entries);
  const weekKpi = kpis.find((k) => k.period === "week") ?? null;
  const monthKpi = kpis.find((k) => k.period === "month") ?? null;
  const weekPrediction = weekKpi ? computeGoalPrediction(trend, weekKpi, goals.target_weight_kg) : undefined;
  const monthPrediction = monthKpi ? computeGoalPrediction(trend, monthKpi, goals.target_weight_kg) : undefined;

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Relatórios</p>
        <ReportsClient
          kpis={kpis}
          weekPrediction={weekPrediction}
          monthPrediction={monthPrediction}
          entries={entries}
          targetWeightKg={goals.target_weight_kg}
          weekKpi={weekKpi}
        />
      </main>
    </div>
  );
}
