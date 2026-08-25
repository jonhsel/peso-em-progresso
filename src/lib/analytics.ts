import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  differenceInCalendarDays,
  parseISO,
  formatISO,
} from "date-fns";
import type { WeightEntry, Goals } from "@/types/database";

export type Period = "week" | "month" | "quarter" | "semester";

const PERIOD_LABEL: Record<Period, string> = {
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
  semester: "Semestre",
};

const GOAL_FIELD: Record<Period, keyof Goals> = {
  week: "weekly_loss_kg",
  month: "monthly_loss_kg",
  quarter: "quarterly_loss_kg",
  semester: "semester_loss_kg",
};

/** Início do período que contém `reference`. Semana começa na segunda-feira. */
export function periodStart(period: Period, reference: Date): Date {
  switch (period) {
    case "week":
      return startOfWeek(reference, { weekStartsOn: 1 });
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

/** Duração aproximada do período em dias, usada para calcular a fração já decorrida. */
function periodLengthDays(period: Period): number {
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
 * Pega o peso "base" de um período: a última pesagem registrada
 * ANTES ou NO início do período. Se não houver, usa a primeira pesagem
 * disponível dentro do período (fallback para usuários novos).
 */
function baselineWeight(points: EntryPoint[], start: Date): number | null {
  let best: EntryPoint | null = null;
  for (const p of points) {
    if (p.date.getTime() <= start.getTime()) {
      if (!best || p.date.getTime() > best.date.getTime()) best = p;
    }
  }
  if (best) return best.weight;

  const firstInOrAfter = points.find((p) => p.date.getTime() >= start.getTime());
  return firstInOrAfter ? firstInOrAfter.weight : null;
}

export type TrendResult = {
  slopeKgPerWeek: number;
  label: "perdendo_rapido" | "perdendo" | "estavel" | "ganhando";
  description: string;
};

/**
 * Tendência via regressão linear simples sobre as últimas `windowDays`.
 * O coeficiente angular (kg/dia) é convertido para kg/semana, que é a
 * unidade mais intuitiva para acompanhamento de peso corporal.
 */
export function computeTrend(entries: WeightEntry[], windowDays = 21): TrendResult {
  const points = toPoints(entries);
  if (points.length < 2) {
    return { slopeKgPerWeek: 0, label: "estavel", description: "Dados insuficientes para calcular tendência." };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = points.filter((p) => p.date >= cutoff);
  const sample = recent.length >= 2 ? recent : points.slice(-Math.max(2, Math.min(points.length, 6)));

  const t0 = sample[0].date.getTime();
  const xs = sample.map((p) => (p.date.getTime() - t0) / 86_400_000); // dias
  const ys = sample.map((p) => p.weight);
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
 * KPI central do app: compara o peso atual com o peso "esperado" caso o
 * usuário estivesse seguindo a meta do período de forma linear até hoje.
 * Isso responde diretamente "onde estou vs. onde deveria estar".
 */
export function computePeriodKpi(
  entries: WeightEntry[],
  goals: Goals,
  period: Period,
  now: Date = new Date()
): PeriodKpi {
  const points = toPoints(entries);
  const start = periodStart(period, now);
  const targetLossKg = Number(goals[GOAL_FIELD[period]] ?? 0);

  const baseline = baselineWeight(points, start);
  const latest = points.length ? points[points.length - 1] : null;
  const current = latest ? latest.weight : null;

  const lengthDays = periodLengthDays(period);
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
    statusLabel = "Sem dados suficientes";
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

export function computeAllKpis(entries: WeightEntry[], goals: Goals, now: Date = new Date()): PeriodKpi[] {
  return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
    computePeriodKpi(entries, goals, p, now)
  );
}
