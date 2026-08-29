# Roadmap de Fases — Peso em Progresso

Objetivo: evoluir o app de "script pessoal" para "produto vendável low cost",
priorizando por impacto percebido / esforço de implementação.

Status possíveis: `não iniciado` | `em andamento` | `concluído`

---

## Fase 0 — Antes de vender
**Prazo estimado:** 1-2 dias
**Meta da fase:** ter uma vitrine mínima antes de oferecer o produto a qualquer pessoa.

- [x] Landing page de preço (rota pública com planos, sem lógica de cobrança ainda)
- [x] Onboarding guiado (3 telas no primeiro login; coluna `profiles.onboarded_at`)

**Critério de saída da fase:** um estranho consegue entender o produto e o preço
sem eu precisar explicar por WhatsApp.

---

## Fase 1 — Quick wins que fecham venda
**Prazo estimado:** 2-4 dias
**Meta da fase:** empacotar como "versão completa" para o público de baixo ticket.

- [x] Exportar dados em CSV/PDF
- [x] Modo escuro/claro
- [ ] Lembrete por e-mail (sem registro em X dias)

**Critério de saída da fase:** já dá pra vender a Fase 0 + Fase 1 como produto fechado.

---

## Fase 2 — Diferenciação real
**Prazo estimado:** ~1 semana
**Meta da fase:** separar de um "app de peso" genérico; sustenta subir o preço.

- [x] Importação de CSV do Fitdays (`source='import'` já existe no schema)
- [x] Medidas corporais (cintura, quadril, braço, % gordura) — tabela `body_measurements`
- [x] Histórico de metas (transformar `goals` em log com `created_at`)

**Critério de saída da fase:** gatilho pra criar "plano completo" vs "plano básico".

---

## Fase 3 — Gamificação e engajamento
**Prazo estimado:** ~1 semana
**Meta da fase:** dar sinais de progresso que seguram retenção antes de pensar em cobrar.

- [ ] Sequência de registros (streak de dias consecutivos, melhor sequência histórica,
      indicador dos últimos 7 dias)
- [ ] Conquistas (primeiro kg perdido, -5kg, 25/50/75/100% da meta — tabela de regras +
      `user_achievements`)
- [ ] Próximo check-in (horário preferido de registro configurável + exibição no dashboard;
      estende o lembrete por e-mail da Fase 1)

**Critério de saída da fase:** um usuário que abre o app todo dia sente o hábito sendo
reconhecido, mesmo sem nenhum recurso pago envolvido.

---

## Fase 4 — Inteligência sobre os dados
**Prazo estimado:** ~1 semana
**Meta da fase:** sair de "mostrar o dado" para "interpretar o dado" — é o que sustenta
cobrar mais depois.

- [ ] Previsão da meta (data estimada de chegada, projeção linear a partir do ritmo atual)
- [ ] Média móvel de 7 dias no gráfico de evolução
- [ ] Relatórios e Insights (resumos periódicos reaproveitando `computeAllKpis`)
- [ ] Widget-resumo de Medidas Corporais no dashboard (a página já existe desde a Fase 2;
      aqui é só o card compacto puxando os últimos valores)

**Critério de saída da fase:** o app diz algo que o usuário não conseguiria calcular de
cabeça olhando só os números brutos.

---

## Fase 5 — Ticket alto
**Prazo estimado:** 2+ semanas
**Meta da fase:** funcionalidades de maior esforço, que sustentam um plano acima do básico.

- [ ] Fotos de progresso (Supabase Storage + comparação lado a lado)
- [ ] Múltiplas metas simultâneas (generalizar `lib/analytics.ts`)
- [ ] Desafios (conceito novo — ainda sem definição de regra; especificar antes de começar)
- [ ] Papel de coach/visualizador (`coach_links` + RLS condicional)

**Critério de saída da fase:** existe conteúdo suficiente para separar visualmente um
plano "completo/profissional" de um plano básico.

---

## Fase 6 — Monetização em camadas
**Prazo estimado:** ~1 semana
**Meta da fase:** só começar depois que as Fases 3–5 estiverem prontas — é só aí que fica
claro o que entra no plano gratuito e o que fica premium.

- [ ] Plano gratuito vs pago (`profiles.plan` + gate + integração Kiwify)
- [ ] Definir, feature a feature, o que é Básico vs Completo (ex.: Medidas, Fotos,
      Relatórios, Previsão da Meta e Exportar Dados como candidatos a premium)
- [ ] Compartilhar progresso (card de imagem gerado para redes sociais)

**Critério de saída da fase:** existe cobrança real funcionando e um gancho de
marketing orgânico ativo. Só depois disso o produto é aberto para venda.

---

## Notas gerais

- Não pular fase: cada uma existe para validar a anterior antes de investir na próxima.
- Fase 6 é deliberadamente a última: monetização só faz sentido depois que gamificação
  (Fase 3), inteligência sobre os dados (Fase 4) e os recursos de ticket alto (Fase 5)
  estiverem prontos — é o que define o que vai para cada plano.
- Ao concluir um item, mover a decisão relevante (schema, trade-off) para o
  `CLAUDE.md` do projeto, na seção "Decisões importantes".
