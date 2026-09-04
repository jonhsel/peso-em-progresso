import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import CoachShareSection from "@/components/coach/CoachShareSection";
import CoachClientsList from "@/components/coach/CoachClientsList";
import type { CoachLink } from "@/types/database";

export default async function CoachPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const supabase = createClient();

  // Vínculo do próprio usuário como DONO (só pode ter 1 pendente/ativo por
  // vez — índice parcial coach_links_one_open_per_owner).
  const { data: myLink } = await supabase
    .from("coach_links")
    .select("*")
    .eq("owner_user_id", user.id)
    .in("status", ["pending", "active"])
    .maybeSingle();

  // Vínculos onde o próprio usuário é COACH de outros.
  const { data: clientLinks } = await supabase
    .from("coach_links")
    .select("*")
    .eq("coach_user_id", user.id)
    .eq("status", "active")
    .order("accepted_at", { ascending: false });

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <CoachShareSection
          userId={user.id}
          displayName={profile.display_name}
          currentLink={(myLink as CoachLink) ?? null}
        />
        <CoachClientsList clients={(clientLinks as CoachLink[]) ?? []} />
      </main>
    </div>
  );
}
