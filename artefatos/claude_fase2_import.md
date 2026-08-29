# Fase 2.1 — Importação de CSV (peso)

> Formato: instruções para Claude Code executar em `~/ambiente_virtual/peso-em-progresso`.
> Mesmo padrão dos specs anteriores (`claude_fase0_v3.md`, `claude_fase1_export_v2.md`,
> `claude_darkmode.md`). Ler antes de codar, não pular etapas, validar com
> `tsc --noEmit` + `next build` ao final.

## Contexto

O campo `weight_entries.source` já aceita `'manual' | 'import'` no schema e nos types
(`src/types/database.ts`). O `EntriesList` e a rota de exportação CSV/PDF já mostram
a origem. O que falta é a **tela de upload + parser + persistência**.

### Sobre o Fitdays

O Fitdays (app da ICOMON para balanças inteligentes) **não oferece exportação CSV
nativa** do histórico de medições. As vias possíveis para o usuário obter seus dados
são: (1) exportar do Apple Health ou Google Fit (que sincronizam com o Fitdays) para
CSV via apps terceiros, (2) copiar manualmente, (3) usar qualquer outra balança ou app
que exporte CSV. Por isso a importação deve ser **genérica** — aceitar qualquer CSV
que contenha pelo menos uma coluna de data e uma de peso, não apenas um formato
específico do Fitdays. O título na UI pode dizer "Importar CSV" sem mencionar Fitdays,
mas incluir uma nota explicativa sobre como obter o CSV a partir do Fitdays/Apple
Health/Google Fit.

## Decisões de design

1. **Parser 100% client-side** — o CSV é lido com `FileReader`, parseado com uma
   função pura sem dependência, preview mostrado numa tabela antes de salvar. Nenhum
   dado sobe pro servidor antes do usuário confirmar. Sem dependência nova (nem
   `papaparse`): o parser lida com campos entre aspas e delimitadores `,` ou `;`.

2. **Mapeamento de colunas por heurística + fallback manual** — o parser tenta
   detectar automaticamente qual coluna é "data" e qual é "peso" pelo nome do header
   (case-insensitive: `date`, `data`, `measured_at`, `time`, `datetime` para data;
   `weight`, `peso`, `weight_kg`, `weight(kg)`, `kg` para peso). Se não conseguir,
   mostra dropdowns para o usuário escolher.

3. **Conflitos = upsert** — mesmo comportamento do `WeightEntryForm`: se já existe
   pesagem manual naquela data, o import **não sobrescreve** (o manual tem
   prioridade). Registros importados que cairiam em data já ocupada são listados
   como "ignorados" no resultado. Implementação: um `select` prévio das datas
   existentes, filtro client-side, e `insert` (não upsert) só das novas.

4. **Limite de 500 linhas por upload** — proteção contra CSV gigante travar o
   browser. Mostra aviso se o arquivo tiver mais.

5. **Tela é uma rota dedicada** — `/dashboard/import`, não um modal, para manter
   consistência com a arquitetura de páginas do projeto. Link de acesso a partir
   do `entries/page.tsx`.

6. **Sem dependência nova** — tudo built-in (FileReader, fetch nativo, Supabase
   client).

## Arquivos

### 1. Arquivo novo: `src/lib/csv-parser.ts`

Parser genérico, função pura, sem dependência de React/Supabase.

