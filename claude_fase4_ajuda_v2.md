# Spec — Fase 4.4: Guia de ajuda revisitável

**Status:** v2. Auditada apenas como **revisão de consistência interna** (ver
Apêndice A) — ainda **não** auditada contra o código real, porque os arquivos
`.tsx`/`.ts` do repo não estavam disponíveis nesta sessão (só
`schema.sql`/`CLAUDE.md`/`claude_fases.md` via project knowledge). Os itens do
Apêndice A marcados como "pendente de confirmação" precisam do passe de
auditoria completo (spec vs. arquivos reais) antes do handoff ao Claude Code.

Quarta e última sub-fase da Fase 4 (Gamificação e engajamento): streak (4.1) →
conquistas (4.2) → próximo check-in (4.3) → **guia de ajuda (4.4)**. Com essa
sub-fase, a Fase 4 fecha por completo.

## Contexto

Da Fase 4 no `claude_fases.md`: "Guia de ajuda revisitável (não é o onboarding
de 3 telas refeito — é uma tela/modal sempre acessível pelo menu, sem gravar
nada em `profiles`, explicando os 4 status de KPI e o conceito central do
produto; reaproveita `KPI_STATUSES` (`src/lib/kpi-status.ts`), já usado hoje
por onboarding e landing)".

Diferente das 3 sub-fases anteriores, esta **não mexe em banco** — é só
conteúdo + UI. `KPI_STATUSES` já é reaproveitado em pelo menos 2 lugares hoje
(onboarding, seção "Como funciona" da landing — `HowItWorks` em
`src/app/page.tsx`), então o padrão de reaproveitar a mesma constante em vez de
duplicar texto já está estabelecido no projeto; este spec segue o mesmo
caminho.

## Decisões fechadas (não reabrir sem motivo)

1. **Modal, não tela dedicada.** `ConfirmDialog.tsx` (Fase 3) já é o primeiro
   modal do projeto — reaproveitar o mesmo padrão de overlay
   (`bg-black/50` fixo, decisão 17 do `CLAUDE.md`) para consistência visual,
   em vez de criar um segundo padrão de modal do zero. Diferente do
   `ConfirmDialog`, este modal **não tem ação destrutiva nem confirmação** —
   é só leitura, então não precisa de botões "Cancelar"/"Confirmar", só um
   "Fechar" (ou X no canto).
2. **Gatilho: novo link "Ajuda" no `NavBar.tsx`** (array `links`), 6º link —
   mesmo padrão de "Configurações" (5º, Fase 3) e "Medidas" (Fase 2.2). Abre o
   modal no clique, não navega pra rota nova (diferente dos outros 5 links,
   que são navegação real). O `ThemeToggle` no `NavBar.tsx` já alterna atributo
   DOM diretamente via JS (decisão 315 do `CLAUDE.md`), indicando fortemente
   que `NavBar.tsx` já é client component — se confirmar na auditoria contra
   o código real, o `useState` de `isHelpOpen` cabe direto; ver Apêndice A
   item 1.
3. **Conteúdo: os 4 status de KPI (via `KPI_STATUSES`) + as novidades da Fase
   4** (streak, conquistas, check-in preferido) — não só o escopo original do
   roadmap (que previa só KPI, escrito antes da Fase 4 existir). Racional:
   faz sentido o guia cobrir tudo que é "conceito central do produto" hoje,
   não só o que existia quando a frase foi escrita no roadmap; deixar de fora
   streak/conquistas/check-in deixaria o guia desatualizado no dia em que for
   lançado.
4. **Sem gravar nada em `profiles`** — reafirmando o que já está no roadmap.
   Diferente do onboarding (`onboarded_at`), abrir/fechar o guia não deixa
   rastro nenhum no banco. É estado 100% local (`useState` no componente que
   controla se o modal está aberto).
5. **Não é o onboarding refeito** — o onboarding é sequencial (4 telas agora,
   desde a Fase 3 que adicionou `StepPeriodMode`, com botão "Próximo"). O guia
   é uma leitura única, tudo visível de uma vez (com scroll interno se
   precisar), sem paginação — é consulta rápida, não um fluxo guiado.
