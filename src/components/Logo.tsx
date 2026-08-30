// src/components/Logo.tsx
//
// SVG inline (não <img src="...">) de propósito: o texto "peso em" usa
// fill="currentColor" para herdar a cor de texto do tema (text-ink),
// já que o app tem light/dark e a wordmark original (#F3F5F4 fixo) fica
// invisível em fundo claro. A palavra "progresso" fica fixa em
// #34D399 (accent verde), legível nos dois temas por ser saturada.
// A fonte usa var(--font-space-grotesk) (já carregada via next/font em
// layout.tsx) com fallback sans-serif — não depende de Georgia estar
// instalada no dispositivo do usuário.

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Peso em Progresso"
    >
      <rect x="20" y="20" width="160" height="160" rx="34" fill="#0F1512" />
      <rect
        x="20"
        y="20"
        width="160"
        height="160"
        rx="34"
        fill="none"
        stroke="#1C2521"
        strokeWidth="2"
      />
      <path
        d="M 52 62 Q 74 62 83 88 Q 92 114 120 114 Q 142 114 152 132"
        fill="none"
        stroke="#2A3833"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M 52 62 Q 72 62 81 87 Q 90 112 120 114 Q 138 115 152 132"
        fill="none"
        stroke="#34D399"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="52" cy="62" r="7" fill="#0F1512" stroke="#34D399" strokeWidth="4" />
      <circle cx="152" cy="132" r="9" fill="#34D399" />
    </svg>
  );
}

export function LogoHorizontal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 620 160"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Peso em Progresso"
    >
      <rect x="20" y="20" width="120" height="120" rx="26" fill="#0F1512" />
      <rect
        x="20"
        y="20"
        width="120"
        height="120"
        rx="26"
        fill="none"
        stroke="#1C2521"
        strokeWidth="2"
      />
      <path
        d="M 44 52 Q 60 52 67 71 Q 74 90 94 90 Q 110 90 118 104"
        fill="none"
        stroke="#2A3833"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 44 52 Q 58 52 65 70 Q 72 88 94 90 Q 108 91 118 104"
        fill="none"
        stroke="#34D399"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="44" cy="52" r="5" fill="#0F1512" stroke="#34D399" strokeWidth="3" />
      <circle cx="118" cy="104" r="7" fill="#34D399" />
      <text
        x="175"
        y="93"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="34"
        fontWeight="700"
        fill="currentColor"
      >
        peso em{" "}
      </text>
      <text
        x="345"
        y="93"
        fontFamily="var(--font-space-grotesk), sans-serif"
        fontSize="34"
        fontWeight="700"
        fill="#34D399"
      >
        progresso
      </text>
    </svg>
  );
}
