# Fase 1.1 — Exportar dados (CSV/PDF) — v2

Spec desta feature da Fase 1 (`claude_fases.md`). Não versionado — histórico de como foi
planejada, mesmo padrão do `claude_fase0_v3.md`.

**v2 — correções da auditoria aplicadas:**
- [#1] Patch em `next.config.js`: `serverComponentsExternalPackages` para `@react-pdf/renderer`
- [#2] CSV: peso formatado com vírgula decimal (`109,7`) para Excel pt-BR
- [#4] Rota PDF: fallback de goals padrão em vez de erro 500 quando trigger falhou
- [#5] `export const dynamic = "force-dynamic"` nas duas rotas (evita cache de dados pessoais)

---

## 0. Dependência nova

```bash
npm install @react-pdf/renderer@^4.9.0
```

`@react-pdf/renderer` (não confundir com `react-pdf`/`react-pdf-viewer`, que são pra
*exibir* PDF — aqui é o contrário, *gerar* PDF a partir de componentes React, rodando
no servidor). Compatível com Next.js 14.1.1+ (vocês estão no `14.2.35`, ok) e roda em
runtime Node — por isso os dois arquivos novos abaixo declaram `export const runtime =
"nodejs"` explicitamente (Vercel já usa Node por padrão em Route Handlers, mas deixar
explícito evita qualquer acidente futuro se alguém tentar mover pra edge).

## 1. Patch: `next.config.js`

**[Correção #1 da auditoria]** — `@react-pdf/renderer` depende de `yoga-layout` (binding
nativo) que usa `__dirname`. Sem o opt-out abaixo, o bundler do RSC no Next.js 14 tenta
empacotar isso e pode crashar com `__dirname is not defined` ou
`ba.Component is not a constructor` — especialmente na Vercel.

Substituir o arquivo inteiro por:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
};

module.exports = nextConfig;
```

## 2. Por que Route Handlers e não Server Actions

Export é uma navegação de download (`<a href="/api/export/csv">`), não uma mutação —
faz mais sentido como GET em `app/api/export/*/route.ts` do que como Server Action.
O browser trata a resposta com `Content-Disposition: attachment` como download nativo,
sem JS extra no cliente.

## 3. Arquivo novo: `src/app/api/export/csv/route.ts`

Delimitador `;` (não `,`) — Excel em pt-BR usa `,` como separador decimal, então o
separador de campo do CSV precisa ser `;` para abrir corretamente com duplo-clique.

**[Correção #2]** — peso formatado com `,` como decimal (`109,7` em vez de `109.7`)
para o Excel pt-BR reconhecer como número e não texto.

**[Correção #5]** — `dynamic = "force-dynamic"` evita que a Vercel Edge/CDN cacheie
a resposta (dados pessoais). Combinado com `Cache-Control: no-store, private` no header.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WeightEntry } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  import: "Importado",
};

function csvEscape(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: entries, error } = await supabase
    .from("weight_entries")
    .select("measured_at, weight_kg, note, source")
    .eq("user_id", user.id)
    .order("measured_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const rows = (entries ?? []) as Pick<
    WeightEntry,
    "measured_at" | "weight_kg" | "note" | "source"
  >[];

  const header = ["Data", "Peso (kg)", "Nota", "Origem"];
  const lines = [header.join(";")];

  for (const row of rows) {
    lines.push(
      [
        row.measured_at,
        Number(row.weight_kg).toFixed(1).replace(".", ","),
        csvEscape(row.note ?? ""),
        SOURCE_LABEL[row.source] ?? row.source,
      ].join(";")
    );
  }

  // BOM UTF-8 — sem isso o Excel abre "Não é possível localizar" ou quebra acentos.
  const csv = "\uFEFF" + lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="peso-em-progresso-${today}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
```

## 4. Arquivo novo: `src/lib/pdf/ExportDocument.tsx`

Componente `@react-pdf/renderer` puro — reaproveita os tipos e o cálculo de
`computeAllKpis`/`computeTrend` de `src/lib/analytics.ts`, sem duplicar lógica.

```tsx
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { WeightEntry } from "@/types/database";
import type { PeriodKpi, TrendResult } from "@/lib/analytics";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#6B7280", marginBottom: 20 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 18,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#374151",
  },
  summaryRow: { flexDirection: "row", gap: 16, marginBottom: 4 },
  summaryBox: { flex: 1, padding: 10, backgroundColor: "#F3F4F6", borderRadius: 4 },
  summaryLabel: { fontSize: 8, color: "#6B7280", marginBottom: 3, textTransform: "uppercase" },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  table: { marginTop: 4 },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 5,
  },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    paddingBottom: 5,
    marginBottom: 2,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: "#6B7280" },
  td: { fontSize: 9 },
  colDate: { width: "20%" },
  colWeight: { width: "18%" },
  colDiff: { width: "18%" },
  colNote: { width: "44%" },
  colPeriod: { width: "20%" },
  colStatus: { width: "22%" },
  colDetail: { width: "58%" },
  empty: { fontSize: 9, color: "#9CA3AF", marginTop: 4 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#9CA3AF", textAlign: "center" },
});

const STATUS_LABEL: Record<PeriodKpi["status"], string> = {
  ahead: "Adiantado",
  on_pace: "No ritmo",
  caution: "Atenção",
  behind: "Atrasado",
};

const TREND_LABEL: Record<TrendResult["label"], string> = {
  perdendo_rapido: "Perdendo rápido",
  perdendo: "Perdendo peso",
  estavel: "Estável",
  ganhando: "Ganhando peso",
  insufficient_data: "Sem dados recentes",
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function ExportDocument({
  displayName,
  entries,
  kpis,
  trend,
}: {
  displayName: string;
  entries: WeightEntry[];
  kpis: PeriodKpi[];
  trend: TrendResult;
}) {
  const sorted = [...entries].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const latest = sorted[sorted.length - 1] ?? null;
  const first = sorted[0] ?? null;
  const totalChange = latest && first ? Number(latest.weight_kg) - Number(first.weight_kg) : null;

  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Peso em Progresso</Text>
        <Text style={styles.subtitle}>
          {displayName} · Relatório gerado em {generatedAt}
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Peso atual</Text>
            <Text style={styles.summaryValue}>
              {latest ? `${Number(latest.weight_kg).toFixed(1)} kg` : "—"}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Variação total</Text>
            <Text style={styles.summaryValue}>
              {totalChange !== null
                ? `${totalChange <= 0 ? "-" : "+"}${Math.abs(totalChange).toFixed(1)} kg`
                : "—"}
            </Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Tendência (21 dias)</Text>
            <Text style={styles.summaryValue}>{TREND_LABEL[trend.label]}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Metas por período</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, styles.colPeriod]}>Período</Text>
            <Text style={[styles.th, styles.colStatus]}>Status</Text>
            <Text style={[styles.th, styles.colDetail]}>Detalhe</Text>
          </View>
          {kpis.map((kpi) => (
            <View style={styles.tableRow} key={kpi.period}>
              <Text style={[styles.td, styles.colPeriod]}>{kpi.label}</Text>
              <Text style={[styles.td, styles.colStatus]}>{STATUS_LABEL[kpi.status]}</Text>
              <Text style={[styles.td, styles.colDetail]}>{kpi.statusLabel}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Histórico de pesagens ({sorted.length})</Text>
        {sorted.length === 0 ? (
          <Text style={styles.empty}>Nenhuma pesagem registrada ainda.</Text>
        ) : (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, styles.colDate]}>Data</Text>
              <Text style={[styles.th, styles.colWeight]}>Peso</Text>
              <Text style={[styles.th, styles.colDiff]}>Variação</Text>
              <Text style={[styles.th, styles.colNote]}>Nota</Text>
            </View>
            {sorted.map((entry, i) => {
              const prev = sorted[i - 1];
              const diff = prev ? Number(entry.weight_kg) - Number(prev.weight_kg) : null;
              return (
                <View style={styles.tableRow} key={entry.id} wrap={false}>
                  <Text style={[styles.td, styles.colDate]}>{fmtDate(entry.measured_at)}</Text>
                  <Text style={[styles.td, styles.colWeight]}>
                    {Number(entry.weight_kg).toFixed(1)} kg
                  </Text>
                  <Text style={[styles.td, styles.colDiff]}>
                    {diff === null ? "—" : diff === 0 ? "=" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`}
                  </Text>
                  <Text style={[styles.td, styles.colNote]}>{entry.note ?? ""}</Text>
                </View>
              );
            })}
          </View>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
```

## 5. Arquivo novo: `src/app/api/export/pdf/route.tsx`

**Atenção à extensão `.tsx`** (não `.ts`) — precisa de JSX pra montar o `<ExportDocument />`.
Next.js reconhece `route.tsx` como Route Handler normalmente, mesma convenção de `route.ts`.

**[Correção #4]** — se o trigger `handle_new_user_goals` falhou no signup e a linha de
goals não existe, a rota usa fallback de goals padrão (mesma lógica de `loadUserData.ts`)
em vez de retornar 500.

**[Correção #5]** — `dynamic = "force-dynamic"` + `Cache-Control: no-store, private`.

```tsx
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { computeAllKpis, computeTrend } from "@/lib/analytics";
import { ExportDocument } from "@/lib/pdf/ExportDocument";
import type { WeightEntry, Goals } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GOALS: Omit<Goals, "user_id" | "updated_at"> = {
  weekly_loss_kg: 0.25,
  monthly_loss_kg: 1,
  quarterly_loss_kg: 3,
  semester_loss_kg: 6,
  target_weight_kg: null,
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [{ data: profile }, { data: entries, error: entriesError }, { data: goals }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase
        .from("weight_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("measured_at", { ascending: true }),
      supabase.from("goals").select("*").eq("user_id", user.id).single(),
    ]);

  if (entriesError) {
    return NextResponse.json({ error: "Erro ao buscar dados." }, { status: 500 });
  }

  const typedEntries = (entries ?? []) as WeightEntry[];
  const typedGoals: Goals = goals
    ? (goals as Goals)
    : { user_id: user.id, updated_at: "", ...DEFAULT_GOALS };

  const kpis = computeAllKpis(typedEntries, typedGoals);
  const trend = computeTrend(typedEntries);

  const buffer = await renderToBuffer(
    <ExportDocument
      displayName={profile?.display_name ?? "Usuário"}
      entries={typedEntries}
      kpis={kpis}
      trend={trend}
    />
  );

  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="peso-em-progresso-${today}.pdf"`,
      "Cache-Control": "no-store, private",
    },
  });
}
```

## 6. Arquivo novo: `src/components/entries/ExportButtons.tsx`

Server component simples (só links, sem interação) — não precisa de `"use client"`.

```tsx
export default function ExportButtons() {
  return (
    <div className="flex items-center gap-2">
      <a
        href="/api/export/csv"
        className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
      >
        Exportar CSV
      </a>
      <a
        href="/api/export/pdf"
        className="text-xs border border-base-border rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink transition"
      >
        Exportar PDF
      </a>
    </div>
  );
}
```

## 7. Patch: `src/app/dashboard/entries/page.tsx`

Botões só aparecem se houver pelo menos 1 pesagem (evita exportar arquivo vazio).

```diff
 import { loadUserData } from "@/lib/loadUserData";
 import NavBar from "@/components/NavBar";
 import WeightEntryForm from "@/components/WeightEntryForm";
 import EntriesList from "@/components/EntriesList";
+import ExportButtons from "@/components/entries/ExportButtons";

 export default async function EntriesPage() {
   const { user, profile, entries } = await loadUserData();

   return (
     <div>
       <NavBar displayName={profile.display_name} />
       <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="md:sticky md:top-8 self-start">
           <WeightEntryForm userId={user.id} />
         </div>
         <div>
-          <p className="text-xs uppercase tracking-wide text-ink-muted mb-3">Histórico</p>
+          <div className="flex items-center justify-between mb-3">
+            <p className="text-xs uppercase tracking-wide text-ink-muted">Histórico</p>
+            {entries.length > 0 && <ExportButtons />}
+          </div>
           <EntriesList entries={entries} />
         </div>
       </main>
     </div>
   );
 }
```

## 8. Checklist de validação

- [ ] `npm install @react-pdf/renderer@^4.9.0`
- [ ] Aplicar patch no `next.config.js` (seção 1)
- [ ] Criar os 4 arquivos novos (seções 3, 4, 5, 6)
- [ ] Aplicar o patch do `entries/page.tsx` (seção 7)
- [ ] `npx tsc --noEmit` e `npm run build` limpos
- [ ] Testar `/api/export/csv` logado — baixa arquivo, abre no Excel/Sheets sem quebrar
      acentos, sem virar tudo uma coluna só, coluna de peso reconhecida como número
- [ ] Testar `/api/export/pdf` logado — abre, tabela de histórico não corta linha no
      meio da página (`wrap={false}` por linha cuida disso)
- [ ] Testar as duas rotas **deslogado** (sem cookie de sessão) — devem responder 401,
      não vazar dados de outro usuário
- [ ] Testar com 0 pesagens — botões somem na tela; se acessar a URL da API direto,
      CSV sai só com cabeçalho e PDF mostra "Nenhuma pesagem registrada ainda."
- [ ] Checar response headers — `Cache-Control: no-store, private` presente nas duas rotas

## 9. Depois de validar

Marcar em `claude_fases.md`:

```
- [x] Exportar dados em CSV/PDF
```

E adicionar ao `CLAUDE.md`, seção "Decisões importantes":

```
8. **Exportação CSV/PDF é server-side** — PDF gerado via `@react-pdf/renderer`
   (runtime Node, não Edge) em Route Handlers (`src/app/api/export/`), reaproveitando
   `computeAllKpis`/`computeTrend` de `src/lib/analytics.ts` sem duplicar lógica.
   CSV usa `;` como delimitador e `,` como decimal por causa do Excel pt-BR.
   `next.config.js` precisa de `serverComponentsExternalPackages: ["@react-pdf/renderer"]`
   por causa do binding nativo `yoga-layout` — sem isso o build pode falhar na Vercel.
   Rotas protegidas com auth check + `Cache-Control: no-store, private` +
   `dynamic = "force-dynamic"` para não cachear dados pessoais.
```

## 10. Resumo das mudanças vs v1

| Arquivo | Mudança |
|---------|---------|
| `next.config.js` | Adicionado `experimental.serverComponentsExternalPackages` |
| `src/app/api/export/csv/route.ts` | Peso com `,` decimal; `dynamic = "force-dynamic"`; `Cache-Control` header |
| `src/app/api/export/pdf/route.tsx` | Fallback de goals padrão; `dynamic = "force-dynamic"`; `Cache-Control` header |
| `src/lib/pdf/ExportDocument.tsx` | Sem mudança vs v1 |
| `src/components/entries/ExportButtons.tsx` | Sem mudança vs v1 |
| `src/app/dashboard/entries/page.tsx` (patch) | Sem mudança vs v1 |
