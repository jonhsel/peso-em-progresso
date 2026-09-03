# Fase 5 — Widget-resumo de Medidas Corporais no dashboard (v2)

**Status:** v2 — auditada contra código real obtido via `project_knowledge_search`
(01/09/2026). Todos os trechos de diff usam contexto verbatim do repo para
localização unambígua pelo Claude Code.

Última sub-fase da Fase 5 (Inteligência sobre os dados): previsão da meta
(5.1, implementada) → média móvel de 7 dias (5.2, implementada) → seletor de
período do gráfico (5.3, implementada) → relatórios/insights (ainda não
speccada) → **widget-resumo de medidas corporais (este spec)**.

---

## Contexto

Do `claude_fases.md`, item da Fase 5: "Widget-resumo de Medidas Corporais no
dashboard (a página já existe desde a Fase 2; aqui é só o card compacto
puxando os últimos valores)."

A Fase 2.2 já entregou a tabela `body_measurements`, o formulário
(`BodyMeasurementForm.tsx`), o histórico com diff por campo
(`BodyMeasurementsList.tsx`) e a rota dedicada `/dashboard/measurements`. O
que falta é só a superfície de descoberta: hoje nada em `/dashboard` sugere
que essa feature existe — o usuário só a encontra se clicar em "Medidas" na
`NavBar`.

`loadUserData()` já retorna `measurements` (ordenado por `measured_at`
ascendente) — **nenhuma mudança de schema, RLS, ou `loadUserData.ts`** é
necessária. Todo o trabalho é um componente novo + uma inserção de 2 linhas
em `dashboard/page.tsx`.

---

## Decisões fechadas (não reabrir sem motivo)

1. **Posição na página:** no fim, depois da seção `id="kpi-details"` com os
   4 `KpiCard` — é o card menos acionável no dia a dia (medidas mudam devagar
   comparado a peso), então fica abaixo de tudo que já compete pela atenção
   acima da dobra.
2. **Conteúdo:** valores mais recentes **+ diff por campo**, reaproveitando
   a mesma lógica já existente em `BodyMeasurementsList.tsx` — para cada
   campo, o "valor atual" é o registro mais recente **que tenha aquele campo
   preenchido**, e o diff compara contra o próximo registro mais antigo que
   também tenha aquele campo preenchido. Mesma decisão de "sem cor semântica"
   da Fase 2.2.
3. **Sem nenhuma medida registrada:** `return null` — ausência silenciosa,
   mesmo padrão de `hasWeeklyTrend`/`hasMovingAverage`.
4. **Card inteiro é um `<Link>`** para `/dashboard/measurements` — hover
   `hover:border-ink-faint` (mesmo tratamento do `KpiWeeklyTeaser`).
5. **Data por campo quando diverge do cabeçalho:** o cabeçalho mostra a data
   do registro mais recente da tabela; cada campo mostra a própria data só
   quando ela diverge (evita repetir a mesma data 4× quando tudo foi medido
   junto, mas não esconde quando os campos estão desatualizados de forma
   desigual).
6. **Server Component** (sem `"use client"`) — não há interação além da
   navegação via `<Link>`, que funciona em Server Component.

---

## Mudanças confirmadas na auditoria (v1 → v2)

### #A1 — `measurements` NÃO está desestruturado em `dashboard/page.tsx`

**Confirmado no código real.** A desestruturação atual é:

```ts
const { user, profile, entries, goals, goalsHistory, achievements } = await loadUserData();
```

`measurements` não está listado — precisa ser adicionado explicitamente.
O diff na seção 2.2 abaixo usa o contexto verbatim.

### #A2 — Contexto exato do fim de `kpi-details` confirmado

O trecho real do fechamento da seção dos 4 `KpiCard` e do `</main>` é:

```tsx
        <div id="kpi-details">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Metas por período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.period}
                kpi={kpi}
                prediction={
                  kpi.period === "week" ? weekPrediction : kpi.period === "month" ? monthPrediction : undefined
                }
              />
            ))}
          </div>
        </div>
      </main>
```

O spec v1 usava este contexto corretamente. Mantido sem alteração.

### #A3 — `BodyMeasurementsList.tsx` diff usa `diff !== 0`, confirmado

O código real da lista usa `diff !== null && diff !== 0` antes de mostrar a
variação — mesma guarda que o widget replica. Consistente.

### #A4 — Tipo `BodyMeasurement` confirmado

O tipo em `database.ts` é exatamente o que o spec v1 assumiu:
`waist_cm: number | null`, `hip_cm: number | null`, `arm_cm: number | null`,
`body_fat_pct: number | null`, `measured_at: string`, `note: string | null`.
Nenhum campo adicional a considerar.

