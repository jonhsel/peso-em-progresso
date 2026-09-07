# Patch — Correção de `periodLengthDays` no modo `anchored`

> Correção de bug introduzido pela spec v3 da Fase 8.x (seção 3.3).
> O Claude Code implementou corretamente o que a spec dizia — o erro
> estava na spec, não na implementação.

---

## Problema

No modo `anchored`, `periodLengthDays` retorna
`differenceInCalendarDays(now, anchorDate)` para os 4 períodos. Isso faz
`fractionElapsed = elapsedDays / lengthDays` ser sempre `1.0` (porque
`elapsedDays` e `lengthDays` são o mesmo valor), o que resulta em:

- "esperado pela meta" assume que 100% do período já passou
- Os 4 cards mostram `targetLossKg` integral como esperado, não proporcional
- Card de Trimestre com marco de 26 dias mostra "esperado: 108.0 kg"
  (como se os 90 dias já tivessem acabado) em vez de "esperado: 110.13 kg"
  (proporcional a 26/90 do trimestre)

## Causa raiz

A spec v3 tratava o modo `anchored` como "o período É tudo que já se
passou desde o marco" — o que é conceitualmente errado. O correto é: o
modo `anchored` muda **onde** o período começa (o marco, não hoje nem um
calendário civil), mas **não muda o comprimento** de cada período. Uma
"semana desde o marco" continua sendo 7 dias, um "trimestre desde o marco"
continua sendo 90 dias — exatamente como o modo `rolling` já faz.

## Correção

Arquivo: `src/lib/analytics.ts`

```diff
-function periodLengthDays(
-  period: Period,
-  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
-  now: Date = new Date()
-): number {
-  if (ctx.mode === "anchored" && ctx.anchorDate) {
-    return Math.max(1, differenceInCalendarDays(now, ctx.anchorDate));
-  }
-  if (ctx.mode === "rolling") {
+function periodLengthDays(
+  period: Period,
+  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT
+): number {
+  if (ctx.mode === "anchored" || ctx.mode === "rolling") {
     const exact: Record<Period, number> = { week: 7, month: 30, quarter: 90, semester: 180 };
     return exact[period];
   }
   switch (period) {
     case "week":
       return 7;
     case "month":
       return 30.4;
     case "quarter":
       return 91.3;
     case "semester":
       return 182.6;
   }
 }
```

Mudanças:
1. `anchored` entra no mesmo branch de `rolling` (comprimento nominal
   7/30/90/180)
2. O parâmetro `now` é removido da assinatura — era usado exclusivamente
   pelo cálculo de `differenceInCalendarDays` que não existe mais

## Caller de `periodLengthDays`

Dentro de `computePeriodKpi`, a chamada atual é:

```ts
const lengthDays = periodLengthDays(period, ctx, now);
```

Atualizar para:

```diff
-  const lengthDays = periodLengthDays(period, ctx, now);
+  const lengthDays = periodLengthDays(period, ctx);
```

## Resultado esperado (com marco 12/08, peso atual 110.6, baseline 111.0)

| Card       | Meta do período | Fração (26/N) | Esperado                  | Status     |
|------------|-----------------|---------------|---------------------------|------------|
| Semana     | -0.25 kg / 7d   | 1.0 (cap)     | 111.0 - 0.25 = 110.75 kg  | à frente   |
| Mês        | -1.00 kg / 30d  | 26/30 = 0.87  | 111.0 - 0.87 = 110.13 kg  | à frente   |
| Trimestre  | -3.00 kg / 90d  | 26/90 = 0.29  | 111.0 - 0.87 = 110.13 kg  | à frente   |
| Semestre   | -6.00 kg / 180d | 26/180 = 0.14 | 111.0 - 0.87 = 110.13 kg  | à frente   |

Os cards agora mostram valores **diferentes** de "esperado" e o status
reflete corretamente se o usuário está no ritmo proporcional ao tempo
decorrido desde o marco.

## Checklist

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Dashboard com modo `anchored` + marco 12/08: os 4 cards mostram
      "esperado pela meta" diferentes entre si (proporcional ao
      comprimento de cada período).
- [ ] Card de Semana (26 dias > 7 dias): `fractionElapsed` capped a 1.0,
      mostra meta semanal integral como esperado (período já "passou").
- [ ] Card de Trimestre: "esperado" proporcional a ~29% do trimestre,
      não 100%.
- [ ] Modos `fixed` e `rolling` não afetados (regressão).
