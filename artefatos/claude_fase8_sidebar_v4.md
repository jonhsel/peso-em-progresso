# Spec — Fase 8.1: Sidebar de Navegação (v4 — final auditada)

> v3 → auditoria contra o codebase real (todas as 12 páginas lidas) →
> v4 incorporando os 7 ajustes. Pronta para handoff ao Claude Code.

---

## 0. Pré-requisito: registrar `accent.tint` no Tailwind

A var `--accent-tint` já existe em `globals.css` (dark e light), mas não
está registrada em `tailwind.config.ts`. Sem isso, `bg-accent-tint` não
gera CSS nenhum (mesma armadilha documentada na decisão 13 do `CLAUDE.md`).

### Diff: `tailwind.config.ts`

```diff
         accent: {
           DEFAULT: "var(--accent)",
           hover: "var(--accent-hover)",
+          tint: "var(--accent-tint)",
         },
```

Com isso, `bg-accent-tint` e `text-accent-tint` passam a funcionar em
qualquer componente, sem precisar de `bg-[var(--accent-tint)]`.

---

## 1. Arquivo novo: `src/components/Avatar.tsx`

```tsx
export default function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent font-display font-bold text-sm"
      aria-hidden="true"
    >
      {initials || "?"}
    </div>
  );
}
```

---

## 2. Arquivo novo: `src/components/Sidebar.tsx`

Substitui `NavBar.tsx`. Mesma base de props (`displayName`, `theme`, `plan`)
+ `activeGoals` (opcional, default `[]`).

**Correções da auditoria já incorporadas:**
- `target_value` guardado com `!= null` (era `number | null`, explodia)
- `ThemeToggle` incluído temporariamente (removido quando 8.2 existir)
- 3 rotas que ainda não existem (`prediction`, `achievements`, `export`)
  marcadas como `comingSoon: true` e renderizadas como `<span>` desabilitado
  em vez de `<Link>`, pra não dar 404

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Scale,
  Ruler,
  Camera,
  Target,
  FileBarChart,
  TrendingUp,
  Award,
  Swords,
  Users,
  Bell,
  Download,
  Settings,
  HelpCircle,
  LogOut,
  Pencil,
  Menu,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type Theme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import HelpModal from "@/components/HelpModal";
import { LogoIcon } from "@/components/Logo";
import Avatar from "@/components/Avatar";
import type { Goal } from "@/types/database";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  premium?: boolean;
  /** Rota ainda não existe — renderiza como <span> desabilitado. Remover
      quando a page correspondente for criada (8.1.1 / 8.1.2 / 8.1.3). */
  comingSoon?: boolean;
};

const links: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/entries", label: "Registro de Peso", icon: Scale },
  { href: "/dashboard/measurements", label: "Medidas Corporais", icon: Ruler, premium: true },
  { href: "/dashboard/photos", label: "Fotos de Progresso", icon: Camera, premium: true },
  { href: "/dashboard/goals", label: "Metas", icon: Target },
  { href: "/dashboard/reports", label: "Relatórios", icon: FileBarChart, premium: true },
  { href: "/dashboard/prediction", label: "Previsão da Meta", icon: TrendingUp, premium: true, comingSoon: true },
  { href: "/dashboard/achievements", label: "Conquistas", icon: Award, comingSoon: true },
  { href: "/dashboard/challenges", label: "Desafios", icon: Swords },
  { href: "/dashboard/coach", label: "Coach", icon: Users },
  { href: "/dashboard/settings#checkin", label: "Lembretes", icon: Bell },
  { href: "/dashboard/export", label: "Exportar Dados", icon: Download, premium: true, comingSoon: true },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

