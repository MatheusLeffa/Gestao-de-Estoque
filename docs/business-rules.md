# 📋 Regras de Negócio — InsumoSync

Este documento detalha todas as regras operacionais, restrições e lógicas de cálculo de suprimentos do sistema **InsumoSync**.

---

## 1. Gestão de Catálogo e Estoque Central

### 1.1 Unidades de Medida e Saldo
- Cada insumo possui uma unidade de medida cadastrada (`KG`, `UN`, `L`, `CX`, `PCT`).
- O saldo de estoque (`current_stock`) é estritamente controlado em nível de depósito central.
- O campo `min_stock_alert` define o limite mínimo de segurança; sempre que `current_stock <= min_stock_alert`, o insumo é sinalizado como **Crítico / Estoque Baixo**.

### 1.2 Reabastecimento Manual (Entrada de Estoque)
- Operadores do Estoque Central podem realizar entradas manuais de insumos através da RPC `restock_product(p_product_id, p_quantity, p_reason)`.
- Toda entrada incrementa atomicamente o `current_stock` e gera um registro de auditoria na tabela `stock_movements` com `type = 'ENTRADA_MANUAL'`.

---

## 2. Criação e Reserva de Pedidos (Restaurante)

### 2.1 Bloqueio de Quantidade no Front-end
- O restaurante não pode selecionar uma quantidade superior ao `current_stock` exibido em tela.
- O botão de envio do pedido é desabilitado caso o carrinho esteja vazio ou contenha itens inválidos.

### 2.2 Reserva Atômica no Banco (Supabase RPC)
- Ao submeter o pedido, a RPC `place_order_with_reservation` é chamada.
- O PostgreSQL executa `SELECT ... FOR UPDATE` nas linhas dos insumos solicitados.
- Se qualquer item tiver saldo inferior ao requisitado (`current_stock < requested_qty`), a transação é cancelada (rollback), retornando erro amigável (`INSUFFICIENT_STOCK`).
- Se todos os itens tiverem saldo suficiente:
  1. O saldo é debitado imediatamente (`current_stock = current_stock - requested_qty`).
  2. O pedido é criado com status inicial `ABERTO`.
  3. Os itens são inseridos em `order_items`.
  4. Um registro é gerado em `order_status_logs` com status inicial.
  5. Movimentações `SAIDA_PEDIDO` são gravadas em `stock_movements`.

---

## 3. Triagem e Separação no Estoque Central

### 3.1 Transição de Status
- `ABERTO` ➔ `EM_ANALISE`: O operador do depósito assume a separação do pedido.
- `EM_ANALISE` ➔ `EM_TRANSITO`: O pedido foi conferido, embalado e despachado para entrega.

### 3.2 Apontamento de Atrasos (`EM_ATRASO`)
- Se houver impedimento na expedição, o status passa para `EM_ATRASO`.
- **Justificativa Obrigatória:** O operador deve selecionar um motivo válido:
  - `Falta de Produto` (insumo danificado no estoque ou avaria).
  - `Transporte Indisponível` (falta de veículo ou problemas logísticos).
- O pedido pode retornar para `EM_ANALISE` ou ir direto para `EM_TRANSITO` assim que o problema for sanado.

---

## 4. Cancelamentos e Devolução de Estoque

### 4.1 Cancelamento pelo Restaurante
- O restaurante pode solicitar cancelamento direto enquanto o pedido estiver `ABERTO`. O cancelamento é imediato (`CANCELADO`) e o estoque é devolvido atomicamente.
- Se o pedido já estiver `EM_ANALISE`, o restaurante solicita cancelamento (`CANCELAMENTO_PENDENTE`), exigindo validação do operador do depósito antes de efetivar `CANCELADO`.

### 4.2 Devolução Atômica de Saldo
- Ao transitar para `CANCELADO`, a Stored Procedure executa a devolução das quantidades reservadas aos respectivos produtos (`current_stock = current_stock + requested_qty`) e grava movimentações `ESTORNO_CANCELAMENTO` em `stock_movements`.

---

## 5. Conferência na Entrega (Check-in do Restaurante)

Ao receber o pedido físico na cozinha, o restaurante finaliza o ciclo com um dos 3 desfechos:
1. `ENTREGUE_TOTAL`: Todos os itens foram recebidos conforme solicitado. O pedido passa para `CONCLUIDO_TOTAL`.
2. `ENTREGUE_PARCIAL`: Houve faltas na entrega. O pedido passa para `CONCLUIDO_PARCIAL` e o restaurante deve informar a justificativa obrigatória.
3. `NAO_ENTREGUE`: Pedido recusado, extraviado ou totalmente avariado. O pedido passa para `CONCLUIDO_NAO_ENTREGUE` com justificativa obrigatória.
