"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, isValidTheme } from "@/lib/theme";

// Server Actions recebem input arbitrário do client — validar antes de usar.
// Se inválido, seta o default em vez de gravar lixo no cookie.
export async function setTheme(theme: string) {
  const safeTheme = isValidTheme(theme) ? theme : DEFAULT_THEME;
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, safeTheme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
