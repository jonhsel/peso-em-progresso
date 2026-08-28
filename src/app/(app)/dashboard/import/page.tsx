import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import CsvImporter from "@/components/import/CsvImporter";

export default async function ImportPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
            Importar dados
          </p>
          <h1 className="font-display font-bold text-2xl">Importar CSV</h1>
          <p className="text-sm text-ink-muted mt-2">
            Importe pesagens de outro app ou planilha. O arquivo precisa ter pelo
            menos uma coluna de data e uma de peso.
          </p>
        </div>
        <CsvImporter userId={user.id} />
      </main>
    </div>
  );
}
