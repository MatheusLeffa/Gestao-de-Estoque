# 🤖 Subagentes Especializados — InsumoSync

Índice único dos subagentes do projeto. Cada definição tem **uma fonte**, em
`.claude/agents/`, e um ponto de entrada curto para o Google Antigravity em
`.agents/skills/`, que aponta para ela.

---

## 👥 Matriz de Agentes

| Agente | Domínio | Quando acionar | Definição |
| :--- | :--- | :--- | :--- |
| 🏛️ **`db-engineer`** | Tudo que roda no Postgres: migrations, RPCs atômicas, máquina de estados, estorno, RLS, Realtime, agregações de analytics e forecast | Qualquer tarefa que crie ou altere SQL ou que movimente `current_stock` | [`.claude/agents/db-engineer.md`](.claude/agents/db-engineer.md) |
| 📱 **`frontend-engineer`** | Tudo que roda no navegador: App Router, componentes, UI mobile-first, gráficos, services, Realtime, chime, DemoSwitcher | Criar ou alterar telas, componentes, hooks, contextos e services | [`.claude/agents/frontend-engineer.md`](.claude/agents/frontend-engineer.md) |
| 🧪 **`verifier`** | Verificação independente e somente-leitura: credenciais, tsc/build, invariante de estoque, RLS, sincronia da documentação | Ao fechar uma entrega, e sempre que env, cliente Supabase ou RLS forem tocados | [`.claude/agents/verifier.md`](.claude/agents/verifier.md) |

---

## 🧭 Quando delegar

Subagente começa sem contexto e relê a documentação, então delegar tem custo. Vale a pena
quando a tarefa é **autocontida e do domínio de um agente**, quando há **trabalho paralelo
independente** (ex.: RPC nova e tela nova ao mesmo tempo), ou quando se quer uma
**verificação feita por quem não escreveu o código**. Ajustes pequenos o agente principal
faz direto, respeitando as mesmas regras.

**Documentação é responsabilidade de quem muda o código.** Não existe agente dedicado a
docs: o `db-engineer` e o `frontend-engineer` atualizam `antigravity.md` e `docs/` antes
do código, e o `verifier` confere a sincronia.

---

## 🔒 Auditoria de credenciais

`node scripts/security-audit.mjs` roda automaticamente em todo `git commit` pelo hook
[`.githooks/pre-commit`](.githooks/pre-commit). Ative uma vez por clone:

```bash
npm run hooks:install
```

Nunca use `git commit --no-verify` para contornar a auditoria.

---

## 🗂️ Histórico

Até a Fase 5.5 o projeto usava 8 subagentes (`security-auditor`, `cloud-db-architect`,
`backend-workflow-engine`, `frontend-engineer`, `ui-ux-designer`, `analytics-specialist`,
`doc-specialist`, `qa-devops-agent`). Eles foram consolidados nos 3 acima porque dividiam
os mesmos domínios — a máquina de estados vive em RPCs, e UI e front são o mesmo arquivo
`.tsx`. Os cabeçalhos `Author:` nos arquivos de código citam os nomes antigos e foram
mantidos como registro histórico.
