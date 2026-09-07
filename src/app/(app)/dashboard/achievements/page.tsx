import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { getPrimaryWeightGoal } from "@/lib/analytics";
import { evaluateAchievements } from "@/lib/achievements";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import AchievementsGrid from "@/components/AchievementsGrid";
import AchievementsProgress from "@/components/AchievementsProgress";
import AchievementsTimeline from "@/components/AchievementsTimeline";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const { profile, entries, activeGoals, achievements } = await loadUserData();
  const theme = await getTheme();

  const primaryWeightGoal = getPrimaryWeightGoal(activeGoals);
  const { all, metrics } = evaluateAchievements(entries, primaryWeightGoal, achievements);
  const unlockedCount = all.filter((a) => a.status === "unlocked").length;

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Conquistas">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Conquistas</p>
                <span className="text-xs text-ink-faint font-mono">
                  {unlockedCount}/{all.length}
                </span>
              </div>

              <AchievementsGrid all={all} />

              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Próxima conquista</p>
                <AchievementsProgress all={all} metrics={metrics} />
              </div>

              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Linha do tempo</p>
                <AchievementsTimeline all={all} />
              </div>
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
