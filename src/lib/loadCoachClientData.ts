import { createClient } from "@/lib/supabase/server";
import type { Goal, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement } from "@/types/database";

/**
 * Carrega os dados de um dono (owner) do ponto de vista do coach — mesma
 * estrutura de loadUserData(), mas filtrando por ownerId em vez do usuário
 * autenticado. Retorna null se não houver vínculo ativo — o caller trata
 * (redirect ou mensagem de erro). A checagem de vínculo aqui é por UX, não
 * segurança: as políticas RLS `_select_by_coach` já protegem os dados; sem
 * ela, um ownerId sem vínculo simplesmente retornaria arrays vazios em vez
 * de uma mensagem clara.
 */
export async function loadCoachClientData(ownerId: string, coachUserId: string) {
  const supabase = createClient();

  const { data: link } = await supabase
    .from("coach_links")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("coach_user_id", coachUserId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return null;

  const [{ data: profile }, { data: entries }, { data: activeGoals }, { data: measurements }, { data: goalsHistory }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", ownerId).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", ownerId)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", ownerId)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("body_measurements")
        .select("*")
        .eq("user_id", ownerId)
        .order("measured_at", { ascending: true }),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false }),
    ]);

  const typedActiveGoals: Goal[] = (activeGoals as Goal[]) ?? [];

  // Mesmo fallback sintético de loadUserData() — só pro caso de a migração
  // 0009 (que criou goals_history.goal_id) ainda não ter rodado.
  const typedGoalsHistory: GoalsHistoryEntry[] = (goalsHistory as GoalsHistoryEntry[])?.length
    ? (goalsHistory as GoalsHistoryEntry[])
    : typedActiveGoals.map((goal) => ({
        id: `fallback-${goal.id}`,
        goal_id: goal.id,
        user_id: ownerId,
        metric: goal.metric,
        weekly_rate: goal.weekly_rate,
        monthly_rate: goal.monthly_rate,
        quarterly_rate: goal.quarterly_rate,
        semester_rate: goal.semester_rate,
        target_value: goal.target_value,
        created_at: new Date(0).toISOString(),
      }));

  return {
    profile: profile as Profile,
    entries: (entries as WeightEntry[]) ?? [],
    measurements: (measurements as BodyMeasurement[]) ?? [],
    goalsHistory: typedGoalsHistory,
    activeGoals: typedActiveGoals,
  };
}
