import { loadUserData } from "@/lib/loadUserData";
import NavBar from "@/components/NavBar";
import WeightEntryForm from "@/components/WeightEntryForm";
import EntriesList from "@/components/EntriesList";

export default async function EntriesPage() {
  const { user, profile, entries } = await loadUserData();

  return (
    <div>
      <NavBar displayName={profile.display_name} />
      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:sticky md:top-8 self-start">
          <WeightEntryForm userId={user.id} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Histórico</p>
          <EntriesList entries={entries} />
        </div>
      </main>
    </div>
  );
}
