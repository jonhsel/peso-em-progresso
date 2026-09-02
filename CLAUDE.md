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

## Status atual: MVP + Fase 0 (landing/onboarding) + Fase 1.1 (export CSV/PDF) + Fase 1.2 (dark/light) + Fase 2.1 (import CSV) + Fase 2.2 (medidas corporais) + Fase 2.3 (histórico de metas) + Fase 3 (período de meta fixo/móvel + Configurações) + Fase 4.1 (streak de registros) + Fase 4.2 (conquistas) + Fase 4.3 (próximo check-in) + Fase 4.4 (guia de ajuda) + Fase 5.1 (previsão da meta) + Fase 5.2 (média móvel de 7 dias) + Fase 5.3 (seletor de período do gráfico) + Fase 5.4 (relatórios) + Fase 5.5
(widget-resumo de medidas corporais) + Fase 6.1 (fotos de progresso) completos, não validados em produção

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
- `/dashboard/photos` — upload de foto de progresso (1/dia, upsert por dia,
  redimensionada/convertida pra JPEG no client) + comparação lado a lado por 2
  datas escolhidas livremente + histórico em grid com exclusão. Fotos vivem em
  bucket privado do Supabase Storage (`progress-photos`), servidas via signed URL
  (1h) geradas a cada carregamento da página — ver Fase 6.1.
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
18. **Primeiro uso de `localStorage` no projeto** (Fase 5.3, chave
    `pesoemprogresso:chartPeriod`) — distinto do tema, que usa cookie
    SSR-read (decisão 11) porque o toggle precisa acertar a cor já no HTML
    do primeiro paint. O período do gráfico é estado 100% client-side sem
    impacto em SSR (o `useState` inicial já é `"month"`, igual ao default,
    então não há mismatch de hidratação — o valor salvo só é restaurado
    depois do mount, via `useEffect` separado). `try/catch` em `getItem`/
    `setItem`; se indisponível (iframe sandboxed, modo privado restrito),
    degrada pro default `"month"` silenciosamente, sem crash.

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

## Fase 4.2 — Conquistas (achievements) (implementada 30/08/2026)

Spec completo em `claude_fase4_achievements_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra o
código real, achados no Apêndice A do próprio arquivo). Implementado nesta
sessão: `tsc --noEmit` e `npm run build` limpos. **Ainda não testado contra
Supabase real nem visto num navegador** — ver checklist abaixo. Patch
aplicado ao pé da letra do spec, sem desvios. Segunda de 4 sub-fases da
Fase 4 (Gamificação e engajamento): streak (4.1, já implementada) →
**conquistas** (4.2) → check-in preferido → guia de ajuda (as 2 seguintes
ainda não speccadas).

- **Conquistas são persistidas** (diferente do streak, que é recalculado a
  cada load) — tabela nova `user_achievements`
  (`supabase/migrations/0006_user_achievements.sql`, também adicionada a
  `supabase/schema.sql`): `unique(user_id, achievement_key)` impede
  duplicata, RLS por `auth.uid() = user_id`, **sem policy de update/delete**
  — uma vez desbloqueada, uma conquista nunca é revogada (mesmo que o peso
  suba depois), decisão deliberada. **Ainda precisa ser rodada manualmente
  no Supabase Dashboard > SQL Editor.**
- **7 conquistas no total**, definidas como constante em
  `src/lib/achievements.ts` (`ACHIEVEMENT_RULES`) — código, não banco, já
  que a regra é igual pra todo mundo:
  - Perda absoluta (`first_entry.weight_kg - latest_entry.weight_kg`):
    `lost_1kg`/`lost_5kg`/`lost_10kg`.
  - Progresso percentual em relação a `goals.target_weight_kg`
    (`pct_25`/`pct_50`/`pct_75`/`pct_100`) — só avaliável com peso alvo
    definido **e** peso inicial acima do alvo; se `target_weight_kg` for
    `null`, aparece como **bloqueada** ("Defina um peso alvo em Metas"),
    não escondida silenciosamente; se o peso inicial já estava no/abaixo do
    alvo, bloqueada com "Peso alvo já alcançado".
  - `evaluateAchievements(entries, goals, existing)` é função pura: cruza as
    regras com os dados atuais e a lista já persistida, retorna `all`
    (status `unlocked`/`locked`/`blocked` de cada uma) + `newlyUnlocked`
    (keys cuja condição foi atingida agora mas ainda não estão no banco —
    o caller persiste). Uma conquista já em `existing` **nunca é
    reavaliada** — vira `unlocked` direto, sem checar a condição de novo,
    o que garante que não é perdida se o peso subir depois.
- `src/components/AchievementsCard.tsx` — client component (`"use client"`,
  precisa de `useEffect` pra persistir sem bloquear o render inicial),
  renderizado em `/dashboard` logo abaixo do `StreakCard`, antes do
  `KpiWeeklyTeaser` (streak = sinal de hábito, conquistas = sinal de
  resultado acumulado, KPI = sinal de progresso — nessa ordem). Grid de 7
  quadrados com ícone (emoji); desbloqueadas usam `bg-[var(--accent-tint)]`
  + `border-accent` (mesma var já usada pelo dropzone de import CSV, Fase
  2.1, item 15); bloqueadas/não-alcançadas ficam opacas. Persistência é
  **fire-and-forget**: o `useEffect` insere `newlyUnlocked` em
  `user_achievements` e chama `router.refresh()` no sucesso;
  `useRef(didPersist)` evita reexecução em StrictMode/re-render, e o
  `createClient()` do Supabase é criado **dentro** do efeito (não no corpo
  do componente) pra não virar dep instável — lista de deps
  `[newlyUnlocked, userId]` com `router` omitido (estável na prática, guard
  por ref é a barreira primária). Tooltip nativo (`title`) mostra
  rótulo+descrição+data de desbloqueio ou motivo do bloqueio — sem lib de
  tooltip. **`grayscale` do Tailwind nos ícones locked/blocked é só
  cosmético**: `filter: grayscale()` pode não afetar emoji renderizado
  nativamente pelo OS em alguns browsers (iOS Safari/macOS); a
  diferenciação visual real é pelo fundo/borda/opacity, não pelo filtro.
- `loadUserData()` agora também carrega `achievements` (`user_achievements`
  sem ordenação — no máximo 7 linhas por usuário), em paralelo com
  profile/entries/goals/measurements/goalsHistory.
- `dashboard/page.tsx` passou a desestruturar `user` de `loadUserData()`
  (não desestruturava antes, diferente de entries/goals/import/settings,
  que já o faziam) — necessário pra passar `userId` ao `AchievementsCard`.
- **Fora de escopo desta sub-fase** (idem spec): conquistas baseadas em
  streak ou em medidas corporais, animação/confetti ao desbloquear, tela
  dedicada `/dashboard/achievements`, conquistas no PDF exportado
  (`api/export/pdf` não mudou).

- [ ] Rodar `supabase/migrations/0006_user_achievements.sql` no Supabase
      Dashboard — conferir que a tabela foi criada e RLS está ativo.
- [ ] Conta nova sem pesagens: card mostra "0/7", todos os 7 ícones em
      locked/blocked; conquistas de % mostram "🔒" com tooltip "Defina um
      peso alvo em Metas".
- [ ] Conta com pesagens mas sem peso alvo: conquistas absolutas avaliam
      normalmente; conquistas de % continuam bloqueadas.
- [ ] Definir peso alvo em `/dashboard/goals`, voltar ao dashboard →
      conquistas de % saem de bloqueadas e passam a avaliar de verdade.
- [ ] Perder 1 kg desde o primeiro registro → "Primeiro kg" desbloqueia
      automaticamente (fundo tintado, tooltip com data); conferir em
      `user_achievements` que o registro foi criado.
- [ ] Recarregar após desbloqueio → conquista continua desbloqueada (vem do
      banco, não recalculada); peso subir depois → conquista NÃO é
      revogada.
- [ ] Conta já abaixo do peso alvo desde o primeiro registro → conquistas
      de % bloqueadas com "Peso alvo já alcançado".
- [ ] RLS: usuário A não consegue ler `user_achievements` do usuário B.
- [ ] Alternar tema claro/escuro com o card visível — contraste adequado
      dos ícones desbloqueados e locked nos dois temas.
- [ ] Mobile: grid de 7 colunas sem overflow horizontal.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 4 —
Gamificação e engajamento → "Conquistas") e atualizar os checkboxes acima.

## Fase 4.3 — Próximo check-in (horário preferido de registro) (implementada 30/08/2026)

Spec completo em `claude_fase4_checkin_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 auditada só como revisão
de consistência interna, sem acesso aos arquivos reais na sessão em que foi
escrita — os 5 itens "pendente de confirmação" do Apêndice A foram
resolvidos nesta sessão contra o código real, ver abaixo). Implementado
nesta sessão: `tsc --noEmit` e `npm run build` limpos. **Ainda não testado
contra Supabase real nem visto num navegador** — ver checklist abaixo.
Última de 3 sub-fases já speccadas da Fase 4 (Gamificação e engajamento):
streak (4.1) → conquistas (4.2) → **próximo check-in (4.3)**; guia de ajuda
(4.4) segue não speccada.

