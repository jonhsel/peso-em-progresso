# Fase 5.3 — Seletor de período no gráfico de evolução (v2, auditado)

**Status:** v2. Auditada contra o código real de `src/components/WeightChart.tsx`
(incluindo imports, `FALLBACK_CHART_COLORS`, `readChartColors`, assinatura do
componente, `weekStart`/`hasWeeklyTrend`/`totalElapsedDays`, bloco `sorted`/
`hasMovingAverage`/`computeMovingAverage`/`movingAverageByDate`, mapeamento
`data = sorted.map(...)` com merge de `mediaMovel`, early return `data.length < 2`,
`weights`/`min`/`max`/`pad`, legenda condicional `hasWeeklyTrend || hasMovingAverage`,
JSX do `ComposedChart` completo — `Area`, `Line esperado`, `Line mediaMovel`,
`ReferenceLine`) e de `src/lib/analytics.ts` (`periodStart` com `mode`/`weekStartsOn`,
`subDays` já importado, `PeriodKpi.periodStart: string`, `computeMovingAverage`,
`PeriodMode`/`WeekStartsOn` types). Apêndice A no fim documenta as correções
aplicadas desde a v1.

Terceira sub-fase da Fase 5 (Inteligência sobre os dados): previsão da meta
(5.1, implementada) → média móvel de 7 dias (5.2, implementada) →
**seletor de período do gráfico (5.3)** → relatórios/insights → widget de
medidas corporais.

---

## Contexto

Do `claude_fases.md`, item da Fase 5: "Seletor de período no gráfico de
evolução (1 semana, 1 mês, 3 meses, 6 meses — filtra `weight_entries` no
client, sem nova query por troca de período)."

Hoje `WeightChart.tsx` (`"use client"`) sempre desenha o histórico inteiro de
`entries` recebido como prop. Esta sub-fase adiciona um controle (pills) acima
do gráfico que filtra quais pesagens aparecem, sem nunca disparar uma nova
query — o filtro é sobre o array `entries` que o componente já recebe
inteiro de `dashboard/page.tsx`.

**Sem migração, sem mudança de schema/tipos, sem nova prop em
`dashboard/page.tsx`, sem mudança em `analytics.ts`.** Todo o trabalho é
local a `WeightChart.tsx`: um novo estado `selectedPeriod`, uma função de
corte de data, e o filtro aplicado antes de montar `data`.

**Primeiro uso de `localStorage` no projeto.** O tema usa cookie SSR-read
(decisão 11 do `CLAUDE.md`); aqui é estado 100% client-side sem necessidade
de SSR, então `localStorage` é o mecanismo correto. Documentar em `CLAUDE.md`
após implementação.

---

## Decisões fechadas (não reabrir sem motivo)

1. **UI:** pills/tabs segmentados (não dropdown), no cabeçalho do card,
   ao lado do título "Evolução do peso". Estilo inspirado nos botões
   segmentados de `SettingsForm.tsx` (semana começa em: Segunda/Domingo),
   adaptado pra tamanho compacto do header do gráfico (padding menor,
   texto `11px`).
2. **Período padrão ao carregar:** "1 mês" (valor `"month"`).
3. **Cálculo de média móvel e linha "esperado" dentro da janela filtrada:**
   sempre usam a **série completa** de `entries` (comportamento já existente,
   inalterado). O filtro de período só recorta **quais pontos são
   desenhados** (`visibleEntries`), não o domínio de cálculo. `sorted`,
   `hasMovingAverage`, `movingAverageByDate`, `hasWeeklyTrend`,
   `weekStart`, `totalElapsedDays` — tudo continua derivado do histórico
   inteiro. Só a variável usada pelo `.map()` que monta `data` passa a ser
   `visibleEntries` (filtrado) em vez de `sorted` (completo).
