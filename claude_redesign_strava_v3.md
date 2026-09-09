# claude_redesign_strava_v3.md — Redesign visual "Strava dark" (v3, execution-ready)

> v2 → auditoria contra código real (`project_knowledge_search`: KpiCard.tsx,
> Sidebar.tsx, dashboard/page.tsx, globals.css, tailwind.config.ts,
> TrajectoryGraphic.tsx, Logo.tsx) → v3 incorporando **7 achados**. Pronta
> para handoff ao Claude Code.
>
> Ler antes de codar, não pular etapas, validar com `npx tsc --noEmit` +
> `npm run build` ao final.

## Decisões travadas

1. Redesign completo (tokens + componentes), **dark-only** — tema light intocado.
2. Fundo neutro quase-preto, accent mais saturado, números grandes, cards "stat tile".
3. Grid dos 4 `KpiCard` permanece vertical/empilhado (sem carrossel).
4. Fundo ganha **grão sutil** (noise).
5. `rounded-card` sobe de **14px para 20px**.

---

## Apêndice A — o que mudou do v2 para o v3 (auditoria)

### #A1 — `TrajectoryGraphic.tsx` tem hex hardcoded de `#0B1220` (SEVERIDADE: MÉDIA)

**v2 não mencionava.** O `TrajectoryGraphic.tsx` (landing + onboarding)
usa `fill="#0B1220"` nos pontos de medição (circles) — é o `base-bg`
antigo. Se o `base-bg` do dark muda pra `#0A0A0D`, mas a landing é
dark fixo (sem CSS vars nesse SVG), os pontos ficam com um "anel" do
hex velho, visualmente quase imperceptível mas tecnicamente errado.
**Adicionada seção 5** com o diff pra trocar `#0B1220` → `#0A0A0D` no SVG.

Mesma lógica se aplica ao accent hardcoded nesse SVG: hoje é `#60A5FA`
(azul signal-onpace, já trocado pra `#D97A45` pelo spec
`claude_landing_cor_accent.md`). Com o novo accent `#FF6A33`, precisa
atualizar de novo. **Incluído no mesmo diff da seção 5.**

### #A2 — `Logo.tsx` tem `fill="#0F1512"` hardcoded (SEVERIDADE: BAIXA)

O `LogoIcon` e `LogoHorizontal` usam `fill="#0F1512"` como fundo do
ícone (rect + circle). Isso é um verde-escuro intencional da identidade
do logo, **não** o `base-bg` — o logo renderiza sobre qualquer fundo.
**Nenhuma mudança necessária**: o hex do logo é deliberado e independente
do tema.

### #A3 — `Sidebar.tsx`: item ativo JÁ usa `bg-accent-tint` + `text-accent` (SEVERIDADE: NENHUMA — remover da diretriz)

**v2 propunha como diretriz** "item ativo ganha `bg-accent-tint` +
`rounded-full`". Na auditoria, o código real de `Sidebar.tsx` já tem:

```
active ? "bg-accent-tint font-medium text-accent"
```

com `rounded-lg`, não `rounded-full`. O `bg-accent-tint` + `text-accent`
já está lá. A mudança seria só `rounded-lg` → `rounded-full` no item ativo
**e nos inativos** (todos usam `rounded-lg`). **Promovido a diff verbatim
na seção 6.**

### #A4 — `::selection` usa `rgba(96, 165, 250, 0.35)` — hex do azul antigo (SEVERIDADE: COSMÉTICA)

Atualizar para refletir o novo accent ou um neutro. **Incluído na seção 2.**

### #A5 — `ink-faint` atual `#5B6584` é usado em `TrajectoryGraphic.tsx` pra a linha pontilhada da meta (SEVERIDADE: INFORMATIVA)

O `ink-faint` muda de `#5B6584` → `#5E5E68`. No `TrajectoryGraphic.tsx`
a linha pontilhada usa `stroke="#5B6584"` hardcoded. A diferença é
mínima (azul-acinzentado → neutro-acinzentado). **Incluído no diff da
seção 5** por consistência, mas visualmente quase nulo.

