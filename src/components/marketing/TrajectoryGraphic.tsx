"use client";

/**
 * Elemento de assinatura visual do produto: a "linha esperada" (meta,
 * projeção linear) contra a "linha real" (peso registrado). É o mesmo
 * conceito central de computePeriodKpi em src/lib/analytics.ts, desenhado.
 *
 * Cores hardcoded (SVG não lê classes Tailwind) mas espelham exatamente
 * tailwind.config.ts: signal.onpace #60A5FA, ink.faint #5B6584,
 * base.bg #0B1220.
 *
 * Usado no hero da landing (variant="hero", animado) e na tela 2 do
 * onboarding (variant="compact", estático).
 */

const ACTUAL_PATH =
  "M 20 46 C 70 60, 90 52, 130 78 C 170 104, 150 96, 190 118 C 230 140, 245 116, 280 132 C 315 148, 305 150, 340 158 C 375 166, 400 162, 440 176";

const EXPECTED_PATH = "M 20 40 L 440 182";

const MEASURE_POINTS = [
  { x: 20, y: 46 },
  { x: 130, y: 78 },
  { x: 190, y: 118 },
  { x: 280, y: 132 },
  { x: 340, y: 158 },
  { x: 440, y: 176 },
];

export function TrajectoryGraphic({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "compact";
  className?: string;
}) {
  const animated = variant === "hero";

  return (
    <svg
      viewBox="0 0 460 200"
      className={className}
      role="img"
      aria-label="Gráfico ilustrativo: peso real acompanhando a meta ao longo do tempo"
    >
      <defs>
        <linearGradient id="traj-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#60A5FA" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* área sob a linha real */}
      <path
        d={`${ACTUAL_PATH} L 440 200 L 20 200 Z`}
        fill="url(#traj-fade)"
        opacity={animated ? 0 : 1}
        className={animated ? "traj-fill" : ""}
      />

      {/* linha esperada (meta) */}
      <path
        d={EXPECTED_PATH}
        fill="none"
        stroke="#5B6584"
        strokeWidth="1.5"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <text x="440" y="196" textAnchor="end" fontSize="10" fill="#5B6584">
        meta
      </text>

      {/* linha real */}
      <path
        d={ACTUAL_PATH}
        fill="none"
        stroke="#60A5FA"
        strokeWidth="2.5"
        strokeLinecap="round"
        className={animated ? "traj-line" : ""}
      />

      {MEASURE_POINTS.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === MEASURE_POINTS.length - 1 ? 4 : 2.5}
          fill="#0B1220"
          stroke="#60A5FA"
          strokeWidth="2"
          className={animated ? "traj-dot" : ""}
          style={animated ? { animationDelay: `${0.9 + i * 0.12}s` } : undefined}
        />
      ))}

      {animated && (
        <style>{`
          .traj-line {
            stroke-dasharray: 620;
            stroke-dashoffset: 620;
            animation: traj-draw 1.3s ease-out forwards;
          }
          .traj-fill {
            animation: traj-appear 0.6s ease-out 1.2s forwards;
          }
          .traj-dot {
            opacity: 0;
            transform-origin: center;
            transform: scale(0.4);
            animation: traj-pop 0.35s ease-out forwards;
          }
          @keyframes traj-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes traj-appear {
            to { opacity: 1; }
          }
          @keyframes traj-pop {
            to { opacity: 1; transform: scale(1); }
          }
          @media (prefers-reduced-motion: reduce) {
            .traj-line, .traj-fill, .traj-dot {
              animation: none !important;
              opacity: 1 !important;
              stroke-dashoffset: 0 !important;
              transform: scale(1) !important;
            }
          }
        `}</style>
      )}
    </svg>
  );
}