4. **Persistência:** `localStorage` (chave `pesoemprogresso:chartPeriod`).
   Restaurada no mount via `useEffect` separado do `useEffect` de cores
   (propósitos e deps diferentes, não misturar). O estado inicial é `"month"`
   — idêntico ao default do `useState`, garantindo que o SSR e o primeiro
   paint client coincidam (sem mismatch de hidratação, já que o `useEffect`
   que restaura o valor salvo só roda depois do mount).
5. **Janela com < 2 pesagens após o filtro:** mesma mensagem já existente
   ("Registre pelo menos 2 pesagens para ver o gráfico de evolução.").
   Mas dois cenários distintos (ver decisão 7).
6. **`ReferenceLine` da meta (`targetWeightKg`):** continua aparecendo
   sempre, independente do período selecionado.
7. **Conta nova vs. janela vazia — dois early returns diferentes:**
   - **Caso A — conta nova (`sorted.length < 2`):** sem pills, mesma
     mensagem e layout de sempre.
   - **Caso B — histórico >= 2, mas `data.length < 2` após filtro:**
     pills visíveis (pra trocar de período sem recarregar) + mesma
     mensagem no corpo do card.

---

## 1. `src/components/WeightChart.tsx`

### 1.1 Import novo

```diff
-import { format, parseISO, differenceInCalendarDays } from "date-fns";
+import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
```

**Confirmação (auditoria):** `subDays` já é exportado por `date-fns` e já
importado em `analytics.ts` (Fase 3). Não existe conflito de nome em
`WeightChart.tsx` — nenhuma outra variável/função se chama `subDays` no arquivo.

### 1.2 Tipo, constantes e helper de corte de período

Inserir **logo abaixo dos imports, antes de `FALLBACK_CHART_COLORS`**:

```ts
type ChartPeriod = "week" | "month" | "3months" | "6months";

const CHART_PERIOD_OPTIONS: { value: ChartPeriod; label: string }[] = [
  { value: "week", label: "1s" },
  { value: "month", label: "1m" },
  { value: "3months", label: "3m" },
  { value: "6months", label: "6m" },
];

const CHART_PERIOD_STORAGE_KEY = "pesoemprogresso:chartPeriod";

const CHART_PERIOD_DAYS: Record<Exclude<ChartPeriod, "week">, number> = {
  month: 30,
  "3months": 90,
  "6months": 180,
};

/**
 * true se a pesagem cai dentro da janela do período selecionado.
 *
 * "week" reaproveita weekKpi.periodStart, que já foi calculado por
 * computePeriodKpi respeitando profile.period_mode/week_starts_on (Fase 3):
 *   - fixed: semana a partir de segunda ou domingo conforme configurado
 *   - rolling: últimos 7 dias corridos
 * Sem lógica nova aqui — quem decide o que "1 semana" significa é o
 * periodStart do analytics.ts, já propagado e testado.
 *
 * "month"/"3months"/"6months": sempre N dias corridos a partir de hoje,
 * sem equivalente civil — mesma regra pros 3, não dependem de period_mode.
 */
function isWithinChartPeriod(
  measuredAt: string,
  period: ChartPeriod,
  weekKpi: PeriodKpi | null,
  now: Date
): boolean {
  const entryDate = parseISO(measuredAt);
  if (period === "week") {
    // weekKpi.periodStart é string ISO (confirmado: PeriodKpi.periodStart
    // é formatISO(start, { representation: "date" }) em analytics.ts).
    const weekStart = weekKpi?.periodStart
      ? parseISO(weekKpi.periodStart)
      : subDays(now, 6);
    return differenceInCalendarDays(entryDate, weekStart) >= 0;
  }
  return differenceInCalendarDays(now, entryDate) <= CHART_PERIOD_DAYS[period];
}
```

**Fallback `subDays(now, 6)` para `weekKpi === null`:** na prática
`dashboard/page.tsx` sempre calcula `weekKpi` via `computeAllKpis` e passa
como prop, então esse fallback nunca dispara. Mas o componente tolera `null`
hoje (usado em `hasWeeklyTrend`), e o fallback defensivo evita crash sem
inventar estado novo.

