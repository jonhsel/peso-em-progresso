import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays } from "date-fns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUBSCRIPTION_DAYS = 30;

const GRANT_EVENTS = new Set(["compra_aprovada", "subscription_renewed"]);
const REVOKE_EVENTS = new Set([
  "subscription_canceled",
  "subscription_late",
  "compra_reembolsada",
  "chargeback",
]);

// ⚠️ Pendências de confirmação contra a Kiwify real (pré-requisito antes de
// deploy em produção — ver claude_fase7_monetizacao_v3.md seção 7):
// 1. Nome exato dos campos no payload (body.event/body.type,
//    body.data.customer.email) — confirmar com um "Test Webhook" real do
//    painel da Kiwify contra webhook.site.
// 2. Como o token é entregue (body vs header) — se vier em header, trocar
//    `body.token` por `req.headers.get("x-kiwify-token")`.
// 3. `supabase.schema("auth")` — funciona com service role key; se não,
//    criar função Postgres security definer chamada via `.rpc()`.
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const eventType: string = body.event ?? body.type;
  const email: string | undefined = body?.data?.customer?.email ?? body?.Customer?.email;
  const orderId: string | undefined = body?.data?.id ?? body?.order_id;
  const eventCreatedAt: string = body?.created_at ?? new Date().toISOString();

  if (!email) {
    return NextResponse.json({ ok: true, skipped: "no email" });
  }

  const supabase = createAdminClient();

  if (GRANT_EVENTS.has(eventType)) {
    const expiresAt = addDays(new Date(eventCreatedAt), SUBSCRIPTION_DAYS).toISOString();

    const { data: authUser } = await supabase
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (authUser) {
      await supabase
        .from("profiles")
        .update({ plan: "pro", plan_expires_at: expiresAt, kiwify_order_id: orderId ?? null })
        .eq("id", authUser.id);
    } else {
      await supabase.from("pending_payments").insert({
        email,
        kiwify_order_id: orderId ?? null,
        expires_at: expiresAt,
      });
    }
  } else if (REVOKE_EVENTS.has(eventType)) {
    const { data: authUser } = await supabase
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (authUser) {
      await supabase
        .from("profiles")
        .update({ plan: "free", plan_expires_at: null })
        .eq("id", authUser.id);
    }
    await supabase
      .from("pending_payments")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("email", email)
      .eq("status", "pending");
  }

  return NextResponse.json({ ok: true });
}