- **Novo campo em `profiles`**, não tabela dedicada: `checkin_hour smallint`,
  nullable, sem default — diferente de `period_mode`/`week_starts_on` (Fase
  3), não é perguntado no onboarding, só configurável depois. Migração
  `supabase/migrations/0007_checkin_hour.sql` (idempotente, `ADD COLUMN IF
  NOT EXISTS` + `CHECK (checkin_hour IS NULL OR checkin_hour BETWEEN 0 AND
  23)`), replicada em `supabase/schema.sql`. **Ainda precisa ser rodada
  manualmente no Supabase Dashboard > SQL Editor.**
- **Granularidade: só a hora (0–23), semântica de "hora cheia"** — `checkin_hour
  = 7` conta como "já passou" a partir das 7h00 (7h32 já é passado), não é
  uma janela de 1h.
- **Resolução do Apêndice A do spec (itens pendentes de confirmação contra o
  código real):**
  1. `loadUserData.ts` faz `select("*")` em `profiles` — zero mudança de
     linha no select; só o fallback sintético (usado quando `profile` vem
     `null` do banco) precisou ganhar `checkin_hour: null` explícito.
  2. **Assinatura de `isPastCheckinHour`:** o spec propunha receber um
     `Date` já convertido pro fuso de SP, reaproveitando um helper existente
     — esse helper não existe em `streak.ts`; `todayInSaoPaulo` só expõe uma
     *string* de data (`YYYY-MM-DD`), não um `Date` cujo `.getHours()`
     reflita a hora de SP (que sempre usa o fuso do processo Node — UTC na
     Vercel). Criar um "Date deslocado" só pra chamar `.getHours()` nele
     seria a mesma classe de bug (conversão de fuso dupla/paralela) do
     `daysBefore` documentado na Fase 4.1. A função implementada recebe o
     `Date` **bruto** (o instante real) e extrai a hora de SP direto via
     `Intl.DateTimeFormat` (`currentHourInSaoPaulo`, mesmo mecanismo de
     `todayInSaoPaulo`, com normalização de `"24"` pra `0` que alguns
     runtimes retornam à meia-noite). `StreakCard` cria **um único**
     `reference = new Date()` e passa pra `computeStreak` e
     `isPastCheckinHour` — nunca duas instâncias de "agora".
  3. Tipo confirmado como `Profile` mesmo (`src/types/database.ts`), sem
     variação de nome.
  4. **Posição do JSX em `StreakCard.tsx`:** texto fixo do horário
     (`"Seu horário de registro: 07:00"`) numa linha própria, logo abaixo do
     contador de sequência atual; aviso de horário passado agrupado no mesmo
     bloco visual do aviso de streak existente (duas linhas empilhadas
     quando os dois aparecem juntos), em vez de espalhados — igual à
     proposta do spec.
  5. Sem precedente de formatação de hora em outro componente do projeto
     (confirmado por busca no repo) — `"07:00"` (zero-padded, `HH:00`)
     adotado como definido no spec, único padrão agora.
- `src/lib/streak.ts::isPastCheckinHour(checkinHour, reference)` — função
  pura nova, mesmo padrão de `computeTrend`/`computePeriodKpi` em
  `analytics.ts` (lógica de decisão isolada e testável, sem depender de
  React/Supabase).
- `StreakCard.tsx` continua Server Component — nova prop `checkinHour:
  number | null`; sem mudança nenhuma quando `checkin_hour` é `null`
  (comportamento idêntico à Fase 4.1).
- `SettingsForm.tsx` — novo `<select>` de 24 horas + opção "Não definir"
  (→ `null`), no mesmo cartão "Perfil" onde já está `height_cm`. Parser
  nomeado `parseOptionalCheckinHour` (convenção de `parseOptionalHeight`,
  Fase 3) trata `""` como `null` explicitamente antes de qualquer
  `Number()` — aqui o efeito de pular essa checagem seria pior que meta
  zerada: `checkin_hour = 0` (meia-noite) sendo salvo por engano em vez de
  "não definido". Update direto `supabase.from("profiles").update(...)` +
  `router.refresh()`, mesmo padrão do resto do form; **não** abre
  `ConfirmDialog` (só `period_mode` justifica o modal, decisão já registrada
  na Fase 3 — mudar só o horário de check-in não recalcula KPI nenhum).
- `dashboard/page.tsx` passa `profile.checkin_hour` pro `StreakCard`, mesmo
  lugar onde já passa `entries`.
- **Fora de escopo desta sub-fase** (idem spec): lembrete por e-mail (Fase 1
  de e-mail nunca implementada), notificação push/browser, granularidade de
  minuto, múltiplos horários, `checkin_hour` no PDF exportado (`api/export/pdf`
  não mudou — faz query própria de profile, mas não usa `checkin_hour`),
  perguntar no onboarding, timezone customizável (SP fixo, mesma decisão já
  implícita em `streak.ts`), índice em `checkin_hour`.

- [ ] Rodar `supabase/migrations/0007_checkin_hour.sql` no Supabase
      Dashboard — conferir que contas existentes ganharam `checkin_hour =
      null` e que a `CHECK` rejeita valores fora de 0–23.
- [ ] Conta nova, `checkin_hour` nunca definido: `StreakCard` não mostra
      nada relacionado a horário (comportamento idêntico à Fase 4.1).
- [ ] Definir `checkin_hour = 7` em `/dashboard/settings`, salvar sem modal
      aparecer, `router.refresh()` reflete a mudança.
- [ ] Com `checkin_hour` definido e antes desse horário (SP): sem aviso de
      "já passou", só o texto fixo do horário.
- [ ] Com `checkin_hour` definido, já passou da hora (inclusive minutos
      após a hora cheia, ex. 7h32 com `checkin_hour=7`), sem registro hoje:
      aviso extra aparece, junto (ou não) do aviso de streak conforme o
      estado da sequência.
- [ ] Registrar peso hoje após o aviso aparecer → aviso de horário some no
      próximo refresh.
- [ ] Selecionar "Não definir" depois de já ter um valor salvo → grava
      `null` corretamente (conferir no banco que não virou `0` por engano).
- [ ] Teste de fuso: alterar `checkin_hour` pra hora próxima do horário
      atual em SP e conferir que o aviso aparece/desaparece no limite
      certo, não em UTC.
- [ ] RLS: usuário A não consegue ler/editar `checkin_hour` de `profiles`
      de usuário B.
- [ ] Alternar tema claro/escuro com o aviso visível — contraste adequado
      (mesma classe de cor já validada na Fase 4.1).

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 4 —
Gamificação e engajamento → "Próximo check-in") e atualizar os checkboxes
acima. `claude_fases.md` não foi localizado neste repo nesta sessão (não
versionado, mesmo caso dos specs `claude_fase*.md`) — se reaparecer numa
sessão futura, aplicar essa marcação lá também.

## Fase 4.4 — Guia de ajuda revisitável (implementada 30/08/2026)

