# Fase 1.2 — Modo escuro/claro (accent terracota)

> Formato: instruções para Claude Code executar em `~/ambiente_virtual/peso-em-progresso`.
> Segue o mesmo padrão de `claude_fase0.md` — ler antes de codar, não pular etapas,
> validar com `tsc --noEmit` + `next build` ao final.

## Contexto

O app hoje é dark-only, tokens definidos em `tailwind.config.ts`. Esta fase adiciona
um tema light com identidade **terracota** (aprovado visualmente por mockup em
28/08/2026), toggle manual persistido em cookie (SSR-safe, sem flash), e mantém os
4 tokens `signal-*` (status de KPI) semanticamente iguais nos dois temas — só o
`accent` (cor de ação/marca) é novo e compartilhado pelos dois temas.

**Não reabrir sem motivo:** a decisão de usar terracota como accent (em vez de manter
o azul `signal-onpace` como cor de ação) foi validada visualmente com o usuário.

## 1. Novos tokens em `tailwind.config.ts`

Adicionar ao `theme.extend.colors`, mantendo os tokens `base`/`ink`/`signal` existentes
intocados (eles descrevem o dark atual — no passo 2 eles viram CSS vars com override
via `data-theme`, não são deletados do config, só passam a ser referenciados como var).

```ts
colors: {
  base: {
    bg: "var(--base-bg)",
    surface: "var(--base-surface)",
    surface2: "var(--base-surface2)",
    border: "var(--base-border)",
  },
  ink: {
    DEFAULT: "var(--ink)",
    muted: "var(--ink-muted)",
    faint: "var(--ink-faint)",
  },
  signal: {
    ahead: "#34D399",
    onpace: "#60A5FA",
    caution: "#FBBF24",
    behind: "#FB7185",
  },
  accent: {
    DEFAULT: "var(--accent)",
    hover: "var(--accent-hover)",
  },
},
```

`signal-*` fica com hex literal fixo (não vira CSS var) — são iguais nos dois temas,
não precisam indireção. `base`/`ink`/`accent` viram CSS vars porque mudam por tema.

## 2. CSS vars por tema — `src/app/globals.css`

Adicionar no topo do arquivo (antes das `@tailwind` directives ou logo depois, conforme
convenção já usada no arquivo):

```css
:root,
[data-theme="dark"] {
  --base-bg: #0B1220;
  --base-surface: #141B2D;
  --base-surface2: #1B2438;
  --base-border: #26314A;
  --ink: #E7ECF7;
  --ink-muted: #8C97B4;
  --ink-faint: #5B6584;
  --accent: #D97A45;
  --accent-hover: #E08B5C;
}

[data-theme="light"] {
  --base-bg: #FAF3EC;
  --base-surface: #FFFFFF;
  --base-surface2: #F3E7DB;
  --base-border: #E4D2C0;
  --ink: #3A2A1F;
  --ink-muted: #8A7362;
  --ink-faint: #B4A192;
  --accent: #C1652F;
  --accent-hover: #A8531F;
}
```

`:root` já vem com os valores dark como default — isso é o que evita flash antes do
script inline (passo 4) rodar: mesmo sem JS, o app renderiza no tema dark (que é o
tema atual/conhecido), nunca num terceiro estado indefinido.

### Badges de status (bg tint + texto shade) — novo utilitário

Os badges de KPI (`adiantado/no ritmo/atenção/atrasado`) usam hoje `bg-signal-x/15`
(opacity) + `text-signal-x` no dark — isso funciona porque o fundo é escuro. Em fundo
claro, texto `signal-*` puro sobre tint claro quebra contraste (especialmente
`caution` amarelo, ~2:1, abaixo do WCAG AA). Adicionar tokens dedicados de badge:

```css
:root,
[data-theme="dark"] {
  --badge-ahead-bg: rgba(52, 211, 153, 0.15);
  --badge-ahead-text: #34D399;
  --badge-onpace-bg: rgba(96, 165, 250, 0.15);
  --badge-onpace-text: #60A5FA;
  --badge-caution-bg: rgba(251, 191, 36, 0.15);
  --badge-caution-text: #FBBF24;
  --badge-behind-bg: rgba(251, 113, 133, 0.15);
  --badge-behind-text: #FB7185;
}

[data-theme="light"] {
  --badge-ahead-bg: #DCEFE1;
  --badge-ahead-text: #1F6E45;
  --badge-onpace-bg: #E1E9F5;
  --badge-onpace-text: #33538F;
  --badge-caution-bg: #F7E6C9;
  --badge-caution-text: #8A5A0B;
  --badge-behind-bg: #F5DAD1;
  --badge-behind-text: #A3402A;
}
```

Qualquer componente que hoje monta a classe do badge dinamicamente a partir de
`STATUS` (provavelmente `KpiCard.tsx` e o mapeamento em `src/lib/kpi-status.ts`)
precisa trocar `bg-signal-x/15 text-signal-x` por essas vars — via `style` inline
(`backgroundColor: 'var(--badge-ahead-bg)'` etc.) já que Tailwind não gera classes
dinâmicas de CSS var por padrão sem safelist. **Ler `src/lib/kpi-status.ts` antes de
editar** para não reinventar a estrutura existente — só trocar a fonte da cor.

