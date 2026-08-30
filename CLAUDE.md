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

## Status atual: MVP + Fase 0 (landing/onboarding) + Fase 1.1 (export CSV/PDF) + Fase 1.2 (dark/light) + Fase 2.1 (import CSV) + Fase 2.2 (medidas corporais) + Fase 2.3 (histórico de metas) + Fase 3 (período de meta fixo/móvel + Configurações) + Fase 4.1 (streak de registros) completos, não validados em produção

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
- `/dashboard/measurements` — formulário de medidas corporais opcionais (cintura,
  quadril, braço, % gordura, upsert por dia) + histórico com diff neutro por campo
- `/dashboard/goals` — formulário para editar as 4 metas de perda + peso alvo opcional

Containers do dashboard usam `max-w-6xl` (landing usa `max-w-4xl`, design próprio).

### Banco (`supabase/schema.sql` + `supabase/migrations/`)
Tabelas: `profiles`, `weight_entries` (1 registro/dia/usuário via unique constraint),
`goals` (1 linha por usuário), `body_measurements` (1 registro/dia/usuário, todos os
campos opcionais com `CHECK` exigindo ao menos 1 preenchido). RLS ativado em todas,
políticas restringem tudo a `auth.uid() = user_id`. Triggers criam `profile` e `goals`
padrão automaticamente no signup (`handle_new_user`, `handle_new_user_goals`).

`supabase/migrations/0002_onboarding.sql` adiciona `profiles.onboarded_at timestamptz`
(nullable, idempotente). **Ainda precisa ser rodada manualmente no Supabase Dashboard
> SQL Editor** — não foi aplicada por esta sessão (sem acesso ao projeto Supabase real).
Sem isso, `/onboarding` e o redirect em `loadUserData.ts` quebram em produção.

`supabase/migrations/0003_body_measurements.sql` cria a tabela `body_measurements`
(idempotente). **Também ainda precisa ser rodada manualmente no Supabase Dashboard
> SQL Editor** — sem isso, `/dashboard/measurements` quebra em produção (tabela
inexistente).

`supabase/migrations/0004_goals_history.sql` cria a tabela `goals_history` (log
append-only de toda meta que já existiu por usuário) + trigger `on_goals_changed_history`
(AFTER INSERT OR UPDATE em `goals`) + backfill pra quem já tinha `goals` sem histórico.
**Também ainda precisa ser rodada manualmente no Supabase Dashboard > SQL Editor** —
sem isso, `goalsHistory` em `loadUserData()` chega vazio do banco (cai no fallback
sintético de `loadUserData.ts`, então o app não quebra, mas `/dashboard/goals` mostra
"ainda não há histórico" pra sempre e o KPI nunca reflete uma meta antiga de verdade).

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
15. **Importação CSV é client-side** — o arquivo é lido com FileReader, parseado
    com parser puro (`src/lib/csv-parser.ts`), preview mostrado antes de salvar,
    e persistido via `supabase.from("weight_entries").insert()` em lotes de 50.
    Sem dependência nova. Aceita delimitadores `,` e `;` (auto-detectado),
    decimais com `,` ou `.`, datas em ISO/BR/EN. Colunas detectadas por heurística
    no header com fallback para seleção manual. Não sobrescreve pesagens manuais
    existentes (insert, não upsert). Limite de 500 linhas por upload.
    Fitdays não tem exportação CSV nativa — o usuário exporta via Apple Saúde ou
    Google Fit. A tela é genérica ("Importar CSV"), não específica do Fitdays.
    **Correção sobre o spec original (`claude_fase2_import.md`):** o destaque do
    dropzone ao arrastar um arquivo usava `bg-accent/5`, caindo exatamente na
    armadilha do item 13 acima (`accent` é `var(--accent)`, então o modificador
    `/5` gera classe sem CSS, silenciosamente). Corrigido com uma var dedicada
    `--accent-tint` (rgba de baixa opacidade, por tema, em `globals.css`) usada
    via `bg-[var(--accent-tint)]`, mesmo padrão já usado por `--accent-glow`.
16. **Persistência de settings via update client-side, não Server Action** —
    `SettingsForm.tsx` (Fase 3) segue o mesmo padrão de `GoalsForm.tsx`/
    `BodyMeasurementForm.tsx`/`WeightEntryForm.tsx`/`OnboardingFlow.tsx`:
    `supabase.from("profiles").update(...)` direto do client + `router.refresh()`.
    `theme-actions.ts` é a única Server Action do projeto e é caso à parte —
    escreve num **cookie**, não numa tabela com RLS; não é o padrão a seguir
    para updates de `profiles`/`goals`/etc.
