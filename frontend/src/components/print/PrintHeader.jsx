// src/components/print/PrintHeader.jsx
// Visible only in print/PDF output. Shows the Hoffmann & Partner AG
// letterhead (this dashboard's operator) together with the signed-in
// customer's own company name, so every printed report is unambiguous
// about whose figures it shows and who produced the dashboard.

import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { formatDateTime } from '../../utils/format';
import HoffmannPartnerLogo from '../branding/HoffmannPartnerLogo';

export default function PrintHeader({ reportTitle, user }) {
  const { t } = useTranslation();
  const customerLabel = user?.role === 'customer' ? (user.companyName || user.fullName) : null;

  return (
    <div className="print-header">
      <div className="print-header-brand">
        <HoffmannPartnerLogo height={28} className="print-header-logo" />
        {customerLabel && (
          <>
            <span className="print-header-sep">·</span>
            <span className="print-header-customer">{customerLabel}</span>
          </>
        )}
      </div>
      <div className="print-header-title">{reportTitle || t('printReportTitle')}</div>
      <div className="print-header-meta">
        <span>{t('printedOn')}: {formatDateTime(new Date().toISOString())}</span>
        {user?.fullName && <span> · {t('printedBy')}: {user.fullName}</span>}
      </div>
      <div className="print-header-rule" />
    </div>
  );
}
