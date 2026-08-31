# Fase 4.2 — Conquistas (achievements) (v2)

> v2 = v1 auditada contra o código real do projeto. Achados da auditoria no
> final (Apêndice A). Todas as correções já estão incorporadas ao corpo do
> spec — rodar direto, não aplicar a v1 e depois a v2.
>
> Spec para handoff ao Claude Code. Ler `CLAUDE.md` e `claude_fases.md` antes
> de implementar — este documento assume as convenções já estabelecidas no
> projeto (design tokens, route group `(app)`, funções puras em `src/lib/`,
> RLS, etc.).
>
> Esta é a segunda de 4 sub-fases da Fase 4 (Gamificação e engajamento):
> streak (4.1, já implementada) → **conquistas** (4.2) → check-in preferido
> → guia de ajuda.

---

## 0. Contexto e objetivo

Item do roadmap: "Conquistas (primeiro kg perdido, -5kg, 25/50/75/100% da
meta — tabela de regras + `user_achievements`)".

Objetivo: reconhecer marcos de progresso além do KPI por período — coisas
que o usuário "conquistou" ao longo da jornada e que não se perdem se ele
tiver uma semana ruim. Complementa o streak (hábito diário) com um sinal
de resultado acumulado.

**Decisões fechadas antes de escrever este spec:**

1. **Conquistas são persistidas** na tabela `user_achievements` — diferente
   do streak (recalculado a cada load), porque conquistas têm timestamp de
   desbloqueio ("você perdeu 5 kg em 15/08") que não dá pra reconstruir sem
   gravar. Uma vez desbloqueada, nunca é revogada (mesmo que o peso suba
   depois).
2. **Card no dashboard** — sem tela separada. Aparece abaixo do `StreakCard`,
   mostrando as conquistas desbloqueadas recentes + contagem total.
3. **Conquistas de % da meta** (25/50/75/100%) dependem de
   `goals.target_weight_kg` (peso alvo), que é opcional. Conta sem peso alvo
   mostra essas conquistas como **bloqueadas** ("defina um peso alvo"),
   não as esconde silenciosamente.

---

## 1. Regras de conquista — definição estática

As regras vivem como constante em `src/lib/achievements.ts` (código, não
banco) — são as mesmas pra todo mundo, o que varia por usuário é **quais
foram desbloqueadas** (tabela `user_achievements`).

Duas categorias:

### 1.1 Perda absoluta (kg perdidos desde o primeiro registro)

Cálculo: `first_entry.weight_kg - latest_entry.weight_kg`. Positivo = perdeu.

| Chave          | Rótulo             | Condição       |
|----------------|--------------------|----------------|
| `lost_1kg`     | Primeiro kg perdido | ≥ 1 kg         |
| `lost_5kg`     | -5 kg              | ≥ 5 kg         |
| `lost_10kg`    | -10 kg             | ≥ 10 kg        |

### 1.2 Progresso percentual em relação ao peso alvo

