"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Theme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";
import HelpModal from "@/components/HelpModal";
import { LogoIcon } from "@/components/Logo";

const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/photos", label: "Fotos" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/challenges", label: "Desafios" },
  { href: "/dashboard/reports", label: "Relatórios" },
  { href: "/dashboard/coach", label: "Coach" },
  { href: "/dashboard/settings", label: "Configurações" },
];

export default function NavBar({ displayName, theme }: { displayName: string; theme: Theme }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <>
      <header className="border-b border-base-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center" aria-label="Peso em Progresso">
              <LogoIcon className="h-10 w-10 shrink-0" />
            </Link>
            <nav className="hidden sm:flex gap-1">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`text-sm px-3 py-1.5 rounded-lg transition ${
                    pathname === l.href
                      ? "bg-base-surface2 text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              {/* "Ajuda" abre um modal, não navega — por isso fica fora do
                  array `links` (que só tem itens {href, label}) em vez de
                  introduzir um campo discriminador pra um único caso. */}
              <button
                onClick={() => setIsHelpOpen(true)}
                className="text-sm px-3 py-1.5 rounded-lg transition text-ink-muted hover:text-ink"
              >
                Ajuda
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted hidden sm:inline">{displayName}</span>
            <ThemeToggle current={theme} />
            <button
              onClick={handleSignOut}
              className="text-xs text-ink-muted hover:text-signal-behind border border-base-border rounded-lg px-3 py-1.5 transition"
            >
              Sair
            </button>
          </div>
        </div>
        <nav className="sm:hidden flex gap-1 px-4 pb-3 overflow-x-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
                pathname === l.href ? "bg-base-surface2 text-ink" : "text-ink-muted"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={() => setIsHelpOpen(true)}
            className="text-sm px-3 py-1.5 rounded-lg transition whitespace-nowrap text-ink-muted"
          >
            Ajuda
          </button>
        </nav>
      </header>
      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
