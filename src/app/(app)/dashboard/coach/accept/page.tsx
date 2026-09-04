import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { createClient } from "@/lib/supabase/server";
import NavBar from "@/components/NavBar";
import AcceptInviteButton from "@/components/coach/AcceptInviteButton";
import type { CoachLink } from "@/types/database";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();
  const code = searchParams.code;

  let message: string | null = null;
  let link: CoachLink | null = null;

  if (!code) {
    message = "Link inválido.";
  } else {
    const supabase = createClient();
    const { data } = await supabase
      .from("coach_links")
      .select("*")
      .eq("invite_code", code)
      .maybeSingle();

    const found = data as CoachLink | null;

    if (!found) {
      message = "Convite inválido ou expirado.";
    } else if (found.status !== "pending") {
      message = "Este convite já foi usado ou cancelado.";
    } else if (found.owner_user_id === user.id) {
      message = "Você não pode ser coach de si mesmo.";
    } else {
      link = found;
    }
  }

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        {message && <p className="text-sm text-ink-faint">{message}</p>}
        {link && (
          <div className="bg-base-surface border border-base-border rounded-card p-6 space-y-4">
            <p className="text-sm text-ink">
              <span className="font-medium">{link.owner_display_name}</span> te convidou para
              acompanhar o progresso como coach — você poderá ver peso, medidas, fotos e metas,
              sem editar nada.
            </p>
            <AcceptInviteButton linkId={link.id} coachDisplayName={profile.display_name} />
          </div>
        )}
      </main>
    </div>
  );
}
