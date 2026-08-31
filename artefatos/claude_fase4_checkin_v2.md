# Spec — Fase 4.3: Próximo check-in (horário preferido de registro)

**Status:** v2. Auditada apenas como **revisão de consistência interna** (ver
Apêndice A) — ainda **não** auditada contra o código real, porque os arquivos
`.tsx`/`.ts` do repo não estavam disponíveis nesta sessão (só
`schema.sql`/`CLAUDE.md`/`claude_fases.md` via project knowledge). Os itens do
Apêndice A marcados como "pendente de confirmação" precisam do passe de
auditoria completo (spec vs. arquivos reais) antes do handoff ao Claude Code.

Terceira de 4 sub-fases da Fase 4 (Gamificação e engajamento): streak (4.1) →
conquistas (4.2) → **próximo check-in (4.3)** → guia de ajuda (4.4, ainda não
speccada).

## Contexto

Da Fase 4 no `claude_fases.md`: "Próximo check-in (horário preferido de registro
configurável + exibição no dashboard; estende o lembrete por e-mail da Fase 1)".

O lembrete por e-mail da Fase 1 **nunca foi implementado** (confirmado no
`CLAUDE.md`, seção Fase 4.1: "notificação de streak prestes a quebrar (depende
de lembrete por e-mail, Fase 1, ainda não implementado)"). Este spec cobre só a
parte configurável + visual no dashboard; e-mail fica fora de escopo (ver seção
"Fora de escopo").

## Decisões fechadas (não reabrir sem motivo)

1. **Novo campo em `profiles`**, não tabela dedicada: `checkin_hour smallint`,
   nullable, sem default (usuário não é obrigado a definir — diferente de
   `period_mode`/`week_starts_on` da Fase 3, que são perguntados no onboarding).
2. **Granularidade: só a hora (0–23)**, sem minuto. Simplifica o seletor
   (`<select>` de 24 opções, mesmo padrão de dropdown já usado no projeto) e é
   granularidade suficiente pra um lembrete visual, não um alarme preciso.
   **Semântica de "hora cheia":** `checkin_hour = 7` conta como "já passou" a
   partir de 7h00 em diante (ex.: 7h32 já é considerado passado) — não é uma
   janela de 1h, é um limiar simples.
3. **Configurado em `/dashboard/settings`** (`SettingsForm.tsx`, Fase 3), não no
   onboarding — é um ajuste opcional de conveniência, não uma decisão estrutural
   como `period_mode`. Não abre o `ConfirmDialog` (mesmo padrão de
   `display_name`/`height_cm`/`week_starts_on`: só `period_mode` sozinho justifica
   o modal, porque só ele muda como os KPIs são calculados retroativamente).
4. **Exibição combinada com `StreakCard.tsx`**, não card novo nem alerta
   separado. Racional: check-in preferido e streak são o mesmo tipo de sinal
   (hábito/rotina), cabem na mesma leitura visual — evita inflar `/dashboard`
   com mais um card pra uma informação pequena.
   - Se `checkin_hour` for `null` (usuário não configurou): `StreakCard` não
     muda nada, comportamento atual preservado.
   - Se `checkin_hour` estiver definido: mostra texto fixo `"Seu horário de
     registro: {hh}:00"` (mesmo estilo de texto secundário já usado no card,
     `text-ink-muted` ou equivalente).
   - Se `checkin_hour` estiver definido **E** já passou dessa hora (horário de
     SP) **E** não há registro hoje: mostra um aviso adicional, reaproveitando
     a mesma classe de cor `text-[var(--badge-caution-text)]` já usada no aviso
     de "registre hoje pra manter" (mesmo padrão de contraste documentado na
     Fase 4.1) — texto: `"Já passou do seu horário de registro"`. Este aviso é
     **independente** do aviso de streak existente; os dois podem aparecer
     juntos (streak quebrando + hora passada) ou só um dos dois.
5. **Sem índice em `checkin_hour`** — decisão consciente, não esquecimento. Só
   faria sentido pra uma futura feature de notificação em lote por horário
   (fora de escopo aqui, e depende do e-mail da Fase 1 que ainda não existe).
   Se essa feature nascer depois, avaliar índice nesse momento, não agora.

## Migração SQL

`supabase/migrations/0007_checkin_hour.sql` (idempotente, mesmo padrão das
migrações anteriores):

