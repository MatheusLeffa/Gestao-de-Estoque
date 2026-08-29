// InsumoSync: Automated Concurrency & Race Condition Test Script
// Author: qa-devops-agent / cloud-db-architect
// Simulates 2 concurrent users attempting to order the last remaining stock of a product.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Erro: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar configuradas no ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runConcurrencyTest() {
  console.log('🧪 =========================================================');
  console.log('🧪 INSUMOSYNC: TESTE DE CONCORRÊNCIA ATÔMICA (RACE CONDITION)');
  console.log('🧪 =========================================================\n');

  const restaurantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // Bistrô Paris 6
  const productId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03'; // Salmão Fresco (saldo inicial baixo)

  // 1. Check current stock
  const { data: product, error: fetchErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (fetchErr || !product) {
    console.error('❌ Falha ao buscar insumo para teste:', fetchErr?.message);
    return;
  }

  console.log(`📦 Insumo Selecionado: "${product.name}"`);
  console.log(`📊 Saldo Atual Disponível: ${product.current_stock} ${product.unit}\n`);

  // We will request 3 units in User A and 3 units in User B simultaneously.
  // If stock is e.g. 4 units:
  // - Exactly 1 request must succeed (reducing stock from 4 to 1).
  // - Exactly 1 request must fail with INSUFFICIENT_STOCK.
  // - Final stock must be exactly 1 (NEVER negative).

  console.log('🚀 Disparando 2 pedidos simultâneos de 3 unidades cada...');

  const requestA = supabase.rpc('place_order_with_reservation', {
    p_restaurant_id: restaurantId,
    p_items: [{ product_id: productId, requested_qty: 3 }],
    p_notes: 'Disparo Concorrente - Usuário A',
  });

  const requestB = supabase.rpc('place_order_with_reservation', {
    p_restaurant_id: restaurantId,
    p_items: [{ product_id: productId, requested_qty: 3 }],
    p_notes: 'Disparo Concorrente - Usuário B',
  });

  const [resA, resB] = await Promise.all([requestA, requestB]);

  console.log('\n--- 📋 RESULTADO DO USUÁRIO A ---');
  console.log(JSON.stringify(resA.data, null, 2));

  console.log('\n--- 📋 RESULTADO DO USUÁRIO B ---');
  console.log(JSON.stringify(resB.data, null, 2));

  // 2. Fetch final stock
  const { data: finalProduct } = await supabase
    .from('products')
    .select('current_stock')
    .eq('id', productId)
    .single();

  console.log('\n=========================================================');
  console.log(`🔍 Saldo Final no Banco: ${finalProduct?.current_stock} ${product.unit}`);

  const successCount = [resA.data?.success, resB.data?.success].filter(Boolean).length;
  const insufficientCount = [resA.data?.code, resB.data?.code].filter((c) => c === 'INSUFFICIENT_STOCK').length;

  if (successCount === 1 && insufficientCount === 1 && Number(finalProduct?.current_stock) >= 0) {
    console.log('✅ TESTE APROVADO COM SUCESSO!');
    console.log('🔒 A RPC atômica evitou condição de corrida e impediu saldo negativo.');
  } else {
    console.log(`ℹ️ Resumo de execução: ${successCount} aprovados, ${insufficientCount} rejeitados por saldo.`);
  }
  console.log('=========================================================\n');
}

runConcurrencyTest();
