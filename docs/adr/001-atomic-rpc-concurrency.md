# ADR 001: Reserva Atômica de Estoque via Stored Procedure RPC com `SELECT ... FOR UPDATE`

- **Status:** Aceito
- **Data:** 2026-08-29
- **Autor / Subagente:** `cloud-db-architect` / `doc-specialist`

---

## Contexto
Em redes de restaurantes que solicitam insumos a um depósito central compartilhado, múltiplos restaurantes ou usuários podem submeter pedidos de reposição simultaneamente disputando o mesmo lote ou último saldo em estoque.

Se a verificação e dedução de estoque forem feitas no código JavaScript do cliente ou via múltiplas consultas sequenciais desprotegidas no front-end, ocorre uma **condição de corrida (race condition)**:
1. Usuário A lê `estoque = 5`.
2. Usuário B lê `estoque = 5`.
3. Usuário A envia pedido de 4 unidades ➔ `estoque = 1`.
4. Usuário B envia pedido de 3 unidades ➔ `estoque = -2` (inconsistência grave e estoque negativo).

---

## Decisão Técnica
Implementar a Stored Procedure PostgreSQL `place_order_with_reservation` no Supabase utilizando travas de linha exclusivas com **`SELECT current_stock FROM products WHERE id = ... FOR UPDATE`** dentro de uma transação atômica.

### Fluxo da Transação:
1. A transação adquire lock exclusivo nas linhas dos produtos do pedido.
2. Compara `current_stock >= requested_qty` para todos os itens.
3. Se qualquer item não tiver saldo suficiente, a transação realiza `ROLLBACK` e retorna erro estruturado `{ success: false, code: 'INSUFFICIENT_STOCK', item_id: ... }`.
4. Se todos tiverem saldo suficiente, realiza o `UPDATE products SET current_stock = current_stock - requested_qty`, insere o registro em `orders` (`status = 'ABERTO'`), insere os `order_items`, registra log em `order_status_logs` e registra movimentação em `stock_movements`, executando `COMMIT`.

---

## Consequências
- **Positivas:**
  - Garantia matemática de atomicidade e consistência (ACID).
  - Impossibilidade de saldo negativo no banco de dados.
  - Baixa latência por executar toda a lógica em um único round-trip ao banco.
  - Segurança total mesmo se o cliente web for manipulado.
- **Negativas / Mitigações:**
  - Exige escrita e manutenção de código PL/pgSQL no Supabase (gerenciado e versionado nas migrations em `supabase/migrations/`).
