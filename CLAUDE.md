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
- UI: Tailwind CSS (tema dark/light custom, accent terracota, ver `tailwind.config.ts` +
  `src/app/globals.css`) + Recharts para gráficos
- Sem ORM extra — queries via `@supabase-js` / `@supabase/ssr` direto

## Status atual: MVP + Fase 0 (landing/onboarding) + Fase 1.1 (export CSV/PDF) + Fase 1.2 (dark/light) completos, não validados em produção

- `npm run build` e `npx tsc --noEmit` rodam limpos (validado no sandbox de dev).
- Todas as telas abaixo estão implementadas e funcionais, mas **nunca foram testadas
  contra um projeto Supabase real com a migração 0002 aplicada** — o próximo passo de
  qualquer sessão futura, se ainda não feito, é validar isso (ver checklist da Fase 0
  e da Fase 1.1).

### Páginas
- `/` — landing pública (pitch + seção "Como funciona" + 3 planos vitrine:
  Grátis/Básico R$5,90/Completo R$9,90, sem cobrança real). Só renderiza pra
  visitante deslogado; logado cai em `/dashboard`. Todo CTA aponta pro subdomínio
  do app via `appPath()` (`src/lib/app-url.ts`), não pra rota relativa — landing
  (apex) e app (`app.*`) são origens diferentes.
- `/login` — criar conta / entrar (Supabase Auth, email+senha)
- `/onboarding` — 3 telas (boas-vindas → explicação dos 4 status de KPI → configurar
  1ª meta semanal), gatilhado por `profiles.onboarded_at is null`. `loadUserData()`
  redireciona pra cá automaticamente; ao concluir, grava `goals` + `onboarded_at` e
  manda pro `/dashboard`. Protegido no middleware igual `/dashboard`.
- `/dashboard` — peso atual (destaque `text-5xl/6xl` com glow), gráfico de evolução
  (Recharts, `h-96`), badge de tendência, 4 cards de KPI (semana/mês/trimestre/semestre)
- `/dashboard/entries` — formulário de registro de peso (upsert por dia) + histórico
  com diff dia a dia + exclusão
- `/dashboard/goals` — formulário para editar as 4 metas de perda + peso alvo opcional

Containers do dashboard usam `max-w-6xl` (landing usa `max-w-4xl`, design próprio).

### Banco (`supabase/schema.sql` + `supabase/migrations/`)
Tabelas: `profiles`, `weight_entries` (1 registro/dia/usuário via unique constraint),
`goals` (1 linha por usuário). RLS ativado em todas, políticas restringem tudo a
`auth.uid() = user_id`. Triggers criam `profile` e `goals` padrão automaticamente no
signup (`handle_new_user`, `handle_new_user_goals`).

`supabase/migrations/0002_onboarding.sql` adiciona `profiles.onboarded_at timestamptz`
(nullable, idempotente). **Ainda precisa ser rodada manualmente no Supabase Dashboard
> SQL Editor** — não foi aplicada por esta sessão (sem acesso ao projeto Supabase real).
Sem isso, `/onboarding` e o redirect em `loadUserData.ts` quebram em produção.

### Lógica central (`src/lib/analytics.ts`) — funções puras, sem dependência de React/Supabase
- `computeTrend(entries)`: regressão linear simples sobre os últimos 21 dias →
  classifica em perdendo_rapido / perdendo / estavel / ganhando, em kg/semana.
  **Não faz fallback para pesagens fora da janela**: se houver menos de 2 pesagens
  nos últimos 21 dias, retorna label `insufficient_data` — evita mostrar tendência
  de meses atrás como se fosse a "atual".
