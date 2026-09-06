import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import WeightEntryForm from "@/components/WeightEntryForm";
import EntriesList from "@/components/EntriesList";
import ExportButtons from "@/components/entries/ExportButtons";
import Link from "next/link";

export default async function EntriesPage() {
  const { user, profile, entries, activeGoals } = await loadUserData();
  const theme = await getTheme();

  return (
    <div className="flex min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:sticky md:top-8 self-start">
          <WeightEntryForm userId={user.id} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
            <div className="flex items-center gap-2">
              <a
                href="/dashboard/import"
                className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
              >
                Importar CSV
              </a>
              {entries.length > 0 &&
                (profile.plan === "pro" ? (
                  <ExportButtons />
                ) : (
                  <Link
                    href="/dashboard/upgrade"
                    className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                  >
                    Exportar (Pro)
                  </Link>
                ))}
            </div>
          </div>
          <EntriesList entries={entries} />
        </div>
        </main>
      </div>
    </div>
  );
}
