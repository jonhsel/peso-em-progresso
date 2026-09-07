# Fase 8.1.2 — Página de Conquistas (spec v2)

> v2 = v1 + auditoria completa contra o código real. Todos os achados
> da auditoria estão incorporados no texto principal. Apêndice A documenta
> o que mudou de v1 → v2. Pronta para handoff ao Claude Code.
>
> Ler `CLAUDE.md` e `claude_fases.md` antes de implementar — este documento
> assume as convenções já estabelecidas no projeto (design tokens, route
> group `(app)`, sem Server Actions pra escrita de tabela, RLS, wrapper
> `flex flex-col sm:flex-row min-h-screen`).

---

## 0. Decisões tomadas (com o usuário)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Gate de plano na página | **Pro-only** — fecha o gap do badge "Pro" que já existe na Sidebar desde o hotfix da 8.1 |
| 2 | Conteúdo da página | **Grid + timeline de desbloqueio + progresso até a próxima conquista** |
| 3 | `AchievementsCard` no dashboard | **Mantém como está (grátis, sem gate)**, ganha link pra página nova |

**Nota sobre o gate:** isso replica o mesmo padrão da 8.1.1 (previsão) —
o card no dashboard continua grátis (teaser), só a página dedicada é Pro.
Não é uma inconsistência acidental, é a decisão de produto.

---

## 1. Extensão de `src/lib/achievements.ts`

**Código real confirmado** (arquivo atual, sem `Goals`/`goals` — usa
`Goal | null` via `primaryWeightGoal`, diferente da v2 antiga do artefato
da Fase 4).

### 1.1 Adicionar `threshold` ao tipo e a cada regra

```diff
 export type AchievementRule = {
   key: string;
   label: string;
   description: string;
   category: AchievementCategory;
+  /** Valor numérico da condição — kg perdidos (absolute) ou % da meta (percentage). */
+  threshold: number;
   /** Ícone representativo (emoji) — usado no card do dashboard. */
   icon: string;
 };

 export const ACHIEVEMENT_RULES: AchievementRule[] = [
   // Perda absoluta
   {
     key: "lost_1kg",
     label: "Primeiro kg",
     description: "Perdeu 1 kg desde o primeiro registro.",
     category: "absolute",
+    threshold: 1,
     icon: "🎯",
   },
   {
     key: "lost_5kg",
     label: "-5 kg",
     description: "Perdeu 5 kg desde o primeiro registro.",
     category: "absolute",
+    threshold: 5,
     icon: "💪",
   },
   {
     key: "lost_10kg",
     label: "-10 kg",
     description: "Perdeu 10 kg desde o primeiro registro.",
     category: "absolute",
+    threshold: 10,
     icon: "🔥",
   },
   // Progresso percentual
   {
     key: "pct_25",
     label: "25% da meta",
     description: "25% do caminho até o peso alvo.",
     category: "percentage",
+    threshold: 25,
     icon: "🌱",
   },
   {
     key: "pct_50",
     label: "50% da meta",
     description: "Metade do caminho até o peso alvo.",
     category: "percentage",
+    threshold: 50,
     icon: "⚡",
   },
   {
     key: "pct_75",
     label: "75% da meta",
     description: "75% do caminho até o peso alvo.",
     category: "percentage",
+    threshold: 75,
     icon: "🚀",
   },
   {
     key: "pct_100",
     label: "Meta atingida",
     description: "Chegou no peso alvo!",
     category: "percentage",
+    threshold: 100,
     icon: "🏆",
   },
 ];
```

Motivo: o `threshold` vira a fonte única de verdade pro `check()` (elimina
o `switch` duplicado) **e** pro cálculo de progresso da página nova — sem
isso, a página teria que reimplementar os números 1/5/10/25/50/75/100 em
outro lugar, violando DRY.

### 1.2 Novo tipo `AchievementMetrics` (antes da assinatura de `evaluateAchievements`)

Inserir logo antes do bloco de JSDoc da `evaluateAchievements`:

```ts
export type AchievementMetrics = {
  totalLostKg: number;
  /** null quando não há meta de peso ativa/válida (blocked). */
  progressPct: number | null;
};
```

### 1.3 Alterar retorno de `evaluateAchievements`

