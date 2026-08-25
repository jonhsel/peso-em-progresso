import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#0B1220",
          surface: "#141B2D",
          surface2: "#1B2438",
          border: "#26314A",
        },
        ink: {
          DEFAULT: "#E7ECF7",
          muted: "#8C97B4",
          faint: "#5B6584",
        },
        signal: {
          ahead: "#34D399",
          onpace: "#60A5FA",
          caution: "#FBBF24",
          behind: "#FB7185",
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
