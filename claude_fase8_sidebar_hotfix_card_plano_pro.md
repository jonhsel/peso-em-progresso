# Spec — Fase 8 hotfix: compactar card "Plano Atual: Pro" na Sidebar

> Correção visual pós-deploy do 8.1/8.1-hotfixes. Não muda estrutura,
> gate de página, nem lógica de plano — só o markup/classes do card de
> rodapé exibido para usuários Pro em `src/components/Sidebar.tsx`.

## 1. Problema

O card "Plano Atual" / "Pro" / "Ver detalhes" (exibido no rodapé da
Sidebar para usuários com `plan === "pro"`) está desproporcional: três
linhas empilhadas (título, valor, botão de largura total) com
`p-4` de padding, ocupando bem mais espaço vertical do que a informação
justifica. Reportado via screenshot do app em produção (mobile).

## 2. Comportamento desejado

- **Usuário Pro** (`plan === "pro"`): card vira uma única linha
  compacta — rótulo "Plano: Pro" à esquerda, link "Ver detalhes" à
  direita. Sem botão sólido de largura total.
- **Usuário free** (bloco `else`, card "Seja Pro"): **sem mudança**.
  Continua com o layout atual (título, descrição, botão largura total)
  — esse card tem uma chamada de ação diferente (conversão) e o espaço
  extra faz sentido ali.
- Nenhuma mudança de comportamento — `href="/dashboard/upgrade"`
  permanece o mesmo, só muda a apresentação visual do link.

## 3. Mudança em `src/components/Sidebar.tsx`

Localizar o bloco do plano Pro (dentro do card de rodapé, antes do
bloco `else` do "Seja Pro"):

```tsx
        {plan === "pro" ? (
          <div className="rounded-card border border-base-border bg-base-surface2 p-4 text-center">
            <p className="font-display text-sm font-bold">Plano Atual</p>
            <p className="mt-1 text-sm font-medium text-accent">Pro</p>
            <Link
              href="/dashboard/upgrade"
              className="mt-3 inline-block w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-base-bg transition hover:bg-accent-hover"
            >
              Ver detalhes
            </Link>
          </div>
        ) : (
```

Trocar para:

```tsx
        {plan === "pro" ? (
          <div className="flex items-center justify-between rounded-card border border-base-border bg-base-surface2 px-3 py-2">
            <p className="text-xs text-ink-muted">
              Plano: <span className="font-medium text-accent">Pro</span>
            </p>
            <Link
              href="/dashboard/upgrade"
              className="text-xs font-medium text-accent hover:underline"
            >
              Ver detalhes
            </Link>
          </div>
        ) : (
```

Único trecho alterado: o `<div>` do card Pro e seu conteúdo interno. O
bloco `else` (card "Seja Pro" para usuário free) permanece
**idêntico**, sem nenhuma edição.

`plan` já está disponível no escopo (prop existente do componente
`Sidebar`) — nenhum dado novo é buscado.

## 4. Fora de escopo

- Qualquer mudança no card "Seja Pro" (bloco `else`, usuário free).
- Qualquer mudança em `PlanGate` ou no gate real de cada página.
- Qualquer mudança nos badges "Pro" dos itens de menu (já tratado nos
  hotfixes 1 e 4).
- Qualquer mudança em `ThemeToggle`, no array `links`, ou em qualquer
  outra parte da Sidebar fora deste card específico.

## 5. Checklist

- [ ] Card do usuário Pro exibe "Plano: Pro" e "Ver detalhes" numa
      única linha, sem botão sólido de largura total.
- [ ] Card do usuário free ("Seja Pro") permanece inalterado.
- [ ] Link "Ver detalhes" continua apontando para `/dashboard/upgrade`
      e navegando corretamente.
- [ ] Contraste do texto "Plano: Pro" e do link aceitável nos dois
      temas (claro/escuro) — usa tokens já existentes
      (`bg-base-surface2`, `border-base-border`, `text-accent`,
      `text-ink-muted`), então deve herdar contraste correto
      automaticamente, mas validar visualmente.
- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Nenhum `PlanGate` de página foi alterado — puramente cosmético.

Depois de validar em produção: registrar como "Hotfix 5" na seção da
Fase 8 do `CLAUDE.md`, seguindo o formato dos hotfixes 1–4 já
documentados.
