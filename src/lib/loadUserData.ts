import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Goals, Profile, WeightEntry } from "@/types/database";

export async function loadUserData() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: entries }, { data: goals }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("weight_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: true }),
    supabase.from("goals").select("*").eq("user_id", user.id).single(),
  ]);

  // Fase 0: quem nunca concluiu o onboarding é redirecionado antes de ver
  // qualquer tela do dashboard.
  if (profile && !(profile as Profile).onboarded_at) {
    redirect("/onboarding");
  }

  return {
    user,
    profile: (profile as Profile) ?? { id: user.id, display_name: user.email ?? "Usuário", height_cm: null, created_at: "", onboarded_at: null },
    entries: (entries as WeightEntry[]) ?? [],
    goals:
      (goals as Goals) ??
      ({
        user_id: user.id,
        weekly_loss_kg: 0.25,
        monthly_loss_kg: 1,
        quarterly_loss_kg: 3,
        semester_loss_kg: 6,
        target_weight_kg: null,
        updated_at: "",
      } as Goals),
  };
}
