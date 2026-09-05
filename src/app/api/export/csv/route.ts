import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WeightEntry } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  import: "Importado",
};

/**
 * Envolve o valor em aspas duplas (RFC4180). Aspas internas são escapadas
 * dobrando-as ("" dentro de "..."). Aplicado a todo campo, sem exceção —
 * sem isso, apps de planilha que dividem por `,` além de `;` partem um peso
 * como "111,0" ou uma nota com vírgula embutida em colunas extras, corrompendo
 * o arquivo (bug real visto em teste de produção).
 */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Gate de plano (Fase 7) — exportação é feature Pro. Checagem independente
  // da UI (PlanGate/botões escondidos no client), essa é a proteção real.
  const { data: planCheck } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (planCheck?.plan !== "pro") {
    return NextResponse.json({ error: "Exportação disponível no plano Pro" }, { status: 403 });
  }

  const { data: entries, error } = await supabase
    .from("weight_entries")
    .select("measured_at, weight_kg, note, source")
    .eq("user_id", user.id)
    .order("measured_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const rows = (entries ?? []) as Pick<
    WeightEntry,
    "measured_at" | "weight_kg" | "note" | "source"
  >[];

  const header = ["Data", "Peso (kg)", "Nota", "Origem"];
  const lines = [header.map(csvField).join(";")];

  for (const row of rows) {
    lines.push(
      [
        row.measured_at,
        Number(row.weight_kg).toFixed(1).replace(".", ","),
        row.note ?? "",
        SOURCE_LABEL[row.source] ?? row.source,
      ]
        .map(csvField)
        .join(";")
    );
  }

  // BOM UTF-8 — sem isso o Excel abre "Não é possível localizar" ou quebra acentos.
  const csv = "﻿" + lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="peso-em-progresso-${today}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
