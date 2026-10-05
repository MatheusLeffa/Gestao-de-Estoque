// InsumoSync: ProductThumbnail — Miniatura de Produto com Fallback Temático por Categoria
// Author: ui-ux-designer / frontend-engineer

'use client';

import React, { useState } from 'react';
import {
  Package,
  Salad,
  Beef,
  Milk,
  Wine,
  UtensilsCrossed,
  LucideIcon,
} from 'lucide-react';

interface ProductThumbnailProps {
  imageUrl?: string | null;
  name: string;
  category?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

interface CategoryStyle {
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const CATEGORY_MAP: Record<string, CategoryStyle> = {
  'Carnes & Aves': {
    icon: Beef,
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-600',
    borderClass: 'border-rose-200/70',
  },
  'Hortifrúti': {
    icon: Salad,
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-600',
    borderClass: 'border-emerald-200/70',
  },
  'Laticínios': {
    icon: Milk,
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-600',
    borderClass: 'border-sky-200/70',
  },
  'Bebidas & Embalagens': {
    icon: Wine,
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-600',
    borderClass: 'border-amber-200/70',
  },
  'Mercearia & Temperos': {
    icon: UtensilsCrossed,
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-600',
    borderClass: 'border-indigo-200/70',
  },
};

const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  icon: Package,
  bgClass: 'bg-slate-100',
  textClass: 'text-slate-500',
  borderClass: 'border-slate-200',
};

const SIZE_MAP = {
  sm: { container: 'w-10 h-10 rounded-xl', icon: 'w-5 h-5' },
  md: { container: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7' },
  lg: { container: 'w-18 h-18 sm:w-20 sm:h-20 rounded-2xl', icon: 'w-9 h-9' },
  xl: { container: 'w-24 h-24 rounded-3xl', icon: 'w-12 h-12' },
};

export function ProductThumbnail({
  imageUrl,
  name,
  category = '',
  size = 'md',
  className = '',
}: ProductThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;

  const categoryStyle = CATEGORY_MAP[category] || DEFAULT_CATEGORY_STYLE;
  const FallbackIcon = categoryStyle.icon;

  if (imageUrl && !hasError) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden border border-slate-200/80 shadow-xs bg-slate-50 ${sizeConfig.container} ${className}`}
      >
        <img
          src={imageUrl}
          alt={name}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center border shadow-xs transition-all ${categoryStyle.bgClass} ${categoryStyle.textClass} ${categoryStyle.borderClass} ${sizeConfig.container} ${className}`}
      title={`${name} (${category})`}
    >
      <FallbackIcon className={sizeConfig.icon} />
    </div>
  );
}
