// InsumoSync: Máquina de estados dos pedidos (docs/state-machine.md seção 3)
// Espelho da função private.is_valid_transition do banco, que é quem decide de fato.
// Qualquer mudança aqui precisa ir junto com uma migration que altere a função.

import type { OrderStatus } from '@/types/database';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'ABERTO',
  'EM_ANALISE',
  'EM_ATRASO',
  'CANCELAMENTO_PENDENTE',
  'EM_TRANSITO',
  'CONCLUIDO_TOTAL',
  'CONCLUIDO_PARCIAL',
  'CONCLUIDO_NAO_ENTREGUE',
  'CANCELADO',
];

export const ALLOWED_TRANSITIONS: Readonly<Partial<Record<OrderStatus, readonly OrderStatus[]>>> = {
  ABERTO:                ['EM_ANALISE', 'CANCELADO'],
  EM_ANALISE:            ['EM_TRANSITO', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'CANCELADO'],
  EM_ATRASO:             ['EM_ANALISE', 'EM_TRANSITO', 'CANCELAMENTO_PENDENTE', 'CANCELADO'],
  CANCELAMENTO_PENDENTE: ['CANCELADO', 'EM_ANALISE'],
  EM_TRANSITO:           ['CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'EM_ATRASO', 'CANCELADO'],
};

/** Valida se a transição de status é permitida pela máquina de estados */
export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
