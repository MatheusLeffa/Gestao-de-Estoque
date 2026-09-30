# CLAUDE.md — Protocolo Operacional do InsumoSync

Este arquivo orienta o Claude Code neste repositório. Ele **não substitui** o
[`antigravity.md`](antigravity.md), que continua sendo a **única fonte da verdade**
do produto. Aqui ficam apenas as instruções operacionais de como trabalhar.

---

## 1. O que é o projeto

**InsumoSync** — sistema web mobile-first de reposição de insumos entre um Depósito
Central e um Restaurante, com painel de Administrador. Trabalho acadêmico, obrigado a
rodar inteiramente em free-tier.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Lucide ·
Supabase (Postgres + RLS + Realtime) · deploy Vercel.

**Projeto Supabase:** `insumosync` (`ixjzheunfjwzqcncanvs`, região `sa-east-1`).
Só existe ambiente de produção; não há staging. Migrations são aplicadas via MCP do
Supabase e **espelhadas em `supabase/migrations/`** no mesmo commit.

---

## 2. Ordem de leitura obrigatória

Antes de qualquer alteração estrutural, leia nesta ordem:

1. [`antigravity.md`](antigravity.md) — visão, guard rails, personas, roadmap.
2. [`docs/business-rules.md`](docs/business-rules.md) — regras de negócio e estoque.
3. [`docs/database-schema.md`](docs/database-schema.md) — dicionário de dados e RPCs.
4. [`docs/state-machine.md`](docs/state-machine.md) — transições válidas.
5. [`AGENTS.md`](AGENTS.md) — matriz de especialidades.

---

## 3. Guard rails inegociáveis

Os 16 guard rails vivem no `antigravity.md`. Os que mais reprovam trabalho aqui:

- **Zero segredo no código.** Nenhuma chave, URL de projeto ou token hardcoded, e
  jamais em fallback (`process.env.X || 'valor'`). Variável ausente deve estourar erro.
- **Atomicidade no Postgres.** É proibido calcular baixa, reserva ou estorno de saldo
  em JavaScript. Toda movimentação de `current_stock` acontece dentro de uma RPC
  `SECURITY DEFINER` com `SELECT ... FOR UPDATE` nas linhas envolvidas.
- **Tipagem estrita.** Sem `any` solto. Entidades e respostas de RPC vivem em
  [`src/types/database.ts`](src/types/database.ts).
- **Mobile-first real.** Viewports de 360–420px, alvos de toque ≥ 44×44px, Bottom
  Sheets no lugar de modais centrais, `overflow-x: hidden` no container raiz.
- **Living blueprint sincronizado.** Mudou regra de negócio? O `antigravity.md` e o
  módulo correspondente em `docs/` são atualizados **antes** do código.
- **Plano antes de mudança estrutural.** `implementation_plan.md` apresentado e
  aprovado antes de mexer em schema, RPC ou máquina de estados.

---

## 4. Invariante de estoque (a regra que mais quebra)

O `place_order_with_reservation` **debita o estoque no ato da criação do pedido**.
Portanto:

> O saldo retido fora do `current_stock` por um item de pedido não-terminal é
> sempre o seu `approved_qty`.

Disso decorre, sem exceção:

1. Qualquer escrita em `approved_qty` move `current_stock` na direção oposta, na
   mesma transação, com registro em `stock_movements`.
2. O estorno de cancelamento usa `approved_qty`, nunca `requested_qty`.
3. Pedido em estado terminal não retém saldo.

Toda RPC que toca `approved_qty` precisa ser verificada contra a invariante:

```sql
-- constante por produto antes e depois de qualquer operação
select p.id, p.current_stock + coalesce(sum(oi.approved_qty), 0) as total
from products p
left join order_items oi on oi.product_id = p.id
left join orders o on o.id = oi.order_id
  and o.status not in ('CONCLUIDO_TOTAL','CONCLUIDO_PARCIAL','CONCLUIDO_NAO_ENTREGUE','CANCELADO')
group by p.id;
```

---

## 5. Comandos

```bash
npm run dev                      # desenvolvimento local (única forma de rodar hoje)
npx tsc --noEmit                 # obrigatório, 0 erros
npm run build                    # obrigatório, 0 erros
node scripts/security-audit.mjs  # roda sozinho no pre-commit; nunca use --no-verify
npm run hooks:install            # uma vez por clone, ativa o hook de pre-commit
```

---

## 6. Definition of Done

Nenhuma tarefa é encerrada sem:

- [ ] `antigravity.md` e `docs/` refletindo a regra implementada
- [ ] `npx tsc --noEmit` com 0 erros
- [ ] `npm run build` com 0 erros
- [ ] `node scripts/security-audit.mjs` aprovado
- [ ] Migration aplicada no Supabase **e** versionada em `supabase/migrations/`
- [ ] Invariante de estoque verificada quando a mudança tocar saldo

---

## 7. Delegação

Três subagentes, indexados em [`AGENTS.md`](AGENTS.md) e definidos em `.claude/agents/`:

- **`db-engineer`** — qualquer SQL, RPC, migration ou movimentação de `current_stock`.
  É o único com acesso de escrita ao Supabase.
- **`frontend-engineer`** — telas, componentes, UI mobile-first, services e Realtime.
- **`verifier`** — verificação somente-leitura ao fechar uma entrega.

Delegue quando a tarefa for autocontida e do domínio de um deles, quando houver
trabalho paralelo independente, ou para a verificação final. Ajuste pequeno se faz
direto. Não há agente de documentação: quem muda o código atualiza `antigravity.md`
e `docs/`.

---

## 8. Convenções

- **Idioma:** código, comentários, mensagens de UI e documentação em português.
- **Nomes:** identificadores de banco e de código em inglês; textos ao usuário em português.
- **Justificativas fixas:** todo campo de motivo na UI segue o padrão do projeto —
  lista de opções fixas mais `Outro (descrever)` com campo livre obrigatório.
- **Retorno de RPC:** sempre `JSONB` com `success: boolean`, mais `code` e `error`
  legíveis em caso de falha. O cliente nunca infere erro por exceção crua.
- **Dependências:** nova dependência npm exige justificativa técnica e aval do usuário.
