import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBSCRIPTION_DAYS = 30;

// ⚠️ Nomes de evento — status de confirmação por valor (05/09/2026, testes
// reais via Kiwify → webhook.site, ver CLAUDE.md Fase 7):
//   - "order_approved": CONFIRMADO — payload de teste real de "Compra
//     aprovada" trouxe webhook_event_type: "order_approved" exatamente.
//     Os valores em português do spec original ("compra_aprovada" etc.)
//     eram chute errado — a Kiwify usa nomes em inglês no campo real,
//     mesmo com a UI do painel em português ("Compra aprovada" é só o
//     rótulo do checkbox, não o valor enviado). Mantidos no Set por
//     segurança (não custam nada), mas não é esperado que apareçam.
//   - "subscription_canceled": CONFIRMADO — payload de teste real de
//     "Assinatura cancelada" trouxe webhook_event_type:
//     "subscription_canceled" exatamente (curioso: order_status veio
//     "refunded" nesse teste, não "canceled" — não importa, o código lê
//     webhook_event_type, não order_status).
//   - "subscription_late"/"subscription_renewed": ainda NÃO testados com um
//     evento real desse tipo específico — nomes em inglês já usados como
//     convenção em outras integrações Kiwify (mais prováveis de estarem
//     certos que os em português), mas não confirmados.
//   - "order_refunded"/"chargeback": mesma situação — chute por analogia
//     com o padrão "order_X" confirmado acima, ainda não testado.
const GRANT_EVENTS = new Set([
  "order_approved", // confirmado
  "compra_aprovada", // mantido por segurança, não confirmado
  "subscription_renewed", // não confirmado
]);
const REVOKE_EVENTS = new Set([
  "subscription_canceled", // confirmado
  "subscription_late", // não confirmado
  "order_refunded", // não confirmado
  "compra_reembolsada", // mantido por segurança, não confirmado
  "chargeback", // não confirmado
]);

/**
 * Validação de assinatura confirmada empiricamente em 05/09/2026 (ver
 * CLAUDE.md Fase 7): a Kiwify NÃO manda o token no corpo nem em header — ela
 * manda em query string (?signature=) o resultado de
 * HMAC-SHA1(corpo_bruto_da_requisição, chave=token_do_webhook), em hex.
 * Confirmado batendo bit a bit contra um payload de teste real via
 * webhook.site. Precisa do corpo BRUTO (antes de JSON.parse) — reserializar
 * o JSON pode mudar espaçamento/ordem de chaves e quebrar o HMAC.
 */
function isValidSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const token = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (!token) return false;

  const expected = crypto.createHmac("sha1", token).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Lookup de auth.users por email — CORRIGIDO em 05/09/2026 após teste real
 * (ver CLAUDE.md Fase 7): `supabase.schema("auth").from("users")` NÃO
 * funciona via @supabase/supabase-js, mesmo com service role key — o
 * PostgREST só expõe o schema "public" pela API REST por padrão (restrição
 * do gateway HTTP, não de RLS). Confirmado com um webhook real simulado
 * pra um email que já tinha conta: caiu (incorretamente) no caminho de
 * "usuário não encontrado" / pending_payments. Corrigido chamando a função
 * security definer `get_user_id_by_email` (migração 0013), que roda dentro
 * do Postgres e não passa pela mesma restrição.
 */
async function findUserIdByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<string | null> {
  const { data } = await supabase.rpc("get_user_id_by_email", { lookup_email: email });
  return (data as string | null) ?? null;
}

// ⚠️ Pendências de confirmação contra a Kiwify real (ver claude_fase7_monetizacao_v3.md
// seção 7 + CLAUDE.md Fase 7):
// 1. Valores exatos de GRANT_EVENTS/REVOKE_EVENTS acima — "order_approved" e
//    "subscription_canceled" já confirmados; "subscription_late"/
//    "subscription_renewed"/"order_refunded"/"chargeback" ainda não.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.nextUrl.searchParams.get("signature");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  const eventType: string = body.webhook_event_type ?? body.event ?? body.type;
  const email: string | undefined = body?.Customer?.email ?? body?.data?.customer?.email;
  const orderId: string | undefined = body?.order_id ?? body?.data?.id;
  // created_at real vem como "2026-09-05 16:11" (espaço, sem timezone) — não
  // é ISO 8601 estrito. Normaliza pra "T" pra parsing mais previsível; se
  // vier ausente ou em formato inesperado, cai no instante atual (suficiente
  // pra uma expiração de 30 dias, onde 1 dia de imprecisão não importa).
  const eventCreatedAtRaw: string | undefined = body?.created_at ?? body?.approved_date ?? undefined;
  const eventCreatedAt = eventCreatedAtRaw ? eventCreatedAtRaw.replace(" ", "T") : new Date().toISOString();

  if (!email) {
    return NextResponse.json({ ok: true, skipped: "no email" });
  }

  const supabase = createAdminClient();

  if (GRANT_EVENTS.has(eventType)) {
    const expiresAt = addDays(new Date(eventCreatedAt), SUBSCRIPTION_DAYS).toISOString();
    const userId = await findUserIdByEmail(supabase, email);

    if (userId) {
      await supabase
        .from("profiles")
        .update({ plan: "pro", plan_expires_at: expiresAt, kiwify_order_id: orderId ?? null })
        .eq("id", userId);
    } else {
      await supabase.from("pending_payments").insert({
        email,
        kiwify_order_id: orderId ?? null,
        expires_at: expiresAt,
      });
    }
  } else if (REVOKE_EVENTS.has(eventType)) {
    const userId = await findUserIdByEmail(supabase, email);

    if (userId) {
      await supabase
        .from("profiles")
        .update({ plan: "free", plan_expires_at: null })
        .eq("id", userId);
    }
    await supabase
      .from("pending_payments")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("email", email)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true });
}
