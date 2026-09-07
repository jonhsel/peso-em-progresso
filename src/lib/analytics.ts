import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  differenceInCalendarDays,
  parseISO,
  formatISO,
  subDays,
} from "date-fns";
import type {
  WeightEntry,
  GoalsHistoryEntry,
  PeriodMode,
  WeekStartsOn,
  GoalMetric,
  BodyMeasurement,
  Goal,
  Profile,
} from "@/types/database";

export type Period = "week" | "month" | "quarter" | "semester";

const PERIOD_LABEL: Record<Period, string> = {
  week: "Semana",
  month: "Mês",
  quarter: "Trimestre",
  semester: "Semestre",
};

// Campos de ritmo de meta que existem tanto em Goal quanto em GoalsHistoryEntry.
type GoalFieldKey = "weekly_rate" | "monthly_rate" | "quarterly_rate" | "semester_rate";

const GOAL_FIELD: Record<Period, GoalFieldKey> = {
  week: "weekly_rate",
  month: "monthly_rate",
  quarter: "quarterly_rate",
  semester: "semester_rate",
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
 * Contexto de período: agrupa os 3 parâmetros que juntos determinam onde
 * cada um dos 4 períodos (semana/mês/trimestre/semestre) começa. Introduzido
 * na Fase 8.x (marco de período customizado) para não colidir params
 * posicionais a cada novo modo — extensões futuras de contexto de período
 * entram aqui, não como mais um parâmetro solto.
 */
export type PeriodContext = {
  mode: PeriodMode;
  weekStartsOn: WeekStartsOn;
  anchorDate: Date | null;
};

export const DEFAULT_PERIOD_CONTEXT: PeriodContext = {
  mode: "fixed",
  weekStartsOn: "monday",
  anchorDate: null,
};

export function buildPeriodContext(
  profile: Pick<Profile, "period_mode" | "week_starts_on" | "period_anchor_date">
): PeriodContext {
  return {
    mode: profile.period_mode,
    weekStartsOn: profile.week_starts_on,
    anchorDate: profile.period_anchor_date ? parseISO(profile.period_anchor_date) : null,
  };
}

/**
 * Início do período que contém `reference`.
 * mode "fixed" (default): período civil — semana a partir de `weekStartsOn`,
 * mês/trimestre/semestre civis.
 * mode "rolling": N dias corridos atrás de hoje (7/30/90/180) — ignora
 * `weekStartsOn`, que só se aplica ao modo fixed.
 * mode "anchored": todos os 4 períodos retornam a mesma data fixa
 * (`ctx.anchorDate`) — os KPIs recontam a partir do marco escolhido pelo
 * usuário, não a partir de hoje nem de um período civil.
 */
export function periodStart(
  period: Period,
  reference: Date,
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT
): Date {
  if (ctx.mode === "anchored") {
    if (!ctx.anchorDate) {
      throw new Error(
        "periodStart: mode 'anchored' requer anchorDate. Profile inconsistente " +
          "(period_mode='anchored' sem period_anchor_date)."
      );
    }
    return ctx.anchorDate;
  }

  if (ctx.mode === "rolling") {
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
      return startOfWeek(reference, { weekStartsOn: ctx.weekStartsOn === "sunday" ? 0 : 1 });
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
 * mode "rolling"/"anchored": valor exato (7/30/90/180) — o modo `anchored`
 * só muda ONDE o período começa (o marco, não hoje nem um calendário
 * civil), não o comprimento de cada período: uma "semana desde o marco"
 * continua sendo 7 dias, um "trimestre desde o marco" continua sendo 90
 * dias, igual ao `rolling`. (Corrigido em 07/09/2026 — a versão anterior
 * usava `differenceInCalendarDays(now, anchorDate)`, o que fazia
 * `fractionElapsed` ser sempre 1.0 e todo card mostrar a meta integral do
 * período como "esperado", em vez de proporcional ao tempo decorrido. Ver
 * `patch_periodLengthDays_anchored.md`.)
 */
function periodLengthDays(
  period: Period,
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT
): number {
  if (ctx.mode === "anchored" || ctx.mode === "rolling") {
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

// Campo de body_measurements correspondente a cada métrica não-peso.
const MEASUREMENT_FIELD: Record<Exclude<GoalMetric, "weight">, keyof BodyMeasurement> = {
  waist: "waist_cm",
  hip: "hip_cm",
  arm: "arm_cm",
  body_fat: "body_fat_pct",
};

/**
 * Extrai a série temporal (EntryPoint[]) correspondente à métrica de uma
 * meta — peso vem de weight_entries, as demais (cintura/quadril/braço/
 * %gordura) vêm de body_measurements, filtrando só os registros em que
 * aquele campo específico foi preenchido (mesmo critério por-campo já
 * usado em BodyMeasurementsList/BodyMeasurementsSummaryCard).
 * `computePeriodKpi`/`computeAllKpis` recebem o resultado desta função,
 * nunca `entries`/`measurements` diretamente — mantém a generalização num
 * único lugar.
 */
export function extractMetricPoints(
  metric: GoalMetric,
  weightEntries: WeightEntry[],
  measurements: BodyMeasurement[]
): EntryPoint[] {
  if (metric === "weight") return toPoints(weightEntries);
  const key = MEASUREMENT_FIELD[metric];
  return measurements
    .filter((m) => m[key] != null)
    .map((m) => ({ date: parseISO(m.measured_at), weight: Number(m[key]) }))
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
  totalChangeKg: number;
  dataPointsCount: number;
  r2: number;
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
      totalChangeKg: 0,
      dataPointsCount: points.length,
      r2: 0,
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
      totalChangeKg: 0,
      dataPointsCount: recent.length,
      r2: 0,
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

  // Intercepto da reta ajustada (necessário só pro r2 aqui; computeTrendLine
  // recalcula o seu próprio par de pontos a partir de slopeKgPerWeek).
  const meanX = sumX / n;
  const meanY = sumY / n;
  const intercept = meanY - slopePerDay * meanX;

  // R² — quão bem a reta explica a variação real dos pontos. 1 = ajuste
  // perfeito, 0 = a reta não explica nada (peso oscilando sem padrão linear
  // claro dentro da janela).
  const ssTot = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssRes = xs.reduce((acc, x, i) => {
    const predicted = intercept + slopePerDay * x;
    return acc + (ys[i] - predicted) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const totalChangeKg = Number((ys[n - 1] - ys[0]).toFixed(2));

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

  return {
    slopeKgPerWeek,
    label,
    description,
    totalChangeKg,
    dataPointsCount: n,
    r2: Number(r2.toFixed(3)),
  };
}

export type TrendLine = {
  start: { date: string; weightKg: number };
  end: { date: string; weightKg: number };
};

/**
 * Retorna os 2 pontos (início/fim da janela de `windowDays`) da reta de
 * regressão usada por `computeTrend`, para desenhar a "linha de tendência"
 * no gráfico de previsão. Não extrapola além do fim da janela — isso é
 * papel da linha de projeção (`GoalPrediction`), que já existe e cobre o
 * caso com meta + tendência de perda.
 * Retorna `null` nos mesmos casos em que `computeTrend` retorna
 * `insufficient_data` (sem pontos suficientes pra traçar uma reta).
 */
export function computeTrendLine(entries: WeightEntry[], windowDays = 21): TrendLine | null {
  const points = toPoints(entries);
  if (points.length < 2) return null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = points.filter((p) => p.date >= cutoff);
  if (recent.length < 2) return null;

  const t0 = recent[0].date.getTime();
  const xs = recent.map((p) => (p.date.getTime() - t0) / 86_400_000);
  const ys = recent.map((p) => p.weight);
  const n = xs.length;

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slopePerDay = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const meanX = sumX / n;
  const meanY = sumY / n;
  const intercept = meanY - slopePerDay * meanX;

  const firstX = xs[0];
  const lastX = xs[n - 1];

  return {
    start: {
      date: formatISO(recent[0].date, { representation: "date" }),
      weightKg: Number((intercept + slopePerDay * firstX).toFixed(2)),
    },
    end: {
      date: formatISO(recent[n - 1].date, { representation: "date" }),
      weightKg: Number((intercept + slopePerDay * lastX).toFixed(2)),
    },
  };
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
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  period: Period,
  now: Date = new Date(),
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
  unit: string = "kg"
): PeriodKpi {
  const start = periodStart(period, now, ctx);
  const activeGoals = resolveGoalsForPeriod(goalsHistory, start);
  const targetLossKg = Number(activeGoals?.[GOAL_FIELD[period]] ?? 0);

  const baseline = baselineWeight(points, start, period);
  const latest = points.length ? points[points.length - 1] : null;
  const current = latest ? latest.weight : null;

  const lengthDays = periodLengthDays(period, ctx);
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
        ? "Sem registros"
        : "Sem registro recente para servir de referência";
  } else if (deltaVsExpected <= -0.15) {
    status = "ahead";
    statusLabel = `${Math.abs(deltaVsExpected).toFixed(2)} ${unit} à frente da meta`;
  } else if (deltaVsExpected <= 0.15) {
    status = "on_pace";
    statusLabel = "No ritmo da meta";
  } else if (deltaVsExpected <= 0.5) {
    status = "caution";
    statusLabel = `${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`;
  } else {
    status = "behind";
    statusLabel =
      actualLoss !== null && actualLoss < 0
        ? `Ganhou ${Math.abs(actualLoss).toFixed(2)} ${unit} no período — ${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`
        : `${deltaVsExpected.toFixed(2)} ${unit} atrás da meta`;
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
  points: EntryPoint[],
  goalsHistory: GoalsHistoryEntry[],
  now: Date = new Date(),
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
  unit: string = "kg"
): PeriodKpi[] {
  return (["week", "month", "quarter", "semester"] as Period[]).map((p) =>
    computePeriodKpi(points, goalsHistory, p, now, ctx, unit)
  );
}

/**
 * Previsão de data estimada para bater a meta (Fase 5.1).
 * - Com `targetValue` definido: projeta a chegada no valor alvo, igual
 *   para os cards de semana e mês (mesmo cálculo, independe do período).
 * - Sem `targetValue`: projeta quando a meta de perda *daquele período*
 *   (targetLossKg do PeriodKpi recebido) será atingida no ritmo atual.
 * Não faz nenhum acesso a `entries`/`baselineWeight`/`periodStart` — recebe
 * o `PeriodKpi` já calculado por `computePeriodKpi`, que já traz tudo que é
 * preciso (currentWeightKg, actualLossKg, targetLossKg).
 */
function formatISODate(d: Date): string {
  return formatISO(d, { representation: "date" });
}

export type GoalPrediction =
  | { kind: "insufficient_data" }
  | { kind: "wrong_direction" }
  | { kind: "already_reached"; withTarget: boolean }
  | { kind: "projected"; estimatedDate: string; daysFromNow: number };

export function computeGoalPrediction(
  trend: TrendResult,
  kpi: PeriodKpi,
  targetValue: number | null
): GoalPrediction {
  // 1. Dados insuficientes para tendência
  if (trend.label === "insufficient_data") {
    return { kind: "insufficient_data" };
  }

  // 2. Tendência não é de perda (estável ou ganhando)
  const isLosing = trend.label === "perdendo" || trend.label === "perdendo_rapido";
  if (!isLosing) {
    return { kind: "wrong_direction" };
  }

  // 3. Taxa de perda por semana (positiva, em kg)
  //    slopeKgPerWeek é NEGATIVO quando perdendo → Math.abs
  const lossPerWeek = Math.abs(trend.slopeKgPerWeek);

  // 4. Peso atual (do KPI já calculado)
  const currentWeight = kpi.currentWeightKg;
  if (currentWeight === null) {
    return { kind: "insufficient_data" };
  }

  // 5. Modo com target_value
  if (targetValue !== null) {
    if (currentWeight <= targetValue) {
      return { kind: "already_reached", withTarget: true };
    }
    const kgToLose = currentWeight - targetValue;
    const weeksToTarget = kgToLose / lossPerWeek;
    const daysFromNow = Math.round(weeksToTarget * 7);
    const estimated = new Date();
    estimated.setDate(estimated.getDate() + daysFromNow);
    return {
      kind: "projected",
      estimatedDate: formatISODate(estimated),
      daysFromNow,
    };
  }

  // 6. Modo sem target — projetar quando a meta de perda do período será batida
  const actualLoss = kpi.actualLossKg; // positivo = perdeu peso
  const targetLoss = kpi.targetLossKg; // meta de perda do período (sempre positivo)

  if (actualLoss !== null && actualLoss >= targetLoss && targetLoss > 0) {
    return { kind: "already_reached", withTarget: false };
  }

  if (targetLoss <= 0) {
    // Sem meta de perda configurada para este período — não dá pra projetar
    return { kind: "insufficient_data" };
  }

  const remaining = targetLoss - (actualLoss ?? 0);
  if (remaining <= 0) {
    return { kind: "already_reached", withTarget: false };
  }

  const weeksToGoal = remaining / lossPerWeek;
  const daysFromNow = Math.round(weeksToGoal * 7);
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + daysFromNow);
  return {
    kind: "projected",
    estimatedDate: formatISODate(estimated),
    daysFromNow,
  };
}

export type MovingAveragePoint = {
  date: string; // measured_at ISO (YYYY-MM-DD), mesma chave usada por WeightChart
  average: number;
};

/**
 * Média móvel das últimas `windowSize` pesagens (por contagem, não por janela
 * de dias corridos — ver decisão 1 do spec Fase 5.2).
 * Janela expansiva no início: os primeiros pontos usam menos de `windowSize`
 * pesagens (1, depois 2, etc.) até acumular o suficiente. Não decide sozinha
 * se deve ser exibida — isso é responsabilidade do chamador (WeightChart),
 * que aplica o critério de "pelo menos 7 dias corridos de histórico".
 */
export function computeMovingAverage(
  entries: WeightEntry[],
  windowSize = 7
): MovingAveragePoint[] {
  const points = toPoints(entries);
  return points.map((p, i) => {
    const windowPoints = points.slice(Math.max(0, i - windowSize + 1), i + 1);
    const sum = windowPoints.reduce((acc, wp) => acc + wp.weight, 0);
    const average = Number((sum / windowPoints.length).toFixed(2));
    return { date: formatISO(p.date, { representation: "date" }), average };
  });
}

// --- Fase 6.2 — múltiplas metas simultâneas: helpers de métrica ---

export const METRIC_UNIT: Record<GoalMetric, string> = {
  weight: "kg",
  waist: "cm",
  hip: "cm",
  arm: "cm",
  body_fat: "p.p.",
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  weight: "Peso",
  waist: "Cintura",
  hip: "Quadril",
  arm: "Braço",
  body_fat: "% Gordura",
};

/**
 * Meta de peso "primária" entre as metas ativas — a mais antiga
 * (`created_at` mais baixo) entre as de métrica "weight". É a que alimenta
 * WeightChart (linha "esperado"/meta), KpiWeeklyTeaser e as conquistas
 * (evaluateAchievements), que continuam peso-only (fora de escopo desta
 * sub-fase generalizar isso). Retorna null se não houver nenhuma meta de
 * peso ativa.
 */
export function getPrimaryWeightGoal(activeGoals: Goal[]): Goal | null {
  return (
    activeGoals
      .filter((g) => g.metric === "weight")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
  );
}
