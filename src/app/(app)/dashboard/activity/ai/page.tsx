import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import AiRepTracker from "@/components/activity/AiRepTracker";

export const dynamic = "force-dynamic";

export default async function AiTrackingPage() {
  const { user, profile, activeGoals, activityTypes } = await loadUserData();
  const theme = await getTheme();

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        theme={theme}
        plan={profile.plan}
        activeGoals={activeGoals}
      />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Atividade Física">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Rastreamento por IA
              </p>
              <AiRepTracker
                userId={user.id}
                activityTypes={activityTypes}
              />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
