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
import { format, parseISO, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry, Goal } from "@/types/database";
import type { GoalPrediction, TrendLine } from "@/lib/analytics";

// Duplicado de WeightChart.tsx — ver decisão 6.1 do spec Fase 8.1.1.
const FALLBACK_CHART_COLORS = {
  grid: "#26314A",
  axis: "#5B6584",
  tooltipBg: "#1B2438",
  tooltipBorder: "#26314A",
  tooltipLabel: "#8C97B4",
  accent: "#D97A45",
  projected: "#60A5FA",
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
    projected: FALLBACK_CHART_COLORS.projected,
  };
}

export default function PredictionChart({
  entries,
  goal,
  prediction,
  trendLine,
}: {
  entries: WeightEntry[];
  goal: Goal;
  prediction?: GoalPrediction;
  trendLine?: TrendLine;
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

  // Filtrar últimos 90 dias de entries (peso)
  const now = new Date();
  const cutoff = subDays(now, 90);
  const sorted = entries
    .filter((e) => parseISO(e.measured_at) >= cutoff)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));

  if (sorted.length === 0) {
    return (
      <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-5">
        <p className="text-sm text-ink-faint">Sem pesagens nos últimos 90 dias para exibir o gráfico.</p>
      </div>
    );
  }

  // Pontos reais
  type DataPoint = { label: string; date: string; peso: number; projetado?: number; tendencia?: number };
  const data: DataPoint[] = sorted.map((e) => ({
    label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
    date: e.measured_at,
    peso: Number(e.weight_kg),
  }));

  // Linha projetada: do último ponto real até a data estimada. Só é
  // desenhada quando a meta tem target_value definido e a previsão é do
  // tipo "projected" — sem target_value não há um "peso de chegada" claro
  // pra desenhar (a previsão sem target projeta bater a meta de perda do
  // período, não um peso final), o texto do PredictionExplainer já cobre
  // esse caso (ver decisão B2 do spec).
  const lastEntry = sorted[sorted.length - 1];
  const hasProjection = prediction?.kind === "projected";
  const projectionTarget: number | null = hasProjection ? goal.target_value : null;

  if (hasProjection && projectionTarget !== null && prediction.kind === "projected") {
    // Adicionar o último ponto real com `projetado` = peso real (ponto de
    // partida da linha tracejada)
    data[data.length - 1].projetado = Number(lastEntry.weight_kg);

    // Ponto final: data estimada, peso alvo
    data.push({
      label: format(parseISO(prediction.estimatedDate), "dd/MM", { locale: ptBR }),
      date: prediction.estimatedDate,
      peso: undefined as unknown as number, // sem peso real nesse ponto
      projetado: projectionTarget,
    });
  }

  // Linha de tendência (regressão de 21 dias) — sempre desenhada quando
  // disponível, independente de haver projeção de meta. Resolve o caso em
  // que a tendência não é de perda (ou a meta não tem target_value): a
  // página de previsão continua mostrando algo que o Dashboard não mostra.
  if (trendLine) {
    const addTrendPoint = (date: string, weightKg: number) => {
      const existing = data.find((d) => d.date === date);
      if (existing) {
        existing.tendencia = weightKg;
      } else {
        data.push({
          label: format(parseISO(date), "dd/MM", { locale: ptBR }),
          date,
          peso: undefined as unknown as number,
          tendencia: weightKg,
        });
      }
    };
    addTrendPoint(trendLine.start.date, trendLine.start.weightKg);
    addTrendPoint(trendLine.end.date, trendLine.end.weightKg);
    data.sort((a, b) => a.date.localeCompare(b.date));
  }

  const allWeights = data.map((d) => d.peso).filter((w) => w != null && !isNaN(w));
  const allValues = [...allWeights];
  const trendValues = data.map((d) => d.tendencia).filter((w): w is number => w != null && !isNaN(w));
  allValues.push(...trendValues);
  if (projectionTarget !== null) allValues.push(projectionTarget);
  if (goal.target_value != null) allValues.push(goal.target_value);

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const pad = Math.max(0.5, (max - min) * 0.15);

  return (
    <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-4 h-80">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Projeção de tendência (últimos 90 dias)</p>
      </div>
      <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
          peso real
        </span>
        {hasProjection && projectionTarget !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.projected, opacity: 0.8 }} />
            projeção
          </span>
        )}
        {trendLine && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3" style={{ backgroundColor: colors.axis, opacity: 0.8 }} />
            linha de tendência
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="predGradient" x1="0" y1="0" x2="0" y2="1">
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
            formatter={(value: number, name: string) => {
              if (value == null || isNaN(value)) return ["-", name];
              return [`${value.toFixed(1)} kg`, name];
            }}
          />
          {goal.target_value != null && (
            <ReferenceLine
              y={goal.target_value}
              stroke="#34D399"
              strokeDasharray="4 4"
              label={{
                value: "Meta",
                fill: "#34D399",
                fontSize: 11,
                position: "insideTopRight",
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="peso"
            name="Peso"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#predGradient)"
            dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
          {trendLine && (
            <Line
              type="linear"
              dataKey="tendencia"
              name="Linha de tendência"
              stroke={colors.axis}
              strokeWidth={1.5}
              strokeDasharray="2 3"
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
              legendType="none"
            />
          )}
          {hasProjection && projectionTarget !== null && (
            <Line
              type="linear"
              dataKey="projetado"
              name="Projeção"
              stroke={colors.projected}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: colors.tooltipBg, stroke: colors.projected, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
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
