// Definição dos planos exibidos na landing pública (/) e em /dashboard/upgrade.
// Fase 7: gate real via profiles.plan + Kiwify.

export type PlanId = "gratis" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  priceSuffix?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

export const plans: Plan[] = [
  {
    id: "gratis",
    name: "Grátis",
    price: "R$ 0",
    tagline: "Pra registrar o peso e construir o hábito.",
    features: [
      "Registro diário de peso",
      "Gráfico de evolução",
      "1 meta ativa (peso, ritmo semanal)",
      "Conquistas",
    ],
    cta: "Criar conta grátis",
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$ 11,90",
    priceSuffix: "/mês",
    tagline: "Pra quem quer o quadro completo — metas, medidas, fotos e mais.",
    features: [
      "Tudo do Grátis",
      "Até 3 metas simultâneas (peso, cintura, quadril, braço, %gordura)",
      "Medidas corporais e fotos de progresso",
      "Previsão de meta e relatórios",
      "Desafios",
      "Exportar dados (CSV/PDF) e importar CSV",
      "Coach/visualizador",
    ],
    cta: "Assinar Pro",
    highlighted: true,
  },
];
