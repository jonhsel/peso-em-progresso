"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  evaluateAchievements,
  ACHIEVEMENT_RULES,
  type EvaluatedAchievement,
} from "@/lib/achievements";
import type { WeightEntry, Goal, UserAchievement } from "@/types/database";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AchievementsCard({
  entries,
  primaryWeightGoal,
  achievements,
  userId,
}: {
  entries: WeightEntry[];
  primaryWeightGoal: Goal | null;
  achievements: UserAchievement[];
  userId: string;
}) {
  const router = useRouter();
  const didPersist = useRef(false);

  const { all, newlyUnlocked } = evaluateAchievements(entries, primaryWeightGoal, achievements);

  // Persistir conquistas novas (fire-and-forget, sem bloquear o render).
  // useRef evita re-execução em StrictMode / re-renders.
  // `createClient()` é criado dentro do efeito para não ser dep instável.
  // `router` omitido das deps — estável na prática, guard por ref impede loop.
  useEffect(() => {
    if (newlyUnlocked.length === 0 || didPersist.current) return;
    didPersist.current = true;

    const supabase = createClient();
    const rows = newlyUnlocked.map((key) => ({
      user_id: userId,
      achievement_key: key,
    }));

    supabase
      .from("user_achievements")
      .insert(rows)
      .then(({ error }) => {
        if (!error) router.refresh();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyUnlocked, userId]);

  const unlockedCount = all.filter((a) => a.status === "unlocked").length;
  const totalCount = ACHIEVEMENT_RULES.length;

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-ink-muted">
          Conquistas
        </span>
        <span className="text-xs text-ink-faint font-mono">
          {unlockedCount}/{totalCount}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {all.map((a) => (
          <AchievementDot key={a.rule.key} achievement={a} />
        ))}
      </div>
    </div>
  );
}

function AchievementDot({ achievement }: { achievement: EvaluatedAchievement }) {
  const { rule, status, unlockedAt, blockedReason } = achievement;

  const tooltip =
    status === "unlocked"
      ? `${rule.icon} ${rule.label} — ${rule.description}${
          unlockedAt
            ? ` (${format(parseISO(unlockedAt), "dd/MM/yyyy", { locale: ptBR })})`
            : ""
        }`
      : status === "blocked"
      ? `🔒 ${rule.label} — ${blockedReason}`
      : `${rule.label} — ${rule.description}`;

  return (
    <div
      title={tooltip}
      className={`flex items-center justify-center h-9 w-full rounded-lg text-sm cursor-default transition ${
        status === "unlocked"
          ? "bg-[var(--accent-tint)] border border-accent"
          : status === "blocked"
          ? "bg-base-surface2 border border-base-border opacity-40"
          : "bg-base-surface2 border border-base-border opacity-60"
      }`}
    >
      <span className={status !== "unlocked" ? "grayscale" : ""}>
        {status === "blocked" ? "🔒" : rule.icon}
      </span>
    </div>
  );
}
