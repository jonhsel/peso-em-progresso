# Peso em Progresso

App de acompanhamento de peso corporal com metas por período (semana, mês, trimestre,
semestre), indicador de tendência, KPIs de "onde estou vs. onde deveria estar" e
suporte a múltiplos usuários (para você, amigos e família, cada um com seus próprios
dados isolados).

Stack: **Next.js 14 (App Router) + TypeScript + Tailwind + Supabase (Postgres + Auth) + Recharts**, pronto para deploy na **Vercel**.

---

## 1. Sobre a integração com o Fitdays

Pesquisei a API do Fitdays (app da ICOMON usado com balanças de bioimpedância) e ele
**não publica uma API pública/documentada** para desenvolvedores terceiros — é um app
fechado, pensado para uso via Bluetooth com o app oficial. Por isso, este projeto:

- Foi construído com **registro manual de peso** como via principal (rápido: 2 campos, data e peso).
- Deixou um campo `source` (`manual` | `import`) na tabela `weight_entries` já pronto
  para, no futuro, você importar um **CSV exportado manualmente do app Fitdays** (o
  Fitdays permite exportar/compartilhar dados). Se quiser, posso construir essa tela de
  importação de CSV depois — é a forma legítima de trazer o histórico do Fitdays sem
  depender de uma API que não existe publicamente.

---

## 2. Arquitetura e decisões

```
src/
  app/
    login/              → tela de entrar / criar conta (Supabase Auth)
    dashboard/           → visão geral: KPIs, tendência, gráfico
    dashboard/entries/    → registrar e listar pesagens
    dashboard/goals/       → editar metas (semana/mês/trimestre/semestre)
  components/            → UI (client components)
  lib/
    analytics.ts         → toda a lógica de tendência e KPI (pura, testável)
    supabase/            → clients Supabase (browser, server, middleware)
    loadUserData.ts       → carregamento de dados no servidor (RSC)
  types/database.ts       → tipos alinhados ao schema SQL
  middleware.ts            → protege /dashboard, redireciona sessão
supabase/schema.sql        → schema completo do banco + RLS
```

**Por que essa arquitetura:**

- **Server Components para leitura, Client Components só onde há interação**
  (formulários, botões). Isso reduz JS no cliente e evita expor lógica de dados no
  browser.
- **Row Level Security (RLS) no Postgres**, não só na aplicação: mesmo que exista um bug
  no frontend, um usuário fisicamente não consegue ler/editar dados de outro. É a forma
  correta de fazer multiusuário com um banco compartilhado.
- **Lógica de KPI isolada em `lib/analytics.ts`**, sem dependência de React ou Supabase —
  são funções puras (entrada: entries + metas, saída: números), fáceis de testar e de
  auditar.
- **1 pesagem por dia por usuário** (`unique(user_id, measured_at)`): registrar de novo
  no mesmo dia atualiza o valor (upsert), evitando ruído no gráfico.

### Como o KPI "onde estou vs. onde deveria estar" funciona

Para cada período (semana/mês/trimestre/semestre):
1. Pega o **peso base** = última pesagem registrada até o início do período.
2. Calcula a **fração do período já decorrida** (ex.: hoje é quarta de uma semana → ~43% decorrido).
3. Projeta o **peso esperado agora** = peso base − (meta do período × fração decorrida).
4. Compara com o **peso atual real**. A diferença é o que aparece no card:
   - Diferença negativa → você está **à frente da meta**.
   - Diferença dentro de ±0,15 kg → **no ritmo**.
   - Diferença positiva → **atrás da meta** (e fica explícito mesmo se você **ganhou** peso no período, não só se perdeu menos que o esperado).

### Como a tendência funciona

Regressão linear simples sobre as pesagens dos últimos 21 dias (com fallback para as
últimas pesagens disponíveis se o histórico for curto), convertida para kg/semana.
Classificada em: perdendo rápido / perdendo / estável / ganhando.

---

## 3. Rodando localmente

Pré-requisitos: Node.js 18+ e uma conta gratuita no [Supabase](https://supabase.com).

### 3.1 Criar o projeto no Supabase

1. Crie um projeto em [supabase.com/dashboard](https://supabase.com/dashboard).
2. Vá em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**.
   Isso cria as tabelas `profiles`, `weight_entries`, `goals`, já com RLS e os
   triggers que criam automaticamente o perfil e as metas padrão (250 g/semana,
   1 kg/mês) para cada novo usuário.
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
4. (Opcional, recomendado) Em **Authentication → Providers → Email**, desative
   "Confirm email" se quiser testar rapidamente sem checar caixa de entrada, ou
   deixe ativado para uso real com amigos/família.

### 3.2 Configurar o projeto

```bash
cp .env.example .env.local
# edite .env.local com a URL e a anon key do seu projeto Supabase
```

### 3.3 Instalar e rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`, crie sua conta e comece a registrar pesagens.

---

## 4. Deploy na Vercel

1. Suba este projeto para um repositório no GitHub (ou GitLab/Bitbucket).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Em **Environment Variables**, adicione:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. A cada push na branch principal, a Vercel builda e publica automaticamente.
5. Em **Supabase → Authentication → URL Configuration**, adicione a URL da Vercel
   (ex.: `https://seu-app.vercel.app`) em "Site URL" e "Redirect URLs", para os links
   de confirmação de e-mail funcionarem em produção.

---

## 5. Convidando amigos e família

Não é necessário nenhum passo extra: qualquer pessoa pode acessar a URL do seu app e
clicar em **"Criar conta"**. Como o banco usa RLS por `user_id`, cada pessoa só enxerga
e edita seus próprios registros e metas — vocês podem compartilhar o mesmo app com
total privacidade dos dados de peso de cada um.

Se preferir restringir quem pode se cadastrar (em vez de deixar aberto), a forma mais
simples é desativar signup público em **Supabase → Authentication → Providers → Email**
e convidar usuários manualmente pelo painel do Supabase (**Authentication → Users →
Invite**).

---

## 6. Próximos passos sugeridos

- Importação de CSV exportado do Fitdays (mapeando para `weight_entries` com `source='import'`).
- Composição corporal (% gordura, massa magra) se você tiver uma balança de bioimpedância — o schema já tem espaço para novas colunas.
- Notificações por e-mail quando o KPI de uma semana fecha "atrás da meta".
- Testes automatizados para `src/lib/analytics.ts` (as funções são puras, ideais para testes unitários com Vitest/Jest).
