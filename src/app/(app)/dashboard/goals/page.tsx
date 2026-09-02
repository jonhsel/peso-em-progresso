import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import GoalsManager from "@/components/GoalsManager";

export default async function GoalsPage() {
  const { user, profile, activeGoals, goalsHistory } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <GoalsManager userId={user.id} activeGoals={activeGoals} goalsHistory={goalsHistory} />
      </main>
    </div>
  );
}
