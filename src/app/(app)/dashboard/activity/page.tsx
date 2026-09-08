import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { computeActivityWeeklyKpis } from "@/lib/activity";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import ActivityTypeManager from "@/components/activity/ActivityTypeManager";
import ActivitySessionForm from "@/components/activity/ActivitySessionForm";
import ActivityWeekCard from "@/components/activity/ActivityWeekCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const {
    user,
    profile,
    activeGoals,
    activityTypes,
    activitySessions,
    activityGoals,
  } = await loadUserData();
  const theme = await getTheme();

  const kpis = computeActivityWeeklyKpis(
    activityTypes,
    activitySessions,
    activityGoals,
    profile.week_starts_on
  );

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
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  Atividade Física
                </p>
                <Link
                  href="/dashboard/activity/ai"
                  className="text-xs font-medium text-accent hover:text-accent-hover transition"
                >
                  Rastrear com IA →
                </Link>
              </div>

              <ActivitySessionForm
                userId={user.id}
                types={activityTypes}
              />

              {kpis.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-wide text-ink-muted">
                    Esta semana
                  </p>
                  {kpis.map((kpi) => (
                    <ActivityWeekCard
                      key={kpi.activityTypeId}
                      kpi={kpi}
                      goal={
                        activityGoals.find(
                          (g) =>
                            g.activity_type_id === kpi.activityTypeId &&
                            g.is_active
                        ) ?? null
                      }
                      userId={user.id}
                      activityTypeId={kpi.activityTypeId}
                    />
                  ))}
                </div>
              )}

              <ActivityTypeManager
                userId={user.id}
                types={activityTypes}
              />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
