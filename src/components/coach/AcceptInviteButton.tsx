"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInviteButton({
  linkId,
  coachDisplayName,
}: {
  linkId: string;
  coachDisplayName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setAccepting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setAccepting(false);
      setError("Sessão expirada. Faça login novamente.");
      return;
    }

    const { error: supaError } = await supabase
      .from("coach_links")
      .update({
        coach_user_id: user.id,
        coach_display_name: coachDisplayName,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", linkId);

    setAccepting(false);

    if (supaError) {
      setError("Não foi possível aceitar o convite. Ele pode já ter sido usado.");
      return;
    }

    router.push("/dashboard/coach");
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-signal-behind">{error}</p>}
      <button
        type="button"
        onClick={handleAccept}
        disabled={accepting}
        className="rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 text-sm hover:bg-accent-hover transition disabled:opacity-60"
      >
        {accepting ? "Aceitando..." : "Aceitar convite"}
      </button>
    </div>
  );
}
