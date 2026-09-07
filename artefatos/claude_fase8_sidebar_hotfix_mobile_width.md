# Spec — Fase 8.1 hotfix: Largura da Sidebar no Mobile

> Correção rápida. A sidebar drawer no mobile ocupa ~68% da tela
> (w-64 = 256px numa tela de 375px), cobrindo o conteúdo de forma
> desconfortável. Precisa ocupar mais ou menos da tela, dependendo
> da abordagem.

## Problema

No `Sidebar.tsx`, o `body` da sidebar tem `w-64` (256px) fixo. Esse
valor é usado tanto no desktop (onde está correto, sidebar fixa ao lado
do conteúdo) quanto no mobile drawer (onde fica no meio — nem ocupa a
tela toda pra ser um menu decente, nem é estreito o suficiente pra
deixar o conteúdo visível).

## Correção

Abordagem: **sidebar full-width no mobile, `w-64` só no desktop**.

### Diff: `src/components/Sidebar.tsx`

Localizar a `div` raiz do `body`:

```tsx
<div className="flex h-full w-64 shrink-0 flex-col border-r border-base-border bg-base-surface">
```

Trocar para:

```tsx
<div className="flex h-full w-[85vw] max-w-[280px] sm:w-64 sm:max-w-none shrink-0 flex-col border-r border-base-border bg-base-surface">
```

**Explicação:**
- **Mobile (< `sm`):** `w-[85vw]` com `max-w-[280px]` — ocupa 85% da
  tela em devices pequenos (319px num iPhone SE de 375px), mas nunca
  passa de 280px em telas um pouco maiores. Deixa uma faixa de ~15%
  visível do overlay escuro atrás, dando a pista visual de "toque aqui
  pra fechar" (padrão de drawer do Material Design / iOS).
- **Desktop (`sm:` = 640px+):** volta pro `w-64` (256px) fixo, sem
  max-width. Comportamento idêntico ao atual.

### Alternativa mais simples (se preferir)

Se `85vw` parecer complexo demais, trocar `w-64` por `w-72` (288px)
no mobile também resolve — fica um pouco mais largo mas ainda mostra
o overlay:

```tsx
<div className="flex h-full w-72 sm:w-64 shrink-0 flex-col border-r border-base-border bg-base-surface">
```

Nesse caso `w-72` = 288px, que num iPhone de 375px é 77% da tela —
melhor que 68% mas não tão bom quanto 85%.

**Recomendação:** usar a 1ª opção (`w-[85vw] max-w-[280px]`).

## Checklist

- [ ] Mobile (375px): sidebar drawer ocupa ~85% da tela, overlay
      escuro visível no canto direito, clicável pra fechar.
- [ ] Mobile (414px+): sidebar não ultrapassa 280px.
- [ ] Desktop (640px+): sidebar fixa com 256px, sem mudança visual.
- [ ] Conteúdo da sidebar não quebra ou trunca (labels já usam
      `truncate`, badges ficam compactos).