Cálculo: `(first_entry.weight_kg - latest_entry.weight_kg) /
(first_entry.weight_kg - goals.target_weight_kg) * 100`. Só avaliável
quando `target_weight_kg` não é `null` e `first_entry.weight_kg >
target_weight_kg` (o usuário está acima do alvo — se já estiver no alvo ou
abaixo, essas conquistas não se aplicam e ficam bloqueadas com "peso alvo
já alcançado").

| Chave           | Rótulo       | Condição       |
|-----------------|-------------|----------------|
| `pct_25`        | 25% da meta  | ≥ 25%          |
| `pct_50`        | 50% da meta  | ≥ 50%          |
| `pct_75`        | 75% da meta  | ≥ 75%          |
| `pct_100`       | Meta atingida| ≥ 100%         |

**7 conquistas no total.** Suficiente pra essa fase — a estrutura suporta
adicionar mais depois (streak-based, measurements-based, etc.) sem mudar
schema.

---

## 2. Migração SQL — `supabase/migrations/0006_user_achievements.sql`

```sql
-- =========================================================
-- Fase 4.2 — Conquistas (achievements)
-- =========================================================
-- Como aplicar: Supabase Dashboard > SQL Editor > cole e rode.
-- Idempotente (seguro rodar mais de uma vez).

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  constraint user_achievements_unique unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "user_achievements_insert_own"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

-- Sem policy de update/delete: conquistas não são revogadas.

comment on table public.user_achievements is
  'Conquistas desbloqueadas por usuário. Chave única (user_id, achievement_key) impede duplicata. Sem update/delete — uma vez desbloqueada, permanece.';
```

Também acrescentar a mesma definição ao final de `supabase/schema.sql`
(referência), com comentário apontando pra migração 0006.

---

## 3. `src/types/database.ts` — tipo e registro em `Database.Tables`

```diff
+export type UserAchievement = {
+  id: string;
+  user_id: string;
+  achievement_key: string;
+  unlocked_at: string;
+};
+
 export type Database = {
   public: {
     Tables: {
       ...
+      user_achievements: {
+        Row: UserAchievement;
+        Insert: Partial<UserAchievement> & { user_id: string; achievement_key: string };
+        Update: never; // conquistas não são editáveis
+        Relationships: [];
+      };
     };
   };
 };
```

---

## 4. `src/lib/achievements.ts` (novo arquivo)

Definição das regras + função pura que avalia quais estão desbloqueadas +
quais são novas (ainda não persistidas).

```ts
import type { WeightEntry, Goals, UserAchievement } from "@/types/database";

// --- Definição das regras ---

export type AchievementCategory = "absolute" | "percentage";

export type AchievementRule = {
  key: string;
  label: string;
  description: string;
  category: AchievementCategory;
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
    icon: "🎯",
  },
  {
    key: "lost_5kg",
    label: "-5 kg",
    description: "Perdeu 5 kg desde o primeiro registro.",
    category: "absolute",
    icon: "💪",
  },
  {
    key: "lost_10kg",
    label: "-10 kg",
    description: "Perdeu 10 kg desde o primeiro registro.",
    category: "absolute",
    icon: "🔥",
  },
  // Progresso percentual
  {
    key: "pct_25",
    label: "25% da meta",
    description: "25% do caminho até o peso alvo.",
    category: "percentage",
    icon: "🌱",
  },
  {
    key: "pct_50",
    label: "50% da meta",
    description: "Metade do caminho até o peso alvo.",
    category: "percentage",
    icon: "⚡",
  },
  {
    key: "pct_75",
    label: "75% da meta",
    description: "75% do caminho até o peso alvo.",
    category: "percentage",
    icon: "🚀",
  },
  {
    key: "pct_100",
    label: "Meta atingida",
    description: "Chegou no peso alvo!",
    category: "percentage",
    icon: "🏆",
  },
];

// --- Avaliação ---

export type EvaluatedAchievement = {
  rule: AchievementRule;
  status: "unlocked" | "locked" | "blocked";
  /** Quando foi desbloqueada (da tabela). null se locked/blocked. */
  unlockedAt: string | null;
  /** Motivo do bloqueio (só para "blocked"). */
  blockedReason: string | null;
};

/**
 * Avalia todas as conquistas para um usuário, cruzando as regras com os
 * dados atuais e a lista de conquistas já persistidas.
 *
 * - "unlocked": condição atingida e já salva em `user_achievements`.
 * - "locked": condição não atingida (ainda).
 * - "blocked": condição impossível de avaliar (ex: sem peso alvo) —
 *   mostra no UI com "defina um peso alvo pra desbloquear".
 *
 * Retorna também `newlyUnlocked`: conquistas cuja condição é atingida
 * agora mas que ainda não estão em `user_achievements` — o caller
 * (dashboard page) deve persistir essas no banco.
 */
export function evaluateAchievements(
  entries: WeightEntry[],
  goals: Goals,
  existing: UserAchievement[]
): {
  all: EvaluatedAchievement[];
  newlyUnlocked: string[]; // achievement_keys a persistir
} {
  const existingKeys = new Set(existing.map((a) => a.achievement_key));
  const existingMap = new Map(existing.map((a) => [a.achievement_key, a]));

  // Dados derivados
  const sorted = [...entries].sort((a, b) =>
    a.measured_at.localeCompare(b.measured_at)
  );
  const first = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;

  const totalLostKg =
    first && latest ? Number(first.weight_kg) - Number(latest.weight_kg) : 0;

  const targetWeight = goals.target_weight_kg;
  const hasTarget = targetWeight !== null && targetWeight > 0;
  const firstAboveTarget =
    hasTarget && first ? Number(first.weight_kg) > targetWeight : false;
  const progressPct =
    hasTarget && firstAboveTarget && first
      ? (totalLostKg / (Number(first.weight_kg) - targetWeight!)) * 100
      : null;

  const newlyUnlocked: string[] = [];

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

  function isBlocked(key: string): string | null {
    const rule = ACHIEVEMENT_RULES.find((r) => r.key === key);
    if (!rule || rule.category !== "percentage") return null;
    if (!hasTarget) return "Defina um peso alvo em Metas";
    if (!firstAboveTarget) return "Peso alvo já alcançado";
    return null;
  }

  const all: EvaluatedAchievement[] = ACHIEVEMENT_RULES.map((rule) => {
    if (existingKeys.has(rule.key)) {
      return {
        rule,
        status: "unlocked" as const,
        unlockedAt: existingMap.get(rule.key)!.unlocked_at,
        blockedReason: null,
      };
    }

    const blocked = isBlocked(rule.key);
    if (blocked) {
      return {
        rule,
        status: "blocked" as const,
        unlockedAt: null,
        blockedReason: blocked,
      };
    }

    const met = check(rule.key);
    if (met) {
      newlyUnlocked.push(rule.key);
      return {
        rule,
        status: "unlocked" as const,
        unlockedAt: new Date().toISOString(),
        blockedReason: null,
      };
    }

    return {
      rule,
      status: "locked" as const,
      unlockedAt: null,
      blockedReason: null,
    };
  });

  return { all, newlyUnlocked };
}
```

**Decisões de design no código:**

- `evaluateAchievements` é pura (não faz I/O) — recebe tudo como argumento,
  retorna tudo como resultado. O caller persiste as novas.
- Uma conquista já desbloqueada no banco **nunca é reavaliada** — se
  `existingKeys` tem a key, status é `"unlocked"` direto, sem checar a
  condição. Isso garante que uma conquista nunca é "perdida" se o peso subir
  depois.
- `newlyUnlocked` contém só as keys novas (condição atingida + não salva
  ainda) — o caller faz o insert.
- `totalLostKg` pode ser negativo (usuário ganhou peso) — nesse caso nenhuma
  conquista absoluta é atingida, o que é o comportamento correto.
- O `unlockedAt` de conquistas recém-desbloqueadas usa `new Date().toISOString()`
  (tempo do server render). Após o insert no banco (que usa `default now()`),
  o próximo load trará o `unlocked_at` do banco — os dois timestamps diferem
  por alguns segundos, o que é esperado e negligível.

---

## 5. `src/lib/loadUserData.ts` — carregar conquistas

**[Correção #A4]** — diff expandido com as linhas reais do `Promise.all`
para que o Claude Code saiba exatamente onde inserir.

```diff
 import type {
-  Goals, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement
+  Goals, GoalsHistoryEntry, Profile, WeightEntry, BodyMeasurement, UserAchievement
 } from "@/types/database";
```

Na desestruturação do `Promise.all`, adicionar a query de achievements
como último item (logo após a query de `goals_history`):

```diff
-  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }, { data: goalsHistory }] =
+  const [{ data: profile }, { data: entries }, { data: goals }, { data: measurements }, { data: goalsHistory }, { data: achievements }] =
     await Promise.all([
       supabase.from("profiles").select("*").eq("id", user.id).single(),
       supabase
         .from("weight_entries")
         .select("*")
         .eq("user_id", user.id)
         .order("measured_at", { ascending: true }),
       supabase.from("goals").select("*").eq("user_id", user.id).single(),
       supabase
         .from("body_measurements")
         .select("*")
         .eq("user_id", user.id)
         .order("measured_at", { ascending: true }),
       supabase
         .from("goals_history")
         .select("*")
         .eq("user_id", user.id)
         .order("created_at", { ascending: false }),
+      supabase
+        .from("user_achievements")
+        .select("*")
+        .eq("user_id", user.id),
     ]);
```

E no objeto de retorno:

```diff
   return {
     user,
     profile: ...,
     entries: ...,
     measurements: ...,
     goalsHistory: ...,
     goals: ...,
+    achievements: (achievements as UserAchievement[]) ?? [],
   };
```

Sem ordenação necessária — são no máximo 7 registros por usuário.

---

## 6. `src/components/AchievementsCard.tsx` (novo arquivo)

Client component (`"use client"`) — precisa do `useEffect` para persistir
conquistas novas sem bloquear o render inicial.

**[Correção #A6]** — O `useEffect` cria o Supabase client internamente
(`createClient()`) em vez de receber via closure do componente, evitando
objetos instáveis na lista de deps. `router` é omitido das deps com
`eslint-disable` justificado (o guard `didPersist.current` impede
re-execução; o `router` é estável na prática, só não tem identidade
referencial garantida pelo React).

**[Correção #A2]** — O CSS `grayscale` pode não afetar emojis renderizados
nativamente pelo OS em todos os browsers (especialmente iOS Safari). A
diferenciação visual primária entre unlocked e locked vem do fundo/borda/
opacity, não do grayscale — o filtro é cosmético "best effort".

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  evaluateAchievements,
  ACHIEVEMENT_RULES,
  type EvaluatedAchievement,
} from "@/lib/achievements";
import type { WeightEntry, Goals, UserAchievement } from "@/types/database";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AchievementsCard({
  entries,
  goals,
  achievements,
  userId,
}: {
  entries: WeightEntry[];
  goals: Goals;
  achievements: UserAchievement[];
  userId: string;
}) {
  const router = useRouter();
  const didPersist = useRef(false);

  const { all, newlyUnlocked } = evaluateAchievements(entries, goals, achievements);

  // Persistir conquistas novas (fire-and-forget, sem bloquear o render).
  // useRef evita re-execução em StrictMode / re-renders.
  // `createClient()` é criado dentro do efeito para não ser dep instável.
  // `router` omitido das deps — estável na prática, guard por ref impede loop.
  useEffect(() => {
    if (newlyUnlocked.length === 0 || didPersist.current) return;
    didPersist.current = true;

    const supabase = createClient();
    const rows = newlyUnlocked.map((key) => ({
      user_id: userId,
      achievement_key: key,
    }));

    supabase
      .from("user_achievements")
      .insert(rows)
      .then(({ error }) => {
        if (!error) router.refresh();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newlyUnlocked, userId]);

  const unlockedCount = all.filter((a) => a.status === "unlocked").length;
  const totalCount = ACHIEVEMENT_RULES.length;

  return (
    <div className="rounded-card border border-base-border bg-base-surface px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-ink-muted">
          Conquistas
        </span>
        <span className="text-xs text-ink-faint font-mono">
          {unlockedCount}/{totalCount}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {all.map((a) => (
          <AchievementDot key={a.rule.key} achievement={a} />
        ))}
      </div>
    </div>
  );
}

function AchievementDot({ achievement }: { achievement: EvaluatedAchievement }) {
  const { rule, status, unlockedAt, blockedReason } = achievement;

  const tooltip =
    status === "unlocked"
      ? `${rule.icon} ${rule.label} — ${rule.description}${
          unlockedAt
            ? ` (${format(parseISO(unlockedAt), "dd/MM/yyyy", { locale: ptBR })})`
            : ""
        }`
      : status === "blocked"
      ? `🔒 ${rule.label} — ${blockedReason}`
      : `${rule.label} — ${rule.description}`;

  return (
    <div
      title={tooltip}
      className={`flex items-center justify-center h-9 w-full rounded-lg text-sm cursor-default transition ${
        status === "unlocked"
          ? "bg-[var(--accent-tint)] border border-accent"
          : status === "blocked"
          ? "bg-base-surface2 border border-base-border opacity-40"
          : "bg-base-surface2 border border-base-border opacity-60"
      }`}
    >
      <span className={status !== "unlocked" ? "grayscale" : ""}>
        {status === "blocked" ? "🔒" : rule.icon}
      </span>
    </div>
  );
}
```

**Decisões de design no componente:**

- **Grid 7 colunas** — 7 conquistas, cada uma como um quadrado com ícone.
  Desbloqueadas ganham fundo tintado com a cor accent
  (`--accent-tint`, já definido em `globals.css` como
  `rgba(217, 122, 69, 0.08)` em dark e `rgba(193, 101, 47, 0.08)` em
  light — confirmado no código real) e borda accent. Bloqueadas e
  não-alcançadas ficam opacas com ícone em grayscale (cosmético — a
  diferenciação primária é pelo fundo/borda/opacity, não pelo filtro
  CSS, que pode não afetar emojis nativos em todos os browsers).
- **Tooltip nativo** (`title`) — simples, sem lib de tooltip. Mostra rótulo
  + descrição + data de desbloqueio (se desbloqueada) ou motivo do bloqueio.
  Funcional em desktop; em mobile o touch longo mostra o tooltip no browser
  nativo — suficiente pro escopo desta fase.
- **Persistência fire-and-forget** — o `useEffect` faz insert das conquistas
  novas sem travar o render. `useRef` evita duplicata em StrictMode. O
  `router.refresh()` após o insert garante que no próximo load as conquistas
  apareçam como `existing` (vindas do banco), e o `evaluateAchievements` não
  tenta re-inserir.
- **Unique constraint** (`user_id, achievement_key`) no banco protege contra
  duplicata mesmo que o `useRef` falhe ou o componente re-monte — o insert
  simplesmente falha silenciosamente (constraint violation), sem efeito
  colateral.

---

## 7. Patch: `src/app/(app)/dashboard/page.tsx`

### 7.1 Import

```diff
 import StreakCard from "@/components/StreakCard";
+import AchievementsCard from "@/components/AchievementsCard";
 import TrendBadge from "@/components/TrendBadge";
```

### 7.2 Desestruturar `achievements` de `loadUserData`

**[Correção #A1]** — `user` **não está** sendo desestruturado na
`dashboard/page.tsx` atualmente (outras páginas como entries, goals, import
e settings já o fazem, mas a dashboard principal não). Precisa adicionar.

Substituir esta linha:

```ts
  const { profile, entries, goals, goalsHistory } = await loadUserData();
```

Por:

```ts
  const { user, profile, entries, goals, goalsHistory, achievements } = await loadUserData();
```

### 7.3 Inserção no JSX

O card entra logo abaixo do `StreakCard`, antes do `KpiWeeklyTeaser`.

Substituir este trecho:

```tsx
        <StreakCard entries={entries} />

        {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
```

Por:

```tsx
        <StreakCard entries={entries} />
        <AchievementsCard
          entries={entries}
          goals={goals}
          achievements={achievements}
          userId={user.id}
        />

        {weekKpi && <KpiWeeklyTeaser kpi={weekKpi} />}
```

---

## 8. `supabase/schema.sql` — arquivo de referência

Adicionar ao final, mesmo padrão das tabelas anteriores:

```sql
-- ---------------------------------------------------------
-- 6. Conquistas (achievements)
-- Ver supabase/migrations/0006_user_achievements.sql
-- ---------------------------------------------------------
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default now(),
  constraint user_achievements_unique unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_idx
  on public.user_achievements (user_id);

alter table public.user_achievements enable row level security;

create policy "user_achievements_select_own"
  on public.user_achievements for select
  using (auth.uid() = user_id);

create policy "user_achievements_insert_own"
  on public.user_achievements for insert
  with check (auth.uid() = user_id);

comment on table public.user_achievements is
  'Conquistas desbloqueadas por usuário. Chave única (user_id, achievement_key) impede duplicata. Sem update/delete — uma vez desbloqueada, permanece.';
```

---

## 9. `api/export/pdf/route.tsx` — fora de escopo

O PDF exporta KPIs e histórico de pesagens. **Conquistas não entram no PDF
nesta fase.** Se futuramente quiser, basta adicionar uma seção no
`ExportDocument.tsx` — a estrutura está pronta.

---

## 10. O que fica fora de escopo (não implementar nesta sub-fase)

- Conquistas baseadas em streak (ex. "7 dias seguidos", "30 dias seguidos")
  — a infra suporta, basta adicionar regras em `ACHIEVEMENT_RULES` e
  expandir `evaluateAchievements` com o `StreakResult`. Pode ser feito em
  fases futuras sem mudança de schema.
- Conquistas baseadas em medidas corporais.
- Animação/confetti ao desbloquear uma conquista — seria legal, mas
  complexidade extra que não justifica nesta sub-fase.
- Tela dedicada `/dashboard/achievements` — por enquanto é só o card no
  dashboard.
- Mostrar conquistas no PDF exportado.
- Revogar conquistas se o peso subir — decisão deliberada, nunca revogar.

---

## 11. Ordem de execução

1. Rodar `supabase/migrations/0006_user_achievements.sql` no Supabase
   Dashboard (SQL Editor).
2. Atualizar `supabase/schema.sql` (seção 8).
3. Atualizar `src/types/database.ts` (seção 3).
4. Criar `src/lib/achievements.ts` (seção 4).
5. Atualizar `src/lib/loadUserData.ts` (seção 5).
6. Criar `src/components/AchievementsCard.tsx` (seção 6).
7. Aplicar patch em `src/app/(app)/dashboard/page.tsx` (seção 7).
8. `npx tsc --noEmit` e `npm run build`.

---

## 12. Checklist de validação em produção

- [ ] Rodar `supabase/migrations/0006_user_achievements.sql` no Supabase
      Dashboard — conferir que a tabela foi criada e RLS está ativo.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Conta nova sem pesagens: card mostra "0/7" e todos os 7 ícones em
      estado locked/blocked (cinza opaco). Conquistas de % devem mostrar
      "🔒" com tooltip "Defina um peso alvo em Metas".
- [ ] Conta com pesagens mas sem peso alvo: conquistas absolutas (1kg, 5kg,
      10kg) avaliam normalmente; conquistas de % mostram "🔒" com tooltip
      "Defina um peso alvo em Metas".
- [ ] Definir peso alvo em `/dashboard/goals`, voltar ao dashboard →
      conquistas de % saem de "🔒" e passam a avaliar (locked ou unlocked
      conforme o progresso real).
- [ ] Registrar pesagens suficientes para perder 1 kg desde o primeiro
      registro → "Primeiro kg" desbloqueia automaticamente, ícone ganha
      fundo tintado accent, tooltip mostra data. Conferir em
      `user_achievements` que o registro foi criado com `unlocked_at`
      correto.
- [ ] Recarregar a página após desbloqueio → conquista continua aparecendo
      como desbloqueada (veio do banco, não recalculada).
- [ ] Registrar peso que suba depois de um desbloqueio → conquista NÃO é
      revogada (continua aparecendo como desbloqueada).
- [ ] Cenário de unique constraint: se o insert falhar por duplicata (ex:
      race condition), nenhum erro visível pro usuário — falha silenciosa.
- [ ] Conta onde `first.weight_kg` < `target_weight_kg` (já abaixo do alvo):
      conquistas de % ficam bloqueadas com tooltip "Peso alvo já alcançado".
- [ ] RLS: usuário A não consegue ler `user_achievements` do usuário B.
- [ ] Alternar tema claro/escuro: ícones desbloqueados (fundo `accent-tint`,
      borda `accent`) e locked (opacidade reduzida) com contraste adequado
      nos dois temas.
- [ ] Mobile: grid de 7 colunas cabe na tela sem overflow horizontal
      (cada quadrado ~40px + gap, total ~300px, cabe em telas ≥320px).

---

## Depois de validar em produção

Marcar em `claude_fases.md`:

```diff
 ## Fase 4 — Gamificação e engajamento
 ...
-- [ ] Conquistas (primeiro kg perdido, -5kg, 25/50/75/100% da meta — tabela de regras +
-      `user_achievements`)
+- [x] Conquistas (primeiro kg perdido, -5kg, 25/50/75/100% da meta — tabela de regras +
+      `user_achievements`)
```

Adicionar seção "Fase 4.2 — Conquistas" em `CLAUDE.md`, mesmo padrão das
seções anteriores, incluindo:
- Decisão de persistir em `user_achievements` (vs. recalcular como streak)
- Decisão de nunca revogar conquista
- Conquistas de % bloqueadas quando sem peso alvo (mostra "🔒", não esconde)
- `evaluateAchievements` é pura; persistência é fire-and-forget no
  `AchievementsCard` via `useEffect`
- `--accent-tint` usado pro fundo de conquista desbloqueada
- `grayscale` em emoji é cosmético — pode não funcionar em todos os browsers
- Checklist de validação pendente

---

## Apêndice A — Achados da auditoria (v1 → v2)

### A1. `user` não desestruturado na `dashboard/page.tsx` — spec condicional em vez de afirmativo (SEVERIDADE: MÉDIA)

**v1 dizia:** "`user` já era desestruturado antes (ver o código real —
confirmar; se não estiver, adicionar)."

**Código real:** `const { profile, entries, goals, goalsHistory } = await
loadUserData()` — `user` não está presente. Outras páginas (entries, goals,
import, settings) já o fazem, mas a dashboard principal não.

**Correção:** seção 7.2 agora mostra a substituição exata da linha, sem
linguagem condicional.

### A2. `grayscale` do Tailwind pode não afetar emoji nativos (SEVERIDADE: BAIXA)

**v1 usava** `grayscale` como diferenciador visual entre unlocked e locked.

**Realidade:** `filter: grayscale(1)` não afeta emojis renderizados
nativamente pelo OS em alguns browsers (iOS Safari, macOS). A diferenciação
visual real (fundo tintado + borda accent vs. fundo opaco + opacity
reduzida) não depende do grayscale.

**Correção:** adicionada nota na seção 6 e no bloco "Depois de validar"
documentando que o grayscale é cosmético.

### A3. Timestamp de desbloqueio difere entre primeiro render e reload (SEVERIDADE: BAIXA)

**Comportamento:** no primeiro render, `unlockedAt` vem de
`new Date().toISOString()` (tempo do server render); após o insert e
reload, vem de `unlocked_at` do banco (tempo do insert, segundos depois).

**Sem correção necessária** — diferença negligível, documentada na seção 4
como comportamento esperado.

### A4. Diff de `loadUserData.ts` ambíguo (SEVERIDADE: MÉDIA)

**v1 usava** `...` para representar o conteúdo existente do `Promise.all`.

**Correção:** seção 5 agora mostra todas as 5 queries existentes como
contexto, com a nova query de `user_achievements` inserida como 6º item.

### A6. `supabase`/`router` como deps instáveis do `useEffect` (SEVERIDADE: MÉDIA)

**v1 tinha:** `[newlyUnlocked, userId, supabase, router]` como deps, com
`supabase` criado por `createClient()` no corpo do componente (novo objeto
a cada render) e `router` de `useRouter()` (identidade instável).

**Correção:** `createClient()` movido para dentro do `useEffect`. Lista de
deps reduzida para `[newlyUnlocked, userId]` com
`// eslint-disable-next-line react-hooks/exhaustive-deps` justificado.
Guard `didPersist.current` continua como barreira primária.
