import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { computeAllKpis, computeTrend, computeGoalPrediction } from "@/lib/analytics";
import type { Period } from "@/lib/analytics";
import { ReportDocument } from "@/lib/pdf/ReportDocument";
import type { WeightEntry, Goals, GoalsHistoryEntry, PeriodMode, WeekStartsOn } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GOALS: Omit<Goals, "user_id" | "updated_at"> = {
  weekly_loss_kg: 0.25,
  monthly_loss_kg: 1,
  quarterly_loss_kg: 3,
  semester_loss_kg: 6,
  target_weight_kg: null,
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

  const [{ data: profile }, { data: entries, error: entriesError }, { data: goals }, { data: goalsHistory }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, period_mode, week_starts_on").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase.from("goals").select("target_weight_kg").eq("user_id", user.id).single(),
      supabase
        .from("goals_history")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  if (entriesError) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const typedEntries = (entries ?? []) as WeightEntry[];
  const typedGoalsHistory: GoalsHistoryEntry[] =
    (goalsHistory as GoalsHistoryEntry[])?.length
      ? (goalsHistory as GoalsHistoryEntry[])
      : [
          {
            id: "fallback",
            user_id: user.id,
            weekly_loss_kg: DEFAULT_GOALS.weekly_loss_kg,
            monthly_loss_kg: DEFAULT_GOALS.monthly_loss_kg,
            quarterly_loss_kg: DEFAULT_GOALS.quarterly_loss_kg,
            semester_loss_kg: DEFAULT_GOALS.semester_loss_kg,
            target_weight_kg: DEFAULT_GOALS.target_weight_kg,
            created_at: new Date(0).toISOString(),
          },
        ];
  const targetWeightKg = (goals?.target_weight_kg as number | null) ?? null;

  const kpis = computeAllKpis(
    typedEntries,
    typedGoalsHistory,
    new Date(),
    (profile?.period_mode as PeriodMode) ?? "fixed",
    (profile?.week_starts_on as WeekStartsOn) ?? "monday"
  );
  const kpi = kpis.find((k) => k.period === period)!;

  // Previsão só existe pra semana/mês (Fase 5.1) — mesma regra usada em
  // dashboard/page.tsx e reports/page.tsx, replicada aqui pro PDF.
  const prediction =
    period === "week" || period === "month"
      ? computeGoalPrediction(computeTrend(typedEntries), kpi, targetWeightKg)
      : undefined;

  // Gráfico simplificado só cobre as pesagens dentro do período selecionado
  // (kpi.periodStart até agora), coerente com o KPI mostrado acima.
  const periodEntries = typedEntries
    .filter((e) => e.measured_at >= kpi.periodStart)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));

  const buffer = await renderToBuffer(
    <ReportDocument
      displayName={profile?.display_name ?? "Usuário"}
      kpi={kpi}
      prediction={prediction}
      periodEntries={periodEntries}
      targetWeightKg={targetWeightKg}
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
