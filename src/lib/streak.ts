import { subDays, parseISO } from "date-fns";
import type { WeightEntry } from "@/types/database";

export type StreakResult = {
  currentStreak: number;
  bestStreak: number;
  isActiveToday: boolean;
  last7Days: { date: string; hasEntry: boolean }[];
};

const SP_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Data de hoje em "YYYY-MM-DD" no fuso de referência do produto
 * (America/Sao_Paulo) — evita off-by-one em servidores Vercel (UTC).
 * Locale "en-CA" retorna direto no formato YYYY-MM-DD.
 */
function todayInSaoPaulo(reference: Date): string {
  return SP_FMT.format(reference);
}

/**
 * `dateStr` (YYYY-MM-DD) menos `days` dias, como string YYYY-MM-DD.
 * Usa o mesmo fuso (America/Sao_Paulo) que `todayInSaoPaulo` — nunca
 * `.toISOString()` (que seria UTC e causaria off-by-one perto da meia-noite).
 */
function daysBefore(dateStr: string, days: number): string {
  return SP_FMT.format(subDays(parseISO(dateStr), days));
}

export function computeStreak(entries: WeightEntry[], reference: Date = new Date()): StreakResult {
  const days = new Set(entries.map((e) => e.measured_at));
  const today = todayInSaoPaulo(reference);
  const isActiveToday = days.has(today);

  // --- Sequência atual (com 1 dia de tolerância, ver 1.2) ---
  let cursor = isActiveToday ? today : daysBefore(today, 1);
  let currentStreak = 0;
  if (days.has(cursor)) {
    while (days.has(cursor)) {
      currentStreak++;
      cursor = daysBefore(cursor, 1);
    }
  }

  // --- Melhor sequência histórica ---
  const sortedDays = [...days].sort();
  let bestStreak = 0;
  let run = 0;
  let prevDay: string | null = null;
  for (const day of sortedDays) {
    run = prevDay && daysBefore(day, 1) === prevDay ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prevDay = day;
  }
  bestStreak = Math.max(bestStreak, currentStreak); // sequência em andamento pode já ser a maior

  // --- Últimos 7 dias (hoje incluso, mais antigo primeiro) ---
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = daysBefore(today, 6 - i);
    return { date, hasEntry: days.has(date) };
  });

  return { currentStreak, bestStreak, isActiveToday, last7Days };
}
