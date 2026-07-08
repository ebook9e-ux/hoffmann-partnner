// src/App.jsx
import React, { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import ExecutiveDashboardPage from './pages/ExecutiveDashboardPage';
import AccountDetailPage from './pages/AccountDetailPage';
import CustomersPage from './pages/CustomersPage';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage';
import Sidebar from './components/layout/Sidebar';
import { isLoggedIn, getSavedUser, sendHeartbeat } from './services/api';

function defaultPageFor(user) {
  return user?.role === 'admin' ? 'analytics' : 'executive';
}

export default function App() {
  const [user, setUser] = useState(isLoggedIn() ? getSavedUser() : null);
  const [page, setPage] = useState(() => defaultPageFor(isLoggedIn() ? getSavedUser() : null));
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Keeps this user's LastSeenAt fresh so Admin → "online now" reflects
  // reality. Fires immediately on login, then every 45s while the tab
  // is open; stops the moment the user logs out.
  useEffect(() => {
    if (!user) return;
    sendHeartbeat().catch(() => {});
    const id = setInterval(() => { sendHeartbeat().catch(() => {}); }, 45000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) {
    return <LoginPage onLoggedIn={(u) => { setUser(u); setPage(defaultPageFor(u)); }} />;
  }

  function handleSelectAccount(accountNumber) {
    setSelectedAccount(accountNumber);
    setPage('accounts');
  }

  function handleNavigate(key) {
    setPage(key);
    if (key === 'executive') setSelectedAccount(null);
  }

  return (
    <div className="shell">
      <Sidebar page={page} onNavigate={handleNavigate} user={user} onLogout={() => setUser(null)} />
      <div className="content">
        {page === 'analytics' && user.role === 'admin' && <AdminAnalyticsPage />}
        {page === 'executive' && user.role !== 'admin' && <ExecutiveDashboardPage onSelectAccount={handleSelectAccount} />}
        {page === 'accounts' && user.role !== 'admin' && (
          <AccountDetailPage
            accountNumber={selectedAccount}
            onSelectAccount={setSelectedAccount}
            onBack={() => { setSelectedAccount(null); }}
          />
        )}
        {page === 'customers' && user.role === 'admin' && <CustomersPage />}
      </div>
    </div>
  );
}