Spec completo em `claude_fase4_ajuda_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 auditada só como revisão
de consistência interna, sem acesso aos arquivos reais na sessão em que foi
escrita — os 5 itens "pendente de confirmação" do Apêndice A foram
resolvidos nesta sessão contra o código real, ver abaixo). Implementado
nesta sessão: `tsc --noEmit` e `npm run build` limpos. **Ainda não testado
num navegador real** — ver checklist abaixo. Patch aplicado ao pé da letra
do spec, sem desvios de lógica. Quarta e última sub-fase da Fase 4
(Gamificação e engajamento): streak (4.1) → conquistas (4.2) → próximo
check-in (4.3) → **guia de ajuda (4.4)**. Com essa sub-fase, **a Fase 4
fecha por completo**.

- **Sem migração, sem mudança de tipos** — sub-fase mais isolada da Fase 4,
  só conteúdo + UI. Não mexe em `loadUserData.ts`, `database.ts`,
  `dashboard/page.tsx` nem nenhuma rota de API.
- **Resolução do Apêndice A do spec (itens pendentes de confirmação contra o
  código real):**
  1. `NavBar.tsx` já é client component (`"use client"`) — `useState` de
     `isHelpOpen` cabe direto, sem sub-componente client-only. O array
     `links` é só `{ href, label }[]`, todo item vira `<Link>`, sem campo
     discriminador existente. Em vez de introduzir um campo `action`/`href`
     pra um único caso, "Ajuda" ficou como `<button>` avulso fora do
     `.map()`, com as mesmas classes visuais do estado "inativo" dos
     `<Link>` — mais simples que o discriminador proposto no spec.
  2. `ConfirmDialog.tsx` usa `open`/`onCancel`/`onConfirm`, não
     `isOpen`/`onClose`. `HelpModal` adotou `open` (mesmo nome do booleano,
     pra não criar uma segunda convenção de "modal aberto" no projeto) +
     `onClose` (em vez de `onCancel`, mais preciso pra um modal que só
     fecha, sem cancelar nada — não tem `onConfirm`).
  3. `ConfirmDialog` fecha ao clicar fora (`onClick={onCancel}` na `div`
     do overlay) — `HelpModal` replica o mesmo comportamento.
  4. `KPI_STATUSES` (`src/lib/kpi-status.ts`) tem os campos `key`, `label`,
     `dot`, `text`, `hex`, `description` — `HelpModal` usa `dot`/`text` pra
     cor (classes literais já resolvidas, nunca `` `bg-${status.tone}` ``,
     mesma armadilha já documentada na landing/`KpiWeeklyTeaser`) e
     `label`/`description` pro texto de cada card, em vez de hardcodar.
  5. `ConfirmDialog` **não** tem close-on-Escape — não havia padrão
     existente pra replicar; `HelpModal` é o primeiro modal do projeto com
     esse handler (`useEffect` com listener de `keydown` global). Dívida
     técnica anotada: bom seria fazer o mesmo backport no `ConfirmDialog`,
     fora do escopo desta sub-fase.
- `src/components/HelpModal.tsx` (novo) — client component, overlay
  `bg-black/50` fixo + painel `rounded-card border-base-border bg-base-surface`
  (mesmo visual do `ConfirmDialog`), `max-h-[85vh] overflow-y-auto` no
  painel (não no overlay). Conteúdo, nessa ordem: título, parágrafo do
  conceito central (mesma narrativa de 3 passos da landing/`HowItWorks`,
  texto reescrito, não JSX copiado), grid dos 4 `KPI_STATUSES`, seção
  "Acompanhamento diário" com 3 blocos de texto estático (sequência de
  registros, conquistas, horário de check-in — cobre as 3 novidades da
  Fase 4, não só o KPI original do roadmap), botão "Fechar"
  (`bg-accent hover:bg-accent-hover`, centralizado). `role="dialog"`,
  `aria-modal="true"`, `aria-label` com o título.
- `src/components/NavBar.tsx` — novo `useState(isHelpOpen)` + botão "Ajuda"
  (desktop e mobile, ao lado dos `<Link>` existentes, dentro dos dois
  `<nav>`) + `<HelpModal open={isHelpOpen} onClose={...} />` renderizado
  fora de ambos os `<nav>` (o componente passou a retornar um Fragment
  envolvendo `<header>` + `<HelpModal>`, já que é overlay `fixed`, não faz
  parte do fluxo de navegação semântico). Nada gravado em `profiles` —
  `isHelpOpen` é estado 100% local, reseta ao navegar (novo `NavBar` é
  remontado por rota).
- `src/lib/kpi-status.ts` — nenhuma mudança, só reaproveitado (3º lugar que
  importa `KPI_STATUSES`, depois de `HowItWorks`/landing e onboarding).

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Link "Ajuda" aparece no `NavBar` (desktop e mobile), sem quebrar o
      layout — mobile com scroll horizontal funcionando (6 itens agora).
- [ ] Clicar em "Ajuda" abre o modal; "Fechar", clique fora e tecla Escape
      fecham.
- [ ] Grid dos 4 status de KPI com cores/textos consistentes com a mesma
      grid da landing/onboarding.
- [ ] Seção de streak/conquistas/check-in compreensível pra conta nova sem
      nenhum dado.
- [ ] Conteúdo cabe em mobile sem overflow horizontal; scroll vertical
      interno funciona se passar de `max-h-[85vh]`.
- [ ] Abrir o modal, navegar pra outra página do dashboard, voltar — modal
      fechado por padrão.
- [ ] Nenhuma escrita no banco ao abrir/fechar (conferir Network/Supabase
      logs).
- [ ] Alternar tema claro/escuro com o modal aberto — contraste do overlay
      e da grid de KPI adequado nos dois temas (`--badge-*-text` em light).

Depois de validar em produção: marcar os 4 itens da Fase 4 (streak,
conquistas, check-in, guia de ajuda) como concluídos no `claude_fases.md`
(não localizado neste repo nesta sessão) e atualizar os checkboxes acima.
**Fase 4 (Gamificação e engajamento) fechada por completo.**

## Fase 5.1 — Previsão da meta (implementada 31/08/2026)

Spec completo em `claude_fase5_previsao_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra
`analytics.ts`/`KpiCard.tsx`/`dashboard/page.tsx`/`loadUserData.ts`/
`api/export/pdf/route.tsx`/`database.ts` reais). Implementado nesta sessão:
`npx tsc --noEmit` e `npm run build` limpos. **Ainda não testado num
navegador real** — ver checklist abaixo. Patch aplicado ao pé da letra do
spec, sem desvios. Primeira sub-fase da Fase 5 (Inteligência sobre os
dados).

- **Sem migração, sem mudança de tipos em `database.ts`** — camada de
  leitura pura sobre dados já calculados. Não mexe em `computeTrend`,
  `computePeriodKpi`, `computeAllKpis`, `baselineWeight` nem
  `BASELINE_MAX_DAYS_BEFORE`.
- `src/lib/analytics.ts::computeGoalPrediction(trend, kpi, targetWeightKg)`
  (nova, logo após `computeAllKpis`) — recebe o `TrendResult` de
  `computeTrend(entries)` e o `PeriodKpi` já calculado (não acessa
  `entries`/`baselineWeight`/`periodStart` diretamente, evitando duplicar
  lógica já resolvida no KPI). Retorna `GoalPrediction`, union de 4 casos:
  `insufficient_data` (menos de 2 pesagens nos últimos 21 dias, mesmo
  critério de `computeTrend`), `wrong_direction` (tendência `estavel`/
  `ganhando`), `already_reached` (peso atual já bateu o alvo/meta do
  período — `withTarget` diferencia o copy), `projected` (`estimatedDate`
  ISO + `daysFromNow`).
  **Ponto crítico da conversão de sinal:** `slopeKgPerWeek` é **negativo**
  quando perdendo peso (slope bruto da regressão) — a função usa
  `Math.abs(trend.slopeKgPerWeek)` como taxa de perda semanal; dividir
  direto por `slopeKgPerWeek` sem o `Math.abs` geraria data no passado
  (bug silencioso, documentado no Apêndice A2 do spec).
  Dois modos, mutuamente exclusivos por usuário (não por card): com
  `goals.target_weight_kg` definido, semana e mês mostram a **mesma**
  previsão (chegada no peso alvo); sem peso alvo, cada card projeta a
  meta de perda *daquele período* (`kpi.targetLossKg`/`kpi.actualLossKg`,
  já resolvidos por `computePeriodKpi` via `resolveGoalsForPeriod` —
  a previsão nunca acessa `goalsHistory` diretamente).
- `src/components/KpiCard.tsx` — nova prop opcional `prediction?:
  GoalPrediction`, sem quebrar os callers existentes (trimestre/semestre
  seguem sem passar a prop, `{prediction && ...}` não renderiza nada).
  Linha nova de texto (`text-xs text-ink-faint`, mesma hierarquia visual
  da linha "Hoje você está em X kg") inserida logo abaixo dela, dentro do
  ramo `hasData`.
