import { loadUserData } from "@/lib/loadUserData";
import { computeAllKpis, computeTrend } from "@/lib/analytics";
import NavBar from "@/components/NavBar";
import KpiCard from "@/components/KpiCard";
import TrendBadge from "@/components/TrendBadge";
import WeightChart from "@/components/WeightChart";
import Link from "next/link";

export default async function DashboardPage() {
  const { profile, entries, goals } = await loadUserData();

  const kpis = computeAllKpis(entries, goals);
  const trend = computeTrend(entries);
  const latest = entries[entries.length - 1] ?? null;
  const first = entries[0] ?? null;
  const totalChange = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : null;

  return (
    <div>
      <NavBar displayName={profile.display_name} />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Visão geral</p>
            <h1 className="font-display font-bold text-5xl sm:text-6xl tracking-tight">
              {latest ? (
                <>
                  <span className="text-ink" style={{ textShadow: "0 0 40px rgba(96,165,250,0.25)" }}>
                    {Number(latest.weight_kg).toFixed(1)}
                  </span>
                  <span className="text-2xl sm:text-3xl text-ink-muted font-medium ml-1">kg</span>
                </>
              ) : (
                <span className="text-ink-muted">Sem registros</span>
              )}
            </h1>
            {totalChange !== null && (
              <div className="mt-3 inline-flex items-center gap-2 bg-base-surface border border-base-border rounded-full px-3 py-1.5">
                <span className={`text-sm font-mono font-bold ${totalChange <= 0 ? "text-signal-ahead" : "text-signal-behind"}`}>
                  {totalChange <= 0 ? "↓" : "↑"} {Math.abs(totalChange).toFixed(1)} kg
                </span>
                <span className="text-xs text-ink-faint">desde o primeiro registro</span>
              </div>
            )}
          </div>
          <Link
            href="/dashboard/entries"
            className="text-sm rounded-lg bg-signal-onpace text-base-bg font-medium px-5 py-2.5 hover:brightness-110 transition"
          >
            Registrar pesagem
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <WeightChart entries={entries} targetWeightKg={goals.target_weight_kg} />
          </div>
          <TrendBadge trend={trend} />
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Metas por período</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.period} kpi={kpi} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
