// src/components/layout/Sidebar.jsx
import React, { useState, useEffect } from 'react';
import { clearSession, getOnlineSummary } from '../../services/api';
import { useTranslation } from '../../i18n/I18nContext';
import HoffmannPartnerLogo from '../branding/HoffmannPartnerLogo';

function OnlineNowWidget() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getOnlineSummary();
        if (!cancelled) setData(res);
      } catch {
        // silent — this is a nice-to-have widget, not critical path
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const count = data?.count ?? 0;

  return (
    <div className="online-widget">
      <div className="online-widget-head">
        <span className={`online-dot ${count > 0 ? 'on' : ''}`} />
        <span className="online-widget-title">{t('onlineNow')}</span>
        <span className="online-widget-count">{count}</span>
      </div>
      {count > 0 && (
        <div className="online-widget-list">
          {data.users.map((u) => (
            <div className="online-widget-user" key={u.id}>
              <span className="online-dot on" />
              <span>{u.fullName}</span>
              {u.role === 'admin' && <span className="online-widget-badge">{t('adminBadge')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ page, onNavigate, user, onLogout }) {
  const { t } = useTranslation();

  // Admins get their own two sections (customer usage / failed sign-ins,
  // and customer management) — they no longer see the portfolio-wide
  // Executive Dashboard or Account Details drill-through; those stay
  // exactly as they are for the customer role, scoped to that
  // customer's own accounts only.
  const NAV_ITEMS = user?.role === 'admin'
    ? [
        { key: 'analytics', icon: '◆', label: t('navAnalytics') },
        { key: 'customers', icon: '☰', label: t('navCustomers') },
      ]
    : [
        { key: 'executive', icon: '◆', label: t('navExecutive') },
        { key: 'accounts', icon: '▦', label: t('navAccounts') },
      ];

  function handleLogout() {
    clearSession();
    onLogout();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <HoffmannPartnerLogo height={34} dark />
        <div>
          <div className="sidebar-logo-sub">{t('accountingSuite')}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`sidebar-link ${page === item.key ? 'active' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user?.role === 'admin' && <OnlineNowWidget />}
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user?.fullName?.[0] || '?'}</div>
          <div>
            <div className="sidebar-username">{user?.fullName}</div>
            <div className="sidebar-userrole">{user?.role}</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={handleLogout}>{t('signOut')}</button>
      </div>
    </aside>
  );
}
