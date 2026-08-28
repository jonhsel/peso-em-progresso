import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { computeAllKpis, computeTrend } from "@/lib/analytics";
import { ExportDocument } from "@/lib/pdf/ExportDocument";
import type { WeightEntry, Goals } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GOALS: Omit<Goals, "user_id" | "updated_at"> = {
  weekly_loss_kg: 0.25,
  monthly_loss_kg: 1,
  quarterly_loss_kg: 3,
  semester_loss_kg: 6,
  target_weight_kg: null,
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [{ data: profile }, { data: entries, error: entriesError }, { data: goals }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase.from("goals").select("*").eq("user_id", user.id).single(),
    ]);

  if (entriesError) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const typedEntries = (entries ?? []) as WeightEntry[];
  const typedGoals: Goals = goals
    ? (goals as Goals)
    : { user_id: user.id, updated_at: "", ...DEFAULT_GOALS };

  const kpis = computeAllKpis(typedEntries, typedGoals);
  const trend = computeTrend(typedEntries);

  const buffer = await renderToBuffer(
    <ExportDocument
      displayName={profile?.display_name ?? "Usuário"}
      entries={typedEntries}
      kpis={kpis}
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
