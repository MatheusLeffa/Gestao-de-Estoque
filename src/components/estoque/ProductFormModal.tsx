// InsumoSync: ProductFormModal — Cadastro e Edição de Produtos no Catálogo
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  Loader2,
  AlertCircle,
  Save,
  Plus,
} from 'lucide-react';
import type { Product, ProductUpsertPayload } from '@/types/database';

interface ProductFormModalProps {
  isOpen: boolean;
  product: Product | null; // null = CREATE, Product = EDIT
  onClose: () => void;
  onSave: (payload: ProductUpsertPayload) => Promise<void>;
  isSubmitting?: boolean;
}

const PRODUCT_CATEGORIES = [
  'Carnes & Aves',
  'Hortifrúti',
  'Laticínios',
  'Mercearia & Temperos',
  'Bebidas & Embalagens',
  'Outro',
];

const PRODUCT_UNITS = ['kg', 'g', 'L', 'ml', 'un', 'cx', 'dz', 'pct', 'fardo'];

const EMPTY_FORM: Omit<ProductUpsertPayload, 'id'> = {
  name: '',
  category: '',
  unit: 'kg',
  current_stock: 0,
  min_stock_alert: 5,
};

export function ProductFormModal({
  isOpen,
  product,
  onClose,
  onSave,
  isSubmitting = false,
}: ProductFormModalProps) {
  const isEditing = !!product;
  const [form, setForm] = useState(EMPTY_FORM);
  const [customCategory, setCustomCategory] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY_FORM | 'customCategory', string>>>({});

  useEffect(() => {
    if (isOpen) {
      if (product) {
        const isKnownCategory = PRODUCT_CATEGORIES.includes(product.category);
        setForm({
          name: product.name,
          category: isKnownCategory ? product.category : 'Outro',
          unit: product.unit,
          current_stock: product.current_stock,
          min_stock_alert: product.min_stock_alert,
        });
        setCustomCategory(isKnownCategory ? '' : product.category);
      } else {
        setForm(EMPTY_FORM);
        setCustomCategory('');
      }
      setErrors({});
    }
  }, [isOpen, product]);

  if (!isOpen) return null;

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!form.name.trim()) newErrors.name = 'Nome é obrigatório.';
    if (!form.category) newErrors.category = 'Selecione uma categoria.';
    if (form.category === 'Outro' && !customCategory.trim()) {
      newErrors.customCategory = 'Informe o nome da categoria.';
    }
    if (!form.unit) newErrors.unit = 'Selecione uma unidade.';
    if (!isEditing && form.current_stock < 0) newErrors.current_stock = 'Estoque não pode ser negativo.';
    if (form.min_stock_alert < 0) newErrors.min_stock_alert = 'Valor mínimo não pode ser negativo.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    const finalCategory = form.category === 'Outro' ? customCategory.trim() : form.category;
    const payload: ProductUpsertPayload = {
      id: product?.id,
      name: form.name.trim(),
      category: finalCategory,
      unit: form.unit,
      current_stock: form.current_stock,
      min_stock_alert: form.min_stock_alert,
    };

    await onSave(payload);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Sheet Modal */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`p-1.5 rounded-lg ${isEditing ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <Package className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isEditing ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              {isEditing && (
                <p className="text-xs text-slate-500 font-mono">{product!.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Nome do produto <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Ex.: Frango Congelado, Azeite Extra Virgem..."
              className={`w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px] ${
                errors.name ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
              }`}
            />
            {errors.name && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
          </div>

          {/* Categoria */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Categoria <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setField('category', cat); setErrors((p) => ({ ...p, category: undefined })); }}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all min-h-[40px] ${
                    form.category === cat
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.category}</p>}
            {form.category === 'Outro' && (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => { setCustomCategory(e.target.value); setErrors((p) => ({ ...p, customCategory: undefined })); }}
                placeholder="Nome da nova categoria..."
                className={`mt-2 w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[44px] ${
                  errors.customCategory ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
                }`}
              />
            )}
            {errors.customCategory && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{errors.customCategory}</p>}
          </div>

          {/* Unidade */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Unidade de medida <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setField('unit', u)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all min-h-[40px] ${
                    form.unit === u
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Estoque Inicial (só criação) + Mínimo */}
          <div className="grid grid-cols-2 gap-3">
            {!isEditing && (
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                  Estoque inicial ({form.unit || '?'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.current_stock}
                  onChange={(e) => setField('current_stock', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[44px] ${
                    errors.current_stock ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
                  }`}
                />
                {errors.current_stock && <p className="text-xs text-red-500 mt-1">{errors.current_stock}</p>}
              </div>
            )}
            <div className={isEditing ? 'col-span-2' : ''}>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Alerta mínimo de estoque ({form.unit || '?'})
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.min_stock_alert}
                onChange={(e) => setField('min_stock_alert', parseFloat(e.target.value) || 0)}
                className={`w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[44px] ${
                  errors.min_stock_alert ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
                }`}
              />
              {errors.min_stock_alert && <p className="text-xs text-red-500 mt-1">{errors.min_stock_alert}</p>}
            </div>
          </div>

          {isEditing && (
            <p className="text-[11px] text-slate-400 text-center pt-1">
              Para ajustar o estoque atual, use o botão "Reabastecer" no catálogo.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white rounded-b-3xl shrink-0 flex gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`flex-[2] py-3 font-bold text-sm rounded-2xl text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
              isEditing ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : isEditing ? (
              <>
                <Save className="w-4 h-4" />
                Salvar Alterações
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Cadastrar Produto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
