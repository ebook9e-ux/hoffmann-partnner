// src/components/tables/AccountsStatusTable.jsx
import React from 'react';
import { formatCurrency } from '../../utils/format';
import { useTranslation } from '../../i18n/I18nContext';

const STATUS_COLOR = { Active: '#1FCB8C', Medium: '#F5B544', Inactive: '#F0495A' };
const STATUS_ICON = { Active: '🟢', Medium: '🟡', Inactive: '🔴' };

export default function AccountsStatusTable({ rows, onSelectAccount }) {
  const { t } = useTranslation();
  const STATUS_LABEL = { Active: t('statusActive'), Medium: t('statusMedium'), Inactive: t('statusInactive') };

  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('noAccountsMatch')}</div>;
  }

  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('colAccountNumber')}</th>
            <th>{t('colStatus')}</th>
            <th>{t('colScore')}</th>
            <th>{t('colProfit')}</th>
            <th>{t('colLoss')}</th>
            <th>{t('colExtraCost')}</th>
            <th>{t('colSaldo')}</th>
            <th>{t('colHaben')}</th>
            <th>{t('colSoll')}</th>
            <th>{t('colBetrag')}</th>
            <th>{t('colStatementDate')}</th>
            <th>{t('colAlert')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} onClick={() => onSelectAccount(r.accountNumber)}>
              <td className="cell-mono">
                {r.accountNumber}
                <div className="cell-muted" style={{ fontSize: 11 }}>{r.label}</div>
              </td>
              <td>
                <span className={`status-badge ${r.status}`}>
                  <span className="status-dot" />
                  {STATUS_ICON[r.status]} {STATUS_LABEL[r.status]}
                </span>
              </td>
              <td>
                <div className="score-bar-wrap">
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{ width: `${(r.score / 15) * 100}%`, background: STATUS_COLOR[r.status] }}
                    />
                  </div>
                  <span className="cell-num">{r.score}/15</span>
                </div>
              </td>
              <td className="cell-num" style={{ color: '#1FCB8C' }}>{formatCurrency(r.profit, r.currency)}</td>
              <td className="cell-num" style={{ color: '#F0495A' }}>{formatCurrency(r.loss, r.currency)}</td>
              <td className="cell-num" style={{ color: '#F5874F' }}>{formatCurrency(r.extraCost, r.currency)}</td>
              <td className="cell-num">{r.saldo != null ? formatCurrency(r.saldo, r.currency) : <span className="cell-muted">—</span>}</td>
              <td className="cell-num">{r.haben != null ? formatCurrency(r.haben, r.currency) : <span className="cell-muted">—</span>}</td>
              <td className="cell-num">{r.soll != null ? formatCurrency(r.soll, r.currency) : <span className="cell-muted">—</span>}</td>
              <td className="cell-num">{r.betrag != null ? formatCurrency(r.betrag, r.currency) : <span className="cell-muted">—</span>}</td>
              <td className="cell-muted">{r.statementDate ? new Date(r.statementDate).toLocaleDateString() : '—'}</td>
              <td>{r.hasAlert ? <span className="alert-flag">⚠️</span> : <span className="cell-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
