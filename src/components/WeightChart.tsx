"use client";

import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry } from "@/types/database";
import type { PeriodKpi } from "@/lib/analytics";
import { computeMovingAverage } from "@/lib/analytics";

// Recharts recebe cor via prop (stroke/fill/style), não className — não dá
// pra usar as classes Tailwind bg-base-*/text-ink-* aqui. Em vez disso lemos
// as CSS vars do tema (globals.css) em runtime via getComputedStyle.
//
// Fallback abaixo = valores do tema dark, usados no primeiro render (SSR e
// antes do useEffect rodar) — evita flash/mismatch de hidratação. Depois do
// mount, um MutationObserver no wrapper #app-theme-root (ver
// src/app/(app)/layout.tsx) recalcula as cores sempre que o ThemeToggle
// alterna o atributo data-theme, já que essa troca é só DOM (sem
// re-render de Server Component) — CSS reage sozinho, mas os componentes
// recharts precisam ser avisados manualmente.
const FALLBACK_CHART_COLORS = {
  grid: "#26314A",
  axis: "#5B6584",
  tooltipBg: "#1B2438",
  tooltipBorder: "#26314A",
  tooltipLabel: "#8C97B4",
  accent: "#D97A45",
  movingAvg: "#8C97B4",
};

function readChartColors(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    grid: read("--base-border", FALLBACK_CHART_COLORS.grid),
    axis: read("--ink-faint", FALLBACK_CHART_COLORS.axis),
    tooltipBg: read("--base-surface2", FALLBACK_CHART_COLORS.tooltipBg),
    tooltipBorder: read("--base-border", FALLBACK_CHART_COLORS.tooltipBorder),
    tooltipLabel: read("--ink-muted", FALLBACK_CHART_COLORS.tooltipLabel),
    accent: read("--accent", FALLBACK_CHART_COLORS.accent),
    movingAvg: read("--ink-muted", FALLBACK_CHART_COLORS.movingAvg),
  };
}

