// Espelha os 4 status retornados por computePeriodKpi (src/lib/analytics.ts)
// e as classes já usadas em KpiCard.tsx (signal-ahead/onpace/caution/behind
// definidos em tailwind.config.ts). Centralizado aqui porque tanto a landing
// (/) quanto o onboarding (/onboarding) explicam o mesmo conceito.

export const KPI_STATUSES = [
  {
    key: "ahead",
    label: "adiantado",
    dot: "bg-signal-ahead",
    text: "text-signal-ahead",
    hex: "#34D399",
    description: "À frente da meta.",
  },
  {
    key: "on_pace",
    label: "no ritmo",
    dot: "bg-signal-onpace",
    text: "text-signal-onpace",
    hex: "#60A5FA",
    description: "Exatamente onde a meta previa pra hoje.",
  },
  {
    key: "caution",
    label: "atenção",
    dot: "bg-signal-caution",
    text: "text-signal-caution",
    hex: "#FBBF24",
    description: "Começando a ficar pra trás — dá pra ajustar.",
  },
  {
    key: "behind",
    label: "atrasado",
    dot: "bg-signal-behind",
    text: "text-signal-behind",
    hex: "#FB7185",
    description: "Fora do ritmo (inclusive se o peso subiu).",
  },
] as const;