- `src/app/(app)/dashboard/page.tsx` — reaproveita o `weekKpi` que já
  existia (usado pelo `KpiWeeklyTeaser`), acrescenta `monthKpi` e calcula
  `weekPrediction`/`monthPrediction` com `computeGoalPrediction`, passados
  condicionalmente no `kpis.map(...)` que renderiza os 4 `KpiCard`
  (`kpi.period === "week" | "month"` → previsão; senão `undefined`).
- **Fora de escopo** (idem spec): previsão em trimestre/semestre, qualquer
  mudança em `computeTrend`/`computePeriodKpi`/`computeAllKpis`/
  `period_mode`/`week_starts_on`, exportação PDF (`api/export/pdf/route.tsx`
  não mudou — previsão é só UI do dashboard), demais itens da Fase 5 (média
  móvel, seletor de período do gráfico, relatórios, widget de medidas).

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Conta com `target_weight_kg` definido + tendência de perda: cards de
      semana e mês mostram a **mesma** data estimada.
- [ ] Conta sem `target_weight_kg` + tendência de perda: card de semana
      usa `weekly_loss_kg`, card de mês usa `monthly_loss_kg` — datas
      **diferentes** entre si.
- [ ] Conta nova (< 2 pesagens nos últimos 21 dias): mensagem de
      "sem dados suficientes" nos dois cards.
- [ ] Conta ganhando peso ou estável: mensagem de "tendência não é de
      perda".
- [ ] Com target: peso atual <= alvo → "Meta de peso já alcançada! 🎉".
- [ ] Sem target: perda real >= meta do período → "Meta deste período já
      batida. ✅".
- [ ] Trocar `period_mode` de `fixed` pra `rolling` em Configurações →
      previsão sem-target recalcula (acompanha o `PeriodKpi` recalculado,
      nenhum estado próprio).
- [ ] Cards de trimestre/semestre inalterados visualmente (sem linha de
      previsão).
- [ ] Tema claro/escuro: contraste de `text-xs text-ink-faint` adequado.
- [ ] Mobile: linha de previsão não quebra o layout do card.
- [ ] Emoji 📈 renderiza corretamente (texto inline, não sob `grayscale`).

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Previsão da meta") e atualizar os checkboxes
acima.

## Fase 5.2 — Média móvel de 7 dias no gráfico de evolução (implementada 31/08/2026)

Spec completo em `claude_fase5_media_movel_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra
`WeightChart.tsx`/`analytics.ts` reais, correções no Apêndice A do próprio
arquivo). Implementado nesta sessão: `npx tsc --noEmit` e `npm run build`
limpos. **Ainda não testado num navegador real** — ver checklist abaixo.
Patch aplicado ao pé da letra do spec, sem desvios. Segunda sub-fase da
Fase 5 (Inteligência sobre os dados): previsão da meta (5.1, já implementada)
→ **média móvel de 7 dias (5.2)** → seletor de período do gráfico (5.3,
ainda não specced) → relatórios/insights → widget de medidas corporais.

- **Sem migração, sem mudança de schema/tipos, sem nova prop obrigatória em
  `dashboard/page.tsx`** — terceira série do gráfico, ortogonal às duas já
  existentes (`peso` real e `esperado`/ritmo da semana), derivada só de
  `entries` (que `WeightChart` já recebia). `dashboard/page.tsx` não mudou.
- `src/lib/analytics.ts::computeMovingAverage(entries, windowSize = 7)`
  (nova, depois de `computeGoalPrediction`) — reaproveita `toPoints` (já
  privada no arquivo). **Média das últimas N pesagens por contagem, não por
  janela de dias corridos**: para a pesagem *i* (cronológica), é a média das
  pesagens *i-6* a *i* (janela expansiva no início — 1, depois 2, etc.). Um
  usuário que pesa a cada 2-3 dias tem essa "média das últimas 7 pesagens"
  cobrindo mais de 7 dias de calendário — intencional, decisão do usuário. A
  função não decide visibilidade — isso é do `WeightChart`.
- `src/components/WeightChart.tsx` — nova série `mediaMovel` no
  `ComposedChart`, `<Line type="monotone" dataKey="mediaMovel" ...>`
  pontilhada (`strokeDasharray="2 3"`, mais curto que o `"4 4"` da linha
  `esperado`, pra nunca serem confundidas quando aparecem juntas), sem `dot`
  (diferente da `esperado`, que tem `dot` como âncora visual — a média se
  afasta mais da linha real, não tem o mesmo problema de ficar colada nela),
  cor `colors.movingAvg` (nova chave, lê `--ink-muted` — mesma var já lida
  para `tooltipLabel`, sem CSS var nova). Visibilidade
  (`hasMovingAverage`): só aparece com **>= 6 dias corridos de diferença**
  entre a primeira e a última pesagem (= 7 dias corridos de calendário
  inclusive), independente de quantas pesagens existam nesse intervalo —
  mesmo padrão de ausência silenciosa (sem estado de erro) já usado por
  `hasWeeklyTrend`. `sorted` (o array ordenado por data) foi extraído como
  variável compartilhada entre esse cálculo e o `data = sorted.map(...)` que
  já existia, evitando um segundo sort idêntico na mesma renderização.
- **Legenda unificada**: a `<div>` condicional (antes só `hasWeeklyTrend`)
  passou a aparecer com `hasWeeklyTrend || hasMovingAverage`, com "peso real"
  sempre visível quando há qualquer segunda série, e "ritmo da semana"/"média
  móvel (7)" condicionados individualmente — corrige o caso em que a média
  móvel aparece sem meta semanal (antes, "peso real" ficava escondida por
  depender só de `hasWeeklyTrend`). `flex-wrap` adicionado pra até 3 itens
  não estourarem em mobile.
- Domínio do `YAxis` **não mudou** — a média é sempre um subconjunto
  aritmético dos pesos reais, logo cai dentro de `[min, max]` já calculado.
- **Cálculo roda client-side** (`WeightChart.tsx` é `"use client"`) —
  intencional, os dados já chegam como prop, sem motivo pra server action.
- **Known behavior, aceito como está**: duas pesagens no mesmo dia geram duas
  entradas em `computeMovingAverage` com a mesma chave `date`; o `Map` no
  `WeightChart` guarda só a segunda. Diferença é frações de grama, sem
  impacto visual.

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Conta com < 7 dias corridos de histórico: linha de média móvel e
      legenda "média móvel (7)" não aparecem; "peso real" aparece se
      `hasWeeklyTrend` (comportamento existente, inalterado).
- [ ] Conta com >= 7 dias corridos e só 2-3 pesagens nesse intervalo: linha
      aparece usando janela expansiva.
- [ ] Conta com pesagens diárias por várias semanas: linha de média móvel
      visivelmente mais suave que a `Area` de peso real.
- [ ] Meta semanal ativa E >= 7 dias de histórico: as duas linhas (`esperado`
      tracejada "4 4" e `mediaMovel` pontilhada "2 3") aparecem juntas,
      visualmente distinguíveis.
- [ ] Sem meta semanal MAS com >= 7 dias de histórico: legenda mostra "peso
      real" + "média móvel (7)" (sem "ritmo da semana"); só a pontilhada
      aparece.
- [ ] Tooltip mostra "Média móvel (7): X.X kg" (nome correto, não confundido
      com "Peso"/"Esperado").
- [ ] Tema claro/escuro: `colors.movingAvg` muda de tom junto com o resto do
      gráfico ao alternar `data-theme`.
- [ ] Mobile: 3 itens de legenda com `flex-wrap` — quebra pra linha de baixo
      sem estourar a largura do card, nada escondido.
- [ ] Gráfico com só 1 pesagem (early return) e com 0 pesagens: comportamento
      idêntico a antes, sem erro (`sorted.length >= 2` cobre o caso de 1
      pesagem antes de chegar no `differenceInCalendarDays`).

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Média móvel de 7 dias no gráfico de
evolução") e atualizar os checkboxes acima.

## Fase 5.3 — Seletor de período do gráfico (implementada 01/09/2026)

Spec completo em `claude_fase5_seletor_periodo_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra
`WeightChart.tsx`/`analytics.ts` reais, correções no Apêndice A do próprio
arquivo). Implementado nesta sessão: `npx tsc --noEmit` e `npm run build`
limpos. **Ainda não testado num navegador real** — ver checklist abaixo.
Patch aplicado ao pé da letra do spec, sem desvios. Terceira sub-fase da
Fase 5 (Inteligência sobre os dados): previsão da meta (5.1) → média móvel
de 7 dias (5.2) → **seletor de período do gráfico (5.3)** → relatórios/
insights → widget de medidas corporais (as 2 últimas ainda não speccadas).

