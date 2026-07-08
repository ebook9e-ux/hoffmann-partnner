// src/components/charts/TrendLineChart.jsx
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import ChartTooltip from './ChartTooltip';
import { formatCompact } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

// data: [{ label, profit, loss, extraCost }]
export default function TrendLineChart({ data }) {
  const { t } = useTranslation();

  if (!data || data.length === 0) {
    return <div className="inline-empty">{t('chartNoTrendData')}</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232A36" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={{ stroke: '#232A36' }} tickLine={false} />
        <YAxis tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
        <Tooltip content={<ChartTooltip formatter={(v) => formatCompact(v)} />} />
        <Line type="monotone" dataKey="profit" name={t('legendProfit')} stroke="#1FCB8C" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="loss" name={t('legendLoss')} stroke="#F0495A" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
        <Line type="monotone" dataKey="extraCost" name={t('legendExtraCost')} stroke="#F5874F" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
