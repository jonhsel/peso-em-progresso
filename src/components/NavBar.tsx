"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Theme } from "@/lib/theme";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/entries", label: "Pesagens" },
  { href: "/dashboard/measurements", label: "Medidas" },
  { href: "/dashboard/goals", label: "Metas" },
  { href: "/dashboard/settings", label: "Configurações" },
];

export default function NavBar({ displayName, theme }: { displayName: string; theme: Theme }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <header className="border-b border-base-border">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-display font-bold text-lg">Peso em Progresso</span>
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
      </nav>
    </header>
  );
}
