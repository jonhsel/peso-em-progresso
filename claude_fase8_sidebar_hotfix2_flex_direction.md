# Spec — Fase 8.1 hotfix #2: Wrapper flex-row no mobile (causa raiz)

> Bug visto em produção (screenshot): no mobile, a barra superior
> (logo + tema + hambúrguer) aparece como uma coluna estreita à
> esquerda em vez de uma barra horizontal no topo, empurrando e
> cortando o conteúdo. O hotfix de largura da sidebar (anterior) não
> resolve isso — é um problema diferente, na direção do flex do
> wrapper de página, não na largura do drawer.

## Causa raiz

Todas as 12 páginas usam o wrapper:

```tsx
<div className="flex min-h-screen">
  <Sidebar ... />
  <div className="flex-1 overflow-x-hidden">
    <main>...</main>
  </div>
</div>
```

`flex` sem `flex-col`/`flex-row` explícito é **`flex-row` por padrão** —
correto pro desktop (sidebar à esquerda, conteúdo à direita), mas
errado pro mobile.

No mobile, `Sidebar` renderiza (via Fragment) 2 `div`s visíveis como
**irmãos diretos** desse wrapper `flex`:
1. A barra mobile (`sm:hidden`, logo + tema + hambúrguer) — deveria
   ocupar 100% da largura, no topo.
2. O `<div className="flex-1 overflow-x-hidden">` com o conteúdo da
   página.

Como o pai é `flex-row`, esses 2 elementos ficam **lado a lado**
(a barra mobile vira uma coluna estreita à esquerda, cortando o
conteúdo à direita) em vez de **empilhados** (barra no topo, conteúdo
embaixo).

## Correção

Trocar `flex` por `flex flex-col sm:flex-row` no wrapper de **todas as
12 páginas**. No mobile (`< sm`), empilha em coluna (barra no topo,
conteúdo embaixo — correto). No desktop (`sm:` 640px+), volta pra linha
(sidebar à esquerda, conteúdo à direita — comportamento atual mantido).

### Diff (idêntico nas 12 páginas — só a 1ª linha do wrapper muda)

```diff
-    <div className="flex min-h-screen">
+    <div className="flex flex-col sm:flex-row min-h-screen">
       <Sidebar displayName={...} theme={theme} plan={...} activeGoals={...} />
       <div className="flex-1 overflow-x-hidden">
         <main className="...">
           ...
```

### Lista exaustiva dos 12 arquivos a corrigir

- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/entries/page.tsx`
- `src/app/(app)/dashboard/measurements/page.tsx`
- `src/app/(app)/dashboard/photos/page.tsx`
- `src/app/(app)/dashboard/goals/page.tsx`
- `src/app/(app)/dashboard/challenges/page.tsx`
- `src/app/(app)/dashboard/reports/page.tsx`
- `src/app/(app)/dashboard/coach/page.tsx`
- `src/app/(app)/dashboard/coach/[ownerId]/page.tsx`
- `src/app/(app)/dashboard/settings/page.tsx`
- `src/app/(app)/dashboard/upgrade/page.tsx`
- `src/app/(app)/dashboard/import/page.tsx`

## Por que não corrigir só dentro do `Sidebar.tsx`

Dava pra tentar resolver só dentro do componente (ex.: envolver os 2
`div`s visíveis da `Sidebar` num wrapper interno com posição absoluta
ou `contents`), mas isso complica sem necessidade — o problema é
genuinamente do wrapper de página (que decide row vs. column), e essas
12 páginas já têm um padrão idêntico e replicado (mesmo padrão usado
no hotfix anterior). Corrigir no wrapper é 1 palavra por arquivo
(`flex-col sm:flex-row` em vez de nada) e não exige tocar no
`Sidebar.tsx` de novo.

## Checklist

- [ ] Mobile (< 640px): barra superior (logo + tema + ☰) ocupa 100% da
      largura, no topo. Conteúdo da página aparece embaixo, ocupando a
      largura toda, sem corte nas bordas.
- [ ] Mobile: abrir o drawer (☰) continua funcionando normalmente
      (é `fixed`, não afetado por esta mudança).
- [ ] Desktop (≥ 640px): nenhuma mudança visual — sidebar fixa à
      esquerda, conteúdo à direita, como já estava.
- [ ] Testar nas 12 páginas, não só no Dashboard — o wrapper é
      duplicado em cada uma.
