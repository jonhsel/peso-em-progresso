import type {
  Challenge,
  ChallengeType,
  GoalMetric,
  WeightEntry,
  BodyMeasurement,
} from "@/types/database";
import { extractMetricPoints } from "@/lib/analytics";

// --- Templates ---

export type ChallengeTemplate = {
  key: string;
  type: ChallengeType;
  metric: GoalMetric | null;
  label: string;
  targetValue: number;
  durationDays: number;
};

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  { key: "lose_2kg_30d", type: "progress", metric: "weight", label: "Perca 2 kg em 30 dias", targetValue: 2, durationDays: 30 },
  { key: "waist_2cm_30d", type: "progress", metric: "waist", label: "Reduza 2 cm de cintura em 30 dias", targetValue: 2, durationDays: 30 },
  { key: "bodyfat_1pp_60d", type: "progress", metric: "body_fat", label: "Reduza 1 p.p. de %gordura em 60 dias", targetValue: 1, durationDays: 60 },
  { key: "streak_7d", type: "habit", metric: null, label: "Registre 7 dias seguidos", targetValue: 7, durationDays: 7 },
  { key: "streak_30d", type: "habit", metric: null, label: "Registre 30 dias seguidos", targetValue: 30, durationDays: 30 },
];

// --- Avaliação ---

export type ChallengeEvaluation = {
  challenge: Challenge;
  /** progress: valor atual da métrica. habit: dias consecutivos registrados desde start_date. */
  currentValue: number | null;
  /** 0-100, clamped. */
  progressPct: number;
  /** pode diferir de challenge.status até o caller persistir a transição. */
  resolvedStatus: Challenge["status"];
  /** negativo = prazo já passou. */
  daysRemaining: number;
};

// Mesmo Intl formatter usado em streak.ts — locale "en-CA" retorna YYYY-MM-DD.
const SP_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

function todayInSaoPaulo(reference: Date): string {
  return SP_FMT.format(reference);
}

/**
 * Avalia um desafio contra os dados atuais. NÃO persiste nada — o caller
 * (ChallengesCard) decide se precisa fazer update quando resolvedStatus
 * difere de challenge.status.
 *
 * Desafios já resolvidos (completed/failed) retornam o status congelado —
 * uma vez failed, não "ressuscita" mesmo que dados voltem a bater.
 */
export function evaluateChallenge(
  challenge: Challenge,
  entries: WeightEntry[],
  measurements: BodyMeasurement[],
  reference: Date = new Date()
): ChallengeEvaluation {
  const today = todayInSaoPaulo(reference);

  // Status congelado: já resolvido, sem recalcular.
  if (challenge.status !== "active") {
    return {
      challenge,
      currentValue: null,
      progressPct: challenge.status === "completed" ? 100 : 0,
      resolvedStatus: challenge.status,
      daysRemaining: 0,
    };
  }

  const pastDeadline = today > challenge.end_date;

  if (challenge.type === "progress") {
    return evaluateProgress(challenge, entries, measurements, today, pastDeadline);
  }

  return evaluateHabit(challenge, entries, today, pastDeadline);
}

function evaluateProgress(
  challenge: Challenge,
  entries: WeightEntry[],
  measurements: BodyMeasurement[],
  today: string,
  pastDeadline: boolean
): ChallengeEvaluation {
  const metric = challenge.metric!;
  const points = extractMetricPoints(metric, entries, measurements)
    .filter((p) => SP_FMT.format(p.date) <= today);
  const latest = points.at(-1)?.weight ?? null;
  const baseline = challenge.baseline_value ?? latest;
  const reduced = latest != null && baseline != null ? baseline - latest : 0;
  const progressPct = challenge.target_value > 0
    ? Math.max(0, Math.min(100, (reduced / challenge.target_value) * 100))
    : 0;
  const achieved = reduced >= challenge.target_value;

  return {
    challenge,
    currentValue: latest,
    progressPct,
    resolvedStatus: achieved ? "completed" : pastDeadline ? "failed" : "active",
    daysRemaining: daysBetween(today, challenge.end_date),
  };
}

/**
 * Desafio de hábito — regra estrita (sem tolerância de 1 dia como no streak
 * global). Dias consecutivos com registro em `weight_entries`, a partir de
 * `start_date`, sem falha no meio. Qualquer dia sem registro dentro da
 * janela quebra a sequência e o desafio falha imediatamente.
 *
 * [Auditoria #A5] brokeEarly: se a sequência contígua parou num dia que já
 * passou (cursor < today), o desafio falha mesmo que sobrem dias no prazo —
 * não há como "recuperar" um dia sem registro retroativamente.
 */
function evaluateHabit(
  challenge: Challenge,
  entries: WeightEntry[],
  today: string,
  pastDeadline: boolean
): ChallengeEvaluation {
  const days = new Set(entries.map((e) => e.measured_at));
  let run = 0;
  let cursor = challenge.start_date;
  while (cursor <= today && cursor <= challenge.end_date && days.has(cursor)) {
    run++;
    cursor = addDays(cursor, 1);
  }
  const achieved = run >= challenge.target_value;
  // Falhou se: (1) prazo passou sem atingir, OU (2) sequência quebrou —
  // cursor parou num dia que já passou sem registro.
  const brokeEarly = !achieved && cursor < today && cursor <= challenge.end_date;

  return {
    challenge,
    currentValue: run,
    progressPct: Math.max(0, Math.min(100, (run / challenge.target_value) * 100)),
    resolvedStatus: achieved ? "completed" : pastDeadline || brokeEarly ? "failed" : "active",
    daysRemaining: daysBetween(today, challenge.end_date),
  };
}

// --- Helpers de data (YYYY-MM-DD, fuso fixo America/Sao_Paulo) ---
// Mesmo padrão de streak.ts — nunca .toISOString().

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`); // meio-dia evita virada de DST
  d.setDate(d.getDate() + days);
  return SP_FMT.format(d);
}

function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(`${fromStr}T12:00:00`);
  const to = new Date(`${toStr}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
