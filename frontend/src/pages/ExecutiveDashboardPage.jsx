// src/pages/ExecutiveDashboardPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Topbar from '../components/layout/Topbar';
import KpiCard from '../components/kpi/KpiCard';
import FiltersBar from '../components/filters/FiltersBar';
import AccountsStatusTable from '../components/tables/AccountsStatusTable';
import ProfitLossColumnChart from '../components/charts/ProfitLossColumnChart';
import TrendLineChart from '../components/charts/TrendLineChart';
import StatusDonutChart from '../components/charts/StatusDonutChart';
import TopExtraCostsList from '../components/charts/TopExtraCostsList';
import FxRatesPanel from '../components/charts/FxRatesPanel';
import FxMonthlyPnlPanel from '../components/charts/FxMonthlyPnlPanel';
import AccountBalancesChart from '../components/charts/AccountBalancesChart';
import AlertsPanel from '../components/alerts/AlertsPanel';
import PrintableSection from '../components/print/PrintableSection';
import {
  getKpis, getAccountsStatus, getProfitLossByMonth, getTrend,
  getStatusDistribution, getTopExtraCosts, getAlerts, getLatestRates, getAccountsList, getFxMonthlyPl,
} from '../services/api';
import { formatCurrency } from '../utils/format';
import { useTranslation } from '../i18n/I18nContext';
import { getSavedUser } from '../services/api';

const DEFAULT_FILTERS = { period: 'current' };

export default function ExecutiveDashboardPage({ onSelectAccount }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [accountsList, setAccountsList] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [statusRows, setStatusRows] = useState([]);
  const [columnData, setColumnData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [donutData, setDonutData] = useState([]);
  const [topCosts, setTopCosts] = useState([]);
  const [fxRates, setFxRates] = useState([]);
  const [fxMonthlyPl, setFxMonthlyPl] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [k, s, c, tr, d, tc, al, fx, accList, fxPl] = await Promise.all([
        getKpis(filters),
        getAccountsStatus(filters),
        getProfitLossByMonth({ ...filters, period: filters.period === 'current' ? '6m' : filters.period }),
        getTrend({ ...filters, period: filters.period === 'current' ? '12m' : filters.period }),
        getStatusDistribution(filters),
        getTopExtraCosts(filters),
        getAlerts(),
        getLatestRates(),
        getAccountsList(),
        getFxMonthlyPl(),
      ]);
      setKpis(k); setStatusRows(s); setColumnData(c); setTrendData(tr);
      setDonutData(d); setTopCosts(tc); setAlerts(al); setFxRates(fx); setAccountsList(accList);
      setFxMonthlyPl(fxPl);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const id = setInterval(loadAll, 60000);
    return () => clearInterval(id);
  }, [loadAll]);

  if (loading && !kpis) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <div>{t('loadingDashboard')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div>{t('loadFailed')}: {error}</div>
        <button className="btn btn-primary" onClick={loadAll}>{t('retry')}</button>
      </div>
    );
  }

  const user = getSavedUser();

  return (
    <>
      <Topbar
        title={t('execTitle')}
        subtitle={t('execSubtitle')}
        filters={filters}
        lastUpdated={lastUpdated}
        onRefresh={loadAll}
        user={user}
      />
      <div className="page">
        <FiltersBar filters={filters} onChange={setFilters} accounts={accountsList} />

        <PrintableSection id="kpis" className="section">
          <div className="kpi-grid">
            <KpiCard label={t('kpiTotalBalance')} icon="💰" tone="blue" value={formatCurrency(kpis.totalBalance)} sub={t('kpiTotalBalanceSub')} />
            <KpiCard label={t('kpiTotalProfit')} icon="📈" tone="green" value={formatCurrency(kpis.totalProfit)} sub={t('kpiSelectedPeriod')} />
            <KpiCard label={t('kpiTotalLoss')} icon="📉" tone="red" value={formatCurrency(kpis.totalLoss)} sub={t('kpiSelectedPeriod')} />
            <KpiCard label={t('kpiExtraCosts')} icon="💸" tone="yellow" value={formatCurrency(kpis.totalExtraCost)} sub={t('kpiExtraCostsSub')} />
            <KpiCard label={t('kpiActiveAccounts')} icon="🏦" tone="green" value={kpis.activeAccounts} sub={t('kpiActiveAccountsSub')} />
            <KpiCard label={t('kpiInactiveAccounts')} icon="❌" tone="red" value={kpis.inactiveAccounts} sub={t('kpiInactiveAccountsSub')} />
            <KpiCard label={t('kpiWarningAccounts')} icon="⚠️" tone="yellow" value={kpis.warningAccounts} sub={t('kpiWarningAccountsSub')} />
          </div>
        </PrintableSection>

        <div className="section">
          <PrintableSection id="alerts" title={t('activeAlerts')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{alerts.length} {t('alertsOpen')}</div>
            <AlertsPanel alerts={alerts} onSelectAccount={onSelectAccount} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="account-status" title={t('accountStatus')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{statusRows.length} {t('accountsCountSuffix')}</div>
            <AccountsStatusTable rows={statusRows} onSelectAccount={onSelectAccount} />
          </PrintableSection>
        </div>

        <div className="grid-2 section">
          <PrintableSection id="column-chart" className="panel">
            <div className="panel-head">
              <span className="panel-title">{t('chartColumnTitle')}</span>
              <div className="panel-legend">
                <span className="legend-item"><i className="legend-dot" style={{ background: '#1FCB8C' }} /> {t('legendProfit')}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: '#F0495A' }} /> {t('legendLoss')}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: '#F5874F' }} /> {t('legendExtraCost')}</span>
              </div>
            </div>
            <ProfitLossColumnChart data={columnData} />
          </PrintableSection>

          <PrintableSection id="donut-chart" title={t('chartStatusDistribution')} className="panel">
            <StatusDonutChart data={donutData} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="trend-chart" className="panel">
            <div className="panel-head">
              <span className="panel-title">{t('chartTrendTitle')}</span>
              <span className="section-meta">{t('chartTrendHint')}</span>
            </div>
            <TrendLineChart data={trendData} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="account-balances" title={t('accountBalancesTitle')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{t('accountBalancesSub')}</div>
            <AccountBalancesChart accounts={statusRows} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="fx-monthly-pl" title={t('fxMonthlyPlTitle')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{t('fxMonthlyPlSub')}</div>
            <FxMonthlyPnlPanel rows={fxMonthlyPl} />
          </PrintableSection>
        </div>

        <div className="grid-2 section">
          <PrintableSection id="top-costs" title={t('chartTopCosts')} className="panel">
            <TopExtraCostsList rows={topCosts} />
          </PrintableSection>

          <PrintableSection id="fx-rates" title={t('chartFxRates')} className="panel">
            <FxRatesPanel rates={fxRates} />
          </PrintableSection>
        </div>
      </div>
    </>
  );
}
