import { startOfWeek, endOfWeek } from "date-fns";
import type { ActivitySession, ActivityGoal, ActivityType } from "@/types/database";
import type { WeekStartsOn } from "@/types/database";

export type ActivityWeeklyKpi = {
  activityTypeId: string;
  activityTypeName: string;
  trackDistance: boolean;
  actualMinutes: number;
  totalDistanceKm: number | null;
  targetMinutes: number | null; // null = sem meta ativa pra esse tipo
  progressPct: number | null;
  sessionsCount: number;
};

/**
 * Soma os minutos de sessões de um tipo dentro da semana corrente
 * (respeitando week_starts_on do perfil) e compara com a meta ativa
 * daquele tipo, se existir.
 *
 * Semana de atividade é sempre semana civil (startOfWeek/endOfWeek) —
 * não respeita period_mode (rolling/anchored). Ver decisão 6 no topo
 * da spec.
 */
export function computeActivityWeeklyKpis(
  types: ActivityType[],
  sessions: ActivitySession[],
  goals: ActivityGoal[],
  weekStartsOn: WeekStartsOn = "monday",
  now: Date = new Date()
): ActivityWeeklyKpi[] {
  const weekStartsOnNumber = weekStartsOn === "sunday" ? 0 : 1;
  const start = startOfWeek(now, { weekStartsOn: weekStartsOnNumber });
  const end = endOfWeek(now, { weekStartsOn: weekStartsOnNumber });

  return types.map((type) => {
    const typeSessions = sessions.filter((s) => {
      if (s.activity_type_id !== type.id) return false;
      const d = new Date(s.performed_at);
      return d >= start && d <= end;
    });
    const actualMinutes = typeSessions.reduce(
      (sum, s) => sum + Number(s.duration_minutes),
      0
    );
    const totalDistanceKm = type.track_distance
      ? typeSessions.reduce(
          (sum, s) => sum + (s.distance_km ? Number(s.distance_km) : 0),
          0
        )
      : null;
    const goal = goals.find(
      (g) => g.activity_type_id === type.id && g.is_active
    );
    const targetMinutes = goal ? Number(goal.weekly_minutes_target) : null;
    const progressPct =
      targetMinutes && targetMinutes > 0
        ? Math.min(100, Math.round((actualMinutes / targetMinutes) * 100))
        : null;

    return {
      activityTypeId: type.id,
      activityTypeName: type.name,
      trackDistance: type.track_distance,
      actualMinutes,
      totalDistanceKm,
      targetMinutes,
      progressPct,
      sessionsCount: typeSessions.length,
    };
  });
}
