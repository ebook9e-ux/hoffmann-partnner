// src/components/charts/StatusDonutChart.jsx
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import ChartTooltip from './ChartTooltip';
import { useTranslation } from '../../i18n/I18nContext';

// data: [{ name: 'Active'|'Medium'|'Inactive', value, color }]
export default function StatusDonutChart({ data }) {
  const { t } = useTranslation();
  const total = (data || []).reduce((sum, d) => sum + d.value, 0);

  const STATUS_LABEL = { Active: t('statusActive'), Medium: t('statusMedium'), Inactive: t('statusInactive') };

  if (!data || total === 0) {
    return <div className="inline-empty">{t('chartNoAccounts')}</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={90}
            paddingAngle={3}
            stroke="none"
          >
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Pie>
          <Tooltip content={<ChartTooltip formatter={(v) => `${v} ${t('accountsUnit')}`} />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={donutCenterStyle}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{total}</div>
        <div style={{ fontSize: 10, color: '#8893A3' }}>{t('accountsUnit')}</div>
      </div>
      <div className="panel-legend" style={{ justifyContent: 'center', marginTop: 8 }}>
        {data.map((d) => (
          <span className="legend-item" key={d.name}>
            <i className="legend-dot" style={{ background: d.color }} /> {STATUS_LABEL[d.name] || d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

const donutCenterStyle = {
  position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
  textAlign: 'center', pointerEvents: 'none',
};
