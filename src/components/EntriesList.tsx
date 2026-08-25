"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry } from "@/types/database";

export default function EntriesList({ entries }: { entries: WeightEntry[] }) {
  const router = useRouter();
  const supabase = createClient();

  const sorted = [...entries].sort((a, b) => b.measured_at.localeCompare(a.measured_at));

  async function handleDelete(id: string) {
    const { error } = await supabase.from("weight_entries").delete().eq("id", id);
    if (!error) router.refresh();
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-6 text-center text-sm text-ink-faint">
        Nenhuma pesagem registrada ainda.
      </div>
    );
  }

  return (
    <div className="bg-base-surface border border-base-border rounded-card divide-y divide-base-border">
      {sorted.map((entry, i) => {
        const prev = sorted[i + 1];
        const diff = prev ? Number(entry.weight_kg) - Number(prev.weight_kg) : null;
        return (
          <div key={entry.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-mono">{Number(entry.weight_kg).toFixed(1)} kg</p>
              <p className="text-xs text-ink-faint">
                {format(parseISO(entry.measured_at), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                {entry.note ? ` · ${entry.note}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {diff !== null && (
                <span
                  className={`text-xs font-mono ${
                    diff < 0 ? "text-signal-ahead" : diff > 0 ? "text-signal-behind" : "text-ink-faint"
                  }`}
                >
                  {diff === 0 ? "=" : diff < 0 ? diff.toFixed(1) : `+${diff.toFixed(1)}`}
                </span>
              )}
              <button
                onClick={() => handleDelete(entry.id)}
                className="text-xs text-ink-faint hover:text-signal-behind transition"
                aria-label="Excluir pesagem"
              >
                Excluir
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
