# 🗂️ Implementation Plan — Gestão de Produtos v2 & Integridade do Ledger de Estoque

> **Branch:** `feat/continuacao-claude`
> **Origem:** continuação do prompt de cancelamento pelo depósito + CRUD de produtos, cuja entrega anterior ficou parcial.
> **Tech Lead:** Claude (Opus 5) · **Protocolo:** `antigravity.md` (Living Blueprint)

---

## 1. Diagnóstico da Entrega Anterior

### ✅ Entregue e funcional
- `CancelOrderModal` — cancelamento pelo depósito com 6 motivos fixos + `Outro (descrever)`, cobrindo `ABERTO`, `EM_ANALISE` e `EM_ATRASO`.
- `ProductFormModal` — cadastro e edição de produtos via RPC `create_or_update_product`.
- `ProductActionModal` — desativação com detecção de conflito e checkbox de força.

### ❌ Lacunas identificadas
| # | Lacuna | Evidência |
| :-- | :--- | :--- |
| L1 | **Migration nunca aplicada** no Supabase — catálogo quebrado em runtime | `products.is_active` ausente no banco enquanto `fetchProducts` já filtrava por ela |
| L2 | **Deleção de produto inexistente** (só soft-delete) | sem `delete_product` no SQL e sem modo `delete` na UI |
| L3 | **Sem UI para inativos** — produto desativado some sem volta | `handleReactivateProduct` definido e nunca renderizado |
| L4 | **Motivo não distingue inativação de remoção** | texto fixo em `deactivate_product` |
| L5 | **Contagem de conflitos client-side** | `handleOpenDeactivate` conta sobre o array `orders` local, limitado a 50 registros |
| L6 | Import quebrado de `EyeOff` | `tsc --noEmit` falhando |

### 🐞 Bugs de contabilidade de estoque descobertos na auditoria

O `place_order_with_reservation` **debita `requested_qty` do `current_stock` no ato da criação** do pedido. Logo, o saldo fisicamente retido por um item de pedido aberto é o seu `approved_qty` (inicializado igual ao `requested_qty`).

- **BUG-01 — Redução na triagem não devolve saldo.**
  `updateApprovedItems` grava `approved_qty` com `UPDATE` direto do cliente. A diferença `requested_qty - approved_qty` nunca retorna ao `current_stock` e some do sistema.
  *Viola o Guard Rail #7 (baixa de saldo exclusivamente via RPC atômica).*

- **BUG-02 — Remoção forçada não devolve saldo e gera crédito duplo.**
  `deactivate_product(force => true)` zera `approved_qty` sem estornar. Pior: `transition_order_status` estorna `requested_qty` cheio no cancelamento, creditando saldo que já não estava reservado.

---

## 2. Decisões Aprovadas pelo Product Owner

| Decisão | Escolha |
| :--- | :--- |
| **Deleção definitiva** | `DELETE` real **somente** se o produto nunca apareceu em nenhum `order_items`. Com qualquer histórico, a UI explica e oferece desativação. Preserva 100% do histórico e respeita o `ON DELETE RESTRICT`. |
| **Pedido totalmente zerado** | Cancelamento automático para `CANCELADO`, com motivo registrado em `order_status_logs` e estorno do saldo remanescente. |
| **Bugs de estoque** | Corrigir BUG-01 e BUG-02 nesta mesma entrega. |

---

## 3. Invariante de Estoque (nova regra formal)

> **O saldo retido fora do `current_stock` por um item de pedido não-terminal é sempre `approved_qty`.**

Consequências obrigatórias:
1. Toda alteração de `approved_qty` deve mover `current_stock` na direção oposta, dentro da mesma transação.
2. O estorno de cancelamento passa a usar `approved_qty` (e não `requested_qty`).
3. Pedidos em estado terminal não retêm saldo.

---

## 4. Mudanças Propostas

### 4.1 Banco de Dados — migration `product_management_v2`

#### [NEW] `check_product_usage(p_product_id UUID) → JSONB`
Fonte de verdade server-side para a UI decidir entre desativar e deletar.
Retorna `open_order_count`, `total_item_count` e `can_hard_delete`.

