import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
} from "@/types/database";

export async function loadUserData() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }, { data: achievements }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at"),
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

  const typedActiveGoals: Goal[] = (activeGoals as Goal[]) ?? [];

  // Fallback sintético de goalsHistory — só pro caso de a migração 0009
  // ainda não ter rodado (goals_history vem vazio). Um registro por meta
  // ativa, com os defaults 0.25/1/3/6 e created_at na época Unix, pra
  // resolveGoalsForPeriod nunca receber lista vazia pra nenhuma meta.
  const typedGoalsHistory: GoalsHistoryEntry[] = (goalsHistory as GoalsHistoryEntry[])?.length
    ? (goalsHistory as GoalsHistoryEntry[])
    : typedActiveGoals.map((goal) => ({
        id: `fallback-${goal.id}`,
        goal_id: goal.id,
        user_id: user.id,
        metric: goal.metric,
        weekly_rate: goal.weekly_rate,
        monthly_rate: goal.monthly_rate,
        quarterly_rate: goal.quarterly_rate,
        semester_rate: goal.semester_rate,
        target_value: goal.target_value,
        created_at: new Date(0).toISOString(),
      }));

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
      checkin_hour: null,
    },
    entries: (entries as WeightEntry[]) ?? [],
    measurements: (measurements as BodyMeasurement[]) ?? [],
    goalsHistory: typedGoalsHistory,
    activeGoals: typedActiveGoals,
    achievements: (achievements as UserAchievement[]) ?? [],
  };
}