17. **`ConfirmDialog.tsx` (Fase 3) é o primeiro modal do projeto** — overlay
    fixo + `bg-black/50` (nota: `black` é cor literal do Tailwind, não uma
    var `--x`, então `/50` funciona normalmente aqui — diferente da armadilha
    do item 13). Padrão de referência para qualquer confirmação destrutiva ou
    de mudança de comportamento futura: só dispara quando o valor em questão
    de fato mudou (não em todo submit do formulário que o contém).

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

## Fase 2.1 — Importação de CSV (implementada 28/08/2026)

Spec completo em `claude_fase2_import.md` (na raiz do repo, não versionado — mesmo
padrão dos specs anteriores). Implementado nesta sessão: `tsc --noEmit` e
`npm run build` limpos. **Ainda não testado contra Supabase real nem visto num
navegador** — ver checklist abaixo.

- `src/lib/csv-parser.ts` — parser puro sem dependência (delimitador `,`/`;`
  auto-detectado, aspas RFC4180, BOM UTF-8), detecção de coluna de data/peso por
  heurística de header, parsing de data ISO/BR/EN e peso com `,` ou `.` decimal,
  `validateRows` reporta erros por linha e duplicatas dentro do próprio arquivo.
- `src/components/import/CsvImporter.tsx` — fluxo upload → preview/mapeamento
  manual (se a heurística falhar) → confirmação → salvar em lotes de 50 → resultado.
  100% client-side (`FileReader`); nada sobe ao servidor antes da confirmação.
  Limite de 500 linhas por upload (trunca com aviso). Conflito com pesagem manual
  existente na mesma data = `insert` não sobrescreve, linha é reportada como
  "ignorada" no resultado (mesma prioridade documentada no item 15).
- `src/app/(app)/dashboard/import/page.tsx` — rota dedicada `/dashboard/import`,
  Server Component que só carrega dados do usuário e renderiza o `CsvImporter`.
- Link "Importar CSV" adicionado em `entries/page.tsx`, ao lado do `ExportButtons`.
- **Correção sobre o spec original** (registrada em detalhe no item 15 de
  "Decisões importantes"): o dropzone usava `bg-accent/5`, que não gera CSS porque
  `accent` é `var(--accent)` (achado da Fase 1.2, item 13). Trocado por
  `bg-[var(--accent-tint)]`, nova var em `globals.css` (mesmo padrão do
  `--accent-glow`).

- [ ] Upload de CSV com `,` como delimitador e `.` como decimal → detecta colunas,
      mostra prévia, importa.
- [ ] Upload de CSV com `;` como delimitador e `,` como decimal (Excel pt-BR) →
      funciona igual.
- [ ] Upload de CSV exportado por `/api/export/csv` do próprio app → detecta
      "Data"/"Peso (kg)", importa com `source='import'`.
- [ ] CSV sem header reconhecível → dropdowns de seleção manual de colunas.
- [ ] Datas em formato BR (`15/01/2024`) e ISO (`2024-01-15`) → parseiam certo.
- [ ] Importar com pesagens manuais já existentes na mesma data → manuais
      intocadas, relatório mostra quantas foram ignoradas.
- [ ] Re-importar o mesmo CSV → 0 inserções, tudo ignorado como existente.
- [ ] CSV com mais de 500 linhas → aviso + truncamento.
- [ ] Arquivo vazio e arquivo .xlsx/.pdf → mensagens de erro apropriadas.
- [ ] Pesagens importadas aparecem no histórico com label "Importado", no gráfico
      e nos KPIs normalmente.
- [ ] Dropzone com destaque visível ao arrastar um arquivo, nos dois temas
      (valida a correção do `bg-accent/5` acima).

## Dashboard — linha de tendência da semana no gráfico (implementada 29/08/2026)

Spec completo em `claude_dashboard_linha_tendencia.md` (na raiz do repo, não
versionado, mesmo padrão dos outros specs) — motivado por feedback direto do
usuário olhando `/dashboard` em produção: o gráfico de evolução (`WeightChart.tsx`)
mostrava a linha real do peso e a `ReferenceLine` verde da meta final, mas não o
conceito central do produto ("onde eu deveria estar hoje, seguindo o ritmo da
meta"), que já existia visualmente na landing (`TrajectoryGraphic.tsx`, linha
tracejada "esperada" vs. linha real) mas nunca chegou ao dashboard de verdade.

`WeightChart.tsx` ganhou uma prop `weekKpi: PeriodKpi | null` (reaproveitando o
`weekKpi` que `dashboard/page.tsx` já calculava para o `KpiWeeklyTeaser`, sem
recalcular nada) e uma segunda série `esperado` no dataset do gráfico: reta
linear entre `weekKpi.baselineWeightKg` (peso no início da semana) e
`weekKpi.expectedWeightNowKg` (onde a meta prevê que eu esteja hoje) — ambos já
calculados por `computePeriodKpi("week")` em `analytics.ts`, nenhum cálculo novo.
Renderizada como `<Line>` tracejada cinza (`colors.axis`, mesma var lida via
`getComputedStyle`/`MutationObserver` já usada pelas outras cores do gráfico) por
cima da `Area` do peso real. Só aparece (`hasWeeklyTrend`) quando `baselineWeightKg`
e `expectedWeightNowKg` não são `null` — mesmo critério de "dado confiável" já
usado pelo `KpiWeeklyTeaser`; sem meta semanal ou sem baseline recente, o gráfico
funciona igual a antes, sem a linha. Legenda curta "peso real / ritmo da semana"
aparece só junto com a linha. Patch aplicado ao pé da letra do spec, sem desvios.

