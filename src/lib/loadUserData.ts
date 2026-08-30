import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Goals, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
} from "@/types/database";

export async function loadUserData() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }, { data: goalsHistory }, { data: achievements }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase.from("goals").select("*").eq("user_id", user.id).single(),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_achievements")
        .select("*")
        .eq("user_id", user.id),
    ]);

  // Fase 0: quem nunca concluiu o onboarding é redirecionado antes de ver
  // qualquer tela do dashboard.
  if (profile && !(profile as Profile).onboarded_at) {
    redirect("/onboarding");
  }

  return {
    user,
    profile: (profile as Profile) ?? {
      id: user.id,
      display_name: user.email ?? "Usuário",
      height_cm: null,
      created_at: "",
      onboarded_at: null,
      period_mode: "fixed" as const,
      week_starts_on: "monday" as const,
    },
    entries: (entries as WeightEntry[]) ?? [],
    measurements: (measurements as BodyMeasurement[]) ?? [],
    goalsHistory:
      (goalsHistory as GoalsHistoryEntry[])?.length
        ? (goalsHistory as GoalsHistoryEntry[])
        : [
            {
              id: "fallback",
              user_id: user.id,
              weekly_loss_kg: 0.25,
              monthly_loss_kg: 1,
              quarterly_loss_kg: 3,
              semester_loss_kg: 6,
              target_weight_kg: null,
              created_at: new Date(0).toISOString(),
            },
          ],
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
    achievements: (achievements as UserAchievement[]) ?? [],
  };
}
