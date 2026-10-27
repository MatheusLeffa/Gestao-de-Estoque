import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

const REQUIRED_PUBLIC_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  // O modo offline (mock-store) existe só para `next dev`. Um build sem as variáveis
  // do Supabase publicaria dados fictícios sem login, então o build falha aqui.
  if (phase === PHASE_PRODUCTION_BUILD) {
    const missing = REQUIRED_PUBLIC_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Build abortado: variáveis ausentes (${missing.join(', ')}). ` +
          'Configure-as no .env.local ou, na Vercel, para o ambiente deste deploy (Production e Preview).'
      );
    }
  }

  return {
    reactStrictMode: true,
    // Permite um segundo `next dev` na mesma pasta sem disputar o `.next` (ex.: preview do Claude).
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
  };
}
