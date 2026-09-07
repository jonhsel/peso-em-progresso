import type { EvaluatedAchievement } from "@/lib/achievements";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AchievementsGrid({ all }: { all: EvaluatedAchievement[] }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
      {all.map((a) => (
        <AchievementTile key={a.rule.key} achievement={a} />
      ))}
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: EvaluatedAchievement }) {
  const { rule, status, unlockedAt, blockedReason } = achievement;

  const tooltip =
    status === "unlocked"
      ? `${rule.icon} ${rule.label} — ${rule.description}${
          unlockedAt
            ? ` (${format(parseISO(unlockedAt), "dd/MM/yyyy", { locale: ptBR })})`
            : ""
        }`
      : status === "blocked"
      ? `${rule.label} — ${blockedReason}`
      : `${rule.label} — ${rule.description}`;

  return (
    <div
      title={tooltip}
      className={`flex flex-col items-center gap-1.5 rounded-card border px-2 py-4 text-center transition ${
        status === "unlocked"
          ? "bg-accent-tint border-accent"
          : "border-base-border opacity-50"
      }`}
    >
      <span className={`text-3xl ${status !== "unlocked" ? "grayscale" : ""}`}>
        {status === "blocked" ? "🔒" : rule.icon}
      </span>
      <span className="text-xs text-ink-muted leading-tight">{rule.label}</span>
    </div>
  );
}
