import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { BodyMeasurement } from "@/types/database";

type FieldKey = "waist_cm" | "hip_cm" | "arm_cm" | "body_fat_pct";

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "arm_cm", label: "Braço", unit: "cm" },
  { key: "body_fat_pct", label: "% gordura", unit: "%" },
];

type FieldSummary = {
  key: FieldKey;
  label: string;
  unit: string;
  value: number;
  date: string;
  diff: number | null;
};

export default function BodyMeasurementsSummaryCard({
  measurements,
}: {
  measurements: BodyMeasurement[];
}) {
  if (measurements.length === 0) return null;

  // Mais recente primeiro — mesma orientação usada em BodyMeasurementsList.
  const sortedDesc = [...measurements].sort(
    (a, b) => b.measured_at.localeCompare(a.measured_at)
  );
  const lastUpdated = sortedDesc[0].measured_at;

  const fields: FieldSummary[] = FIELDS.map((f) => {
    const latest = sortedDesc.find((m) => m[f.key] !== null);
    if (!latest) return null;

    const latestIdx = sortedDesc.indexOf(latest);
    const previous =
      sortedDesc.slice(latestIdx + 1).find((m) => m[f.key] !== null) ?? null;
    const diff = previous
      ? Number(latest[f.key]) - Number(previous[f.key])
      : null;

    return {
      key: f.key,
      label: f.label,
      unit: f.unit,
      value: Number(latest[f.key]),
      date: latest.measured_at,
      diff,
    };
  }).filter((f): f is FieldSummary => f !== null);

  // Guarda defensiva: o CHECK do banco garante >=1 campo por registro, então
  // measurements.length > 0 implica fields.length > 0. Mantido só por
  // segurança contra dado inconsistente.
  if (fields.length === 0) return null;

  return (
    <Link
      href="/dashboard/measurements"
      className="block rounded-card border border-base-border bg-base-surface p-5 transition hover:border-ink-faint"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">
          Medidas corporais
        </p>
        <span className="font-mono text-xs text-ink-faint">
          {format(parseISO(lastUpdated), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <p className="text-xs text-ink-faint mb-1">{f.label}</p>
            <p className="font-mono font-bold text-lg text-ink">
              {f.value.toFixed(1)}
              <span className="text-xs text-ink-muted font-normal ml-0.5">
                {f.unit}
              </span>
            </p>
            {f.diff !== null && f.diff !== 0 && (
              <p className="text-xs text-ink-faint">
                {f.diff > 0 ? "↑" : "↓"} {Math.abs(f.diff).toFixed(1)}{" "}
                {f.unit}
              </p>
            )}
            {f.date !== lastUpdated && (
              <p className="text-[10px] text-ink-faint mt-0.5">
                {format(parseISO(f.date), "dd/MM", { locale: ptBR })}
              </p>
            )}
          </div>
        ))}
      </div>
    </Link>
  );
}
