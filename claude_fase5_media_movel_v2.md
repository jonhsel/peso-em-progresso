# Spec — Fase 5.2: Média móvel de 7 dias no gráfico de evolução

**Status:** v2. Auditada contra o código real de `src/components/WeightChart.tsx`
(íntegro via `project_knowledge_search`, incluindo imports, `FALLBACK_CHART_COLORS`,
`readChartColors`, assinatura do componente, blocos `hasWeeklyTrend`/`data`/early
return/`weights`/`min`/`max`/`pad`, legenda, JSX completo do `ComposedChart` com todas
as props da `<Line esperado>` — `dot={{ r: 3, ... }}`, `activeDot={{ r: 5 }}`,
`connectNulls`, `isAnimationActive={false}`, `legendType="none"`) e de
`src/lib/analytics.ts` (`toPoints`, `EntryPoint`, `formatISO`, `computeTrend`,
`computeAllKpis`, `computeGoalPrediction`, exportações, imports de `date-fns`).

Apêndice A no fim do arquivo documenta as 7 correções aplicadas desde a v1.

Segunda sub-fase da Fase 5 (Inteligência sobre os dados): previsão da meta (5.1, já
implementada) → **média móvel de 7 dias (5.2)** → seletor de período do gráfico (5.3,
ainda não specced) → relatórios/insights → widget de medidas corporais.

## Contexto

Do `claude_fases.md`, item da Fase 5: "Média móvel de 7 dias no gráfico de evolução".

Hoje o `WeightChart.tsx` já desenha duas séries no mesmo `ComposedChart`:
- `peso` (Area sólida, cor `--accent`) — peso real, uma pesagem por ponto.
- `esperado` (Line tracejada cinza, cor `--ink-faint`, lida como `colors.axis`) — só
  quando há meta semanal com baseline confiável (`weekKpi`), reta entre o peso no
  início da semana e onde a meta prevê que o usuário esteja hoje.

A média móvel é uma **terceira série**, ortogonal às outras duas: suaviza o ruído
normal de peso corporal (retenção de líquido, ciclo, etc.) mostrando a tendência real
por trás dos altos e baixos diários — mesmo sem meta configurada, ao contrário da linha
`esperado`.

**Sem migração, sem mudança de schema, sem nova rota, sem nova prop obrigatória em
`dashboard/page.tsx`.** A média é derivada só de `entries`, que o `WeightChart` já
recebe — o cálculo entra em `analytics.ts` (função pura, mesmo padrão de `computeTrend`/
`computeGoalPrediction`) e o consumo entra só em `WeightChart.tsx`. `dashboard/page.tsx`
não muda. **O cálculo roda client-side** (dentro de um componente `"use client"`) — isso
é intencional, pois os dados já estão ali como prop e não justificam uma server action.

## Decisões fechadas (não reabrir sem motivo)

1. **Cálculo: média das últimas 7 pesagens por contagem, não por janela de 7 dias
   corridos.** Para o ponto da pesagem *i* (ordenadas cronologicamente), a média é das
   pesagens *i-6* a *i* (até 7 pontos, usando menos se não houver 7 disponíveis ainda —
   janela expansiva no começo da série). Isso significa que o espaçamento real entre
   pesagens não entra na conta: um usuário que pesa a cada 2-3 dias tem a "média das
   últimas 7 pesagens" cobrindo mais de 7 dias de calendário, e isso é intencional
   (decisão do usuário, não peso por recência de dias).
2. **Visibilidade da linha: só aparece com pelo menos 7 dias corridos de histórico**,
   independente de quantas pesagens existam nesse intervalo. Definição operacional:
   `diferença em dias corridos entre a primeira e a última pesagem >= 6` (pesagem no
   dia 1 e no dia 7 têm 6 dias de diferença entre si, mas cobrem 7 dias de calendário
   inclusive — por isso o limiar é 6, não 7, na subtração de datas). Com histórico mais
   curto que isso, a série não é desenhada (mesmo padrão de `hasWeeklyTrend` para a
   linha `esperado`: `{condição && <Line ... />}`, sem estado de erro, só ausência).
3. **Estilo visual: linha pontilhada, padrão de traço diferente da `esperado`** (que já
   usa `strokeDasharray="4 4"`, tracejada). Pontilhado usa `strokeDasharray="2 3"` —
   traços curtos, visualmente distinto do tracejado mais longo da `esperado`, para as
   duas nunca serem confundidas quando ambas aparecem juntas no mesmo gráfico (usuário
   com meta semanal E mais de 7 dias de histórico vê as duas simultaneamente).