**Bug real encontrado e corrigido no mesmo dia, validado num navegador de
verdade (Playwright headless + login real):** a linha tracejada não aparecia
— nem no DOM (sem erro no console). Causa: o gráfico usava `<AreaChart>` como
wrapper, e o `recharts@2.15` só reconhece `<Area>` como filho gráfico válido
dentro de `<AreaChart>` — um `<Line>` aninhado é **descartado silenciosamente**
(sem warning, sem exceção), mesmo com a prop/dado corretos e a legenda (que não
depende do recharts) aparecendo normalmente. Trocado `<AreaChart>` por
`<ComposedChart>` (mesma API — `data`, `XAxis`/`YAxis`/`Tooltip`/etc. idênticos),
que aceita misturar `Area`+`Line`+`Bar` no mesmo gráfico. Comentário deixado no
código (`WeightChart.tsx`) explicando, porque é fácil reintroduzir esse bug
"invisível" numa mudança futura se alguém trocar de volta pra `AreaChart` sem
saber do porquê. Também corrigido de brinde: o `Tooltip` rotulava as duas séries
(peso real e esperado) como "Peso" — agora usa `name="Peso"`/`name="Esperado"`
em cada série — e a linha ganhou um `dot` (círculo vazado) em cada pesagem
dentro da semana atual, porque a diferença entre peso real e esperado numa
semana costuma ser de poucas centenas de gramas: no eixo Y do gráfico (que
pode ir do peso atual até a meta final, dezenas de kg de intervalo), isso vira
poucos pixels de distância da linha sólida — o traço tracejado sozinho pode
ficar visualmente colado nela mesmo estando desenhado corretamente; os pontos
dão uma âncora visível nesse caso.

- [x] Ver renderizado num navegador real: linha tracejada só aparece com meta
      semanal + baseline confiável; legenda some/aparece junto; não fica
      escondida atrás do gradiente da área de peso real. **Validado
      29/08/2026** via Playwright headless logado na conta real — ver bug
      acima.
- [ ] Alternar tema dark/light com o gráfico já montado — linha tracejada muda
      de cor junto com o grid/eixos.
- [ ] Usuário sem meta semanal e usuário sem pesagem dentro da semana atual —
      gráfico continua normal, sem a linha, sem erro.

## Fase 2.2 — Medidas corporais (implementada 29/08/2026)

Spec completo em `claude_fase2_medidas.md` (na raiz do repo, não versionado — mesmo
padrão dos specs anteriores). Implementado nesta sessão: `tsc --noEmit` e
`npm run build` limpos. **Ainda não testado contra Supabase real nem visto num
navegador** — ver checklist abaixo. Patch aplicado ao pé da letra do spec, sem
desvios.

- Tabela nova `body_measurements` (`supabase/migrations/0003_body_measurements.sql`,
  também adicionada a `supabase/schema.sql`) — separada de `weight_entries` porque
  medidas corporais são registradas com frequência menor que peso e nem todo campo
  é preenchido toda vez. Os 4 campos (`waist_cm`, `hip_cm`, `arm_cm`, `body_fat_pct`)
  são opcionais, mas um `CHECK` (`body_measurements_at_least_one_field`) exige pelo
  menos 1 preenchido; mesmo padrão de `weight_entries`: 1 registro/dia/usuário
  (`unique(user_id, measured_at)`, upsert client-side), RLS por `auth.uid() = user_id`.
  **Ainda precisa ser rodada manualmente no Supabase Dashboard > SQL Editor.**
- `src/components/BodyMeasurementForm.tsx` — mesmo padrão de `WeightEntryForm.tsx`
  (upsert direto via `@supabase/ssr` client). `parseOptionalNumber` trata string
  vazia como `null` explicitamente antes de qualquer `Number()` — a mesma armadilha
  de `Number("") === 0` que já quebrou os KPIs de meta (ver auditoria 25/08/2026)
  se aplicaria aqui em dobro, porque aqui campo vazio **precisa** virar `null`
  (medida não tirada), não erro nem zero.
