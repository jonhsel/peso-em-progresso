"use client";

import { useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry } from "@/types/database";

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
  };
}

export default function WeightChart({
  entries,
  targetWeightKg,
}: {
  entries: WeightEntry[];
  targetWeightKg: number | null;
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

  const data = [...entries]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map((e) => ({
      date: e.measured_at,
      label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
      peso: Number(e.weight_kg),
    }));

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
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
            formatter={(value: number) => [`${value.toFixed(1)} kg`, "Peso"]}
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
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#pesoGradient)"
            dot={{ r: 2.5, fill: colors.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
