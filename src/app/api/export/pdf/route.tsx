import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { extractMetricPoints, computeAllKpis, computeTrend, METRIC_UNIT } from "@/lib/analytics";
import { ExportDocument } from "@/lib/pdf/ExportDocument";
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
// vem vazio) — 1 meta de peso sintética com os defaults de sempre
// (0.25/1/3/6), pra o PDF continuar mostrando algo coerente em vez de uma
// seção de metas vazia.
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

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

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
  const effectiveGoals: Goal[] = (activeGoals as Goal[])?.length
    ? (activeGoals as Goal[])
    : [{ ...FALLBACK_GOAL, user_id: user.id }];

  const goalsWithKpis = effectiveGoals.map((goal) => {
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
      METRIC_UNIT[goal.metric]
    );
    return { goal, kpis };
  });

  const trend = computeTrend(typedEntries);

  const buffer = await renderToBuffer(
    <ExportDocument
      displayName={profile?.display_name ?? "Usuário"}
      entries={typedEntries}
      goalsWithKpis={goalsWithKpis}
      trend={trend}
    />
  );

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="peso-em-progresso-${today}.pdf"`,
      "Cache-Control": "no-store, private",
    },
  });
}