- `computePeriodKpi(entries, goals, period)`: o KPI principal pedido pelo usuário —
  compara peso atual real vs. "peso esperado hoje" (projeção linear da meta desde o
  baseline do período até agora). Retorna status `ahead | on_pace | caution | behind`
  e o texto explicativo. Funciona tanto para "perdendo menos que a meta" quanto para
  "ganhando peso" (ambos caem em `behind`, com o texto ajustado).
  **Baseline tem horizonte máximo de frescor** (`BASELINE_MAX_DAYS_BEFORE`): se a
  última pesagem antes do início do período for muito antiga (>30d para semana,
  >60d para mês, >120d para trimestre, >240d para semestre) e não houver pesagem
  dentro do período, o KPI reporta `caution` "sem pesagem recente para servir de
  referência" em vez de projetar contra dado velho.
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
6. **Landing (apex) e app (`app.*`) são o mesmo deploy Vercel**, diferenciados só por
   um `if (host.startsWith("app."))` no `updateSession` (`src/lib/supabase/middleware.ts`)
   que redireciona `/` pro `/login` ou `/dashboard` nesse host. Não é bloqueio de rota —
   `pesoemprogresso.com.br/dashboard` funciona igual, é cosmético por design (fora do
   escopo bloquear isso). `NEXT_PUBLIC_APP_URL` (só usada pela landing, via `appPath()`)
   é o que faz os CTAs cross-origin funcionarem; sem ela em prod, os botões da landing
   apontariam pra `localhost:3000`.
7. **Onboarding é obrigatório e não pulável** — `loadUserData()` (usado pelas 3 páginas
   do dashboard) redireciona pra `/onboarding` sempre que `profiles.onboarded_at` for
   null, então não dá pra chegar em `/dashboard` sem passar pelas 3 telas. Acessar
   `/onboarding` de novo depois de concluído redireciona pro `/dashboard` (não deixa
   revisitar via URL direta).
8. **Exportação CSV/PDF é server-side** — PDF gerado via `@react-pdf/renderer`
   (runtime Node, não Edge) em Route Handlers (`src/app/api/export/`), reaproveitando
   `computeAllKpis`/`computeTrend` de `src/lib/analytics.ts` sem duplicar lógica.
   CSV usa `;` como delimitador e `,` como decimal por causa do Excel pt-BR, com
   **todo campo entre aspas duplas sempre** (RFC4180, via `csvField()`), não só
   quando contém caractere especial — **correção 28/08/2026:** sem aspas em todo
   campo, apps de planilha que dividem por `,` além de `;` partiam um peso como
   `111,0` ou uma nota com vírgula embutida em colunas extras, corrompendo o
   arquivo (bug real visto em teste de produção).
   `next.config.js` precisa de `serverComponentsExternalPackages: ["@react-pdf/renderer"]`
   por causa do binding nativo `yoga-layout` — sem isso o build pode falhar na Vercel.
   Rotas protegidas com auth check + `Cache-Control: no-store, private` +
   `dynamic = "force-dynamic"` para não cachear dados pessoais. `renderToBuffer` retorna
   `Buffer`, que precisa ser envolvido em `new Uint8Array(buffer)` antes de passar pro
   `NextResponse` — o tipo `BodyInit` do Next 14 não aceita `Buffer` diretamente.
   **Correção 28/08/2026 (erro 500 em produção):** `@react-pdf/renderer` usa `pdfkit`
   por baixo, que carrega os arquivos de fonte padrão (`Helvetica.cjs` etc.) via
   `require()` dinâmico em runtime — o bundler do Next não rastreia isso e a função
   serverless da Vercel sobe sem esses arquivos, gerando
   `Cannot find module 'pdfkit/js/standard-fonts/Helvetica.cjs'`. Corrigido com
   `experimental.outputFileTracingIncludes` no `next.config.js`, forçando o trace a
   incluir `node_modules/pdfkit/**/*` (e os pacotes internos `@react-pdf/*`) na função
   `/api/export/pdf`. **Atenção à chave:** no Next 14.x (a versão fixada aqui) essa
   opção só é lida dentro de `experimental` — no nível raiz (como a doc oficial do
   Next 15+ mostra) é silenciosamente ignorada, com só um aviso `Unrecognized key(s)`
   no log de build, e o 500 continua acontecendo.
   **Cores do PDF (28/08/2026):** a tabela "Metas por período" usa as mesmas 4 cores
   de status do resto do app (`src/lib/kpi-status.ts` / tokens `signal-*` do
   `tailwind.config.ts`) — `ahead` `#34D399`, `on_pace` `#60A5FA`, `caution` `#FBBF24`,
   `behind` `#FB7185` — via `STATUS_COLOR` em `ExportDocument.tsx`, com hex literal
   porque o `@react-pdf/renderer` não lê classes Tailwind. Se a paleta `signal-*`
   mudar no Tailwind, atualizar esse mapa manualmente também (mesmo padrão de
   sincronização manual já usado em `TrajectoryGraphic.tsx`).
