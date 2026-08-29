"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { GoalsHistoryEntry } from "@/types/database";

export default function GoalsHistoryList({ history }: { history: GoalsHistoryEntry[] }) {
  // history vem ordenado decrescente (created_at DESC) de loadUserData().
  // A entrada mais recente é a meta ATIVA (já mostrada no formulário acima),
  // então a lista mostra só as anteriores — evita repetir a mesma info 2x.
  const previous = history.length > 1 ? history.slice(1) : [];

  if (previous.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
        <p className="font-display font-bold text-lg mb-1">Metas anteriores</p>
        <p className="text-sm text-ink-faint">
          Ainda não há histórico — esta é sua primeira meta configurada.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
      <p className="font-display font-bold text-lg mb-1">Metas anteriores</p>
      <p className="text-sm text-ink-faint mb-4">
        Valores que já estiveram em vigor antes da meta atual.
      </p>
      <ul className="space-y-3">
        {previous.map((g) => (
          <li
            key={g.id}
            className="text-sm border-t border-base-border pt-3 first:border-t-0 first:pt-0"
          >
            <p className="text-xs text-ink-faint font-mono mb-1">
              {format(parseISO(g.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <p className="text-ink">
              {g.weekly_loss_kg} kg/semana · {g.monthly_loss_kg} kg/mês ·{" "}
              {g.quarterly_loss_kg} kg/trimestre · {g.semester_loss_kg} kg/semestre
              {g.target_weight_kg ? ` · alvo ${g.target_weight_kg} kg` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
