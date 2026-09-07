# Spec — Fase 8 hotfix: esconder badge "Pro" na Sidebar para usuários Pro

> Correção visual pós-deploy do 8.1. Não muda estrutura, gate de página,
> nem o array `links` — só a condição de renderização do badge dentro de
> `renderNavItem`, em `src/components/Sidebar.tsx`.

## 1. Problema

Hoje o badge "Pro" (ícone `Lock` + texto) aparece em todo item marcado
com `premium: true`, **independente do plano do usuário**. Um usuário
que já assinou o Pro continua vendo 9 cadeados no menu, o que não faz
sentido — ele já tem acesso a tudo. Isso polui a navegação sem propósito
para quem já converteu.

## 2. Comportamento desejado

- **Usuário free** (`plan === "free"` ou `plan === undefined`): badge
  "Pro" continua aparecendo normalmente nos 9 itens marcados
  `premium: true`. Nenhuma mudança aqui.
- **Usuário Pro** (`plan === "pro"`): o badge some completamente (ícone
  `Lock` + texto "Pro") em todos os itens. O item fica visualmente
  idêntico a um item free — só o ícone da seção, o label, e o espaço
  extra que o badge ocupava.
- **Card de rodapé** ("Seja Pro" / "Plano Atual: Pro"): sem mudança,
  já é condicional a `plan` corretamente.
- **`comingSoon`**: sem mudança — itens `comingSoon: true` continuam
  desabilitados (`<span>`, não navegam) independente do plano. Isso é
  ortogonal ao badge Pro (rota ainda não existe, não é sobre gate).

## 3. Mudança em `src/components/Sidebar.tsx`

Localizar dentro de `renderNavItem`:

```tsx
    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{l.label}</span>
        {l.premium && (
          <span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
            <Lock className="h-2.5 w-2.5" />
            Pro
          </span>
        )}
      </>
    );
```

Trocar para:

```tsx
    const content = (
      <>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{l.label}</span>
        {l.premium && plan !== "pro" && (
          <span className="flex items-center gap-1 rounded bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">
            <Lock className="h-2.5 w-2.5" />
            Pro
          </span>
        )}
      </>
    );
```

Única mudança: `l.premium &&` vira `l.premium && plan !== "pro" &&`.

`plan` já está disponível no escopo (prop do componente `Sidebar`,
`plan?: "free" | "pro"`), não precisa passar nada novo de fora.

## 4. Fora de escopo

- Qualquer mudança no array `links` ou nas flags `premium`/`comingSoon`.
- Qualquer mudança em `PlanGate` ou no gate real de cada página — isso
  já funciona corretamente hoje (usuário Pro acessa, free é bloqueado
  na própria página). Esta spec é **puramente cosmética no menu**.
- Remover `comingSoon` dos 3 itens ainda não implementados
  (Previsão da Meta já saiu do comingSoon; Conquistas e Exportar Dados
  seguem pendentes — tratado nas specs 8.1.2/8.1.3).
- Página `/dashboard/coach/[ownerId]` (visão do coach sobre o cliente):
  não recebe `plan` como o dono da conta, então não é afetada por esta
  mudança — não deveria ter badges Pro de qualquer forma nesse contexto.

## 5. Checklist de teste manual

- [ ] `npx tsc --noEmit` e `npm run build` limpos.
- [ ] Usuário free: os 9 badges "Pro" continuam aparecendo normalmente
      (Medidas, Fotos, Relatórios, Previsão da Meta, Conquistas,
      Desafios, Coach, Lembretes, Exportar Dados).
- [ ] Usuário Pro: nenhum badge "Pro" aparece em nenhum item do menu.
- [ ] Usuário Pro: itens antes marcados Pro ficam com o mesmo
      alinhamento/espaçamento dos itens free (sem "buraco" onde o badge
      estava).
- [ ] Itens `comingSoon` continuam não-clicáveis para ambos os planos,
      independente do badge sumir ou não.
- [ ] Testar nos dois temas (claro/escuro).
- [ ] Testar mobile (drawer) e desktop.
- [ ] Card de rodapé continua mostrando "Plano Atual: Pro" pro usuário
      Pro (sem mudança, só confirmando que nada quebrou).

## 6. Execução

1. Aplicar o `str_replace` da seção 3 em `src/components/Sidebar.tsx`.
2. Rodar `npx tsc --noEmit` e `npm run build`.
3. Validar visualmente logado como conta free e como conta Pro.
4. Atualizar `CLAUDE.md` (seção da Fase 8.1, junto aos hotfixes 1, 2 e 3
   já documentados) com uma nova entrada **"Hotfix 4"**, mesmo formato
   dos anteriores: nome do arquivo de spec, data, o que mudou, resultado
   de `tsc`/`build`. Conteúdo sugerido:

   ```
   **Hotfix 4 — esconder badge "Pro" para usuários Pro (07/09/2026).** Spec
   `claude_fase8_sidebar_hotfix_hide_pro_badge.md` (raiz do repo, não
   versionado, mesmo padrão dos demais specs) — o badge "Pro" (ícone
   `Lock` + texto) aparecia em todo item `premium: true` independente do
   plano do usuário; uma conta já Pro via 9 cadeados no menu sem
   propósito, poluindo a navegação de quem já converteu. `npx tsc
   --noEmit`/`npm run build` limpos.
   - Condição do badge em `renderNavItem` (`Sidebar.tsx`) trocada de
     `l.premium &&` pra `l.premium && plan !== "pro" &&`. `plan` já era
     prop existente do componente — nenhum dado novo buscado.
   - Usuário free: sem mudança, os 9 badges continuam aparecendo.
   - Usuário Pro: nenhum badge "Pro" aparece em nenhum item do menu; item
     fica com o mesmo espaçamento dos itens free.
   - **Puramente visual** — nenhum `PlanGate` de página foi tocado; gate
     real de cada rota continua idêntico ao da Fase 7.
   ```

5. Deploy.

---

## Apêndice A — o que mudou

- v1 (esta versão): primeira versão da spec. Mudança de uma linha —
  adicionar `plan !== "pro"` à condição do badge Pro em
  `renderNavItem`. Sem impacto em gate de página, sem novos dados
  buscados (o `plan` já é prop existente do componente).
