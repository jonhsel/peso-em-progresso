# Spec — Landing: CTAs e linha do gráfico em terracota (accent)

## Contexto

A landing pública (`src/app/page.tsx`) e o `TrajectoryGraphic.tsx` ainda usam
`signal-onpace` (azul, `#60A5FA`) nos botões de CTA e na linha "peso real" do
gráfico hero. Esse azul era o padrão antes da decisão de usar terracota
(`accent`/`accent-hover`) como cor de ação — decisão já validada e em uso em
`/login` (ver `CLAUDE.md`, "Accent terracota escolhido sobre o azul
signal-onpace como cor de ação", 28/08/2026). A landing nunca foi atualizada
para refletir essa decisão.

O token `accent`/`accent-hover` já existe em `tailwind.config.ts` (CSS vars
`--accent`/`--accent-hover`), não precisa de migração de schema nem de novo
token — é só trocar as classes/hex nos pontos abaixo.

## Decisões fechadas

- Só os **botões de CTA** (Hero, Pricing, FinalCta) e a **linha real do
  gráfico** (`TrajectoryGraphic`) mudam de cor. Texto em destaque "no ritmo
  certo" no H1, badge "mais escolhido" e legenda de status **não** mudam —
  fora de escopo deste ajuste.
- Linha pontilhada da meta (`EXPECTED_PATH`, `#5B6584`) não muda — é
  `ink-faint`, não faz parte da identidade "peso real".
- Landing é fixa em dark (sem `ThemeToggle`), então o hex do
  `TrajectoryGraphic` usa direto o valor do accent dark: `#D97A45`.

## Diffs

### `src/app/page.tsx`

**1. Hero — CTA principal ("Criar conta grátis")**

```diff
- className="rounded-lg bg-signal-onpace text-base-bg font-medium px-6 py-3 text-sm hover:brightness-110 transition"
+ className="rounded-lg bg-accent text-base-bg font-medium px-6 py-3 text-sm hover:bg-accent-hover transition"
```

**2. Pricing — botão do plano em destaque e dos demais planos**

```diff
  className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-medium text-center transition ${
    plan.highlighted
-     ? "bg-signal-onpace text-base-bg hover:brightness-110"
-     : "border border-base-border text-ink hover:border-signal-onpace hover:text-signal-onpace"
+     ? "bg-accent text-base-bg hover:bg-accent-hover"
+     : "border border-base-border text-ink hover:border-accent hover:text-accent"
  }`}
```

**3. FinalCta — botão final ("Criar conta grátis")**

```diff
- className="mt-6 inline-block rounded-lg bg-signal-onpace text-base-bg font-medium px-6 py-3 text-sm hover:brightness-110 transition"
+ className="mt-6 inline-block rounded-lg bg-accent text-base-bg font-medium px-6 py-3 text-sm hover:bg-accent-hover transition"
```

### `src/components/marketing/TrajectoryGraphic.tsx`

**4. Comentário do topo do arquivo** — atualizar referência de cor (hoje cita
o azul antigo):

```diff
- * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
- * tailwind.config.ts: signal.onpace #60A5FA, ink.faint #5B6584,
- * base.bg #0B1220.
+ * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
+ * tailwind.config.ts: accent (dark) #D97A45, ink.faint #5B6584,
+ * base.bg #0B1220. Landing é fixa em dark, então usa direto o hex do
+ * accent dark (sem var(--accent), que dependeria de data-theme).
```

**5. Gradiente sob a linha real**

```diff
  <linearGradient id="traj-fade" x1="0" y1="0" x2="0" y2="1">
-   <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.22" />
+   <stop offset="0%" stopColor="#D97A45" stopOpacity="0.22" />
    <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
  </linearGradient>
```

Atenção: o segundo `<stop>` (opacity 0) também tem `#60A5FA` — trocar os
dois, não só o primeiro:

```diff
-   <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
+   <stop offset="100%" stopColor="#D97A45" stopOpacity="0" />
```

**6. Linha real (`ACTUAL_PATH`)**

```diff
  <path
    d={ACTUAL_PATH}
    fill="none"
-   stroke="#60A5FA"
+   stroke="#D97A45"
    strokeWidth="2.5"
    strokeLinecap="round"
    className={animated ? "traj-line" : ""}
  />
```

**7. Pontos de medição (`MEASURE_POINTS`)**

```diff
  <circle
    ...
    fill="#0B1220"
-   stroke="#60A5FA"
+   stroke="#D97A45"
    strokeWidth="2"
    ...
  />
```

### `src/app/page.tsx` — legenda abaixo do gráfico hero (opcional, avaliar)

O bloco logo após `<TrajectoryGraphic>` também usa `text-signal-onpace` /
`bg-signal-onpace` no rótulo "no ritmo":

```tsx
<span className="flex items-center gap-1.5 text-signal-onpace">
  <span className="h-1.5 w-1.5 rounded-full bg-signal-onpace" />
  no ritmo
</span>
```

Isso é a legenda do gráfico (o ponto colorido que identifica a linha), não um
CTA — mas como ele referencia a cor da própria linha, faz sentido trocar
junto para não ficar dessincronizado visualmente (linha terracota, legenda
ainda azul). Sugestão: trocar para `text-accent` / `bg-accent` também. Se não
quiser, avise que eu tiro esse item do escopo.

```diff
- <span className="flex items-center gap-1.5 text-signal-onpace">
-   <span className="h-1.5 w-1.5 rounded-full bg-signal-onpace" />
+ <span className="flex items-center gap-1.5 text-accent">
+   <span className="h-1.5 w-1.5 rounded-full bg-accent" />
    no ritmo
  </span>
```

## Fora de escopo

- Texto "no ritmo certo" em destaque no H1 (`text-signal-onpace`)
- Badge "mais escolhido" e ícone "＋" da lista de features do plano
  (continuam `signal-onpace`)
- Borda do card do plano em destaque (`border-signal-onpace`)
- Legenda de status (`KPI_STATUSES`, seção "Como funciona") — usa as 4 cores
  de semáforo, não a cor de ação
- Qualquer coisa fora de `src/app/page.tsx` e `TrajectoryGraphic.tsx`

## Checklist de teste

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run build` limpo
- [ ] Landing (`/`): botão "Criar conta grátis" do hero em terracota, hover
      escurece/clareia (accent-hover)
- [ ] Pricing: botão do plano destacado em terracota; botões dos outros
      planos com borda/texto terracota no hover
- [ ] FinalCta: botão em terracota
- [ ] Gráfico hero: linha "peso real", pontos e gradiente sob a linha em
      terracota; linha pontilhada da meta continua cinza (`#5B6584`)
- [ ] Legenda abaixo do gráfico ("no ritmo") consistente com a cor da linha
      (se decisão do item 8 for aplicá-la)
- [ ] Conferir visualmente que não sobrou nenhum `#60A5FA` em
      `TrajectoryGraphic.tsx`

## Ordem de execução

1. `TrajectoryGraphic.tsx` — trocar os 4 hex (`#60A5FA` → `#D97A45`) e o
   comentário do topo
2. `src/app/page.tsx` — Hero (CTA + legenda do gráfico, se aplicável)
3. `src/app/page.tsx` — Pricing (botão destacado + demais)
4. `src/app/page.tsx` — FinalCta
5. `npx tsc --noEmit` e `npm run build`
6. Validação visual na landing (dark, único tema que ela usa)
