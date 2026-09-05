import { createClient } from "@supabase/supabase-js";

// Client com service role key — bypassa RLS. Usado SÓ pelo webhook da
// Kiwify (src/app/api/webhooks/kiwify/route.ts), nunca em código que roda
// no client ou em rotas que atendem o próprio usuário logado (essas usam
// src/lib/supabase/server.ts, que respeita RLS via cookie de sessão).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
