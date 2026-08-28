import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WeightEntry } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  import: "Importado",
};

function csvEscape(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
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
  const lines = [header.join(";")];

  for (const row of rows) {
    lines.push(
      [
        row.measured_at,
        Number(row.weight_kg).toFixed(1).replace(".", ","),
        csvEscape(row.note ?? ""),
        SOURCE_LABEL[row.source] ?? row.source,
      ].join(";")
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
