import type { WeightEntry, Goals, UserAchievement } from "@/types/database";

// --- Definição das regras ---

export type AchievementCategory = "absolute" | "percentage";

export type AchievementRule = {
  key: string;
  label: string;
  description: string;
  category: AchievementCategory;
  /** Ícone representativo (emoji) — usado no card do dashboard. */
  icon: string;
};

export const ACHIEVEMENT_RULES: AchievementRule[] = [
  // Perda absoluta
  {
    key: "lost_1kg",
    label: "Primeiro kg",
    description: "Perdeu 1 kg desde o primeiro registro.",
    category: "absolute",
    icon: "🎯",
  },
  {
    key: "lost_5kg",
    label: "-5 kg",
    description: "Perdeu 5 kg desde o primeiro registro.",
    category: "absolute",
    icon: "💪",
  },
  {
    key: "lost_10kg",
    label: "-10 kg",
    description: "Perdeu 10 kg desde o primeiro registro.",
    category: "absolute",
    icon: "🔥",
  },
  // Progresso percentual
  {
    key: "pct_25",
    label: "25% da meta",
    description: "25% do caminho até o peso alvo.",
    category: "percentage",
    icon: "🌱",
  },
  {
    key: "pct_50",
    label: "50% da meta",
    description: "Metade do caminho até o peso alvo.",
    category: "percentage",
    icon: "⚡",
  },
  {
    key: "pct_75",
    label: "75% da meta",
    description: "75% do caminho até o peso alvo.",
    category: "percentage",
    icon: "🚀",
  },
  {
    key: "pct_100",
    label: "Meta atingida",
    description: "Chegou no peso alvo!",
    category: "percentage",
    icon: "🏆",
  },
];

// --- Avaliação ---

export type EvaluatedAchievement = {
  rule: AchievementRule;
  status: "unlocked" | "locked" | "blocked";
  /** Quando foi desbloqueada (da tabela). null se locked/blocked. */
  unlockedAt: string | null;
  /** Motivo do bloqueio (só para "blocked"). */
  blockedReason: string | null;
};

/**
 * Avalia todas as conquistas para um usuário, cruzando as regras com os
 * dados atuais e a lista de conquistas já persistidas.
 *
 * - "unlocked": condição atingida e já salva em `user_achievements`.
 * - "locked": condição não atingida (ainda).
 * - "blocked": condição impossível de avaliar (ex: sem peso alvo) —
 *   mostra no UI com "defina um peso alvo pra desbloquear".
 *
 * Retorna também `newlyUnlocked`: conquistas cuja condição é atingida
 * agora mas que ainda não estão em `user_achievements` — o caller
 * (dashboard page) deve persistir essas no banco.
 */
export function evaluateAchievements(
  entries: WeightEntry[],
  goals: Goals,
  existing: UserAchievement[]
): {
  all: EvaluatedAchievement[];
  newlyUnlocked: string[]; // achievement_keys a persistir
} {
  const existingKeys = new Set(existing.map((a) => a.achievement_key));
  const existingMap = new Map(existing.map((a) => [a.achievement_key, a]));

  // Dados derivados
  const sorted = [...entries].sort((a, b) =>
    a.measured_at.localeCompare(b.measured_at)
  );
  const first = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;

  const totalLostKg =
    first && latest ? Number(first.weight_kg) - Number(latest.weight_kg) : 0;

  const targetWeight = goals.target_weight_kg;
  const hasTarget = targetWeight !== null && targetWeight > 0;
  const firstAboveTarget =
    hasTarget && first ? Number(first.weight_kg) > targetWeight : false;
  const progressPct =
    hasTarget && firstAboveTarget && first
      ? (totalLostKg / (Number(first.weight_kg) - targetWeight!)) * 100
      : null;

  const newlyUnlocked: string[] = [];

  function check(key: string): boolean {
    switch (key) {
      case "lost_1kg":
        return totalLostKg >= 1;
      case "lost_5kg":
        return totalLostKg >= 5;
      case "lost_10kg":
        return totalLostKg >= 10;
      case "pct_25":
        return progressPct !== null && progressPct >= 25;
      case "pct_50":
        return progressPct !== null && progressPct >= 50;
      case "pct_75":
        return progressPct !== null && progressPct >= 75;
      case "pct_100":
        return progressPct !== null && progressPct >= 100;
      default:
        return false;
    }
  }

  function isBlocked(key: string): string | null {
    const rule = ACHIEVEMENT_RULES.find((r) => r.key === key);
    if (!rule || rule.category !== "percentage") return null;
    if (!hasTarget) return "Defina um peso alvo em Metas";
    if (!firstAboveTarget) return "Peso alvo já alcançado";
    return null;
  }

  const all: EvaluatedAchievement[] = ACHIEVEMENT_RULES.map((rule) => {
    if (existingKeys.has(rule.key)) {
      return {
        rule,
        status: "unlocked" as const,
        unlockedAt: existingMap.get(rule.key)!.unlocked_at,
        blockedReason: null,
      };
    }

    const blocked = isBlocked(rule.key);
    if (blocked) {
      return {
        rule,
        status: "blocked" as const,
        unlockedAt: null,
        blockedReason: blocked,
      };
    }

    const met = check(rule.key);
    if (met) {
      newlyUnlocked.push(rule.key);
      return {
        rule,
        status: "unlocked" as const,
        unlockedAt: new Date().toISOString(),
        blockedReason: null,
      };
    }

    return {
      rule,
      status: "locked" as const,
      unlockedAt: null,
      blockedReason: null,
    };
  });

  return { all, newlyUnlocked };
}
