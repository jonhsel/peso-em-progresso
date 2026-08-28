// URL base do app (dashboard/login), usada pela landing pública em "/" pra
// linkar pro subdomínio correto — apex e "app." são origens diferentes, um
// <Link href="/login"> relativo ficaria preso no domínio da landing.
//
// Em dev local não existe subdomínio, então o default aponta pro próprio
// localhost. Em produção, defina NEXT_PUBLIC_APP_URL=https://app.SEUDOMINIO
// nas env vars do projeto na Vercel (Production e Preview).
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function appPath(path: string) {
  return `${APP_URL}${path}`;
}
