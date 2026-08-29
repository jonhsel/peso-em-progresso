# Correção do erro 500 no PDF — `Cannot find module 'pdfkit/js/standard-fonts/Helvetica.cjs'`

## Causa raiz

O `@react-pdf/renderer` depende internamente do `pdfkit`, que carrega arquivos de fontes
padrão (Helvetica, Courier, etc.) via `require()` dinâmico em runtime. O bundler do
Next.js 14 (webpack/turbopack) para Route Handlers não rastreia esses requires dinâmicos
e não inclui os arquivos `.cjs`/`.afm` de fontes no pacote serverless da Vercel.

O `serverComponentsExternalPackages` não resolve porque ele atua sobre Server Components,
não sobre Route Handlers (que passam por um pipeline de bundling diferente).

## Solução

**Substituir `next.config.js` inteiro** por:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
  outputFileTracingIncludes: {
    "/api/export/pdf": [
      "./node_modules/@react-pdf/renderer/**/*",
      "./node_modules/@react-pdf/pdfkit/**/*",
      "./node_modules/@react-pdf/layout/**/*",
      "./node_modules/@react-pdf/font/**/*",
      "./node_modules/pdfkit/**/*",
    ],
  },
};

module.exports = nextConfig;
```

### O que cada parte faz

- `serverComponentsExternalPackages`: evita o crash `ba.Component is not a constructor`
  em Server Components (previne outro bug conhecido do `yoga-layout`).

- `outputFileTracingIncludes`: **esta é a correção real do erro 500**. Diz ao Next.js
  para incluir todos os arquivos desses pacotes no trace de output da função serverless
  `/api/export/pdf`, incluindo os `.cjs` de fontes padrão que o `pdfkit` carrega via
  `require()` dinâmico em runtime.

### Por que incluir tantos pacotes

O `@react-pdf/renderer` é um monorepo com dependências internas (`@react-pdf/pdfkit`,
`@react-pdf/layout`, `@react-pdf/font`). O `pdfkit` (versão standalone do foliojs)
também pode ser resolvido dependendo da árvore de dependências. Incluir todos garante
que não importa qual versão do pdfkit é resolvida, os assets estarão lá.

## Depois de aplicar

1. Fazer novo deploy na Vercel (push pro GitHub)
2. Testar `app.pesoemprogresso.com.br/api/export/pdf` logado
3. Se funcionar, o PDF deve baixar normalmente com fontes Helvetica renderizadas
