import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  const { user, profile, activeGoals } = await loadUserData();
  const theme = await getTheme();

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
        <SettingsForm
          userId={user.id}
          displayName={profile.display_name}
          heightCm={profile.height_cm}
          periodMode={profile.period_mode}
          weekStartsOn={profile.week_starts_on}
          checkinHour={profile.checkin_hour}
          plan={profile.plan}
        />
        </main>
      </div>
    </div>
  );
}
