// Server-only: lê o cookie de tema. Separado de src/lib/theme.ts (que é
// importado também por Client Components) para garantir que "next/headers"
// nunca acabe no bundle do cliente — este arquivo só deve ser importado por
// Server Components.
import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, isValidTheme, type Theme } from "@/lib/theme";

export async function getTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(THEME_COOKIE)?.value;
  return isValidTheme(raw) ? raw : DEFAULT_THEME;
}
