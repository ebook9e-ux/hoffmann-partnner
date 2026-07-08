// src/components/charts/FxMonthlyPnlPanel.jsx
// Monthly FX revaluation profit/loss, one card per currency the
// company holds (CHF, USD, EUR) — CHF is the reporting/base currency
// so it carries no revaluation of its own; USD and EUR show exactly
// how much the balance held in that currency gained or lost in CHF
// terms since the 1st of the month.

import React from 'react';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

export default function FxMonthlyPnlPanel({ rows }) {
  const { t } = useTranslation();

  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('chartNoFx')}</div>;
  }

  return (
    <div className="fx-pnl-grid">
      {rows.map((r) => {
        const isProfit = (r.profitLoss ?? 0) >= 0;
        return (
          <div className="fx-pnl-card" key={r.currency}>
            <div className="fx-pnl-head">
              <span className="fx-pnl-currency">{r.currency}</span>
              {r.isBaseCurrency && <span className="fx-pnl-base-badge">{t('fxBaseCurrency')}</span>}
            </div>
            <div className="fx-pnl-row">
              <span className="cell-muted">{t('fxHeld')}</span>
              <span className="cell-mono">{formatCurrency(r.balance, r.currency)}</span>
            </div>
            {!r.isBaseCurrency && (
              <>
                <div className="fx-pnl-row">
                  <span className="cell-muted">{t('fxRateStart')}</span>
                  <span className="cell-mono">{r.rateMonthStart != null ? r.rateMonthStart.toFixed(4) : '—'}</span>
                </div>
                <div className="fx-pnl-row">
                  <span className="cell-muted">{t('fxRateNow')}</span>
                  <span className="cell-mono">{r.rateNow != null ? r.rateNow.toFixed(4) : '—'}</span>
                </div>
                <div className="fx-pnl-value-row">
                  <span className="cell-muted">{t('fxPl')}</span>
                  <span className={isProfit ? 'tone-green-text' : 'tone-red-text'} style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {r.profitLoss != null ? `${isProfit ? '+' : ''}${formatCurrency(r.profitLoss, 'CHF')}` : '—'}
                  </span>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
