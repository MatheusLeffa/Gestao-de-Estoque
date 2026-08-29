# 🤖 Equipe de Agentes e Subagentes Especializados — InsumoSync

Este arquivo declara formalmente os 8 subagentes especializados do projeto **InsumoSync**, seus papéis, gatilhos de atuação e runbooks.

---

## 👥 Matriz de Agentes Especializados

| Agente / Subagente | Especialidade | Gatilho de Atuação | Skill / Runbook |
| :--- | :--- | :--- | :--- |
| 🛡️ **`security-auditor`** | Auditoria de Segurança & Zero Chaves | Execução obrigatória antes de qualquer commit ou alteração sensível | [security-auditor](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/security-auditor/SKILL.md) |
| 🏛️ **`cloud-db-architect`** | Supabase, SQL, RLS & Realtime | Migrations, DDLs, Stored Procedures com `SELECT ... FOR UPDATE` | [cloud-db-architect](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/cloud-db-architect/SKILL.md) |
| ⚙️ **`backend-workflow-engine`** | Máquina de Estados & Regras de Negócio | Transições de status, estorno de estoque e validações | [backend-workflow-engine](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/backend-workflow-engine/SKILL.md) |
| 📱 **`frontend-engineer`** | Next.js App Router & Client State | Rotas, hooks de estado, consumo de RPCs e Realtime | [frontend-engineer](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/frontend-engineer/SKILL.md) |
| 🎨 **`ui-ux-designer`** | Mobile-First UI & Micro-interações | Tailwind CSS, Bottom Sheets, touch targets e áudio chime | [ui-ux-designer](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/ui-ux-designer/SKILL.md) |
| 📊 **`analytics-specialist`** | KPIs, Gráficos & Dashboards | Métricas de pontualidade, curvas de consumo e relatórios | [analytics-specialist](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/analytics-specialist/SKILL.md) |
| 📜 **`doc-specialist`** | Living Blueprint & Hub-and-Spoke | Sincronização pós-tarefa de `antigravity.md` e `docs/*` | [doc-specialist](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/doc-specialist/SKILL.md) |
| 🧪 **`qa-devops-agent`** | CI/CD, Demo Switcher & Concorrência | Testes de carga/concorrência, seed e esteira de build | [qa-devops-agent](file:///c:/Users/mathe/source/repos/Google%20AntiGravity/Gestao%20de%20Estoque/.agents/skills/qa-devops-agent/SKILL.md) |

---

## 🔒 Diretriz de Execução do `security-auditor`:
> Antes de qualquer `git commit` ou conclusão de tarefa, o subagente `security-auditor` DEVE rodar `node scripts/security-audit.mjs` para certificar que nenhum token, chave privada, anon key ou URL em fallback foi inserida no código.