## 3. Toggle: cookie + Server Component + Context

**Cookie**, não localStorage (decisão já tomada) — precisa estar disponível no
primeiro render do servidor pra não piscar.

### 3.1 — `src/lib/theme.ts` (novo)

```ts
export type Theme = "dark" | "light";
export const THEME_COOKIE = "peso-theme";
export const DEFAULT_THEME: Theme = "dark";

export function isValidTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}
```

### 3.2 — Ler cookie no layout do app (não no layout raiz compartilhado)

**Arquitetura:** o projeto usa single-deploy com middleware host-based (decisão 6 do
`CLAUDE.md`), ou seja, um único `src/app/layout.tsx` com uma tag `<html>` para landing
e app. Mas como o toggle é exclusivo do `app.*` e a landing deve permanecer dark-only,
**não aplicar `data-theme` no `<html>` raiz**. Em vez disso:

1. Ler o cookie no layout específico do app (ex.: `src/app/(app)/layout.tsx` se existir
   route group, ou no componente wrapper equivalente que envolve as rotas do dashboard).
2. Aplicar `data-theme` num **`<div>` wrapper** dentro desse layout, não no `<html>`.
   Os seletores CSS `[data-theme="dark"]`/`[data-theme="light"]` do passo 2 funcionam
   em qualquer elemento ancestral — não precisa ser `<html>`.
3. Se a estrutura de pastas não tiver route group separado, criar um wrapper client
   component que recebe `theme` como prop e renderiza `<div data-theme={theme}>`.

**Ler a estrutura real de `src/app/` para confirmar onde inserir o wrapper**, mas o
princípio é fixo: `data-theme` vai no wrapper do app, nunca no `<html>` raiz.

**Constante do seletor DOM para o toggle:** como `data-theme` vai num wrapper (não no
`<html>`), o `ThemeToggle` (passo 3.4) precisa encontrar esse wrapper em vez de usar
`document.documentElement`. A solução é dar um `id` fixo ao wrapper
(`id="app-theme-root"`) e usar `document.getElementById("app-theme-root")` no toggle.
Ver passo 3.4 para o código correspondente.

No Server Component correspondente, ler o cookie via `cookies()` (`next/headers`) e
passar o tema ao wrapper:

```tsx
import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, isValidTheme } from "@/lib/theme";

// dentro do layout do app (não o layout raiz):
const cookieStore = await cookies();
const rawTheme = cookieStore.get(THEME_COOKIE)?.value;
const theme = isValidTheme(rawTheme) ? rawTheme : DEFAULT_THEME;

return (
  <div id="app-theme-root" data-theme={theme}>
    {children}
  </div>
);
```

Nota: `await cookies()` é a forma forward-compatible para Next 14.2.x+ / Next 15
(sem `await` funciona em 14.2.35 mas emite deprecation warning). Usar `await` desde já.

