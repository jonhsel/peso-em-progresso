import { getTheme } from "@/lib/get-theme";

// Layout do route group (app) — envolve /login, /onboarding e /dashboard/*
// (tudo que roda em app.*, ver decisão 6 do CLAUDE.md). A landing (/) fica
// fora deste grupo e permanece dark-only, sem data-theme dinâmico.
//
// data-theme vai num <div> wrapper, nunca no <html> raiz (src/app/layout.tsx
// é compartilhado com a landing). O wrapper também recebe o bg/ink base —
// sem isso o <body> (fora do escopo do data-theme, que só cascateia pra
// descendentes, nunca pra ancestrais) ficaria preso na cor escura por trás
// do conteúdo claro.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();

  return (
    <div id="app-theme-root" data-theme={theme} className="min-h-screen bg-base-bg text-ink">
      {children}
    </div>
  );
}