### #A6 — Botão "Registrar pesagem" no dashboard já é `rounded-lg` (SEVERIDADE: INFORMATIVA)

O botão CTA do hero do dashboard usa `rounded-lg`. O v2 mencionava
"considerar trocar pra `rounded-full`" como diretriz. Agora é diff
verbatim na seção 4.

### #A7 — `border-t-signal-*` precisa de `border-base-border` pra pegar as 3 bordas restantes (SEVERIDADE: ALTA)

No v2, o diff do `KpiCard` já inclui `border border-base-border border-t-[3px]
${style.ring}` — `border` aplica a borda default em todas as direções,
`border-base-border` seta a cor default (via `* { border-color: ... }` no
globals.css), e `border-t-[3px] ${style.ring}` sobrescreve só o topo com
a cor do status e espessura maior. **Confirmado correto** — `border`
sozinho já é `1px solid`, e `border-t-[3px]` sobrescreve só a espessura
do topo. Nenhuma mudança necessária aqui, a lógica do v2 funciona.

---

## 1. `tailwind.config.ts`

```diff
       borderRadius: {
-        card: "14px",
+        card: "20px",
       },
```

---

## 2. `src/app/globals.css`

### 2.1 — Tokens de cor dark

OLD:
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
  --accent-glow: rgba(217, 122, 69, 0.25);
  --accent-tint: rgba(217, 122, 69, 0.08);