- **Sem migração, sem mudança de schema/tipos, sem nova prop em
  `dashboard/page.tsx`, sem mudança em `analytics.ts`** — trabalho 100%
  local a `WeightChart.tsx`. Filtro puramente client-side sobre o array
  `entries` que o componente já recebia inteiro; nenhuma query nova é
  disparada ao trocar de período.
- Pills segmentadas ("1s"/"1m"/"3m"/"6m") no cabeçalho do card, ao lado do
  título "Evolução do peso", componente local `PeriodPills`. Default "1
  mês" (`selectedPeriod` inicial `"month"`), restaurado depois via
  `localStorage` (ver decisão 18) — não perguntado no onboarding nem
  persistido no banco.
- `isWithinChartPeriod(measuredAt, period, weekKpi, now)` — helper puro no
  próprio arquivo: "1s" reaproveita `weekKpi.periodStart` (já resolvido por
  `computePeriodKpi` respeitando `period_mode`/`week_starts_on` da Fase 3,
  nenhuma lógica de semana nova aqui); "1m"/"3m"/"6m" são sempre N dias
  corridos a partir de hoje (30/90/180), sem equivalente civil e sem
  depender de `period_mode`.
- **O filtro só recorta o que é desenhado, não o domínio de cálculo**: a
  variável usada no `.map()` que monta `data` passou de `sorted` (histórico
  completo) para `visibleEntries` (filtrado). `sorted`, `hasMovingAverage`,
  `movingAverageByDate`, `hasWeeklyTrend`, `weekStart`, `totalElapsedDays`
  continuam todos derivados do histórico inteiro — a média móvel e a linha
  "esperado" nunca "resetam" nas bordas do período visível, só os pontos
  que aparecem no gráfico mudam.
- **Dois early returns distintos**: conta nova (`sorted.length < 2`) não
  mostra pills, mesma mensagem de sempre; histórico suficiente mas janela
  filtrada vazia (`data.length < 2`, ex.: "1m" numa conta com 8 meses de
  histórico mas nada nos últimos 30 dias) mostra as pills (pra trocar de
  período sem reload) + a mesma mensagem no corpo do card.
- `ReferenceLine` da meta (`targetWeightKg`) continua aparecendo em todos
  os períodos, sem depender do filtro.
- `const now = new Date()` é recalculado a cada render do componente
  (não é constante de módulo) — usado tanto no `filter` quanto dentro de
  `isWithinChartPeriod`, uma única instância de "agora" por render.

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Pills aparecem no cabeçalho, "1 mês" selecionado por padrão sem
      escolha salva em `localStorage`; trocar de pill filtra o gráfico sem
      nova query; F5 mantém a última escolha.
- [ ] "1s" com `period_mode = fixed` respeita `week_starts_on`; com
      `period_mode = rolling` mostra exatamente os últimos 7 dias corridos.
- [ ] Conta nova (< 2 pesagens no total): sem pills (Caso A). Conta com
      histórico longo mas nada nos últimos 30 dias: "1m" mostra pills +
      mensagem (Caso B), trocar pra "6m" mostra o gráfico sem reload.
- [ ] Linha "esperado" e média móvel continuam estáveis ao trocar de
      período (calculadas sobre o histórico completo, não a janela visível).
- [ ] `ReferenceLine` da meta aparece em todos os períodos.
- [ ] Tema claro/escuro: pill ativa (`bg-accent text-base-bg`) e inativas
      (`text-ink-faint`) com contraste adequado.
- [ ] Mobile: 4 pills cabem no cabeçalho sem quebrar linha; `localStorage`
      indisponível (iframe privado/bloqueado) degrada pro default "1m" sem
      crash.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Seletor de período no gráfico de evolução")
e atualizar os checkboxes acima.

## Fase 5.4 — Relatórios (implementada 01/09/2026)