- `src/components/BodyMeasurementsList.tsx` — histórico + exclusão com
  `window.confirm`, mesmo padrão de `EntriesList.tsx`. Diff por campo calculado
  contra o registro anterior mais recente **que também tenha aquele campo
  preenchido** (não o registro anterior genérico), para não comparar cintura do
  dia 3 com um registro do dia 2 que só tinha braço. Sem cor semântica no diff
  (diferente de `EntriesList`, que pinta perda de peso de verde) — cintura menor
  é "bom", mas braço menor geralmente não é (perda de massa magra), e isso varia
  por pessoa/objetivo; aparece em `text-ink-faint` neutro, só o número com sinal.
- `src/app/(app)/dashboard/measurements/page.tsx` — rota dedicada
  `/dashboard/measurements`, mesmo layout 2 colunas (form fixo + histórico) de
  `entries/page.tsx`. Link "Medidas" adicionado à `NavBar` entre "Pesagens" e
  "Metas".
- `loadUserData()` agora também carrega `measurements` (`body_measurements`
  ordenado por `measured_at asc`), em paralelo com profile/entries/goals.

- [ ] Rodar `supabase/migrations/0003_body_measurements.sql` no Supabase Dashboard.
- [ ] Salvar medidas preenchendo só 1 dos 4 campos → aceita normalmente.
- [ ] Tentar salvar sem preencher nenhum campo → erro "Preencha ao menos uma
      medida.", nada é gravado.
- [ ] Salvar medidas na mesma data de um registro existente → atualiza (upsert),
      não duplica linha.
- [ ] Valor fora do intervalo (ex: cintura 999) → erro de validação, sem round-trip
      ao banco.
- [ ] Excluir uma medida → some da lista, `window.confirm` aparece antes.
- [ ] Histórico mostra o diff correto pulando registros onde aquele campo
      específico estava vazio (ex: 3 registros, só o 1º e o 3º têm cintura —
      diff do 3º deve comparar com o 1º, não com o 2º).
- [ ] Link "Medidas" aparece na NavBar (desktop e mobile) e destaca quando ativo.
- [ ] RLS: usuário A não consegue ver/editar medidas do usuário B (testar com
      2 contas, se possível).

## Fase 2.3 — Histórico de metas (implementada 29/08/2026)

