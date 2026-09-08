# Hotfix — Contagem falsa de reps sem checagem de visibilidade (Fase 9.x — IA)

**Status:** Pronto para handoff ao Claude Code. Hotfix pontual sobre a Fase
9.x (Contagem de Repetições por IA, `claude_fase9x_ia_reps_v2.md`). Não
altera schema, tipos ou UI — apenas `src/lib/pose-tracking.ts`.

---

## Bug reportado

Em teste real (dispositivo físico, câmera frontal), a contagem de reps
sobe sozinha mesmo com o usuário parado/deitado e sem braços ou pernas
dentro do quadro (apenas rosto/ombros visíveis). Contagem passou de 12
para 49 em menos de um minuto sem nenhum movimento de flexão real.

## Causa raiz

`getRelevantAngle()` em `pose-tracking.ts` nunca verifica o campo
`visibility` dos landmarks antes de calcular o ângulo da articulação. O
`PoseLandmarker` do MediaPipe sempre retorna 33 landmarks por frame,
mesmo para partes do corpo fora do quadro ou ocluídas — ele estima uma
posição via prior do modelo, mas com `visibility` baixo. No caso
reportado (flexão), cotovelo e pulso estavam fora do quadro, então o
ângulo era calculado com coordenadas essencialmente ruidosas, que
cruzavam os limiares (`topAngle`/`depthAngle`) repetidas vezes por
segundo — e cada cruzamento incrementava uma rep.

Dois problemas compostos:

1. **Sem checagem de `visibility`** nos landmarks usados no cálculo do
   ângulo relevante (cotovelos/pulsos para flexão, joelhos/tornozelos
   para agachamento).
2. **Sem tempo mínimo entre reps (debounce)** — mesmo com landmarks
   visíveis, ruído de frame a frame pode cruzar o limiar de forma rápida
   demais pra ser um movimento humano real.

## Correção

- `getRelevantAngle()` passa a retornar `number | null`: `null` quando
  qualquer landmark necessário está abaixo de `VISIBILITY_THRESHOLD =
  0.6`.
- `processFrame()` ignora o frame quando o ângulo é `null` e mostra
  feedback pedindo pra enquadrar o corpo corretamente, em vez de deixar
  a máquina de estados avançar com dado de baixa confiança.
- Debounce de `500ms` entre duas reps contadas (`MIN_MS_BETWEEN_REPS`),
  como segunda camada de proteção contra ruído.
- Feedback adicional quando nenhuma pessoa é detectada no frame
  (`result.landmarks.length === 0`).

## Fora de escopo

- Suavização temporal do ângulo (ex.: média móvel/EMA) — pode ser
  avaliada depois se o debounce + checagem de visibilidade não forem
  suficientes.
- Recalibração dos valores de `THRESHOLDS` — inalterados neste hotfix.
- Mudança de `numPoses`, `delegate` (GPU/CPU) ou modelo do
  `PoseLandmarker`.

---

## Patch — `src/lib/pose-tracking.ts`

### 1. `getRelevantAngle` — checagem de visibilidade

```
OLD:
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

NEW:
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
```

### 2. `RepTracker` — debounce e tratamento de frame sem pessoa/ângulo

```
OLD:
  start(): void {
    this.startTime = Date.now();
    this.count = 0;
    this.state = "up";
    this.minAngleInDown = 999;
  }

NEW:
  // Tempo mínimo entre duas reps contadas, em ms. Protege contra
  // ruído de frame a frame que cruza o limiar rápido demais pra
  // ser um movimento humano real.
  private static readonly MIN_MS_BETWEEN_REPS = 500;
  private lastRepAt = 0;

  start(): void {
    this.startTime = Date.now();
    this.count = 0;
    this.state = "up";
    this.minAngleInDown = 999;
    this.lastRepAt = 0;
  }
```

```
OLD:
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

NEW:
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
```

**Nota de conformidade:** nenhum outro arquivo é afetado. `AiRepTracker.tsx`
consome `RepTracker` apenas via `getCount()`, `start()`, `processFrame()` e
`destroy()` — assinaturas inalteradas. O tipo `TrackingCallbacks` também
não muda.

---

## `CLAUDE.md` — entrada a acrescentar (formato "Hotfix N")

```markdown
**Hotfix N — contagem falsa de reps sem checagem de visibilidade (Fase
9.x, DD/MM/2026).** Spec `claude_fase9x_ia_reps_hotfix_visibility_check.md`
(raiz do repo, não versionado). Bug: `getRelevantAngle()` calculava o
ângulo mesmo quando cotovelos/pulsos (flexão) ou joelhos/tornozelos
(agachamento) estavam fora do quadro — o `PoseLandmarker` retorna uma
estimativa de baixa confiança (`visibility` baixo) em vez de omitir o
landmark, e esse ruído cruzava os limiares repetidamente, contando reps
sem movimento real. Corrigido com checagem de `visibility >= 0.6` nos
landmarks relevantes (retorna `null` e pausa a contagem com feedback de
reenquadramento quando abaixo do limiar) + debounce de 500ms entre reps
contadas, em `src/lib/pose-tracking.ts`.
```

(Substituir `N` pelo próximo número de hotfix da Fase 9.x e `DD/MM/2026`
pela data de aplicação.)

---

## Pendências pós-handoff (verificar em dispositivo real)

- [ ] Aplicar o patch em `src/lib/pose-tracking.ts`.
- [ ] `npx tsc --noEmit` + `npm run build`.
- [ ] Testar com corpo parcialmente fora do quadro (deitado, só
      rosto/ombros) — contagem deve **parar** e mostrar feedback de
      reenquadramento, sem incrementar.
- [ ] Testar com corpo inteiro no quadro fazendo flexões/agachamentos
      reais — contagem deve continuar funcionando normalmente.
- [ ] Se ainda houver falsos positivos com corpo visível (ruído de
      landmark mesmo com `visibility` alta), considerar suavização
      temporal do ângulo (média móvel) como próximo passo — fora de
      escopo deste hotfix.
- [ ] Deploy.
- [ ] Atualizar `CLAUDE.md` com o número correto do hotfix.
