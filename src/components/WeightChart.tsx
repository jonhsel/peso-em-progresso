"use client";

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

export default function WeightChart({
  entries,
  targetWeightKg,
}: {
  entries: WeightEntry[];
  targetWeightKg: number | null;
}) {
  const data = [...entries]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map((e) => ({
      date: e.measured_at,
      label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
      peso: Number(e.weight_kg),
    }));

  if (data.length < 2) {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-6 h-96 flex items-center justify-center">
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
    <div className="bg-base-surface border border-base-border rounded-card p-4 h-96">
      <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 px-1">Evolução do peso</p>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pesoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#26314A" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#5B6584"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#26314A" }}
            minTickGap={24}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            stroke="#5B6584"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "#1B2438",
              border: "1px solid #26314A",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "#8C97B4" }}
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
            stroke="#60A5FA"
            strokeWidth={2}
            fill="url(#pesoGradient)"
            dot={{ r: 2.5, fill: "#60A5FA", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