### #A5 — Não há classe Tailwind dinâmica no componente

O componente não monta nenhuma classe via template literal — todas as classes
são strings completas estáticas. Sem risco de purge. ✅

### #A6 — Sem conflito de import em `dashboard/page.tsx`

O import do novo componente (`BodyMeasurementsSummaryCard`) não conflita com
nenhum import existente na página.

---

## 1. Componente novo: `src/components/BodyMeasurementsSummaryCard.tsx`

```tsx
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BodyMeasurement } from "@/types/database";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "arm_cm", label: "Braço", unit: "cm" },
  { key: "body_fat_pct", label: "% gordura", unit: "%" },
];

type FieldSummary = {
  key: FieldKey;
  label: string;
  unit: string;
  value: number;
  date: string;
  diff: number | null;
};

export default function BodyMeasurementsSummaryCard({
  measurements,
}: {
  measurements: BodyMeasurement[];
}) {
  if (measurements.length === 0) return null;

  // Mais recente primeiro — mesma orientação usada em BodyMeasurementsList.
  const sortedDesc = [...measurements].sort(
    (a, b) => b.measured_at.localeCompare(a.measured_at)
  );
  const lastUpdated = sortedDesc[0].measured_at;

  const fields: FieldSummary[] = FIELDS.map((f) => {
    const latest = sortedDesc.find((m) => m[f.key] !== null);
    if (!latest) return null;

    const latestIdx = sortedDesc.indexOf(latest);
    const previous =
      sortedDesc.slice(latestIdx + 1).find((m) => m[f.key] !== null) ?? null;
    const diff = previous
      ? Number(latest[f.key]) - Number(previous[f.key])
      : null;

    return {
      key: f.key,
      label: f.label,
      unit: f.unit,
      value: Number(latest[f.key]),
      date: latest.measured_at,
      diff,
    };
  }).filter((f): f is FieldSummary => f !== null);

  // Guarda defensiva: o CHECK do banco garante >=1 campo por registro, então
  // measurements.length > 0 implica fields.length > 0. Mantido só por
  // segurança contra dado inconsistente.
  if (fields.length === 0) return null;

  return (
    <Link
      href="/dashboard/measurements"
      className="block rounded-card border border-base-border bg-base-surface p-5 transition hover:border-ink-faint"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          Medidas corporais
        </p>
        <span className="font-mono text-xs text-ink-faint">
          {format(parseISO(lastUpdated), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <p className="text-xs text-ink-faint mb-1">{f.label}</p>
            <p className="font-mono font-bold text-lg text-ink">
              {f.value.toFixed(1)}
              <span className="text-xs text-ink-muted font-normal ml-0.5">
                {f.unit}
              </span>
            </p>
            {f.diff !== null && f.diff !== 0 && (
              <p className="text-xs text-ink-faint">
                {f.diff > 0 ? "↑" : "↓"} {Math.abs(f.diff).toFixed(1)}{" "}
                {f.unit}
              </p>
            )}
            {f.date !== lastUpdated && (
              <p className="text-[10px] text-ink-faint mt-0.5">
                {format(parseISO(f.date), "dd/MM", { locale: ptBR })}
              </p>
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
```

**Notas de implementação (inalteradas da v1, confirmadas válidas):**

- `Number(latest[f.key])` — mesma cautela em uso no resto do projeto para
  colunas `numeric` do Postgres.
- `f.diff !== null && f.diff !== 0` — não mostra diff quando o valor não
  mudou (evita ruído de "↓ 0.0 cm"). Mesmo padrão de
  `BodyMeasurementsList.tsx`.
- Sem cor semântica no diff — mesma decisão da Fase 2.2.
- Todas as classes Tailwind são strings literais estáticas — sem risco de
  purge (regra do `CLAUDE.md`).

---

## 2. Patch: `src/app/(app)/dashboard/page.tsx`

### 2.1 Import

Inserir na seção de imports, após o import de `WeightChart`:

```diff
 import WeightChart from "@/components/WeightChart";
+import BodyMeasurementsSummaryCard from "@/components/BodyMeasurementsSummaryCard";
 import Link from "next/link";
```

### 2.2 Desestruturar `measurements` de `loadUserData`

