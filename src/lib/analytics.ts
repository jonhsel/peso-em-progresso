import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  differenceInCalendarDays,
  parseISO,
  formatISO,
  subDays,
} from "date-fns";
import type { WeightEntry, GoalsHistoryEntry, PeriodMode, WeekStartsOn } from "@/types/database";

export type Period = "week" | "month" | "quarter" | "semester";

const PERIOD_LABEL: Record<Period, string> = {
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
  semester: "Semestre",
};

// Campos de meta de perda que existem tanto em Goals quanto em GoalsHistoryEntry.
type GoalFieldKey = "weekly_loss_kg" | "monthly_loss_kg" | "quarterly_loss_kg" | "semester_loss_kg";

const GOAL_FIELD: Record<Period, GoalFieldKey> = {
  week: "weekly_loss_kg",
  month: "monthly_loss_kg",
  quarter: "quarterly_loss_kg",
  semester: "semester_loss_kg",
};

/**
 * Horizonte máximo de "frescor" do baseline por período.
 * Se a última pesagem anterior ao início do período for mais antiga que isso,
 * o KPI se recusa a projetar (evita comparar peso atual contra uma referência
 * de meses atrás, que geraria "esperado hoje" absurdo).
 */
const BASELINE_MAX_DAYS_BEFORE: Record<Period, number> = {
  week: 30,
  month: 60,
  quarter: 120,
  semester: 240,
};

/**
 * Início do período que contém `reference`.
 * mode "fixed" (default): período civil — semana a partir de `weekStartsOn`,
 * mês/trimestre/semestre civis.
 * mode "rolling": N dias corridos atrás de hoje (7/30/90/180) — ignora
 * `weekStartsOn`, que só se aplica ao modo fixed.
 */
export function periodStart(
  period: Period,
  reference: Date,
  mode: PeriodMode = "fixed",
  weekStartsOn: WeekStartsOn = "monday"
): Date {
  if (mode === "rolling") {
    const rollingDays: Record<Period, number> = {
      week: 7,
      month: 30,
      quarter: 90,
      semester: 180,
    };
    return subDays(reference, rollingDays[period]);
  }

  switch (period) {
    case "week":
      return startOfWeek(reference, { weekStartsOn: weekStartsOn === "sunday" ? 0 : 1 });
    case "month":
      return startOfMonth(reference);
    case "quarter":
      return startOfQuarter(reference);
    case "semester": {
      const month = reference.getMonth(); // 0-11
      const semesterStartMonth = month < 6 ? 0 : 6;
      return new Date(reference.getFullYear(), semesterStartMonth, 1);
    }
  }
}

/**
 * Duração do período em dias, usada para calcular a fração já decorrida.
 * mode "fixed": aproximação civil (30.4/91.3/182.6 para mês/trimestre/semestre).
 * mode "rolling": valor exato (30/90/180), já que o período É esses N dias.
 */
function periodLengthDays(period: Period, mode: PeriodMode = "fixed"): number {
  if (mode === "rolling") {
    const exact: Record<Period, number> = { week: 7, month: 30, quarter: 90, semester: 180 };
    return exact[period];
  }
  switch (period) {
    case "week":
      return 7;
    case "month":
      return 30.4;
    case "quarter":
      return 91.3;
    case "semester":
      return 182.6;
  }
}

export type EntryPoint = { date: Date; weight: number };