4. **Cor: reaproveita o token `--ink-muted`** (já lido pelo componente hoje como
   `colors.tooltipLabel`), não introduz CSS var nova nem hex novo. É visualmente distinto
   de `--ink-faint` (usado por `esperado`, mais claro/apagado) e não pisa em nenhum token
   `signal-*` (que carrega semântica de status de KPI — ver decisão 9 do `CLAUDE.md`,
   "não confundir os dois usos"). Renomeado no objeto `colors` como `movingAvg` para o
   nome já indicar o uso, em vez de reaproveitar a chave `tooltipLabel` para dois papéis.
5. **Sem `dot` nos pontos da linha de média móvel** — diferente da linha `esperado`
   (que tem `dot` como âncora visual, documentado no código por ficar colada na área de
   peso real). A média móvel se afasta mais da linha de peso real na maioria dos casos
   (é uma suavização, não uma reta de 2 pontos), então não tem o mesmo problema de ficar
   "escondida"; pontos a mais nesse gráfico (que já tem `peso` com dot e possivelmente
   `esperado` com dot) poluiriam visualmente sem necessidade.
6. **Legenda: uma única `<div>` condicional englobando até 3 itens.** Substitui a
   legenda existente (`hasWeeklyTrend`) por uma nova `<div>` que aparece quando qualquer
   segunda série está visível (`hasWeeklyTrend || hasMovingAverage`), com cada item
   condicionado individualmente. Isso corrige o caso em que a média móvel aparece
   sem meta semanal: antes, "peso real" ficava escondida (era condicionada a
   `hasWeeklyTrend`); agora aparece sempre que houver ao menos uma linha adicional
   no gráfico.
7. **Domínio do YAxis inalterado.** A média móvel é uma média aritmética de subconjuntos
   do peso real — por definição, seus valores ficam dentro do intervalo
   [min(pesos), max(pesos)]. O domínio atual (`Math.min/max` dos `peso` + meta) já cobre.
8. **Duplicatas de `measured_at` (known behavior).** Se houver duas pesagens no mesmo dia,
   `toPoints` gera dois pontos; `computeMovingAverage` retorna dois resultados com a mesma
   chave `date`; o `Map` no `WeightChart` guarda só o segundo. Na prática, as médias
   diferem por frações de grama nesses dois pontos consecutivos, sem impacto visual.
   Aceito como está.

---

## 1. `src/lib/analytics.ts`

### 1.1 Nova função `computeMovingAverage`

Inserir depois de `computeGoalPrediction` (fim do arquivo, mesmo padrão das funções
anteriores — não mexe em nada acima). Reaproveita `toPoints` (já privada no arquivo,
mesma ordenação usada por `computeTrend`/`computePeriodKpi`) em vez de duplicar lógica
de parse/sort.

```ts
export type MovingAveragePoint = {
  date: string; // measured_at ISO (YYYY-MM-DD), mesma chave usada por WeightChart
  average: number;
};

/**
 * Média móvel das últimas `windowSize` pesagens (por contagem, não por janela
 * de dias corridos — ver decisão 1 do spec Fase 5.2).
 * Janela expansiva no início: os primeiros pontos usam menos de `windowSize`
 * pesagens (1, depois 2, etc.) até acumular o suficiente. Não decide sozinha
 * se deve ser exibida — isso é responsabilidade do chamador (WeightChart),
 * que aplica o critério de "pelo menos 7 dias corridos de histórico".
 */
export function computeMovingAverage(
  entries: WeightEntry[],
  windowSize = 7
): MovingAveragePoint[] {
  const points = toPoints(entries);
  return points.map((p, i) => {
    const windowPoints = points.slice(Math.max(0, i - windowSize + 1), i + 1);
    const sum = windowPoints.reduce((acc, wp) => acc + wp.weight, 0);
    const average = Number((sum / windowPoints.length).toFixed(2));
    return { date: formatISO(p.date, { representation: "date" }), average };
  });
}
```

`formatISO` já é importado de `date-fns` no topo de `analytics.ts` (confirmado no
código real — usado por `computePeriodKpi`/`formatISODate`). Nenhum import novo.

