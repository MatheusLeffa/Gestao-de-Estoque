// InsumoSync: ProductMoreActionsSheet — Ações secundárias do card de insumo
// Author: frontend-engineer
//
// Desativar e Remover são raros e um deles é destrutivo; ficam atrás do botão
// "⋯" do card para não competir com Reabastecer. Escolher uma opção apenas
// encaminha para o ProductActionModal, que continua sendo a confirmação real.

'use client';

import React from 'react';
import { X, EyeOff, Trash2, ChevronRight } from 'lucide-react';
import type { Product, ProductActionMode } from '@/types/database';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { ModalPortal } from '@/components/ui/ModalPortal';

interface ProductMoreActionsSheetProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSelect: (product: Product, mode: ProductActionMode) => void;
}

const ACTIONS: {
  mode: ProductActionMode;
  label: string;
  description: string;
  icon: typeof EyeOff;
  className: string;
  iconClassName: string;
}[] = [
  {
    mode: 'deactivate',
    label: 'Desativar insumo',
    description: 'Oculta do catálogo e preserva todo o histórico.',
    icon: EyeOff,
    className: 'text-amber-800 hover:bg-amber-50 border-amber-200',
    iconClassName: 'bg-amber-100 text-amber-700',
  },
  {
    mode: 'delete',
    label: 'Remover em definitivo',
    description: 'Somente se o insumo nunca foi usado em pedidos.',
    icon: Trash2,
    className: 'text-red-800 hover:bg-red-50 border-red-200',
    iconClassName: 'bg-red-100 text-red-700',
  },
];

export function ProductMoreActionsSheet({
  isOpen,
  product,
  onClose,
  onSelect,
}: ProductMoreActionsSheetProps) {
  if (!isOpen || !product) return null;

  return (
    <ModalPortal isOpen={isOpen}>
      <div
        className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
        role="dialog"
        aria-modal="true"
        aria-label={`Mais ações para ${product.name}`}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
          {/* Handle Mobile */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
            <div className="w-10 h-1 rounded-full bg-slate-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <ProductThumbnail
                imageUrl={product.image_url}
                name={product.name}
                category={product.category}
                size="sm"
              />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900 truncate">{product.name}</h2>
                <p className="text-xs text-slate-500 truncate">{product.category}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-11 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Opções */}
          <div className="px-5 py-4 space-y-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {ACTIONS.map(({ mode, label, description, icon: Icon, className, iconClassName }) => (
              <button
                key={mode}
                onClick={() => onSelect(product, mode)}
                className={`w-full p-3 rounded-2xl border bg-white flex items-center gap-3 text-left transition-colors active:scale-[0.99] min-h-[56px] ${className}`}
              >
                <span className={`p-2 rounded-xl shrink-0 ${iconClassName}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-[11px] text-slate-500 leading-snug">{description}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
