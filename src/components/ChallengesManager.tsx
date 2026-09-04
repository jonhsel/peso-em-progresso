"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CHALLENGE_TEMPLATES,
  evaluateChallenge,
  type ChallengeTemplate,
} from "@/lib/challenges";
import { extractMetricPoints, METRIC_LABEL, METRIC_UNIT } from "@/lib/analytics";
import type {
  Challenge,
  ChallengeType,
  GoalMetric,
  WeightEntry,
  BodyMeasurement,
} from "@/types/database";

const METRIC_OPTIONS: GoalMetric[] = ["weight", "waist", "hip", "arm", "body_fat"];

export default function ChallengesManager({
  userId,
  active,
  history,
  entries,
  measurements,
}: {
  userId: string;
  active: Challenge[];
  history: Challenge[];
  entries: WeightEntry[];
  measurements: BodyMeasurement[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"template" | "custom">("template");

  // Custom fields
  const [customType, setCustomType] = useState<ChallengeType>("progress");
  const [customMetric, setCustomMetric] = useState<GoalMetric>("weight");
  const [customTarget, setCustomTarget] = useState("");
  const [customDays, setCustomDays] = useState("");

  const canAdd = active.length < 3;

  function getBaseline(metric: GoalMetric): number | null {
    const points = extractMetricPoints(metric, entries, measurements);
    return points.at(-1)?.weight ?? null;
  }

  function addDaysToToday(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  }

  async function handleTemplateSelect(tpl: ChallengeTemplate) {
    if (!canAdd) return;
    setError(null);

    if (tpl.type === "progress" && tpl.metric) {
      const bl = getBaseline(tpl.metric);
      if (bl == null) {
        setError(`Registre ao menos uma medição de ${METRIC_LABEL[tpl.metric]} antes de criar esse desafio.`);
        return;
      }
      await insertChallenge({
        type: tpl.type,
        metric: tpl.metric,
        template_key: tpl.key,
        label: tpl.label,
        target_value: tpl.targetValue,
        baseline_value: bl,
        end_date: addDaysToToday(tpl.durationDays),
      });
    } else {
      await insertChallenge({
        type: tpl.type,
        metric: null,
        template_key: tpl.key,
        label: tpl.label,
        target_value: tpl.targetValue,
        baseline_value: null,
        end_date: addDaysToToday(tpl.durationDays),
      });
    }
  }

  async function handleCustomSubmit() {
    if (!canAdd) return;
    setError(null);

    const target = Number(customTarget);
    const days = Number(customDays);
    if (!target || target <= 0 || !days || days <= 0) {
      setError("Valor e duração devem ser maiores que zero.");
      return;
    }

    if (customType === "progress") {
      const bl = getBaseline(customMetric);
      if (bl == null) {
        setError(`Registre ao menos uma medição de ${METRIC_LABEL[customMetric]} antes de criar esse desafio.`);
        return;
      }
      const label = `Reduza ${target} ${METRIC_UNIT[customMetric]} de ${METRIC_LABEL[customMetric].toLowerCase()} em ${days} dias`;
      await insertChallenge({
        type: "progress",
        metric: customMetric,
        label,
        target_value: target,
        baseline_value: bl,
        end_date: addDaysToToday(days),
      });
    } else {
      const label = `Registre ${target} dias seguidos`;
      await insertChallenge({
        type: "habit",
        metric: null,
        label,
        target_value: target,
        baseline_value: null,
        end_date: addDaysToToday(target), // janela = exatamente target dias
      });
    }
  }

  async function insertChallenge(fields: {
    type: ChallengeType;
    metric: GoalMetric | null;
    template_key?: string;
    label: string;
    target_value: number;
    baseline_value: number | null;
    end_date: string;
  }) {
    setSaving(true);
    const supabase = createClient();
    const { error: supaError } = await supabase.from("challenges").insert({
      user_id: userId,
      ...fields,
    });
    setSaving(false);
    if (supaError) {
      setError("Não foi possível criar o desafio (talvez o limite de 3 ativos já tenha sido atingido).");
      return;
    }
    setCustomTarget("");
    setCustomDays("");
    router.refresh();
  }

  // Avaliações dos ativos (mesma lógica de ChallengesCard, pra mostrar
  // progresso detalhado na página dedicada).
  const activeEvals = active.map((c) => evaluateChallenge(c, entries, measurements));

  return (
    <div className="space-y-6">
      {/* Desafios ativos */}
      {activeEvals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Ativos</p>
          {activeEvals.map((e) => (
            <div key={e.challenge.id} className="rounded-card border border-base-border bg-base-surface px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink font-medium">{e.challenge.label}</span>
                <span className="text-ink-muted">{e.daysRemaining > 0 ? `${e.daysRemaining} dias restantes` : "último dia"}</span>
              </div>
              <div className="h-2 rounded-full bg-base-surface2 overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${e.progressPct}%` }} />
              </div>
              <p className="text-xs text-ink-faint">
                {e.challenge.type === "progress"
                  ? `Atual: ${e.currentValue?.toFixed(1) ?? "—"} ${METRIC_UNIT[e.challenge.metric!]} · Baseline: ${e.challenge.baseline_value?.toFixed(1)} · Meta: reduzir ${e.challenge.target_value}`
                  : `${e.currentValue ?? 0} de ${e.challenge.target_value} dias consecutivos`}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Criar novo */}
      {canAdd ? (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Novo desafio</p>

          {/* Toggle template / custom */}
          <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setMode("template")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === "template" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                mode === "custom" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
              }`}
            >
              Customizado
            </button>
          </div>

          {mode === "template" ? (
            <div className="space-y-2">
              {CHALLENGE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  disabled={saving}
                  onClick={() => handleTemplateSelect(tpl)}
                  className="w-full text-left rounded-card border border-base-border bg-base-surface px-4 py-3 text-sm text-ink hover:border-ink-faint transition disabled:opacity-50"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Tipo */}
              <div className="flex gap-0.5 rounded-lg border border-base-border bg-base-surface2 p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => setCustomType("progress")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    customType === "progress" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
                  }`}
                >
                  Progresso
                </button>
                <button
                  type="button"
                  onClick={() => setCustomType("habit")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    customType === "habit" ? "bg-accent text-base-bg" : "text-ink-faint hover:text-ink-muted"
                  }`}
                >
                  Hábito
                </button>
              </div>

              {/* Métrica (só progresso) */}
              {customType === "progress" && (
                <select
                  value={customMetric}
                  onChange={(e) => setCustomMetric(e.target.value as GoalMetric)}
                  className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m} value={m}>{METRIC_LABEL[m]}</option>
                  ))}
                </select>
              )}

              {/* Valor */}
              <input
                type="number"
                min="0.1"
                step="0.1"
                placeholder={customType === "progress" ? "Valor a reduzir" : "Dias consecutivos"}
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
              />

              {/* Duração (só progresso — hábito usa target como duração) */}
              {customType === "progress" && (
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Duração em dias"
                  value={customDays}
                  onChange={(e) => setCustomDays(e.target.value)}
                  className="w-full rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm text-ink"
                />
              )}

              <button
                type="button"
                disabled={saving}
                onClick={handleCustomSubmit}
                className="rounded-lg bg-accent text-base-bg font-medium px-5 py-2.5 hover:bg-accent-hover transition disabled:opacity-50 text-sm"
              >
                {saving ? "Criando..." : "Criar desafio"}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-[var(--badge-caution-text)]">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-faint">Limite de 3 desafios ativos atingido.</p>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
          {history.map((c) => (
            <div key={c.id} className="rounded-card border border-base-border bg-base-surface px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-ink">{c.label}</p>
                <p className="text-xs text-ink-faint">
                  {c.start_date} → {c.end_date}
                </p>
              </div>
              <span className={`text-xs font-medium ${
                c.status === "completed" ? "text-signal-ahead" : "text-signal-behind"
              }`}>
                {c.status === "completed" ? "Concluído" : "Falhou"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
