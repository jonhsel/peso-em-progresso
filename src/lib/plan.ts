import type { Profile } from "@/types/database";

// Helpers puros de gate de plano (Fase 7 — Monetização em camadas).
// Sem dependência de React/Supabase, mesmo padrão de analytics.ts/streak.ts.

export const FREE_GOAL_LIMIT = 1;
export const PRO_GOAL_LIMIT = 3;

export function isPro(profile: Pick<Profile, "plan">): boolean {
  return profile.plan === "pro";
}

export function goalLimitFor(profile: Pick<Profile, "plan">): number {
  return isPro(profile) ? PRO_GOAL_LIMIT : FREE_GOAL_LIMIT;
}

export function allowedGoalMetricsFor(profile: Pick<Profile, "plan">) {
  return isPro(profile)
    ? (["weight", "waist", "hip", "arm", "body_fat"] as const)
    : (["weight"] as const);
}