```sql
-- Fase 4.3: horário preferido de check-in (opcional, sem default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS checkin_hour smallint;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_checkin_hour_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_checkin_hour_check
    CHECK (checkin_hour IS NULL OR (checkin_hour >= 0 AND checkin_hour <= 23));
```

Também replicar no `supabase/schema.sql` de referência (`CREATE TABLE
public.profiles`, junto dos campos já existentes) — mesmo cuidado que faltou na
Fase 3 e foi corrigido "de brinde" (ver decisão registrada no `CLAUDE.md` sobre
`onboarded_at` ausente do `schema.sql` de referência). Adicionar a mesma
`CHECK` inline na definição da tabela.

## Mudanças de tipos

`src/types/database.ts` — no tipo `Profile` (ou equivalente, confirmar nome
exato no arquivo real — **pendente de confirmação**, ver Apêndice A item 3),
adicionar:

```typescript
checkin_hour: number | null;
```

Ao lado de `period_mode`/`week_starts_on`, que devem já estar lá desde a Fase 3.

## Diffs função a função

### 1. `src/lib/loadUserData.ts`

O `select` de `profiles` (usado por `dashboard/page.tsx`, `entries`, `goals`,
`import`, `settings`) precisa incluir `checkin_hour`, do mesmo jeito que já
inclui `period_mode`/`week_starts_on` desde a Fase 3. **Pendente de
confirmação (Apêndice A item 1):** se o select é `select("*")` (nesse caso nada
muda) ou uma lista explícita de colunas (nesse caso adicionar `checkin_hour` à
lista).

### 2. `src/lib/streak.ts` (ou onde estiver a lógica de streak/timezone)

Adicionar uma função pura nova, ao lado da lógica de fuso já existente
(reaproveitar o mesmo helper de "hora atual em SP" documentado no comentário
sobre o bug de fuso da Fase 4.1 — não duplicar a lógica de conversão):

```typescript
export function isPastCheckinHour(checkinHour: number | null, nowSP: Date): boolean {
  if (checkinHour === null) return false;
  return nowSP.getHours() >= checkinHour;
}
```

Racional de ser função pura separada: mesmo padrão de `computeTrend`/
`computePeriodKpi` em `analytics.ts` — lógica de decisão isolada e testável,
sem depender de React/Supabase. Não colocar essa lógica dentro do componente.

**Pendente de confirmação (Apêndice A item 2):** a assinatura acima assume que
`nowSP` chega já convertido pro fuso de SP (um `Date` cujo `.getHours()` já
reflete a hora local de SP, não UTC). Se o helper de fuso existente em
`streak.ts` expõe outro formato (ex.: só um número de "dia calculado", sem
`Date` convertido reutilizável), a assinatura desta função precisa se adaptar
— não inventar uma segunda conversão de fuso paralela à que já existe.

### 3. `src/components/StreakCard.tsx`

Continua Server Component (sem `"use client"`, mesmo padrão atual — só exibe
dados já calculados, nenhum estado novo precisa ser client-side aqui).

- Nova prop: `checkinHour: number | null`.
- Chama `isPastCheckinHour(checkinHour, nowSP)` com o mesmo `nowSP` (ou
  equivalente) já usado internamente pro cálculo de streak — **não** criar uma
  segunda instância de "agora" com fuso diferente, é exatamente o tipo de bug
  que o comentário existente no arquivo já avisa sobre.
- Renderiza o texto fixo do horário quando `checkinHour !== null`.
- Renderiza o aviso extra quando `isPastCheckinHour(...) && !hasEntryToday`
  (reaproveitar a variável/flag que já existe pro aviso de streak, não recalcular
  "tem registro hoje" de novo).
- **Pendente de confirmação (Apêndice A item 4):** posição exata do novo bloco
  de JSX em relação ao aviso de streak existente ("registre hoje pra manter").
  Proposta (a confirmar contra o arquivo real): texto do horário logo abaixo do
  contador de sequência atual; aviso de "já passou do horário" agrupado junto
  do aviso de streak existente (mesmo bloco visual, duas linhas) em vez de
  espalhado em posições distintas do card — evita o card parecer
  desorganizado com dois avisos soltos.

### 4. `src/components/SettingsForm.tsx`

- Novo campo no formulário: `<select>` com 24 opções + opção `"Não definir"`
  mapeada para `null`. Mesmo local de padrão de outros campos opcionais do
  form (`height_cm`).
