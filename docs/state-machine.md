# 🔄 Máquina de Estados dos Pedidos — InsumoSync

Este documento formaliza todos os estados, eventos, condições de guarda e regras de transição do ciclo de vida de um pedido no **InsumoSync**.

---

## 1. Diagrama de Transição de Estados

```mermaid
stateDiagram-v2
    [*] --> ABERTO : Restaurante cria Pedido
(RPC: place_order_with_reservation)

    ABERTO --> EM_ANALISE : Estoque inicia separação
    ABERTO --> CANCELADO : Restaurante ou Estoque cancela
(Estorno Atômico)

    EM_ANALISE --> EM_TRANSITO : Estoque despacha para entrega
    EM_ANALISE --> EM_ATRASO : Estoque aponta atraso
[Justificativa Obrigatória]
    EM_ANALISE --> CANCELAMENTO_PENDENTE : Restaurante solicita cancelamento
    EM_ANALISE --> CANCELADO : Estoque cancela
[Justificativa Obrigatória]

    EM_ATRASO --> EM_ANALISE : Estoque retoma triagem
    EM_ATRASO --> EM_TRANSITO : Estoque soluciona e despacha
    EM_ATRASO --> CANCELAMENTO_PENDENTE : Restaurante solicita cancelamento
    EM_ATRASO --> CANCELADO : Estoque cancela
[Justificativa Obrigatória]

    CANCELAMENTO_PENDENTE --> CANCELADO : Estoque aprova
(Estorno Atômico)
    CANCELAMENTO_PENDENTE --> EM_ANALISE : Estoque recusa
(sem tela ainda)

    EM_TRANSITO --> CONCLUIDO_TOTAL : Restaurante recebe 100% OK
    EM_TRANSITO --> CONCLUIDO_PARCIAL : Restaurante recebe com faltas
[Faltas item a item + Justificativa]
    EM_TRANSITO --> CONCLUIDO_NAO_ENTREGUE : Restaurante recusa / extravio
[Motivo Obrigatório]
    EM_TRANSITO --> EM_ATRASO : Estoque aponta atraso na rota
    EM_TRANSITO --> CANCELADO : Estoque cancela (mercadoria volta)
(Estorno Atômico)

    CONCLUIDO_TOTAL --> [*]
    CONCLUIDO_PARCIAL --> [*]
    CONCLUIDO_NAO_ENTREGUE --> [*]
    CANCELADO --> [*]
```

---

## 2. Tabela de Estados e Permissões

| Estado | Significado | Ações Permitidas | Quem pode Alterar |
| :--- | :--- | :--- | :--- |
| `ABERTO` | Pedido gerado e estoque reservado no depósito. | Mover para `EM_ANALISE` ou `CANCELADO`. | Estoque ou Restaurante (cancelar). |
| `EM_ANALISE` | Operador do depósito está separando os itens. | Mover para `EM_TRANSITO`, `EM_ATRASO`, `CANCELAMENTO_PENDENTE` ou `CANCELADO`. | Estoque (despachar, atrasar ou cancelar) ou Restaurante (pedir cancelamento). |
| `EM_ATRASO` | Pedido sofreu impedimento logístico ou de saldo. | Retornar para `EM_ANALISE`, mover para `EM_TRANSITO`, `CANCELAMENTO_PENDENTE` ou `CANCELADO`. | Estoque, ou Restaurante (pedir cancelamento). |
| `CANCELAMENTO_PENDENTE` | Restaurante solicitou cancelamento após início da triagem. | Mover para `CANCELADO` (aprovar) ou voltar para `EM_ANALISE` (recusar; permitido no banco, ainda sem tela). | Estoque. |
| `EM_TRANSITO` | Pedido a caminho do restaurante. | Mover para `CONCLUIDO_TOTAL`, `CONCLUIDO_PARCIAL` ou `CONCLUIDO_NAO_ENTREGUE` (conferência), `EM_ATRASO` ou `CANCELADO`. | Restaurante (conferência) ou Estoque (atraso e cancelamento). |
| `CONCLUIDO_TOTAL` | Entrega realizada com sucesso integral. | Estado Final (Leitura). | Ninguém (imutável). |
| `CONCLUIDO_PARCIAL` | Entrega realizada com divergências justificadas. | Estado Final (Leitura). | Ninguém (imutável). |
| `CONCLUIDO_NAO_ENTREGUE` | Pedido recusado ou extraviado. | Estado Final (Leitura). | Ninguém (imutável). |
| `CANCELADO` | Pedido abortado e estoque devolvido ao depósito. | Estado Final (Leitura). | Ninguém (imutável). |

---

## 3. Condições de Guarda & Auditoria