export default function WeightChart({
  entries,
  targetWeightKg,
  weekKpi,
}: {
  entries: WeightEntry[];
  targetWeightKg: number | null;
  weekKpi: PeriodKpi | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(FALLBACK_CHART_COLORS);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    setColors(readChartColors(el));

    const themeRoot = document.getElementById("app-theme-root");
    if (!themeRoot) return;
    const observer = new MutationObserver(() => setColors(readChartColors(el)));
    observer.observe(themeRoot, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Linha "esperado": mesma matemática de computePeriodKpi (analytics.ts),
  // só desenhada. baselineWeightKg = peso no início da semana (ou mais
  // próximo dele), expectedWeightNowKg = onde a meta prevê que eu esteja
  // hoje. A reta entre esses dois pontos, no tempo, é o "ritmo da semana" —
  // mesmo conceito da linha tracejada em TrajectoryGraphic.tsx (landing).
  // Não recalcula nada: usa o resultado já pronto de computePeriodKpi.
  const weekStart = weekKpi?.periodStart ? parseISO(weekKpi.periodStart) : null;
  const hasWeeklyTrend =
    weekStart !== null && weekKpi?.baselineWeightKg != null && weekKpi?.expectedWeightNowKg != null;

  const totalElapsedDays = weekStart ? differenceInCalendarDays(new Date(), weekStart) : 0;

  // Média móvel (Fase 5.2): cálculo e critério de visibilidade.
  // sorted é reutilizado abaixo para montar `data`, evitando sort duplo.
  const sorted = [...entries].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const hasMovingAverage =
    sorted.length >= 2 &&
    differenceInCalendarDays(
      parseISO(sorted[sorted.length - 1].measured_at),
      parseISO(sorted[0].measured_at)
    ) >= 6; // 6 dias de diferença = 7 dias corridos (ver decisão 2)
  const movingAverage = computeMovingAverage(entries);
  const movingAverageByDate = new Map(movingAverage.map((m) => [m.date, m.average]));

  const data = sorted.map((e) => {
      const point: {
        date: string;
        label: string;
        peso: number;
        esperado?: number;
        mediaMovel?: number;
      } = {
        date: e.measured_at,
        label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
        peso: Number(e.weight_kg),
      };

      const avg = movingAverageByDate.get(e.measured_at);
      if (avg !== undefined) {
        point.mediaMovel = avg;
      }

      // Só marca "esperado" pra pesagens dentro da semana atual — fora
      // desse intervalo a reta não tem significado (é um KPI por período).
      if (hasWeeklyTrend && weekStart) {
        const entryDate = parseISO(e.measured_at);
        const elapsedAtEntry = differenceInCalendarDays(entryDate, weekStart);
        if (elapsedAtEntry >= 0) {
          const frac =
            totalElapsedDays > 0 ? Math.min(1, elapsedAtEntry / totalElapsedDays) : elapsedAtEntry === 0 ? 0 : null;
          if (frac !== null) {
            point.esperado = Number(
              (
                weekKpi!.baselineWeightKg! +
                (weekKpi!.expectedWeightNowKg! - weekKpi!.baselineWeightKg!) * frac
              ).toFixed(2)
            );
          }
        }
      }

      return point;
    });

  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        className="bg-base-surface border border-base-border rounded-card p-6 h-96 flex items-center justify-center"
      >
        <p className="text-sm text-ink-faint">
          Registre pelo menos 2 pesagens para ver o gráfico de evolução.
        </p>
      </div>
    );
  }

  const weights = data.map((d) => d.peso);
  const min = Math.min(...weights, targetWeightKg ?? Infinity);
  const max = Math.max(...weights, targetWeightKg ?? -Infinity);
  const pad = Math.max(0.5, (max - min) * 0.15);

  return (
    <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-4 h-96">
      <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 px-1">Evolução do peso</p>
      {(hasWeeklyTrend || hasMovingAverage) && (
        <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
            peso real
          </span>
          {hasWeeklyTrend && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ backgroundColor: colors.axis, opacity: 0.8 }} />
              ritmo da semana
            </span>
          )}
          {hasMovingAverage && (
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3" style={{ backgroundColor: colors.movingAvg, opacity: 0.8 }} />
              média móvel (7)
            </span>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height="90%">
        {/* ComposedChart, não AreaChart: o recharts@2.15 filtra os filhos
            gráficos pelo GraphicalChild registrado no factory do chart — em
            <AreaChart> isso é só <Area>, então um <Line> aninhado nele é
            descartado silenciosamente (sem warning, sem erro) e nunca chega
            a existir no SVG. <ComposedChart> aceita misturar Area/Line/Bar
            no mesmo gráfico, mesma API do resto (data, XAxis, YAxis, etc.). */}
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pesoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke={colors.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: colors.grid }}
            minTickGap={24}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            stroke={colors.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: colors.tooltipBg,
              border: `1px solid ${colors.tooltipBorder}`,
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: colors.tooltipLabel }}
            formatter={(value: number, name: string) => [`${value.toFixed(1)} kg`, name]}
          />
          {targetWeightKg && (
            <ReferenceLine
              y={targetWeightKg}
              stroke="#34D399"
              strokeDasharray="4 4"
              label={{ value: "Meta", fill: "#34D399", fontSize: 11, position: "insideTopRight" }}
            />
          )}
          <Area
            type="monotone"
            dataKey="peso"
            name="Peso"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#pesoGradient)"
            dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          {hasWeeklyTrend && (
            <Line
              type="linear"
              dataKey="esperado"
              name="Esperado"
              stroke={colors.axis}
              strokeWidth={2}
              strokeDasharray="4 4"
              // Numa semana, a diferença entre peso real e esperado costuma
              // ser de poucas centenas de gramas — em pixels, isso pode cair
              // a 2-3px de distância da linha sólida (Area) e ficar oculta
              // por baixo dela, mesmo a linha estando desenhada corretamente.
              // Os pontos (um por pesagem dentro da semana) dão uma âncora
              // visível mesmo quando o traço em si está colado na linha real.
              dot={{ r: 3, fill: colors.tooltipBg, stroke: colors.axis, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          )}
          {hasMovingAverage && (
            <Line
              type="monotone"
              dataKey="mediaMovel"
              name="Média móvel (7)"
              stroke={colors.movingAvg}
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
