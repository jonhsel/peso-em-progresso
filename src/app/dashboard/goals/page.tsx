import { loadUserData } from "@/lib/loadUserData";
import NavBar from "@/components/NavBar";
import GoalsForm from "@/components/GoalsForm";

export default async function GoalsPage() {
  const { user, profile, goals } = await loadUserData();

  return (
    <div>
      <NavBar displayName={profile.display_name} />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <GoalsForm userId={user.id} goals={goals} />
      </main>
    </div>
  );
}