9. **Accent terracota (`#C1652F` light / `#D97A45` dark) escolhido sobre o azul
   `signal-onpace` como cor de ação/CTA**, validado visualmente com o usuário em
   28/08/2026 (Fase 1.2). Todo botão primário, foco de input e indicador de
   progresso do onboarding que usava `bg-signal-onpace`/`focus:border-signal-onpace`
   como cor de marca passou a usar `accent`/`accent-hover`. `signal-onpace`
   continua existindo e é usado onde é genuinamente status de KPI/tendência
   (`KpiCard`, `TrendBadge`, `KPI_STATUSES`) — não confundir os dois usos ao
   mexer em cor de botão/link no futuro.
10. **Toggle de tema é exclusivo do `app.*`** — a landing pública (`/`) não tem
    `ThemeToggle`, não lê o cookie de tema e não recebe `data-theme` dinâmico;
    mantém o visual dark fixo atual, decisão confirmada com o usuário. Isso é
    estrutural: `/login`, `/onboarding` e `/dashboard/*` vivem dentro do route
    group `src/app/(app)/` (que não afeta a URL), cujo `layout.tsx` lê o cookie
    e aplica `data-theme` num `<div id="app-theme-root">` — nunca no `<html>`
    raiz, que é compartilhado com a landing.
11. **Tema via cookie lido no Server Component** (`src/lib/get-theme.ts`, cookie
    `peso-theme`) — sem necessidade de script anti-flash (diferente do padrão
    comum de localStorage + script inline): como o SSR já lê o cookie antes do
    primeiro paint, o HTML chega correto de primeira. Cookies bloqueados
    degradam pra `DEFAULT_THEME` (dark) sem erro.
12. **`signal-*` (status de KPI) permanece com hex fixo**, igual nos dois temas —
    só o texto dos badges de status (`KpiCard.tsx`, `src/lib/kpi-status.ts`)
    passou a usar os pares `--badge-*-text` (`globals.css`, via valor arbitrário
    Tailwind `text-[var(--badge-x-text)]`) em vez de `text-signal-x` puro, pra
    resolver contraste em fundo claro (`caution` amarelo puro é ~2:1, abaixo do
    WCAG AA). Em dark os valores são idênticos ao hex antigo, então isso não
    mudou nada visualmente ali — inclusive no uso de `KPI_STATUSES` pela landing,
    que reaproveita o mesmo array mas nunca recebe `data-theme`.
13. **Opacity modifier (`/50` etc.) não funciona em cores Tailwind definidas só
    como `var(--x)`** (achado durante a Fase 1.2, `tailwindcss@3.4.4`) — gera
    classe sem regra CSS nenhuma, silenciosamente (ex.: `bg-accent/50` não
    apareceu no CSS final). Onde precisar de opacidade sobre `accent`/`base-*`/
    `ink-*`, usar a utilidade `opacity-*` num elemento próprio, ou definir uma
    var dedicada com o rgba já embutido (como `--accent-glow`, usado no glow do
    peso atual em `/dashboard`) — nunca `token/NN` direto nessas cores.
14. **Gráfico de evolução (`WeightChart.tsx`) lê as CSS vars do tema em runtime**
    via `getComputedStyle`, porque Recharts recebe cor por prop, não por
    className. Um `MutationObserver` no `#app-theme-root` recalcula as cores
    quando o `ThemeToggle` alterna `data-theme` (troca que é só DOM, sem
    re-render de Server Component). A linha/gradiente do peso usa `--accent`
    (antes era azul fixo); a `ReferenceLine` da meta continua verde fixo
    (`#34D399`, = `signal-ahead`), por ser status/sucesso, não marca.

## Auditoria de código (sessão de 25/08/2026 — bugs corrigidos)

Auditoria completa apontou 12 achados. Os 4 de maior severidade foram corrigidos
nesta versão. Detalhes:

**Corrigidos:**
1. `analytics.ts::baselineWeight` não tinha horizonte — usava pesagem de meses
   atrás como baseline se o usuário fosse intermitente, gerando "esperado hoje"
   absurdo. Agora respeita `BASELINE_MAX_DAYS_BEFORE` por período.