**Não mexe em:** `computeTrend`, `computePeriodKpi`, `computeAllKpis`,
`computeGoalPrediction`, `baselineWeight`, `toPoints` em si (só chama, não altera
assinatura nem comportamento).

---

## 2. `src/components/WeightChart.tsx`

### 2.1 Import novo

```diff
 import type { WeightEntry } from "@/types/database";
-import type { PeriodKpi } from "@/lib/analytics";
+import type { PeriodKpi } from "@/lib/analytics";
+import { computeMovingAverage } from "@/lib/analytics";
```

### 2.2 Objeto de cores — nova chave `movingAvg`

```diff
 const FALLBACK_CHART_COLORS = {
   grid: "#26314A",
   axis: "#5B6584",
   tooltipBg: "#1B2438",
   tooltipBorder: "#26314A",
   tooltipLabel: "#8C97B4",
   accent: "#D97A45",
+  movingAvg: "#8C97B4",
 };

 function readChartColors(el: HTMLElement) {
   const cs = getComputedStyle(el);
   const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
   return {
     grid: read("--base-border", FALLBACK_CHART_COLORS.grid),
     axis: read("--ink-faint", FALLBACK_CHART_COLORS.axis),
     tooltipBg: read("--base-surface2", FALLBACK_CHART_COLORS.tooltipBg),
     tooltipBorder: read("--base-border", FALLBACK_CHART_COLORS.tooltipBorder),
     tooltipLabel: read("--ink-muted", FALLBACK_CHART_COLORS.tooltipLabel),
     accent: read("--accent", FALLBACK_CHART_COLORS.accent),
+    movingAvg: read("--ink-muted", FALLBACK_CHART_COLORS.movingAvg),
   };
 }
```

`--ink-muted` já é lido hoje para `tooltipLabel` — passa a ser lido duas vezes (uma
por chave), sem custo real (é a mesma `getComputedStyle` já em execução). Fallback dark
de `--ink-muted` é `#8C97B4` (confirmado em `globals.css`).

### 2.3 Variável `sorted` compartilhada, `hasMovingAverage` e cálculo da média

