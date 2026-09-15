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
- **Justificativa Obrigatória:** O operador deve selecionar um dos motivos oferecidos pelo `OrderApprovalModal`:
  - `Falta de Produto` — insumo danificado no estoque ou avaria.
  - `Transporte Indisponível` — falta de veículo.
  - `Problema Logístico` — impedimento operacional na rota ou na expedição.
  - `Aguardando Reposição de Fornecedor` — dependência externa de suprimento.
  - `Outro` — exige descrição em campo livre, conforme a convenção do projeto.
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

---

## 6. Métricas e Indicadores do Painel do Administrador

Todas as métricas são calculadas no PostgreSQL pela RPC `get_admin_analytics()`.
As definições abaixo são normativas: a implementação segue este documento, e não o contrário.

### 6.1 Taxa de Pontualidade

**Base de cálculo:** pedidos que chegaram a um desfecho de entrega — `CONCLUIDO_TOTAL`,
`CONCLUIDO_PARCIAL` ou `CONCLUIDO_NAO_ENTREGUE`.

**Exclusões explícitas:**
- Pedidos `CANCELADO` ficam **fora da base**. Um pedido cancelado nunca foi entregue, logo
  não é nem pontual nem atrasado. Incluí-lo inflaria artificialmente o indicador.
- Pedidos ainda em andamento (`ABERTO`, `EM_ANALISE`, `EM_ATRASO`, `EM_TRANSITO`,
  `CANCELAMENTO_PENDENTE`) também ficam fora: o desfecho ainda não existe.

**Critério de atraso:** o pedido é atrasado quando satisfaz **qualquer uma** destas condições:
1. Passou por `EM_ATRASO` em algum momento do ciclo (`order_status_logs.to_status = 'EM_ATRASO'`).
2. Tem `delay_reason` preenchido.

O critério é histórico, não do status final — um pedido que atrasou e depois foi entregue
continua contando como atrasado.

A segunda condição não é redundante: o fluxo real sempre grava as duas coisas juntas, mas
pedidos criados por seed ou por importação podem carregar o motivo sem a linha de log
correspondente. Um `delay_reason` gravado já é evidência suficiente de atraso, e ignorá-lo
faria o indicador reportar pontualidade perfeita para um pedido que exibe, na própria tela,
o motivo pelo qual atrasou.

**Fórmula:** `pontuais / base`, onde `pontuais = base - atrasados`.

**Base vazia:** com zero pedidos concluídos, a métrica é **indefinida** e o painel exibe
estado vazio. Exibir `100%` nesse caso seria enganoso.

### 6.2 Motivos de Atraso
Distribuição dos pedidos por `orders.delay_reason`, considerando apenas os registros com
motivo preenchido. O gráfico agrupa por valor gravado, o que inclui tanto os motivos da
lista fixa quanto os textos livres digitados em `Outro` — a lista completa está na seção 3.2.

### 6.3 Desfechos de Entrega
Contagem de pedidos por status terminal de entrega: `CONCLUIDO_TOTAL`, `CONCLUIDO_PARCIAL`
e `CONCLUIDO_NAO_ENTREGUE`.

### 6.4 Curva de Consumo de Insumos
Soma de `COALESCE(delivered_qty, approved_qty, requested_qty)` por insumo, restrita aos
itens de pedidos `CONCLUIDO_TOTAL` e `CONCLUIDO_PARCIAL`.

O `COALESCE` reflete a realidade operacional: nem todo fluxo preenche `delivered_qty`, e
nesse caso o melhor proxy do que chegou à cozinha é o que o depósito aprovou.
`CONCLUIDO_NAO_ENTREGUE` **não** representa consumo e fica fora.

### 6.5 Volume de Pedidos no Tempo
Série diária dos últimos 14 dias, com duas contagens por dia: pedidos **criados**
(`created_at`) e pedidos **concluídos** (`updated_at` de pedidos em status terminal de entrega).
Dias sem movimento aparecem com zero, para que a série não distorça a leitura do intervalo.

### 6.6 Itens Críticos
Insumos com `is_active = true` e `current_stock <= min_stock_alert`.
Insumos desativados não entram: não podem ser pedidos, logo não representam risco operacional.

---

## 7. Previsibilidade de Estoque e Recomendações de Reposição

A previsibilidade de estoque é calculada no PostgreSQL pela RPC `get_stock_forecasting(p_days_window)`.
A função é estritamente somente leitura e analisa a taxa real de saídas dos insumos para projetar a data de esgotamento e calcular lotes de compra recomendados antes do desabastecimento.

### 7.1 Janela de Análise e Saídas Líquidas ($Q_{out}$)
- Janela de análise padrão de **14 dias** (configurável via parâmetro).
- A saída líquida de estoque considera o maior valor entre o saldo de saídas em `stock_movements` (somatório de `SAIDA_PEDIDO` descontados os `ESTORNO_CANCELAMENTO`) e o total de insumos em `order_items` de pedidos ativos ou concluídos (`o.status NOT IN ('CANCELADO')`), garantindo precisão tanto com movimentações do dia a dia quanto em bases de dados populadas por seed.