2. `analytics.ts::computeTrend` tinha fallback silencioso para últimos 6 pontos
   do histórico quando não havia dado nos últimos 21 dias — mostrava tendência
   de meses atrás como "Tendência (21 dias)". Agora retorna `insufficient_data`
   nesse caso; `TrendBadge` foi atualizado com o novo label ("Sem dados recentes").
3. `EntriesList.handleDelete` deletava sem confirmação e sem tratamento de erro.
   Agora usa `window.confirm()` mostrando peso+data, tem estado `deletingId` para
   desabilitar o botão durante a operação, e exibe erro visível se o Supabase falhar.
4. `GoalsForm` — `Number("")` retorna `0`, então campos vazios eram salvos como
   zero, quebrando cálculo de progresso. Nova função `parseRequired` retorna
   `NaN` para strings vazias e a validação mostra qual campo está inválido.
   Também adicionado auto-hide da mensagem "Metas atualizadas" após 3s.

**Pendentes (menor gravidade — ver seção abaixo):**
- `zod` está no `package.json` mas nunca importado — validar com schema ou remover.
- Sem tela para editar `profile.display_name` e `profile.height_cm` (colunas mortas).
- Sem cabeçalhos de segurança (CSP, X-Frame-Options) em `next.config.js`.
- `WeightEntryForm`: `max` no input date é bypassável — falta validação equivalente
  no `handleSubmit` para rejeitar `measured_at` no futuro.
- `NavBar.handleSignOut` ignora erros do `signOut` silenciosamente.
- `layout.tsx` sem `export const viewport` (padrão App Router do Next 14).
- `goals.updated_at` no schema sem trigger — hoje funciona porque o cliente envia,
  fica frágil se aparecer novo caller.

## Fase 0 — Landing pública + Onboarding guiado (implementada 27/08/2026)

Spec completo em `claude_fase0_v3.md` (na raiz do repo, não versionado — histórico de
como a feature foi planejada). Implementado nesta sessão: `tsc --noEmit` e `npm run
build` limpos. **Ainda não testado contra Supabase real nem em produção** — ver
checklist abaixo.

- [ ] Rodar `supabase/migrations/0002_onboarding.sql` no Supabase Dashboard.
- [ ] Configurar DNS: `pesoemprogresso.com.br` nos nameservers da Vercel,
      `app.pesoemprogresso.com.br` adicionado como domínio no mesmo projeto Vercel.
- [ ] Definir `NEXT_PUBLIC_APP_URL=https://app.pesoemprogresso.com.br` nas env vars
      da Vercel (Production **e** Preview) — sem isso os CTAs da landing quebram.
- [ ] Atualizar Site URL / Redirect URLs no Supabase Auth pro subdomínio do app.
- [ ] Testar fim a fim: conta nova → `/onboarding` (não `/dashboard`) → completar 3
      telas → grava `goals`+`onboarded_at` → `/dashboard`; revisitar `/onboarding`
      depois de concluído → redireciona; landing deslogado/logado nos dois domínios;
      link de confirmação de e-mail aponta pro subdomínio certo.

## Fase 1.1 — Exportar dados (CSV/PDF) (implementada 28/08/2026)

Spec completo em `claude_fase1_export_v2.md` (na raiz do repo, não versionado —
histórico de como a feature foi planejada, mesmo padrão do `claude_fase0_v3.md`).
Implementado nesta sessão: `tsc --noEmit` e `npm run build` limpos. **Ainda não
testado contra Supabase real** — ver checklist abaixo (mesma pendência geral do
projeto, ver `## Pendências`).

- Rota `GET /api/export/csv` — CSV com `;` de delimitador, peso em `,` decimal,
  BOM UTF-8, `Cache-Control: no-store, private`.
- Rota `GET /api/export/pdf` — PDF via `@react-pdf/renderer` (`src/lib/pdf/ExportDocument.tsx`),
  reaproveita `computeAllKpis`/`computeTrend`; fallback de goals padrão se o trigger
  de signup não tiver criado a linha em `goals`.
