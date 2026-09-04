"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BodyMeasurement } from "@/types/database";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "arm_cm", label: "Braço", unit: "cm" },
  { key: "body_fat_pct", label: "% gordura", unit: "%" },
];

export default function BodyMeasurementsList({
  measurements,
  readOnly = false,
}: {
  measurements: BodyMeasurement[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...measurements].sort((a, b) => b.measured_at.localeCompare(a.measured_at));

  async function handleDelete(m: BodyMeasurement) {
    const dateLabel = format(parseISO(m.measured_at), "dd 'de' MMMM, yyyy", { locale: ptBR });
    const ok = window.confirm(`Excluir as medidas de ${dateLabel}?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;

    setError(null);
    setDeletingId(m.id);

    const { error: supaError } = await supabase.from("body_measurements").delete().eq("id", m.id);

    setDeletingId(null);
    if (supaError) {
      setError("Não foi possível excluir. Tente novamente.");
      return;
    }
    router.refresh();
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-6 text-center text-sm text-ink-faint">
        Nenhuma medida registrada ainda.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-signal-behind bg-base-surface border border-signal-behind/40 rounded-card px-4 py-2">
          {error}
        </p>
      )}
      <div className="bg-base-surface border border-base-border rounded-card divide-y divide-base-border">
        {sorted.map((m, i) => {
          const isDeleting = deletingId === m.id;
          // Diff contra o registro anterior (mais antigo na lista) que também
          // tenha esse campo preenchido — sem cor semântica (ver decisão #4 no
          // topo do spec: "menor" nem sempre é "melhor" dependendo do campo).
          const prevWithField = (key: FieldKey) => sorted.slice(i + 1).find((p) => p[key] !== null) ?? null;

          return (
            <div key={m.id} className="flex items-start justify-between px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-faint mb-1.5">
                  {format(parseISO(m.measured_at), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                  {m.note ? ` · ${m.note}` : ""}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {FIELDS.map(({ key, label, unit }) => {
                    const value = m[key];
                    if (value === null) return null;
                    const prev = prevWithField(key);
                    const diff = prev ? Number(value) - Number(prev[key]) : null;
                    return (
                      <div key={key} className="text-sm font-mono">
                        <span className="text-ink-faint text-xs mr-1">{label}</span>
                        {Number(value).toFixed(1)}
                        {unit}
                        {diff !== null && diff !== 0 && (
                          <span className="text-xs ml-1 text-ink-faint">
                            ({diff > 0 ? "+" : ""}
                            {diff.toFixed(1)})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {!readOnly && (
                <button
                  onClick={() => handleDelete(m)}
                  disabled={isDeleting}
                  className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50 disabled:cursor-wait shrink-0"
                  aria-label="Excluir medidas"
                >
                  {isDeleting ? "Excluindo…" : "Excluir"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