6. **Grid de KPI usa classes literais de `KPI_STATUSES`** (`s.dot`/`s.text`),
   **não** classe Tailwind dinâmica tipo `` `bg-${status.tone}` `` — esse erro
   já foi cometido uma vez na landing (`HowItWorks`) e corrigido (documentado
   no `CLAUDE.md`, seção "Landing — seção Como funciona"). O mesmo bug foi
   quase reintroduzido no `KpiWeeklyTeaser.tsx` e novamente corrigido. É uma
   armadilha recorrente do projeto que merece atenção explícita no spec.

## Migração SQL

Nenhuma — esta sub-fase não toca no banco.

## Mudanças de tipos

Nenhuma — não há novo dado persistido.

## Diffs função a função

### 1. `src/components/HelpModal.tsx` (novo arquivo)

Client component (`"use client"` — precisa de render condicional baseado em
`isOpen`).

- Props: `isOpen: boolean`, `onClose: () => void`. **Pendente de confirmação
  (Apêndice A item 2):** confirmar que `ConfirmDialog.tsx` já usa esse exato
  contrato de props; se usar nomes diferentes (ex.: `open`/`onConfirm`/
  `onCancel`), adaptar pra manter os dois modais com a mesma "forma" de API
  onde fizer sentido (o `HelpModal` não tem `onConfirm`, mas o padrão de
  `isOpen`/`onClose` deve ser o mesmo).
- Render condicional: `if (!isOpen) return null;` — mesmo padrão que o
  `ConfirmDialog` provavelmente já usa (não montar nada no DOM quando
  fechado).
- Overlay: `bg-black/50` fixo (nota: `black` é cor literal do Tailwind, não
  `var(--x)`, então o modificador `/50` funciona — diferente da armadilha do
  item 13 das decisões do `CLAUDE.md` com `accent/50`). **Pendente de
  confirmação (Apêndice A item 3):** se `ConfirmDialog` fecha ao clicar fora
  do painel — replicar o mesmo comportamento, não inventar um diferente.
- Scroll: `overflow-y-auto` no painel do conteúdo (não no overlay), com
  `max-h-[85vh]` ou equivalente — o conteúdo pode ser mais longo que a
  viewport em mobile, já que inclui a grid de KPI + 3 seções da Fase 4.
  **Não** usar scroll no body/overlay inteiro (o fundo deve permanecer fixo).
- Estrutura do conteúdo, em ordem:
  1. **Título:** "Como o Peso em Progresso funciona" (ou variante curta —
     `font-display`, consistente com os outros títulos do dashboard).
  2. **Conceito central:** meta por período → comparação com progresso real →
     status semáforo. Mesmo texto narrativo de 3 passos da landing
     (`HowItWorks`): "Defina sua meta → Registre seu peso → Veja se está no
     ritmo". Reaproveitar a ideia do texto, não copiar o JSX da landing (o
     `HelpModal` é um componente diferente com layout próprio).
  3. **Grid dos 4 status de KPI**, iterando `KPI_STATUSES` de
     `src/lib/kpi-status.ts` — usar `s.dot`/`s.text` (classes literais já
     resolvidas), **não** `` `bg-${status.tone}` `` (decisão 6 acima). Mesmo
     padrão de renderização já usado em `HowItWorks` (landing) e no
     onboarding — **pendente de confirmação (Apêndice A item 4):** ver como
     o `.map()` de `KPI_STATUSES` é feito nos usos existentes pra replicar o
     mesmo approach, não reinventar.
  4. **Seção "Acompanhamento diário"** (texto estático, não vindo de constante
     — não há `STREAK_INFO`/`ACHIEVEMENTS_INFO` equivalente a `KPI_STATUSES`):
     - **Sequência de registros (streak):** o que é, como a tolerância de 1 dia
       funciona (sem registro hoje, sequência só quebra se ontem também não
       tiver), e que registros importados por CSV também contam.
     - **Conquistas:** que existem 7 no total (3 de perda absoluta, 4 de % do
       peso alvo), que uma vez desbloqueada nunca é revogada (mesmo se o peso
       subir depois), e que as de % precisam de peso alvo definido em "Metas".
     - **Horário de check-in:** que é opcional, configurável em "Configurações",
       e que o aviso "já passou do seu horário de registro" aparece junto da
       sequência quando o horário definido já passou e ainda não registrou hoje.
  5. **Botão "Fechar"** — `bg-accent hover:bg-accent-hover` (mesmo padrão de
     botão primário já usado em todo o app), centralizado abaixo do conteúdo.
