"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CoachLink } from "@/types/database";

/**
 * Gera/gerencia o convite de coach do próprio usuário (como dono). No
 * máximo 1 vínculo pendente ou ativo por vez — reforçado pelo índice
 * parcial `coach_links_one_open_per_owner` no banco; o client só evita a
 * viagem ao servidor mostrando o estado certo.
 */
export default function CoachShareSection({
  userId,
  displayName,
  currentLink,
}: {
  userId: string;
  displayName: string;
  currentLink: CoachLink | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUrl = currentLink
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/dashboard/coach/accept?code=${currentLink.invite_code}`
    : null;

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    const inviteCode = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const { error: supaError } = await supabase.from("coach_links").insert({
      owner_user_id: userId,
      invite_code: inviteCode,
      owner_display_name: displayName,
    });
    setGenerating(false);
    if (supaError) {
      setError("Não foi possível gerar o convite. Tente novamente.");
      return;
    }
    router.refresh();
  }

  async function handleCancel() {
    if (!currentLink) return;
    setError(null);
    setRevoking(true);
    const { error: supaError } = await supabase
      .from("coach_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", currentLink.id);
    setRevoking(false);
    if (supaError) {
      setError("Não foi possível cancelar o convite. Tente novamente.");
      return;
    }
    router.refresh();
  }

  async function handleRevoke() {
    if (!currentLink) return;
    const label = currentLink.coach_display_name ?? "esse coach";
    if (!window.confirm(`Revogar o acesso de ${label}? A pessoa deixa de ver seus dados imediatamente.`)) {
      return;
    }
    setError(null);
    setRevoking(true);
    const { error: supaError } = await supabase
      .from("coach_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", currentLink.id);
    setRevoking(false);
    if (supaError) {
      setError("Não foi possível revogar o acesso. Tente novamente.");
      return;
    }
    router.refresh();
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível (permissão negada, contexto não seguro) —
      // o link continua visível na tela pra copiar manualmente.
    }
  }

  return (
    <div className="bg-base-surface border border-base-border rounded-card p-5">
      <p className="font-display font-bold text-lg mb-1">Compartilhar com um coach</p>
      <p className="text-sm text-ink-faint mb-4">
        Gere um link para que alguém (personal trainer, nutricionista, familiar) acompanhe seu
        progresso — peso, medidas, fotos e metas — sem poder editar nada.
      </p>

      {error && <p className="text-sm text-signal-behind mb-3">{error}</p>}

      {!currentLink && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition disabled:opacity-60"
        >
          {generating ? "Gerando..." : "Gerar link de convite"}
        </button>
      )}

      {currentLink && currentLink.status === "pending" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">Convite pendente — aguardando aceite.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs bg-base-surface2 border border-base-border rounded-lg px-3 py-2 break-all">
              {inviteUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs rounded-lg border border-base-border px-3 py-2 text-ink-muted hover:text-ink transition"
            >
              {copied ? "Copiado!" : "Copiar link"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={revoking}
            className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50"
          >
            {revoking ? "..." : "Cancelar convite"}
          </button>
        </div>
      )}

      {currentLink && currentLink.status === "active" && (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            Coach ativo: <span className="font-medium">{currentLink.coach_display_name ?? "Coach"}</span>
          </p>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={revoking}
            className="text-xs text-ink-faint hover:text-signal-behind transition disabled:opacity-50"
          >
            {revoking ? "..." : "Revogar acesso"}
          </button>
        </div>
      )}
    </div>
  );
}
