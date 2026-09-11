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

### 1.3 Ciclo de Vida do Insumo no Catálogo (CRUD)

**Cadastro e edição** — RPC `create_or_update_product`. O depósito define nome, categoria, unidade, saldo inicial e ponto de reposição. A edição **não altera o saldo**: `current_stock` só muda por reabastecimento ou por movimentação de pedido, jamais por edição cadastral.

**Desativação (soft-delete)** — RPC `deactivate_product`. O insumo recebe `is_active = false`, some do catálogo visível ao restaurante e todo o histórico permanece intacto. É a operação padrão para tirar um item de circulação, e é reversível por `reactivate_product`.

**Deleção definitiva** — RPC `delete_product`. Permitida **somente** para insumo que nunca apareceu em nenhum `order_items`. Havendo qualquer histórico, a RPC retorna `HAS_ORDER_HISTORY` e a interface oferece a desativação. Essa restrição não é uma escolha de interface: a FK `order_items.product_id` é `ON DELETE RESTRICT` e o banco recusaria a operação de qualquer forma.

**Ação forçada sobre pedidos em aberto** — quando o insumo está em pedidos `ABERTO` ou `EM_ANALISE`, a desativação é barrada por padrão (`CONFLICT_ORDERS`). O operador pode forçá-la mediante aviso explícito na tela, e então, dentro da mesma transação:
1. O saldo retido do item **é estornado ao estoque**, com movimentação registrada.
2. O item é zerado no pedido (`approved_qty = 0`) e a `reduction_reason` registra a inativação do catálogo.
3. Pedido que ficar sem nenhum item é **cancelado automaticamente**, com o motivo gravado em `order_status_logs` e visível na linha do tempo do restaurante.

---

## 1.A. Invariante do Ledger de Estoque (Regra Mestra)

A reserva de saldo acontece na **criação** do pedido, não no despacho. Disso decorre a regra que rege toda a contabilidade do sistema:

> **O saldo retido fora do `current_stock` por um item de pedido não-terminal é sempre o seu `approved_qty`.**

Consequências obrigatórias, sem exceção:

1. **Toda escrita em `approved_qty` move o `current_stock` na direção oposta**, na mesma transação, com registro em `stock_movements`. Reduzir um item de 10 kg para 4 kg devolve 6 kg ao estoque imediatamente, e esses 6 kg voltam a ficar disponíveis para outros pedidos.
2. **O estorno de cancelamento usa `approved_qty`, jamais `requested_qty`.** Usar o solicitado devolveria saldo que já não estava reservado, creditando estoque inexistente.
3. **Pedido em estado terminal não retém saldo algum.**

A invariante é verificável: o total por produto é constante antes e depois de qualquer operação.

```sql
select p.id, p.current_stock + coalesce(sum(oi.approved_qty), 0) as total_invariante
from products p
left join order_items oi on oi.product_id = p.id
left join orders o on o.id = oi.order_id
  and o.status not in ('CONCLUIDO_TOTAL','CONCLUIDO_PARCIAL','CONCLUIDO_NAO_ENTREGUE','CANCELADO')
group by p.id;
```

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

### 3.1.A Ajuste de Quantidades na Triagem (RPC `apply_order_triage`)
- O depósito pode reduzir a quantidade de qualquer item, e a **justificativa individual é obrigatória** sempre que `approved_qty < requested_qty`. A exigência é aplicada **no banco**, não apenas na tela: sem justificativa a RPC retorna `REASON_REQUIRED` e nada é gravado.
- A quantidade aprovada é limitada ao intervalo de `0` até o `requested_qty` — o depósito nunca envia mais do que foi pedido (`INVALID_QUANTITY`).
- A diferença reduzida **volta imediatamente ao `current_stock`**, conforme a invariante do ledger, com movimentação registrada em `stock_movements`.
- Corrigir uma redução anterior para cima volta a debitar o saldo e exige disponibilidade no depósito (`INSUFFICIENT_STOCK`).
- O campo `deposit_notes` permite recados gerais ao motorista e ao restaurante.
- A operação inteira é atômica: a validação percorre todos os itens antes de qualquer escrita, de modo que uma rejeição nunca deixa o pedido parcialmente triado.

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

### 4.2 Cancelamento pelo Depósito
- O operador do depósito pode cancelar diretamente um pedido nos status `ABERTO`, `EM_ANALISE` e `EM_ATRASO`.
- **Justificativa obrigatória**, escolhida entre motivos fixos — *Insumos indisponíveis após confirmação*, *Erro operacional interno*, *Pedido duplicado*, *Problema de qualidade identificado na separação*, *Capacidade de entrega indisponível* — ou `Outro (descrever)` com campo livre.
- O motivo é gravado em `order_status_logs` e fica visível na linha do tempo do restaurante.
- Ocorrências durante a entrega (`EM_TRANSITO`) seguem pelo fluxo contextual do `TransitActionModal`, não por este.

### 4.3 Devolução Atômica de Saldo
- Ao transitar para `CANCELADO`, a Stored Procedure devolve aos produtos o **saldo efetivamente retido** (`COALESCE(approved_qty, requested_qty)`) e grava movimentações `ESTORNO_CANCELAMENTO` em `stock_movements`.
- O uso de `approved_qty` é o que impede o crédito duplo em pedidos já triados: a diferença reduzida na triagem já voltou ao estoque naquele momento.

---

## 5. Conferência na Entrega (Check-in do Restaurante)

Ao receber o pedido físico na cozinha, o restaurante finaliza o ciclo com um dos 3 desfechos:
1. `ENTREGUE_TOTAL`: Todos os itens foram recebidos conforme solicitado. O pedido passa para `CONCLUIDO_TOTAL`.
2. `ENTREGUE_PARCIAL`: Houve faltas na entrega. O pedido passa para `CONCLUIDO_PARCIAL` e o restaurante deve informar a justificativa obrigatória.
3. `NAO_ENTREGUE`: Pedido recusado, extraviado ou totalmente avariado. O pedido passa para `CONCLUIDO_NAO_ENTREGUE` com justificativa obrigatória.
