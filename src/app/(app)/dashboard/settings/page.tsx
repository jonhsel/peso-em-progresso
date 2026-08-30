import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <SettingsForm
          userId={user.id}
          displayName={profile.display_name}
          heightCm={profile.height_cm}
          periodMode={profile.period_mode}
          weekStartsOn={profile.week_starts_on}
          checkinHour={profile.checkin_hour}
        />
      </main>
    </div>
  );
}
