# Landing — Seção "Como funciona"

## Contexto para o Claude Code

Problema real que motivou isso (não é hipótese, é feedback de uso real): uma pessoa
usando o app não reconheceu os cards de KPI por período (semana/mês/trimestre/semestre)
porque eles ficam abaixo da dobra no `/dashboard`, sem nenhum teaser acima. Ela só
entendeu depois de rolar a tela e olhar manualmente ("as de baixo"). Isso indica que a
landing também não está deixando claro, antes do cadastro, o que é o "KPI por período" —
hoje ela é só pitch + 3 planos, sem explicar o mecanismo central do produto.

Esta seção "Como funciona" deve entrar na landing (`src/app/page.tsx`), entre o hero e a
seção de planos. Objetivo: qualquer estranho entender o conceito central (meta por
período → comparação com progresso real → status semáforo) sem precisar de explicação
por WhatsApp — é literalmente o critério de saída da Fase 0 no `claude_fases.md`.

**Antes de aplicar:** confira em `tailwind.config.ts` e `globals.css` se os tokens abaixo
batem com os nomes reais atuais (`signal-ahead/onpace/caution/behind`,
`base-bg/surface/border`, `ink/ink-muted/ink-faint`, `font-display/font-mono`,
`rounded-card`) — foram usados de memória do projeto, não lidos do arquivo agora. Se
algum não existir mais ou tiver mudado de nome, ajuste antes de colar.

---

## Copy (revisar/ajustar tom à vontade)

**Eyebrow:** COMO FUNCIONA

**Título:** Simples de entender, fácil de manter

**Subtítulo:** Você define a meta. O app calcula se está no ritmo — sem planilha, sem
adivinhação.

**Passo 1 — Defina sua meta**
Escolha uma meta de peso por período: semana, mês, trimestre ou semestre. Por exemplo,
perder 250g por semana ou 1kg por mês. Você pode mudar isso quando quiser.

**Passo 2 — Registre seu peso**
Uma pesagem por dia, direto da balança. Leva uns 10 segundos e fica salvo no seu
histórico particular.

**Passo 3 — Veja se está no ritmo**
O app compara seu peso de hoje com o que era esperado nesse ponto da meta e te mostra
um status claro:

- 🟢 **Adiantado** — você está à frente da meta
- 🔵 **No ritmo** — exatamente onde deveria estar
- 🟡 **Atenção** — começando a ficar pra trás
- 🔴 **Atrasado** — precisa ajustar algo

Sem números escondidos, sem gráfico que só especialista entende — é sempre "estou bem ou
não estou".

---

## JSX (seção standalone, para inserir em `page.tsx`)

```tsx
function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Defina sua meta",
      description:
        "Escolha uma meta de peso por período: semana, mês, trimestre ou semestre. Por exemplo, perder 250g por semana. Você pode mudar isso quando quiser.",
    },
    {
      number: "02",
      title: "Registre seu peso",
      description:
        "Uma pesagem por dia, direto da balança. Leva uns 10 segundos e fica salvo no seu histórico particular.",
    },
    {
      number: "03",
      title: "Veja se está no ritmo",
      description:
        "O app compara seu peso de hoje com o esperado nesse ponto da meta e te mostra um status claro — sem planilha, sem adivinhação.",
    },
  ];

  const statuses = [
    { label: "Adiantado", tone: "signal-ahead", note: "você está à frente da meta" },
    { label: "No ritmo", tone: "signal-onpace", note: "exatamente onde deveria estar" },
    { label: "Atenção", tone: "signal-caution", note: "começando a ficar pra trás" },
    { label: "Atrasado", tone: "signal-behind", note: "precisa ajustar algo" },
  ];

  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <div className="text-center mb-14">
        <p className="font-mono text-xs tracking-widest text-ink-faint uppercase mb-3">
          Como funciona
        </p>
        <h2 className="font-display text-3xl md:text-4xl text-ink mb-4">
          Simples de entender, fácil de manter
        </h2>
        <p className="text-ink-muted max-w-xl mx-auto">
          Você define a meta. O app calcula se está no ritmo — sem planilha, sem
          adivinhação.
        </p>
      </div>

      {/* 3 passos */}
      <div className="grid md:grid-cols-3 gap-6 mb-16">
        {steps.map((step) => (
          <div
            key={step.number}
            className="rounded-card border border-base-border bg-base-surface p-6"
          >
            <span className="font-mono text-sm text-ink-faint">{step.number}</span>
            <h3 className="font-display text-lg text-ink mt-2 mb-2">{step.title}</h3>
            <p className="text-sm text-ink-muted leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>

      {/* Legenda de status — mesma linguagem visual do KpiCard real */}
      <div className="rounded-card border border-base-border bg-base-surface p-6">
        <p className="font-mono text-xs tracking-widest text-ink-faint uppercase mb-5">
          O status que você vê no dashboard
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {statuses.map((status) => (
            <div key={status.label} className="flex items-start gap-3">
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-${status.tone}`}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-ink">{status.label}</p>
                <p className="text-sm text-ink-muted">{status.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### Onde encaixar
Inserir `<HowItWorksSection />` no `page.tsx` logo depois do hero e antes da seção de
planos (Grátis/Básico/Completo) — a ordem de leitura fica: promessa (hero) → mecanismo
(como funciona) → preço (planos).

### Observação sobre o problema do dashboard (não resolvido por essa seção)
Essa seção resolve a landing, mas não resolve o problema original visto na print: os
cards de KPI ficarem "abaixo da dobra" no `/dashboard` sem teaser. Isso é uma mudança
separada — sugestão: um resumo de 1 linha do KPI da semana (cor + status) logo abaixo do
card de peso atual, antes do gráfico, que funcione como convite pra rolar até os 4 cards
completos. Avise se quiser que eu desenhe isso também.
