// Definição dos planos exibidos na landing pública (/).
// Fase 0: só vitrine, sem cobrança — o CTA de todos os planos leva pra /login.
// Fase 3 vai ligar `id` a um gate real (profiles.plan + Stripe); quando isso
// acontecer, importe daqui em vez de duplicar os valores.

export type PlanId = "gratis" | "basico" | "completo";

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
    tagline: "Pra registrar o peso e ver se o hábito pega.",
    features: [
      "Registro diário de peso",
      "Gráfico de evolução",
      "1 meta ativa (semanal)",
    ],
    cta: "Criar conta grátis",
  },
  {
    id: "basico",
    name: "Básico",
    price: "R$ 5,90",
    priceSuffix: "/mês",
    tagline: "Pra quem já decidiu que vai levar a sério.",
    features: [
      "Tudo do Grátis",
      "Metas por semana, mês, trimestre e semestre",
      "KPI de ritmo (adiantado / no ritmo / atenção / atrasado)",
      "Histórico completo com diff dia a dia",
    ],
    cta: "Assinar Básico",
    highlighted: true,
  },
  {
    id: "completo",
    name: "Completo",
    price: "R$ 9,90",
    priceSuffix: "/mês",
    tagline: "Pra quem treina com mais gente ou usa balança boa.",
    features: [
      "Tudo do Básico",
      "Múltiplos usuários (família/treino) com dados isolados",
      "Importação de CSV (Fitdays e outras balanças)",
      "Aviso por e-mail quando uma meta sai do ritmo",
    ],
    cta: "Assinar Completo",
  },
];
