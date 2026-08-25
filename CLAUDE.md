# CLAUDE.md — Peso em Progresso

Este arquivo é o registro de memória do projeto para retomar o trabalho em qualquer
sessão futura (Claude Code ou chat). Mantenha-o atualizado a cada mudança relevante.

## O que é o projeto

App pessoal de acompanhamento de peso corporal, multiusuário (dono + amigos/família,
cada um com dados isolados), com metas editáveis por período e KPIs de progresso.
Contexto original: usuário está em processo de perda de peso (dieta + musculação),
com metas de referência de 250 g/semana e 1 kg/mês — mas essas metas são configuráveis
na tela `/dashboard/goals`, não fixas no código.

## Stack

- Next.js 14 (App Router) + TypeScript, deploy alvo: **Vercel**
- Banco/Auth: **Supabase** (Postgres + Auth + Row Level Security)
- UI: Tailwind CSS (tema dark customizado, ver `tailwind.config.ts`) + Recharts para gráficos
- Sem ORM extra — queries via `@supabase-js` / `@supabase/ssr` direto

## Status atual: MVP completo e validado

- `npm run build` e `npx tsc --noEmit` rodam limpos (validado no sandbox de dev).
- Todas as telas abaixo estão implementadas e funcionais, mas **nunca foram testadas
  contra um projeto Supabase real** (só localmente com env vars placeholder) — o
  próximo passo de qualquer sessão futura, se ainda não feito, é validar isso.

### Páginas
- `/login` — criar conta / entrar (Supabase Auth, email+senha)
- `/dashboard` — peso atual, gráfico de evolução (Recharts), badge de tendência,
  4 cards de KPI (semana/mês/trimestre/semestre)
- `/dashboard/entries` — formulário de registro de peso (upsert por dia) + histórico
  com diff dia a dia + exclusão
- `/dashboard/goals` — formulário para editar as 4 metas de perda + peso alvo opcional

### Banco (`supabase/schema.sql`)
Tabelas: `profiles`, `weight_entries` (1 registro/dia/usuário via unique constraint),
`goals` (1 linha por usuário). RLS ativado em todas, políticas restringem tudo a
`auth.uid() = user_id`. Triggers criam `profile` e `goals` padrão automaticamente no
signup (`handle_new_user`, `handle_new_user_goals`).

### Lógica central (`src/lib/analytics.ts`) — funções puras, sem dependência de React/Supabase
- `computeTrend(entries)`: regressão linear simples sobre os últimos 21 dias →
  classifica em perdendo_rapido / perdendo / estavel / ganhando, em kg/semana.
- `computePeriodKpi(entries, goals, period)`: o KPI principal pedido pelo usuário —
  compara peso atual real vs. "peso esperado hoje" (projeção linear da meta desde o
  baseline do período até agora). Retorna status `ahead | on_pace | caution | behind`
  e o texto explicativo. Funciona tanto para "perdendo menos que a meta" quanto para
  "ganhando peso" (ambos caem em `behind`, com o texto ajustado).
- `computeAllKpis`: roda os 4 períodos de uma vez.

## Decisões importantes (não reabrir sem motivo)

1. **Fitdays não tem API pública** (pesquisado em 25/08/2026 — app fechado da ICOMON,
   uso via Bluetooth). Por isso o app usa registro manual como via principal. Deixei
   `weight_entries.source` (`manual` | `import`) pronto para uma futura tela de
   importação de CSV exportado do próprio app Fitdays — **isso ainda não foi
   construído**, é só o campo no schema.
2. **1 pesagem por dia por usuário** (constraint `unique(user_id, measured_at)`) —
   registrar de novo no mesmo dia faz upsert, decisão deliberada para não poluir o
   gráfico com múltiplas pesagens/dia.
3. **RLS no Postgres, não só checagem na aplicação** — é a base de segurança do
   multiusuário. Qualquer nova tabela adicionada ao schema deve vir com RLS habilitado
   e política `auth.uid() = user_id` desde o início.
4. **Cadastro público aberto** (qualquer um pode criar conta em `/login`). Se o usuário
   pedir para restringir, a solução documentada no README é desativar signup no
   Supabase Dashboard e convidar manualmente — não implementar sistema de convite
   próprio a menos que seja pedido.
5. Versões fixadas deliberadamente após troubleshooting: `next@14.2.35` (linha 14.2.x
   patcheada contra os CVEs de RSC de dez/2025), `@supabase/ssr@^0.12.5` +
   `@supabase/supabase-js@^2.112.4` (precisam estar alinhados — versões desencontradas
   causaram erros de tipo em `.upsert()` do tipo `never[]`).

## Pendências / próximos passos sugeridos (não iniciados)

- [ ] Testar o app fim a fim contra um projeto Supabase real (criar projeto, rodar
      `schema.sql`, configurar `.env.local`, testar signup/login/registro de peso).
- [ ] Deploy real na Vercel + configurar Site URL / Redirect URLs no Supabase Auth.
- [ ] Tela de importação de CSV do Fitdays (usar `source='import'`).
- [ ] Testes unitários para `src/lib/analytics.ts` (funções puras, fáceis de testar).
- [ ] Composição corporal (%gordura, massa magra) caso o usuário tenha balança de
      bioimpedância — exigiria novas colunas em `weight_entries` ou tabela nova.
- [ ] Notificação (e-mail) quando um KPI fecha "atrás da meta".

## Entregável

Projeto completo entregue como zip em `/mnt/user-data/outputs/peso-em-progresso.zip`
na sessão de 25/08/2026, junto com README.md contendo passo a passo de setup e deploy.
