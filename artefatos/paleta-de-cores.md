# Paleta de Cores — Peso em Progresso

> Dark é o tema padrão do app. Light foi validado visualmente com o usuário em 28/08/2026 (Fase 1.2).

## Tokens base (mudam por tema — CSS vars)

| Token | Dark (`:root`) | Light |
|---|---|---|
| `base-bg` | `#0B1220` | `#FAF3EC` |
| `base-surface` | `#141B2D` | `#FFFFFF` |
| `base-surface2` | `#1B2438` | `#F3E7DB` |
| `base-border` | `#26314A` | `#E4D2C0` |
| `ink` (texto principal) | `#E7ECF7` | `#3A2A1F` |
| `ink-muted` | `#8C97B4` | `#8A7362` |
| `ink-faint` | `#5B6584` | `#B4A192` |
| `accent` | `#D97A45` | `#C1652F` |
| `accent-hover` | `#E08B5C` | `#A8531F` |

## Tokens de status (`signal-*`)

Hex fixo, iguais nos dois temas.

| Token | Hex | Uso |
|---|---|---|
| `signal-ahead` | `#34D399` | adiantado |
| `signal-onpace` | `#60A5FA` | no ritmo |
| `signal-caution` | `#FBBF24` | atenção |
| `signal-behind` | `#FB7185` | atrasado |

## Observações importantes

- **Accent vs. onpace**: `accent` (terracota) é a cor de marca/ação — botões primários, foco de input, progresso do onboarding. `signal-onpace` (azul) é *apenas* status de KPI/tendência. Não confundir os dois ao definir cor de botão/link novo.
- **Contraste de texto em `caution`**: para texto solto sobre `caution`, usar `--badge-caution-text` (`#8A5A0B` no light) em vez do hex puro — amarelo puro falha WCAG AA em fundo claro.
- **Opacity modifier não funciona** em cores definidas só como `var(--x)` (bug do Tailwind 3.4.4 com essa config) — `bg-accent/50` gera classe sem regra CSS aplicada. Usar a utilidade `opacity-*` num elemento próprio, ou uma var dedicada com rgba já embutido (ex.: `--accent-glow`).
- **PDF exportado** usa os mesmos hex de `signal-*` via `STATUS_COLOR` em `ExportDocument.tsx`, mas com hex literal (o `@react-pdf/renderer` não lê classes Tailwind) — se a paleta mudar no Tailwind, atualizar esse mapa manualmente também.
- **Landing page** é dark fixo, sem toggle e sem `data-theme` dinâmico.
