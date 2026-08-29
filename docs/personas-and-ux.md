# 📱 Especificação de Personas & Diretrizes UX — InsumoSync

Este documento detalha a experiência de uso, layout Mobile-First, componentes touch-friendly e comportamento visual de cada uma das 3 personas do **InsumoSync**.

---

## 🎨 1. Diretrizes Gerais de Design System (Mobile-First)

- **Viewports Alvo:** 360px a 420px (otimizado para smartphones reais) com layout fluido responsivo em desktops/tablets.
- **Áreas de Toque:** Mínimo de 44px x 44px para botões, pílulas de filtro e seletores de quantidade (+ / -).
- **Sem Rolagem Lateral:** `overflow-x: hidden` no container raiz e no `body`.
- **Gavetas (Bottom Sheets):** Utilizadas no mobile para carrinhos de compra, filtros rápidos e modais de confirmação, garantindo conforto para o polegar.
- **Notificações:** Alertas toast visuais elegantes acompanhados de áudio chime suave (Web Audio API sintetizada).

---

## 👥 2. Telas e Fluxos por Persona

### 🍽️ A. Restaurante (Filial / Cozinha) — Rota `/restaurante`
1. **Catálogo de Insumos:**
   - Barra de busca instantânea no topo.
   - Pílulas horizontais de categorias com rolagem suave (`Todos`, `Carnes & Aves`, `Hortifrúti`, `Laticínios`, `Mercearia`, `Bebidas`).
   - Cards de insumos com nome, categoria, unidade de medida, saldo disponível no depósito e seletor numérico.
   - Bloqueio visual impedindo incremento além do saldo em estoque.
2. **Carrinho (Bottom Sheet):**
   - Botão flutuante no rodapé com contador de itens e badge animado.
   - Ao tocar, abre a gaveta Bottom Sheet listando os itens selecionados, quantidades, observações do pedido e botão de confirmação *Enviar Pedido*.
3. **Acompanhamento (Timeline):**
   - Lista de pedidos ativos e histórico.
   - Visualizador estilo app de entrega com linha do tempo vertical mostrando status, data/hora e justificativas.
4. **Conferência na Entrega (Check-in):**
   - Ação disponível quando o pedido está `EM_TRANSITO`.
   - Botões touch: `[✅ Recebido Total]`, `[⚠️ Recebido com Faltas]`, `[❌ Recusar / Extravio]`.

### 📦 B. Estoque Central (Depósito) — Rota `/estoque`
1. **Mini-Dashboard de Contadores:**
   - 3 Cards no topo:
     - 📥 *Pedidos para Analisar* (com badge pulsante).
     - 🚚 *Pedidos em Trânsito*.
     - ⚠️ *Itens com Estoque Baixo* (saldo <= ponto de pedido).
2. **Gestão de Insumos & Reposição:**
   - Filtro rápido `[⚠️ Apenas Estoque Baixo]`.
   - Botão `[+ Entrada Manual]` abrindo modal/drawer para adicionar estoque com motivo.
3. **Painel de Triagem em Tempo Real:**
   - Lista reativa de novos pedidos atualizada instantaneamente via Supabase Realtime com toque sonoro suave (*chime*).
   - Botões de ação rápida por card: `[Iniciar Separação]`, `[Apontar Atraso]`, `[Despachar]`, `[Aprovar Cancelamento]`.

### 👑 C. Administrador (Gestão & Analytics) — Rota `/admin`
1. **Cards de KPIs Gerais:**
   - Total de Pedidos no Mês, Taxa de Pontualidade (% no prazo), Volume de Insumos Movimentados e Itens Críticos.
2. **Gráficos e Indicadores:**
   - Gráfico de Motivos de Atraso (*Transporte* vs *Falta de Insumo*).
   - Proporção de Desfechos de Entrega (*Total* vs *Parcial* vs *Não Entregue*).
   - Tabela de consumo por categoria.

---

## 🎭 3. Modo Demonstração (Demo Switcher)
- Componente fixo no topo (`DemoSwitcher`) com 3 abas estilizadas:
  - `[📦 Estoque]` ➔ Navega para `/estoque`
  - `[🍽️ Restaurante]` ➔ Navega para `/restaurante`
  - `[👑 Administrador]` ➔ Navega para `/admin`
- Salva a preferência no `localStorage` e no `DemoContext` para persistência entre recarregamentos.