- **Rótulo das opções: `"07:00"` (zero-padded, formato `HH:00`)** — consistente
  com o texto exibido no `StreakCard` (`"Seu horário de registro: 07:00"`,
  decisão 4 acima); evita o usuário ver `"7h"` no formulário e `"07:00"` no
  dashboard como se fossem formatos diferentes. **Pendente de confirmação
  (Apêndice A item 5):** se já existe algum precedente de formatação de hora
  em outro componente do projeto, usar o mesmo em vez desse.
- Segue o padrão já estabelecido: update direto `supabase.from("profiles")
  .update(...)` client-side + `router.refresh()`, **não** Server Action (regra
  do projeto: Server Actions só pra cookie de tema).
- **Não** abre `ConfirmDialog` — só `period_mode` justifica o modal (decisão 3
  acima).
- **Parser nomeado, seguindo a convenção já usada pra `height_cm`
  (`parseOptionalHeight`, Fase 3):**

  ```typescript
  function parseOptionalCheckinHour(value: string): number | null {
    if (value === "") return null;
    return Number(value);
  }
  ```

  Evita a armadilha já documentada no projeto (`Number("") === 0`, não
  `NaN`) — aqui o efeito seria pior que o bug de meta zerada: `checkin_hour = 0`
  (meia-noite) sendo salvo por engano em vez de `null`. Nomear a função segue a
  convenção do projeto (`parseOptionalHeight` já existe) em vez de inline —
  facilita achar/testar depois.

### 5. `dashboard/page.tsx`

Passar `profile.checkin_hour` como prop pro `StreakCard` (mesmo lugar onde já
passa os dados de streak hoje).

## Callers afetados (lista explícita)

- `src/lib/loadUserData.ts` — select de `profiles` (**pendente**, item 1)
- `src/app/(app)/dashboard/page.tsx` — nova prop pro `StreakCard`
- `src/components/StreakCard.tsx` — nova prop + novo aviso condicional
  (**pendente**, item 4)
- `src/components/SettingsForm.tsx` — novo campo de formulário + parser
  `parseOptionalCheckinHour`
- `src/lib/streak.ts` (ou arquivo equivalente) — nova função pura
  (**pendente**, item 2)
- `src/types/database.ts` — novo campo no tipo `Profile` (**pendente**, item 3)
- **`api/export/pdf/route.tsx` — NÃO precisa mudar.** Faz query própria de
  profile (fora do `loadUserData()`), mas `checkin_hour` não aparece no PDF
  exportado (fora de escopo, ver abaixo), então o `select` existente não
  precisa ser expandido dessa vez — diferente do que aconteceu na Fase 3 com
  `period_mode`/`week_starts_on`.
- `api/export/csv/route.ts` — sem mudança (não usa dados de profile além do que
  já usa).

## Fora de escopo (explícito)

- Lembrete por e-mail (depende de infraestrutura de e-mail da Fase 1, nunca
  implementada).
- Notificação push/browser.
- Granularidade de minuto.
- Múltiplos horários (ex: um por dia da semana).
- Mostrar `checkin_hour` no PDF exportado.
- Perguntar `checkin_hour` no onboarding.
- Timezone customizável por usuário — assume SP fixo, mesma decisão já tomada
  implicitamente pelo `streak.ts` existente.
- Índice em `checkin_hour` (decisão 5).

## Checklist de teste

1. Rodar `supabase/migrations/0007_checkin_hour.sql` no Supabase Dashboard —
   conferir que contas existentes ganharam `checkin_hour = null` (sem quebrar
   nada) e que a `CHECK` rejeita valores fora de 0–23.
2. Conta nova, `checkin_hour` nunca definido: `StreakCard` não mostra nada
   relacionado a horário (comportamento idêntico à Fase 4.1).
3. Definir `checkin_hour = 7` em `/dashboard/settings`, salvar sem modal
   aparecer, `router.refresh()` reflete a mudança.
4. Com `checkin_hour` definido e for antes desse horário (horário de SP): sem
   aviso de "já passou", só o texto fixo do horário.
5. Com `checkin_hour` definido, já passou da hora (inclusive minutos após a
   hora cheia, ex. 7h32 com `checkin_hour=7`), sem registro hoje: aviso extra
   aparece, junto (ou não) do aviso de streak conforme o estado da sequência.
