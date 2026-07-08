// src/components/charts/TopExtraCostsList.jsx
import React from 'react';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

export default function TopExtraCostsList({ rows }) {
  const { t } = useTranslation();

  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('chartNoCosts')}</div>;
  }

  const max = Math.max(...rows.map((r) => r.extraCost), 1);

  return (
    <div className="rank-list">
      {rows.map((r, i) => (
        <div className="rank-row" key={r.accountNumber}>
          <div className="rank-num">{i + 1}</div>
          <div className="rank-info">
            <div className="rank-name">{r.accountNumber} <span className="cell-muted" style={{ fontWeight: 400 }}>· {r.label}</span></div>
            <div className="rank-bar-track">
              <div className="rank-bar-fill" style={{ width: `${(r.extraCost / max) * 100}%` }} />
            </div>
          </div>
          <div className="rank-value" style={{ color: '#F5874F' }}>{formatCurrency(r.extraCost)}</div>
        </div>
      ))}
    </div>
  );
}