**[Correção auditoria #2 e #3]** — O código real hoje faz
`const data = [...entries].sort(...).map(...)` inline. Vamos extrair o sort para uma
variável `sorted` reutilizada tanto pelo critério `hasMovingAverage` quanto pelo
mapeamento de `data`. Além disso, `computeMovingAverage` e `movingAverageByDate` devem
ser declarados antes do mapeamento de `data`, onde o merge acontece.

Inserir **logo antes do bloco que monta `data`**, depois de `const totalElapsedDays`:

```diff
   const totalElapsedDays = weekStart ? differenceInCalendarDays(new Date(), weekStart) : 0;

+  // Média móvel (Fase 5.2): cálculo e critério de visibilidade.
+  // sorted é reutilizado abaixo para montar `data`, evitando sort duplo.
+  const sorted = [...entries].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
+  const hasMovingAverage =
+    sorted.length >= 2 &&
+    differenceInCalendarDays(
+      parseISO(sorted[sorted.length - 1].measured_at),
+      parseISO(sorted[0].measured_at)
+    ) >= 6; // 6 dias de diferença = 7 dias corridos (ver decisão 2)
+  const movingAverage = computeMovingAverage(entries);
+  const movingAverageByDate = new Map(movingAverage.map((m) => [m.date, m.average]));
+
-  const data = [...entries]
-    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
-    .map((e) => {
+  const data = sorted.map((e) => {
       const point: {
         date: string;
         label: string;
         peso: number;
         esperado?: number;
+        mediaMovel?: number;
       } = {
         date: e.measured_at,
         label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
         peso: Number(e.weight_kg),
       };

+      const avg = movingAverageByDate.get(e.measured_at);
+      if (avg !== undefined) {
+        point.mediaMovel = avg;
+      }
+
       // Só marca "esperado" pra pesagens dentro da semana atual — fora
       // desse intervalo a reta não tem significado (é um KPI por período).
       if (hasWeeklyTrend && weekStart) {
         const entryDate = parseISO(e.measured_at);
         const elapsedAtEntry = differenceInCalendarDays(entryDate, weekStart);
         if (elapsedAtEntry >= 0) {
           const frac =
             totalElapsedDays > 0 ? Math.min(1, elapsedAtEntry / totalElapsedDays) : elapsedAtEntry === 0 ? 0 : null;
           if (frac !== null) {
             point.esperado = Number(
               (
                 weekKpi!.baselineWeightKg! +
                 (weekKpi!.expectedWeightNowKg! - weekKpi!.baselineWeightKg!) * frac
               ).toFixed(2)
             );
           }
         }
       }

       return point;
-    });
+  });
```

**Contexto completo para `str_replace`:** o diff acima substitui o bloco que começa
em `const data = [...entries]` e termina no `});` de fechamento do `.map()`. A
variável `sorted` é declarada **antes** desse bloco; `data` é redefinida como
`sorted.map(...)`. O resto do bloco (cálculo de `esperado`) fica intocado.

### 2.4 Renderização da `<Line>` da média móvel no `ComposedChart`

**[Correção auditoria #1]** — Contexto do diff usa as props reais da `<Line esperado>`.

Adicionar depois da `<Line dataKey="esperado" ... />` existente:

```diff
           {hasWeeklyTrend && (
             <Line
               type="linear"
               dataKey="esperado"
               name="Esperado"
               stroke={colors.axis}
               strokeWidth={2}
               strokeDasharray="4 4"
               // Numa semana, a diferença entre peso real e esperado costuma
               // ser de poucas centenas de gramas — em pixels, isso pode cair
               // a 2-3px de distância da linha sólida (Area) e ficar oculta
               // por baixo dela, mesmo a linha estando desenhada corretamente.
               // Os pontos (um por pesagem dentro da semana) dão uma âncora
               // visível mesmo quando o traço em si está colado na linha real.
               dot={{ r: 3, fill: colors.tooltipBg, stroke: colors.axis, strokeWidth: 2 }}
               activeDot={{ r: 5 }}
               connectNulls
               isAnimationActive={false}
               legendType="none"
             />
           )}
+          {hasMovingAverage && (
+            <Line
+              type="monotone"
+              dataKey="mediaMovel"
+              name="Média móvel (7)"
+              stroke={colors.movingAvg}
+              strokeWidth={2}
+              strokeDasharray="2 3"
+              dot={false}
+              connectNulls
+              isAnimationActive={false}
+              legendType="none"
+            />
+          )}
```

Props da `<Line>` da média móvel:
- `type="monotone"` — curva suave (a média já é intrinsecamente suave; segmentos
  retos ponto-a-ponto criariam angulações artificiais). Diferente de `esperado`
  (`"linear"`, reta de 2 pontos).
- `strokeDasharray="2 3"` — pontilhado curto, distinto do tracejado `"4 4"` do
  `esperado`.
- `dot={false}` — sem pontos (decisão 5).
- `connectNulls` — mesma razão que em `esperado`: se algum ponto do dataset tiver
  `mediaMovel` undefined, a linha não quebra.
- `isAnimationActive={false}` — consistente com `esperado`.
- `legendType="none"` — consistente com `esperado` (a legenda customizada substitui
  a do recharts).

### 2.5 Legenda unificada

**[Correção auditoria #4]** — Substituir o bloco de legenda existente por uma versão
que aparece quando qualquer segunda série está visível e condiciona cada item
individualmente:

```diff
-      {hasWeeklyTrend && (
-        <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint">
-          <span className="flex items-center gap-1.5">
-            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
-            peso real
-          </span>
-          <span className="flex items-center gap-1.5">
-            <span className="h-0.5 w-3" style={{ backgroundColor: colors.axis, opacity: 0.8 }} />
-            ritmo da semana
-          </span>
-        </div>
-      )}
+      {(hasWeeklyTrend || hasMovingAverage) && (
+        <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint flex-wrap">
+          <span className="flex items-center gap-1.5">
+            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
+            peso real
+          </span>
+          {hasWeeklyTrend && (
+            <span className="flex items-center gap-1.5">
+              <span className="h-0.5 w-3" style={{ backgroundColor: colors.axis, opacity: 0.8 }} />
+              ritmo da semana
+            </span>
+          )}
+          {hasMovingAverage && (
+            <span className="flex items-center gap-1.5">
+              <span className="h-0.5 w-3" style={{ backgroundColor: colors.movingAvg, opacity: 0.8 }} />
+              média móvel (7)
+            </span>
+          )}
+        </div>
+      )}
```

Uma única `<div>`, até 3 itens em linha, `flex-wrap` pra mobile não estourar.
"peso real" aparece sempre que ao menos uma linha adicional está visível —
resolve o caso "usuário sem meta semanal, mas com ≥7 dias de histórico" em que
antes a legenda "peso real" ficava escondida.

---

## 3. `src/app/(app)/dashboard/page.tsx`

**Nenhuma mudança.** `WeightChart` já recebe `entries` (usado para tudo: peso real,
`esperado` via `weekKpi`, e agora `mediaMovel`) — não precisa de nova prop, nova query,
nem novo cálculo no chamador. A média móvel é derivada inteiramente dentro do próprio
`WeightChart.tsx` a partir de dados que já chegam até ele.

---

## Fora de escopo

- Seletor de período do gráfico (1 semana/1 mês/3 meses/6 meses) — Fase 5.3, ainda não
  specced; quando existir, a média móvel deve continuar funcionando sobre o subconjunto
  de `entries` filtrado por período (nenhuma mudança prevista em `computeMovingAverage`
  em si, que já opera sobre qualquer `entries[]` recebido).
- Qualquer mudança em `computeTrend`, `computePeriodKpi`, `computeAllKpis`,
  `computeGoalPrediction`, `baselineWeight`, `resolveGoalsForPeriod`.
- Toggle para ligar/desligar a linha manualmente — a visibilidade é 100% automática
  (`hasMovingAverage`), sem controle de UI nesta sub-fase.
- Exportação PDF (`api/export/pdf/route.tsx`) — o PDF usa `@react-pdf/renderer` com
  queries próprias e não reaproveita componentes React do dashboard (confirmado no
  `CLAUDE.md`); a média móvel é só UI do `WeightChart`, não afeta o PDF.
- Migração SQL / mudança em `database.ts` — nenhuma necessária.
- Demais itens da Fase 5 (seletor de período, relatórios, widget de medidas).

---

## Checklist de teste

- [ ] Antes de codar: reler `src/components/WeightChart.tsx` e `src/lib/analytics.ts`
      reais para confirmar que nada mudou desde a auditoria (nomes de variáveis como
      `weekStart`/`hasWeeklyTrend`/`totalElapsedDays`/`data`, posição do
      `if (data.length < 2)` early return, props exatas da `<Line esperado>`).
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta com < 7 dias corridos de histórico (mesmo com várias pesagens no mesmo
      dia ou em poucos dias consecutivos): linha de média móvel NÃO aparece, legenda
      de "média móvel (7)" também não, mas legenda de "peso real" aparece se
      `hasWeeklyTrend` (comportamento existente, inalterado).
- [ ] Conta com >= 7 dias corridos de histórico e só 2-3 pesagens nesse intervalo:
      linha aparece, usando janela expansiva (média de 1, depois 2, depois 3 pontos).
- [ ] Conta com pesagens diárias por várias semanas: linha de média móvel visivelmente
      mais suave que a linha de peso real (`Area`), sem os picos diários.
- [ ] Conta com meta semanal ativa E >= 7 dias de histórico: as duas linhas (`esperado`
      tracejada e `mediaMovel` pontilhada) aparecem juntas, visualmente distinguíveis
      uma da outra (traço "4 4" vs "2 3") e da área de peso real.
- [ ] Conta sem meta semanal MAS com >= 7 dias de histórico: legenda mostra "peso real"
      + "média móvel (7)" (sem "ritmo da semana"); linha pontilhada aparece, linha
      tracejada não.
- [ ] Tooltip ao passar o mouse num ponto: mostra "Média móvel (7): X.X kg" (nome
      correto, não confundido com "Peso" ou "Esperado").
- [ ] Tema claro/escuro: `colors.movingAvg` muda de tom junto com o resto do gráfico ao
      alternar `data-theme` (mesmo `MutationObserver` já existente, sem código extra).
- [ ] Mobile: com 3 itens de legenda em linha + `flex-wrap`, conferir que não estoura
      a largura do card nem esconde itens — se os 3 itens não couberem em 1 linha, devem
      quebrar para a linha de baixo graças ao `flex-wrap`, não esconder.
- [ ] Gráfico com só 1 pesagem (early return "Registre pelo menos 2 pesagens..."):
      continua funcionando igual a antes, sem erro por causa da nova lógica de
      `hasMovingAverage`/`sorted` (que roda antes desse early return —
      `sorted.length >= 2` cobre esse caso, não entra no `differenceInCalendarDays`).
- [ ] Gráfico com 0 pesagens (`entries` vazio): mesmo comportamento de antes (card vazio
      com mensagem). `sorted` é `[]`, `sorted.length >= 2` é `false`,
      `computeMovingAverage([])` retorna `[]`, nenhum erro.

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 5 —
Inteligência sobre os dados → "Média móvel de 7 dias no gráfico de evolução") e
atualizar o `CLAUDE.md` com uma nova seção "Fase 5.2 — Média móvel" (mesmo padrão das
seções anteriores), incluindo os checkboxes acima.

---

## Passos de execução (ordem)

1. Reler `src/lib/analytics.ts` e `src/components/WeightChart.tsx` reais (checklist
   item 1) — se algo relevante mudou, ajustar diffs antes de aplicar.
2. Adicionar `MovingAveragePoint`/`computeMovingAverage` em `analytics.ts` (seção 1.1).
3. Atualizar `WeightChart.tsx`:
   a. Import (seção 2.1).
   b. Chave `movingAvg` em `FALLBACK_CHART_COLORS` e `readChartColors` (seção 2.2).
   c. Variável `sorted`, `hasMovingAverage`, `computeMovingAverage` + rewrite do
      `data = sorted.map(...)` com merge de `mediaMovel` (seção 2.3).
   d. `<Line>` nova no JSX (seção 2.4).
   e. Legenda unificada (seção 2.5).
4. `npx tsc --noEmit` e `npm run build`.
5. Rodar checklist de teste manual.
6. Atualizar `CLAUDE.md` (nova seção "Fase 5.2 — Média móvel") e marcar o item em
   `claude_fases.md`.

---

## Apêndice A — Correções da auditoria v1 → v2

### A1. Contexto do diff `<Line esperado>` corrigido

**v1 dizia:** `dot={{ r: 2.5, fill: colors.axis, strokeWidth: 0 }}`, `activeDot={{ r: 4 }}`.
**Código real:** `dot={{ r: 3, fill: colors.tooltipBg, stroke: colors.axis, strokeWidth: 2 }}`,
`activeDot={{ r: 5 }}`, `connectNulls`, `isAnimationActive={false}`, `legendType="none"`.

**Correção:** diff na seção 2.4 usa as props reais, verbatim. Também adicionado
`isAnimationActive={false}` e `legendType="none"` na `<Line>` nova da média móvel para
consistência com a existente.

### A2. Variável `sorted` compartilhada (sem sort duplo)

**v1 dizia:** `const sortedEntries = [...entries].sort(...)` para `hasMovingAverage`
+ `const data = [...entries].sort(...).map(...)` para o dataset → dois sorts idênticos
na mesma renderização.

**Correção:** extraída variável `const sorted` usada por ambos (`hasMovingAverage` e
`data = sorted.map(...)`). Uma única passagem de sort.

### A3. Posicionamento preciso de `computeMovingAverage`/`hasMovingAverage`

**v1 dizia:** "inserir junto dos cálculos derivados de entries, perto de
`hasWeeklyTrend`" — impreciso para `str_replace`.

**Correção:** posicionado exatamente entre `const totalElapsedDays = ...` e o bloco
`const data = ...`, com o diff mostrando o contexto completo para `str_replace`.

### A4. Legenda "peso real" condicional a qualquer segunda série

**v1 dizia:** legenda de "peso real" ficava dentro do bloco `{hasWeeklyTrend && ...}` →
invisível quando `hasMovingAverage` é true mas `hasWeeklyTrend` é false.

**Correção:** legenda unificada (seção 2.5), condição da `<div>` é
`hasWeeklyTrend || hasMovingAverage`, com cada item condicionado individualmente.
"peso real" aparece sempre que alguma linha extra está visível.

### A5. Cálculo roda client-side (documentação)

**v1 não mencionava.** `WeightChart.tsx` é `"use client"`, então
`computeMovingAverage` importado de `analytics.ts` executa no browser. Isso é
intencional (dados já estão como prop, sem motivo para server action). Documentado
no bloco de Contexto do spec.

### A6. Duplicatas de `measured_at` (known behavior)

**v1 não mencionava.** Se existirem duas pesagens no mesmo dia, o `Map` por data
sobrescreve a primeira média com a segunda. Diferença é frações de grama, sem impacto
visual. Aceito e documentado na decisão 8.

### A7. Domínio do YAxis inalterado (documentação)

**v1 não mencionava.** A média é sempre [min, max] dos pesos — o `YAxis` domain já
cobre. Documentado na decisão 7.
