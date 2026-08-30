// InsumoSync: StatusBadge — Componente de Badge de Status com Cores Semânticas
// Author: ui-ux-designer

import React from 'react';
import {
  Clock,
  Search,
  AlertTriangle,
  Truck,
  CheckCircle2,
  XCircle,
  Hourglass,
  PackageCheck,
  PackageX,
} from 'lucide-react';
import type { OrderStatus } from '@/types/database';

interface StatusConfig {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}

const STATUS_CONFIG: Record<OrderStatus, StatusConfig> = {
  ABERTO: {
    label: 'Aberto',
    icon: Clock,
    className: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  EM_ANALISE: {
    label: 'Em Análise',
    icon: Search,
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  EM_ATRASO: {
    label: 'Em Atraso',
    icon: AlertTriangle,
    className: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  CANCELAMENTO_PENDENTE: {
    label: 'Canc. Pendente',
    icon: Hourglass,
    className: 'bg-rose-50 text-rose-600 border-rose-200',
  },
  EM_TRANSITO: {
    label: 'Em Trânsito',
    icon: Truck,
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  CONCLUIDO_TOTAL: {
    label: 'Entregue Total',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  CONCLUIDO_PARCIAL: {
    label: 'Entregue Parcial',
    icon: PackageCheck,
    className: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  CONCLUIDO_NAO_ENTREGUE: {
    label: 'Não Entregue',
    icon: PackageX,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  CANCELADO: {
    label: 'Cancelado',
    icon: XCircle,
    className: 'bg-red-50 text-red-600 border-red-200',
  },
};

interface StatusBadgeProps {
  status: OrderStatus;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    icon: Clock,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const Icon = config.icon;

  const sizeClass =
    size === 'md'
      ? 'text-xs px-2.5 py-1 gap-1.5'
      : 'text-[11px] px-2 py-0.5 gap-1';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-lg border ${config.className} ${sizeClass}`}
    >
      <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {config.label}
    </span>
  );
}
