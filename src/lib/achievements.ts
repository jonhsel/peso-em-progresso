import type { WeightEntry, Goal, UserAchievement } from "@/types/database";

// --- Definição das regras ---

export type AchievementCategory = "absolute" | "percentage";

export type AchievementRule = {
  key: string;
  label: string;
  description: string;
  category: AchievementCategory;
  /** Valor numérico da condição — kg perdidos (absolute) ou % da meta (percentage). */
  threshold: number;
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
    threshold: 1,
    icon: "🎯",
  },
  {
    key: "lost_5kg",
    label: "-5 kg",
    description: "Perdeu 5 kg desde o primeiro registro.",
    category: "absolute",
    threshold: 5,
    icon: "💪",
  },
  {
    key: "lost_10kg",
    label: "-10 kg",
    description: "Perdeu 10 kg desde o primeiro registro.",
    category: "absolute",
    threshold: 10,
    icon: "🔥",
  },
  // Progresso percentual
  {
    key: "pct_25",
    label: "25% da meta",
    description: "25% do caminho até o peso alvo.",
    category: "percentage",
    threshold: 25,
    icon: "🌱",
  },
  {
    key: "pct_50",
    label: "50% da meta",
    description: "Metade do caminho até o peso alvo.",
    category: "percentage",
    threshold: 50,
    icon: "⚡",
  },
  {
    key: "pct_75",
    label: "75% da meta",
    description: "75% do caminho até o peso alvo.",
    category: "percentage",
    threshold: 75,
    icon: "🚀",
  },
  {
    key: "pct_100",
    label: "Meta atingida",
    description: "Chegou no peso alvo!",
    category: "percentage",
    threshold: 100,
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
 *
 * Conquistas continuam peso-only (fora de escopo generalizar por métrica,
 * ver decisão técnica da Fase 6.2) — avaliadas sempre contra a meta de
 * peso "primária" (a mais antiga ativa), nunca contra metas de outras
 * métricas.
 */
export type AchievementMetrics = {
  totalLostKg: number;
  /** null quando não há meta de peso ativa/válida (blocked). */
  progressPct: number | null;
};

export function evaluateAchievements(
  entries: WeightEntry[],
  primaryWeightGoal: Goal | null,
  existing: UserAchievement[]
): {
  all: EvaluatedAchievement[];
  newlyUnlocked: string[];
  metrics: AchievementMetrics;
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

  const targetWeight = primaryWeightGoal?.target_value ?? null;
  const hasTarget = targetWeight !== null && targetWeight > 0;
  const firstAboveTarget =
    hasTarget && first ? Number(first.weight_kg) > targetWeight : false;
  const progressPct =
    hasTarget && firstAboveTarget && first
      ? (totalLostKg / (Number(first.weight_kg) - targetWeight!)) * 100
      : null;

  const newlyUnlocked: string[] = [];

  function check(rule: AchievementRule): boolean {
    if (rule.category === "absolute") return totalLostKg >= rule.threshold;
    return progressPct !== null && progressPct >= rule.threshold;
  }

  function isBlocked(rule: AchievementRule): string | null {
    if (rule.category !== "percentage") return null;
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

    const blocked = isBlocked(rule);
    if (blocked) {
      return {
        rule,
        status: "blocked" as const,
        unlockedAt: null,
        blockedReason: blocked,
      };
    }

    const met = check(rule);
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

  return { all, newlyUnlocked, metrics: { totalLostKg, progressPct } };
}

/**
 * Retorna a próxima conquista não desbloqueada de uma categoria (a de
 * menor threshold, já que ACHIEVEMENT_RULES está em ordem crescente).
 * `null` quando a categoria inteira já está desbloqueada. Pode retornar
 * uma conquista com status "blocked" — quem chama decide como exibir
 * (ver AchievementsProgress.tsx).
 */
export function getNextMilestone(
  all: EvaluatedAchievement[],
  category: AchievementCategory
): EvaluatedAchievement | null {
  return all.find((a) => a.rule.category === category && a.status !== "unlocked") ?? null;
}
