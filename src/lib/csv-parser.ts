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
  const text = raw.replace(/^﻿/, "");

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
