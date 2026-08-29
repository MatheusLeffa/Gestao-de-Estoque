---
description: Regras de arquitetura, tipagem estrita, Mobile-First e sincronização do Living Blueprint
trigger: always_on
---

# 🛡️ Guard Rails Arquiteturais do InsumoSync

1. **Atomicidade no Supabase:**
   - Proibido calcular baixa ou reserva de estoque no cliente JS. Todas as reservas concorrentes devem ser processadas no PostgreSQL via Stored Procedure RPC com `SELECT ... FOR UPDATE`.

2. **Mobile-First Real:**
   - Interfaces projetadas para viewports de 360px a 420px. Alvos de toque mínimos de 44x44px, gavetas em Bottom Sheet e `overflow-x: hidden` no container raiz.

3. **Tipagem Estrita:**
   - Proibido o uso de tipos genéricos soltos (`any`). Todas as entidades e RPCs devem estar tipadas em `src/types/database.ts`.

4. **Living Blueprint Sincronizado:**
   - O arquivo `antigravity.md` na raiz e os módulos em `docs/` devem ser mantidos 100% sincronizados pelo `doc-specialist` após cada entrega.
