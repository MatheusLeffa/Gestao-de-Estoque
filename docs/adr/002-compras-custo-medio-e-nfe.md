# ADR 002: Custo Médio Ponderado Móvel e Leitura da NF-e no Navegador

- **Status:** Aceito
- **Data:** 2026-10-28
- **Escopo:** Compras e Notas Fiscais no Almoxarifado (business-rules seção 10)

---

## Contexto
O almoxarifado passou a registrar compras por nota fiscal, com custo por item. Duas decisões técnicas tinham alternativas reais:

1. **Como valorar o estoque** a partir dos custos de compra.
2. **Onde ler o XML da NF-e** para preencher a entrada automaticamente.

O projeto roda inteiramente no free-tier (Vercel e Supabase), não tem backend próprio além das RPCs do Postgres e proíbe calcular saldo em JavaScript.

---

## Decisão 1: custo médio ponderado móvel, guardado em `product_costs`

A cada `ENTRADA_COMPRA`, a RPC `register_purchase_entry` recalcula, na mesma transação e com a linha do produto travada:

```
médio_novo = (S × médio_atual + Q × custo_convertido) / (S + Q)
```

$S$ é o `current_stock` antes da entrada. Com $S \le 0$ ou sem médio anterior, o médio passa a ser o custo da entrada.

### Alternativas consideradas
- **PEPS/FIFO por lote:** exige rastrear lotes e consumir camadas de custo a cada `SAIDA_PEDIDO`, mexendo em todas as RPCs de saída e estorno. É desproporcional para um sistema que não controla validade nem lote.
- **Só o último custo:** é simples, mas distorce o valor do estoque quando o preço oscila.

### Consequências
- O cálculo vive no Postgres, junto da atualização de `current_stock`, e respeita o guard rail de atomicidade.
- **O estorno não recalcula o médio para trás.** Desfazer uma média ponderada exigiria reconstruir o histórico a partir do saldo de cada momento. Fica documentado como limitação; para corrigir um custo, lança-se a nota correta.
- `product_costs` é separada de `products` porque todos os papéis leem `products` pela RLS, e custo é informação só do `estoque` e do `admin`.

---

## Decisão 2: XML da NF-e lido no navegador, com `DOMParser`

O arquivo é lido pelo `DOMParser` nativo do navegador. O resultado só **preenche** a tela da Nova Entrada; quem grava é a RPC, que valida tudo de novo.

### Alternativas consideradas
- **Supabase Edge Function:** seria mais um runtime para manter, implantar e proteger, consumiria cota do free-tier, e mesmo assim a RPC teria de revalidar tudo.
- **Parse em SQL (`xpath` no Postgres):** levaria o XML inteiro ao banco só para extrair campos que o almoxarife ainda vai revisar e associar a insumos na tela.

### Consequências
- **Zero dependência nova:** `DOMParser` é nativo e não resolve entidades externas, então não há risco de XXE.
- **A assinatura digital da NF-e não é validada.** O XML é documento de apoio; a entrada é confirmada por uma pessoa e o arquivo fica anexado à nota. Um XML adulterado seria aceito, o que é aceitável para uso interno e está documentado.
- O `DOMParser` não existe no Node: os testes da leitura do XML rodam num navegador headless.
