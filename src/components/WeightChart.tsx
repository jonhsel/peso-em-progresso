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
import { format, parseISO, differenceInCalendarDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { WeightEntry, Goal } from "@/types/database";
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

// Cores por posição (mais antiga primeiro) pra 2ª/3ª meta de peso ativa
// (Fase 6.2 — múltiplas metas simultâneas). A 1ª meta de peso mantém
// exatamente as cores de hoje (colors.axis reativo ao tema pro "esperado",
// #34D399 fixo pra referência da meta) — zero mudança visual pra quem só
// tem 1 meta de peso. Hex fixo, iguais nos dois temas (mesmos tokens
// signal-* usados em outras partes do PDF/dashboard).
const EXPECTED_LINE_COLORS = ["#5B6584", "#60A5FA", "#FB7185"];
const TARGET_LINE_COLORS = ["#34D399", "#60A5FA", "#FB7185"];

type ChartPeriod = "week" | "month" | "3months" | "6months";

const CHART_PERIOD_OPTIONS: { value: ChartPeriod; label: string }[] = [
  { value: "week", label: "1s" },
  { value: "month", label: "1m" },
  { value: "3months", label: "3m" },
  { value: "6months", label: "6m" },
];

const CHART_PERIOD_STORAGE_KEY = "pesoemprogresso:chartPeriod";

const CHART_PERIOD_DAYS: Record<Exclude<ChartPeriod, "week">, number> = {
  month: 30,
  "3months": 90,
  "6months": 180,
};

/**
 * true se a pesagem cai dentro da janela do período selecionado.
 *
 * "week" reaproveita o weekKpi da meta de peso PRIMÁRIA (a mais antiga
 * ativa — mesma que decide o "esperado" índice 0), já calculado por
 * computePeriodKpi respeitando profile.period_mode/week_starts_on (Fase 3):
 *   - fixed: semana a partir de segunda ou domingo conforme configurado
 *   - rolling: últimos 7 dias corridos
 * Sem lógica nova aqui — quem decide o que "1 semana" significa é o
 * periodStart do analytics.ts, já propagado e testado.
 *
 * "month"/"3months"/"6months": sempre N dias corridos a partir de hoje,
 * sem equivalente civil — mesma regra pros 3, não dependem de period_mode.
 */
function isWithinChartPeriod(
  measuredAt: string,
  period: ChartPeriod,
  primaryWeekKpi: PeriodKpi | null,
  now: Date
): boolean {
  const entryDate = parseISO(measuredAt);
  if (period === "week") {
    // weekKpi.periodStart é string ISO (confirmado: PeriodKpi.periodStart
    // é formatISO(start, { representation: "date" }) em analytics.ts).
    const weekStart = primaryWeekKpi?.periodStart
      ? parseISO(primaryWeekKpi.periodStart)
      : subDays(now, 6);
    return differenceInCalendarDays(entryDate, weekStart) >= 0;
  }
  return differenceInCalendarDays(now, entryDate) <= CHART_PERIOD_DAYS[period];
}

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

function PeriodPills({
  selected,
  onChange,
}: {
  selected: ChartPeriod;
  onChange: (period: ChartPeriod) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5">
      {CHART_PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition ${
            selected === opt.value
              ? "bg-accent text-base-bg"
              : "text-ink-faint hover:text-ink-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export type WeightGoalKpi = { goal: Goal; weekKpi: PeriodKpi | null };

export default function WeightChart({
  entries,
  weightGoals,
}: {
  entries: WeightEntry[];
  weightGoals: WeightGoalKpi[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState(FALLBACK_CHART_COLORS);
  const [selectedPeriod, setSelectedPeriod] = useState<ChartPeriod>("month");

  // Restaura a última escolha do usuário (client-only — primeiro paint do
  // servidor sempre usa o default "month", sem mismatch de hidratação).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CHART_PERIOD_STORAGE_KEY);
      if (stored && CHART_PERIOD_OPTIONS.some((o) => o.value === stored)) {
        setSelectedPeriod(stored as ChartPeriod);
      }
    } catch {
      // localStorage indisponível (iframe sandboxed, modo privado restrito)
    }
  }, []);

  function handlePeriodChange(period: ChartPeriod) {
    setSelectedPeriod(period);
    try {
      window.localStorage.setItem(CHART_PERIOD_STORAGE_KEY, period);
    } catch {
      // mesma proteção
    }
  }

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

  // Linha(s) "esperado" (Fase 6.2: 1 por meta de peso ativa, não só a
  // primária): mesma matemática de computePeriodKpi (analytics.ts), só
  // desenhada. baselineWeightKg = peso no início da semana daquela meta,
  // expectedWeightNowKg = onde aquela meta prevê que eu esteja hoje. A reta
  // entre esses dois pontos, no tempo, é o "ritmo da semana" — mesmo
  // conceito da linha tracejada em TrajectoryGraphic.tsx (landing). Não
  // recalcula nada: usa o resultado já pronto de computePeriodKpi.
  const weeklyTrends = weightGoals.map(({ weekKpi }) => {
    const weekStart = weekKpi?.periodStart ? parseISO(weekKpi.periodStart) : null;
    const hasWeeklyTrend =
      weekStart !== null && weekKpi?.baselineWeightKg != null && weekKpi?.expectedWeightNowKg != null;
    const totalElapsedDays = weekStart ? differenceInCalendarDays(new Date(), weekStart) : 0;
    return { weekStart, hasWeeklyTrend, totalElapsedDays };
  });

  const primaryWeekKpi = weightGoals[0]?.weekKpi ?? null;

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

  const now = new Date();
  const visibleEntries = sorted.filter((e) =>
    isWithinChartPeriod(e.measured_at, selectedPeriod, primaryWeekKpi, now)
  );

  const data = visibleEntries.map((e) => {
    const point: {
      date: string;
      label: string;
      peso: number;
      mediaMovel?: number;
      [key: `esperado_${number}`]: number | undefined;
    } = {
      date: e.measured_at,
      label: format(parseISO(e.measured_at), "dd/MM", { locale: ptBR }),
      peso: Number(e.weight_kg),
    };

    const avg = movingAverageByDate.get(e.measured_at);
    if (avg !== undefined) {
      point.mediaMovel = avg;
    }

    // Só marca "esperado_N" pra pesagens dentro da semana atual daquela
    // meta — fora desse intervalo a reta não tem significado (é um KPI
    // por período).
    weightGoals.forEach(({ weekKpi }, i) => {
      const { weekStart, hasWeeklyTrend, totalElapsedDays } = weeklyTrends[i];
      if (!hasWeeklyTrend || !weekStart) return;
      const entryDate = parseISO(e.measured_at);
      const elapsedAtEntry = differenceInCalendarDays(entryDate, weekStart);
      if (elapsedAtEntry < 0) return;
      const frac =
        totalElapsedDays > 0 ? Math.min(1, elapsedAtEntry / totalElapsedDays) : elapsedAtEntry === 0 ? 0 : null;
      if (frac === null) return;
      point[`esperado_${i}`] = Number(
        (weekKpi!.baselineWeightKg! + (weekKpi!.expectedWeightNowKg! - weekKpi!.baselineWeightKg!) * frac).toFixed(2)
      );
    });

    return point;
  });

  // Caso A — conta nova, sem dados suficientes em lugar nenhum.
  // Sem pills (sem sentido oferecer "3 meses" pra quem não tem 2 pesagens).
  if (sorted.length < 2) {
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

  // Caso B — histórico suficiente, mas a janela filtrada tem < 2 pesagens.
  // Pills continuam visíveis pra trocar de período sem recarregar.
  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        className="bg-base-surface border border-base-border rounded-card p-4 h-96"
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Evolução do peso</p>
          <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
        </div>
        <div className="flex-1 flex items-center justify-center h-[calc(100%-2.5rem)]">
          <p className="text-sm text-ink-faint">
            Registre pelo menos 2 pesagens para ver o gráfico de evolução.
          </p>
        </div>
      </div>
    );
  }

  const targetValues = weightGoals
    .map((wg) => wg.goal.target_value)
    .filter((v): v is number => v != null);

  const weights = data.map((d) => d.peso);
  const min = Math.min(...weights, ...(targetValues.length ? targetValues : [Infinity]));
  const max = Math.max(...weights, ...(targetValues.length ? targetValues : [-Infinity]));
  const pad = Math.max(0.5, (max - min) * 0.15);

  const anyWeeklyTrend = weeklyTrends.some((t) => t.hasWeeklyTrend);

  return (
    <div ref={containerRef} className="bg-base-surface border border-base-border rounded-card p-4 h-96">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Evolução do peso</p>
        <PeriodPills selected={selectedPeriod} onChange={handlePeriodChange} />
      </div>
      {(anyWeeklyTrend || hasMovingAverage) && (
        <div className="flex items-center gap-4 px-1 mb-1 font-mono text-[11px] text-ink-faint flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
            peso real
          </span>
          {weeklyTrends.map(({ hasWeeklyTrend }, i) =>
            hasWeeklyTrend ? (
              <span key={i} className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-3"
                  style={{
                    backgroundColor: i === 0 ? colors.axis : EXPECTED_LINE_COLORS[i],
                    opacity: 0.8,
                  }}
                />
                ritmo da semana
                {weightGoals.length > 1
                  ? ` (${weightGoals[i].goal.label ?? `meta ${i + 1}`})`
                  : ""}
              </span>
            ) : null
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
          {weightGoals.map(({ goal }, i) =>
            goal.target_value != null ? (
              <ReferenceLine
                key={goal.id}
                y={goal.target_value}
                stroke={i === 0 ? "#34D399" : TARGET_LINE_COLORS[i]}
                strokeDasharray="4 4"
                label={{
                  value: weightGoals.length > 1 ? `Meta${goal.label ? ` (${goal.label})` : ` ${i + 1}`}` : "Meta",
                  fill: i === 0 ? "#34D399" : TARGET_LINE_COLORS[i],
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
            ) : null
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
          {weeklyTrends.map(({ hasWeeklyTrend }, i) =>
            hasWeeklyTrend ? (
              <Line
                key={weightGoals[i].goal.id}
                type="linear"
                dataKey={`esperado_${i}`}
                name={weightGoals.length > 1 ? `Esperado (${weightGoals[i].goal.label ?? `meta ${i + 1}`})` : "Esperado"}
                stroke={i === 0 ? colors.axis : EXPECTED_LINE_COLORS[i]}
                strokeWidth={2}
                strokeDasharray="4 4"
                // Numa semana, a diferença entre peso real e esperado costuma
                // ser de poucas centenas de gramas — em pixels, isso pode cair
                // a 2-3px de distância da linha sólida (Area) e ficar oculta
                // por baixo dela, mesmo a linha estando desenhada corretamente.
                // Os pontos (um por pesagem dentro da semana) dão uma âncora
                // visível mesmo quando o traço em si está colado na linha real.
                dot={{ r: 3, fill: colors.tooltipBg, stroke: i === 0 ? colors.axis : EXPECTED_LINE_COLORS[i], strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
                legendType="none"
              />
            ) : null
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