Spec completo em `claude_fase2_historico_metas_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores). Implementado nesta sessão:
`tsc --noEmit` e `npm run build` limpos. **Ainda não testado contra Supabase
real** — ver checklist abaixo. Patch aplicado ao pé da letra do spec (v2, já
revisado por auditoria prévia), sem desvios.

Último item da Fase 2 (import CSV + medidas corporais + este) — fecha a fase.

- **Problema resolvido:** `goals` sempre foi uma tabela singleton (`user_id`
  PRIMARY KEY, upsert sobrescreve) — não havia como saber qual era a meta
  vigente numa data passada, então o KPI de um período que começou antes da
  última edição de meta (ex.: KPI do mês, editando a meta hoje) comparava o
  progresso do mês inteiro contra a meta *nova*, retroativamente, o que é
  logicamente errado.
- Nova tabela `goals_history` (`supabase/migrations/0004_goals_history.sql`,
  também adicionada a `supabase/schema.sql`) — log append-only (sem policy de
  update/delete), RLS por `auth.uid() = user_id`. Trigger
  `on_goals_changed_history` (`AFTER INSERT OR UPDATE on goals`) espelha toda
  escrita em `goals` automaticamente — cobre o INSERT do trigger de signup, o
  upsert do onboarding e o upsert do `GoalsForm`, sem precisar de insert
  client-side em nenhum desses três lugares. Migração inclui backfill: quem já
  tinha `goals` sem histórico ganha 1 registro retroativo com `created_at =
  goals.updated_at`.
- `src/lib/analytics.ts::resolveGoalsForPeriod(history, periodStartDate)`
  (nova) resolve a meta vigente = registro de `goals_history` mais recente com
  `created_at <= início do período`; sem nenhum anterior (conta nova no meio
  do período), cai no mais antigo disponível — nunca retorna `null` na
  prática, porque toda conta tem ao menos 1 registro (trigger de signup +
  backfill da migração 0004).
  `computePeriodKpi`/`computeAllKpis` mudaram de assinatura: recebem
  `goalsHistory: GoalsHistoryEntry[]` em vez de `goals: Goals` — resolvem a
  meta certa internamente por período, em vez de usar sempre a meta atual.
  Nada mais dentro de `computePeriodKpi` mudou (baseline, `expectedWeightNow`,
  thresholds de status — tudo igual, só a origem de `targetLossKg` mudou).
  `GOAL_FIELD` trocou de `Record<Period, keyof Goals>` pra
  `Record<Period, GoalFieldKey>` (tipo literal dos 4 campos de ritmo de perda)
  — evita mismatch de tipo, já que `GoalsHistoryEntry` não tem todos os campos
  de `Goals` (`user_id`/`updated_at`).
- `loadUserData()` agora também carrega `goalsHistory` (`goals_history`
  ordenado por `created_at desc`, em paralelo com profile/entries/goals/
  measurements), com fallback sintético (1 registro com os defaults
  0.25/1/3/6 e `created_at` na época Unix) só pro caso de a migração 0004
  ainda não ter rodado — evita `resolveGoalsForPeriod` receber lista vazia.
  `api/export/pdf/route.tsx` faz sua própria query (não usa `loadUserData()`)
  e ganhou o mesmo tratamento: query em `goals_history` + fallback usando
  `DEFAULT_GOALS` já existente na rota. `api/export/csv/route.ts` não mudou —
  não usa `computeAllKpis`.
- `/dashboard/goals` ganhou `GoalsHistoryList` (novo componente, somente
  leitura) abaixo do `GoalsForm`, em layout empilhado (`space-y-6`, não lado a
  lado como `entries/page.tsx`/`measurements/page.tsx` — histórico de metas
  cresce devagar). Mostra `goalsHistory.slice(1)` (tudo exceto a meta ativa,
  já visível no formulário acima) em ordem decrescente, sem diff entre
  edições — os 4 campos mudam juntos e o que importa é o valor absoluto, não
  a variação.
- `GoalsForm.tsx` e `OnboardingFlow.tsx` **não precisaram de nenhuma mudança**
  — o upsert em `goals` que ambos já faziam agora dispara o trigger sozinho;
  inserir manualmente em `goals_history` nesses componentes duplicaria lógica
  e arriscaria inconsistência se um dos dois inserts falhasse.
- `targetWeightKg`/`target_weight_kg` **não entra** na resolução por
  período — só os 4 campos de ritmo de perda são versionados; o peso alvo
  final continua vindo sempre de `goals.target_weight_kg` (meta ativa), sem
  histórico por data (decisão explícita do spec, fora de escopo desta
  entrega). A linha tracejada do gráfico (Fase 2.2, `WeightChart.tsx`) não
  precisou de nenhuma mudança — usa `weekKpi.baselineWeightKg`/
  `expectedWeightNowKg`, que já refletem a meta resolvida internamente por
  `computePeriodKpi`.

- [ ] Rodar `supabase/migrations/0004_goals_history.sql` no Supabase
      Dashboard — conferir que o backfill criou 1 linha em `goals_history`
      pra cada usuário que já tinha `goals`.
- [ ] Criar conta nova → completar onboarding → `goals_history` deve ter
      **2** registros: 1 do trigger de signup (defaults) e 1 do onboarding
      (valores configurados pelo usuário).
- [ ] Editar metas em `/dashboard/goals` duas vezes seguidas com valores
      diferentes → `goals_history` ganha 1 linha por edição (não sobrescreve);
      `goals` reflete só a última.
- [ ] Lista "Metas anteriores" mostra as edições em ordem decrescente,
      omitindo a meta atual; estado vazio ("ainda não há histórico") aparece
      corretamente pra conta com só 1 registro.
- [ ] KPI da semana/mês/trimestre/semestre continua calculando igual a antes
      **para quem nunca editou metas** (comportamento idêntico ao
      pré-migração).
- [ ] Cenário principal da feature: editar a meta semanal hoje, depois olhar
      o KPI do **mês** (período que começou antes da edição) — deve usar a
      meta *anterior* à edição, enquanto o KPI da **semana** (se a semana
      atual começou depois da edição) usa a meta nova. Confirmar com valores
      de teste que geram números visivelmente diferentes entre as duas metas.
- [ ] Exportação PDF (`api/export/pdf`) gera KPIs consistentes com o
      dashboard pro mesmo usuário/período.
- [ ] RLS: usuário A não consegue ler `goals_history` do usuário B; confirmar
      que não há policy de update/delete (append-only mesmo via API direta).
- [ ] `GoalsForm` NÃO faz insert manual em `goals_history` — confirmar que o
      trigger está cuidando disso (consultar `goals_history` antes e depois
      de salvar, sem insert client-side no código — já é o caso hoje).

Fecha a Fase 2 inteira (import CSV + medidas corporais + histórico de metas),
gatilho documentado pra "criar plano completo vs. plano básico" (já specced em
`claude_fase3_planos.md`, pendente só da conta Kiwify — **nome em conflito com
a "Fase 3" abaixo, ver nota lá**).

## Fase 3 — Período de meta (fixo/móvel) + Configurações (implementada 29/08/2026)

Spec completo em `claude_fase3_periodo_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra o
código real, ver Apêndice A do próprio arquivo). Implementado nesta sessão:
`tsc --noEmit` e `npm run build` limpos. **Ainda não testado contra Supabase
real** — ver checklist abaixo. Patch aplicado ao pé da letra do spec, sem
desvios de lógica (só o ajuste de `schema.sql` abaixo, fora do escopo original
do spec).

