import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // base/ink viram CSS vars (definidas por tema em globals.css) porque
        // mudam entre dark/light. signal-* fica com hex literal fixo — são
        // iguais nos dois temas, não precisam indireção.
        base: {
          bg: "var(--base-bg)",
          surface: "var(--base-surface)",
          surface2: "var(--base-surface2)",
          border: "var(--base-border)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
          faint: "var(--ink-faint)",
        },
        signal: {
          ahead: "#34D399",
          onpace: "#60A5FA",
          caution: "#FBBF24",
          behind: "#FB7185",
        },
        // Cor de ação/marca (terracota) — nova nesta fase, compartilhada
        // pelos dois temas. Substitui signal-onpace como cor de CTA/botão
        // primário (decisão validada visualmente em 28/08/2026).
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jbmono)", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
