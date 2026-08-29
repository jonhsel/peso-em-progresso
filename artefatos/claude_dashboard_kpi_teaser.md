# Dashboard — Teaser de KPI acima da dobra

## Contexto para o Claude Code

Problema real (print de uso, não hipótese): no `/dashboard`, a tela hoje mostra peso
atual + variação desde o primeiro registro + botão "Registrar pesagem", e para por aí
antes da dobra. Os 4 cards de KPI por período (semana/mês/trimestre/semestre) ficam mais
abaixo, mas nada na parte visível sugere que eles existem — o usuário só descobriu
rolando a tela por acaso.

Solução: um card compacto ("teaser") logo abaixo do bloco de peso atual, mostrando só o
KPI da **semana** (o mais acionável, já que é o período mais curto) com a cor de status e
um texto de uma linha, terminando num link/seta que rola suave até a seção completa dos
4 cards. Ele reusa o mesmo resultado de `computePeriodKpi`/`computeAllKpis` que já
alimenta o `KpiCard` — não deve recalcular nada, só reaproveitar o valor que a página já
busca.

**Antes de aplicar:**
- Confira em `src/components/dashboard/KpiCard.tsx` (ou onde ele estiver) qual é o
  mapeamento exato de `status` (`ahead | on_pace | caution | behind`) pra classe de cor —
  o snippet abaixo assume `signal-ahead/onpace/caution/behind`, mas copie o de lá se
  for diferente, pra manter as duas peças consistentes.
- Confira a estrutura real da página `/dashboard` pra saber onde exatamente entre o bloco
  de peso atual e o gráfico esse componente deve entrar, e dê um `id` na seção que
  contém os 4 `KpiCard` (ex. `id="kpi-details"`) — é o alvo do scroll.

---

## JSX — `KpiWeeklyTeaser`

```tsx
type KpiStatus = "ahead" | "on_pace" | "caution" | "behind";

const STATUS_COPY: Record<KpiStatus, { label: string; verb: string }> = {
  ahead: { label: "Adiantado", verb: "você está à frente da meta semanal" },
  on_pace: { label: "No ritmo", verb: "você está no ritmo da meta semanal" },
  caution: { label: "Atenção", verb: "começando a ficar atrás da meta semanal" },
  behind: { label: "Atrasado", verb: "atrás da meta semanal" },
};

const STATUS_TONE: Record<KpiStatus, string> = {
  ahead: "signal-ahead",
  on_pace: "signal-onpace",
  caution: "signal-caution",
  behind: "signal-behind",
};

function KpiWeeklyTeaser({ status }: { status: KpiStatus }) {
  const copy = STATUS_COPY[status];
  const tone = STATUS_TONE[status];

  const handleClick = () => {
    document
      .getElementById("kpi-details")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center justify-between gap-3 rounded-card border border-base-border bg-base-surface px-4 py-3 text-left transition hover:border-ink-faint"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full bg-${tone}`}
          aria-hidden="true"
        />
        <p className="text-sm text-ink truncate">
          <span className="font-medium">{copy.label}</span>
          <span className="text-ink-muted"> — {copy.verb}</span>
        </p>
      </div>
      <span className="font-mono text-xs text-ink-faint shrink-0">ver metas ↓</span>
    </button>
  );
}
```

## Onde encaixar

No arquivo da página `/dashboard`, logo abaixo do bloco de peso atual (o `79.5 kg` +
"desde o primeiro registro") e antes do gráfico:

```tsx
{/* peso atual — já existe */}
<CurrentWeightBlock ... />

{/* novo — teaser acima da dobra */}
<KpiWeeklyTeaser status={kpis.semana.status} />

{/* gráfico — já existe */}
<WeightChart ... />

{/* ... */}

{/* seção existente dos 4 cards — só precisa ganhar o id */}
<section id="kpi-details" className="grid ...">
  <KpiCard period="semana" ... />
  <KpiCard period="mes" ... />
  <KpiCard period="trimestre" ... />
  <KpiCard period="semestre" ... />
</section>
```

`kpis.semana.status` assume que a página já tem o resultado de `computeAllKpis` em mãos
(é o que os 4 `KpiCard` já consomem) — ajuste o nome da variável pro que existir de
verdade no código.

## Por que só a semana, não os 4

Mostrar os 4 status resumidos acima da dobra ia recriar o mesmo problema (informação
demais, nada se destaca). A semana é o período mais curto e mais acionável — é o que a
pessoa consegue agir hoje. Quem quiser o quadro completo (mês/trimestre/semestre) clica e
desce.

## Teste rápido depois de aplicar

- Simular os 4 status (mockar `kpis.semana.status`) e conferir se a cor bate com a mesma
  usada no `KpiCard` correspondente — não pode haver dessincronia de paleta entre o
  teaser e o card completo.
- Clicar no teaser e confirmar que rola suave até `#kpi-details`, com os cards visíveis
  no topo do viewport (não cortados).
- Testar em mobile (viewport estreito, como na print) — o texto do `verb` não pode
  quebrar o layout ou ficar cortado sem reticências.