6. Registrar peso hoje após o aviso aparecer → aviso de horário some no
   próximo refresh (mesma lógica de `hasEntryToday` já usada pro streak).
7. Selecionar "Não definir" depois de já ter um valor salvo → grava `null`
   corretamente (conferir no banco que não virou `0` por engano — teste
   direto da armadilha `Number("")`).
8. Teste de fuso: alterar `checkin_hour` pra hora próxima do horário atual em
   SP e conferir que o aviso aparece/desaparece no limite certo, não em UTC.
9. RLS: usuário A não consegue ler/editar `checkin_hour` de `profiles` de
   usuário B (regressão, mesma política já existente).
10. Alternar tema claro/escuro com o aviso visível — contraste adequado
    (mesma classe de cor já validada na Fase 4.1, então deve ser regressão
    zero, mas conferir visualmente).
11. `npx tsc --noEmit` e `npm run build` limpos.

## Passos de execução (ordem)

1. Migração SQL (`0007_checkin_hour.sql`) + replicar em `schema.sql` de
   referência.
2. Tipo `Profile` em `database.ts`.
3. Função pura `isPastCheckinHour` em `streak.ts`.
4. `loadUserData.ts` — garantir que `checkin_hour` vem no select de `profiles`.
5. `StreakCard.tsx` — nova prop + renderização condicional do horário/aviso.
6. `dashboard/page.tsx` — passar a nova prop.
7. `SettingsForm.tsx` — novo campo de formulário + `parseOptionalCheckinHour`.
8. Rodar `tsc --noEmit` + `npm run build`.
9. Rodar a migração no Supabase real e validar a checklist acima.
10. Atualizar `CLAUDE.md` (seção Fase 4.3) e `claude_fases.md` (marcar o item).

## Apêndice A — Achados da revisão de consistência (v1 → v2)

Esta é uma revisão interna do spec (contradições, lacunas, desvios de
convenção documentados no `CLAUDE.md`), **não** uma auditoria contra o código
real — os arquivos `.tsx`/`.ts` não estavam disponíveis nesta sessão. Itens
1, 2, 3 e 4 abaixo continuam pendentes de confirmação contra o repo real antes
do handoff ao Claude Code.

1. **`loadUserData.ts` — `select("*")` vs. lista explícita.** O v1 já
   sinalizava essa incerteza; mantida sem resolução, só reforçada. Sem o
   arquivo real não dá pra saber se a mudança é zero-linha ou uma linha.
2. **Assinatura de `isPastCheckinHour(checkinHour, nowSP)`.** Assume que existe
   um `Date` já convertido pro fuso de SP disponível em `streak.ts` pra
   reaproveitar. Se o helper real expõe outra forma (função que já retorna
   booleano de "é hoje", por exemplo, sem expor o `Date` cru), a assinatura
   proposta pode não encaixar e precisa ser adaptada na hora da implementação.
3. **Nome exato do tipo em `database.ts`.** v1 e v2 assumem `Profile`; pode ser
   `ProfileRow`, `DbProfile`, etc. — não verificável sem o arquivo.
4. **Posição do JSX no `StreakCard.tsx`.** Proposta de agrupar o aviso de
   horário junto do aviso de streak existente (mesmo bloco, duas linhas) em
   vez de dois avisos soltos — é uma sugestão de design, não uma confirmação;
   a ordem real dos elementos no card pode sugerir outro agrupamento mais
   natural.
5. **Rótulo de formatação de hora no `<select>`.** Fixado como `"07:00"` por
   consistência com o texto do `StreakCard`, mas não há confirmação de que
   esse é o único formato de hora já usado no projeto — se houver outro
   componente com precedente diferente, alinhar a esse em vez de criar um
   terceiro padrão.

**Correções aplicadas nesta versão (não pendentes, já resolvidas no texto
acima):**
- Parser nomeado `parseOptionalCheckinHour`, seguindo a convenção de
  `parseOptionalHeight` já registrada no `CLAUDE.md` (Fase 3) — v1 usava
  conversão inline sem nome.
- Semântica de "hora cheia" (`>=`) deixada explícita na decisão 2 e no item 5
  da checklist — v1 deixava isso implícito só no código da função.
- Decisão consciente de não indexar `checkin_hour` registrada como decisão 5
  — antes só estava implícito por omissão.
