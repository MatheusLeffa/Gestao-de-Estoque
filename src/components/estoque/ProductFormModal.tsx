// InsumoSync: ProductFormModal — Cadastro e Edição de Produtos com Foto e Recorte 1:1
// Author: ui-ux-designer / frontend-engineer

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ModalPortal } from '@/components/ui/ModalPortal';
import {
  X,
  Package,
  Loader2,
  AlertCircle,
  Save,
  Plus,
  Camera,
  Crop,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Product, ProductUpsertPayload } from '@/types/database';
import { ImageCropModal } from '@/components/ui/ImageCropModal';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import { uploadProductImage } from '@/lib/services/inventory-service';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [customCategory, setCustomCategory] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY_FORM | 'customCategory', string>>>({});

  // Estados de Imagem e Recorte
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [wasImageRemoved, setWasImageRemoved] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
        setImageUrl(product.image_url || null);
      } else {
        setForm(EMPTY_FORM);
        setCustomCategory('');
        setImageUrl(null);
      }
      setPendingBlob(null);
      setTempImageSrc(null);
      setWasImageRemoved(false);
      setErrors({});
    }
  }, [isOpen, product]);

  // Scroll lock é gerenciado pelo ModalPortal

  if (!isOpen) return null;

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // ─── Manipulação de Arquivo e Disparo do Crop ──────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Criar URL local para recortar
    const localUrl = URL.createObjectURL(file);
    setTempImageSrc(localUrl);
    setIsCropOpen(true);

    // Limpar o input para permitir selecionar o mesmo arquivo novamente se quiser
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCropComplete = (croppedBlob: Blob, croppedDataUrl: string) => {
    setPendingBlob(croppedBlob);
    setImageUrl(croppedDataUrl);
    setWasImageRemoved(false);
    setIsCropOpen(false);
  };

  const handleRemoveImage = () => {
    setImageUrl(null);
    setPendingBlob(null);
    setTempImageSrc(null);
    setWasImageRemoved(true);
  };

  const handleReCrop = () => {
    if (tempImageSrc || imageUrl) {
      setTempImageSrc(tempImageSrc || imageUrl);
      setIsCropOpen(true);
    }
  };

  // ─── Validação & Envio ────────────────────────────────────────────────────
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

    let finalImageUrl: string | null = imageUrl;

    if (wasImageRemoved) {
      finalImageUrl = ''; // String vazia sinaliza remoção no banco/mock
    } else if (pendingBlob) {
      setIsUploadingImage(true);
      const uploadRes = await uploadProductImage(pendingBlob, 'insumo');
      setIsUploadingImage(false);

      if (uploadRes.success && uploadRes.url) {
        finalImageUrl = uploadRes.url;
      }
    }

    const finalCategory = form.category === 'Outro' ? customCategory.trim() : form.category;
    const payload: ProductUpsertPayload = {
      id: product?.id,
      name: form.name.trim(),
      category: finalCategory,
      unit: form.unit,
      current_stock: form.current_stock,
      min_stock_alert: form.min_stock_alert,
      image_url: finalImageUrl,
    };

    await onSave(payload);
  };

  const isBusy = isSubmitting || isUploadingImage;

  return (
    <>
      <ModalPortal isOpen={isOpen}>
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
        >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => !isBusy && onClose()}
        />

        {/* Sheet Modal */}
        <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
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
                  {isEditing ? 'Editar Insumo' : 'Novo Insumo'}
                </h2>
                {isEditing && (
                  <p className="text-xs text-slate-500 font-mono">{product!.name}</p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isBusy}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* ─── Seção de Imagem do Insumo (Upload & Recorte 1:1) ─────────── */}
            <div className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/60 flex items-center gap-4">
              {/* Miniatura ou Placeholder */}
              <div className="relative">
                <ProductThumbnail
                  imageUrl={imageUrl}
                  name={form.name || 'Novo Produto'}
                  category={form.category === 'Outro' ? customCategory : form.category}
                  size="lg"
                  className="rounded-2xl shadow-xs ring-2 ring-white"
                />
                {imageUrl && (
                  <span className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 text-white rounded-full shadow-xs">
                    <Crop className="w-3 h-3" />
                  </span>
                )}
              </div>

              {/* Controles de Foto */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-slate-500" />
                  Foto do Insumo
                </p>
                <p className="text-[11px] text-slate-500 truncate mb-2">
                  {imageUrl ? 'Enquadrada em proporção 1:1' : 'Tire uma foto ou escolha do dispositivo'}
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2">
                  {!imageUrl ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all shadow-xs min-h-[36px]"
                    >
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Adicionar Foto</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleReCrop}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all min-h-[36px]"
                        title="Ajustar enquadramento e corte"
                      >
                        <Crop className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Recortar</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:scale-95 transition-all min-h-[36px]"
                      >
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>Trocar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="p-2 rounded-xl text-xs font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all min-h-[36px]"
                        title="Remover foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

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
                Para ajustar o estoque atual, use o botão &quot;Reabastecer&quot; no catálogo.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 bg-white rounded-b-3xl shrink-0 flex gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy}
              className={`flex-[2] py-3 font-bold text-sm rounded-2xl text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                isEditing ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isUploadingImage ? 'Enviando imagem...' : 'Salvando...'}
                </>
              ) : isEditing ? (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Cadastrar Insumo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>

    {/* Modal de Recorte Nativo */}
      <ImageCropModal
        isOpen={isCropOpen}
        imageSrc={tempImageSrc}
        onClose={() => setIsCropOpen(false)}
        onCropComplete={handleCropComplete}
      />
    </>
  );
}
