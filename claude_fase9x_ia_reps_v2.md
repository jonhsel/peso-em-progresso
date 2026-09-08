# Fase 9.x — Contagem de Repetições por IA (v2, auditada)

**Status:** v2. Auditada contra o código real via `project_knowledge_search`
(`database.ts`, `activity.ts`, `loadUserData.ts`, `ActivitySessionForm.tsx`,
`ActivityWeekCard.tsx`, `ActivityTeaserCard.tsx`, `ActivityPage`,
`Sidebar.tsx`, `PlanGate.tsx`, `next.config.js`, `package.json`,
`schema.sql` seção `activity_sessions`). Todos os achados da auditoria v1
(Apêndice A) incorporados. Pronta para handoff ao Claude Code.

Extensão **aditiva** à Fase 9 (Atividade Física, já em produção com
`activity_types`/`activity_sessions`/`activity_goals`, migração `0015`).
Não substitui o registro manual — é uma segunda forma de preencher a
mesma tabela `activity_sessions`.

---

## Contexto

A Fase 9 hoje só registra atividade por formulário manual (duração em
minutos). Esta fase adiciona um modo de **contagem automática de
repetições via câmera**, usando visão computacional client-side (sem
enviar vídeo pra servidor). MVP cobre dois exercícios: **flexão** e
**agachamento**.

Ao final do treino rastreado, uma linha em `activity_sessions` é criada
automaticamente — mesma tabela do fluxo manual, com `source` e
`reps_count` novos indicando que veio da IA.

## Decisões fechadas

1. **Escopo:** expande a Fase 9, não é fase separada.
2. **Exercícios no MVP:** flexão + agachamento.
3. **Onde roda:** navegador (mobile web), câmera do celular apontada pro
   usuário — sem app nativo.
4. **Relação com `activity_sessions`:** a sessão nasce automaticamente ao
   terminar o treino rastreado (usuário não digita duração nem reps à mão).
5. **Feedback durante o treino:** número de reps + aviso de postura
   incorreta (ex.: "desça mais").
6. **Prioridade:** aditiva/opcional — o registro manual continua existindo
   sem mudanças; IA é um caminho alternativo pro mesmo dado.
7. **Biblioteca:** `@mediapipe/tasks-vision` — `PoseLandmarker` API,
   WASM carregado em runtime via `FilesetResolver.forVisionTasks()` do CDN
   `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm`.
   Roda 100% client-side, sem custo de API, sem enviar vídeo, sem
   alteração em `next.config.js` (WASM não é bundled pelo webpack).
8. **Mapeamento pra `activity_types`:** ao encerrar treino, busca
   `activity_types` do usuário por nome case-insensitive (`"Flexão"` /
   `"Agachamento"`). Se não existir, cria automaticamente com
   `track_distance: false`.
9. **Gate:** herda o `PlanGate` já existente da Fase 9 — Pro-only, sem
   gate adicional.
10. **Câmera:** `facingMode: "user"` (câmera frontal) — o aparelho fica
    apoiado de frente pro usuário.
11. **Overlay visual:** esqueleto simplificado sobre o vídeo (linhas
    ombro-cotovelo-pulso / quadril-joelho-tornozelo).
12. **Critério de repetição válida:** máquina de estados com histerese.
    Limiares iniciais:
    - Flexão: topo > 150°, profundidade válida < 95° (ângulo do cotovelo).
    - Agachamento: topo > 160°, profundidade válida < 100° (ângulo do joelho).
    Se o usuário sobe antes de atingir o limiar de profundidade, a rep
    **não conta** e aparece aviso "Desça mais" (flexão) / "Agache mais"
    (agachamento).

## Fora de escopo (explícito)

- Outros exercícios além de flexão/agachamento.
- Correção de forma além da profundidade (não valida coluna, pés, etc.).
- Gravação/upload de vídeo — nada de imagem sai do dispositivo.
- Múltiplas pessoas no quadro — assume 1 pessoa.
- Integração com Conquistas/Streak.
- Suporte a navegadores sem WASM/câmera — fallback visível pra registro
  manual.