**[Correção #A1]** — `measurements` não está desestruturado atualmente.

Substituir esta linha (verbatim do código real):

```ts
  const { user, profile, entries, goals, goalsHistory, achievements } = await loadUserData();
```

Por:

```ts
  const { user, profile, entries, measurements, goals, goalsHistory, achievements } = await loadUserData();
```

### 2.3 Inserção no JSX

Entra depois do fechamento de `</div>` do `id="kpi-details"`, como último
bloco dentro de `<main>`, antes do `</main>`.

Substituir este trecho (verbatim do código real):

```tsx
        <div id="kpi-details">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Metas por período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.period}
                kpi={kpi}
                prediction={
                  kpi.period === "week" ? weekPrediction : kpi.period === "month" ? monthPrediction : undefined
                }
              />
            ))}
          </div>
        </div>
      </main>
```

Por:

```tsx
        <div id="kpi-details">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Metas por período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.period}
                kpi={kpi}
                prediction={
                  kpi.period === "week" ? weekPrediction : kpi.period === "month" ? monthPrediction : undefined
                }
              />
            ))}
          </div>
        </div>

        <BodyMeasurementsSummaryCard measurements={measurements} />
      </main>
```

Nenhuma outra mudança em `dashboard/page.tsx` — `measurements` só é passado
adiante, sem novo cálculo na página.

---

## Fora de escopo

- Qualquer mudança em `body_measurements` (schema), RLS, `loadUserData.ts`,
  `BodyMeasurementForm.tsx`, `BodyMeasurementsList.tsx` ou na rota
  `/dashboard/measurements`.
- Gráfico/histórico de medidas dentro do card — é um resumo pontual (último
  valor + diff), não uma visualização de série temporal.
- Relatórios/Insights (próximo item não-speccado da Fase 5).
- Migração SQL — nenhuma necessária.
- PDF export (`api/export/pdf/route.tsx`) — não mudou, o widget é só UI do
  dashboard.

---

## Checklist de teste

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta sem nenhuma medida: nada aparece abaixo dos 4 `KpiCard` (sem
      espaço em branco residual, sem erro).
- [ ] Conta com 1 único registro preenchendo todos os 4 campos: card mostra
      os 4 valores, sem nenhuma linha de diff (não há registro anterior).
- [ ] Conta com 2+ registros, cada um preenchendo campos diferentes em datas
      diferentes (ex.: cintura só no registro mais antigo, braço só no mais
      recente): cada campo mostra seu próprio valor mais recente e sua
      própria data quando ela diverge da data do cabeçalho.
- [ ] Diff correto: aumentar a cintura entre dois registros mostra `↑`;
      diminuir mostra `↓`; valor igual não mostra linha de diff.
- [ ] Clicar em qualquer ponto do card navega para `/dashboard/measurements`.
- [ ] Tema claro/escuro: contraste de `text-ink-faint`/`text-ink-muted`
      adequado nos dois temas.
- [ ] Mobile: grid 2 colunas (`grid-cols-2`) não aperta os 4 campos; rótulos
      curtos como "% gordura" cabem no espaço reduzido.

## Passos de execução (ordem)

1. Criar `src/components/BodyMeasurementsSummaryCard.tsx` (seção 1).
2. Aplicar patch em `dashboard/page.tsx` (seção 2 — import, desestruturação,
   JSX).
3. `npx tsc --noEmit` e `npm run build`.
4. Rodar checklist de teste manual.
5. Atualizar `CLAUDE.md`:
   - Nova seção "Fase 5 — Widget-resumo de medidas corporais (implementada
     DD/MM/YYYY)" documentando o componente, as decisões (ausência silenciosa,
     sem cor semântica, Server Component), e que `dashboard/page.tsx` agora
     desestrutura `measurements`.
6. Marcar o item em `claude_fases.md` (Fase 5 → "Widget-resumo de Medidas
   Corporais no dashboard").

---

## Apêndice A — Changelog v1 → v2

| #   | Item                                                        | Mudança                                                                                                                                             |
|-----|-------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| A1  | `measurements` não desestruturado em `dashboard/page.tsx`   | Confirmado no código real. Diff 2.2 usa contexto verbatim da desestruturação atual para `str_replace` unambíguo.                                    |
| A2  | Contexto do fim de `kpi-details`                            | Confirmado verbatim. Nenhuma mudança necessária — o diff da v1 já estava correto.                                                                    |
| A3  | Consistência do diff guard (`!== 0`)                        | Confirmado idêntico ao `BodyMeasurementsList.tsx` real.                                                                                              |
| A4  | Tipo `BodyMeasurement`                                      | Confirmado exato. Nenhum campo adicional.                                                                                                            |
| A5  | Nenhuma classe Tailwind dinâmica                            | Confirmado — todas literais estáticas. ✅                                                                                                             |
| A6  | Import sem conflito                                         | Confirmado — posicionado entre `WeightChart` e `Link` (ordem alfabética do que faz sentido contextual).                                              |
| —   | Posição do import (seção 2.1)                               | v1 não especificava onde no bloco de imports inserir. v2 fixa entre `WeightChart` e `Link` com diff verbatim.                                        |

**Itens pendentes:** nenhum. Spec pronto para handoff ao Claude Code.
