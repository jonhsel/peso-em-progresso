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

const VISIBILITY_THRESHOLD = 0.6;

function landmarksVisible(
  landmarks: NormalizedLandmark[],
  indices: number[]
): boolean {
  return indices.every((i) => {
    const lm = landmarks[i];
    return lm && (lm.visibility ?? 0) >= VISIBILITY_THRESHOLD;
  });
}

// Retorna null quando as articulações relevantes não estão
// suficientemente visíveis no quadro (evita ângulo calculado com
// coordenadas "chutadas" pelo modelo para partes ocluídas/fora de vista).
function getRelevantAngle(
  exercise: ExerciseType,
  landmarks: NormalizedLandmark[]
): number | null {
  if (exercise === "pushup") {
    const required = [
      LM.LEFT_SHOULDER,
      LM.LEFT_ELBOW,
      LM.LEFT_WRIST,
      LM.RIGHT_SHOULDER,
      LM.RIGHT_ELBOW,
      LM.RIGHT_WRIST,
    ];
    if (!landmarksVisible(landmarks, required)) return null;

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
  const required = [
    LM.LEFT_HIP,
    LM.LEFT_KNEE,
    LM.LEFT_ANKLE,
    LM.RIGHT_HIP,
    LM.RIGHT_KNEE,
    LM.RIGHT_ANKLE,
  ];
  if (!landmarksVisible(landmarks, required)) return null;

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
  // Tempo mínimo entre duas reps contadas, em ms. Protege contra
  // ruído de frame a frame que cruza o limiar rápido demais pra
  // ser um movimento humano real.
  private static readonly MIN_MS_BETWEEN_REPS = 500;
  private lastRepAt = 0;

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
    this.lastRepAt = 0;
  }

  processFrame(video: HTMLVideoElement, timestamp: number): void {
    if (!this.landmarker) return;
    const result = this.landmarker.detectForVideo(video, timestamp);
    if (!result.landmarks || result.landmarks.length === 0) {
      this.callbacks.onPostureFeedback("Corpo não detectado — ajuste a câmera");
      return;
    }

    const landmarks = result.landmarks[0];
    this.callbacks.onLandmarks(landmarks);

    const angle = getRelevantAngle(this.exercise, landmarks);
    if (angle === null) {
      this.callbacks.onPostureFeedback(
        this.exercise === "pushup"
          ? "Enquadre ombros, cotovelos e pulsos na câmera"
          : "Enquadre quadril, joelhos e tornozelos na câmera"
      );
      return;
    }

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
        const now = Date.now();
        const enoughTimePassed = now - this.lastRepAt >= RepTracker.MIN_MS_BETWEEN_REPS;
        if (this.minAngleInDown <= thresholds.depthAngle && enoughTimePassed) {
          this.count++;
          this.lastRepAt = now;
          this.callbacks.onRepCount(this.count);
          this.callbacks.onPostureFeedback(null);
        } else if (this.minAngleInDown > thresholds.depthAngle) {
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
