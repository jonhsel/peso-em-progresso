"use client";

import { useTransition } from "react";
import { type Theme } from "@/lib/theme";
import { setTheme } from "@/lib/theme-actions";

export function ThemeToggle({ current }: { current: Theme }) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next: Theme = current === "dark" ? "light" : "dark";
    // Aplica no wrapper do app (id definido em src/app/(app)/layout.tsx),
    // não no <html> raiz — dá feedback visual instantâneo, sem esperar o
    // round-trip da Server Action.
    document.getElementById("app-theme-root")?.setAttribute("data-theme", next);
    startTransition(() => {
      setTheme(next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      aria-label={current === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="rounded-card border border-base-border px-3 py-2 text-ink-muted hover:text-ink transition-colors"
    >
      {current === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
