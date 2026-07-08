// src/components/alerts/AlertsPanel.jsx
import React from 'react';
import { formatDateTime } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

const SEVERITY_ICON = { critical: '🔴', warning: '⚠️' };

export default function AlertsPanel({ alerts, onSelectAccount }) {
  const { t } = useTranslation();

  if (!alerts || alerts.length === 0) {
    return <div className="alerts-empty">{t('noAlerts')}</div>;
  }

  return (
    <div className="alerts-list">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={`alert-card ${a.severity}`}
          onClick={() => a.accountNumber && onSelectAccount?.(a.accountNumber)}
          style={{ cursor: a.accountNumber ? 'pointer' : 'default' }}
        >
          <span className="alert-icon">{SEVERITY_ICON[a.severity] || '⚠️'}</span>
          <div className="alert-text">
            <div>{a.message}</div>
            <div className="alert-meta">{formatDateTime(a.createdAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
