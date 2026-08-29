'use client';

// InsumoSync: Root Page Redirector
// Author: frontend-engineer

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/contexts/DemoContext';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { currentPersona } = useDemo();

  useEffect(() => {
    const savedPersona = localStorage.getItem('insumosync_persona') || currentPersona || 'estoque';
    router.replace(`/${savedPersona}`);
  }, [router, currentPersona]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      <p className="text-sm font-medium">Carregando InsumoSync...</p>
    </div>
  );
}