0. **Matriz de transições validada no banco:** `private.transition_order_status` só aceita os pares da tabela abaixo, para **todos os papéis, inclusive o `admin`**. A fonte única da matriz no banco é `private.is_valid_transition(from, to)`, e o cliente espelha a mesma lista em `src/lib/state-machine.ts`. Respostas:
   - status de destino desconhecido → `INVALID_STATUS`;
   - pedido em estado final → `TERMINAL_STATE`;
   - par fora da matriz → `INVALID_TRANSITION`.

   Além disso, `orders.status` tem `CHECK` com os 9 status válidos.

   | De | Para |
   | :--- | :--- |
   | `ABERTO` | `EM_ANALISE`, `CANCELADO` |
   | `EM_ANALISE` | `EM_TRANSITO`, `EM_ATRASO`, `CANCELAMENTO_PENDENTE`, `CANCELADO` |
   | `EM_ATRASO` | `EM_ANALISE`, `EM_TRANSITO`, `CANCELAMENTO_PENDENTE`, `CANCELADO` |
   | `CANCELAMENTO_PENDENTE` | `CANCELADO`, `EM_ANALISE` |
   | `EM_TRANSITO` | `CONCLUIDO_TOTAL`, `CONCLUIDO_PARCIAL`, `CONCLUIDO_NAO_ENTREGUE`, `EM_ATRASO`, `CANCELADO` |
   | estados finais | nenhuma |

   Não existem autotransições (ex.: `EM_ATRASO → EM_ATRASO`).

1. **Campos Obrigatórios em Transições Críticas:**
   - Para `EM_ATRASO`: o campo `delay_reason` é obrigatório e recebe um dos motivos da lista fixa do `OrderApprovalModal` (ver `business-rules.md` seção 3.2) ou o texto livre digitado em *Outro*.
   - Para `CONCLUIDO_PARCIAL` e `CONCLUIDO_NAO_ENTREGUE`: O campo `notes` ou `delay_reason` deve conter a justificativa do restaurante.
   - Para `CANCELADO` pelo depósito: justificativa obrigatória, escolhida entre motivos fixos ou `Outro (descrever)` com campo livre.
   - Para redução de item na triagem (`approved_qty < requested_qty`): `reduction_reason` individual obrigatória, **validada no banco** pela RPC `apply_order_triage` (`REASON_REQUIRED`).
2. **Registro Automático de Auditoria:**
   - Toda mudança gera uma linha em `order_status_logs` com `(order_id, from_status, to_status, reason, created_at)`.
   - A triagem também é registrada, com `from_status = to_status`, descrevendo o saldo devolvido ou reservado. Não é uma mudança de estado, e sim um evento de auditoria visível na linha do tempo do restaurante.

3. **Transições Automáticas do Sistema:**
   - Ao inativar um insumo no catálogo com força, todo pedido `ABERTO`/`EM_ANALISE` que ficar sem nenhum item vai automaticamente para `CANCELADO`, com o motivo registrado. É a única transição que o sistema dispara sem ação direta de uma persona.

---

## 4. Quem Pode Cada Transição

Validado na RPC pública `transition_order_status` antes de qualquer escrita (resposta `FORBIDDEN` quando o papel não pode). Esta tabela diz **quem** pode; **quais** pares existem é a matriz da seção 3, item 0, que vale também para o `admin`.

| De | Para | `restaurante` (só pedido do próprio restaurante) | `estoque` | `admin` |
| :--- | :--- | :---: | :---: | :---: |
| `ABERTO` | `EM_ANALISE` | ❌ | ✅ | ✅ |
| `ABERTO` | `CANCELADO` | ✅ | ✅ | ✅ |
| `EM_ANALISE` / `EM_ATRASO` | `CANCELAMENTO_PENDENTE` | ✅ | ❌ | ✅ |
| `EM_ANALISE` | `EM_TRANSITO`, `EM_ATRASO`, `CANCELADO` | ❌ | ✅ | ✅ |
| `EM_ATRASO` | `EM_TRANSITO`, `EM_ANALISE`, `CANCELADO` | ❌ | ✅ | ✅ |
| `CANCELAMENTO_PENDENTE` | `CANCELADO` / `EM_ANALISE` | ❌ | ✅ | ✅ |
| `EM_TRANSITO` | `EM_ATRASO`, `CANCELADO` | ❌ | ✅ | ✅ |
| `EM_TRANSITO` | `CONCLUIDO_TOTAL`, `CONCLUIDO_PARCIAL`, `CONCLUIDO_NAO_ENTREGUE` | ✅ | ❌ | ✅ |

Em resumo: o `estoque` não conclui entregas nem pede cancelamento; o `restaurante` só cancela o próprio pedido aberto, pede cancelamento e confere a entrega. O cancelamento automático por inativação de insumo roda com o papel de quem inativou (`estoque` ou `admin`).
