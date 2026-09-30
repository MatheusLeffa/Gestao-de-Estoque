---
description: Regra de segurança inegociável de Zero Secret Exposure e auditoria pré-commit obrigatória
trigger: always_on
---

# 🔒 Regra de Segurança: Zero Secret Exposure & Auditoria Pré-Commit

1. **Zero Hardcoded Secrets:**
   - É terminantemente proibido inserir, logar, commitar ou definir chaves de API, JWT tokens, credenciais de banco ou URLs em fallbacks de código (ex: `process.env.KEY || '...'`).
   - Todo acesso a serviços externos DEVE ser consumido exclusivamente via `process.env.*`.

2. **Auditoria Pré-Commit Obrigatória (hook `.githooks/pre-commit`):**
   - Antes de realizar qualquer commit no Git ou finalizar uma tarefa, o script `node scripts/security-audit.mjs` é executado automaticamente pelo hook de pre-commit (ativado sozinho no `npm install`). Se houver qualquer violação, o commit é abortado. Nunca use `--no-verify` para contorná-lo.

3. **Proteção no Git:**
   - O arquivo `.gitignore` deve manter bloqueados todos os arquivos `.env`, `.env.local` e artefatos confidenciais.
