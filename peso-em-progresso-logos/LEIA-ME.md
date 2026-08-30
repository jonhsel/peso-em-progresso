# Pacote de logos — Peso em Progresso

## O que tem aqui

```
public/
  favicon.ico              → copiar para public/favicon.ico (raiz do Next.js)
  apple-touch-icon.png      → copiar para public/apple-touch-icon.png
  images/
    icone.svg               → ícone puro, fundo escuro fixo (#0F1512), 200x200
    logo-horizontal.svg      → cópia estática da wordmark original (fundo claro
                               deixa "peso em" ilegível — ver nota abaixo)
    logo-vertical.svg        → idem, versão vertical
    og-image.png             → 1200x630, para compartilhamento (WhatsApp/redes)

src-components/
  Logo.tsx        → NOVO arquivo: src/components/Logo.tsx
  NavBar.tsx       → SUBSTITUI: src/components/NavBar.tsx
  layout.tsx       → SUBSTITUI: src/app/layout.tsx
  page.tsx         → SUBSTITUI: src/app/page.tsx (landing)
```

## Passo a passo

1. Copie a pasta `public/` inteira para a raiz do projeto (mescla com a `public/`
   existente, sem sobrescrever nada que já não esteja listado acima).
2. Copie `src-components/Logo.tsx` para `src/components/Logo.tsx` (arquivo novo).
3. Substitua `src/components/NavBar.tsx` pelo `src-components/NavBar.tsx`.
4. Substitua `src/app/layout.tsx` pelo `src-components/layout.tsx`.
5. Substitua `src/app/page.tsx` pelo `src-components/page.tsx`.
6. Rode `npx tsc --noEmit` e `npm run build` para confirmar que não quebrou nada.

## Por que o SVG foi adaptado (importante)

A `logo-horizontal.svg` e `logo-vertical.svg` originais tinham o texto "peso em"
em `#F3F5F4` (quase branco) fixo — invisível em fundo claro. Como o app tem tema
light/dark, isso quebraria a logo no NavBar/landing sempre que o usuário estivesse
no tema claro.

**Solução usada:** `Logo.tsx` define `LogoIcon` e `LogoHorizontal` como componentes
React com SVG inline (não `<img src>`), onde a palavra "peso em" usa
`fill="currentColor"` — ou seja, herda a cor de texto do elemento pai (`text-ink`,
que já muda com o tema no seu design system). A palavra "progresso" continua fixa
em `#34D399` (verde accent), que é legível nos dois temas por ser bem saturado.

Os arquivos `.svg` estáticos em `public/images/` são apenas a versão original
preservada como referência/download — **não são os usados no NavBar/landing**,
que importam de `@/components/Logo` (SVG inline). Se quiser usar os `.svg`
estáticos em algum outro lugar (README, redes sociais, etc.), lembre-se do
problema de contraste em fundo claro.

## Fonte da wordmark

O SVG original usava `font-family: Georgia` (sem garantia de estar instalada no
dispositivo do usuário). `Logo.tsx` usa `var(--font-space-grotesk)` — a fonte
display que o projeto já carrega via `next/font` em `layout.tsx` — com fallback
`sans-serif`. Isso muda ligeiramente a aparência do texto na logo (de serifada
para a Space Grotesk, mais quadrada/geométrica) em troca de consistência garantida
com o resto da UI. Se preferir manter a serifada, troque
`var(--font-space-grotesk), sans-serif` por `Georgia, serif` nos dois `<text>`
de `Logo.tsx`.

## Favicon / apple-touch-icon / OG image

Gerados a partir do `icone.svg` (sem texto, então sem o problema de contraste):
- `favicon.ico`: multi-resolução (16x16, 32x32, 180x180)
- `apple-touch-icon.png`: 180x180
- `og-image.png`: 1200x630, fundo escuro fixo, com wordmark — como é uma imagem
  estática (não segue o tema do site), o fundo escuro fixo é intencional e
  seguro, já que a maioria dos previews de link (WhatsApp, Twitter/X, LinkedIn)
  não respeita dark/light mode do site de qualquer forma.

`layout.tsx` já referencia esses caminhos em `metadata.icons` e
`metadata.openGraph.images` — só ajuste `NEXT_PUBLIC_SITE_URL` no `.env` se o
domínio de produção mudar, ou edite o fallback direto no arquivo.

## Diffs aplicados (resumo)

- **NavBar.tsx**: `<span>Peso em Progresso</span>` → `<Link href="/dashboard"><LogoIcon /></Link>`
  (ícone compacto, já que o header do app tem pouco espaço com 5 links + menu).
- **page.tsx (landing)**: `Header()` ganhou `<LogoHorizontal />` no lugar do
  texto; `Footer()` ganhou `<LogoIcon />` pequeno ao lado do texto existente.
- **layout.tsx**: adicionado `metadata.icons`, `metadata.openGraph`,
  `metadata.twitter`, `metadata.metadataBase`. Nada removido do que já existia.