Isso já resolve SSR sem flash: o HTML chega do servidor com o `data-theme` correto
antes de qualquer JS rodar. **Não precisa de script inline anti-flash** — essa técnica
(comum em apps client-only) é necessária só quando o tema vem de `localStorage`, que
o servidor não enxerga. Como aqui é cookie lido no servidor, o SSR já acerta de
primeira. (Isso simplifica a spec original — vale registrar essa decisão no
`CLAUDE.md` ao final: "não precisou de script anti-flash por usar cookie SSR-read
em vez de localStorage".)

### 3.3 — Server Action para alternar o tema — `src/lib/theme-actions.ts` (novo)

```ts
"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, isValidTheme } from "@/lib/theme";

export async function setTheme(theme: string) {
  // Server Actions recebem input arbitrário do client — validar antes de usar.
  // Se inválido, seta o default em vez de gravar lixo no cookie.
  const safeTheme = isValidTheme(theme) ? theme : DEFAULT_THEME;
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, safeTheme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
```

Nota: a assinatura é `theme: string` (não `Theme`) porque Server Actions recebem
dados serializados do client sem garantia de tipo — a validação com `isValidTheme()`
é o que garante a segurança. `await cookies()` é forward-compatible com Next 15.

Nota: este é o único ponto da feature que usa Server Action — o resto do app usa
chamadas client-side ao Supabase (`GoalsForm.tsx` como padrão estabelecido), mas
setar cookie httpOnly-safe a partir do client exige Server Action ou Route Handler;
Server Action é mais simples aqui e não mexe em dado de usuário/Supabase, só em
preferência de UI, então não quebra o padrão arquitetural do projeto.

### 3.4 — Componente toggle — `src/components/ThemeToggle.tsx` (novo, client component)

```tsx
"use client";

import { useTransition } from "react";
import { type Theme } from "@/lib/theme";
import { setTheme } from "@/lib/theme-actions";

export function ThemeToggle({ current }: { current: Theme }) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next: Theme = current === "dark" ? "light" : "dark";
    // Aplica no wrapper do app (id definido no passo 3.2), não no <html> raiz
    document.getElementById("app-theme-root")?.setAttribute("data-theme", next);
    startTransition(() => {
      setTheme(next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={current === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="rounded-card border border-base-border px-3 py-2 text-ink-muted hover:text-ink transition-colors"
    >
      {current === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
```

Aplicar o `data-theme` direto no DOM (no wrapper `#app-theme-root` definido no passo
3.2) antes do Server Action resolver — evita esperar o round-trip do servidor pra UI
reagir. `useTransition` evita bloquear a UI durante a chamada.

Passar `current={theme}` a partir do layout raiz (Server Component → Client Component,
prop simples, sem Context API necessário — o app não tem tantos client components
profundamente aninhados que precisem ler o tema fora de CSS vars, que já são globais).

### 3.5 — Onde colocar o toggle

`NavBar.tsx` (mencionado em `CLAUDE.md` como o componente com `handleSignOut`) — mesmo
lugar que outros controles globais de conta. Confirmar layout exato lendo o arquivo
real antes de inserir.

## 4. Ajuste de contraste: `signal-caution` em texto solto

Onde `signal-caution` (`#FBBF24`) aparecer como cor de **texto direto sobre fundo
claro** (não badge — badge já resolvido no passo 2), substituir por `--badge-caution-text`
(`#8A5A0B` no light) em vez do hex puro. Buscar usos de `text-signal-caution` no
código (`grep -rn "text-signal-caution" src/`) e avaliar caso a caso — em fundo
`base.surface` claro, texto amarelo puro não passa WCAG AA.

## 5. Checklist de componentes a revisar

Buscar por hex literais ou classes `bg-base-*`/`text-ink-*` hardcoded que não passem
pela variável (o objetivo é que **nenhum componente** tenha cor fixa fora dos tokens):

- [ ] `KpiCard.tsx` — badges de status (passo 2)
- [ ] `dashboard/page.tsx` — destaque `text-5xl/6xl` do peso atual, badge de tendência
- [ ] Gráfico Recharts (`h-96`) — cores de linha/eixo/grid provavelmente hardcoded
      em hex no componente de chart, não em Tailwind class — Recharts recebe cor via
      prop `stroke`/`fill`, não className, então precisa ler CSS var em runtime via
      `getComputedStyle` ou passar a cor certa condicionalmente por tema
- [ ] `EntriesList` / histórico com diff dia a dia — cores de "subiu"/"desceu" (se
      usarem `signal-ahead`/`signal-behind` direto, conferir contraste em light)
- [ ] `GoalsForm.tsx` — mensagem "Metas atualizadas" (auto-hide 3s) — cor de sucesso
- [ ] `ExportButtons.tsx` — se tiver ícones/cores fixas
- [x] Landing (`/`) — **fora de escopo, decisão confirmada**: o toggle fica
      exclusivamente em `app.*`. A landing pública mantém o visual fixo atual
      (dark), sem `ThemeToggle` nem leitura de cookie de tema. Não aplicar
      `data-theme` dinâmico no layout da landing.

**Não incluído nesta fase (fora de escopo):** cores do PDF exportado
(`STATUS_COLOR` em `ExportDocument.tsx`) — o PDF é um artefato estático gerado
server-side sem conceito de "tema do usuário no momento do export"; mantém a paleta
dark fixa que já usa hoje, a menos que o usuário peça explicitamente para variar.

## 6. Validação

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run build` limpo
- [ ] Alternar tema em `/dashboard`, `/dashboard/entries`, `/dashboard/goals`,
      `/onboarding` — nenhum elemento com cor hardcoded "vazando" o tema errado
- [ ] Reload da página com tema light já setado — confirmar que não há flash de dark
      antes do light (deve estar correto de primeira, por vir do cookie lido no SSR)
- [ ] Testar com cookies bloqueados/3rd-party-cookies restritos no navegador —
      degrada pra `DEFAULT_THEME` (dark) sem erro
- [ ] Contraste dos 4 badges de status nos dois temas (visual, WCAG AA como guia)
- [ ] Gráfico Recharts legível nos dois temas (linha, eixos, tooltip)

## 7. Atualizar `CLAUDE.md` ao final

Adicionar em "Decisões importantes":
- Accent terracota (`#C1652F` light / `#D97A45` dark) escolhido sobre o azul
  `signal-onpace` como cor de ação, validado visualmente com o usuário em 28/08/2026.
- Toggle de tema é exclusivo do `app.*` — a landing pública não tem `ThemeToggle` e
  permanece com o visual dark fixo atual, decisão confirmada com o usuário.
- Tema via cookie lido no Server Component raiz — sem necessidade de script anti-flash
  (diferente do padrão comum de localStorage + script inline).
- `signal-*` (status de KPI) permanecem com hex fixo, iguais nos dois temas — só
  badges ganharam par bg/text dedicado (`--badge-*`) para resolver contraste em fundo
  claro; texto solto em `signal-caution` também remapeado por segurança de contraste.