- Contagem de séries (sets) — MVP é 1 sessão contínua = 1 registro.
- Wake Lock API (impedir tela de apagar) — desejável mas fora do MVP;
  pode ser adicionado como hotfix se necessário.
- Modo paisagem forçado — o componente renderiza em qualquer orientação;
  o vídeo se ajusta via `object-fit: cover`.

---

## 1. Migração — `supabase/migrations/0016_activity_ai_tracking.sql`

**Confirmado:** `0015_activity.sql` é a última migração existente (verificado
via `project_knowledge_search` + `schema.sql` seção 13).

**Rodar como bloco único no SQL Editor do Supabase Dashboard.**

```sql
-- Fase 9.x — Contagem de repetições por IA
-- Colunas novas em activity_sessions: source (manual vs ai_tracked)
-- e reps_count (nº de repetições contadas pela IA).
-- Sessões existentes (criadas antes desta migração) recebem
-- source = 'manual' automaticamente via DEFAULT.

alter table public.activity_sessions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'ai_tracked')),
  add column if not exists reps_count integer
    check (reps_count is null or reps_count > 0);
```

Sem RLS nova — `activity_sessions` já tem policies por `user_id`.
Sem mudança em `schema.sql` (atualizar junto com o CLAUDE.md no final).

---

## 2. Tipos — `src/types/database.ts`

### 2.1 Tipo `ActivitySession` — 2 campos novos

```
OLD:
export type ActivitySession = {
  id: string;
  user_id: string;
  activity_type_id: string;
  performed_at: string; // ISO datetime
  duration_minutes: number;
  distance_km: number | null;
  note: string | null;
  created_at: string;
};

NEW:
export type ActivitySession = {
  id: string;
  user_id: string;
  activity_type_id: string;
  performed_at: string; // ISO datetime
  duration_minutes: number;
  distance_km: number | null;
  note: string | null;
  source: "manual" | "ai_tracked";
  reps_count: number | null;
  created_at: string;
};
```

### 2.2 `Database["public"]["Tables"]["activity_sessions"]` — Insert não muda

O `Insert` atual é `Partial<ActivitySession> & { user_id; activity_type_id;
duration_minutes }`. Como `source` tem `DEFAULT 'manual'` no banco e
`reps_count` é nullable, nenhum insert existente quebra — ambos os campos
são opcionais na inserção. **Sem diff aqui.**

---

## 3. Impacto em `ActivitySessionForm.tsx` — NENHUM

O formulário manual faz `insert({ user_id, activity_type_id,
duration_minutes, distance_km, performed_at, note })` — não passa `source`
nem `reps_count`. O `DEFAULT 'manual'` no banco garante `source = 'manual'`
e `reps_count = null` automaticamente. **Sem mudança no arquivo.**

---

## 4. `src/lib/activity.ts` — tipo `ActivityWeeklyKpi` ganha `totalReps`

Para que o `ActivityWeekCard` e o `ActivityTeaserCard` exibam o total de
reps da semana quando houver sessões rastreadas por IA.

### 4.1 Tipo — 1 campo novo

```
OLD:
export type ActivityWeeklyKpi = {
  activityTypeId: string;
  activityTypeName: string;
  trackDistance: boolean;
  actualMinutes: number;
  totalDistanceKm: number | null;
  targetMinutes: number | null; // null = sem meta ativa pra esse tipo
  progressPct: number | null;
  sessionsCount: number;
};

NEW:
export type ActivityWeeklyKpi = {
  activityTypeId: string;
  activityTypeName: string;
  trackDistance: boolean;
  actualMinutes: number;
  totalDistanceKm: number | null;
  totalReps: number | null; // soma de reps_count das sessões ai_tracked desta semana
  targetMinutes: number | null; // null = sem meta ativa pra esse tipo
  progressPct: number | null;
  sessionsCount: number;
};
```

### 4.2 `computeActivityWeeklyKpis` — calcular `totalReps`

Inserir depois do cálculo de `totalDistanceKm`, antes de `const goal`:

