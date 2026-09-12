// InsumoSync: Gráficos do Painel do Administrador — Fase 5
// Author: analytics-specialist / ui-ux-designer
//
// Componentes puros de apresentação: recebem dados já agregados pelo PostgreSQL
// e não fazem nenhum cálculo de métrica. Cada gráfico trata explicitamente o
// estado vazio — um painel sem dados diz que não há dados, em vez de desenhar
// um gráfico vazio que parece quebrado.

'use client';

import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Inbox } from 'lucide-react';
import type {
  DelayReasonStat,
  OutcomeStat,
  ConsumptionStat,
  TimelinePoint,
} from '@/types/database';
import { OUTCOME_LABELS, formatDayLabel } from '@/lib/services/analytics-service';

// Paleta categórica do projeto, alinhada aos tons semânticos já usados na UI.
const OUTCOME_COLORS: Record<string, string> = {
  CONCLUIDO_TOTAL: '#059669',        // emerald-600
  CONCLUIDO_PARCIAL: '#d97706',      // amber-600
  CONCLUIDO_NAO_ENTREGUE: '#dc2626', // red-600
};

const DELAY_COLORS = ['#4f46e5', '#0284c7', '#7c3aed', '#c026d3', '#0891b2'];

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 12px rgb(15 23 42 / 0.08)',
} as const;

// Os formatadores do Recharts recebem `ValueType | undefined`. Declarar os
// parâmetros como `unknown` e estreitar aqui mantém a tipagem estrita do projeto
// sem recorrer a `any` nem a imports de caminhos internos da biblioteca.
function asCount(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** Extrai o dado original da primeira série apontada pelo tooltip. */
function firstPayload<T>(payload: unknown): T | undefined {
  if (!Array.isArray(payload) || payload.length === 0) return undefined;
  const entry = payload[0] as { payload?: T };
  return entry?.payload;
}

// ─── Moldura comum dos cartões de gráfico ────────────────────────────────────

interface ChartCardProps {
  title: string;
  subtitle?: string;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}

function ChartCard({ title, subtitle, isEmpty, emptyMessage, children }: ChartCardProps) {
  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-subtle">
      <div className="mb-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      {isEmpty ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-slate-400">
          <Inbox className="w-7 h-7" />
          <p className="text-xs text-center max-w-[240px] leading-relaxed">{emptyMessage}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ─── Desfechos de Entrega (rosca) ────────────────────────────────────────────

export function OutcomesChart({ data }: { data: OutcomeStat[] }) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const chartData = data.map((d) => ({
    name: OUTCOME_LABELS[d.status] ?? d.status,
    value: d.count,
    status: d.status,
  }));

  return (
    <ChartCard
      title="Desfechos de Entrega"
      subtitle={`${total} pedido${total !== 1 ? 's' : ''} conferido${total !== 1 ? 's' : ''} na cozinha`}
      isEmpty={total === 0}
      emptyMessage="Nenhum pedido chegou a um desfecho de entrega ainda."
    >
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            strokeWidth={2}
          >
            {chartData.map((entry) => (
              <Cell key={entry.status} fill={OUTCOME_COLORS[entry.status] ?? '#64748b'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: unknown, name: unknown) => [
              `${asCount(value)} pedido(s)`,
              String(name ?? ''),
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Motivos de Atraso (barras horizontais) ──────────────────────────────────

export function DelayReasonsChart({ data }: { data: DelayReasonStat[] }) {
  return (
    <ChartCard
      title="Motivos de Atraso"
      subtitle="Distribuição dos pedidos que registraram atraso"
      isEmpty={data.length === 0}
      emptyMessage="Nenhum atraso registrado. Todos os pedidos seguiram sem impedimento."
    >
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 52)}>
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis
            type="category"
            dataKey="reason"
            width={110}
            tick={{ fontSize: 10, fill: '#475569' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: '#f8fafc' }}
            formatter={(value: unknown) => [`${asCount(value)} pedido(s)`, 'Ocorrências']}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={22}>
            {data.map((entry, i) => (
              <Cell key={entry.reason} fill={DELAY_COLORS[i % DELAY_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Curva de Consumo de Insumos (barras horizontais) ────────────────────────

export function ConsumptionChart({ data }: { data: ConsumptionStat[] }) {
  // Nome longo de insumo estoura o eixo em 360px: encurta preservando o início,
  // que é a parte que identifica o item.
  const chartData = data.map((d) => ({
    ...d,
    label: d.name.length > 20 ? `${d.name.slice(0, 19)}…` : d.name,
  }));

  return (
    <ChartCard
      title="Curva de Consumo de Insumos"
      subtitle="Top 8 em pedidos entregues, total e parcial"
      isEmpty={data.length === 0}
      emptyMessage="Ainda não há pedidos entregues com itens registrados para calcular consumo."
    >
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 10, fill: '#475569' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={{ fill: '#f8fafc' }}
            formatter={(value: unknown, _name: unknown, item: unknown) => {
              const row = (item as { payload?: ConsumptionStat })?.payload;
              return [`${asCount(value)} ${row?.unit ?? ''}`.trim(), 'Consumido'];
            }}
            labelFormatter={(_label: unknown, payload: unknown) =>
              firstPayload<ConsumptionStat>(payload)?.name ?? ''
            }
          />
          <Bar dataKey="total" fill="#0f172a" radius={[0, 8, 8, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Volume de Pedidos no Tempo (área) ───────────────────────────────────────

export function OrdersTimelineChart({ data }: { data: TimelinePoint[] }) {
  const hasMovement = data.some((d) => d.created > 0 || d.completed > 0);
  const chartData = data.map((d) => ({ ...d, label: formatDayLabel(d.day) }));

  return (
    <ChartCard
      title="Volume de Pedidos"
      subtitle="Últimos 14 dias"
      isEmpty={!hasMovement}
      emptyMessage="Nenhuma movimentação de pedidos nos últimos 14 dias."
    >
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={chartData} margin={{ left: -20, right: 8, top: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="gradCriados" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradConcluidos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          <Area
            type="monotone"
            dataKey="created"
            name="Criados"
            stroke="#4f46e5"
            strokeWidth={2}
            fill="url(#gradCriados)"
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Concluídos"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#gradConcluidos)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