Spec completo em `claude_fase5_relatorios_v3.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v3 já auditada contra
`NavBar.tsx`/`KpiCard.tsx`/`WeightChart.tsx`/`analytics.ts`/`loadUserData.ts`
reais, todas as pendências do Apêndice A da v2 fechadas). Implementado nesta
sessão: `npx tsc --noEmit` e `npm run build` limpos. **Ainda não testado num
navegador real** — ver checklist abaixo. Patch aplicado ao pé da letra do
spec, sem desvios de lógica (só tipagem `weekPrediction`/`monthPrediction`
como opcionais, ver nota abaixo). Quarta sub-fase da Fase 5 (Inteligência
sobre os dados): previsão da meta (5.1) → média móvel de 7 dias (5.2) →
seletor de período do gráfico (5.3) → **relatórios (5.4)** → widget de
medidas corporais (5.5, ainda não specced).

- **Sem migração, sem mudança de tipos** — leitura pura sobre dados já
  existentes (mesmos calculados por `computeAllKpis`/`computeTrend`/
  `computeGoalPrediction`, já usados por `dashboard/page.tsx`).
- Rota nova `/dashboard/reports` — Server Component
  (`src/app/(app)/dashboard/reports/page.tsx`) chama `loadUserData()` +
  `getTheme()`, calcula os 4 KPIs + `weekPrediction`/`monthPrediction`
  (mesma lógica de `dashboard/page.tsx`), renderiza `NavBar` e passa tudo
  já calculado para `ReportsClient` (Client Component, único motivo do
  `"use client"` é o `useState` da tab selecionada).
- `ReportsClient.tsx` — 4 tabs por extenso (Semana/Mês/Trimestre/Semestre,
  tipo `Period` de `analytics.ts`) acima de um único `KpiCard` (troca com a
  tab, sem nova query) e do `WeightChart` completo (fixo, com suas próprias
  pills 1s/1m/3m/6m da Fase 5.3, independente da tab do relatório).
  Componente de tabs é local, não reaproveita o `PeriodPills` privado do
  `WeightChart.tsx` (tipo/labels/sizing diferentes — ver decisão 3 do spec).
  **Nota sobre o spec:** `weekPrediction`/`monthPrediction` foram tipados
  como opcionais (`GoalPrediction | undefined`), não obrigatórios como no
  snippet original — `dashboard/page.tsx` já guarda `weekKpi`/`monthKpi`
  com `?.` antes de chamar `computeGoalPrediction` (padrão real do código,
  mais defensivo que o `!` do spec), e `reports/page.tsx` replica esse
  mesmo padrão em vez do non-null assertion; `KpiCard.prediction` já era
  opcional, então nada muda no comportamento renderizado.
- `NavBar.tsx` — "Relatórios" adicionado ao array `links`, entre "Metas" e
  "Configurações" (6 itens no array + "Ajuda" como `<button>` fora do
  `.map()` = 7 elementos visuais em mobile; `overflow-x-auto` já cobre,
  sem mudança de CSS necessária).
- **Fora de escopo** (idem spec): geração de texto de insight automático,
  qualquer mudança em `analytics.ts`/`WeightChart.tsx`/`KpiCard.tsx`,
  unificação dos dois seletores de período, widget de medidas corporais
  (5.5).

**Adendo 01/09/2026 (mesmo dia, pedido direto do usuário): botão "Salvar em
PDF" em `/dashboard/reports`.** O spec original marcava "sem exportação PDF
nova" como decisão fechada — revista a pedido do usuário, que queria um PDF
específico do relatório (não o `/api/export/pdf` genérico já existente).
Duas escolhas fechadas com o usuário antes de implementar: (1) rota nova
dedicada, não reaproveitar `/api/export/pdf`; (2) incluir um gráfico no PDF,
não só o resumo do KPI.

- Rota nova `GET /api/export/report-pdf?period=week|month|quarter|semester`
  (`src/app/api/export/report-pdf/route.tsx`), mesmo padrão de
  `api/export/pdf/route.tsx` (auth check, `runtime = "nodejs"`,
  `dynamic = "force-dynamic"`, `Cache-Control: no-store, private`,
  `renderToBuffer` envolvido em `new Uint8Array(...)`). `period` inválido/
  ausente cai em `"week"`. Calcula os 4 KPIs (`computeAllKpis`), pega só o
  do período pedido, e a previsão (`computeGoalPrediction`) só para
  `week`/`month` — mesma regra da Fase 5.1, sem previsão em trimestre/
  semestre. Query extra em `goals` (`target_weight_kg`, não usada pelo
  `api/export/pdf` original) porque a previsão com peso alvo depende dele.
- `src/lib/pdf/ReportDocument.tsx` (novo, ao lado de `ExportDocument.tsx`,
  sem compartilhar código entre os dois — layouts diferentes o suficiente
  pra não valer a pena extrair um componente comum agora): título
  "Relatórios", card do KPI do período (mesmo conteúdo visual do `KpiCard`:
  perda real/meta, barra de progresso, status colorido, previsão), e um
  **gráfico de linha desenhado à mão** com os primitivos SVG do
  `@react-pdf/renderer` (`Svg`/`Polyline`/`Line`/`Circle`) — **não** é
  `WeightChart.tsx`/Recharts, que não roda nesse motor de renderização.
  Pontos espaçados igualmente por índice (eixo X categórico, mesmo efeito
  visual do `WeightChart`), com linha tracejada verde de referência da meta
  de peso quando definida e dentro do domínio visível. Cobre só as
  pesagens dentro do período selecionado (`measured_at >= kpi.periodStart`),
  coerente com o KPI mostrado acima — diferente do `WeightChart` da própria
  tela de Relatórios, que sempre mostra o histórico completo (ou a janela
  1s/1m/3m/6m independente). `STATUS_COLOR`/`STATUS_LABEL` duplicados de
  `ExportDocument.tsx` (mesmo valor, mesmo comentário de sincronização
  manual — ver decisão 8) porque cada `Document` do `@react-pdf/renderer` é
  autocontido.
  **Sem** linha "esperado"/média móvel no gráfico do PDF — fora de escopo
  do "gráfico simplificado" pedido.
- Botão "Salvar em PDF" em `ReportsClient.tsx` — `<a href>` puro (mesmo
  padrão de `ExportButtons.tsx`, não fetch/blob), `?period=` reflete a tab
  selecionada no momento do clique. Ao lado das tabs, mesmo container
  flex com `justify-between`.
- `next.config.js::experimental.outputFileTracingIncludes` ganhou uma
  segunda entrada `"/api/export/report-pdf"` idêntica à de
  `"/api/export/pdf"` — mesma dependência nativa do `pdfkit`
  (`require()` dinâmico de fontes em runtime, não rastreado pelo bundler
  por padrão), documentada em detalhe na decisão 8. Sem isso, essa segunda
  rota cairia no mesmo 500 (`Cannot find module
  'pdfkit/js/standard-fonts/Helvetica.cjs'`) já corrigido uma vez pro
  `/api/export/pdf` original — só não testado ainda contra a Vercel real
  (mesma pendência geral do projeto).

- [ ] Botão "Salvar em PDF" baixa um PDF válido, título "Relatórios",
      refletindo o período da tab selecionada no momento do clique.
- [ ] PDF de "Semana"/"Mês" mostra a previsão (mesmo texto do `KpiCard`);
      "Trimestre"/"Semestre" não mostram.
- [ ] PDF de um período sem pesagens suficientes dentro dele (mas com
      histórico fora do período): card do KPI mostra "Registre pesagens
      para ver o progresso deste período." e a seção de gráfico mostra
      "Registre pelo menos 2 pesagens dentro deste período".
- [ ] Meta de peso definida e dentro da faixa do gráfico → linha tracejada
      verde aparece; meta fora da faixa ou não definida → gráfico sem ela,
      sem erro.
- [ ] Deploy na Vercel: `/api/export/report-pdf` não retorna 500 por
      `pdfkit` ausente (validar o `outputFileTracingIncludes` novo, mesmo
      teste que faltou originalmente pro `/api/export/pdf`).
- [ ] Deslogado → 401.

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Link "Relatórios" aparece no `NavBar` (desktop e mobile), entre
      "Metas" e "Configurações", sem quebrar layout — mobile com 7
      elementos visuais, overflow horizontal funcionando.
- [ ] Rota `/dashboard/reports` carrega com tab "Semana" selecionada por
      padrão; trocar de tab atualiza o `KpiCard` instantaneamente, sem
      reload/nova query.
- [ ] Tab "Semana"/"Mês" mostram previsão (mesmas regras da Fase 5.1);
      "Trimestre"/"Semestre" nunca mostram previsão.
- [ ] Gráfico de evolução aparece abaixo, pills 1s/1m/3m/6m funcionando
      independente da tab do relatório.
- [ ] Conta nova (sem pesagens suficientes): `KpiCard` e `WeightChart`
      mostram os mesmos estados de "sem dados" do dashboard.
- [ ] Tema claro/escuro: contraste da tab ativa/inativa e do `KpiCard`
      consistentes com o resto do app.
- [ ] Nenhuma escrita no banco ao trocar de tab ou carregar a página.
- [ ] Mobile: tabs + `KpiCard` + `WeightChart` empilham sem overflow
      horizontal; labels por extenso cabem em telas >= 360px.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Relatórios e Insights") e atualizar os
checkboxes acima.

## Fase 5.5 — Widget-resumo de medidas corporais (implementada 01/09/2026)

Spec completo em `claude_fase5_widget_medidas_v2.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra
`dashboard/page.tsx`/`BodyMeasurementsList.tsx`/`database.ts` reais).
Implementado nesta sessão: `npx tsc --noEmit` e `npm run build` limpos.
**Ainda não testado num navegador real** — ver checklist abaixo. Patch
aplicado ao pé da letra do spec, sem desvios. Última sub-fase da Fase 5
(Inteligência sobre os dados): previsão da meta (5.1) → média móvel de 7
dias (5.2) → seletor de período do gráfico (5.3) → relatórios (5.4) →
**widget-resumo de medidas corporais (5.5)**. Com essa sub-fase, **a Fase 5
fecha por completo**.

- **Sem migração, sem mudança de schema/tipos, sem mudança em
  `loadUserData.ts`** — a página `/dashboard/measurements` já existe desde a
  Fase 2.2; este widget é só a superfície de descoberta que faltava em
  `/dashboard` (antes, só era encontrada clicando em "Medidas" na `NavBar`).
- `src/components/BodyMeasurementsSummaryCard.tsx` (novo) — Server
  Component (sem `"use client"`; a única interação é navegação via
  `<Link>`, que não precisa de client). `return null` quando
  `measurements.length === 0` — ausência silenciosa, mesmo padrão de
  `hasWeeklyTrend`/`hasMovingAverage` (`WeightChart.tsx`). Para cada um dos
  4 campos (`waist_cm`/`hip_cm`/`arm_cm`/`body_fat_pct`), mostra o valor do
  registro mais recente **que tenha aquele campo preenchido** (não o
  registro mais recente genérico) + diff contra o próximo registro mais
  antigo que também tenha aquele campo — mesma lógica por-campo já usada em
  `BodyMeasurementsList.tsx` (Fase 2.2), sem cor semântica no diff (mesma
  decisão: cintura menor é "bom", braço menor geralmente não é, varia por
  pessoa). Cabeçalho mostra a data do registro mais recente da tabela; cada
  campo só reexibe sua própria data quando ela diverge desse cabeçalho
  (evita repetir a mesma data 4× quando tudo foi medido junto). Card inteiro
  é um `<Link href="/dashboard/measurements">` com `hover:border-ink-faint`
  (mesmo tratamento do `KpiWeeklyTeaser`).
- `dashboard/page.tsx` — `loadUserData()` já retornava `measurements`
  (ordenado por `measured_at` ascendente, carregado desde a Fase 2.2), mas
  a página nunca desestruturava essa chave; agora desestrutura
  (`const { user, profile, entries, measurements, goals, goalsHistory,
  achievements } = await loadUserData();`) e renderiza
  `<BodyMeasurementsSummaryCard measurements={measurements} />` como último
  bloco dentro de `<main>`, depois da seção `id="kpi-details"` (4
  `KpiCard`) — posição deliberada: é o card menos acionável no dia a dia
  (medidas mudam devagar comparado a peso), fica abaixo de tudo que já
  compete pela atenção acima da dobra.
- **Fora de escopo** (idem spec): qualquer mudança em `body_measurements`
  (schema), RLS, `BodyMeasurementForm.tsx`, `BodyMeasurementsList.tsx`, rota
  `/dashboard/measurements`, gráfico/série temporal dentro do card (é um
  resumo pontual, não visualização histórica), e `api/export/pdf` (não
  mudou).

