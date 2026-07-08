// src/components/charts/AccountBalancesChart.jsx
// One standard, professional bar per account, colored by currency —
// works for however many accounts a customer (or the admin, across a
// customer) has. Each account only ever holds one currency (CHF, USD
// or EUR each have their own dedicated bank account), so color-by-
// currency doubles as a legend of which account is which currency.

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import ChartTooltip from './ChartTooltip';
import { formatCompact } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

const CURRENCY_COLOR = { CHF: '#3E8EF7', USD: '#1FCB8C', EUR: '#B47CF0' };

export default function AccountBalancesChart({ accounts }) {
  const { t } = useTranslation();

  const data = (accounts || [])
    .filter((a) => a.saldo != null || a.balance != null)
    .map((a) => ({
      label: a.accountNumber,
      currency: a.currency,
      balance: Number(a.saldo ?? a.balance ?? 0),
    }));

  if (data.length === 0) {
    return <div className="inline-empty">{t('chartNoAccounts')}</div>;
  }

  return (
    <>
      <div className="panel-legend" style={{ marginBottom: 10 }}>
        {Object.entries(CURRENCY_COLOR).map(([cur, color]) => (
          <span className="legend-item" key={cur}><i className="legend-dot" style={{ background: color }} /> {cur}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#232A36" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={{ stroke: '#232A36' }} tickLine={false} />
          <YAxis tick={{ fill: '#8893A3', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatCompact} />
          <Tooltip content={<ChartTooltip formatter={(v) => formatCompact(v)} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="balance" name={t('colSaldo')} radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((d) => (
              <Cell key={d.label} fill={CURRENCY_COLOR[d.currency] || '#8893A3'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
