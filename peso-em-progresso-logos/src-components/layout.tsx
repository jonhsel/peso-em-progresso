import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "700"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

// NEXT_PUBLIC_APP_URL só cobre o subdomínio app.*; a landing (apex) usa uma
// env própria pra metadataBase, já que são origens diferentes (ver decisão
// #6 no CLAUDE.md sobre landing/app serem o mesmo deploy Vercel). Ajuste o
// fallback se o nome da env for outro no seu .env.local / Vercel.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pesoemprogresso.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Peso em Progresso",
    template: "%s — Peso em Progresso",
  },
  description: "Acompanhamento de peso, metas e tendências.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/images/icone.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Peso em Progresso",
    description: "Acompanhamento de peso, metas e tendências.",
    url: siteUrl,
    siteName: "Peso em Progresso",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: "Peso em Progresso",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Peso em Progresso",
    description: "Acompanhamento de peso, metas e tendências.",
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jbMono.variable} font-body bg-base-bg text-ink min-h-screen antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