- [ ] `npx tsc --noEmit` e `npm run build` limpos (validado no sandbox de
      dev — **ainda não visto rodando num navegador real**).
- [ ] Conta sem nenhuma medida: nada aparece abaixo dos 4 `KpiCard`, sem
      espaço em branco residual, sem erro.
- [ ] Conta com 1 único registro preenchendo os 4 campos: mostra os 4
      valores, sem nenhuma linha de diff (não há registro anterior).
- [ ] Conta com 2+ registros preenchendo campos diferentes em datas
      diferentes: cada campo mostra seu próprio valor mais recente e sua
      própria data quando ela diverge da data do cabeçalho.
- [ ] Diff correto: aumentar mostra `↑`, diminuir mostra `↓`, valor igual
      não mostra linha de diff.
- [ ] Clicar em qualquer ponto do card navega para `/dashboard/measurements`.
- [ ] Tema claro/escuro: contraste de `text-ink-faint`/`text-ink-muted`
      adequado nos dois temas.
- [ ] Mobile: grid 2 colunas não aperta os 4 campos; "% gordura" cabe no
      espaço reduzido.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Widget-resumo de Medidas Corporais no
dashboard") e atualizar os checkboxes acima. **Fase 5 (Inteligência sobre
os dados) fechada por completo.**

## Fase 6.1 — Fotos de progresso (implementada 01/09/2026, overlay de peso 02/09/2026)

Spec completo em `claude_fase6_fotos_progresso_v3.md` (na raiz do repo, não
versionado — mesmo padrão dos specs anteriores; v2 já auditada contra
`NavBar.tsx`/`loadUserData.ts`/`database.ts`/`supabase/server.ts`/
`supabase/client.ts`/`get-theme.ts`/`WeightEntryForm.tsx`/
`BodyMeasurementForm.tsx`/`CsvImporter.tsx`/`GoalsForm.tsx`/`goals/page.tsx`/
`api/export/pdf/route.tsx`/`streak.ts`/`schema.sql` reais; v3 acrescenta,
sobre a v2 já implementada, o overlay de peso do dia na tela de comparação —
`claude_fase6_fotos_progresso_v2.md` apagado do repo após confirmar a v3,
conforme instrução do próprio spec). Implementado em duas sessões: base
(bucket/tabela/upload/histórico/comparação) em 01/09/2026, overlay de peso em
02/09/2026. `npx tsc --noEmit` e `npm run build` limpos nas duas. **Testado
contra Supabase real em 02/09/2026** (migração 0008 rodada no Dashboard,
confirmada por print real de `/dashboard/photos` logado: link "Fotos" ativo
no `NavBar`, upload de foto funcionando, `PhotoComparisonView` listando e
trocando entre 2 datas distintas) — **overlay de peso, exclusão de foto e
sobrescrita no mesmo dia ainda não testados**, ver checklist abaixo. Patch
aplicado ao pé da letra do spec, sem desvios. Primeiro item da Fase 6
(Ticket alto).

- **Bucket privado** `progress-photos` no Supabase Storage (não público) —
  mesma filosofia de RLS-first do resto do projeto (decisão 3). Leitura via
  signed URL, geradas no server a cada carregamento de `/dashboard/photos`
  (expiração 1h) — sem sessão gravada de URL, sem cache.
- **1 foto por dia por usuário**, mesmo padrão de `weight_entries`/
  `body_measurements` — garantido pelo próprio path do arquivo
  (`{user_id}/{photo_date}.jpg`, sempre `.jpg`) com `upload(..., { upsert:
  true })`, sem lógica extra de "deletar o antigo antes de subir o novo".
  Tabela nova `progress_photos` (`supabase/migrations/0008_progress_photos.sql`,
  também adicionada a `supabase/schema.sql` seção 9) espelha os metadados:
  `unique(user_id, photo_date)`, RLS por `auth.uid() = user_id` nas 4
  operações (select/insert/update/delete — diferente de `goals_history`/
  `user_achievements`, que são append-only; aqui exclusão é uma feature
  pedida). **Também precisa das 4 políticas de RLS em `storage.objects`**
  (`(storage.foldername(name))[1] = auth.uid()::text`) — sem elas, mesmo com
  RLS na tabela de metadados OK, qualquer usuário logado conseguiria
  ler/escrever arquivos de qualquer pasta no bucket. **Ainda precisa ser
  rodada manualmente no Supabase Dashboard > SQL Editor** — sem isso,
  `/dashboard/photos` quebra em produção (bucket e tabela inexistentes).
- **Redimensionamento + conversão pra JPEG no client** (`src/lib/image.ts`,
  função pura `resizeImageToJpeg`, via `<canvas>`, sem dependência nova):
  lado maior limitado a 1600px, qualidade 0.85. Roda inteiramente no
  browser antes do upload — reduz o tamanho de fotos de celular (>5MB) para
  um JPEG bem menor, sem gastar banda/tempo de upload do arquivo bruto.
- **Comparação lado a lado por escolha livre de 2 datas** (`PhotoComparisonView.tsx`,
  dois `<select>` independentes com todas as datas que têm foto, default
  mais antiga à esquerda / mais recente à direita) — não uma comparação fixa
  "primeira vs mais recente", decisão fechada com o usuário. Os dois selects
  não se bloqueiam mutuamente (podem apontar pra mesma data), caso
  inofensivo aceito deliberadamente.
- **Peso do dia sobreposto à foto na tela de comparação** (pedido do usuário
  após a v1/v2, incorporado na v3 do spec) — cada lado da comparação mostra
  o peso (`weight_entries.weight_kg`) casado por data exata
  (`photo_date === measured_at`, `unique(user_id, measured_at)` garante 1:1,
  sem ambiguidade) em overlay `absolute bottom-3 left-3 text-2xl sm:text-3xl
  font-display font-bold text-white/70 drop-shadow-md` sobre a foto; sem
  pesagem naquele dia exato, nenhum overlay aparece (não busca a mais
  próxima). `text-white/70` é branco fixo, não os tokens `ink-*`/`accent` do
  tema — uma foto tem fundo imprevisível, não o fundo do app; `/70` funciona
  aqui porque `white` é cor literal do Tailwind, não uma CSS var como
  `accent` (limitação de opacity modifier documentada no item 13). Formato
  `92,4 kg` (vírgula decimal, mesmo padrão do CSV export). Fonte do dado:
  `entries` já vinha de `loadUserData()` — `photos/page.tsx` passou a
  desestruturá-lo e montar um `Map` (`weightByDate`) sem query nova.
  Restrito à comparação, deliberadamente: `PhotoHistoryGrid` recebe o mesmo
  array `photos` (que agora carrega `weight_kg` em todo item) mas ignora o
  campo — o pedido foi mostrar peso "na comparação", não no grid de
  histórico, e diferenciar os tipos só pra isso seria complexidade
  desnecessária. `PhotoComparisonView.tsx` ganhou um sub-componente local
  `PhotoSlot` que decide entre o placeholder (sem foto) e a imagem com/sem
  overlay.
- **Página nova dedicada `/dashboard/photos`** (não uma aba dentro de
  `/dashboard/measurements`), com link próprio "Fotos" no `NavBar` entre
  "Medidas" e "Metas" (registros físicos periódicos, mesma vizinhança
  temática). Mesmo padrão de `goals/page.tsx`: chama `loadUserData()` só
  pelo que precisa (`user`/`profile`) + `getTheme()`, e faz sua própria
  query de `progress_photos` + `createSignedUrls` direto na página — fotos
  não entraram em `loadUserData()` nem são consumidas por nenhuma outra
  tela. `createClient()` (server e client) chamado sem `await`, mesmo padrão
  confirmado em todo o resto do projeto (ambos são síncronos).
  Link "Fotos" leva o `NavBar` a 7 links no array + "Ajuda" (`<button>` fora
  do `.map()`) = 8 elementos visuais em mobile; `overflow-x-auto` já
  existente cobre, sem mudança de CSS (mesma solução já usada quando
  "Relatórios" levou o total a 7 na Fase 5.4).