export default function Sidebar({
  displayName,
  theme,
  plan,
  activeGoals = [],
}: {
  displayName: string;
  theme: Theme;
  plan?: "free" | "pro";
  activeGoals?: Goal[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const weightGoal = activeGoals.find((g) => g.metric === "weight");

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  function renderNavItem(l: NavItem) {
    const Icon = l.icon;
    const hrefBase = l.href.split("#")[0];
    const active = pathname === hrefBase;

    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{l.label}</span>
        {l.premium && (
          <span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
            <Lock className="h-2.5 w-2.5" />
            Premium
          </span>
        )}
      </>
    );

    const classes = `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
      active
        ? "bg-accent-tint font-medium text-accent"
        : l.comingSoon
          ? "text-ink-faint cursor-not-allowed"
          : "text-ink-muted hover:bg-base-surface2 hover:text-ink"
    }`;

    if (l.comingSoon) {
      return (
        <span key={l.href} className={classes} title="Em breve">
          {content}
        </span>
      );
    }

    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={() => setIsMobileOpen(false)}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  const body = (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-base-border bg-base-surface">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-base-border px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="Peso em Progresso">
          <LogoIcon className="h-8 w-8 shrink-0" />
          <span className="font-display font-bold text-sm leading-tight">
            peso em
            <br />
            progresso
          </span>
        </Link>
      </div>

      {/* Perfil */}
      <div className="flex items-center gap-3 border-b border-base-border px-4 py-4">
        <Avatar name={displayName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{displayName}</p>
          {weightGoal?.target_value != null && (
            <p className="text-xs text-ink-muted">
              Meta: {weightGoal.target_value.toFixed(1)} kg
            </p>
          )}
        </div>
        <Link
          href="/dashboard/settings"
          aria-label="Editar perfil"
          className="text-ink-faint transition hover:text-ink"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {links.map(renderNavItem)}
        <button
          onClick={() => setIsHelpOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-base-surface2 hover:text-ink"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          Ajuda e Suporte
        </button>
      </nav>

      {/* Card de plano + ThemeToggle temporário */}
      <div className="border-t border-base-border px-4 py-4 space-y-3">
        {/* Toggle de tema — temporário aqui até o 8.2 (Topbar) existir.
            Quando implementar o 8.2, remover daqui e mover pra topbar. */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-faint">Tema</span>
          <ThemeToggle current={theme} />
        </div>

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
          <div className="rounded-card border border-base-border bg-base-surface2 p-4 text-center">
            <p className="font-display text-sm font-bold">Seja Premium</p>
            <p className="mt-1 text-xs text-ink-muted">
              Desbloqueie todos os recursos e acelere seus resultados.
            </p>
            <Link
              href="/dashboard/upgrade"
              className="mt-3 inline-block w-full rounded-lg bg-accent px-3 py-2 text-xs font-medium text-base-bg transition hover:bg-accent-hover"
            >
              Ver Planos
            </Link>
          </div>
        )}
      </div>

      {/* Sair */}
      <button
        onClick={handleSignOut}
        className="flex items-center gap-3 border-t border-base-border px-4 py-4 text-sm text-ink-muted transition hover:text-signal-behind"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        Sair
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop: sidebar fixa */}
      <div className="sticky top-0 hidden h-screen sm:block">{body}</div>

      {/* Mobile: topbar compacta + drawer */}
      <div className="flex items-center justify-between border-b border-base-border bg-base-surface px-4 py-3 sm:hidden">
        <Link href="/dashboard" aria-label="Peso em Progresso">
          <LogoIcon className="h-8 w-8" />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle current={theme} />
          <button onClick={() => setIsMobileOpen(true)} aria-label="Abrir menu" className="text-ink-muted">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex sm:hidden">
          {body}
          <button
            className="flex-1 bg-black/50"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Fechar menu"
          />
        </div>
      )}

      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
```

---

## 3. Layout de duas colunas — padrão de substituição

Padrão antigo:
```tsx
<div>
  <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
  <main className="max-w-Xyl mx-auto px-4 py-8">
    ...
  </main>
</div>
```

Padrão novo:
```tsx
<div className="flex min-h-screen">
  <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
  <div className="flex-1 overflow-x-hidden">
    <main className="max-w-Xyl mx-auto px-4 py-8">
      ...
    </main>
  </div>
</div>
```

(`max-w-2xl`/`max-w-6xl`/etc. de cada página **não muda**.)

---

## 4. Diffs por página (todas as 12 lidas e confirmadas)

### 4.1 `src/app/(app)/dashboard/page.tsx`

`activeGoals` **já é desestruturado** — confirmado. Só troca import + wrapper.

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```
(e fechar `</div>` extra antes do `</div>` raiz)

### 4.2 `src/app/(app)/dashboard/entries/page.tsx`

Adiciona `activeGoals` à desestruturação.

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile, entries } = await loadUserData();
+  const { user, profile, entries, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
```

### 4.3 `src/app/(app)/dashboard/measurements/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile, measurements } = await loadUserData();
+  const { user, profile, measurements, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```

### 4.4 `src/app/(app)/dashboard/photos/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile, entries } = await loadUserData();
+  const { user, profile, entries, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```

### 4.5 `src/app/(app)/dashboard/goals/page.tsx`

`activeGoals` **já desestruturado**.

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```

### 4.6 `src/app/(app)/dashboard/challenges/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile, entries, measurements, challenges } = await loadUserData();
+  const { user, profile, entries, measurements, challenges, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-2xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-2xl mx-auto px-4 py-8">
```

### 4.7 `src/app/(app)/dashboard/reports/page.tsx`

`activeGoals` **já desestruturado**.

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```

### 4.8 `src/app/(app)/dashboard/coach/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile } = await loadUserData();
+  const { user, profile, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-2xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-2xl mx-auto px-4 py-8">
```

### 4.9 `src/app/(app)/dashboard/coach/[ownerId]/page.tsx` — CASO ESPECIAL

A variável `activeGoals` neste escopo contém as metas do **cliente**
(vem de `loadCoachClientData`), não do coach. A `loadUserData()` nesta
página já roda pra pegar `coachProfile` — basta extrair `activeGoals`
de lá pra mostrar a meta do coach na sidebar. Mas como isso é um dado
que pode confundir (sidebar do coach mostrando "Meta: X kg" do coach
enquanto a página inteira mostra dados do cliente), **não passar
`activeGoals`** — o componente aceita `undefined` e esconde a linha
"Meta:" silenciosamente.

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

   return (
-    <div>
-      <NavBar displayName={coachProfile.display_name} theme={theme} plan={coachProfile.plan} />
-      <main className="max-w-6xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={coachProfile.display_name} theme={theme} plan={coachProfile.plan} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-6xl mx-auto px-4 py-8">
```
(Sem `activeGoals` — default `[]`, "Meta:" não aparece.)

### 4.10 `src/app/(app)/dashboard/settings/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile } = await loadUserData();
+  const { user, profile, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-2xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-2xl mx-auto px-4 py-8">
```

**Extra:** adicionar `id="checkin"` no bloco de horário de check-in dentro
de `SettingsForm.tsx` (pra âncora `/dashboard/settings#checkin` funcionar):

```diff
-        <div className="space-y-4">
-          <h2 className="font-display font-bold text-base">Horário de check-in</h2>
+        <div id="checkin" className="space-y-4 scroll-mt-8">
+          <h2 className="font-display font-bold text-base">Horário de check-in</h2>
```

(O `scroll-mt-8` compensa a sidebar que não tem padding top de header — 
ajustar se necessário.)

**Nota:** o Claude Code deve localizar o bloco exato do "Horário de
check-in" no `SettingsForm.tsx` real antes de aplicar — o `h2` pode ter
texto ou classes ligeiramente diferentes. O padrão é: encontrar o wrapper
`<div>` que contém o `<h2>` com "Horário de check-in" ou "check-in" e
adicionar `id="checkin"` + `scroll-mt-8`.

### 4.11 `src/app/(app)/dashboard/upgrade/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile } = await loadUserData();
+  const { user, profile, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-2xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-2xl mx-auto px-4 py-8">
```

### 4.12 `src/app/(app)/dashboard/import/page.tsx`

```diff
-import NavBar from "@/components/NavBar";
+import Sidebar from "@/components/Sidebar";

-  const { user, profile } = await loadUserData();
+  const { user, profile, activeGoals } = await loadUserData();

   return (
-    <div>
-      <NavBar displayName={profile.display_name} theme={theme} plan={profile.plan} />
-      <main className="max-w-2xl mx-auto px-4 py-8">
+    <div className="flex min-h-screen">
+      <Sidebar displayName={profile.display_name} theme={theme} plan={profile.plan} activeGoals={activeGoals} />
+      <div className="flex-1 overflow-x-hidden">
+        <main className="max-w-2xl mx-auto px-4 py-8">
```

---

## 5. Ordem de execução

1. Patch `tailwind.config.ts` — adicionar `accent.tint` (seção 0).
2. Criar `src/components/Avatar.tsx` (seção 1).
3. Criar `src/components/Sidebar.tsx` (seção 2).
4. Patch `src/components/SettingsForm.tsx` — `id="checkin"` (seção 4.10 extra).
5. Patch cada uma das 12 páginas (seção 4, na ordem 4.1–4.12):
   trocar import `NavBar` → `Sidebar`, adicionar `activeGoals` à
   desestruturação onde ainda não existe, trocar wrapper JSX.
6. `npx tsc --noEmit` e `npm run build`.

**Nota:** `NavBar.tsx` **não é deletado** nesta fase — pode haver callers
que o Claude Code não encontrou (embora a auditoria tenha coberto todos os
12 conhecidos). Se o build passar sem nenhum import remanescente, o arquivo
pode ser removido como limpeza final. Se algum caller inesperado quebrar o
build, é mais seguro manter o `NavBar.tsx` até ele ser identificado e
migrado.

---

## 6. Checklist de validação

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Sidebar aparece fixa em desktop nas 12 páginas, sem quebrar
      `max-w-2xl`/`max-w-6xl` de cada uma.
- [ ] Mobile: barra compacta (logo + toggle + ☰) no topo; drawer abre
      ao clicar no ☰, fecha ao clicar fora ou num link.
- [ ] Badge "Premium" aparece nos 5 itens certos: Medidas Corporais,
      Fotos de Progresso, Relatórios, Previsão da Meta, Exportar Dados.
- [ ] 3 itens "Em breve" (`comingSoon`) renderizam como `<span>` cinza,
      não navegam: Previsão da Meta, Conquistas, Exportar Dados.
- [ ] "Meta: X,X kg" aparece quando há meta de peso ativa com
      `target_value` definido; some quando não há meta ou
      `target_value === null`.
- [ ] Card de rodapé: "Seja Premium" pro free, "Plano Atual: Pro" pro pro,
      nos dois temas (claro/escuro).
- [ ] `ThemeToggle` funciona na sidebar (desktop) e na barra mobile.
- [ ] Item ativo do menu destaca corretamente em cada rota (inclusive
      `/dashboard/settings` sem confundir com "Lembretes" que aponta
      pra mesma rota com `#checkin`).
- [ ] Clicar em "Lembretes" rola até `#checkin` na página de Configurações.
- [ ] "Sair" continua funcionando.
- [ ] `/dashboard/coach/[ownerId]` renderiza sidebar sem "Meta:" (sem
      `activeGoals`), sem erros.
- [ ] Contraste do badge "Premium" aceitável em tema light (visual check).
- [ ] Nenhum link de gate/`PlanGate` mudou — gate de página continua
      idêntico ao da Fase 7.

---

## 7. Próximos passos

1. Rodar este v4 no Claude Code.
2. Quando `comingSoon` itens forem implementados (8.1.1, 8.1.2, 8.1.3),
   remover `comingSoon: true` de cada um no array `links` de `Sidebar.tsx`.
3. Quando 8.2 (Topbar) for implementado, remover o `<ThemeToggle>` da
   `Sidebar.tsx` e da barra mobile.
4. Seguir com specs 8.1.1–8.1.4 e depois 8.2–8.7.