```ts
// Parser CSV simples que lida com:
// - Delimitadores: `,` ou `;` (auto-detectado pela primeira linha)
// - Campos entre aspas duplas (RFC4180, aspas internas escapadas como "")
// - BOM UTF-8 (removido silenciosamente)

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(raw: string): ParsedCsv {
  // Remove BOM
  const text = raw.replace(/^\uFEFF/, "");

  const lines = splitLines(text);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Auto-detect delimiter: se a primeira linha tem mais ";" que ",", usa ";"
  const delimiter = (lines[0].match(/;/g) || []).length >=
    (lines[0].match(/,/g) || []).length
    ? ";"
    : ",";

  const headers = parseLine(lines[0], delimiter).map((h) =>
    h.trim().toLowerCase()
  );
  const rows = lines.slice(1).map((line) => parseLine(line, delimiter));

  // Remove linhas completamente vazias
  const filtered = rows.filter((row) => row.some((cell) => cell.trim() !== ""));

  return { headers, rows: filtered };
}

function splitLines(text: string): string[] {
  // Respeita quebras dentro de campos entre aspas
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++; // skip \r\n
      if (current.trim() !== "") lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") lines.push(current);
  return lines;
}

function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// --- Detecção de colunas ---

const DATE_NAMES = [
  "date", "data", "measured_at", "time", "datetime", "date/time",
  "measurement date", "data da medição", "dia", "day",
];
const WEIGHT_NAMES = [
  "weight", "peso", "weight_kg", "weight (kg)", "kg", "body weight",
  "peso (kg)", "peso corporal", "mass", "massa",
];

export interface ColumnMapping {
  dateIndex: number;
  weightIndex: number;
  autoDetected: boolean;
}

export function detectColumns(headers: string[]): ColumnMapping | null {
  const normalized = headers.map((h) => h.replace(/[_\-()]/g, " ").trim());
  let dateIndex = -1;
  let weightIndex = -1;

  for (let i = 0; i < normalized.length; i++) {
    if (dateIndex === -1 && DATE_NAMES.includes(normalized[i])) {
      dateIndex = i;
    }
    if (weightIndex === -1 && WEIGHT_NAMES.includes(normalized[i])) {
      weightIndex = i;
    }
  }

  if (dateIndex >= 0 && weightIndex >= 0) {
    return { dateIndex, weightIndex, autoDetected: true };
  }
  return null;
}

// --- Parsing de valores ---

/**
 * Tenta parsear uma string de data em vários formatos comuns.
 * Retorna YYYY-MM-DD ou null.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO: 2024-01-15 ou 2024-01-15T10:30:00
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return toIso(Number(y), Number(m), Number(d));
  }

  // BR: 15/01/2024 ou 15-01-2024
  const brMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return toIso(Number(y), Number(m), Number(d));
  }

  // US: 01/15/2024 — ambíguo com BR, mas se mês > 12 sabemos que é dia
  // Não tentamos desambiguar aqui — o formato BR acima pega primeiro.

  // Mon DD, YYYY ou DD Mon YYYY (inglês)
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const engMatch = s.match(
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[,\s]+(\d{4})/i
  );
  if (engMatch) {
    const [, d, mon, y] = engMatch;
    return toIso(Number(y), months[mon.toLowerCase().slice(0, 3)], Number(d));
  }
  const engMatch2 = s.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})[,\s]+(\d{4})/i
  );
  if (engMatch2) {
    const [, mon, d, y] = engMatch2;
    return toIso(Number(y), months[mon.toLowerCase().slice(0, 3)], Number(d));
  }

  return null;
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parseia peso de uma string. Aceita vírgula ou ponto como decimal.
 * Retorna número ou null.
 */
export function parseWeight(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n >= 500) return null;
  return n;
}

// --- Validação de linhas ---

export interface ImportRow {
  date: string; // YYYY-MM-DD
  weight: number;
  originalLine: number; // 1-indexed (header = 0)
}

export interface ImportError {
  line: number; // 1-indexed
  reason: string;
}

export interface ImportParseResult {
  valid: ImportRow[];
  errors: ImportError[];
  duplicatesInFile: number; // linhas com data repetida dentro do próprio CSV
}

export function validateRows(
  rows: string[][],
  dateIndex: number,
  weightIndex: number
): ImportParseResult {
  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seenDates = new Set<string>();
  let duplicatesInFile = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2; // +1 for 0-index, +1 for header

    const rawDate = row[dateIndex] ?? "";
    const rawWeight = row[weightIndex] ?? "";

    const date = parseDate(rawDate);
    if (!date) {
      errors.push({ line: lineNum, reason: `Data inválida: "${rawDate}"` });
      continue;
    }

    const weight = parseWeight(rawWeight);
    if (weight === null) {
      errors.push({ line: lineNum, reason: `Peso inválido: "${rawWeight}"` });
      continue;
    }

    if (seenDates.has(date)) {
      duplicatesInFile++;
      continue; // mantém o primeiro do CSV
    }
    seenDates.add(date);

    valid.push({ date, weight, originalLine: lineNum });
  }

  return { valid, errors, duplicatesInFile };
}
```

### 2. Arquivo novo: `src/components/import/CsvImporter.tsx`

Componente client principal da tela de importação. Fluxo:
upload → parse → preview/mapear colunas → confirmar → salvar → resultado.

```tsx
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
              ? "border-accent bg-accent/5"
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
            como "Health Data Export" ou "Health Auto Export" fazem isso.
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
```

### 3. Arquivo novo: `src/app/(app)/dashboard/import/page.tsx`

Página da rota `/dashboard/import`. Server Component que carrega os dados do
usuário e renderiza o `CsvImporter`.

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import NavBar from "@/components/NavBar";
import CsvImporter from "@/components/import/CsvImporter";

export default async function ImportPage() {
  const { user, profile } = await loadUserData();
  const theme = await getTheme();

  return (
    <div>
      <NavBar displayName={profile.display_name} theme={theme} />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
            Importar dados
          </p>
          <h1 className="font-display font-bold text-2xl">Importar CSV</h1>
          <p className="text-sm text-ink-muted mt-2">
            Importe pesagens de outro app ou planilha. O arquivo precisa ter pelo
            menos uma coluna de data e uma de peso.
          </p>
        </div>
        <CsvImporter userId={user.id} />
      </main>
    </div>
  );
}
```

### 4. Patch: `src/app/(app)/dashboard/entries/page.tsx`

Adicionar link para a tela de importação, ao lado dos botões de exportação.

**Substituir este trecho:**

```tsx
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
            {entries.length > 0 && <ExportButtons />}
          </div>