```
OLD:
    const totalDistanceKm = type.track_distance
      ? typeSessions.reduce(
          (sum, s) => sum + (s.distance_km ? Number(s.distance_km) : 0),
          0
        )
      : null;
    const goal = goals.find(

NEW:
    const totalDistanceKm = type.track_distance
      ? typeSessions.reduce(
          (sum, s) => sum + (s.distance_km ? Number(s.distance_km) : 0),
          0
        )
      : null;
    const aiSessions = typeSessions.filter((s) => s.source === "ai_tracked" && s.reps_count);
    const totalReps = aiSessions.length > 0
      ? aiSessions.reduce((sum, s) => sum + Number(s.reps_count), 0)
      : null;
    const goal = goals.find(
```

E no `return`:

```
OLD:
    return {
      activityTypeId: type.id,
      activityTypeName: type.name,
      trackDistance: type.track_distance,
      actualMinutes,
      totalDistanceKm,
      targetMinutes,
      progressPct,
      sessionsCount: typeSessions.length,
    };

NEW:
    return {
      activityTypeId: type.id,
      activityTypeName: type.name,
      trackDistance: type.track_distance,
      actualMinutes,
      totalDistanceKm,
      totalReps,
      targetMinutes,
      progressPct,
      sessionsCount: typeSessions.length,
    };
```

---

## 5. `src/components/activity/ActivityWeekCard.tsx` — exibir reps

Após a linha de sessões, adicionar exibição de reps quando existirem:

```
OLD:
      <p className="text-xs text-ink-faint">
        {kpi.sessionsCount} {kpi.sessionsCount === 1 ? "sessão" : "sessões"}
        {kpi.trackDistance && kpi.totalDistanceKm !== null && kpi.totalDistanceKm > 0
          ? ` · ${kpi.totalDistanceKm.toFixed(1).replace(".", ",")} km esta semana`
          : ""}
      </p>

NEW:
      <p className="text-xs text-ink-faint">
        {kpi.sessionsCount} {kpi.sessionsCount === 1 ? "sessão" : "sessões"}
        {kpi.trackDistance && kpi.totalDistanceKm !== null && kpi.totalDistanceKm > 0
          ? ` · ${kpi.totalDistanceKm.toFixed(1).replace(".", ",")} km esta semana`
          : ""}
        {kpi.totalReps !== null && kpi.totalReps > 0
          ? ` · ${kpi.totalReps} reps (IA)`
          : ""}
      </p>
```

---

## 6. `src/components/activity/ActivityTeaserCard.tsx` — exibir reps

No texto de cada item da lista, após minutos:

```
OLD:
              <p className="text-xs text-ink-faint">
                {k.targetMinutes !== null
                  ? `${k.actualMinutes.toFixed(0)}/${k.targetMinutes.toFixed(0)} min`
                  : `${k.actualMinutes.toFixed(0)} min`}
              </p>

NEW:
              <p className="text-xs text-ink-faint">
                {k.targetMinutes !== null
                  ? `${k.actualMinutes.toFixed(0)}/${k.targetMinutes.toFixed(0)} min`
                  : `${k.actualMinutes.toFixed(0)} min`}
                {k.totalReps !== null && k.totalReps > 0 ? ` · ${k.totalReps} reps` : ""}
              </p>
```

---

## 7. `src/lib/pose-tracking.ts` (arquivo novo)

Módulo isolado, não mexe em `activity.ts`. Client-only (usa APIs do
browser: `navigator.mediaDevices`, `requestAnimationFrame`, canvas).

