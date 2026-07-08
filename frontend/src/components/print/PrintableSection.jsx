// src/components/print/PrintableSection.jsx
import React, { useRef } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { printSection } from '../../utils/print';

let sectionCounter = 0;

// Wraps any panel/section with a print-id and a small print button.
// Clicking the button isolates this section for printing — see
// utils/print.js: printSection().
export default function PrintableSection({ id, title, children, className = '' }) {
  const { t } = useTranslation();
  const autoId = useRef(`print-section-${++sectionCounter}`);
  const sectionId = id || autoId.current;

  return (
    <div className={`printable-section ${className}`} data-print-section={sectionId}>
      {title && (
        <div className="printable-section-head">
          <span className="panel-title">{title}</span>
          <button className="print-btn no-print" onClick={() => printSection(sectionId)} title={t('printSection')}>
            🖨️ <span>{t('printSection')}</span>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
