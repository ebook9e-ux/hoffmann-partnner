// src/components/charts/ProfitLossColumnChart.jsx
import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import ChartTooltip from './ChartTooltip';
import { formatCompact } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

// data: [{ label, profit, loss, extraCost }]
export default function ProfitLossColumnChart({ data }) {
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return <div className="inline-empty">{t('chartNoData')}</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232A36" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={{ stroke: '#232A36' }} tickLine={false} />
        <YAxis tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => formatCompact(v)} />}
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
        />
        <Bar dataKey="profit" name={t('legendProfit')} fill="#1FCB8C" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="loss" name={t('legendLoss')} fill="#F0495A" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="extraCost" name={t('legendExtraCost')} fill="#F5874F" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