```ts
import {
  PoseLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ─── Tipos ──────────────────────────────────────────────────────────
export type ExerciseType = "pushup" | "squat";
export type RepState = "up" | "down";

export type TrackingCallbacks = {
  onRepCount: (count: number) => void;
  onPostureFeedback: (message: string | null) => void;
  onLandmarks: (landmarks: NormalizedLandmark[]) => void;
};

// ─── Landmarks MediaPipe Pose (índices fixos) ───────────────────────
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

// ─── Limiares (ajustáveis depois de teste real) ─────────────────────
const THRESHOLDS: Record<ExerciseType, { topAngle: number; depthAngle: number }> = {
  pushup: { topAngle: 150, depthAngle: 95 },
  squat: { topAngle: 160, depthAngle: 100 },
};

const FEEDBACK_MESSAGES: Record<ExerciseType, string> = {
  pushup: "Desça mais",
  squat: "Agache mais",
};

// ─── Geometria ──────────────────────────────────────────────────────
export function computeJointAngle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let degrees = Math.abs((radians * 180) / Math.PI);
  if (degrees > 180) degrees = 360 - degrees;
  return degrees;
}

function getRelevantAngle(
  exercise: ExerciseType,
  landmarks: NormalizedLandmark[]
): number {
  if (exercise === "pushup") {
    const leftElbow = computeJointAngle(
      landmarks[LM.LEFT_SHOULDER],
      landmarks[LM.LEFT_ELBOW],
      landmarks[LM.LEFT_WRIST]
    );
    const rightElbow = computeJointAngle(
      landmarks[LM.RIGHT_SHOULDER],
      landmarks[LM.RIGHT_ELBOW],
      landmarks[LM.RIGHT_WRIST]
    );
    return (leftElbow + rightElbow) / 2;
  }
  // squat
  const leftKnee = computeJointAngle(
    landmarks[LM.LEFT_HIP],
    landmarks[LM.LEFT_KNEE],
    landmarks[LM.LEFT_ANKLE]
  );
  const rightKnee = computeJointAngle(
    landmarks[LM.RIGHT_HIP],
    landmarks[LM.RIGHT_KNEE],
    landmarks[LM.RIGHT_ANKLE]
  );
  return (leftKnee + rightKnee) / 2;
}

// ─── Skeleton drawing ───────────────────────────────────────────────
const SKELETON_CONNECTIONS: [number, number][] = [
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
];

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);

  // Linhas
  ctx.strokeStyle = "#22d3ee"; // cyan-400
  ctx.lineWidth = 3;
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const la = landmarks[a];
    const lb = landmarks[b];
    if (!la || !lb) continue;
    ctx.beginPath();
    ctx.moveTo(la.x * width, la.y * height);
    ctx.lineTo(lb.x * width, lb.y * height);
    ctx.stroke();
  }

  // Pontos nas articulações monitoradas
  ctx.fillStyle = "#f43f5e"; // rose-500
  const monitoredIndices = Object.values(LM);
  for (const idx of monitoredIndices) {
    const lm = landmarks[idx];
    if (!lm) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// ─── Tracker class ──────────────────────────────────────────────────
export class RepTracker {
  private exercise: ExerciseType;
  private state: RepState = "up";
  private count = 0;
  private minAngleInDown = 999;
  private landmarker: PoseLandmarker | null = null;
  private animFrameId: number | null = null;
  private startTime: number = 0;
  private callbacks: TrackingCallbacks;

  constructor(exercise: ExerciseType, callbacks: TrackingCallbacks) {
    this.exercise = exercise;
    this.callbacks = callbacks;
  }

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  start(): void {
    this.startTime = Date.now();
    this.count = 0;
    this.state = "up";
    this.minAngleInDown = 999;
  }

  processFrame(video: HTMLVideoElement, timestamp: number): void {
    if (!this.landmarker) return;
    const result = this.landmarker.detectForVideo(video, timestamp);
    if (!result.landmarks || result.landmarks.length === 0) return;

    const landmarks = result.landmarks[0];
    this.callbacks.onLandmarks(landmarks);

    const angle = getRelevantAngle(this.exercise, landmarks);
    const thresholds = THRESHOLDS[this.exercise];

    if (this.state === "up") {
      if (angle < thresholds.topAngle) {
        this.state = "down";
        this.minAngleInDown = angle;
        this.callbacks.onPostureFeedback(null);
      }
    } else {
      // state === "down"
      if (angle < this.minAngleInDown) {
        this.minAngleInDown = angle;
      }
      if (angle > thresholds.topAngle) {
        // subiu de volta
        if (this.minAngleInDown <= thresholds.depthAngle) {
          this.count++;
          this.callbacks.onRepCount(this.count);
          this.callbacks.onPostureFeedback(null);
        } else {
          this.callbacks.onPostureFeedback(FEEDBACK_MESSAGES[this.exercise]);
        }
        this.state = "up";
        this.minAngleInDown = 999;
      }
    }
  }

  getCount(): number {
    return this.count;
  }

  getElapsedMinutes(): number {
    return Math.max(1, Math.ceil((Date.now() - this.startTime) / 60000));
  }

  destroy(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.landmarker?.close();
    this.landmarker = null;
  }
}
```

