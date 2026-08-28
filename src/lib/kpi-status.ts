// Espelha os 4 status retornados por computePeriodKpi (src/lib/analytics.ts)
// e as classes já usadas em KpiCard.tsx (signal-ahead/onpace/caution/behind
// definidos em tailwind.config.ts). Centralizado aqui porque tanto a landing
// (/) quanto o onboarding (/onboarding) explicam o mesmo conceito.

// `text` usa os pares --badge-*-text (globals.css) via valor arbitrário do
// Tailwind, não signal-* puro — texto solto sobre fundo claro (onboarding
// em tema light) quebra contraste, especialmente caution (~2:1 em signal
// puro). Em dark os valores das vars são idênticos ao hex antigo, então a
// landing (que reusa este array e nunca recebe data-theme) não muda visual.
export const KPI_STATUSES = [
  {
    key: "ahead",
    label: "adiantado",
    dot: "bg-signal-ahead",
    text: "text-[var(--badge-ahead-text)]",
    hex: "#34D399",
    description: "À frente da meta.",
  },
  {
    key: "on_pace",
    label: "no ritmo",
    dot: "bg-signal-onpace",
    text: "text-[var(--badge-onpace-text)]",
    hex: "#60A5FA",
    description: "Exatamente onde a meta previa pra hoje.",
  },
  {
    key: "caution",
    label: "atenção",
    dot: "bg-signal-caution",
    text: "text-[var(--badge-caution-text)]",
    hex: "#FBBF24",
    description: "Começando a ficar pra trás — dá pra ajustar.",
  },
  {
    key: "behind",
    label: "atrasado",
    dot: "bg-signal-behind",
    text: "text-[var(--badge-behind-text)]",
    hex: "#FB7185",
    description: "Fora do ritmo (inclusive se o peso subiu).",
  },
] as const;
