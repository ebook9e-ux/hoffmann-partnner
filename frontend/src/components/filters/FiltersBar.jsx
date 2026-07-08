// src/components/filters/FiltersBar.jsx
import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';

export default function FiltersBar({ filters, onChange, accounts = [] }) {
  const { t } = useTranslation();

  const PERIODS = [
    { value: 'current', label: t('periodCurrent') },
    { value: '3m', label: t('period3m') },
    { value: '6m', label: t('period6m') },
    { value: '9m', label: t('period9m') },
    { value: '12m', label: t('period12m') },
  ];

  function set(key, value) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="filters-bar no-print">
      <div className="filter-group">
        <span className="filter-label">{t('filterPeriod')}</span>
        <div className="period-pills">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`period-pill ${filters.period === p.value ? 'active' : ''}`}
              onClick={() => set('period', p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">{t('filterAccountNumber')}</span>
        <select className="filter-select" value={filters.accountNumber || ''} onChange={(e) => set('accountNumber', e.target.value)}>
          <option value="">{t('filterAllAccounts')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.accountNumber}>{a.accountNumber} — {a.label}</option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-label">{t('filterStatus')}</span>
        <select className="filter-select" value={filters.status || ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">{t('filterAllStatuses')}</option>
          <option value="Active">{t('statusActive')}</option>
          <option value="Medium">{t('statusMedium')}</option>
          <option value="Inactive">{t('statusInactive')}</option>
        </select>
      </div>

      <div className="filter-group">
        <span className="filter-label">{t('filterCurrency')}</span>
        <select className="filter-select" value={filters.currency || ''} onChange={(e) => set('currency', e.target.value)}>
          <option value="">{t('filterAllCurrencies')}</option>
          <option value="CHF">CHF</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
    </div>
  );
}