---

## 8. `src/components/activity/AiRepTracker.tsx` (arquivo novo, client)

`"use client"` — tela de treino com câmera.

```tsx
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
```

**Notas de conformidade com o codebase:**
- `createClient()` de `@/lib/supabase/client` — mesmo padrão de todos os
  componentes client.
- `router.refresh()` após persistir — mesmo padrão de
  `ActivitySessionForm`, `ActivityGoalForm`, `PhotoUploadForm`.
- Tailwind: todas as classes são estáticas (sem interpolação).
- `facingMode: "user"` (câmera frontal). `scaleX(-1)` espelha o vídeo e
  o canvas pra o efeito-espelho natural.
- `playsInline` + `muted` obrigatórios no iOS Safari pra autoplay funcionar.

---

## 9. Nova rota — `src/app/(app)/dashboard/activity/ai/page.tsx`

Server Component fino, mesmo padrão de `dashboard/achievements/page.tsx`.

```tsx
import { loadUserData } from "@/lib/loadUserData";
import { getTheme } from "@/lib/get-theme";
import Sidebar from "@/components/Sidebar";
import PlanGate from "@/components/PlanGate";
import AiRepTracker from "@/components/activity/AiRepTracker";

export const dynamic = "force-dynamic";

export default async function AiTrackingPage() {
  const { user, profile, activeGoals, activityTypes } = await loadUserData();
  const theme = await getTheme();

  return (
    <div className="flex flex-col sm:flex-row min-h-screen">
      <Sidebar
        displayName={profile.display_name}
        theme={theme}
        plan={profile.plan}
        activeGoals={activeGoals}
      />
      <div className="flex-1 overflow-x-hidden">
        <main className="max-w-2xl mx-auto px-4 py-8">
          <PlanGate plan={profile.plan} featureName="Atividade Física">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Rastreamento por IA
              </p>
              <AiRepTracker
                userId={user.id}
                activityTypes={activityTypes}
              />
            </div>
          </PlanGate>
        </main>
      </div>
    </div>
  );
}
```

---

## 10. `src/app/(app)/dashboard/activity/page.tsx` — botão de entrada

Adicionar um link pra rota `/dashboard/activity/ai` entre o header e o
`ActivitySessionForm`.

```
OLD:
              <p className="text-xs uppercase tracking-wide text-ink-muted">
                Atividade Física
              </p>

              <ActivitySessionForm

NEW:
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  Atividade Física
                </p>
                <Link
                  href="/dashboard/activity/ai"
                  className="text-xs font-medium text-accent hover:text-accent-hover transition"
                >
                  Rastrear com IA →
                </Link>
              </div>

              <ActivitySessionForm
```

E no import (topo do arquivo):

```
OLD:
import ActivityWeekCard from "@/components/activity/ActivityWeekCard";

NEW:
import ActivityWeekCard from "@/components/activity/ActivityWeekCard";
import Link from "next/link";
```

---

## 11. Dependência nova

```bash
npm install @mediapipe/tasks-vision
```

Client-side only, carregado apenas em `/dashboard/activity/ai` via import
dinâmico dentro de `AiRepTracker.tsx`. **Não infla o bundle de nenhuma
outra página.**

Sem alteração em `next.config.js` — `@mediapipe/tasks-vision` carrega
WASM e modelo via CDN (`FilesetResolver` + `modelAssetPath`), não precisa
de webpack WASM loader.

---

## 12. `CLAUDE.md` — seção a acrescentar ao final

