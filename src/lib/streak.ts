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
 * Locale "en-CA" retorna direto no formato YYYY-MM-DD. Esta é a ÚNICA
 * conversão de fuso deste arquivo, porque é a única operação que parte de
 * um instante real (`new Date()`) — precisa saber "que dia é hoje em SP".
 */
function todayInSaoPaulo(reference: Date): string {
  return SP_FMT.format(reference);
}

/**
 * `dateStr` (YYYY-MM-DD) menos `days` dias, como string YYYY-MM-DD.
 *
 * Bug corrigido: a versão anterior fazia `SP_FMT.format(subDays(parseISO(dateStr), days))`.
 * `parseISO` interpreta uma string sem hora como meia-noite no fuso *local
 * do processo Node* (em geral UTC num servidor) — não em São Paulo. Formatar
 * esse resultado em `America/Sao_Paulo` (UTC-3) então subtrai um dia
 * *extra*: meia-noite UTC vira 21h do dia anterior em SP, então cada
 * chamada andava 2 dias para trás em vez de 1 (streak de 6 dias corridos
 * era reportado como 4).
 *
 * `dateStr` é uma data-calendário pura (sem hora), não um instante — não
 * existe fuso horário "certo" pra converter aqui. A forma correta é
 * aritmética em UTC puro sobre os componentes Y/M/D, sem nenhuma conversão
 * de fuso (SP só entra em `todayInSaoPaulo`, que parte de um instante real).
 */
function daysBefore(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
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