**Nota de nomenclatura:** esta fase e a "Fase 3" citada no backlog de
pricing/planos (`claude_fase3_planos.md`, ver `## Pendências` abaixo) têm o
mesmo número por terem sido especificadas em documentos separados sem
coordenação entre si — são features independentes, não a mesma fase. Não
renumerar os specs já escritos; só ter isso em mente ao ler o histórico.

- Dois campos novos em `profiles`: `period_mode` (`'fixed' | 'rolling'`,
  default `'fixed'`, 1 escolha global pros 4 períodos) e `week_starts_on`
  (`'monday' | 'sunday'`, default `'monday'`, só usado quando `period_mode =
  'fixed'`, mas sempre perguntado no onboarding pra evitar uma segunda
  pergunta se o usuário trocar de modo depois). Migração
  `supabase/migrations/0005_period_mode.sql` (idempotente, `ADD COLUMN IF NOT
  EXISTS`). **Ainda precisa ser rodada manualmente no Supabase Dashboard >
  SQL Editor.**
- **Achado fora do escopo do spec, corrigido de brinde:** `supabase/schema.sql`
  (arquivo de referência) nunca tinha sido atualizado com a coluna
  `profiles.onboarded_at` da migração 0002 (Fase 0) — só existia via
  `ALTER TABLE`, não na definição `CREATE TABLE` de referência. Corrigido
  junto com a adição de `period_mode`/`week_starts_on`, já que o spec desta
  fase assumia (incorretamente) que `onboarded_at` já estava lá.
- `src/lib/analytics.ts::periodStart` ganhou os parâmetros `mode`/
  `weekStartsOn` (defaults `"fixed"`/`"monday"`, preservando o comportamento
  de qualquer caller não atualizado). Modo `rolling` usa `subDays(reference,
  N)` com `N` = 7/30/90/180 por período, ignorando `weekStartsOn`.
  `periodLengthDays` recebeu o mesmo `mode` — no `rolling` retorna o
  comprimento exato do período (30/90/180) em vez das aproximações civis
  (30.4/91.3/182.6) usadas no `fixed`, pra não distorcer `fractionElapsed`.
  `computePeriodKpi`/`computeAllKpis` propagam os dois parâmetros; nenhuma
  outra lógica (baseline, thresholds de status, `resolveGoalsForPeriod`)
  mudou — só a origem da data de início de período.
- Onboarding (`OnboardingFlow.tsx`) ganhou um 4º step (`StepPeriodMode`,
  entre a explicação de KPI e a meta semanal) — escolha de `period_mode` +
  `week_starts_on`, gravados no mesmo `update` de `profiles` que já gravava
  `onboarded_at` (não um update separado). `TOTAL_STEPS` (usado pelos
  `StepDots`) atualizado de 3 para 4.
- Tela nova `/dashboard/settings` (`SettingsForm.tsx`, client-side, mesmo
  padrão de update direto ao Supabase de `GoalsForm`/`BodyMeasurementForm` —
  **não** Server Action, que no projeto é só para o cookie de tema): edita
  `display_name` (obrigatório, trim, rejeita vazio) e `height_cm` (opcional,
  `parseOptionalHeight` trata `""` como `null` antes de qualquer `Number()`,
  mesma armadilha de `Number("") === 0` já documentada em outros forms;
  intervalo `0 < altura < 300`), além de `period_mode`/`week_starts_on`.
  Aviso permanente (`text-xs text-ink-faint`) visível só quando
  `period_mode === 'fixed'`, avisando que `week_starts_on` também vai valer
  pro seletor de período do gráfico da Fase 5 (ainda não implementada).
- `ConfirmDialog.tsx` — **primeiro modal do projeto** (ver decisão 17 acima).
  `SettingsForm` só abre o modal quando `period_mode` no formulário difere do
  valor salvo (prop original) no momento do submit; mudar só
  `week_starts_on`/`display_name`/`height_cm` salva direto, sem modal.
- Link "Configurações" adicionado ao array `links` do `NavBar.tsx` (5º link).
  De brinde, mobile nav (`<nav className="sm:hidden ...">`) ganhou
  `overflow-x-auto` + `whitespace-nowrap` nos links — com 5 links o layout
  anterior (sem overflow) estourava em telas estreitas; não visto rodando
  num navegador real, só inferido do CSS.
- Callers de `computeAllKpis` atualizados para passar
  `profile.period_mode`/`profile.week_starts_on`: `dashboard/page.tsx` (via
  `loadUserData()`) e `api/export/pdf/route.tsx` (que faz query própria de
  profile — o `select("display_name")` foi expandido para incluir os dois
  campos novos; sem isso o PDF exportaria com `period_mode` `undefined` e
  quebraria silenciosamente no modo rolling). `api/export/csv/route.ts` não
  usa `computeAllKpis`, sem mudança.

- [ ] Rodar `supabase/migrations/0005_period_mode.sql` no Supabase Dashboard
      — conferir que contas existentes ganharam `period_mode='fixed'` e
      `week_starts_on='monday'` via default.
