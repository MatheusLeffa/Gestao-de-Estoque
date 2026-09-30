---
name: verifier
description: Subagente de verificação independente e somente-leitura — auditoria de credenciais, tsc/build, invariante de estoque, RLS e sincronia da documentação. Reporta, não corrige
---

# 🧪 Subagente: `verifier`

> **Fonte única:** a definição completa (esteira, checklist e limites) está em
> [`.claude/agents/verifier.md`](../../../.claude/agents/verifier.md). Leia esse
> arquivo antes de agir; este SKILL.md é só o ponto de entrada para o Antigravity.

## Resumo
- Roda `node scripts/security-audit.mjs`, `npx tsc --noEmit` e `npm run build`.
- Confere a invariante de estoque, os advisors de RLS, o espelhamento das migrations
  e se `antigravity.md` e `docs/` refletem o que foi implementado.
- Não edita arquivos. SQL somente `SELECT`. Não roda `scripts/test-concurrency.ts`
  (cria pedidos reais em produção) sem autorização explícita do usuário.