```markdown
### Fase 9.x — Contagem de Repetições por IA

Extensão da Fase 9 (Atividade Física). Contagem automática de repetições
(flexão/agachamento) via visão computacional client-side
(`@mediapipe/tasks-vision`, `PoseLandmarker`), sem enviar vídeo pra
servidor. 2 colunas novas em `activity_sessions` (migração `0016`):
`source` (`'manual' | 'ai_tracked'`, DEFAULT `'manual'`) e `reps_count`
(integer nullable). Módulo isolado `src/lib/pose-tracking.ts` (máquina
de estados de ângulos articulares, esqueleto desenhado em canvas).
Componente `AiRepTracker.tsx` (client) com import dinâmico pra não inflar
bundle de outras páginas. Rota `/dashboard/activity/ai`, atrás de
`PlanGate`. `ActivityWeeklyKpi` ganhou campo `totalReps` pra exibir
total de reps no card semanal e teaser.
```

---

## Apêndice A — Achados da auditoria v1

| # | Severidade | Achado | Correção aplicada no v2 |
|---|---|---|---|
| A1 | Crítico | v1 não fornecia diffs verbatim `OLD`/`NEW` pra `database.ts`, `activity.ts`, `ActivityWeekCard.tsx`, `ActivityTeaserCard.tsx`, `ActivityPage` — Claude Code não conseguiria aplicar via `str_replace` | Seções 2, 4, 5, 6, 10 agora têm diffs completos |
| A2 | Crítico | `ActivityWeeklyKpi` não incluía `totalReps` — sessões de IA seriam invisíveis nos cards semanais e no teaser do dashboard | Seção 4 adiciona `totalReps` ao tipo e ao cálculo |
| A3 | Médio | v1 dizia "carregar PoseLandmarker do `@mediapipe/tasks-vision`" sem especificar API exata (`FilesetResolver`, CDN path, `modelAssetPath`, `runningMode: "VIDEO"`) — risco de Claude Code escolher API errada ou tentar bundlar WASM | Seção 7 tem código completo do módulo com imports, CDN URL, e configuração |
| A4 | Médio | `ActivitySessionForm.tsx` não seria impactado pela migração (DEFAULT cuida do `source`) mas v1 não afirmava isso explicitamente — risco de Claude Code fazer diff desnecessário | Seção 3 documenta: "sem mudança no arquivo" |
| A5 | Médio | v1 não mencionava `next.config.js` — potencial dúvida sobre necessidade de webpack WASM config | Seção 11 confirma: sem alteração necessária |
| A6 | Médio | v1 não especificava `facingMode`, `playsInline`, `muted`, `scaleX(-1)` — essenciais pra funcionar em iOS Safari e pra experiência espelhada | Seção 8 inclui todos |
| A7 | Médio | v1 não tinha import de `Link` na `ActivityPage` pra o botão "Rastrear com IA" | Seção 10 inclui diff de import |
| A8 | Menor | v1 mencionava "limiar ajustável" sem especificar o padrão de constantes | Seção 7 define `THRESHOLDS` e `FEEDBACK_MESSAGES` como constantes nomeadas |
| A9 | Menor | v1 não tinha seção de `CLAUDE.md` | Seção 12 adicionada |
| A10 | Menor | v1 mencionava "overlay visual" sem código de desenho | Seção 7 tem `drawSkeleton()` e `SKELETON_CONNECTIONS` completos |

---

## Pendências pós-handoff (verificar em dispositivo real)

- [ ] Rodar migração `0016` no SQL Editor (bloco único).
- [ ] Testar em Android Chrome + iOS Safari se FPS é aceitável em
      aparelhos médios (Moto G, iPhone SE). Se não, trocar
      `delegate: "GPU"` por `"CPU"` como fallback.
- [ ] Ajustar limiares de `THRESHOLDS` após testes reais com usuários.
- [ ] `npx tsc --noEmit` + `npm run build` + deploy.
- [ ] Atualizar `schema.sql` seção 13 com as colunas `source` e `reps_count`.
- [ ] Atualizar `claude_fases.md` com checkbox da Fase 9.x.