- **Acessibilidade mínima:** `role="dialog"`, `aria-modal="true"`,
  `aria-label` com o título. Fechar com Escape (`onKeyDown` no overlay ou
  `useEffect` com listener global — **pendente de confirmação (Apêndice A
  item 5):** ver se `ConfirmDialog` já tem esse handler, pra replicar o
  mesmo approach e não ter dois padrões de keyboard-dismiss no projeto).

### 2. `src/lib/kpi-status.ts`

Nenhuma mudança de código — só reaproveitar `KPI_STATUSES` como já é feito em
2 lugares. **Pendente de confirmação (Apêndice A item 4):** confirmar que a
constante é um array com props iteráveis via `.map()` e quais são os campos
exatos (`dot`, `text`, `label`, `description`, etc.) — o `CLAUDE.md` menciona
`s.dot`/`s.text` mas pode haver mais campos úteis pro `HelpModal`.

### 3. `src/components/NavBar.tsx`

- Novo item no array `links` (ou estrutura equivalente): rótulo `"Ajuda"`,
  mas com comportamento de abrir modal em vez de `<Link href="...">`.
  Implementação depende de como o `.map()` de links funciona hoje:
  - Se todos os itens viram `<Link>`, adicionar um campo discriminador
    (ex.: `action: "modal"` vs. `href: string`) e um branch condicional no
    `.map()`: itens com `href` viram `<Link>`, o de "Ajuda" vira
    `<button onClick={() => setIsHelpOpen(true)}>` com os mesmos estilos
    visuais do `<Link>` (pra não parecer um botão estranho no meio dos
    links).
  - **Pendente de confirmação (Apêndice A item 1):** estrutura real do array
    `links` e se já há algum item que não é navegação pura (pra não ser o
    primeiro a quebrar o padrão sem necessidade).
- Estado `isHelpOpen` via `useState(false)` — o `ThemeToggle` já existe
  dentro do `NavBar.tsx` e manipula DOM diretamente, o que indica fortemente
  que já é client component. Se por algum motivo for server component, o
  botão "Ajuda" + `HelpModal` + `useState` precisam viver num sub-componente
  client-only renderizado dentro do `NavBar` — mas isso é o cenário menos
  provável.
- `<HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />`
  renderizado **fora** do `<nav>` (dentro do componente `NavBar`, mas
  depois do `</nav>` — é um overlay `fixed` de qualquer jeito, não faz
  parte do fluxo de navegação e não deve estar dentro do `<nav>` semântico).
- **Mobile (6 links):** o `overflow-x-auto` + `whitespace-nowrap` adicionado
  na Fase 3 pra 5 links deve continuar funcionando com 6, já que é scroll
  horizontal genérico — mas vale conferir visualmente que o 6º link não cai
  fora do alcance do polegar num celular estreito.

## Callers afetados (lista explícita)

- `src/components/HelpModal.tsx` — novo arquivo
- `src/components/NavBar.tsx` — novo item de menu + `useState` + import/render
  de `HelpModal`
- `src/lib/kpi-status.ts` — sem mudança, só import/reuso
- **Nenhum outro arquivo** — não toca em `loadUserData.ts`, `database.ts`,
  `dashboard/page.tsx`, nem nenhuma rota de API. É a sub-fase mais isolada da
  Fase 4 (as outras 3 mexeram em banco + `loadUserData` + tipos).

## Fora de escopo (explícito)

- Qualquer persistência de "já vi o guia" — sempre disponível, sem gate.
- Busca/índice dentro do modal (conteúdo é curto o suficiente pra não
  precisar).
- Vídeo ou GIF explicativo — só texto, mesmo formato do onboarding/landing.
- Reescrever o onboarding de 4 telas para reaproveitar o `HelpModal` (são
  propositalmente fluxos diferentes, decisão 5 acima).
- Atualizar a landing (`HowItWorks`) para mencionar streak/conquistas/
  check-in — a landing é pré-cadastro, esse conteúdo é só pós-cadastro
  (dashboard); fora de escopo aqui.
