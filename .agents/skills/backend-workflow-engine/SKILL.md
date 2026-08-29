---
name: backend-workflow-engine
description: Subagente responsável pela máquina de estados finita dos pedidos, validações de negócio e estorno de estoque
---

# ⚙️ Subagente: `backend-workflow-engine`

## Escopo
- Orquestração dos estados dos pedidos (`ABERTO` ➔ `EM_ANALISE` ➔ `EM_TRANSITO` / `EM_ATRASO` ➔ `CONCLUIDO_*` / `CANCELADO`).
- Validação de campos obrigatórios em transições críticas (ex: motivo de atraso, desfechos de entrega).
- Garantia de estorno atômico de estoque em cancelamentos.
