# Spec — Fase 8.1 hotfix: Badge "Pro" na Sidebar

> Correção rápida pós-deploy do 8.1. Não muda estrutura, só o array
> `links` e o texto do badge dentro de `src/components/Sidebar.tsx`.

## 1. Trocar texto do badge: "Premium" → "Pro"

No JSX de `renderNavItem`, localizar:

```tsx
<span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
  <Lock className="h-2.5 w-2.5" />
  Premium
</span>
```

Trocar para:

```tsx
<span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
  <Lock className="h-2.5 w-2.5" />
  Pro
</span>
```

## 2. Atualizar o array `links` — regra de badge

**Itens free (sem badge):** Dashboard, Registro de Peso, Metas, Configurações, Ajuda e Suporte.

**Todos os demais recebem `premium: true`:**

```tsx
const links: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/entries", label: "Registro de Peso", icon: Scale },
  { href: "/dashboard/measurements", label: "Medidas Corporais", icon: Ruler, premium: true },
  { href: "/dashboard/photos", label: "Fotos de Progresso", icon: Camera, premium: true },
  { href: "/dashboard/goals", label: "Metas", icon: Target },
  { href: "/dashboard/reports", label: "Relatórios", icon: FileBarChart, premium: true },
  { href: "/dashboard/prediction", label: "Previsão da Meta", icon: TrendingUp, premium: true, comingSoon: true },
  { href: "/dashboard/achievements", label: "Conquistas", icon: Award, premium: true, comingSoon: true },
  { href: "/dashboard/challenges", label: "Desafios", icon: Swords, premium: true },
  { href: "/dashboard/coach", label: "Coach", icon: Users, premium: true },
  { href: "/dashboard/settings#checkin", label: "Lembretes", icon: Bell, premium: true },
  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true, comingSoon: true },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];
```

Mudanças vs. o array atual:
- `Conquistas` — adicionado `premium: true`
- `Desafios` — adicionado `premium: true`
- `Coach` — adicionado `premium: true`
- `Lembretes` — adicionado `premium: true`

## 3. Card de rodapé — "Seja Premium" → "Seja Pro"

No card de rodapé da sidebar, localizar:

```tsx
<p className="font-display text-sm font-bold">Seja Premium</p>
```

Trocar para:

```tsx
<p className="font-display text-sm font-bold">Seja Pro</p>
```

## 4. Nota importante

Essa mudança é **só visual** (badge no menu). O gate real de cada página
(`PlanGate`) continua controlado pela prop `featureName` de cada
`page.tsx` — não muda aqui. Se Conquistas e Desafios ainda não tiverem
`PlanGate` no `page.tsx`, o badge aparece no menu mas a página abre
normalmente pro free. Isso é consistente com o padrão "show but lock":
o badge sinaliza que é Pro, mas quem bloqueia de verdade é o `PlanGate`
na página.

## 5. Checklist

- [ ] Badge diz "Pro" (não "Premium") em todos os itens marcados.
- [ ] 9 itens com badge: Medidas, Fotos, Relatórios, Previsão da Meta,
      Conquistas, Desafios, Coach, Lembretes, Exportar Dados.
- [ ] 5 itens sem badge: Dashboard, Registro de Peso, Metas,
      Configurações, Ajuda e Suporte.
- [ ] Card de rodapé diz "Seja Pro" (free) / "Plano Atual: Pro" (pro).
- [ ] Nenhum `PlanGate` de página foi alterado.