```

**Por:**

```tsx
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
            <div className="flex items-center gap-2">
              <a
                href="/dashboard/import"
                className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
              >
                Importar CSV
              </a>
              {entries.length > 0 && <ExportButtons />}
            </div>
          </div>
```

**Atenção:** o `<a>` é intencional (não `Link`) — mesma decisão do projeto para
links que não se beneficiam de prefetching do next/link, e mantém consistência
com o `ExportButtons`.

---

## Ordem de execução

1. Criar `src/lib/csv-parser.ts` (seção 1)
2. Criar `src/components/import/CsvImporter.tsx` (seção 2)
3. Criar `src/app/(app)/dashboard/import/page.tsx` (seção 3)
4. Aplicar patch em `entries/page.tsx` (seção 4)
5. `npx tsc --noEmit` e `npm run build`
6. Testar

---

## Checklist de validação

- [ ] `npx tsc --noEmit` e `npm run build` limpos
- [ ] Upload de CSV com `,` como delimitador e `.` como decimal → detecta colunas,
      mostra prévia, importa
- [ ] Upload de CSV com `;` como delimitador e `,` como decimal (formato Excel pt-BR)
      → funciona igual
- [ ] Upload de CSV do Peso em Progresso (exportado por `/api/export/csv`) → detecta
      "Data" e "Peso (kg)" como colunas, importa com `source='import'`
- [ ] CSV sem header reconhecível → mostra dropdowns de seleção manual de colunas
- [ ] CSV com datas em formato BR (`15/01/2024`) → parseia corretamente
- [ ] CSV com datas em formato ISO (`2024-01-15`) → parseia corretamente
- [ ] Importar quando já existem pesagens manuais na mesma data → as manuais
      permanecem intocadas, o relatório mostra quantas foram ignoradas
- [ ] Re-importar o mesmo CSV → 0 inserções, todas ignoradas como existentes
- [ ] CSV com mais de 500 linhas → aviso + truncamento
- [ ] Arquivo vazio → mensagem de erro
- [ ] Arquivo .xlsx ou .pdf → mensagem "formato não suportado"
- [ ] Pesagens importadas aparecem no histórico com label "Importado" na coluna
      de origem (via `EntriesList`, que já lê `source`)
- [ ] Pesagens importadas aparecem no gráfico (`WeightChart`) e nos KPIs
      (`computePeriodKpi`) normalmente — sem mudança de código necessária, já
      que `loadUserData` carrega todas as `weight_entries` sem filtrar por source
- [ ] Link "Importar CSV" visível na página de entries
- [ ] Tela funciona nos dois temas (dark/light)

---

## O que NÃO está incluído

- Importação de dados de composição corporal (% gordura, massa magra) — isso é
  Fase 2.2 (medidas corporais, tabela `body_measurements`).
- Importação por URL ou API — só upload de arquivo local.
- Edição ou exclusão individual de pesagens importadas — o `EntriesList.handleDelete`
  já funciona pra qualquer `source`, não precisa de mudança.
- Validação server-side do CSV — tudo roda no client. O Supabase tem as constraints
  (`weight_kg > 0 AND weight_kg < 500`, unique `user_id, measured_at`) que servem
  como última barreira.

---

## Depois de validar

Marcar em `claude_fases.md`:

```
- [x] Importação de CSV do Fitdays (`source='import'` já existe no schema)
```

Adicionar ao `CLAUDE.md`, seção "Decisões importantes":

```
15. **Importação CSV é client-side** — o arquivo é lido com FileReader, parseado
    com parser puro (`src/lib/csv-parser.ts`), preview mostrado antes de salvar,
    e persistido via `supabase.from("weight_entries").insert()` em lotes de 50.
    Sem dependência nova. Aceita delimitadores `,` e `;` (auto-detectado),
    decimais com `,` ou `.`, datas em ISO/BR/EN. Colunas detectadas por heurística
    no header com fallback para seleção manual. Não sobrescreve pesagens manuais
    existentes (insert, não upsert). Limite de 500 linhas por upload.
    Fitdays não tem exportação CSV nativa — o usuário exporta via Apple Saúde ou
    Google Fit. A tela é genérica ("Importar CSV"), não específica do Fitdays.
```

Atualizar `src/types/database.ts` **somente se** o type `WeightEntry.source` precisar
de novo valor — hoje já aceita `"manual" | "import"`, então não precisa de mudança.
