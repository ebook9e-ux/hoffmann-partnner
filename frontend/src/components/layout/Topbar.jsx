// src/components/layout/Topbar.jsx
import React from 'react';
import { downloadExport } from '../../services/api';
import { useTranslation } from '../../i18n/I18nContext';
import { printFullDashboard } from '../../utils/print';
import LanguageSwitcher from './LanguageSwitcher';
import PrintHeader from '../print/PrintHeader';

export default function Topbar({ title, subtitle, filters, lastUpdated, onRefresh, user }) {
  const { t } = useTranslation();

  async function handleExport(format) {
    try {
      await downloadExport(format, filters);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      {/* Visible only in the printed full-dashboard output */}
      <PrintHeader reportTitle={title} user={user} />

      <header className="topbar">
        <div>
          <div className="topbar-title">{title}</div>
          {subtitle && <div className="topbar-sub">{subtitle}</div>}
        </div>
        <div className="topbar-actions">
          <div className="refresh-indicator">
            <span className="refresh-dot" />
            {lastUpdated ? `${t('updated')} ${lastUpdated}` : t('live')}
          </div>
          <LanguageSwitcher />
          {onRefresh && <button className="btn btn-ghost" onClick={onRefresh}>↻ {t('refresh')}</button>}
          <button className="btn" onClick={() => handleExport('excel')}>⤓ {t('exportExcel')}</button>
          <button className="btn" onClick={() => handleExport('pdf')}>⤓ {t('exportPdf')}</button>
          <button className="btn btn-primary" onClick={printFullDashboard}>🖨️ {t('printAll')}</button>
        </div>
      </header>
    </>
  );
}
