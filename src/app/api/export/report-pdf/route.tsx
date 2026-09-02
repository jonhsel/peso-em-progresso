import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  getPrimaryWeightGoal,
  METRIC_UNIT,
} from "@/lib/analytics";
import type { Period } from "@/lib/analytics";
import { ReportDocument } from "@/lib/pdf/ReportDocument";
import type {
  WeightEntry,
  Goal,
  GoalsHistoryEntry,
  BodyMeasurement,
  PeriodMode,
  WeekStartsOn,
} from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fallback só pro caso de a migração 0009 ainda não ter rodado (activeGoals
// vem vazio) — mesma meta de peso sintética usada em api/export/pdf/route.tsx.
const FALLBACK_GOAL: Goal = {
  id: "fallback",
  user_id: "",
  metric: "weight",
  label: null,
  weekly_rate: 0.25,
  monthly_rate: 1,
  quarterly_rate: 3,
  semester_rate: 6,
  target_value: null,
  is_active: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

const VALID_PERIODS: Period[] = ["week", "month", "quarter", "semester"];

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const requestedPeriod = request.nextUrl.searchParams.get("period");
  const period: Period = VALID_PERIODS.includes(requestedPeriod as Period)
    ? (requestedPeriod as Period)
    : "week";
  const requestedGoalId = request.nextUrl.searchParams.get("goalId");

  const [
    { data: profile },
    { data: entries, error: entriesError },
    { data: activeGoals },
    { data: goalsHistory },
    { data: measurements },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, period_mode, week_starts_on").eq("id", user.id).single(),
    supabase
      .from("weight_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: true }),
    supabase.from("goals").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at"),
    supabase
      .from("goals_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("body_measurements")
      .select("*")
      .eq("user_id", user.id)
      .order("measured_at", { ascending: true }),
  ]);

  if (entriesError) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const typedEntries = (entries ?? []) as WeightEntry[];
  const typedMeasurements = (measurements ?? []) as BodyMeasurement[];
  const typedGoalsHistory = (goalsHistory ?? []) as GoalsHistoryEntry[];
  const effectiveGoals: Goal[] = (activeGoals as Goal[])?.length ? (activeGoals as Goal[]) : [{ ...FALLBACK_GOAL, user_id: user.id }];

  // Meta selecionada: a pedida via ?goalId se ela existir entre as ativas
  // do usuário; senão a meta de peso primária; senão a 1ª meta ativa —
  // nunca undefined, já que effectiveGoals nunca é vazio.
  const goal =
    effectiveGoals.find((g) => g.id === requestedGoalId) ??
    getPrimaryWeightGoal(effectiveGoals) ??
    effectiveGoals[0];

  const unit = METRIC_UNIT[goal.metric];
  const points = extractMetricPoints(goal.metric, typedEntries, typedMeasurements);
  const history = typedGoalsHistory.filter((h) => h.goal_id === goal.id);
  const historyForGoal = history.length
    ? history
    : [
        {
          id: `fallback-${goal.id}`,
          goal_id: goal.id,
          user_id: user.id,
          metric: goal.metric,
          weekly_rate: goal.weekly_rate,
          monthly_rate: goal.monthly_rate,
          quarterly_rate: goal.quarterly_rate,
          semester_rate: goal.semester_rate,
          target_value: goal.target_value,
          created_at: new Date(0).toISOString(),
        },
      ];

  const kpis = computeAllKpis(
    points,
    historyForGoal,
    new Date(),
    (profile?.period_mode as PeriodMode) ?? "fixed",
    (profile?.week_starts_on as WeekStartsOn) ?? "monday",
    unit
  );
  const kpi = kpis.find((k) => k.period === period)!;

  // Previsão só existe pra semana/mês (Fase 5.1) e só pra metas de peso —
  // computeTrend é exclusivo de weight_entries (fora de escopo generalizar
  // nesta sub-fase, ver decisão técnica da Fase 6.2). Mesma regra usada em
  // dashboard/page.tsx e reports/page.tsx, replicada aqui pro PDF.
  const prediction =
    goal.metric === "weight" && (period === "week" || period === "month")
      ? computeGoalPrediction(computeTrend(typedEntries), kpi, goal.target_value)
      : undefined;

  // Gráfico simplificado só cobre os pontos da métrica da meta dentro do
  // período selecionado (kpi.periodStart até agora), coerente com o KPI
  // mostrado acima.
  const periodStartDate = parseISO(kpi.periodStart);
  const chartPoints = points
    .filter((p) => differenceInCalendarDays(p.date, periodStartDate) >= 0)
    .map((p) => ({ label: format(p.date, "dd/MM", { locale: ptBR }), weight: p.weight }));

  const buffer = await renderToBuffer(
    <ReportDocument
      displayName={profile?.display_name ?? "Usuário"}
      kpi={kpi}
      prediction={prediction}
      chartPoints={chartPoints}
      targetValue={goal.target_value}
      unit={unit}
    />
  );

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${period}-${today}.pdf"`,
      "Cache-Control": "no-store, private",
    },
  });
}
