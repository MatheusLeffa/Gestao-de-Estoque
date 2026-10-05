# 📸 Implementation Plan — Imagens nos Insumos do Catálogo (Upload, Recorte 1:1 e Visualização)

> **Projeto:** InsumoSync  
> **Persona foco:** Estoque Central (Depósito) & Restaurante (Filial)  
> **Protocolo:** `antigravity.md` (Living Blueprint) & Guard Rails Arquiteturais  
> **Status:** Planejamento aguardando aprovação para execução  

---

## 1. 🎯 Objetivo da Entrega

Permitir que o operador do estoque central, ao cadastrar ou editar um insumo no catálogo:
1. Envie uma foto do produto (via upload de arquivo ou câmera no celular).
2. Recorte a foto em proporção **quadrada padronizada (1:1)** através de uma interface interativa (arraste e zoom), com compressão automática em **WebP (ex: 500x500px, ~40-60KB)** direto no navegador (zero consumo desnecessário de cota do Supabase Free-Tier).
3. Visualize a foto com acabamento premium tanto na listagem de estoque do depósito quanto no catálogo de pedidos do restaurante, com fallback elegante por categoria para insumos sem foto.

---

## 2. 🏛️ Arquitetura Técnica & Banco de Dados

### 2.1. PostgreSQL & Supabase
- **Migration SQL:** `supabase/migrations/20261005000000_product_images.sql`
  - Adiciona a coluna `image_url TEXT` na tabela `public.products`.
  - Atualiza a RPC `create_or_update_product` adicionando o parâmetro `p_image_url TEXT DEFAULT NULL`:
    - Na criação (`INSERT`), inclui `image_url`.
    - Na edição (`UPDATE`), atualiza `image_url = COALESCE(p_image_url, image_url)`.
- **Supabase Storage:**
  - Bucket público `product-images` com política de leitura pública (`SELECT`) e escrita autenticada/service.
  - No ambiente de desenvolvimento/demo sem Supabase configurado, armazenamento local da imagem comprimida (DataURL WebP) no `mock-store.ts` (`localStorage`).

### 2.2. Tipagem TypeScript Estrita (`src/types/database.ts`)
- Adição de `image_url?: string | null;` na interface `Product`.
- Adição de `image_url?: string | null;` na interface `ProductUpsertPayload`.

---

## 3. ✂️ Motor de Recorte e Compressão Client-Side (Mobile-First)

### 3.1. Modal de Recorte (`ImageCropModal.tsx`)
- Componente nativo em **HTML5 Canvas + React** (ou `react-easy-crop` se preferir biblioteca externa):
  - **Zero dependências extras pesadas**, respeitando o Guard Rail #4 de controle de dependências.
  - Máscara circular/quadrada com cantos arredondados (1:1).
  - Suporte a toque móvel (arrasto e pinch) e mouse (pan & scroll zoom).
  - Controles inferiores:
    - Slider de Zoom com botões `-` e `+`.
    - Botão de rotação em 90°.
    - Botão "Recortar & Aplicar".
- **Pipeline de Compressão:**
  - O Canvas exporta em `image/webp` com qualidade `0.85` e dimensão máxima de `500x500px`.
  - Uma foto original de 8MB tirada na câmera do celular vira um arquivo ultra-leve de ~50KB em milissegundos, carregando instantaneamente em conexões móveis fracas.

---

## 4. 🎨 Design & Experiência de Usuário (UX/UI)

### 4.1. Modal de Cadastro/Edição (`ProductFormModal.tsx`)
- Área de upload no topo do formulário:
  - Se não houver foto: dropzone compacto e estilizado com ícone `Camera`, botão "Adicionar Foto" e indicação de formato.
  - Se houver foto: miniatura `80x80px` com cantos arredondados, borda suave e ações rápidas sobre a imagem:
    - ✂️ *Recortar / Ajustar* (reabre o modal de crop).
    - 🔄 *Trocar Foto*.
    - 🗑️ *Remover Foto*.

### 4.2. Card do Insumo no Depósito (`src/app/estoque/page.tsx`)
- Layout horizontal harmonioso:
  - Miniatura `72x72px` à esquerda do card com `object-cover rounded-2xl border border-slate-100 shadow-xs`.
  - Placeholder temático quando sem foto: gradiente sutil e ícone correspondente à categoria:
    - *Carnes & Aves*: Fundo vermelho suave + ícone `Beef`.
    - *Hortifrúti*: Fundo verde suave + ícone `Salad` / `Leaf`.
    - *Laticínios*: Fundo azul suave + ícone `Milk`.
    - *Mercearia*: Fundo âmbar suave + ícone `Package`.
    - *Bebidas*: Fundo ciano suave + ícone `Wine` / `CupSoda`.

### 4.3. Card do Insumo no Restaurante (`src/app/restaurante/page.tsx`)
- Miniatura integrada ao card de compras:
  - Header visual do produto que facilita o reconhecimento imediato pelos cozinheiros e equipe da cozinha na hora de solicitar reposições.

---

## 5. 📋 Fases de Execução

1. **Fase 1 — Atualização do Living Blueprint & Documentação:**
   - Atualizar `antigravity.md` e `docs/database-schema.md` com a nova coluna `image_url` e a assinatura estendida da RPC `create_or_update_product`.
2. **Fase 2 — Banco de Dados & Tipagem:**
   - Criar `supabase/migrations/20261005000000_product_images.sql`.
   - Atualizar `src/types/database.ts`.
3. **Fase 3 — Serviços & Mock Store:**
   - Implementar função de upload/processamento em `src/lib/services/storage-service.ts` (ou `inventory-service.ts`).
   - Atualizar `mock-store.ts` para persistir `image_url` no `localStorage`.
4. **Fase 4 — Componente de Recorte (`ImageCropModal.tsx`):**
   - Criar modal de crop responsivo com Canvas, zoom e pan compatível com mobile touch.
5. **Fase 5 — Integração no `ProductFormModal.tsx`:**
   - Adicionar o seletor de imagens, pré-visualização e disparo do corte.
6. **Fase 6 — Atualização Visual das Telas (Depósito & Restaurante):**
   - Integrar miniaturas e placeholders temáticos em `src/app/estoque/page.tsx` e `src/app/restaurante/page.tsx`.
7. **Fase 7 — Verificação & Qualidade:**
   - Rodar auditoria de credenciais (`security-audit.mjs`), `npx tsc --noEmit` e teste funcional de ponta a ponta.
