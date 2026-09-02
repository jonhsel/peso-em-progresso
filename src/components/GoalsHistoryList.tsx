"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { GoalsHistoryEntry } from "@/types/database";

export default function GoalsHistoryList({
  history,
  unit,
}: {
  history: GoalsHistoryEntry[];
  unit: string;
}) {
  // history vem ordenado decrescente (created_at DESC) de loadUserData(),
  // já filtrado pelo caller por goal_id (uma meta por vez). A entrada mais
  // recente é a meta ATIVA (já mostrada no formulário acima), então a
  // lista mostra só as anteriores — evita repetir a mesma info 2x.
  const previous = history.length > 1 ? history.slice(1) : [];

  if (previous.length === 0) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-5 max-w-md">
        <p className="font-display font-bold text-lg mb-1">Metas anteriores</p>
        <p className="text-sm text-ink-faint">
          Ainda não há histórico — esta é a primeira vez que essa meta foi configurada.
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
              {g.weekly_rate} {unit}/semana · {g.monthly_rate} {unit}/mês ·{" "}
              {g.quarterly_rate} {unit}/trimestre · {g.semester_rate} {unit}/semestre
              {g.target_value ? ` · alvo ${g.target_value} ${unit}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