#### [NEW] `apply_order_triage(p_order_id UUID, p_items JSONB, p_deposit_notes TEXT) → JSONB`
Substitui o `UPDATE` direto de `updateApprovedItems`. **Corrige BUG-01.**
- `SELECT ... FOR UPDATE` no pedido e em cada produto envolvido.
- Rejeita pedidos em estado terminal (`TERMINAL_STATE`).
- Valida `0 <= approved_qty <= requested_qty` (`INVALID_QUANTITY`).
- Exige `reduction_reason` quando `approved_qty < requested_qty` (`REASON_REQUIRED`) — regra do blueprint agora aplicada no banco.
- Para cada item, calcula `delta = approved_qty_anterior - approved_qty_novo` e credita/debita `current_stock`, gravando `stock_movements` (`ESTORNO_CANCELAMENTO` ao devolver, `SAIDA_PEDIDO` ao ampliar).
- Aborta com `INSUFFICIENT_STOCK` se uma ampliação não couber no saldo.
- Persiste `deposit_notes` e registra a triagem em `order_status_logs`.

#### [NEW] `delete_product(p_product_id UUID) → JSONB`
- Bloqueia com `HAS_ORDER_HISTORY` se existir qualquer `order_items` referenciando o produto.
- Sem histórico: remove o produto (as `stock_movements` caem por `CASCADE`).

#### [REPLACE] `deactivate_product(p_product_id UUID, p_force BOOLEAN)`
**Corrige BUG-02.**
- Estorna o `approved_qty` vigente de cada item em pedidos `ABERTO`/`EM_ANALISE`, com `stock_movements` de reversão.
- Zera `approved_qty` e grava `reduction_reason` explicitando a inativação do catálogo.
- Se o pedido ficar com soma de `approved_qty` igual a zero, delega a `transition_order_status` o cancelamento automático.

#### [REPLACE] `transition_order_status(...)`
- Estorno de cancelamento passa a usar `COALESCE(approved_qty, requested_qty)`.
- Comportamento inalterado para pedidos nunca triados (onde `approved_qty = requested_qty`).

### 4.2 Tipos — `src/types/database.ts`
- `ProductUsageResponse`, `DeleteProductResponse`, `ApplyTriageResponse`.
- `ProductActionMode = 'deactivate' | 'delete'`.

### 4.3 Services
- `inventory-service.ts`: `checkProductUsage(id)` e `deleteProduct(id)`.
- `order-service.ts`: `updateApprovedItems` reescrita sobre a RPC `apply_order_triage`.

### 4.4 Componentes
- `ProductActionModal.tsx`: passa a receber `mode`, com copy e semântica distintas para desativar e deletar, e fallback explicativo quando a deleção é bloqueada por histórico.
- `estoque/page.tsx`: botão **Deletar**, alternador **Mostrar inativos**, ação **Reativar** ligada ao handler órfão, e conflitos consultados via `checkProductUsage`.

---

## 5. Plano de Verificação

### Estático
```
npx tsc --noEmit
npm run build
node scripts/security-audit.mjs
```

### Integridade do ledger (SQL, via MCP)
Invariante verificada antes e depois de cada cenário:
`current_stock + Σ(approved_qty de itens não-terminais) = constante por produto`

### Cenários manuais
- Triagem reduzindo item → diferença volta ao estoque, `stock_movements` registrado.
- Triagem sem justificativa em item reduzido → bloqueado pelo banco.
- Cancelar pedido triado → estorna apenas o `approved_qty`, sem crédito duplo.
- Desativar produto sem conflito → sucesso direto.
- Desativar com conflito sem forçar → `CONFLICT_ORDERS`.
- Desativar com conflito forçando → estorno + itens zerados + pedido mono-item cancelado automaticamente.
- Deletar produto nunca usado → removido do catálogo.
- Deletar produto com histórico → `HAS_ORDER_HISTORY` e oferta de desativação.
- Reativar produto inativo → volta ao catálogo.

---

## 6. Fora de Escopo (registrado no backlog)

- **Saldo de pedidos concluídos:** hoje `CONCLUIDO_PARCIAL` e `CONCLUIDO_NAO_ENTREGUE` não devolvem ao estoque a diferença entre `approved_qty` e `delivered_qty`. Exige definição de negócio (extravio versus recusa) antes de qualquer implementação.
- Fase 5 (Analytics do Administrador) e Fase 6 (QA/Deploy).
