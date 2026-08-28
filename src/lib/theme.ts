// Tema claro/escuro do app (Fase 1.2). Módulo puro — sem dependência de
// next/headers — porque é importado tanto por Server Components/Actions
// quanto (só o tipo) por Client Components como ThemeToggle.tsx. A leitura
// do cookie em si fica em src/lib/get-theme.ts (server-only).

export type Theme = "dark" | "light";
export const THEME_COOKIE = "peso-theme";
export const DEFAULT_THEME: Theme = "dark";

export function isValidTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}