- `PhotoUploadForm.tsx` — client component, mesmo padrão de update direto
  ao Supabase de `WeightEntryForm`/`BodyMeasurementForm` (sem Server
  Action). Input de data com `max` = hoje em São Paulo via
  `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })` (mesmo
  mecanismo de `streak.ts`, não `date-fns` — mais explícito em fuso que
  `format(new Date(), ...)`, que usa o fuso do processo). Input de arquivo é
  um `<label>` estilizado com `cursor-pointer` (não `<input type="file">`
  nativo), mesmo padrão visual de botão do resto do app. Erro usa
  `text-sm text-signal-behind` — não existe token de erro dedicado no
  projeto, esse é o padrão replicado de todo form (`WeightEntryForm`/
  `BodyMeasurementForm`/`GoalsForm`/`CsvImporter`).
- `DeletePhotoButton.tsx` — client component isolado, `window.confirm` antes
  de excluir (mesmo padrão de `EntriesList`/`BodyMeasurementsList`), mostra
  "..." durante a exclusão. Remove o arquivo do Storage e a linha da tabela
  em sequência (não é atômico — se a remoção do Storage falhar depois de já
  ter apagado a linha, ou vice-versa, pode ficar órfão; aceito como está,
  fora de escopo tratar).
- `PhotoHistoryGrid.tsx` — Server Component (única interação é o
  `DeletePhotoButton`, isolado como client), grid responsivo
  (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`), mais recente primeiro (a
  query em `photos/page.tsx` já ordena `photo_date desc`). Thumbnails com
  `aspect-[3/4]` (retrato, comum pra foto de corpo inteiro) — primeiro
  precedente de aspect ratio fixo em imagem no projeto; classe estática
  (sem template literal), segura pro JIT do Tailwind.
- `dashboard/page.tsx` **não muda** — fotos são descobertas só via link do
  `NavBar`, sem teaser/widget no dashboard principal (diferente do padrão já
  usado por `KpiWeeklyTeaser`/`BodyMeasurementsSummaryCard`), decisão
  implícita do spec (não pedida, fora do escopo desta sub-fase).
- `src/types/database.ts` — tipo `ProgressPhoto` novo (depois de
  `UserAchievement`) + entrada `progress_photos` em `Database.Tables`
  (depois de `user_achievements`).

- [x] Rodar `supabase/migrations/0008_progress_photos.sql` no Supabase
      Dashboard — **rodada em 02/09/2026** (confirmado pelo usuário; página
      carrega e faz upload real, o que exige bucket+tabela existentes).
      Não confirmado individualmente: as 8 políticas de RLS ativas (4
      tabela + 4 storage) — inferido do fato de a página funcionar logada
      como dono dos dados, não testa isolamento entre usuários (ver item
      de RLS abaixo, ainda pendente).
- [x] Link "Fotos" aparece no `NavBar` desktop, entre "Medidas" e "Metas",
      estado ativo destacado — **confirmado por print real** de
      `/dashboard/photos`. Mobile (8 elementos visuais, overflow) ainda
      não visto.
- [ ] Upload de foto grande (celular, >5MB): completa sem erro, arquivo no
      Storage é bem menor (~JPEG redimensionado a 1600px). Upload básico
      confirmado funcionando (print real), tamanho do arquivo original
      não verificado.
- [ ] Upload de segunda foto na mesma data: sobrescreve (mesmo path), não
      duplica na tabela nem no bucket. **Ainda não testado** (confirmado
      pelo usuário).
- [x] Upload em datas diferentes: registros separados no histórico —
      **confirmado por print real**, `PhotoComparisonView` lista
      `2026-08-30` e `2026-09-01` como datas distintas com foto própria.
      Ordenação "mais recente pro mais antigo" no grid de histórico
      (`PhotoHistoryGrid`) não verificada nesse print (seção fora da
      captura de tela).
- [ ] Tentar data futura no input: bloqueado pelo `max`.
- [x] Comparação: 2 `<select>` listam as datas com foto e trocar a seleção
      atualiza a imagem — **confirmado por print real** (selects "Antes"/
      "Depois" populados com as 2 datas). Ausência de nova query ao trocar
      não verificada visualmente (comportamento client-side esperado pelo
      código, não conferido via Network).
- [ ] 0 ou 1 foto: seção "Comparar" mostra mensagem, sem quebrar.
- [ ] Excluir foto: `window.confirm`, some do histórico e da comparação,
      arquivo removido do bucket. **Ainda não testado** (confirmado pelo
      usuário).
- [ ] RLS: usuário A não vê/edita fotos do usuário B (tabela e bucket).
- [ ] Signed URLs expiram em 1h — reabrir a página gera novas URLs.
- [ ] Tema claro/escuro: bordas, `ink-faint`, botão de excluir com
      contraste adequado. Print real visto é do tema escuro; claro não
      testado.
- [ ] Mobile: grid histórico (2 colunas) e selects de comparação sem
      overflow horizontal.
- [ ] Conta nova (nunca fez upload): página carrega sem erro, mostra
      formulário de upload + "Nenhuma foto ainda" no histórico + mensagem
      de "envie 2 datas" na comparação. Não aplicável à conta usada no
      teste (já tinha fotos), não verificado com conta zerada.
- [ ] Comparação: foto de um dia **com** pesagem registrada mostra o peso
      em overlay, canto inferior esquerdo, formatado como "92,4 kg".
      **Ainda não testado** (confirmado pelo usuário) — no print real, as
      2 fotos comparadas não mostram overlay, mas não se sabe se é porque
      não há pesagem nas datas `2026-08-30`/`2026-09-01` (comportamento
      correto) ou se o overlay não está funcionando; precisa de teste
      dedicado com uma pesagem registrada numa dessas datas exatas.
- [ ] Comparação: foto de um dia **sem** pesagem registrada não mostra
      overlay nenhum (sem placeholder, sem "—", nada).
- [ ] Trocar a data no `<select>` atualiza o overlay de peso junto com a
      imagem, instantaneamente.
- [ ] Overlay legível em foto de fundo claro e em foto de fundo escuro
      (testar com 2 fotos de exemplo diferentes) — o `drop-shadow-md`
      deve bastar nos dois casos; se não bastar em produção, a correção
      é somar um scrim `bg-black/30` atrás do número, não trocar a cor.
- [ ] Grid de histórico (`PhotoHistoryGrid`) **não** mostra peso —
      confirmar que o escopo do overlay ficou restrito à comparação.

**Pendência ativa desta sub-fase, aberta em 02/09/2026:** overlay de peso,
exclusão de foto e sobrescrita no mesmo dia — os 3 itens que o usuário
sinalizou explicitamente como ainda não testados após a primeira rodada de
testes reais. Retomar por aqui na próxima sessão antes de considerar a
Fase 6.1 validada em produção.

Depois de validar o restante em produção: marcar o item no `claude_fases.md`
(Fase 6 — Ticket alto → "Fotos de progresso") e atualizar os checkboxes
acima.

## Pendências / próximos passos sugeridos (não iniciados)

- [ ] Testar o app fim a fim contra um projeto Supabase real (criar projeto, rodar
      `schema.sql` + `migrations/0002_onboarding.sql` + `migrations/0003_body_measurements.sql`
      + `migrations/0004_goals_history.sql` + `migrations/0005_period_mode.sql`
      + `migrations/0006_user_achievements.sql` + `migrations/0007_checkin_hour.sql`
      + `migrations/0008_progress_photos.sql`, configurar `.env.local`, testar
      signup/login/registro de peso, exportação CSV/PDF, importação CSV,
      medidas corporais, metas + histórico, tela de Configurações/período de
      meta, conquistas, horário de check-in, e fotos de progresso.
- [ ] Deploy real na Vercel + configurar Site URL / Redirect URLs no Supabase Auth.
- [ ] Testes unitários para `src/lib/analytics.ts` (funções puras, fáceis de testar).
- [ ] Massa magra/composição corporal mais completa (bioimpedância avançada) — hoje
      `body_measurements.body_fat_pct` cobre só % de gordura manual; sem cálculo ou
      import automático de balança.
- [ ] Notificação (e-mail) quando um KPI fecha "atrás da meta".
- [ ] Fase 3 planos (não iniciada — nome de fase em conflito com a "Fase 3"
      de período/Configurações acima, ver nota lá): ligar os planos pagos
      (`src/lib/pricing.ts`) a cobrança real (Stripe) — hoje todo CTA de
      plano pago só leva pro `/login`, sem gate. Specced em
      `claude_fase3_planos.md`.

## Entregável

Projeto completo entregue como zip em `/mnt/user-data/outputs/peso-em-progresso.zip`
na sessão de 25/08/2026, junto com README.md contendo passo a passo de setup e deploy.
