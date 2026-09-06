import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import ChallengesManager from "@/components/ChallengesManager";
import type { Challenge } from "@/types/database";

export default async function ChallengesPage() {
  const { user, profile, entries, measurements, challenges, activeGoals } = await loadUserData();
  const theme = await getTheme();

  const active = challenges.filter((c: Challenge) => c.status === "active");
  const history = challenges.filter((c: Challenge) => c.status !== "active");

  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
        <PlanGate plan={profile.plan} featureName="Desafios">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Desafios</p>
            <ChallengesManager
              userId={user.id}
              active={active}
              history={history}
              entries={entries}
              measurements={measurements}
            />
          </div>
        </PlanGate>
        </main>
      </div>
    </div>
  );
}
