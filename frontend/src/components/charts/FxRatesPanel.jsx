// src/components/charts/FxRatesPanel.jsx
import React from 'react';
import { formatDateTime } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

export default function FxRatesPanel({ rates }) {
  const { t } = useTranslation();

  if (!rates || rates.length === 0) {
    return <div className="inline-empty">{t('chartNoFx')}</div>;
  }

  return (
    <div className="fx-grid">
      {rates.map((r) => (
        <div className="fx-card" key={`${r.from}_${r.to}`}>
          <div className="fx-pair">{r.from} → {r.to}</div>
          <div className="fx-rate">{r.rate != null ? r.rate.toFixed(4) : '—'}</div>
          <div className="fx-updated">
            {r.recordedAt ? `${t('updated')} ${formatDateTime(r.recordedAt)}` : t('fxNoData')}
          </div>
        </div>
      ))}
    </div>
  );
}