- Internacionalização/múltiplos idiomas do conteúdo do guia.
- Conquistas baseadas em streak ou medidas corporais (fora do scope atual de
  conquistas, decisão da Fase 4.2).

## Checklist de teste

1. Link "Ajuda" aparece no `NavBar` (desktop e mobile), 6º item, sem quebrar
   o layout — mobile com scroll horizontal funcionando (regressão da Fase 3,
   agora com 1 link a mais).
2. Clicar em "Ajuda" abre o modal; clicar em "Fechar" (e/ou clicar fora, se
   for o comportamento confirmado do `ConfirmDialog`) fecha. Tecla Escape
   também fecha (se `ConfirmDialog` tiver esse comportamento, replicar;
   senão, adicionar e documentar como melhoria incremental).
3. Modal mostra a grid dos 4 status de KPI com as cores/textos corretos —
   comparar visualmente com a mesma grid já existente na landing/onboarding
   (devem ser consistentes, mesma fonte de dados).
4. Seção da Fase 4 (streak/conquistas/check-in) presente e com texto
   compreensível pra quem nunca usou essas features ainda (conta nova sem
   nenhum dado).
5. Conteúdo cabe na viewport em mobile sem overflow horizontal; scroll
   vertical interno funciona se o conteúdo passar de `max-h-[85vh]`.
6. Abrir o modal, navegar pra outra página do dashboard, voltar — modal
   fechado por padrão (estado `isHelpOpen` reseta com a navegação, já que é
   `useState` local do `NavBar`).
7. Nenhuma escrita no banco ao abrir/fechar o modal — conferir na aba
   Network/Supabase logs que não dispara nenhum `update`/`insert`.
8. Alternar tema claro/escuro com o modal aberto — contraste do overlay e do
   conteúdo adequado nos dois temas (mesmo cuidado já validado pro
   `ConfirmDialog` na Fase 3). Atenção especial à grid de KPI: as cores
   `s.dot`/`s.text` de `KPI_STATUSES` devem usar `--badge-*-text` em
   light (decisão 12 do `CLAUDE.md`, contraste WCAG AA), não `text-signal-*`
   puro.
9. `npx tsc --noEmit` e `npm run build` limpos.

## Passos de execução (ordem)

1. Confirmar contra o código real: assinatura de props do `ConfirmDialog.tsx`,
   se `NavBar.tsx` já é client component, estrutura do array `links`,
   estrutura iterável de `KPI_STATUSES`, e se `ConfirmDialog` tem
   close-on-click-outside / close-on-Escape.
2. `HelpModal.tsx` — novo componente, conteúdo estático + grid de
   `KPI_STATUSES` + seção Fase 4.
3. `NavBar.tsx` — novo item "Ajuda" (botão, não link) + `useState` +
   render de `HelpModal`.
4. Rodar `tsc --noEmit` + `npm run build`.
5. Validar a checklist acima num navegador real (esta sub-fase, por não
   mexer em banco, pode ser validada inteiramente no ambiente local/preview,
   sem depender de rodar migração em produção).
6. Atualizar `CLAUDE.md` (seção Fase 4.4 — e fechar a seção geral da Fase 4,
   já que é a última sub-fase) e `claude_fases.md` (marcar os 4 itens da Fase
   4 como concluídos).

## Apêndice A — Achados da revisão de consistência (v1 → v2)

Revisão interna do spec (contradições, lacunas, desvios de convenção
documentados no `CLAUDE.md`), **não** auditoria contra o código real. Itens
1–5 continuam pendentes de confirmação contra o repo antes do handoff ao
Claude Code.

### Achados pendentes de confirmação

