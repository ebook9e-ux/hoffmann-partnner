// src/pages/AccountDetailPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Topbar from '../components/layout/Topbar';
import KpiCard from '../components/kpi/KpiCard';
import FiltersBar from '../components/filters/FiltersBar';
import ProfitLossColumnChart from '../components/charts/ProfitLossColumnChart';
import TrendLineChart from '../components/charts/TrendLineChart';
import PrintableSection from '../components/print/PrintableSection';
import {
  getAccountDetail, getAccountKpis, getAccountMonthly, getAccountTransactions,
  getAccountsList, getLatestRates, getSavedUser,
} from '../services/api';
import { formatCurrency, formatPercent, formatDate } from '../utils/format';
import { useTranslation } from '../i18n/I18nContext';

const STATUS_ICON = { Active: '🟢', Medium: '🟡', Inactive: '🔴' };

export default function AccountDetailPage({ accountNumber, onSelectAccount, onBack }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ period: '12m' });
  const [accountsList, setAccountsList] = useState([]);
  const [account, setAccount] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const STATUS_LABEL = { Active: t('statusActive'), Medium: t('statusMedium'), Inactive: t('statusInactive') };

  const load = useCallback(async () => {
    if (!accountNumber) return;
    setLoading(true);
    setError('');
    try {
      const [acc, k, m, tx, accList, rates] = await Promise.all([
        getAccountDetail(accountNumber),
        getAccountKpis(accountNumber, filters),
        getAccountMonthly(accountNumber, filters),
        getAccountTransactions(accountNumber, 100),
        getAccountsList(),
        getLatestRates(),
      ]);
      setAccount(acc); setKpis(k); setMonthly(m); setTransactions(tx); setAccountsList(accList);

      const relevant = rates.find((r) => r.from === acc.currency) || rates[0];
      setRate(relevant);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountNumber, filters]);

  useEffect(() => { load(); }, [load]);

  if (!accountNumber) {
    return (
      <>
        <Topbar title={t('accountDetailsTitle')} subtitle={t('accountDetailsSubtitle')} user={getSavedUser()} />
        <div className="page">
          <AccountPicker accounts={accountsList} onPick={onSelectAccount} fetchList={async () => setAccountsList(await getAccountsList())} t={t} />
        </div>
      </>
    );
  }

  if (loading && !account) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div>{t('loadingAccount')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div>{t('loadAccountFailed')}: {error}</div>
        <button className="btn btn-primary" onClick={load}>{t('retry')}</button>
      </div>
    );
  }

  return (
    <>
      <Topbar
        title={`${t('navAccounts')}: ${account.accountNumber}`}
        subtitle={account.label}
        filters={{ ...filters, accountNumber: account.accountNumber }}
        onRefresh={load}
        user={getSavedUser()}
      />
      <div className="page">
        <div className="filters-bar no-print">
          <button className="btn btn-ghost" onClick={onBack}>{t('backToAllAccounts')}</button>
          <FiltersBar filters={filters} onChange={setFilters} accounts={accountsList} />
        </div>

        <div className="section">
          <PrintableSection id="account-identity" className="panel" >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('statusAndScore')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`status-badge ${account.status}`}>
                    <span className="status-dot" /> {STATUS_ICON[account.status]} {STATUS_LABEL[account.status]}
                  </span>
                  <span className="cell-num" style={{ fontSize: 14, fontWeight: 800 }}>{account.score}/15</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>🔵 {t('balance')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>
                  {formatCurrency(account.balance, account.currency)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>🟣 {t('exchangeRate')} ({account.currency})</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--purple)' }}>
                  {rate?.rate ? `${rate.from} → ${rate.to}: ${rate.rate.toFixed(4)}` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('expenseLimit')}</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                  {formatCurrency(account.expenseLimit, account.currency)}
                </div>
              </div>
            </div>
          </PrintableSection>
        </div>

        {(account.haben != null || account.soll != null || account.betrag != null || account.statementDate) && (
          <div className="section">
            <PrintableSection id="account-imported" className="panel">
              <div className="panel-title" style={{ marginBottom: 12 }}>{t('importedStatementTitle')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('colHaben')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {account.haben != null ? formatCurrency(account.haben, account.currency) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('colSoll')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {account.soll != null ? formatCurrency(account.soll, account.currency) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('colBetrag')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {account.betrag != null ? formatCurrency(account.betrag, account.currency) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{t('colStatementDate')}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {account.statementDate ? new Date(account.statementDate).toLocaleDateString() : '—'}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 12 }}>{t('importedStatementHint')}</div>
            </PrintableSection>
          </div>
        )}

        <PrintableSection id="account-kpis" className="section">
          <div className="kpi-grid">
            <KpiCard label={t('detailKpiTotalProfit')} icon="🟢" tone="green" value={formatCurrency(kpis.totalProfit, account.currency)} />
            <KpiCard label={t('detailKpiTotalLoss')} icon="🔴" tone="red" value={formatCurrency(kpis.totalLoss, account.currency)} />
            <KpiCard label={t('detailKpiNetProfit')} icon="📊" tone={kpis.netProfit >= 0 ? 'green' : 'red'} value={formatCurrency(kpis.netProfit, account.currency)} />
            <KpiCard label={t('detailKpiExtraExpenses')} icon="🟠" tone="yellow" value={formatCurrency(kpis.extraExpenses, account.currency)} />
            <KpiCard label={t('detailKpiProfitMargin')} icon="◈" tone="blue" value={formatPercent(kpis.profitMargin)} />
            <KpiCard label={t('detailKpiExpenseRatio')} icon="◈" tone="yellow" value={formatPercent(kpis.expenseRatio)} />
            <KpiCard label={t('detailKpiAvgMonthlyProfit')} icon="📈" tone="green" value={formatCurrency(kpis.avgMonthlyProfit, account.currency)} />
            <KpiCard label={t('detailKpiAvgMonthlyLoss')} icon="📉" tone="red" value={formatCurrency(kpis.avgMonthlyLoss, account.currency)} />
          </div>
        </PrintableSection>

        <div className="grid-2 section">
          <PrintableSection id="account-column-chart" title={t('chartColumnTitle')} className="panel">
            <ProfitLossColumnChart data={monthly} />
          </PrintableSection>
          <PrintableSection id="account-trend-chart" title={t('chartTrendTitle')} className="panel">
            <TrendLineChart data={monthly} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="account-transactions" title={t('transactionHistory')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{transactions.length} {t('records')}</div>
            <TransactionHistoryTable rows={transactions} currency={account.currency} t={t} />
          </PrintableSection>
        </div>
      </div>
    </>
  );
}

function TransactionHistoryTable({ rows, currency, t }) {
  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('noTransactions')}</div>;
  }
  return (
    <div className="data-table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('colDate')}</th><th>{t('colDescription')}</th><th>{t('colCategory')}</th>
            <th>{t('colType')}</th><th style={{ textAlign: 'right' }}>{t('colAmount')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((tx) => (
            <tr key={tx.id} style={{ cursor: 'default' }}>
              <td className="cell-muted">{formatDate(tx.date)}</td>
              <td>{tx.description}</td>
              <td><span className="status-badge Medium" style={{ background: 'var(--panel2)', color: 'var(--muted)' }}>{tx.category}</span></td>
              <td>{tx.type === 'Profit' ? `🟢 ${t('typeProfit')}` : `🔴 ${t('typeLoss')}`}</td>
              <td className="cell-num" style={{ textAlign: 'right', color: tx.type === 'Profit' ? 'var(--green)' : 'var(--red)' }}>
                {tx.type === 'Profit' ? '+' : '-'}{formatCurrency(tx.amount, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountPicker({ accounts, onPick, fetchList, t }) {
  useEffect(() => { if (accounts.length === 0) fetchList(); }, []); // eslint-disable-line

  return (
    <div className="panel">
      <div className="panel-head"><span className="panel-title">{t('chooseAccount')}</span></div>
      <div className="account-chips">
        {accounts.map((a) => (
          <button key={a.id} className="account-chip" onClick={() => onPick(a.accountNumber)}>
            {a.accountNumber} · {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
