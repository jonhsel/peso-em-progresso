import { Document, Page, Text, View, StyleSheet, Svg, Polyline, Line, Circle } from "@react-pdf/renderer";
import type { WeightEntry } from "@/types/database";
import type { PeriodKpi, GoalPrediction } from "@/lib/analytics";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#6B7280", marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#374151",
  },
  kpiBox: { padding: 14, backgroundColor: "#F3F4F6", borderRadius: 6 },
  kpiHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  kpiLabel: { fontSize: 9, color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  numbersRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 8 },
  numbersMain: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  numbersTarget: { fontSize: 10, color: "#6B7280" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", marginBottom: 8 },
  progressFill: { height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  detailText: { fontSize: 9, color: "#6B7280", marginBottom: 4 },
  predictionText: { fontSize: 9, color: "#6B7280", marginTop: 4 },
  chartBox: { padding: 14, backgroundColor: "#F9FAFB", borderRadius: 6, alignItems: "center" },
  chartAxisLabel: { fontSize: 7, color: "#9CA3AF" },
  empty: { fontSize: 9, color: "#9CA3AF" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#9CA3AF", textAlign: "center" },
});

// Mesmas cores dos 4 status de KPI usadas na landing/onboarding/dashboard
// (src/lib/kpi-status.ts, espelhado nas classes signal-* do Tailwind) —
// mantido em sincronia manualmente, mesmo padrão já usado em
// ExportDocument.tsx, porque o PDF é renderizado com hex literal, sem
// acesso às classes Tailwind.
const STATUS_COLOR: Record<PeriodKpi["status"], string> = {
  ahead: "#34D399",
  on_pace: "#60A5FA",
  caution: "#FBBF24",
  behind: "#FB7185",
};

const STATUS_LABEL: Record<PeriodKpi["status"], string> = {
  ahead: "Adiantado",
  on_pace: "No ritmo",
  caution: "Atenção",
  behind: "Atrasado",
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Gráfico de linha simplificado, desenhado com os primitivos SVG do
 * @react-pdf/renderer (Svg/Polyline/Line/Circle) — não é o Recharts usado em
 * WeightChart.tsx, que não roda nesse motor de renderização. Pontos
 * espaçados igualmente por índice (não por distância real de dias), mesmo
 * comportamento visual do eixo X categórico do WeightChart. Sem área
 * preenchida, sem linha "esperado"/média móvel — só a linha real do peso,
 * mais uma referência tracejada horizontal da meta de peso, se definida.
 */
function SimpleWeightChart({
  points,
  targetWeightKg,
}: {
  points: { label: string; weight: number }[];
  targetWeightKg: number | null;
}) {
  const width = 500;
  const height = 170;
  const padX = 28;
  const padTop = 12;
  const padBottom = 20;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;

  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights, targetWeightKg ?? Infinity);
  const max = Math.max(...weights, targetWeightKg ?? -Infinity);
  const pad = Math.max(0.5, (max - min) * 0.15);
  const domainMin = min - pad;
  const domainMax = max + pad;

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const yFor = (w: number) =>
    padTop + (1 - (w - domainMin) / (domainMax - domainMin)) * plotHeight;
  const xFor = (i: number) => padX + i * stepX;

  const polylinePoints = points.map((p, i) => `${xFor(i)},${yFor(p.weight)}`).join(" ");

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line
          x1={padX}
          y1={padTop + plotHeight}
          x2={padX + plotWidth}
          y2={padTop + plotHeight}
          stroke="#D1D5DB"
          strokeWidth={1}
        />
        {targetWeightKg !== null && targetWeightKg >= domainMin && targetWeightKg <= domainMax && (
          <Line
            x1={padX}
            y1={yFor(targetWeightKg)}
            x2={padX + plotWidth}
            y2={yFor(targetWeightKg)}
            stroke="#34D399"
            strokeWidth={1}
            strokeDasharray="4,3"
          />
        )}
        <Polyline points={polylinePoints} stroke="#D97A45" strokeWidth={2} fill="none" />
        {points.map((p, i) => (
          <Circle key={i} cx={xFor(i)} cy={yFor(p.weight)} r={2.2} fill="#D97A45" />
        ))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", width }}>
        <Text style={styles.chartAxisLabel}>{points[0]?.label}</Text>
        <Text style={styles.chartAxisLabel}>{points[points.length - 1]?.label}</Text>
      </View>
    </View>
  );
}

export function ReportDocument({
  displayName,
  kpi,
  prediction,
  periodEntries,
  targetWeightKg,
}: {
  displayName: string;
  kpi: PeriodKpi;
  prediction?: GoalPrediction;
  periodEntries: WeightEntry[];
  targetWeightKg: number | null;
}) {
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const hasData = kpi.currentWeightKg !== null && kpi.baselineWeightKg !== null;
  const color = STATUS_COLOR[kpi.status];

  const chartPoints = periodEntries.map((e) => ({
    label: fmtDate(e.measured_at),
    weight: Number(e.weight_kg),
  }));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Relatórios</Text>
        <Text style={styles.subtitle}>
          {displayName} · Período: {kpi.label} · Relatório gerado em {generatedAt}
        </Text>

        <Text style={styles.sectionTitle}>{kpi.label}</Text>
        <View style={styles.kpiBox}>
          {hasData ? (
            <>
              <View style={styles.kpiHeaderRow}>
                <Text style={styles.kpiLabel}>{kpi.label}</Text>
                <View style={[styles.statusDot, { backgroundColor: color }]} />
              </View>

              <View style={styles.numbersRow}>
                <Text style={styles.numbersMain}>
                  {kpi.actualLossKg !== null && kpi.actualLossKg >= 0
                    ? `-${kpi.actualLossKg.toFixed(2)}`
                    : `+${Math.abs(kpi.actualLossKg ?? 0).toFixed(2)}`}
                </Text>
                <Text style={styles.numbersTarget}>/ -{kpi.targetLossKg.toFixed(2)} kg meta</Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: color,
                      width: `${Math.max(0, Math.min(100, kpi.progressToGoalPct ?? 0))}%`,
                    },
                  ]}
                />
              </View>

              <Text style={[styles.statusText, { color }]}>{kpi.statusLabel}</Text>

              {kpi.expectedWeightNowKg !== null && (
                <Text style={styles.detailText}>
                  Hoje você está em {kpi.currentWeightKg?.toFixed(1)} kg · esperado pela meta:{" "}
                  {kpi.expectedWeightNowKg.toFixed(1)} kg
                </Text>
              )}

              {prediction && (
                <Text style={styles.predictionText}>
                  {prediction.kind === "projected" &&
                    `No ritmo atual, meta em ~${prediction.daysFromNow} dias (previsão: ${fmtDate(
                      prediction.estimatedDate
                    )})`}
                  {prediction.kind === "insufficient_data" &&
                    "Sem dados suficientes para projetar (mínimo 2 pesagens nos últimos 21 dias)."}
                  {prediction.kind === "wrong_direction" &&
                    "No ritmo atual, a meta não será alcançada — tendência dos últimos 21 dias não é de perda."}
                  {prediction.kind === "already_reached" &&
                    prediction.withTarget &&
                    "Meta de peso já alcançada!"}
                  {prediction.kind === "already_reached" &&
                    !prediction.withTarget &&
                    "Meta deste período já batida."}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.empty}>Registre pesagens para ver o progresso deste período.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Evolução no período</Text>
        <View style={styles.chartBox}>
          {chartPoints.length >= 2 ? (
            <SimpleWeightChart points={chartPoints} targetWeightKg={targetWeightKg} />
          ) : (
            <Text style={styles.empty}>
              Registre pelo menos 2 pesagens dentro deste período para ver o gráfico.
            </Text>
          )}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