- [ ] Onboarding de conta nova: tela de período aparece entre a explicação de
      KPI e a meta semanal (steps 2→3→4), salva corretamente em `profiles`, e
      o restante do fluxo (`goals`+`onboarded_at`) continua funcionando.
      `StepDots` mostra 4 dots.
- [ ] `/dashboard/settings`: editar `display_name`/`height_cm` isoladamente
      → salva sem modal; `display_name` atualizado aparece no NavBar após
      refresh.
- [ ] `/dashboard/settings`: trocar `period_mode` de `fixed` para `rolling`
      → modal aparece; Cancelar não salva nada; Confirmar salva e os 4 KPIs
      em `/dashboard` recalculam após o refresh.
- [ ] Verificação numérica: com `period_mode='fixed'`+`week_starts_on='monday'`,
      KPI da semana bate com o cálculo civil atual; trocar pra `rolling` e
      confirmar que passa a comparar contra exatamente 7 dias corridos atrás
      (número visivelmente diferente do modo fixed).
- [ ] Exportação PDF reflete `period_mode`/`week_starts_on` do usuário —
      comparar com o dashboard.
- [ ] `goals_history`/`resolveGoalsForPeriod` seguem funcionando sem
      alteração de comportamento (regressão da Fase 2.3).
- [ ] RLS: `/dashboard/settings` não permite ler/editar `profiles` de outro
      usuário.
- [ ] NavBar mobile com 5 links — conferir visualmente que não estoura/trunca
      de forma ilegível (fix aplicado por inferência, não visto rodando).
- [ ] `display_name` vazio/só espaços e `height_cm` inválido (0, -10, 999) →
      erro de validação, nada salvo; `height_cm` vazio → salva como `null`.

## Fase 4.1 — Streak de registros (implementada 30/08/2026)