- Botões "Exportar CSV"/"Exportar PDF" em `/dashboard/entries`
  (`src/components/entries/ExportButtons.tsx`), só aparecem com ≥1 pesagem registrada.
- [ ] Testar `/api/export/csv` logado contra Supabase real — baixa, abre no Excel/Sheets
      sem quebrar acentos, peso reconhecido como número.
- [ ] Testar `/api/export/pdf` logado — tabela de histórico não corta linha no meio
      da página.
- [ ] Testar as duas rotas deslogado — devem responder 401.
- [ ] Testar com 0 pesagens — botões somem; acessando a URL direto, CSV sai só com
      cabeçalho e PDF mostra "Nenhuma pesagem registrada ainda."

## Fase 1.2 — Modo escuro/claro, accent terracota (implementada 28/08/2026)

Spec completo em `claude_darkmode.md` (na raiz do repo, não versionado — mesmo
padrão dos specs anteriores). Implementado nesta sessão: `tsc --noEmit` e
`npm run build` limpos. Decisões e mecanismo completo documentados em
"Decisões importantes" (itens 9–14) — resumo:

- `/login`, `/onboarding` e `/dashboard/*` foram movidos para o route group
  `src/app/(app)/` (URLs inalteradas) para compartilhar `src/app/(app)/layout.tsx`,
  que lê o cookie `peso-theme` (`src/lib/get-theme.ts`) e aplica `data-theme` num
  `<div id="app-theme-root">`. A landing (`/`, fora do grupo) não é afetada.
- `ThemeToggle` (`src/components/NavBar.tsx`) alterna o atributo DOM na hora
  (feedback instantâneo) e persiste via Server Action (`src/lib/theme-actions.ts`).
- Tokens novos em `tailwind.config.ts`/`globals.css`: `accent`/`accent-hover`
  (CTA/marca), `--accent-glow` (glow decorativo), `--badge-*-bg`/`--badge-*-text`
  (contraste de status em fundo claro). `base`/`ink` viraram CSS vars por tema;
  `signal-*` continua hex fixo.
- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de dev —
      **ainda não visto rodando num navegador real**, ver itens abaixo).
- [ ] Alternar tema em `/dashboard`, `/dashboard/entries`, `/dashboard/goals`,
      `/onboarding`, `/login` — nenhuma cor hardcoded "vazando" o tema errado.
- [ ] Reload com tema light já setado (cookie presente) — sem flash de dark antes
      do light.
- [ ] Cookies bloqueados — degrada pra dark sem erro (comportamento esperado por
      código, não visto rodando).
- [ ] Contraste dos 4 badges de status (KpiCard) nos dois temas.
- [ ] Gráfico Recharts (`WeightChart.tsx`) legível nos dois temas, inclusive
      alternando o tema com o gráfico já montado (linha/gradiente devem virar
      terracota, grid/eixos/tooltip devem trocar de cor via o `MutationObserver`).

## Landing — seção "Como funciona" com os 3 passos (ajustada 28/08/2026)

Pedido veio de `claude_landing_como_funciona.md` (na raiz do repo, não versionado,
mesmo padrão dos outros specs) — motivado por feedback real: uma pessoa usando o
app não reconheceu os 4 cards de KPI por período no `/dashboard` porque ficam
abaixo da dobra, sem teaser. A landing precisava deixar o mecanismo central
(meta por período → comparação com progresso real → status semáforo) claro antes
do cadastro.

A seção `HowItWorks` (`src/app/page.tsx`, `id="como-funciona"`) **já existia**
desde a Fase 0, com título + parágrafo + grid dos 4 status (`KPI_STATUSES`,
`src/lib/kpi-status.ts`) — o que faltava era a narrativa explícita dos 3 passos
(Defina sua meta → Registre seu peso → Veja se está no ritmo), que foi inserida
como um grid de 3 cards antes da grade de status, reaproveitando o padrão visual
já usado no arquivo (`rounded-card`/`border-base-border`/`bg-base-surface`,
`font-display`/`font-mono`). **Não copiei o JSX do spec ao pé da letra**: ele
usava `bg-${status.tone}` (classe Tailwind construída via template dinâmico), que
o JIT do Tailwind não reconhece por scanning estático — geraria classe sem CSS
nenhum, silenciosamente. A implementação real mantém classes literais (`s.dot`/
`s.text` vindos de `KPI_STATUSES`, já resolvidos, como a grade de status original
já fazia). `tsc --noEmit` e `npm run build` limpos.

