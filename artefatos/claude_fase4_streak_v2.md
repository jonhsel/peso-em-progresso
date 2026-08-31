# Fase 4.1 — Sequência de registros (streak) (v2)

> v2 = v1 auditada contra o código real do projeto. Achados da auditoria no
> final (Apêndice A). Todas as correções já estão incorporadas ao corpo do
> spec — rodar direto, não aplicar a v1 e depois a v2.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md` antes
> de implementar — este documento assume as convenções já estabelecidas no
> projeto (design tokens, route group `(app)`, funções puras em `src/lib/`,
> componentes Server por padrão, etc.).
>
> Esta é a primeira de 4 sub-fases da Fase 4 (Gamificação e engajamento) no
> `claude_fases.md`: streak → conquistas → check-in preferido → guia de ajuda.
> Cada uma será specced e validada separadamente, mesmo padrão da Fase 2
> (2.1 import, 2.2 medidas, 2.3 histórico de metas).

---

## 0. Contexto e objetivo

Item do roadmap: "Sequência de registros (streak de dias consecutivos, melhor
sequência histórica, indicador dos últimos 7 dias)".

Objetivo: dar um sinal de progresso imediato e visível no `/dashboard` — sem
depender de nenhum recurso pago — que reconheça o hábito de registrar peso
regularmente, não só o resultado (perda de peso em si).

**Sem tabela nova, sem migração.** O streak é inteiramente derivado das datas
já existentes em `weight_entries.measured_at`, que `loadUserData()` já busca
completo (ordenado por `measured_at asc`) para alimentar o gráfico. Calcular
o streak é adicionar uma função pura sobre esse mesmo array, sem query nova.

Três peças, todas no mesmo componente:
1. **Sequência atual** (dias consecutivos até hoje, com 1 dia de tolerância —
   ver seção 1.2).
2. **Melhor sequência histórica** (maior sequência já alcançada, mesmo que
   quebrada hoje).
3. **Indicador dos últimos 7 dias** (7 pontos, preenchido se houve registro
   naquele dia).

---

## 1. `src/lib/streak.ts` (novo arquivo)

Função pura, sem dependência de React/Supabase — mesmo padrão de
`src/lib/analytics.ts`/`src/lib/kpi-status.ts`.

### 1.1 Cuidado de fuso horário

`weight_entries.measured_at` é uma coluna `date` pura (sem hora), então não
tem timezone embutido. Mas "hoje", calculado a partir de `new Date()` num
servidor Vercel, roda em UTC — perto da meia-noite em São Paulo (UTC-3), UTC
já virou o dia seguinte, o que quebraria o streak um dia antes da hora. Mesmo
cuidado já usado em `ExportDocument.tsx`/`dashboard/page.tsx`
(`Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"` explícito), aqui
formatado direto em `YYYY-MM-DD` (locale `"en-CA"`, que já retorna nesse
formato) pra comparar direto com `measured_at`.