### 1.3 Componente `PeriodPills` (local, mesmo arquivo)

Inserir **antes** da `export default function WeightChart`:

```tsx
function PeriodPills({
  selected,
  onChange,
}: {
  selected: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5">
      {CHART_PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
            selected === opt.value
              ? "bg-accent text-base-bg"
              : "text-ink-faint hover:text-ink-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

**Nota sobre classes Tailwind:** `bg-accent`, `text-base-bg`, `text-ink-faint`,
`text-ink-muted`, `bg-base-surface2`, `border-base-border`, `rounded-lg`,
`rounded-md` — todas são classes completas já usadas em outros componentes do
projeto (ex.: `SettingsForm.tsx`, `NavBar.tsx`), sem composição dinâmica de
strings (sem `` `bg-${var}` `` — problema de purge já documentado no `CLAUDE.md`).

### 1.4 Novo estado + persistência em `localStorage`

Inserir no corpo do componente, junto aos `useState`/`useRef` já existentes.

**Contexto exato para `str_replace`:** o trecho real hoje é:

```ts
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(FALLBACK_CHART_COLORS);

  useEffect(() => {
```

Substituir por:

```ts
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(FALLBACK_CHART_COLORS);
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>("month");

  // Restaura a última escolha do usuário (client-only — primeiro paint do
  // servidor sempre usa o default "month", sem mismatch de hidratação).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHART_PERIOD_STORAGE_KEY);
      if (stored && CHART_PERIOD_OPTIONS.some((o) => o.value === stored)) {
        setSelectedPeriod(stored as ChartPeriod);
      }
    } catch {
      // localStorage indisponível (iframe sandboxed, modo privado restrito)
    }
  }, []);

  function handlePeriodChange(period: ChartPeriod) {
    setSelectedPeriod(period);
    try {
      window.localStorage.setItem(CHART_PERIOD_STORAGE_KEY, period);
    } catch {
      // mesma proteção
    }
  }

  useEffect(() => {
```

O `useEffect` de cores (que vem logo depois) fica inalterado — é um efeito
separado com propósito e deps diferentes.

### 1.5 Filtrar `sorted` → `visibleEntries` antes de montar `data`

O código real (pós-Fase 5.2) é:

```ts
  const movingAverageByDate = new Map(movingAverage.map((m) => [m.date, m.average]));

  const data = sorted.map((e) => {
```

Substituir por:

```ts
  const movingAverageByDate = new Map(movingAverage.map((m) => [m.date, m.average]));

  const now = new Date();
  const visibleEntries = sorted.filter((e) =>
    isWithinChartPeriod(e.measured_at, selectedPeriod, weekKpi, now)
  );

  const data = visibleEntries.map((e) => {
```

O resto do `.map()` (bloco do `point`, merge de `mediaMovel`, bloco do
`esperado`) fica **inalterado**.

**Por que `sorted.filter(...)` e não `entries.filter(...).sort(...)`:** `sorted`
já é a lista completa ordenada (extraída na Fase 5.2), usada por
`hasMovingAverage` e `movingAverageByDate` — reutilizá-la evita um 2º sort.
`hasMovingAverage`, `hasWeeklyTrend`, `totalElapsedDays`, `weekStart`,
`movingAverageByDate` continuam derivados de `sorted` (histórico completo,
decisão 3) — não são tocados pelo filtro.

**`const now = new Date()`** — uma única instância pra todo o render (filter +
`isWithinChartPeriod`). Não mover pra fora do componente (precisa ser "agora"
a cada render, não estática ao carregar o módulo).

### 1.6 Dois early returns: Caso A (conta nova) e Caso B (janela vazia)

Substituir o early return existente:

```ts
  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        className="bg-base-surface border border-base-border rounded-card p-6 h-96 flex items-center justify-center"
      >
        <p className="text-sm text-ink-faint">
          Registre pelo menos 2 pesagens para ver o gráfico de evolução.
        </p>
      </div>
    );
  }
```

Por:

```tsx
  // Caso A — conta nova, sem dados suficientes em lugar nenhum.
  // Sem pills (sem sentido oferecer "3 meses" pra quem não tem 2 pesagens).
  if (sorted.length < 2) {
    return (
      <div
        ref={containerRef}
        className="bg-base-surface border border-base-border rounded-card p-6 h-96 flex items-center justify-center"
      >
        <p className="text-sm text-ink-faint">
          Registre pelo menos 2 pesagens para ver o gráfico de evolução.
        </p>
      </div>
    );
  }

  // Caso B — histórico suficiente, mas a janela filtrada tem < 2 pesagens.
  // Pills continuam visíveis pra trocar de período sem recarregar.
  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        className="bg-base-surface border border-base-border rounded-card p-4 h-96"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Evolução do peso</p>
          <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
        </div>
        <div className="flex-1 flex items-center justify-center h-[calc(100%-2.5rem)]">
          <p className="text-sm text-ink-faint">
            Registre pelo menos 2 pesagens para ver o gráfico de evolução.
          </p>
        </div>
      </div>
    );
  }
```

### 1.7 Header do card com pills (estado normal, com gráfico)

Substituir:

```tsx
      <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 px-1">Evolução do peso</p>
```

Por:

```tsx
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Evolução do peso</p>
        <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
      </div>
```

O bloco da legenda `{(hasWeeklyTrend || hasMovingAverage) && ...}` fica
logo abaixo, **inalterado**.

### 1.8 `ResponsiveContainer` height

Hoje o card tem `h-96` e o `ResponsiveContainer` tem `height="90%"`. Com
o header mais alto (agora pills + legenda potencialmente com flex-wrap),
o gráfico pode ficar comprimido em mobile. Sem mudar nada agora — incluir
no checklist de teste; se ficou apertado, trocar o `height="90%"` pra
`height="85%"` ou ajustar o `h-96` do container externo.

---

## 2. `src/app/(app)/dashboard/page.tsx`

**Nenhuma mudança.** `WeightChart` já recebe `entries`, `targetWeightKg` e
`weekKpi` — os três únicos dados de que o seletor precisa. Não precisa
de nova prop.

---

## 3. `src/lib/analytics.ts`

**Nenhuma mudança.** `computeMovingAverage`, `computeTrend`,
`computePeriodKpi`, `computeAllKpis`, `computeGoalPrediction`,
`periodStart`, `baselineWeight` — nada afetado. O seletor de período é
puramente UI local do componente `WeightChart`.

---

## Fora de escopo

- Qualquer mudança em `analytics.ts`.
- Nova query ao Supabase por troca de período — filtro é 100% client-side.
- Período "personalizado" (range picker) — só as 4 opções fixas do roadmap.
- Exportação PDF (`api/export/pdf/route.tsx`) — usa `@react-pdf/renderer`,
  não reaproveita `WeightChart.tsx`.
- Migração SQL / mudança em `database.ts`.
- Demais itens da Fase 5 (relatórios/insights, widget de medidas).

---

## Checklist de teste

- [ ] Antes de codar: reler `src/components/WeightChart.tsx` real para
      confirmar que nada mudou out-of-band desde a auditoria (nomes de
      variáveis, posição dos blocos — o Claude Code deve fazer isso).
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Pills aparecem no cabeçalho do card, "1 mês" selecionado por padrão
      numa conta sem escolha salva em `localStorage`.
- [ ] Clicar em cada pill troca o gráfico (menos/mais pontos, eixo Y
      reajustando) e destaca a pill ativa com cor `accent`.
- [ ] Recarregar a página (F5) mantém a última pill escolhida (persistência
      via `localStorage`).
- [ ] "1s" (semana) com `period_mode = fixed`: mostra a semana corrente a
      partir do dia configurado em `week_starts_on`.
- [ ] "1s" com `period_mode = rolling`: mostra exatamente os últimos 7 dias
      corridos.
- [ ] Conta com meta semanal ativa: linha "esperado" aparece em "1s" e
      "1m" (quando a semana atual está dentro da janela), some em "3m"/"6m"
      se não tiver pesagens da semana dentro da janela (comportamento
      herdado, `hasWeeklyTrend` + `elapsedAtEntry >= 0`).
- [ ] Conta com >= 7 dias de histórico total, mas só 2 pesagens nos últimos
      30 dias: em "1m" a média móvel usa valores calculados sobre o histórico
      completo (estável nas bordas, não reseta).
- [ ] Conta nova (< 2 pesagens no total): sem pills, mensagem de sempre
      (Caso A).
- [ ] Conta com histórico de 8 meses, mas nenhuma pesagem nos últimos 30
      dias: "1m" mostra pills + mensagem (Caso B); trocar pra "6m" mostra
      o gráfico, sem reload.
- [ ] `ReferenceLine` verde da meta aparece em todos os períodos (quando
      `targetWeightKg` está definido).
- [ ] Tema claro/escuro: pill ativa (`bg-accent text-base-bg`) e inativas
      (`text-ink-faint`) com contraste adequado nos dois temas.
- [ ] Mobile: 4 pills cabem no cabeçalho sem quebrar linha. Se o título +
      pills apertarem em telas < 360px, considerar abreviar o título
      ("Evolução") — mas testar antes.
- [ ] `ResponsiveContainer` height: gráfico não fica comprimido com header
      pills + legenda (3 itens com flex-wrap) em mobile. Se ficou, ajustar
      height="85%" ou o h-96 do container.
- [ ] Alternar rapidamente entre pills não causa glitch visual
      (`isAnimationActive={false}` nas Lines + Area sem animação cobre isso).
- [ ] `localStorage` indisponível (iframe privado, bloqueado): app não
      crasheia, degrada pro default "1m" silenciosamente.

## Passos de execução (ordem)

1. Ler `src/components/WeightChart.tsx` real para validar que nenhuma
   mudança out-of-band aconteceu desde a auditoria desta spec.
2. Aplicar 1.1 (import `subDays`), 1.2 (tipo/constantes/helper), 1.3
   (`PeriodPills`), 1.4 (estado + localStorage), 1.5 (filtro
   `visibleEntries`), 1.6 (dois early returns), 1.7 (header com pills).
3. `npx tsc --noEmit` e `npm run build`.
4. Rodar checklist de teste manual.
5. Atualizar `CLAUDE.md`:
   - Nova seção "Fase 5.3 — Seletor de período do gráfico".
   - Adicionar decisão: "Primeiro uso de localStorage no projeto (chave
     `pesoemprogresso:chartPeriod`). Distinto do tema (cookie SSR-read);
     aqui é estado 100% client-side sem impacto no primeiro paint. Se
     indisponível, degrada pro default silenciosamente."
6. Marcar o item em `claude_fases.md`.

---

## Apêndice A — Correções da auditoria v1 → v2

### A1. Labels das pills abreviadas

**v1 dizia:** `label: "1 semana"` / `"1 mês"` / `"3 meses"` / `"6 meses"`.
**Problema:** 4 labels longos lado a lado estouram o header em mobile. O
título "Evolução do peso" já é longo; com 4 labels verbosos, o `flex
justify-between` pode empilhar ou apertar demais em telas < 400px.

**Correção:** labels abreviadas: `"1s"` / `"1m"` / `"3m"` / `"6m"`. Mesma
convenção usada por muitos apps de gráfico de ações/fitness. Legíveis em
contexto (estão num seletor de período de gráfico). Se o resultado ficar
ambíguo na prática (teste visual), expandir pra `"1sem"` / `"1mês"` / etc.

### A2. `try/catch` em `localStorage`

**v1 dizia:** `window.localStorage.getItem(...)` sem proteção.
**Problema:** `localStorage` pode lançar exceção em contextos restritos
(iframe sandboxed, modo privado em alguns browsers, Storage Access API
bloqueada). O `CLAUDE.md` documenta que o tema usa cookie justamente por
ser SSR-safe — o localStorage é um mecanismo diferente, precisa de defesa
própria.

**Correção:** `try/catch` tanto no `getItem` quanto no `setItem`. Em caso
de erro, degrada silenciosamente pro default `"month"` sem crash e sem
mensagem de erro pro usuário.

### A3. Padding da pill ativa

**v1 dizia:** `py-1` nas pills.
**Problema:** com labels abreviadas (2 caracteres), `py-1` + texto `11px`
cria botões altos demais pro header compacto do gráfico, desproporcionais
em relação ao título.

**Correção:** `py-0.5` (2px padding vertical), mais compacto. O hit target
continua confortável pelo `px-2` horizontal e o container `p-0.5`.

### A4. Posicionamento do `const now = new Date()`

**v1 dizia:** declarar `now` antes de `visibleEntries` mas não especificava
se é dentro ou fora do componente.

**Correção:** explicitamente dentro do corpo do componente (precisa ser
"agora" a cada render, não constante de módulo). Documentado no diff.

### A5. `PeriodKpi.periodStart` é `string` (ISO date) — confirmado

**v1 marcava como pendência de confirmação.**
**Código real:** `periodStart: formatISO(start, { representation: "date" })`
no return de `computePeriodKpi`, tipo `string` no `PeriodKpi`. O
`parseISO(weekKpi.periodStart)` em `isWithinChartPeriod` é correto.

### A6. `subDays` sem conflito de nome — confirmado

**v1 marcava como pendência.**
**Código real:** `WeightChart.tsx` importa `format`, `parseISO`,
`differenceInCalendarDays` de `date-fns` — nenhuma delas se chama `subDays`.
Não existe outra variável/função local com esse nome. Import seguro.

### A7. Ordem de declarações no componente — confirmada

**v1 marcava como pendência.**
**Código real (ordem confirmada via busca):**
1. `weekStart` / `hasWeeklyTrend` / `totalElapsedDays`
2. `sorted` / `hasMovingAverage` / `movingAverage` / `movingAverageByDate`
3. `data = sorted.map(...)`
4. `if (data.length < 2)` early return
5. `weights` / `min` / `max` / `pad`
6. JSX return

O filtro `visibleEntries` se encaixa entre item 2 e 3, exatamente como
especificado na seção 1.5.

### A8. Altura do Caso B (janela vazia com pills)

**v1 usava:** `h-[calc(100%-2rem)]`.
**Problema:** a altura real do header (título + pills) com `mb-2` é
~2.5rem, não 2rem. Com 2rem, o div de mensagem pode ultrapassar levemente
o card.

**Correção:** `h-[calc(100%-2.5rem)]` no Caso B. E trocar o layout pra
usar `flex-1` em vez de altura calculada — mais robusto se a altura do
header variar (ex.: legenda com flex-wrap em mobile):

```tsx
<div className="flex-1 flex items-center justify-center h-[calc(100%-2.5rem)]">
```

O `flex-1` serve como fallback se o calc não bater exatamente; a altura
calculada é a referência primária.

### A9. Nenhuma convenção pré-existente de `localStorage` — confirmado

**v1 marcava como pendência.**
**Código real:** nenhum outro componente usa `localStorage`. A chave
`pesoemprogresso:chartPeriod` é a primeira. Tema é cookie, não localStorage
(decisão 11 do `CLAUDE.md`). Não há prefixo a seguir — o `pesoemprogresso:`
criado aqui serve de namespace pra futuras chaves.
