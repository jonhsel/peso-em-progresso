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
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Visão geral</p>
            <h1 className="font-display font-bold text-3xl">
              {latest ? `${Number(latest.weight_kg).toFixed(1)} kg` : "Sem registros"}
            </h1>
            {totalChange !== null && (
              <p className="text-sm text-ink-faint mt-1">
                {totalChange <= 0 ? "-" : "+"}
                {Math.abs(totalChange).toFixed(1)} kg desde o primeiro registro
              </p>
            )}
          </div>
          <Link
            href="/dashboard/entries"
            className="text-sm rounded-lg bg-signal-onpace text-base-bg font-medium px-4 py-2 hover:brightness-110 transition"
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
