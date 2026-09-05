import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadCoachClientData } from "@/lib/loadCoachClientData";
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import {
  extractMetricPoints,
  computeAllKpis,
  computeTrend,
  computeGoalPrediction,
  METRIC_UNIT,
  METRIC_LABEL,
  type PeriodKpi,
} from "@/lib/analytics";
import type { GoalPredictions } from "@/components/GoalTabs";
import NavBar from "@/components/NavBar";
import PlanGate from "@/components/PlanGate";
import GoalTabs from "@/components/GoalTabs";
import TrendBadge from "@/components/TrendBadge";
import WeightChart, { type WeightGoalKpi } from "@/components/WeightChart";
import BodyMeasurementsList from "@/components/BodyMeasurementsList";
import PhotoComparisonView from "@/components/photos/PhotoComparisonView";
import PhotoHistoryGrid from "@/components/photos/PhotoHistoryGrid";
import type { ProgressPhoto } from "@/types/database";

export default async function CoachClientPage({
  params,
}: {
  params: { ownerId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clientData = await loadCoachClientData(params.ownerId, user.id);
  if (!clientData) redirect("/dashboard/coach");

  const { profile, entries, measurements, activeGoals, goalsHistory } = clientData;

  // Nome do coach (o próprio usuário logado) pro NavBar — não o do cliente
  // que está sendo visualizado. loadUserData() já carrega o profile do
  // usuário autenticado, mesmo padrão usado no resto do app.
  const { profile: coachProfile } = await loadUserData();
  const theme = await getTheme();

  // Mesma lógica de dashboard/page.tsx: KPIs e previsões por meta ativa,
  // reaproveitando os componentes já somente-leitura por natureza
  // (KpiCard/WeightChart/GoalTabs não têm nenhum side effect).
  const kpisByGoal: Record<string, PeriodKpi[]> = Object.fromEntries(
    activeGoals.map((goal) => {
      const points = extractMetricPoints(goal.metric, entries, measurements);
      const history = goalsHistory.filter((h) => h.goal_id === goal.id);
      return [
        goal.id,
        computeAllKpis(points, history, new Date(), profile.period_mode, profile.week_starts_on, METRIC_UNIT[goal.metric]),
      ];
    })
  );

  const trend = computeTrend(entries);
  const predictionsByGoal: Record<string, GoalPredictions> = {};
  for (const goal of activeGoals) {
    if (goal.metric !== "weight") continue;
    const kpis = kpisByGoal[goal.id] ?? [];
    const weekKpi = kpis.find((k) => k.period === "week");
    const monthKpi = kpis.find((k) => k.period === "month");
    predictionsByGoal[goal.id] = {
      week: weekKpi ? computeGoalPrediction(trend, weekKpi, goal.target_value) : undefined,
      month: monthKpi ? computeGoalPrediction(trend, monthKpi, goal.target_value) : undefined,
    };
  }

  const weightGoals = activeGoals.filter((g) => g.metric === "weight");
  const weightGoalKpis: WeightGoalKpi[] = weightGoals.map((goal) => ({
    goal,
    weekKpi: kpisByGoal[goal.id]?.find((k) => k.period === "week") ?? null,
  }));

  // Fotos — mesma lógica de photos/page.tsx, com o peso do dia em overlay.
  const { data: photoRows } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", params.ownerId)
    .order("photo_date", { ascending: false });

  const rows = (photoRows as ProgressPhoto[]) ?? [];
  const weightByDate = new Map(entries.map((e) => [e.measured_at, e.weight_kg]));
  let photos: { photo_date: string; storage_path: string; url: string; weight_kg: number | null }[] = [];
  if (rows.length > 0) {
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(
        rows.map((p) => p.storage_path),
        3600
      );
    photos = rows.map((p, i) => ({
      photo_date: p.photo_date,
      storage_path: p.storage_path,
      url: signed?.[i]?.signedUrl ?? "",
      weight_kg: weightByDate.get(p.photo_date) ?? null,
    }));
  }

  return (
    <div>
      <NavBar displayName={coachProfile.display_name} theme={theme} plan={coachProfile.plan} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Gate é sobre o plano do COACH (quem está vendo esta página), não
            do dono dos dados — o dono pode ser free, o coach sempre vê tudo
            do cliente sem gate interno (WeightChart recebe plan=undefined
            abaixo, nunca coachProfile.plan). Se a feature de Coach inteira
            virar Pro, é aqui que a proteção mora. */}
        <PlanGate plan={coachProfile.plan} featureName="Coach">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Link href="/dashboard/coach" className="text-sm text-ink-muted hover:text-ink transition">
                ← Voltar
              </Link>
              <h1 className="font-display font-bold text-xl">{profile.display_name}</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <WeightChart entries={entries} weightGoals={weightGoalKpis} />
              </div>
              <TrendBadge trend={trend} />
            </div>

            <GoalTabs goals={activeGoals} kpisByGoal={kpisByGoal} predictionsByGoal={predictionsByGoal} />

            <section>
              <h2 className="font-display font-bold text-lg mb-3">Medidas corporais</h2>
              <BodyMeasurementsList measurements={measurements} readOnly />
            </section>

            <section>
              <h2 className="font-display font-bold text-lg mb-3">Fotos de progresso</h2>
              <div className="space-y-4">
                <PhotoComparisonView photos={photos} />
                <PhotoHistoryGrid userId={params.ownerId} photos={photos} readOnly />
              </div>
            </section>

            <section>
              <h2 className="font-display font-bold text-lg mb-3">Metas ativas</h2>
              {activeGoals.length === 0 ? (
                <p className="text-sm text-ink-faint">Nenhuma meta ativa.</p>
              ) : (
                <ul className="bg-base-surface border border-base-border rounded-card divide-y divide-base-border">
                  {activeGoals.map((goal) => (
                    <li key={goal.id} className="px-4 py-3">
                      <span className="text-sm text-ink">
                        {METRIC_LABEL[goal.metric]}
                        {goal.label ? ` — ${goal.label}` : ""}
                      </span>
                      <span className="block text-xs text-ink-faint font-mono mt-0.5">
                        {goal.weekly_rate} {METRIC_UNIT[goal.metric]}/semana
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </PlanGate>
      </main>
    </div>
  );
}