### 7.2 Consumo Médio Diário e Dias até o Esgotamento
- **Consumo médio diário ($C_{dia}$):** $\text{total\_outflow} / \text{dias\_da\_janela}$.
- **Dias de cobertura ($D_{esgota}$):** $\text{current\_stock} / C_{dia}$ (quando $C_{dia} > 0$).
- **Data prevista de término:** $\text{data\_atual} + D_{esgota}\text{ dias}$.

### 7.3 Níveis Normativos de Urgência
1. `ESGOTADO`: `current_stock <= 0`. Risco máximo, desabastecimento consumado.
2. `CRITICO`: $D_{esgota} \le 2\text{ dias}$ OU (`current_stock <= min_stock_alert` com $C_{dia} > 0$). Risco iminente em até 48 horas.
3. `ALERTA`: $D_{esgota} \le 5\text{ dias}$ OU `current_stock <= min_stock_alert`. Cobertura inferior a 1 semana.
4. `ATENCAO`: $D_{esgota} \le 10\text{ dias}$. Programação de compra necessária nos próximos dias.
5. `ESTAVEL`: $D_{esgota} > 10\text{ dias}$ e acima do ponto de reposição.
6. `SEM_CONSUMO`: $C_{dia} = 0$ e acima do ponto de reposição.

### 7.4 Quantidade Sugerida de Reposição ($Q_{sugerida}$)
Para restabelecer um estoque-alvo que cubra **14 dias de demanda média projetada** mais a margem de segurança de segurança (`min_stock_alert`):
- Com consumo ativo ($C_{dia} > 0$):
  $$S_{alvo} = (C_{dia} \times 14) + \text{min\_stock\_alert}$$
  $$Q_{sugerida} = \max(0, \lceil S_{alvo} - \text{current\_stock} \rceil)$$
- Sem saídas recentes, mas abaixo da margem de segurança:
  $$Q_{sugerida} = (\text{min\_stock\_alert} \times 2) - \text{current\_stock}$$
- Se o estoque for estável ($S_{alvo} \le \text{current\_stock}$), $Q_{sugerida} = 0$.

---

## 8. Previsibilidade de Reposição no Restaurante (Kitchen Reorder Intelligence)

Para que as cozinhas dos restaurantes possam solicitar insumos proativamente ao Estoque Central antes da ruptura em seus preparos, o sistema calcula recomendações personalizadas por unidade através da RPC PostgreSQL `get_restaurant_recommendations(p_restaurant_id, p_days_window)`.

### 8.1 Base de Cálculo por Restaurante
- **Janela Padrão de Análise:** 30 dias (ou configurável via parâmetro).
- **Consumo Real da Cozinha ($Q_{rest}$):** Soma dos itens de pedidos concluídos (`CONCLUIDO_TOTAL`, `CONCLUIDO_PARCIAL`) ou em trânsito (`EM_TRANSITO`) exclusivamente daquele `p_restaurant_id`.
- **Intervalo de Reabastecimento:** Identifica a data do último pedido do insumo pela unidade (`last_ordered_at`) e calcula os dias decorridos (`days_since_last_order`).
- **Disponibilidade no Depósito Central:** Apenas insumos com estoque disponível positivo no Estoque Central (`current_stock > 0`) são recomendados para pedido imediato.

### 8.2 Critérios Normativos de Urgência da Cozinha
1. `URGENTE`:
   - O restaurante consome o insumo regularmente ($\ge 2$ pedidos ou ritmo frequente) e já se passaram mais de 6 dias desde o último pedido; **OU**
   - O estoque central está em nível crítico (`current_stock <= min_stock_alert`), exigindo que o restaurante garanta sua cota antes do desabastecimento geral.
2. `RECOMENDADO`:
   - Mais de 3 a 5 dias desde o último pedido em produtos de alto giro da cozinha (carnes, laticínios, hortifrúti).
3. `ROTINA`:
   - Itens de consumo periódico com mais de 7 dias sem reposição e disponibilidade ampla no depósito.

### 8.3 Quantidade Sugerida de Pedido ($Q_{pedido}$)
- O volume recomendado busca cobrir o ciclo médio de pedido do restaurante (calculado como média por pedido ou $\sim 3$ a 7 dias de consumo da unidade).
- É limitado rigorosamente pelo saldo disponível no Estoque Central:
  $$Q_{pedido} = \min(Q_{calculado}, \text{current\_stock}_{\text{central}})$$
- Garante que a cozinha nunca tente adicionar ao carrinho mais insumos do que o armazém central possui fisicamente.

### 8.4 Integração com Interface Mobile-First (/restaurante)
- **Banner Inteligente:** Exibe contagem de itens em nível crítico/urgente com botão de "Pedir Tudo (+X un)".
- **Filtro Rápido:** Chip `🔮 Sugeridos (N)` filtra instantaneamente o catálogo para os insumos que a cozinha necessita repor.
- **Badges nos Cards:** Indicação visual em cada insumo com botão de adição rápida `[+ Sugerido]`.
- **Bottom Sheet de Previsão (`RestaurantForecastModal`):** Permite inspecionar a justificativa de cada sugestão, ajustar quantidades individualmente ou adicionar o lote completo com 1 toque.


