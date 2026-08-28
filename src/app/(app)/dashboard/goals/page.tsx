import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import GoalsForm from "@/components/GoalsForm";

export default async function GoalsPage() {
  const { user, profile, goals } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <GoalsForm userId={user.id} goals={goals} />
      </main>
    </div>
  );
}
