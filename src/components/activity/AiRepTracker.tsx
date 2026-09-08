"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ActivityType } from "@/types/database";
import type { ExerciseType, TrackingCallbacks } from "@/lib/pose-tracking";

// Import dinâmico — evita bundlar pose-tracking em outras páginas.
// Também garante que não tenta importar no server (navigator/canvas).
const loadTracker = () => import("@/lib/pose-tracking");

type Phase = "select" | "loading" | "tracking" | "done" | "error";

const EXERCISE_OPTIONS: { value: ExerciseType; label: string; typeName: string }[] = [
  { value: "pushup", label: "Flexão", typeName: "Flexão" },
  { value: "squat", label: "Agachamento", typeName: "Agachamento" },
];

export default function AiRepTracker({
  userId,
  activityTypes,
}: {
  userId: string;
  activityTypes: ActivityType[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [phase, setPhase] = useState<Phase>("select");
  const [exercise, setExercise] = useState<ExerciseType>("pushup");
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<InstanceType<
    Awaited<ReturnType<typeof loadTracker>>["RepTracker"]
  > | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTracking() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    trackerRef.current?.destroy();
    trackerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  const startTracking = useCallback(async () => {
    setPhase("loading");
    setRepCount(0);
    setFeedback(null);
    setErrorMsg(null);

    try {
      // 1. Pedir câmera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      if (!videoRef.current) throw new Error("Video ref missing");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // 2. Carregar pose tracker
      const { RepTracker, drawSkeleton } = await loadTracker();

      const callbacks: TrackingCallbacks = {
        onRepCount: (n) => setRepCount(n),
        onPostureFeedback: (msg) => setFeedback(msg),
        onLandmarks: (landmarks) => {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          if (!canvas || !video) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
        },
      };

      const tracker = new RepTracker(exercise, callbacks);
      await tracker.init();
      tracker.start();
      trackerRef.current = tracker;

      setPhase("tracking");

      // 3. Loop de frames
      const video = videoRef.current;
      function tick() {
        if (!video || video.paused || video.ended) return;
        trackerRef.current?.processFrame(video, performance.now());
        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error("AI Tracker init error:", err);
      stopTracking();
      setPhase("error");
      setErrorMsg(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permissão de câmera negada. Habilite nas configurações do navegador."
          : "Não foi possível iniciar o rastreamento. Tente outro navegador ou use o registro manual."
      );
    }
  }, [exercise]);

  async function handleFinish() {
    if (!trackerRef.current) return;

    const reps = trackerRef.current.getCount();
    const minutes = trackerRef.current.getElapsedMinutes();
    stopTracking();

    if (reps === 0) {
      setPhase("select");
      setFeedback(null);
      return;
    }

    setSaving(true);
    setPhase("done");

    // Resolver/criar activity_type
    const option = EXERCISE_OPTIONS.find((o) => o.value === exercise)!;
    let typeId: string | null = null;

    const existing = activityTypes.find(
      (t) => t.name.trim().toLowerCase() === option.typeName.toLowerCase()
    );
    if (existing) {
      typeId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("activity_types")
        .insert({ user_id: userId, name: option.typeName, track_distance: false })
        .select("id")
        .single();
      if (error || !data) {
        setErrorMsg("Não foi possível criar o tipo de atividade.");
        setSaving(false);
        return;
      }
      typeId = data.id;
    }

    // Inserir sessão
    const { error: insertError } = await supabase
      .from("activity_sessions")
      .insert({
        user_id: userId,
        activity_type_id: typeId,
        duration_minutes: minutes,
        performed_at: new Date().toISOString(),
        source: "ai_tracked",
        reps_count: reps,
        note: `${option.label} rastreada por IA`,
      });

    setSaving(false);

    if (insertError) {
      setErrorMsg("Não foi possível salvar a sessão.");
      return;
    }

    router.refresh();
  }

  // ─── Render ─────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="rounded-card border border-base-border bg-base-surface p-6 text-center space-y-4">
        <p className="text-sm text-signal-behind">{errorMsg}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setPhase("select")}
            className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink-muted hover:text-ink transition"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => router.push("/dashboard/activity")}
            className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
          >
            Registro manual
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-card border border-base-border bg-base-surface p-6 text-center space-y-3">
        {saving ? (
          <p className="text-sm text-ink-muted">Salvando sessão…</p>
        ) : errorMsg ? (
          <>
            <p className="text-sm text-signal-behind">{errorMsg}</p>
            <button
              onClick={() => setPhase("select")}
              className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink-muted hover:text-ink transition"
            >
              Voltar
            </button>
          </>
        ) : (
          <>
            <p className="text-xl font-display font-bold text-accent">{repCount} reps</p>
            <p className="text-sm text-ink-muted">Sessão salva com sucesso!</p>
            <button
              onClick={() => { setPhase("select"); setRepCount(0); }}
              className="rounded-lg bg-accent text-base-bg font-medium px-4 py-2 text-sm hover:bg-accent-hover transition"
            >
              Novo treino
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Seletor de exercício (visível em select e loading) */}
      {(phase === "select" || phase === "loading") && (
        <div className="rounded-card border border-base-border bg-base-surface p-4 space-y-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Rastrear com IA
          </p>
          <div className="flex gap-3">
            {EXERCISE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExercise(opt.value)}
                disabled={phase === "loading"}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  exercise === opt.value
                    ? "border-accent bg-accent text-base-bg"
                    : "border-base-border text-ink-muted hover:border-ink-faint"
                } disabled:opacity-60`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={startTracking}
            disabled={phase === "loading"}
            className="w-full rounded-lg bg-accent text-base-bg font-medium px-4 py-2.5 text-sm hover:bg-accent-hover transition disabled:opacity-60"
          >
            {phase === "loading" ? "Carregando modelo…" : "Iniciar rastreamento"}
          </button>
        </div>
      )}

      {/* Tela de treino */}
      {(phase === "tracking" || phase === "loading") && (
        <div className="relative rounded-card overflow-hidden border border-base-border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ transform: "scaleX(-1)" }}
          />

          {/* Contador */}
          {phase === "tracking" && (
            <>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 rounded-2xl px-6 py-3 text-center">
                <p className="text-xs uppercase tracking-wide text-white/60">Contagem</p>
                <p className="text-4xl font-display font-bold text-white tabular-nums">
                  {repCount}
                </p>
              </div>

              {/* Feedback de postura */}
              {feedback && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-signal-behind/90 rounded-xl px-4 py-2">
                  <p className="text-sm font-medium text-white">{feedback}</p>
                </div>
              )}

              {/* Botão encerrar */}
              <button
                onClick={handleFinish}
                className="absolute top-4 right-4 rounded-lg bg-black/60 border border-white/20 px-3 py-1.5 text-xs text-white font-medium hover:bg-black/80 transition"
              >
                Encerrar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
