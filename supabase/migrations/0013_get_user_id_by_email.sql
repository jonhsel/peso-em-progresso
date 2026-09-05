-- ---------------------------------------------------------
-- Fase 7 — correção pós-teste real (05/09/2026): supabase.schema("auth")
-- não funciona via @supabase/supabase-js com service role key, porque o
-- PostgREST só expõe o schema "public" pela API REST por padrão — isso é
-- uma restrição do gateway HTTP, não de RLS, então a service role key não
-- contorna. Confirmado com um webhook real simulado que caiu no caminho de
-- "usuário não encontrado" pra um email que já tinha conta.
--
-- Solução: função security definer em "public" (schema exposto), que por
-- rodar com privilégio de definer consegue ler auth.users por dentro do
-- Postgres, sem passar pela camada REST. Chamada via supabase.rpc(), não
-- .schema("auth").from("users") — ver src/app/api/webhooks/kiwify/route.ts.
-- ---------------------------------------------------------

create or replace function public.get_user_id_by_email(lookup_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where email = lookup_email limit 1;
$$;

-- Revoga de todo mundo por padrão e libera só pra service_role — essa
-- função vaza a existência de uma conta por email (útil só pro webhook,
-- nunca deve ser chamável por um usuário logado comum via client anon/
-- authenticated).
revoke all on function public.get_user_id_by_email(text) from public;
revoke all on function public.get_user_id_by_email(text) from anon;
revoke all on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

comment on function public.get_user_id_by_email(text) is
  'Lookup de auth.users por email via security definer — necessário porque
   a API REST do Supabase (mesmo com service role key) não expõe o schema
   auth por padrão. Usado só pelo webhook da Kiwify (src/lib/supabase/admin.ts
   + src/app/api/webhooks/kiwify/route.ts), chamado via .rpc(), nunca pelo
   client anon/authenticated (revogado explicitamente acima).';
