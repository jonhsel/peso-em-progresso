"use client";

import { useEffect } from "react";
import { KPI_STATUSES } from "@/lib/kpi-status";

// Props seguem a mesma convenção de ConfirmDialog.tsx (`open`, não `isOpen`) —
// achado confirmado contra o código real (Apêndice A item 2 do spec): o
// ConfirmDialog usa `open`/`onCancel`/`onConfirm`. Como o HelpModal não tem
// ação de confirmar, `onClose` substitui `onCancel` (mais preciso pra um
// modal que só fecha, sem cancelar nada), mas o nome do booleano (`open`)
// foi mantido igual ao ConfirmDialog para não introduzir uma segunda
// convenção de "modal aberto" no projeto.
interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HelpModal({ open, onClose }: HelpModalProps) {
  // Close-on-Escape: o ConfirmDialog (Fase 3) não tem esse handler (achado
  // confirmado contra o código real, Apêndice A item 5) — não há padrão
  // existente pra replicar aqui, então este é o primeiro. Documentado como
  // dívida técnica de backport ao ConfirmDialog, fora do escopo desta sub-fase.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Como o Peso em Progresso funciona"
    >
      {/* Fecha ao clicar fora, igual ao ConfirmDialog (Apêndice A item 3) —
          aqui faz sentido mesmo sem ação destrutiva envolvida: é leitura pura. */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative rounded-card border border-base-border bg-base-surface p-6 mx-4 max-w-lg w-full shadow-lg max-h-[85vh] overflow-y-auto">
        <h2 className="font-display font-bold text-lg">Como o Peso em Progresso funciona</h2>

        <p className="mt-3 text-sm text-ink-muted leading-relaxed">
          Defina sua meta → registre seu peso → veja se está no ritmo. O app
          compara seu peso atual com o peso que a meta previa pra hoje, e
          mostra isso como um status semáforo em cada período (semana, mês,
          trimestre, semestre).
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {KPI_STATUSES.map((s) => (
            <div key={s.key} className="rounded-lg border border-base-border p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                <span className={`text-sm font-medium capitalize ${s.text}`}>{s.label}</span>
              </div>
              <p className="mt-1.5 text-xs text-ink-muted leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <h3 className="font-display font-bold text-sm">Acompanhamento diário</h3>

          <div>
            <p className="text-sm font-medium">Sequência de registros</p>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">
              Conta quantos dias seguidos você tem pesagem registrada. Se você
              não registrar hoje mas registrou ontem, a sequência não quebra
              ainda — só zera se faltar hoje <em>e</em> ontem. Pesagens
              importadas por CSV contam igual às registradas manualmente.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Conquistas</p>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">
              Existem 7 conquistas: 3 por perda de peso absoluta (1&nbsp;kg,
              5&nbsp;kg, 10&nbsp;kg) e 4 por progresso percentual em direção
              ao seu peso alvo (25%, 50%, 75%, 100%). As de percentual
              precisam de um peso alvo definido em &quot;Metas&quot;. Uma vez
              desbloqueada, uma conquista nunca é revogada — mesmo que o peso
              suba depois.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Horário de check-in</p>
            <p className="mt-1 text-xs text-ink-muted leading-relaxed">
              Opcional, configurável em &quot;Configurações&quot;. Se você
              definir um horário e ele já tiver passado sem registro no dia,
              um aviso aparece junto da sua sequência lembrando de registrar.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
