import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import BodyMeasurementForm from "@/components/BodyMeasurementForm";
import BodyMeasurementsList from "@/components/BodyMeasurementsList";

export default async function MeasurementsPage() {
  const { user, profile, measurements } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:sticky md:top-8 self-start">
          <BodyMeasurementForm userId={user.id} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Histórico</p>
          <BodyMeasurementsList measurements={measurements} />
        </div>
      </main>
    </div>
  );
}
