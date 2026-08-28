"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  parseCsv,
  detectColumns,
  validateRows,
  type ColumnMapping,
  type ImportRow,
  type ImportError,
} from "@/lib/csv-parser";

const MAX_ROWS = 500;

type Step = "upload" | "preview" | "saving" | "done";

interface ImportResult {
  inserted: number;
  skippedExisting: number;
  errors: ImportError[];
  duplicatesInFile: number;
}

export default function CsvImporter({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // Parse state
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [validRows, setValidRows] = useState<ImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ImportError[]>([]);
  const [duplicatesInFile, setDuplicatesInFile] = useState(0);
  const [fileName, setFileName] = useState("");
  const [truncated, setTruncated] = useState(false);

  // Result state
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saveProgress, setSaveProgress] = useState(0);

  // --- Manual mapping ---
  const [manualDateIdx, setManualDateIdx] = useState(0);
  const [manualWeightIdx, setManualWeightIdx] = useState(1);

  // Raw rows stored for re-validation when user changes column mapping manually
  const [rawRows, setRawRows] = useState<string[][]>([]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setFileName(file.name);

    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      setError("Formato não suportado. Envie um arquivo .csv ou .txt.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target?.result as string;
      if (!raw || raw.trim().length === 0) {
        setError("Arquivo vazio.");
        return;
      }

      const { headers: h, rows } = parseCsv(raw);
      if (h.length < 2) {
        setError(
          "O arquivo precisa ter pelo menos 2 colunas (data e peso). " +
            "Verifique se o separador é vírgula ou ponto-e-vírgula."
        );
        return;
      }

      const wasTruncated = rows.length > MAX_ROWS;
      const limitedRows = wasTruncated ? rows.slice(0, MAX_ROWS) : rows;
      setTruncated(wasTruncated);
      setHeaders(h);
      setRawRows(limitedRows);

      const detected = detectColumns(h);
      if (detected) {
        setMapping(detected);
        const parsed = validateRows(limitedRows, detected.dateIndex, detected.weightIndex);
        setValidRows(parsed.valid);
        setParseErrors(parsed.errors);
        setDuplicatesInFile(parsed.duplicatesInFile);
      } else {
        setManualDateIdx(0);
        setManualWeightIdx(Math.min(1, h.length - 1));
        setMapping(null);
        // Validate with default manual selection
        const parsed = validateRows(limitedRows, 0, Math.min(1, h.length - 1));
        setValidRows(parsed.valid);
        setParseErrors(parsed.errors);
        setDuplicatesInFile(parsed.duplicatesInFile);
      }

      setStep("preview");
    };
    reader.onerror = () => setError("Erro ao ler o arquivo.");
    reader.readAsText(file);
  }, []);

  function handleManualMappingChange(dateIdx: number, weightIdx: number) {
    setManualDateIdx(dateIdx);
    setManualWeightIdx(weightIdx);
    const parsed = validateRows(rawRows, dateIdx, weightIdx);
    setValidRows(parsed.valid);
    setParseErrors(parsed.errors);
    setDuplicatesInFile(parsed.duplicatesInFile);
    setMapping({ dateIndex: dateIdx, weightIndex: weightIdx, autoDetected: false });
  }

  async function handleConfirm() {
    if (validRows.length === 0) return;
    setStep("saving");
    setError(null);
    setSaveProgress(0);

    try {
      // 1) Buscar datas já existentes do usuário
      const { data: existing, error: fetchErr } = await supabase
        .from("weight_entries")
        .select("measured_at")
        .eq("user_id", userId);

      if (fetchErr) {
        setError("Erro ao verificar pesagens existentes.");
        setStep("preview");
        return;
      }

      const existingDates = new Set(
        (existing ?? []).map((e: { measured_at: string }) => e.measured_at)
      );

      // 2) Filtrar linhas que já existem
      const toInsert = validRows.filter((r) => !existingDates.has(r.date));
      const skippedExisting = validRows.length - toInsert.length;

      // 3) Inserir em lotes de 50
      const BATCH = 50;
      let inserted = 0;

      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH).map((r) => ({
          user_id: userId,
          measured_at: r.date,
          weight_kg: r.weight,
          source: "import" as const,
        }));

        const { error: insertErr } = await supabase
          .from("weight_entries")
          .insert(batch);

        if (insertErr) {
          setError(
            `Erro ao salvar lote ${Math.floor(i / BATCH) + 1}. ` +
              `${inserted} pesagens já foram salvas. Tente importar novamente ` +
              `(registros duplicados serão ignorados automaticamente).`
          );
          setStep("preview");
          return;
        }

        inserted += batch.length;
        setSaveProgress(Math.round((inserted / toInsert.length) * 100));
      }

      setResult({
        inserted,
        skippedExisting,
        errors: parseErrors,
        duplicatesInFile,
      });
      setStep("done");
    } catch {
      setError("Erro inesperado ao salvar. Tente novamente.");
      setStep("preview");
    }
  }

  function handleReset() {
    setStep("upload");
    setError(null);
    setHeaders([]);
    setMapping(null);
    setValidRows([]);
    setParseErrors([]);
    setDuplicatesInFile(0);
    setFileName("");
    setTruncated(false);
    setResult(null);
    setRawRows([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  // --- Drag & drop ---
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  // --- Render ---

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`border-2 border-dashed rounded-card p-8 text-center transition-colors ${
            dragging
              ? "border-accent bg-[var(--accent-tint)]"
              : "border-base-border hover:border-ink-faint"
          }`}
        >
          <p className="text-sm text-ink-muted mb-2">
            Arraste um arquivo .csv aqui ou clique para selecionar
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
            id="csv-upload"
          />
          <label
            htmlFor="csv-upload"
            className="inline-block cursor-pointer rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 text-sm hover:bg-accent-hover transition"
          >
            Escolher arquivo
          </label>
        </div>

        {error && <p className="text-sm text-signal-behind">{error}</p>}

        <div className="bg-base-surface border border-base-border rounded-card p-4 space-y-2">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Formatos aceitos
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Arquivo CSV com pelo menos duas colunas: uma de data e uma de peso (kg).
            O separador pode ser vírgula ou ponto-e-vírgula. Aceita vírgula ou ponto
            como decimal no peso.
          </p>
          <p className="text-xs text-ink-faint leading-relaxed">
            Se você usa a balança Fitdays/ICOMON, exporte seus dados pelo Apple Saúde
            ou Google Fit para CSV (o app Fitdays não exporta CSV diretamente). Apps
            como &quot;Health Data Export&quot; ou &quot;Health Auto Export&quot; fazem isso.
          </p>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    const autoDetected = mapping?.autoDetected ?? false;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            <span className="font-mono text-ink">{fileName}</span>
          </p>
          <button
            onClick={handleReset}
            className="text-xs text-ink-faint hover:text-ink transition"
          >
            Trocar arquivo
          </button>
        </div>

        {truncated && (
          <p className="text-xs text-signal-caution bg-base-surface border border-signal-caution/30 rounded-card px-3 py-2">
            O arquivo tem mais de {MAX_ROWS} linhas. Apenas as primeiras {MAX_ROWS}{" "}
            serão importadas.
          </p>
        )}

        {/* Column mapping */}
        {!autoDetected && (
          <div className="bg-base-surface border border-base-border rounded-card p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-signal-caution">
              Não foi possível detectar as colunas automaticamente
            </p>
            <p className="text-sm text-ink-muted">
              Selecione qual coluna contém a data e qual contém o peso:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink-muted mb-1.5">
                  Coluna de data
                </label>
                <select
                  value={manualDateIdx}
                  onChange={(e) =>
                    handleManualMappingChange(Number(e.target.value), manualWeightIdx)
                  }
                  className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1.5">
                  Coluna de peso
                </label>
                <select
                  value={manualWeightIdx}
                  onChange={(e) =>
                    handleManualMappingChange(manualDateIdx, Number(e.target.value))
                  }
                  className="w-full rounded-lg bg-base-surface2 border border-base-border px-3 py-2 text-sm outline-none focus:border-accent"
                >
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="bg-base-surface border border-base-border rounded-card p-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-signal-ahead font-mono">
              {validRows.length}
            </span>
            <span className="text-ink-muted">
              {validRows.length === 1 ? "pesagem válida" : "pesagens válidas"}
            </span>
            {parseErrors.length > 0 && (
              <>
                <span className="text-signal-behind font-mono">
                  {parseErrors.length}
                </span>
                <span className="text-ink-muted">
                  {parseErrors.length === 1 ? "linha com erro" : "linhas com erro"}
                </span>
              </>
            )}
            {duplicatesInFile > 0 && (
              <>
                <span className="text-signal-caution font-mono">
                  {duplicatesInFile}
                </span>
                <span className="text-ink-muted">
                  {duplicatesInFile === 1
                    ? "data duplicada no CSV"
                    : "datas duplicadas no CSV"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Preview table — first 10 valid rows */}
        {validRows.length > 0 && (
          <div className="bg-base-surface border border-base-border rounded-card overflow-hidden">
            <p className="text-xs uppercase tracking-wide text-ink-muted px-4 pt-3 pb-2">
              Prévia{validRows.length > 10 ? ` (10 de ${validRows.length})` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-border">
                    <th className="text-left text-xs text-ink-faint font-normal px-4 py-2">
                      Data
                    </th>
                    <th className="text-right text-xs text-ink-faint font-normal px-4 py-2">
                      Peso (kg)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-border">
                  {validRows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-mono text-ink-muted">
                        {row.date}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {row.weight.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Errors detail (collapsible) */}
        {parseErrors.length > 0 && (
          <details className="bg-base-surface border border-base-border rounded-card">
            <summary className="px-4 py-3 text-sm text-signal-behind cursor-pointer">
              {parseErrors.length}{" "}
              {parseErrors.length === 1 ? "linha ignorada" : "linhas ignoradas"}{" "}
              (clique para ver)
            </summary>
            <div className="px-4 pb-3 space-y-1">
              {parseErrors.slice(0, 20).map((err, i) => (
                <p key={i} className="text-xs text-ink-faint">
                  Linha {err.line}: {err.reason}
                </p>
              ))}
              {parseErrors.length > 20 && (
                <p className="text-xs text-ink-faint">
                  ...e mais {parseErrors.length - 20}.
                </p>
              )}
            </div>
          </details>
        )}

        {error && <p className="text-sm text-signal-behind">{error}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleConfirm}
            disabled={validRows.length === 0}
            className="flex-1 rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm disabled:opacity-60 transition hover:bg-accent-hover"
          >
            Importar {validRows.length}{" "}
            {validRows.length === 1 ? "pesagem" : "pesagens"}
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-base-border px-4 py-2.5 text-sm text-ink-muted hover:text-ink transition"
          >
            Cancelar
          </button>
        </div>

        <p className="text-xs text-ink-faint">
          Pesagens em datas que já possuem registro manual serão ignoradas (o registro
          manual tem prioridade).
        </p>
      </div>
    );
  }

  if (step === "saving") {
    return (
      <div className="bg-base-surface border border-base-border rounded-card p-6 text-center space-y-4">
        <p className="text-sm text-ink-muted">Importando pesagens...</p>
        <div className="w-full bg-base-surface2 rounded-full h-2 overflow-hidden">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${saveProgress}%` }}
          />
        </div>
        <p className="text-xs text-ink-faint font-mono">{saveProgress}%</p>
        {error && <p className="text-sm text-signal-behind">{error}</p>}
      </div>
    );
  }

  // step === "done"
  if (!result) return null;

  return (
    <div className="space-y-4">
      <div className="bg-base-surface border border-base-border rounded-card p-6 space-y-3">
        <p className="text-xs uppercase tracking-wide text-signal-ahead">
          Importação concluída
        </p>
        <div className="space-y-1.5">
          <p className="text-sm">
            <span className="font-mono text-signal-ahead">{result.inserted}</span>{" "}
            <span className="text-ink-muted">
              {result.inserted === 1
                ? "pesagem importada"
                : "pesagens importadas"}
            </span>
          </p>
          {result.skippedExisting > 0 && (
            <p className="text-sm">
              <span className="font-mono text-signal-caution">
                {result.skippedExisting}
              </span>{" "}
              <span className="text-ink-muted">
                {result.skippedExisting === 1
                  ? "ignorada (já existia registro nessa data)"
                  : "ignoradas (já existiam registros nessas datas)"}
              </span>
            </p>
          )}
          {result.duplicatesInFile > 0 && (
            <p className="text-sm">
              <span className="font-mono text-ink-faint">
                {result.duplicatesInFile}
              </span>{" "}
              <span className="text-ink-muted">
                {result.duplicatesInFile === 1
                  ? "data duplicada no CSV"
                  : "datas duplicadas no CSV"}
              </span>
            </p>
          )}
          {result.errors.length > 0 && (
            <p className="text-sm">
              <span className="font-mono text-signal-behind">
                {result.errors.length}
              </span>{" "}
              <span className="text-ink-muted">
                {result.errors.length === 1
                  ? "linha com erro de formato"
                  : "linhas com erro de formato"}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/entries")}
          className="flex-1 rounded-lg bg-accent text-base-bg font-medium py-2.5 text-sm hover:bg-accent-hover transition"
        >
          Ver histórico
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg border border-base-border px-4 py-2.5 text-sm text-ink-muted hover:text-ink transition"
        >
          Importar outro arquivo
        </button>
      </div>
    </div>
  );
}
