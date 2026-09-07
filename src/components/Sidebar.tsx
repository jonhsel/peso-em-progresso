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
  { href: "/dashboard/prediction", label: "Previsão da Meta", icon: TrendingUp, premium: true },
  { href: "/dashboard/achievements", label: "Conquistas", icon: Award, premium: true },
  { href: "/dashboard/challenges", label: "Desafios", icon: Swords, premium: true },
  { href: "/dashboard/coach", label: "Coach", icon: Users, premium: true },
  { href: "/dashboard/settings#checkin", label: "Lembretes", icon: Bell, premium: true },
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
        {l.premium && plan !== "pro" && (
          <span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
            <Lock className="h-2.5 w-2.5" />
            Pro
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
    <div className="flex h-full w-[85vw] max-w-[280px] sm:w-64 sm:max-w-none shrink-0 flex-col border-r border-base-border bg-base-surface">
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
            <p className="font-display text-sm font-bold">Seja Pro</p>
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
