import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import GoalsManager from "@/components/GoalsManager";

export default async function GoalsPage() {
  const { user, profile, activeGoals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-6xl mx-auto px-4 py-8">
        <GoalsManager
          userId={user.id}
          activeGoals={activeGoals}
          goalsHistory={goalsHistory}
          plan={profile.plan}
        />
        </main>
      </div>
    </div>
  );
}