- [ ] Ver a seção renderizada num navegador real (layout dos 3 cards em mobile,
      espaçamento entre os dois grids) — só validado por build, não visualmente.

## Dashboard — teaser de KPI acima da dobra (implementada 28/08/2026)

Pedido veio de `claude_dashboard_kpi_teaser.md` (na raiz do repo, não versionado,
mesmo padrão dos outros specs) — motivado por print de uso real: os 4 `KpiCard` por
período ficavam abaixo da dobra em `/dashboard`, sem nada acima sugerindo que
existiam, e a pessoa só descobriu rolando por acaso.

Novo componente `src/components/KpiWeeklyTeaser.tsx` ("use client", por causa do
`onClick`/`scrollIntoView`): card compacto entre o bloco de peso atual e o gráfico,
mostrando só o KPI da **semana** (`kpis.find(k => k.period === "week")` — o spec
tinha `kpis.semana`, mas o `Period` real em `analytics.ts` usa `"week"`, não
`"semana"`) com a cor de status e um texto de uma linha, terminando num botão que
rola suave até `id="kpi-details"` (adicionado na seção dos 4 `KpiCard` existente,
em `src/app/(app)/dashboard/page.tsx`).

Dois ajustes sobre o spec original:
1. **Cor de status via classes literais**, não o `bg-${tone}` dinâmico do
   snippet do spec — mesma armadilha já documentada na seção "Como funciona"
   acima (JIT do Tailwind não reconhece template string, gera classe sem CSS).
   Mapeamento copiado de `KpiCard.tsx` (`STATUS_DOT`) para manter as duas peças
   sincronizadas — se a paleta `signal-*` mudar, atualizar os dois arquivos.
2. **Texto do teaser trata `hasData` separadamente do texto de status fixo do
   spec**: `computePeriodKpi` retorna `status: "caution"` tanto para "atrás da
   meta" quanto para "sem pesagem recente pra servir de baseline" (ver
   `analytics.ts::computePeriodKpi`). O snippet do spec usava um texto fixo por
   status ("começando a ficar atrás da meta semanal") que ficaria enganoso no
   caso de faltar dado. O componente agora checa
   `currentWeightKg !== null && baselineWeightKg !== null` (mesmo critério do
   `KpiCard`) antes de mostrar o texto de status, caindo em "Registre pesagens
   para ver seu progresso da semana" quando não há dado suficiente.

`tsc --noEmit` e `npm run build` limpos.

- [ ] Ver o teaser renderizado num navegador real: cor batendo com o `KpiCard`
      correspondente nos 4 status, clique rolando suave até os cards com o topo
      da seção visível (não cortado), e comportamento em mobile (texto do verb
      truncando com reticências, sem quebrar o layout).

## Pendências / próximos passos sugeridos (não iniciados)

- [ ] Testar o app fim a fim contra um projeto Supabase real (criar projeto, rodar
      `schema.sql` + `migrations/0002_onboarding.sql`, configurar `.env.local`,
      testar signup/login/registro de peso, exportação CSV/PDF).
- [ ] Deploy real na Vercel + configurar Site URL / Redirect URLs no Supabase Auth.
- [ ] Tela de importação de CSV do Fitdays (usar `source='import'`).
- [ ] Testes unitários para `src/lib/analytics.ts` (funções puras, fáceis de testar).
- [ ] Composição corporal (%gordura, massa magra) caso o usuário tenha balança de
      bioimpedância — exigiria novas colunas em `weight_entries` ou tabela nova.
- [ ] Notificação (e-mail) quando um KPI fecha "atrás da meta".
- [ ] Fase 3 (não iniciada): ligar os planos pagos (`src/lib/pricing.ts`) a cobrança
      real (Stripe) — hoje todo CTA de plano pago só leva pro `/login`, sem gate.

## Entregável

Projeto completo entregue como zip em `/mnt/user-data/outputs/peso-em-progresso.zip`
na sessão de 25/08/2026, junto com README.md contendo passo a passo de setup e deploy.
