// src/pages/AdminAnalyticsPage.jsx
// Replaces the portfolio-wide Executive Dashboard / Account Details
// views for the admin role. What the admin actually needs day-to-day:
//   1. How much of the dashboard each customer used today (%)
//   2. When a customer tried to sign in and could not get in

import React, { useEffect, useState, useCallback } from 'react';
import Topbar from '../components/layout/Topbar';
import KpiCard from '../components/kpi/KpiCard';
import PrintableSection from '../components/print/PrintableSection';
import { getUsageAnalytics, getLoginAttempts, getAnalyticsSummary, getSavedUser } from '../services/api';
import { formatDateTime, formatPercent } from '../utils/format';
import { useTranslation } from '../i18n/I18nContext';

function usageColor(pct) {
  if (pct >= 40) return '#1FCB8C';
  if (pct >= 15) return '#F5B544';
  return '#F0495A';
}

function UsagePanel({ rows }) {
  const { t } = useTranslation();
  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('noUsageData')}</div>;
  }
  return (
    <div className="rank-list">
      {rows.map((r) => (
        <div className="rank-row" key={r.userId}>
          <span className={`online-dot ${r.isOnline ? 'on' : ''}`} title={r.isOnline ? t('onlineNow') : ''} />
          <div className="rank-info">
            <div className="rank-name">{r.fullName}{r.companyName ? ` · ${r.companyName}` : ''}</div>
            <div className="rank-sub">{r.username} · {t('usageCol')}: {formatPercent(r.usagePercent)}</div>
            <div className="rank-bar-track">
              <div
                className="rank-bar-fill"
                style={{ width: `${Math.min(100, r.usagePercent)}%`, background: usageColor(r.usagePercent) }}
              />
            </div>
          </div>
          <div className="rank-value">{formatPercent(r.usagePercent)}</div>
        </div>
      ))}
    </div>
  );
}

function FailedLoginsPanel({ rows }) {
  const { t } = useTranslation();
  if (!rows || rows.length === 0) {
    return <div className="inline-empty">{t('noFailedLogins')}</div>;
  }
  return (
    <div className="alerts-list">
      {rows.map((r) => (
        <div className="alert-card critical" key={r.id}>
          <span className="alert-icon">🚫</span>
          <div className="alert-text">
            <div>
              <strong>{r.fullName || t('unknownUser')}{r.companyName ? ` (${r.companyName})` : ''}</strong>
              {' '}{t('triedToSignInAs')} <span className="cell-mono">{r.identifierTried}</span>
            </div>
            <div className="alert-meta">
              {r.failReasonKey ? t(r.failReasonKey) : ''} · {formatDateTime(r.attemptedAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadAll = useCallback(async () => {
    setError('');
    try {
      const [u, a, s] = await Promise.all([
        getUsageAnalytics(),
        getLoginAttempts({ limit: 30 }),
        getAnalyticsSummary(),
      ]);
      setUsage(u); setAttempts(a); setSummary(s);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const id = setInterval(loadAll, 30000);
    return () => clearInterval(id);
  }, [loadAll]);

  const user = getSavedUser();

  if (loading && !summary) {
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

  return (
    <>
      <Topbar
        title={t('analyticsTitle')}
        subtitle={t('analyticsSubtitle')}
        lastUpdated={lastUpdated}
        onRefresh={loadAll}
        user={user}
      />
      <div className="page">
        <PrintableSection id="analytics-kpis" className="section">
          <div className="kpi-grid">
            <KpiCard label={t('kpiTotalCustomers')} icon="👥" tone="blue" value={summary.totalCustomers} />
            <KpiCard label={t('kpiOnlineNow')} icon="🟢" tone="green" value={summary.onlineNow} />
            <KpiCard label={t('kpiAvgUsage')} icon="📊" tone="blue" value={formatPercent(summary.avgUsagePercentToday)} sub={t('kpiAvgUsageSub')} />
            <KpiCard label={t('kpiFailedToday')} icon="🚫" tone="red" value={summary.failedLoginsToday} />
            <KpiCard label={t('kpiFailed24h')} icon="⚠️" tone="yellow" value={summary.failedLogins24h} />
          </div>
        </PrintableSection>

        <div className="section">
          <PrintableSection id="usage-panel" title={t('usagePanelTitle')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{t('usagePanelSub')}</div>
            <UsagePanel rows={usage} />
          </PrintableSection>
        </div>

        <div className="section">
          <PrintableSection id="failed-logins-panel" title={t('failedLoginsTitle')} className="panel">
            <div className="section-meta" style={{ marginBottom: 10 }}>{t('failedLoginsSub')}</div>
            <FailedLoginsPanel rows={attempts} />
          </PrintableSection>
        </div>
      </div>
    </>
  );
}
