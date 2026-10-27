'use client';

// InsumoSync: Tela de Login (Supabase Auth, e-mail e senha)
// Author: frontend-engineer
//
// Sem cadastro aberto e sem recuperação de senha: usuários são criados pelo
// administrador (docs/database-schema.md seção 4.4). O redirecionamento após
// o login é feito pelo AuthGate, a partir do papel do perfil.

import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, Sparkles, AlertCircle, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { signIn } from '@/lib/services/auth-service';

export default function LoginPage() {
  const { authNotice, clearAuthNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    clearAuthNotice();
    setSubmitting(true);

    const res = await signIn(email, password);
    if (!res.success) {
      setError(res.error ?? 'Não foi possível entrar.');
      setSubmitting(false);
    }
    // Em caso de sucesso o AuthGate assume e leva para a rota do papel.
  };

  return (
    <div className="flex-1 w-full overflow-x-hidden flex items-center justify-center px-4 py-10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Insumo<span className="text-blue-400">Sync</span>
          </h1>
          <p className="text-sm text-slate-400">Entre com o usuário fornecido pelo administrador.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-5 flex flex-col gap-4" noValidate>
          {authNotice && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800" role="status">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{authNotice}</span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">E-mail</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="voce@empresa.com"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Senha</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 pl-3 pr-12 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[48px] w-full rounded-xl bg-blue-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <p className="text-xs text-center text-slate-500">
            Esqueceu a senha? Peça ao administrador para redefinir.
          </p>
        </form>
      </div>
    </div>
  );
}
