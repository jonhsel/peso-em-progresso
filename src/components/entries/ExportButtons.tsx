export default function ExportButtons() {
  return (
    <div className="flex items-center gap-2">
      <a
        href="/api/export/csv"
        className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
      >
        Exportar CSV
      </a>
      <a
        href="/api/export/pdf"
        className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
      >
        Exportar PDF
      </a>
    </div>
  );
}
