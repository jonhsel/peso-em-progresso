import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { WeightEntry } from "@/types/database";
import type { PeriodKpi, TrendResult } from "@/lib/analytics";

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
  summaryRow: { flexDirection: "row", gap: 16, marginBottom: 4 },
  summaryBox: { flex: 1, padding: 10, backgroundColor: "#F3F4F6", borderRadius: 4 },
  summaryLabel: { fontSize: 8, color: "#6B7280", marginBottom: 3, textTransform: "uppercase" },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 5,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    paddingBottom: 5,
    marginBottom: 2,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: "#6B7280" },
  td: { fontSize: 9 },
  colDate: { width: "20%" },
  colWeight: { width: "18%" },
  colDiff: { width: "18%" },
  colNote: { width: "44%" },
  colPeriod: { width: "20%" },
  colStatus: { width: "22%" },
  colDetail: { width: "58%" },
  empty: { fontSize: 9, color: "#9CA3AF", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#9CA3AF", textAlign: "center" },
});

const STATUS_LABEL: Record<PeriodKpi["status"], string> = {
  ahead: "Adiantado",
  on_pace: "No ritmo",
  caution: "Atenção",
  behind: "Atrasado",
};

const TREND_LABEL: Record<TrendResult["label"], string> = {
  perdendo_rapido: "Perdendo rápido",
  perdendo: "Perdendo peso",
  estavel: "Estável",
  ganhando: "Ganhando peso",
  insufficient_data: "Sem dados recentes",
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function ExportDocument({
  displayName,
  entries,
  kpis,
  trend,
}: {
  displayName: string;
  entries: WeightEntry[];
  kpis: PeriodKpi[];
  trend: TrendResult;
}) {
  const sorted = [...entries].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const latest = sorted[sorted.length - 1] ?? null;
  const first = sorted[0] ?? null;
  const totalChange = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : null;

  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Peso em Progresso</Text>
        <Text style={styles.subtitle}>
          {displayName} · Relatório gerado em {generatedAt}
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Peso atual</Text>
            <Text style={styles.summaryValue}>
              {latest ? `${Number(latest.weight_kg).toFixed(1)} kg` : "—"}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Variação total</Text>
            <Text style={styles.summaryValue}>
              {totalChange !== null
                ? `${totalChange <= 0 ? "-" : "+"}${Math.abs(totalChange).toFixed(1)} kg`
                : "—"}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Tendência (21 dias)</Text>
            <Text style={styles.summaryValue}>{TREND_LABEL[trend.label]}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Metas por período</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colPeriod]}>Período</Text>
            <Text style={[styles.th, styles.colStatus]}>Status</Text>
            <Text style={[styles.th, styles.colDetail]}>Detalhe</Text>
          </View>
          {kpis.map((kpi) => (
            <View style={styles.tableRow} key={kpi.period}>
              <Text style={[styles.td, styles.colPeriod]}>{kpi.label}</Text>
              <Text style={[styles.td, styles.colStatus]}>{STATUS_LABEL[kpi.status]}</Text>
              <Text style={[styles.td, styles.colDetail]}>{kpi.statusLabel}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Histórico de pesagens ({sorted.length})</Text>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>Nenhuma pesagem registrada ainda.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colDate]}>Data</Text>
              <Text style={[styles.th, styles.colWeight]}>Peso</Text>
              <Text style={[styles.th, styles.colDiff]}>Variação</Text>
              <Text style={[styles.th, styles.colNote]}>Nota</Text>
            </View>
            {sorted.map((entry, i) => {
              const prev = sorted[i - 1];
              const diff = prev ? Number(entry.weight_kg) - Number(prev.weight_kg) : null;
              return (
                <View style={styles.tableRow} key={entry.id} wrap={false}>
                  <Text style={[styles.td, styles.colDate]}>{fmtDate(entry.measured_at)}</Text>
                  <Text style={[styles.td, styles.colWeight]}>
                    {Number(entry.weight_kg).toFixed(1)} kg
                  </Text>
                  <Text style={[styles.td, styles.colDiff]}>
                    {diff === null ? "—" : diff === 0 ? "=" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`}
                  </Text>
                  <Text style={[styles.td, styles.colNote]}>{entry.note ?? ""}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
