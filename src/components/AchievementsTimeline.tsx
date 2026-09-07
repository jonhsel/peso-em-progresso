import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EvaluatedAchievement } from "@/lib/achievements";

export default function AchievementsTimeline({ all }: { all: EvaluatedAchievement[] }) {
  const unlocked = all
    .filter((a): a is EvaluatedAchievement & { unlockedAt: string } => a.status === "unlocked" && a.unlockedAt !== null)
    .sort((a, b) => (a.unlockedAt > b.unlockedAt ? -1 : 1));

  if (unlocked.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhuma conquista desbloqueada ainda — continue registrando seu peso.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {unlocked.map((a) => (
        <li key={a.rule.key} className="flex items-center gap-3 text-sm">
          <span className="text-lg">{a.rule.icon}</span>
          <span className="flex-1 text-ink">{a.rule.label}</span>
          <span className="text-xs text-ink-faint font-mono">
            {format(parseISO(a.unlockedAt), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </li>
      ))}
    </ul>
  );
}
