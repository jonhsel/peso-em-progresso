"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { evaluateChallenge } from "@/lib/challenges";
import Link from "next/link";
import type { Challenge, WeightEntry, BodyMeasurement } from "@/types/database";

export default function ChallengesCard({
  challenges,
  entries,
  measurements,
}: {
  challenges: Challenge[];
  entries: WeightEntry[];
  measurements: BodyMeasurement[];
}) {
  const router = useRouter();
  const didPersist = useRef(false);
  const active = challenges.filter((c) => c.status === "active");
  const evaluations = active.map((c) => evaluateChallenge(c, entries, measurements));

  // Persistir transições active → completed/failed (fire-and-forget).
  // createClient() dentro do efeito (não no corpo) — mesmo padrão de
  // AchievementsCard (evita dep instável).
  // didPersist ref evita re-execução em StrictMode.
  // `router` omitido das deps (estável na prática, guard por ref impede loop).
  useEffect(() => {
    const toResolve = evaluations.filter((e) => e.resolvedStatus !== "active");
    if (toResolve.length === 0 || didPersist.current) return;
    didPersist.current = true;

    const supabase = createClient();
    Promise.all(
      toResolve.map((e) =>
        supabase
          .from("challenges")
          .update({
            status: e.resolvedStatus,
            completed_at: e.resolvedStatus === "completed" ? new Date().toISOString() : null,
          })
          .eq("id", e.challenge.id)
      )
    ).then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  if (active.length === 0) {
    return (
      <Link
        href="/dashboard/challenges"
        className="block rounded-card border border-base-border bg-base-surface px-4 py-3 hover:border-ink-faint transition"
      >
        <p className="text-sm text-ink-muted">Nenhum desafio ativo — que tal começar um?</p>
      </Link>
    );
  }

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-muted">Desafios</span>
        <Link href="/dashboard/challenges" className="text-xs text-accent hover:text-accent-hover transition">
          ver todos
        </Link>
      </div>
      {evaluations.map((e) => (
        <div key={e.challenge.id} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-ink truncate">{e.challenge.label}</span>
            <span className="text-ink-muted whitespace-nowrap ml-2">
              {e.daysRemaining > 0 ? `${e.daysRemaining}d` : "hoje"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-base-surface2 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${e.progressPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