Spec completo em `claude_fase4_streak_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra o
código real, achados no Apêndice A do próprio arquivo). Implementado nesta
sessão: `tsc --noEmit` e `npm run build` limpos. **Ainda não testado contra
Supabase real nem visto num navegador** — ver checklist abaixo. Patch
aplicado ao pé da letra do spec, sem desvios. Primeira de 4 sub-fases da
Fase 4 (Gamificação e engajamento): streak → conquistas → check-in
preferido → guia de ajuda (as 3 seguintes ainda não speccadas).

- **Sem tabela nova, sem migração** — decisão deliberada. `src/lib/streak.ts`
  (`computeStreak`, função pura) deriva tudo de `weight_entries.measured_at`,
  já carregado por `loadUserData()`. Nada é persistido em `profiles`/tabela
  nova: recalcular sempre evita dessincronia se um registro for editado ou
  apagado depois.
- **Regra de tolerância de 1 dia**: a sequência atual conta a partir de hoje
  se já houve registro hoje; se não, mas houve ontem, a sequência continua
  contando (ainda dá tempo de registrar mais tarde no dia) — só zera quando
  faltam hoje **e** ontem. Evita o streak parecer "quebrado" de manhã antes
  de a pessoa abrir o app.
- **Fuso horário:** `todayInSaoPaulo` (converte o instante real `new Date()`
  em "que dia é hoje") usa `Intl.DateTimeFormat("en-CA", { timeZone:
  "America/Sao_Paulo" })` — única conversão de fuso do arquivo, mesmo
  cuidado já usado em `ExportDocument.tsx`/`dashboard/page.tsx`.
  **Bug real encontrado e corrigido no mesmo dia** (reportado pelo usuário
  vendo o card em produção: sequência real de 6 dias mostrando 4): o spec
  original (Apêndice A2, corrigindo a v1) trocou `.toISOString()` por
  `SP_FMT.format(subDays(parseISO(dateStr), days))` em `daysBefore`, achando
  que isso propagava o mesmo cuidado de fuso — mas é uma combinação quebrada.
  `parseISO("2026-08-30")` (string sem hora) vira meia-noite no fuso *local
  do processo Node* (UTC no servidor), não em São Paulo; formatar esse
  resultado em `America/Sao_Paulo` (UTC-3) subtrai um dia *extra*, porque
  meia-noite UTC cai às 21h do dia anterior em SP. Cada chamada de
  `daysBefore(x, 1)` andava 2 dias pra trás, não 1 — o loop da sequência
  atual pulava metade dos dias e quebrava cedo demais. Corrigido trocando
  `daysBefore` para aritmética pura em UTC (`Date.UTC` + `setUTCDate`, sem
  nenhuma conversão de fuso): como `measured_at` é uma data-calendário sem
  hora, não há "instante" pra converter — só `todayInSaoPaulo` (que parte de
  um instante real) precisa do fuso de SP. Comentário deixado em
  `streak.ts` explicando, mesmo padrão do comentário sobre o bug do
  `AreaChart`/`ComposedChart` em `WeightChart.tsx` — é fácil reintroduzir
  esse tipo de bug "correto na leitura, errado na composição" numa mudança
  futura sem entender o porquê.
- `src/components/StreakCard.tsx` — Server Component (sem `"use client"`,
  só exibe dados já calculados), mesmo padrão de `ExportButtons.tsx`.
  Renderizado em `/dashboard` (`src/app/(app)/dashboard/page.tsx`) logo após
  o bloco de peso atual/botão "Registrar pesagem", antes do
  `KpiWeeklyTeaser` — streak é o sinal de hábito (mais imediato), o teaser
  de KPI é o sinal de progresso (vem em seguida).
  Mostra sequência atual, aviso "registre hoje pra manter" (só quando não
  há registro hoje e a sequência ainda é >0), melhor sequência histórica, e
  7 pontos dos últimos 7 dias (preenchido se houve registro naquele dia).
  Usa `text-accent`/`bg-accent` (streak é categoria visual separada dos KPIs
  — sinal de hábito, não de status) e
  `text-[var(--badge-caution-text)]` no aviso (não `text-signal-caution`,
  que tem contraste ~1.9:1 sobre `--base-surface` light — mesmo padrão já
  consolidado em `KpiCard.tsx`/`kpi-status.ts`).
- Registros com `source = 'import'` (Fase 2.1) contam pra sequência igual a
  `'manual'` — o streak mede "há dado desse dia", não "o usuário abriu o
  app nesse dia".
- **Fora de escopo desta sub-fase** (deixado explícito no spec): persistir
  streak em tabela, conquistas/badges por streak (próxima sub-fase da Fase
  4, `user_achievements`), notificação de streak prestes a quebrar (depende
  de lembrete por e-mail, Fase 1, ainda não implementado), e mostrar o
  streak em qualquer tela além de `/dashboard`.

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Conta sem nenhuma pesagem: card mostra "Registre hoje pra começar sua
      sequência", 7 pontos vazios.
- [ ] Registrar pesagem hoje: `currentStreak` vira pelo menos 1, ponto de
      hoje preenchido.
- [ ] Pesagens em dias consecutivos → `currentStreak` soma corretamente;
      pular um dia no meio → `currentStreak` reflete só a sequência mais
      recente, `bestStreak` guarda a maior já vista.
- [ ] Sem registro hoje mas com registro ontem → `currentStreak` continua
      contando (tolerância de 1 dia) + aviso "registre hoje pra manter";
      sem hoje NEM ontem → volta a 0.
- [ ] Teste de fuso: registrar por volta de 21h-23h horário de Brasília e
      confirmar que o dia contado é o dia local correto (não UTC).
- [ ] Importação de CSV contando pra sequência: dia importado aparece
      preenchido no indicador de 7 dias.
- [ ] Alternar tema claro/escuro com o card visível — `accent`/aviso
      caution/pontos vazios com contraste adequado nos dois temas.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 4 —
Gamificação e engajamento → "Sequência de registros") e atualizar os
checkboxes acima.

## Pendências / próximos passos sugeridos (não iniciados)

- [ ] Testar o app fim a fim contra um projeto Supabase real (criar projeto, rodar
      `schema.sql` + `migrations/0002_onboarding.sql` + `migrations/0003_body_measurements.sql`
      + `migrations/0004_goals_history.sql` + `migrations/0005_period_mode.sql`,
      configurar `.env.local`, testar signup/login/registro de peso, exportação
      CSV/PDF, importação CSV, medidas corporais, metas + histórico, e a tela
      de Configurações/período de meta).
- [ ] Deploy real na Vercel + configurar Site URL / Redirect URLs no Supabase Auth.
- [ ] Testes unitários para `src/lib/analytics.ts` (funções puras, fáceis de testar).
- [ ] Massa magra/composição corporal mais completa (bioimpedância avançada) — hoje
      `body_measurements.body_fat_pct` cobre só % de gordura manual; sem cálculo ou
      import automático de balança.
- [ ] Notificação (e-mail) quando um KPI fecha "atrás da meta".
- [ ] Seletor de período no gráfico de evolução (1 semana/1 mês/3 meses/6
      meses) — Fase 5, depende de `period_mode`/`week_starts_on` (Fase 3
      período, já implementada).
- [ ] Fase 3 planos (não iniciada — nome de fase em conflito com a "Fase 3"
      de período/Configurações acima, ver nota lá): ligar os planos pagos
      (`src/lib/pricing.ts`) a cobrança real (Stripe) — hoje todo CTA de
      plano pago só leva pro `/login`, sem gate. Specced em
      `claude_fase3_planos.md`.

## Entregável

Projeto completo entregue como zip em `/mnt/user-data/outputs/peso-em-progresso.zip`
na sessão de 25/08/2026, junto com README.md contendo passo a passo de setup e deploy.
