import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Erro: NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY não encontradas no ambiente.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkConnection() {
  console.log('Testing Supabase connection...');
  const { data, error } = await supabase.from('products').select('*').limit(5);
  if (error) {
    console.log('Query result error:', error.message, error.code);
  } else {
    console.log('Query successful, products count:', data?.length);
    console.log('Data:', data);
  }
}

checkConnection();