1. **`NavBar.tsx` — client ou server component?** O `ThemeToggle` está
   _dentro_ do `NavBar.tsx` (conforme `CLAUDE.md`: "`ThemeToggle`
   (`src/components/NavBar.tsx`)") e manipula DOM diretamente, o que indica
   fortemente que o arquivo já tem `"use client"`. Se já for client component,
   basta `useState`; se for server component com `ThemeToggle` como
   sub-componente client-only importado, o botão "Ajuda" + `HelpModal`
   precisam do mesmo tratamento (sub-componente client-only). A
   probabilidade de ser client é alta, mas sem ver o arquivo não é 100%.
   **Também pendente:** se o array `links` é iterado via `.map()` e todos
   os itens viram `<Link>`, ou se já existe algum item com comportamento
   diferente. O spec propõe um campo discriminador, mas pode ser mais simples
   que isso (ex.: o "Ajuda" pode ficar fora do `.map()` como botão avulso,
   se a estrutura favorecer).
2. **Props do `ConfirmDialog.tsx`.** O `CLAUDE.md` não registra a assinatura
   de props — só que é overlay + `bg-black/50` + botões confirmar/cancelar +
   dispara só quando valor mudou. Pendente: nomes exatos (`isOpen`/`open`,
   `onClose`/`onCancel`/`onDismiss`, etc.).
3. **Close-on-click-outside no `ConfirmDialog`.** O `CLAUDE.md` não menciona
   se o `ConfirmDialog` fecha ao clicar no overlay ou só pelos botões. Como
   o `ConfirmDialog` é para ações destrutivas, pode intencionalmente _não_
   fechar no overlay (pra evitar dismiss acidental). O `HelpModal` é leitura
   pura, então faz sentido fechar no overlay _mesmo que_ o `ConfirmDialog`
   não feche — mas essa diferença de comportamento precisa ser consciente,
   não acidental. Verificar e documentar a escolha.
4. **Estrutura de `KPI_STATUSES`.** O `CLAUDE.md` menciona `s.dot`/`s.text`
   como props usadas na landing e no onboarding. Pode haver outros campos
   úteis (`label`, `description`, `key`/`status`, etc.) que o `HelpModal`
   deveria usar pro texto explicativo de cada status, em vez de hardcodar.
   Verificar o formato real.
5. **Close-on-Escape.** Não mencionado no `CLAUDE.md` pra `ConfirmDialog`.
   Bom padrão de acessibilidade; se `ConfirmDialog` já tem, replicar; se
   não, adicionar ao `HelpModal` e considerar backport ao `ConfirmDialog`
   (fora de escopo desta sub-fase, mas anotar como dívida técnica).

### Correções já aplicadas nesta versão (resolvidas no texto acima)

- **Número de telas do onboarding corrigido de "3" para "4"** — o v1 dizia
  "3-4 telas" na decisão 5; desde a Fase 3, o onboarding tem 4 steps
  (`StepPeriodMode` adicionado). Corrigido pra "4" fixo.
- **Armadilha de classe Tailwind dinâmica** elevada a decisão numerada
  (decisão 6), com referência cruzada ao `KpiWeeklyTeaser.tsx` (Fase
  dashboard teaser) e `HowItWorks` (landing) — ambos já tiveram esse bug e
  corrigiram. É recorrente o suficiente pra merecer destaque no spec, não só
  menção inline.
- **Scroll interno do modal** adicionado (não estava no v1): `max-h-[85vh]`
  + `overflow-y-auto` no painel, não no overlay — o conteúdo agora inclui
  grid de KPI + 3 seções da Fase 4, podendo exceder a viewport em mobile.
- **Acessibilidade mínima** adicionada (`role="dialog"`, `aria-modal`,
  `aria-label`, close-on-Escape) — v1 não mencionava; é padrão básico de
  modal e evita dívida técnica pra resolver depois.
- **Posição do `<HelpModal>` no JSX** explicitada: fora do `<nav>`, dentro
  do componente `NavBar` — é overlay `fixed`, não faz parte do fluxo de
  navegação semântico.
- **Botão "Fechar" com `bg-accent`** explicitado — v1 deixava "Fechar (ou X
  no canto)" ambíguo; o v2 padroniza com o botão primário do app (mesma cor
  accent já usada em todo CTA).
- **Checklist de contraste de KPI em light** adicionado (item 8): as cores
  de status usam `--badge-*-text` em light mode, não `text-signal-*` puro
  (decisão 12 do `CLAUDE.md`, contraste WCAG AA ~2:1 do amarelo). O v1 não
  tinha esse teste.
- **Checklist de scroll mobile** adicionado (item 5): o conteúdo pode ser
  longo, especialmente com as 3 seções da Fase 4 adicionadas ao escopo.
