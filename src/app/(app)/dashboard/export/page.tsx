import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import ReportExportCard from "@/components/export/ReportExportCard";

export const dynamic = "force-dynamic";

function formatDateBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(
    new Date(iso)
  );
}

export default async function ExportPage() {
  const { profile, entries, activeGoals } = await loadUserData();
  const theme = await getTheme();

  const hasEntries = entries.length > 0;
  const rangeText = hasEntries
    ? `${entries.length} pesagem${entries.length > 1 ? "ns" : ""} registrada${
        entries.length > 1 ? "s" : ""
      }, de ${formatDateBR(entries[0].measured_at)} a ${formatDateBR(
        entries[entries.length - 1].measured_at
      )}.`
    : "Nenhuma pesagem registrada ainda.";

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        theme={theme}
        plan={profile.plan}
        activeGoals={activeGoals}
      />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Exportar Dados">
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
                  Exportar Dados
                </p>
                <p className="text-sm text-ink-muted">{rangeText}</p>
              </div>

              {/* Card 1 — CSV genérico */}
              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm">Planilha (CSV)</p>
                  <p className="text-xs text-ink-muted mt-1">
                    Todas as pesagens registradas, em formato compatível com
                    Excel e Google Sheets.
                  </p>
                </div>
                <a
                  href="/api/export/csv"
                  className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                >
                  Baixar CSV
                </a>
              </div>

              {/* Card 2 — PDF genérico */}
              <div className="rounded-card border border-base-border bg-base-surface px-4 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-display font-bold text-sm">Relatório completo (PDF)</p>
                  <p className="text-xs text-ink-muted mt-1">
                    Resumo de todas as metas ativas com os 4 KPIs de cada uma
                    e o histórico completo de pesagens.
                  </p>
                </div>
                <a
                  href="/api/export/pdf"
                  className="shrink-0 text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
                >
                  Baixar PDF
                </a>
              </div>

              {/* Card 3 — PDF de relatório por período/meta */}
              <ReportExportCard goals={activeGoals} />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
