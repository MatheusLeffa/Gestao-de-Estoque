---
name: db-engineer
description: Subagente dono de tudo que roda no Postgres — migrations, RPCs atômicas com SELECT FOR UPDATE, máquina de estados, estorno de estoque, RLS, Realtime e agregações de analytics/forecast
---

# 🏛️ Subagente: `db-engineer`

> **Fonte única:** a definição completa (escopo, regras e checklist de saída) está em
> [`.claude/agents/db-engineer.md`](../../../.claude/agents/db-engineer.md). Leia esse
> arquivo antes de agir; este SKILL.md é só o ponto de entrada para o Antigravity.

## Resumo
- Único subagente autorizado a alterar o schema do Supabase (produção).
- Toda movimentação de `current_stock` acontece em RPC com `SELECT ... FOR UPDATE`,
  respeitando a invariante de `approved_qty` descrita no `CLAUDE.md` §4.
- Migration aplicada **e** espelhada em `supabase/migrations/` no mesmo commit.
- Documenta a própria mudança em `docs/database-schema.md`, `docs/state-machine.md`
  e `docs/business-rules.md`.