**[Correção #A2]** — **toda** conversão para string `YYYY-MM-DD` neste
arquivo usa `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`
— tanto `todayInSaoPaulo` quanto a helper `daysBefore`. Não usar
`.toISOString().slice(0, 10)` (que formata em UTC, anulando o cuidado de
fuso e causando off-by-one perto da meia-noite). `formatISO` do `date-fns`
também formata em UTC-local do Date, então também não serve aqui — o fuso
fixo via Intl é a abordagem correta.

### 1.2 Regra de "sequência atual" (tolerância de 1 dia)

Se o usuário já registrou hoje, a sequência conta a partir de hoje. Se ainda
não registrou hoje mas registrou ontem, a sequência **continua contando**
(ele ainda pode registrar mais tarde no dia) — só quebra (volta a 0) quando
faltam os dois: hoje e ontem sem registro. Isso evita que o streak pareça
"quebrado" só porque é 9h da manhã e a pessoa ainda não abriu o app hoje.

### 1.3 Código

```ts
import { subDays, parseISO } from "date-fns";
import type { WeightEntry } from "@/types/database";

export type StreakResult = {
  currentStreak: number;
  bestStreak: number;
  isActiveToday: boolean;
  last7Days: { date: string; hasEntry: boolean }[];
};

const SP_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Data de hoje em "YYYY-MM-DD" no fuso de referência do produto
 * (America/Sao_Paulo) — evita off-by-one em servidores Vercel (UTC).
 * Locale "en-CA" retorna direto no formato YYYY-MM-DD.
 */
function todayInSaoPaulo(reference: Date): string {
  return SP_FMT.format(reference);
}

/**
 * `dateStr` (YYYY-MM-DD) menos `days` dias, como string YYYY-MM-DD.
 * Usa o mesmo fuso (America/Sao_Paulo) que `todayInSaoPaulo` — nunca
 * `.toISOString()` (que seria UTC e causaria off-by-one perto da meia-noite).
 */
function daysBefore(dateStr: string, days: number): string {
  return SP_FMT.format(subDays(parseISO(dateStr), days));
}

export function computeStreak(entries: WeightEntry[], reference: Date = new Date()): StreakResult {
  const days = new Set(entries.map((e) => e.measured_at));
  const today = todayInSaoPaulo(reference);
  const isActiveToday = days.has(today);

  // --- Sequência atual (com 1 dia de tolerância, ver 1.2) ---
  let cursor = isActiveToday ? today : daysBefore(today, 1);
  let currentStreak = 0;
  if (days.has(cursor)) {
    while (days.has(cursor)) {
      currentStreak++;
      cursor = daysBefore(cursor, 1);
    }
  }

  // --- Melhor sequência histórica ---
  const sortedDays = [...days].sort();
  let bestStreak = 0;
  let run = 0;
  let prevDay: string | null = null;
  for (const day of sortedDays) {
    run = prevDay && daysBefore(day, 1) === prevDay ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prevDay = day;
  }
  bestStreak = Math.max(bestStreak, currentStreak); // sequência em andamento pode já ser a maior

  // --- Últimos 7 dias (hoje incluso, mais antigo primeiro) ---
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = daysBefore(today, 6 - i);
    return { date, hasEntry: days.has(date) };
  });

  return { currentStreak, bestStreak, isActiveToday, last7Days };
}
```

**Nota:** `days` inclui registros com `source = 'import'` além de `'manual'`
— um dia importado do CSV conta pra sequência tanto quanto um registro
manual. Faz sentido porque o streak mede "há dado desse dia", não "o usuário
abriu o app nesse dia".

---

## 2. `src/components/StreakCard.tsx` (novo arquivo)

**[Correção #A1]** — Server Component (sem `"use client"` — só exibe dados
já calculados, sem interação), mesmo padrão de `ExportButtons.tsx`. Diferente
de `KpiWeeklyTeaser.tsx`, que é `"use client"` porque usa `onClick` /
`document.getElementById` para scroll.

**[Correção #A3]** — O aviso "registre hoje pra manter" usa
`text-[var(--badge-caution-text)]` em vez de `text-signal-caution`, seguindo
o padrão já consolidado no projeto para texto `caution` sobre fundos claros
(ver `kpi-status.ts`, `KpiCard.tsx`). `signal-caution` (`#FBBF24`) sobre
`--base-surface` light (`#FFFFFF`) tem contraste ~1.9:1, ilegível. As CSS
vars `--badge-caution-text` resolvem `#8A5A0B` em light (contraste adequado)
e `#FBBF24` em dark (idêntico ao hex puro), cobrindo os dois temas.

```tsx
import { computeStreak } from "@/lib/streak";
import type { WeightEntry } from "@/types/database";

export default function StreakCard({ entries }: { entries: WeightEntry[] }) {
  const { currentStreak, bestStreak, isActiveToday, last7Days } = computeStreak(entries);
  const hasHistory = entries.length > 0;

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        {hasHistory ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-display font-bold text-2xl text-accent">{currentStreak}</span>
              <span className="text-xs text-ink-muted">
                {currentStreak === 1 ? "dia seguido" : "dias seguidos"}
              </span>
            </div>
            {!isActiveToday && currentStreak > 0 && (
              <span className="text-xs text-[var(--badge-caution-text)]">registre hoje pra manter</span>
            )}
            {bestStreak > 0 && (
              <span className="text-xs text-ink-faint font-mono">
                melhor: {bestStreak} {bestStreak === 1 ? "dia" : "dias"}
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-ink-muted">Registre hoje pra começar sua sequência</span>
        )}
      </div>
      <div className="flex items-center gap-1.5" aria-label="Últimos 7 dias">
        {last7Days.map((d) => (
          <span
            key={d.date}
            title={d.date}
            className={`h-2.5 w-2.5 rounded-full ${
              d.hasEntry ? "bg-accent" : "border border-base-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
```

**Tokens usados:**
- `text-accent` / `bg-accent` — cor de destaque da marca (terracota),
  confirmada em `tailwind.config.ts` como `accent: { DEFAULT: "var(--accent)",
  hover: "var(--accent-hover)" }`. Streak é sinal de hábito (categoria visual
  separada dos KPIs), por isso usa `accent` e não `signal-*`.
- `text-[var(--badge-caution-text)]` — padrão já consolidado no projeto para
  texto de alerta com contraste em ambos os temas.
- `border-base-border` nos pontos vazios — consistente com o visual dos dots
  de status do `KpiWeeklyTeaser`.

---

## 3. Patch: `src/app/(app)/dashboard/page.tsx`

Adicionar o import e renderizar o card logo abaixo do bloco de peso atual,
antes do `KpiWeeklyTeaser` — o streak é o sinal de hábito (mais imediato),
o teaser de KPI é o sinal de progresso (vem em seguida).

### 3.1 Import

```diff
 import KpiCard from "@/components/KpiCard";
 import KpiWeeklyTeaser from "@/components/KpiWeeklyTeaser";
+import StreakCard from "@/components/StreakCard";
 import TrendBadge from "@/components/TrendBadge";
```

### 3.2 Inserção no JSX

**[Correção #A4]** — contexto expandido para localização precisa pelo Claude
Code. O `StreakCard` entra logo após o fechamento do `</div>` que contém o
botão "Registrar pesagem", antes do `{weekKpi && ...}`.

Substituir este trecho no JSX:

```tsx
          </Link>
        </div>

        {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
```

Por:

```tsx
          </Link>
        </div>

        <StreakCard entries={entries} />

        {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
```

Não precisa de nenhum outro dado além de `entries`, que a página já
desestrutura de `loadUserData()`.

---

## 4. O que fica fora de escopo (não implementar nesta sub-fase)

- Persistir streak em `profiles` ou tabela nova — é sempre recalculado a
  partir de `weight_entries`, propositalmente sem estado guardado (evita
  dessincronia se um registro for editado/apagado depois).
- Conquistas por streak (ex. "7 dias seguidos" como badge) — isso é o
  próximo item da Fase 4 (conquistas/`user_achievements`), specced à parte.
- Notificação quando o streak está prestes a quebrar — depende do lembrete
  por e-mail (Fase 1, ainda não implementado) e do "próximo check-in"
  (também Fase 4, sub-fase separada).
- Mostrar o streak em `/dashboard/entries` ou em qualquer outra tela — só
  `/dashboard` por enquanto.

---

## 5. Ordem de execução

1. Criar `src/lib/streak.ts` (seção 1).
2. Criar `src/components/StreakCard.tsx` (seção 2).
3. Aplicar patch em `src/app/(app)/dashboard/page.tsx` (seção 3).
4. `npx tsc --noEmit` e `npm run build`.

---

## 6. Checklist de validação em produção

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta sem nenhuma pesagem: card mostra "Registre hoje pra começar sua
      sequência", sem número/zeros esquisitos, e os 7 pontos aparecem todos
      vazios.
- [ ] Registrar pesagem hoje: `currentStreak` vira pelo menos 1, ponto de
      hoje no indicador de 7 dias fica preenchido.
- [ ] Registrar pesagens em dias consecutivos (testar com 3-4 dias seguidos,
      ajustando `measured_at` manualmente se necessário) → `currentStreak`
      soma corretamente.
- [ ] Pular um dia no meio de uma sequência → `currentStreak` reflete só a
      sequência mais recente (não soma com a anterior); `bestStreak` guarda
      a sequência mais longa já vista, mesmo que não seja a atual.
- [ ] Sem registro hoje, mas com registro ontem → `currentStreak` continua
      contando (tolerância de 1 dia) e aparece o aviso "registre hoje pra
      manter".
- [ ] Sem registro hoje NEM ontem → `currentStreak` volta a 0.
- [ ] Teste de fuso: registrar uma pesagem por volta de 21h-23h horário de
      Brasília e confirmar que o dia contado é o dia local correto (não o
      dia seguinte em UTC).
- [ ] Importação de CSV (Fase 2.1) contando pra sequência: importar um dia
      via CSV e confirmar que o ponto correspondente nos últimos 7 dias
      aparece preenchido.
- [ ] Alternar tema claro/escuro com o card visível — cores `accent`/aviso
      caution/pontos vazios com contraste adequado nos dois temas (o aviso
      "registre hoje pra manter" deve ser legível tanto em dark quanto em
      light, graças ao `--badge-caution-text`).

---

## Depois de validar em produção

Marcar em `claude_fases.md`:

```diff
 ## Fase 4 — Gamificação e engajamento
 ...
-- [ ] Sequência de registros (streak de dias consecutivos, melhor sequência histórica,
-      indicador dos últimos 7 dias)
+- [x] Sequência de registros (streak de dias consecutivos, melhor sequência histórica,
+      indicador dos últimos 7 dias)
```

Adicionar seção "Fase 4.1 — Streak de registros" em `CLAUDE.md`, mesmo
padrão das seções "Fase 2.x"/"Fase 3" existentes: o que foi implementado,
decisão de não persistir estado (sempre recalculado), regra de tolerância
de 1 dia, e checklist de validação pendente.

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. Referência errada a `KpiWeeklyTeaser` como Server Component (SEVERIDADE: BAIXA)

**v1 dizia:** "Server Component (sem `"use client"` — só exibe dados já
calculados, sem interação), mesmo padrão de `KpiWeeklyTeaser.tsx`/
`ExportButtons.tsx`."

**Problema:** `KpiWeeklyTeaser.tsx` é `"use client"` (usa `onClick` e
`document.getElementById` para scroll suave). A comparação está errada e
poderia levar o Claude Code a adicionar `"use client"` desnecessariamente.

**Correção:** removido `KpiWeeklyTeaser` da comparação. `StreakCard` é
Server Component como `ExportButtons.tsx`.

### A2. `isoDaysBefore` usava `.toISOString().slice(0, 10)` — UTC, anulando o cuidado de fuso (SEVERIDADE: ALTA)

**v1 tinha:**
```ts
function isoDaysBefore(dateStr: string, days: number): string {
  return subDays(parseISO(dateStr), days).toISOString().slice(0, 10);
}
```

**Problema:** `.toISOString()` formata em UTC. `todayInSaoPaulo` calcula
"hoje" em São Paulo, mas `isoDaysBefore` (usada para calcular "ontem" e os
cursores de sequência) serializa em UTC. Perto da meia-noite em São Paulo
(quando UTC já virou o dia seguinte), a comparação entre "hoje (São Paulo)"
e "ontem (UTC)" ficaria inconsistente, causando off-by-one no streak.

**Correção:** substituída por `daysBefore` que usa o mesmo
`Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`,
garantindo que toda aritmética de data opera no mesmo fuso.

### A3. `text-signal-caution` ilegível no tema light (SEVERIDADE: MÉDIA)

**v1 tinha:** `<span className="text-xs text-signal-caution">registre hoje
pra manter</span>`

**Problema:** `signal-caution` é `#FBBF24` (hex fixo, igual nos dois temas —
decisão 12 do `CLAUDE.md`). Sobre `--base-surface` light (`#FFFFFF`),
contraste ~1.9:1 — ilegível. O projeto já resolveu isso para badges de KPI
usando `text-[var(--badge-caution-text)]` (que em light resolve pra
`#8A5A0B`, contraste adequado; em dark é `#FBBF24`, idêntico ao original).

**Correção:** trocado para `text-[var(--badge-caution-text)]`, mesmo padrão
de `kpi-status.ts` e `KpiCard.tsx`.

### A4. Diff de posicionamento ambíguo (SEVERIDADE: MÉDIA)

**v1 mostrava:**
```diff
+        <StreakCard entries={entries} />
         {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
```

**Problema:** sem contexto suficiente para o Claude Code localizar onde
aplicar o `str_replace`. O JSX da `dashboard/page.tsx` tem vários blocos
acima, e o diff curto demais causa ambiguidade.

**Correção:** expandido o diff na seção 3.2 com as linhas vizinhas reais
(`</Link>` + `</div>` do bloco de peso atual), usando o padrão de
"substituir este trecho" → "por este" para que o `str_replace` funcione
sem ambiguidade.