```

NEW:
```css
:root,
[data-theme="dark"] {
  --base-bg: #0A0A0D;
  --base-surface: #17171C;
  --base-surface2: #212127;
  --base-border: #2C2C33;
  --ink: #F5F5F7;
  --ink-muted: #9C9CA6;
  --ink-faint: #5E5E68;
  --accent: #FF6A33;
  --accent-hover: #FF8657;
  --accent-glow: rgba(255, 106, 51, 0.28);
  --accent-tint: rgba(255, 106, 51, 0.10);
```

Tudo entre `:root,` e a primeira linha de `--badge-*-bg` (que NÃO muda).
O bloco `[data-theme="light"]` **NÃO muda** (fora de escopo).

### 2.2 — Fundo: gradiente decorativo → grão sutil

OLD:
```css
body {
  background-image:
    radial-gradient(circle at 15% -10%, rgba(96, 165, 250, 0.08), transparent 40%),
    radial-gradient(circle at 85% 0%, rgba(52, 211, 153, 0.06), transparent 40%);
}
```

NEW:
```css
body {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
  background-repeat: repeat;
}
```

**Nota**: se o grão ficar visível demais no tema light (tudo claro amplifica
texturas), mover o `background-image` pra dentro de
`[data-theme="dark"] #app-theme-root` e adicionar `background-color: var(--base-bg)`
no seletor — documentado como fallback, não incluído por padrão.

### 2.3 — `::selection` (achado #A4)

OLD:
```css
::selection {
  background: rgba(96, 165, 250, 0.35);
}
```

NEW:
```css
::selection {
  background: rgba(255, 106, 51, 0.30);
}
```

---

## 3. `src/components/KpiCard.tsx`

### 3.1 — `STATUS_STYLES`: borda uniforme → borda superior por status

OLD:
```tsx
const STATUS_STYLES: Record<PeriodKpi["status"], { dot: string; text: string; ring: string }> = {
  ahead: { dot: "bg-signal-ahead", text: "text-[var(--badge-ahead-text)]", ring: "border-signal-ahead/30" },
  on_pace: { dot: "bg-signal-onpace", text: "text-[var(--badge-onpace-text)]", ring: "border-signal-onpace/30" },
  caution: { dot: "bg-signal-caution", text: "text-[var(--badge-caution-text)]", ring: "border-signal-caution/30" },
  behind: { dot: "bg-signal-behind", text: "text-[var(--badge-behind-text)]", ring: "border-signal-behind/30" },
};
```

NEW:
```tsx
const STATUS_STYLES: Record<PeriodKpi["status"], { dot: string; text: string; ring: string }> = {
  ahead: { dot: "bg-signal-ahead", text: "text-[var(--badge-ahead-text)]", ring: "border-t-signal-ahead" },
  on_pace: { dot: "bg-signal-onpace", text: "text-[var(--badge-onpace-text)]", ring: "border-t-signal-onpace" },
  caution: { dot: "bg-signal-caution", text: "text-[var(--badge-caution-text)]", ring: "border-t-signal-caution" },
  behind: { dot: "bg-signal-behind", text: "text-[var(--badge-behind-text)]", ring: "border-t-signal-behind" },
};
```

`signal-*` é hex fixo no `tailwind.config.ts`, então `border-t-signal-ahead`
gera classe válida pelo JIT — **não** cai no bug de opacity-modifier
(documentado na decisão 13 do `CLAUDE.md`), que só afeta cores em `var(--x)`.

### 3.2 — Container do card: borda superior 3px + mais padding

OLD:
```tsx
    <div className={`bg-base-surface border ${style.ring} rounded-card p-4 flex flex-col gap-3`}>
```

NEW:
```tsx
    <div className={`bg-base-surface border border-base-border border-t-[3px] ${style.ring} rounded-card p-5 flex flex-col gap-3`}>
```

### 3.3 — Número principal maior

OLD:
```tsx
            <span className="text-2xl font-bold">
```

NEW:
```tsx
            <span className="text-3xl font-black tracking-tight">
```

---

## 4. `src/app/(app)/dashboard/page.tsx` — hero do peso atual

### 4.1 — Remover glow + subir tamanho

OLD:
```tsx
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight">
```

NEW:
```tsx
            <h1 className="font-display font-black text-6xl sm:text-7xl tracking-tight">
```

### 4.2 — Remover `textShadow` do span do número

OLD:
```tsx
                  <span className="text-ink" style={{ textShadow: "0 0 40px var(--accent-glow)" }}>
```

NEW:
```tsx
                  <span className="text-ink">
```

### 4.3 — Botão CTA: `rounded-lg` → `rounded-full`

OLD:
```tsx
            className="text-sm rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 hover:bg-accent-hover transition"
```

NEW:
```tsx
            className="text-sm rounded-full bg-accent text-base-bg font-medium px-6 py-2.5 hover:bg-accent-hover transition"
```

(`px-5` → `px-6` acompanha o `rounded-full` pra dar mais "espaço de pílula")

---

## 5. `src/components/marketing/TrajectoryGraphic.tsx` — atualizar hex hardcoded (achado #A1, #A5)

O `TrajectoryGraphic` é dark fixo (landing não tem `data-theme`), então usa
hex literal — precisam refletir a nova paleta.

### 5.1 — Comentário do topo

OLD:
```tsx
 * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
 * tailwind.config.ts: accent (dark) #D97A45, ink.faint #5B6584,
 * base.bg #0B1220. Landing é fixa em dark, então usa direto o hex do
 * accent dark (sem var(--accent), que dependeria de data-theme).
```

NEW:
```tsx
 * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
 * tailwind.config.ts: accent (dark) #FF6A33, ink.faint #5E5E68,
 * base.bg #0A0A0D. Landing é fixa em dark, então usa direto o hex do
 * accent dark (sem var(--accent), que dependeria de data-theme).
```

### 5.2 — Gradiente sob a linha real

OLD:
```tsx
          <stop offset="0%" stopColor="#D97A45" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#D97A45" stopOpacity="0" />
```

NEW:
```tsx
          <stop offset="0%" stopColor="#FF6A33" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FF6A33" stopOpacity="0" />
```

**Atenção:** se o `TrajectoryGraphic` ainda tiver `#60A5FA` (azul original)
em vez de `#D97A45` (terracota — spec `claude_landing_cor_accent.md`), o
OLD acima não vai bater. Nesse caso, substitua `#60A5FA` → `#FF6A33`
diretamente. **Ler o arquivo real antes de aplicar `str_replace`.**

### 5.3 — Linha real (stroke)

OLD: `stroke="#D97A45"` (ou `#60A5FA` se accent landing não foi aplicado)
NEW: `stroke="#FF6A33"`

### 5.4 — Pontos de medição (circles)

OLD: `fill="#0B1220"` e `stroke="#D97A45"` (ou `#60A5FA`)
NEW: `fill="#0A0A0D"` e `stroke="#FF6A33"`

### 5.5 — Linha pontilhada da meta (#A5)

OLD: `stroke="#5B6584"`
NEW: `stroke="#5E5E68"`

(2 ocorrências: o `<path>` e o `<text>` "meta")

---

## 6. `src/components/Sidebar.tsx` — `rounded-lg` → `rounded-full` nos itens de navegação (achado #A3)

O item ativo já usa `bg-accent-tint font-medium text-accent` — isso não muda.
A mudança é só o radius pra "pílula":

OLD:
```tsx
    const classes = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
```

NEW:
```tsx
    const classes = `flex items-center gap-3 rounded-full px-3 py-2 text-sm transition ${
```

E o botão de "Ajuda e Suporte" no mesmo componente:

OLD:
```tsx
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-base-surface2 hover:text-ink"
```

NEW:
```tsx
          className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm text-ink-muted transition hover:bg-base-surface2 hover:text-ink"
```

Os botões `bg-accent` dentro da sidebar (cards de rodapé "Ver detalhes"
/ "Ver Planos") também devem trocar `rounded-lg` → `rounded-full`. São
2 ocorrências (uma pro `plan === "pro"`, outra pro else):

OLD (ambas):
```tsx
              className="mt-3 inline-block w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-base-bg transition hover:bg-accent-hover"
```

NEW (ambas):
```tsx
              className="mt-3 inline-block w-full rounded-full bg-accent px-3 py-2 text-xs font-medium text-base-bg transition hover:bg-accent-hover"
```

---

## 7. CTAs globais: `rounded-lg` → `rounded-full` (varredura)

Além do dashboard hero (seção 4.3) e sidebar (seção 6), buscar
`bg-accent text-base-bg` ou `bg-accent-hover` no codebase e trocar
`rounded-lg` → `rounded-full` em cada botão/CTA primário encontrado.

Componentes conhecidos que provavelmente têm CTAs primary:
- `src/app/(app)/dashboard/upgrade/page.tsx` (CTA de checkout)
- `src/components/import/CsvImporter.tsx` ("Escolher arquivo")
- `src/components/photos/PhotoUploadForm.tsx`
- `src/components/onboarding/OnboardingFlow.tsx` (botões "Continuar")
- `src/app/page.tsx` (landing — CTAs do hero/pricing/finalcta)
- Formulários de metas, medidas, etc.

**Instrução para o Claude Code:** fazer
`grep -rn "rounded-lg.*bg-accent\|bg-accent.*rounded-lg" src/` e trocar
cada ocorrência por `rounded-full`. **Não trocar** `rounded-lg` em
elementos que NÃO são botões primários (inputs, cards, containers) — o
`rounded-card` (20px) cuida desses via token.

---

## 8. Checklist de validação

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Contraste dos 4 badges de status (`KpiCard`) contra o novo
      `--base-surface` (`#17171C`) — deve melhorar (fundo mais escuro).
- [ ] `border-t-signal-*` renderiza borda superior de 3px, cor certa.
- [ ] Grão visível mas discreto; não parece "sujeira" em cards.
- [ ] Tema light: abrir `/dashboard` com `data-theme="light"`, confirmar
      zero quebra (exceto grão global — ver nota da seção 2.2).
- [ ] Hero sem glow, `text-6xl sm:text-7xl font-black`.
- [ ] `rounded-card` 20px global (cards, modais).
- [ ] CTAs primary em `rounded-full` (botões de ação em pílula).
- [ ] Landing: grão não pesado demais; `TrajectoryGraphic` com accent
      `#FF6A33` (laranja) e `fill="#0A0A0D"` nos pontos.
- [ ] `Sidebar.tsx`: itens de nav em `rounded-full`.
- [ ] `::selection` com o novo accent.

## O que NÃO muda

- Tema light completo.
- `signal-*`, `--badge-*-bg/text`.
- Fontes carregadas (só peso/tamanho de uso).
- `analytics.ts`, schema, RLS — zero mudança funcional.
- PDF exportado.
- `Logo.tsx` (hex são deliberados da identidade, não do tema).