**[Correção #A1]** — O diff da v1 misturava o tipo novo dentro do diff
da função. Separado em operações atômicas pra `str_replace` inequívoco.

Substituir a assinatura de retorno:

```
OLD:
): {
  all: EvaluatedAchievement[];
  newlyUnlocked: string[]; // achievement_keys a persistir
} {

NEW:
): {
  all: EvaluatedAchievement[];
  newlyUnlocked: string[];
  metrics: AchievementMetrics;
} {
```

### 1.4 Substituir `check` e `isBlocked` pra usar `threshold`

**[Correção #A2]** — Diffs separados por operação (OLD/NEW verbatim do
código real), evitando o diff monolítico da v1 que seria ambíguo pro
Claude Code.

**Operação A — substituir `check`:**

```
OLD:
  function check(key: string): boolean {
    switch (key) {
      case "lost_1kg":
        return totalLostKg >= 1;
      case "lost_5kg":
        return totalLostKg >= 5;
      case "lost_10kg":
        return totalLostKg >= 10;
      case "pct_25":
        return progressPct !== null && progressPct >= 25;
      case "pct_50":
        return progressPct !== null && progressPct >= 50;
      case "pct_75":
        return progressPct !== null && progressPct >= 75;
      case "pct_100":
        return progressPct !== null && progressPct >= 100;
      default:
        return false;
    }
  }

NEW:
  function check(rule: AchievementRule): boolean {
    if (rule.category === "absolute") return totalLostKg >= rule.threshold;
    return progressPct !== null && progressPct >= rule.threshold;
  }
```

**Operação B — substituir `isBlocked`:**

```
OLD:
  function isBlocked(key: string): string | null {
    const rule = ACHIEVEMENT_RULES.find((r) => r.key === key);
    if (!rule || rule.category !== "percentage") return null;
    if (!hasTarget) return "Defina um peso alvo em Metas";
    if (!firstAboveTarget) return "Peso alvo já alcançado";
    return null;
  }

NEW:
  function isBlocked(rule: AchievementRule): string | null {
    if (rule.category !== "percentage") return null;
    if (!hasTarget) return "Defina um peso alvo em Metas";
    if (!firstAboveTarget) return "Peso alvo já alcançado";
    return null;
  }
```

**Operação C — atualizar as chamadas dentro do `.map()`:**

```
OLD:
    const blocked = isBlocked(rule.key);

NEW:
    const blocked = isBlocked(rule);
```

```
OLD:
    const met = check(rule.key);

NEW:
    const met = check(rule);
```

**Operação D — alterar retorno da função:**

```
OLD:
  return { all, newlyUnlocked };
}

NEW:
  return { all, newlyUnlocked, metrics: { totalLostKg, progressPct } };
}
```

### 1.5 Nova função `getNextMilestone` (após `evaluateAchievements`)

Inserir logo após o fechamento de `evaluateAchievements`:

```ts
/**
 * Retorna a próxima conquista não desbloqueada de uma categoria (a de
 * menor threshold, já que ACHIEVEMENT_RULES está em ordem crescente).
 * `null` quando a categoria inteira já está desbloqueada. Pode retornar
 * uma conquista com status "blocked" — quem chama decide como exibir
 * (ver AchievementsProgress.tsx).
 */
export function getNextMilestone(
  all: EvaluatedAchievement[],
  category: AchievementCategory
): EvaluatedAchievement | null {
  return all.find((a) => a.rule.category === category && a.status !== "unlocked") ?? null;
}
```

**Compatibilidade com `AchievementsCard.tsx`:** o componente do dashboard
desestrutura `const { all, newlyUnlocked } = evaluateAchievements(...)` —
adicionar `metrics` ao retorno não quebra nada (propriedade extra
ignorada). Nenhuma mudança necessária em `AchievementsCard.tsx` por causa
destes diffs (a mudança do card é só a seção 7, abaixo).

---

## 2. Novo componente: `src/components/AchievementsGrid.tsx`

Server Component puro — versão maior do grid do card (mais espaço, ícone
maior, rótulo visível abaixo do ícone em vez de só tooltip).

```tsx
import type { EvaluatedAchievement } from "@/lib/achievements";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AchievementsGrid({ all }: { all: EvaluatedAchievement[] }) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
      {all.map((a) => (
        <AchievementTile key={a.rule.key} achievement={a} />
      ))}
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: EvaluatedAchievement }) {
  const { rule, status, unlockedAt, blockedReason } = achievement;

  const tooltip =
    status === "unlocked"
      ? `${rule.icon} ${rule.label} — ${rule.description}${
          unlockedAt
            ? ` (${format(parseISO(unlockedAt), "dd/MM/yyyy", { locale: ptBR })})`
            : ""
        }`
      : status === "blocked"
      ? `${rule.label} — ${blockedReason}`
      : `${rule.label} — ${rule.description}`;

  return (
    <div
      title={tooltip}
      className={`flex flex-col items-center gap-1.5 rounded-card border px-2 py-4 text-center transition ${
        status === "unlocked"
          ? "bg-accent-tint border-accent"
          : "border-base-border opacity-50"
      }`}
    >
      <span className={`text-3xl ${status !== "unlocked" ? "grayscale" : ""}`}>
        {status === "blocked" ? "🔒" : rule.icon}
      </span>
      <span className="text-xs text-ink-muted leading-tight">{rule.label}</span>
    </div>
  );
}
```

**[Correção #A3]** — Usa `bg-accent-tint` (forma curta registrada no
`tailwind.config.ts` desde a Fase 8.1) em vez de `bg-[var(--accent-tint)]`
(forma longa usada no `AchievementsCard.tsx` original, escrita antes do
registro existir). Componentes novos devem usar a forma curta.

Mesma nota da Fase 4 sobre `grayscale`: cosmético, a diferenciação real é
pelo fundo/borda/opacity — mantida aqui.

---

## 3. Novo componente: `src/components/AchievementsProgress.tsx`

Server Component puro. Mostra até 2 barras (uma por categoria) usando a
`threshold` da próxima conquista de cada categoria + os `metrics`
calculados em `evaluateAchievements`.

```tsx
import Link from "next/link";
import {
  getNextMilestone,
  type EvaluatedAchievement,
  type AchievementMetrics,
} from "@/lib/achievements";

export default function AchievementsProgress({
  all,
  metrics,
}: {
  all: EvaluatedAchievement[];
  metrics: AchievementMetrics;
}) {
  const nextAbsolute = getNextMilestone(all, "absolute");
  const nextPercentage = getNextMilestone(all, "percentage");

  return (
    <div className="space-y-4">
      {nextAbsolute ? (
        <ProgressRow
          label={`Próxima: ${nextAbsolute.rule.label}`}
          current={metrics.totalLostKg}
          target={nextAbsolute.rule.threshold}
          unit="kg"
        />
      ) : (
        <p className="text-sm text-ink-muted">
          🎉 Todas as conquistas de perda de peso desbloqueadas.
        </p>
      )}

      {nextPercentage?.status === "blocked" ? (
        <p className="text-sm text-ink-faint">
          {nextPercentage.blockedReason}
          {nextPercentage.blockedReason?.includes("Defina") && (
            <>
              {" — "}
              <Link href="/dashboard/goals" className="text-accent hover:text-accent-hover underline">
                ir para Metas
              </Link>
            </>
          )}
        </p>
      ) : nextPercentage ? (
        <ProgressRow
          label={`Próxima: ${nextPercentage.rule.label}`}
          current={metrics.progressPct ?? 0}
          target={nextPercentage.rule.threshold}
          unit="%"
        />
      ) : (
        <p className="text-sm text-ink-muted">
          🎉 Meta atingida — todas as conquistas de percentual desbloqueadas.
        </p>
      )}
    </div>
  );
}

function ProgressRow({
  label,
  current,
  target,
  unit,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
}) {
  const pct = Math.max(0, Math.min(100, (current / target) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-mono">
          {current.toFixed(1)}/{target} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-base-surface2 overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
```

**Decisão de design:** reaproveita `blockedReason` (já existente em
`achievements.ts`, string única de verdade) em vez de escrever a mensagem
de novo — cobre o caso "sem meta" e o caso mais raro "peso alvo já
alcançado mas ainda não passou por `pct_100`" sem duplicar texto.
`current.toFixed(1)` funciona pra kg e pra %, ambos decimais.

---

## 4. Novo componente: `src/components/AchievementsTimeline.tsx`

Server Component puro. Lista as conquistas desbloqueadas, mais recente
primeiro.

```tsx
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EvaluatedAchievement } from "@/lib/achievements";

export default function AchievementsTimeline({ all }: { all: EvaluatedAchievement[] }) {
  const unlocked = all
    .filter((a): a is EvaluatedAchievement & { unlockedAt: string } => a.status === "unlocked" && a.unlockedAt !== null)
    .sort((a, b) => (a.unlockedAt > b.unlockedAt ? -1 : 1));

  if (unlocked.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Nenhuma conquista desbloqueada ainda — continue registrando seu peso.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {unlocked.map((a) => (
        <li key={a.rule.key} className="flex items-center gap-3 text-sm">
          <span className="text-lg">{a.rule.icon}</span>
          <span className="flex-1 text-ink">{a.rule.label}</span>
          <span className="text-xs text-ink-faint font-mono">
            {format(parseISO(a.unlockedAt), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

O type guard no `.filter()` evita `unlockedAt!` (non-null assertion) —
mais seguro que a versão do `AchievementDot` original, que usa `!`.

---

## 5. Nova rota: `src/app/(app)/dashboard/achievements/page.tsx`

Server Component, mesmo padrão de `dashboard/challenges/page.tsx` e
`dashboard/prediction/page.tsx` (`loadUserData()` + `getTheme()` +
`Sidebar` + `PlanGate` + wrapper `flex flex-col sm:flex-row min-h-screen`).

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import { getPrimaryWeightGoal } from "@/lib/analytics";
import { evaluateAchievements } from "@/lib/achievements";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import AchievementsGrid from "@/components/AchievementsGrid";
import AchievementsProgress from "@/components/AchievementsProgress";
import AchievementsTimeline from "@/components/AchievementsTimeline";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const { profile, entries, activeGoals, achievements } = await loadUserData();
  const theme = await getTheme();

  const primaryWeightGoal = getPrimaryWeightGoal(activeGoals);
  const { all, metrics } = evaluateAchievements(entries, primaryWeightGoal, achievements);
  const unlockedCount = all.filter((a) => a.status === "unlocked").length;

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Conquistas">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Conquistas</p>
                <span className="text-xs text-ink-faint font-mono">
                  {unlockedCount}/{all.length}
                </span>
              </div>

              <AchievementsGrid all={all} />

              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Próxima conquista</p>
                <AchievementsProgress all={all} metrics={metrics} />
              </div>

              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4">
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Linha do tempo</p>
                <AchievementsTimeline all={all} />
              </div>
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
```

Notas de conformidade:
- `export const dynamic = "force-dynamic"` — obrigatório em rotas com
  dados pessoais (padrão do projeto).
- Página inteira dentro de `PlanGate` — free vê o card de bloqueio, sem
  vazar nenhum número (nem o `unlockedCount`, que fica dentro do gate).
- Não há **nenhuma persistência** nesta página — `newlyUnlocked` não é
  usado aqui de propósito. A gravação de conquistas novas continua
  acontecendo só no `AchievementsCard` do dashboard (única fonte de
  escrita em `user_achievements`, evita duas rotas gravando a mesma coisa
  em paralelo). Isso é 100% Server Component, sem `"use client"`.
- `max-w-2xl` (não `max-w-6xl`) — conteúdo é uma coluna só, mesmo padrão
  de `dashboard/challenges/page.tsx`.

---

## 6. Patch: `src/components/Sidebar.tsx`

**Código real confirmado** — remover só o `comingSoon: true` do item de
Conquistas (o `premium: true` fica, é o Pro-gate visual):

```diff
-  { href: "/dashboard/achievements", label: "Conquistas", icon: Award, premium: true, comingSoon: true },
+  { href: "/dashboard/achievements", label: "Conquistas", icon: Award, premium: true },
```

---

## 7. Patch: `src/components/AchievementsCard.tsx`

Adicionar link pra página nova, sem mexer em mais nada (persistência,
grid pequeno, tudo continua igual).

### 7.1 Import

```diff
 import { useEffect, useRef } from "react";
 import { useRouter } from "next/navigation";
+import Link from "next/link";
 import { createClient } from "@/lib/supabase/client";
```

### 7.2 JSX — footer do card

**[Correção #A5]** — OLD/NEW verbatim do código real pra `str_replace`
inequívoco. O `Link` se insere entre o fechamento do `</div>` do grid e
o fechamento do `</div>` do card inteiro.

```
OLD:
      <div className="grid grid-cols-7 gap-1.5">
        {all.map((a) => (
          <AchievementDot key={a.rule.key} achievement={a} />
        ))}
      </div>
    </div>

NEW:
      <div className="grid grid-cols-7 gap-1.5">
        {all.map((a) => (
          <AchievementDot key={a.rule.key} achievement={a} />
        ))}
      </div>
      <Link
        href="/dashboard/achievements"
        className="mt-3 block text-right text-xs text-accent hover:text-accent-hover"
      >
        Ver todas as conquistas →
      </Link>
    </div>
```

---

## 8. O que fica fora de escopo (não implementar nesta sub-fase)

- Conquistas baseadas em streak ou medidas corporais — mesma nota da
  Fase 4, infra já suporta via `ACHIEVEMENT_RULES`, mas não entra agora.
- Animação/confetti ao desbloquear.
- Conquistas no PDF exportado (`api/export/pdf` não muda).
- Compartilhamento social (imagem pra Instagram Stories, etc.) — pode ser
  uma sub-fase futura de marketing/growth, não técnica.
- Mostrar conquistas na visão do coach (`coach/[ownerId]/page.tsx`) — não
  solicitado, sem mudança nessa página.
- Filtro/busca na timeline — só faz sentido com mais de 7 conquistas, que
  não é o caso hoje.

---

## 9. Ordem de execução

1. Atualizar `src/lib/achievements.ts` (seção 1).
2. Criar `src/components/AchievementsGrid.tsx` (seção 2).
3. Criar `src/components/AchievementsProgress.tsx` (seção 3).
4. Criar `src/components/AchievementsTimeline.tsx` (seção 4).
5. Criar `src/app/(app)/dashboard/achievements/page.tsx` (seção 5).
6. Atualizar `src/components/Sidebar.tsx` (seção 6).
7. Atualizar `src/components/AchievementsCard.tsx` (seção 7).
8. `npx tsc --noEmit` e `npm run build`.

---

## 10. Checklist de validação em produção

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Sidebar: "Conquistas" agora navega (não é mais `<span>` cinza
      desabilitado); badge "Pro" continua aparecendo.
- [ ] Dashboard (qualquer plano): `AchievementsCard` continua idêntico
      (grid 7 colunas pequeno) + novo link "Ver todas as conquistas →".
- [ ] Conta Grátis: clicar no link/menu leva pra `/dashboard/achievements`
      e mostra o bloco de `PlanGate` (trancado), sem nenhum número vazando.
- [ ] Conta Pro, sem nenhuma pesagem: grid com 7 tiles locked/blocked,
      progresso mostra "0.0/1 kg" e (se sem meta) "Defina um peso alvo em
      Metas — ir para Metas" linkando certo, timeline mostra mensagem vazia.
- [ ] Conta Pro, com pesagens mas sem meta: conquistas absolutas avaliam
      normal (progresso de kg funciona), percentual continua bloqueado com
      a mensagem certa.
- [ ] Conta Pro, com meta e progresso parcial (ex: 30% do caminho):
      barra de "Próxima: 50% da meta" mostra ~30/50 preenchido
      proporcionalmente (não 30/100).
- [ ] Conta Pro com todas as 3 absolutas desbloqueadas (10kg+ perdidos):
      seção de progresso absoluto mostra "🎉 Todas... desbloqueadas" em
      vez de barra.
- [ ] Conta Pro com `pct_100` desbloqueada: mesma mensagem de celebração
      pro lado percentual.
- [ ] Timeline: conquistas aparecem ordenadas da mais recente pra mais
      antiga, datas formatadas `dd/MM/yyyy`.
- [ ] Peso já abaixo do alvo antes de qualquer registro percentual contar
      (`firstAboveTarget === false`): mensagem "Peso alvo já alcançado"
      aparece sem o link "ir para Metas" (só aparece quando a razão inclui
      "Defina").
- [ ] Tema claro/escuro: grid, barras de progresso (`bg-accent` sobre
      `bg-base-surface2`) e timeline com contraste adequado nos dois temas.
- [ ] Mobile (375px): grid `grid-cols-4` cabe sem cortar rótulos; barras
      de progresso ocupam a largura toda; timeline não quebra layout.
- [ ] `dashboard/coach/[ownerId]/page.tsx`: sem mudança, nenhuma conquista
      aparece lá (nunca apareceu, fora de escopo).

Depois de validar em produção: marcar o item no `claude_fases.md` (Fase 8
— Navegação/UX → "Conquistas") e atualizar os checkboxes acima. Próxima
sub-fase pendente: 8.1.3 (Exportar Dados).

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. Diff monolítico da seção 1.2 misturava tipo novo com corpo da função (SEVERIDADE: MÉDIA)

**v1 tinha:** `AchievementMetrics` definido como parte de um diff gigante
que reescrevia de `const newlyUnlocked` até o fim de `evaluateAchievements`.

**Problema:** o `str_replace` do Claude Code precisa de contexto verbatim
exato, e um diff de ~80 linhas com `+`/`-` intercalados gera ambiguidade.
Além disso, o tipo novo precisa ficar **antes** da assinatura da função
(como export independente), não dentro do diff do corpo.

**Correção:** seções 1.2–1.5 agora são operações atômicas separadas,
cada uma com OLD/NEW verbatim mínimo e suficiente.

### A2. Diffs de `check`/`isBlocked` eram um bloco só (SEVERIDADE: MÉDIA)

**v1 tinha:** um único diff que substituía `check`, `isBlocked`, as
chamadas, e o retorno — tudo junto.

**Problema:** mesmo do A1. Com operações atômicas (A–D na seção 1.4), o
Claude Code pode aplicar cada uma independentemente, com fallback mais
preciso se o contexto mudar entre a escrita do spec e a execução.

**Correção:** 4 operações (A–D) na seção 1.4, cada com seu OLD/NEW.

### A3. `AchievementsGrid` usava `bg-[var(--accent-tint)]` (SEVERIDADE: BAIXA)

**v1 tinha:** a forma longa `bg-[var(--accent-tint)]`, copiada do
`AchievementsCard.tsx` existente.

**Problema:** desde a Fase 8.1 (spec do sidebar v4), `accent-tint` está
registrado em `tailwind.config.ts` como `tint: "var(--accent-tint)"`. A
forma curta `bg-accent-tint` funciona e é mais legível. Componentes novos
devem usar a forma curta; o `AchievementsCard` existente pode ser migrado
em batch no futuro.

**Correção:** `AchievementsGrid` agora usa `bg-accent-tint`.

### A4. Import de tipos em `AchievementsProgress` usava duplo import (SEVERIDADE: COSMÉTICA)

**v1 tinha:** `import { getNextMilestone } from "..."` e
`import type { ..., AchievementMetrics } from "..."` — duas linhas do
mesmo módulo.

**Correção:** unificado em um único import com named + type.

### A5. Patch do `AchievementsCard.tsx` usava formato diff em vez de OLD/NEW (SEVERIDADE: MÉDIA)

**v1 tinha:** seção 7.2 em formato diff (`+`/`-`) sem contexto verbatim
suficiente pro `str_replace`.

**Correção:** reescrito com OLD/NEW com contexto completo (grid + card
wrapper div).

### A6. Validação geral de conformidade (NENHUM ACHADO ADICIONAL)

Itens conferidos sem problema:
- `getPrimaryWeightGoal` — existe e é exportada de `src/lib/analytics.ts`
  (confirmado). Recebe `Goal[]`, retorna `Goal | null`.
- `loadUserData()` — retorna `achievements` como `UserAchievement[]`
  (confirmado, na 7ª posição do `Promise.all`).
- `evaluateAchievements` — recebe `(WeightEntry[], Goal | null,
  UserAchievement[])` (confirmado), não `Goals`.
- `PlanGate` — aceita `plan: "free" | "pro"` e `featureName: string`
  (confirmado).
- `Sidebar` — aceita `displayName`, `theme`, `plan`, `activeGoals`
  (confirmado).
- Design tokens `bg-base-surface`, `border-base-border`, `rounded-card`,
  `text-ink-muted`, `text-ink-faint`, `font-mono`, `bg-accent`,
  `text-accent`, `bg-base-surface2` — todos registrados em
  `tailwind.config.ts` (confirmado).
- `date-fns` + `ptBR` locale — já usado em 5+ componentes do projeto,
  funciona em Server Components (puro JS, sem hooks).
- Wrapper `flex flex-col sm:flex-row min-h-screen` — padrão de todas as
  13 páginas do app desde hotfix 3 da Fase 8.1 (confirmado).
- `max-w-2xl` — correto pra página de coluna única (mesmo padrão de
  `challenges/page.tsx`, `settings/page.tsx`, `coach/page.tsx`,
  `import/page.tsx`).