function toPoints(entries: WeightEntry[]): EntryPoint[] {
  return entries
    .map((e) => ({ date: parseISO(e.measured_at), weight: Number(e.weight_kg) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Baseline do período:
 * 1. Última pesagem ANTES ou NO início do período, se estiver dentro do
 *    horizonte de frescor (ver BASELINE_MAX_DAYS_BEFORE).
 * 2. Se não houver pesagem prévia recente, usa a primeira pesagem DENTRO do
 *    período (útil para usuário novo que começou a pesar no meio do período).
 * 3. Se nada disso existir, retorna null — o KPI mostra "sem dados suficientes"
 *    em vez de projetar contra referência velha.
 */
function baselineWeight(points: EntryPoint[], start: Date, period: Period): number | null {
  const maxDaysBefore = BASELINE_MAX_DAYS_BEFORE[period];
  const earliestAllowed = new Date(start.getTime() - maxDaysBefore * 86_400_000);

  let best: EntryPoint | null = null;
  for (const p of points) {
    if (p.date.getTime() <= start.getTime() && p.date.getTime() >= earliestAllowed.getTime()) {
      if (!best || p.date.getTime() > best.date.getTime()) best = p;
    }
  }
  if (best) return best.weight;

  const firstInPeriod = points.find((p) => p.date.getTime() >= start.getTime());
  return firstInPeriod ? firstInPeriod.weight : null;
}

export type TrendResult = {
  slopeKgPerWeek: number;
  label: "perdendo_rapido" | "perdendo" | "estavel" | "ganhando" | "insufficient_data";
  description: string;
};

/**
 * Tendência via regressão linear simples sobre as últimas `windowDays`.
 * Se houver menos de 2 pesagens na janela, retorna `insufficient_data` em vez
 * de projetar tendência a partir de pesagens antigas (que induziria o usuário
 * a acreditar em uma "tendência atual" baseada em dados de meses atrás).
 */
export function computeTrend(entries: WeightEntry[], windowDays = 21): TrendResult {
  const points = toPoints(entries);
  if (points.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: "Registre ao menos 2 pesagens para calcular a tendência.",
    };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = points.filter((p) => p.date >= cutoff);

  if (recent.length < 2) {
    return {
      slopeKgPerWeek: 0,
      label: "insufficient_data",
      description: `Menos de 2 pesagens nos últimos ${windowDays} dias — pese com mais frequência para ver a tendência atual.`,
    };
  }

  const t0 = recent[0].date.getTime();
  const xs = recent.map((p) => (p.date.getTime() - t0) / 86_400_000); // dias
  const ys = recent.map((p) => p.weight);
  const n = xs.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  const slopePerDay = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const slopeKgPerWeek = Number((slopePerDay * 7).toFixed(3));

  let label: TrendResult["label"] = "estavel";
  if (slopeKgPerWeek <= -0.35) label = "perdendo_rapido";
  else if (slopeKgPerWeek <= -0.05) label = "perdendo";
  else if (slopeKgPerWeek >= 0.1) label = "ganhando";

  const description =
    label === "perdendo_rapido"
      ? `Perdendo cerca de ${Math.abs(slopeKgPerWeek).toFixed(2)} kg/semana — ritmo acelerado.`
      : label === "perdendo"
      ? `Perdendo cerca de ${Math.abs(slopeKgPerWeek).toFixed(2)} kg/semana.`
      : label === "ganhando"
      ? `Ganhando cerca de ${Math.abs(slopeKgPerWeek).toFixed(2)} kg/semana.`
      : "Peso estável, sem variação significativa.";

  return { slopeKgPerWeek, label, description };
}

export type KpiStatus = "ahead" | "on_pace" | "caution" | "behind";

export type PeriodKpi = {
  period: Period;
  label: string;
  periodStart: string; // ISO date
  targetLossKg: number;
  baselineWeightKg: number | null;
  currentWeightKg: number | null;
  actualLossKg: number | null; // positivo = perdeu peso
  expectedWeightNowKg: number | null; // onde eu deveria estar hoje, seguindo a meta linearmente
  deltaVsExpectedKg: number | null; // atual - esperado (negativo = à frente da meta)
  progressToGoalPct: number | null; // actualLoss / targetLoss * 100
  status: KpiStatus;
  statusLabel: string;
};

/**
 * Resolve qual meta estava vigente no início de um período, usando o
 * histórico completo (goals_history). A função ordena internamente —
 * a ordem de entrada não importa.
 *
 * "Vigente" = o registro mais recente com created_at <= início do período.
 * Se não houver nenhum (conta criada depois do início do período, ou
 * histórico vazio), cai no registro mais antigo disponível como fallback —
 * nunca retorna null, porque toda conta tem ao menos 1 registro desde o
 * signup (trigger handle_goals_history_sync ou backfill da migração 0004).
 * Só retorna null se `history` estiver genuinamente vazio (não deveria
 * acontecer em produção, mas evita throw se acontecer).
 */
export function resolveGoalsForPeriod(
  history: GoalsHistoryEntry[],
  periodStartDate: Date
): GoalsHistoryEntry | null {
  if (history.length === 0) return null;

  const sorted = [...history].sort(
    (a, b) => parseISO(a.created_at).getTime() - parseISO(b.created_at).getTime()
  );

  // Último registro com created_at <= início do período.
  let candidate: GoalsHistoryEntry | null = null;
  for (const g of sorted) {
    if (parseISO(g.created_at).getTime() <= periodStartDate.getTime()) {
      candidate = g;
    } else {
      break;
    }
  }

  // Fallback: nenhum registro é anterior ao início do período (conta nova
  // no meio do período) — usa o mais antigo disponível em vez de null.
  return candidate ?? sorted[0];
}

/**
 * KPI central do app: compara o peso atual com o peso "esperado" caso o
 * usuário estivesse seguindo a meta do período de forma linear até hoje.
 * Isso responde diretamente "onde estou vs. onde deveria estar".
 *
 * Se não houver baseline confiável (nenhuma pesagem próxima ao início do
 * período), o KPI reporta status `caution` com "sem dados suficientes" em
 * vez de projetar a partir de referência velha.
 */
export function computePeriodKpi(
  entries: WeightEntry[],
  goalsHistory: GoalsHistoryEntry[],
  period: Period,
  now: Date = new Date(),
  mode: PeriodMode = "fixed",
  weekStartsOn: WeekStartsOn = "monday"
): PeriodKpi {
  const points = toPoints(entries);
  const start = periodStart(period, now, mode, weekStartsOn);
  const activeGoals = resolveGoalsForPeriod(goalsHistory, start);
  const targetLossKg = Number(activeGoals?.[GOAL_FIELD[period]] ?? 0);

  const baseline = baselineWeight(points, start, period);
  const latest = points.length ? points[points.length - 1] : null;
  const current = latest ? latest.weight : null;

  const lengthDays = periodLengthDays(period, mode);
  const elapsedDays = Math.max(0, differenceInCalendarDays(now, start));
  const fractionElapsed = Math.min(1, elapsedDays / lengthDays);

  let expectedWeightNow: number | null = null;
  let deltaVsExpected: number | null = null;
  let actualLoss: number | null = null;
  let progressPct: number | null = null;

  if (baseline !== null && current !== null) {
    expectedWeightNow = Number((baseline - targetLossKg * fractionElapsed).toFixed(2));
    deltaVsExpected = Number((current - expectedWeightNow).toFixed(2));
    actualLoss = Number((baseline - current).toFixed(2));
    progressPct = targetLossKg > 0 ? Number(((actualLoss / targetLossKg) * 100).toFixed(0)) : null;
  }

  let status: KpiStatus = "on_pace";
  let statusLabel = "No ritmo da meta";

  if (deltaVsExpected === null) {
    status = "caution";
    statusLabel =
      current === null
        ? "Sem pesagens registradas"
        : "Sem pesagem recente para servir de referência";
  } else if (deltaVsExpected <= -0.15) {
    status = "ahead";
    statusLabel = `${Math.abs(deltaVsExpected).toFixed(2)} kg à frente da meta`;
  } else if (deltaVsExpected <= 0.15) {
    status = "on_pace";
    statusLabel = "No ritmo da meta";
  } else if (deltaVsExpected <= 0.5) {
    status = "caution";
    statusLabel = `${deltaVsExpected.toFixed(2)} kg atrás da meta`;
  } else {
    status = "behind";
    statusLabel =
      actualLoss !== null && actualLoss < 0
        ? `Ganhou ${Math.abs(actualLoss).toFixed(2)} kg no período — ${deltaVsExpected.toFixed(2)} kg atrás da meta`
        : `${deltaVsExpected.toFixed(2)} kg atrás da meta`;
  }

  return {
    period,
    label: PERIOD_LABEL[period],
    periodStart: formatISO(start, { representation: "date" }),
    targetLossKg,
    baselineWeightKg: baseline,
    currentWeightKg: current,
    actualLossKg: actualLoss,
    expectedWeightNowKg: expectedWeightNow,
    deltaVsExpectedKg: deltaVsExpected,
    progressToGoalPct: progressPct,
    status,
    statusLabel,
  };
}

export function computeAllKpis(
  entries: WeightEntry[],
  goalsHistory: GoalsHistoryEntry[],
  now: Date = new Date(),
  mode: PeriodMode = "fixed",
  weekStartsOn: WeekStartsOn = "monday"
): PeriodKpi[] {
  return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
    computePeriodKpi(entries, goalsHistory, p, now, mode, weekStartsOn)
  );
}
