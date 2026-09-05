import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import PlanGate from "@/components/PlanGate";
import ChallengesManager from "@/components/ChallengesManager";
import type { Challenge } from "@/types/database";

export default async function ChallengesPage() {
  const { user, profile, entries, measurements, challenges } = await loadUserData();
  const theme = await getTheme();

  const active = challenges.filter((c: Challenge) => c.status === "active");
  const history = challenges.filter((c: Challenge) => c.status !== "active");

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
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
  );
}
