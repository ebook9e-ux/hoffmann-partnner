// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { login, saveSession } from '../services/api';
import { useTranslation } from '../i18n/I18nContext';
import LanguageSwitcher from '../components/layout/LanguageSwitcher';
import HoffmannPartnerLogo from '../components/branding/HoffmannPartnerLogo';

export default function LoginPage({ onLoggedIn }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username || !password) { setError(t('loginErrorRequired')); return; }

    setLoading(true);
    try {
      const { token, user } = await login(username, password);
      saveSession(token, user);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-bg-grid" />
      <div className="login-lang-corner"><LanguageSwitcher /></div>
      <div className="login-card">
        <div className="login-logo">
          <HoffmannPartnerLogo height={44} dark />
          <div>
            <div className="login-logo-sub">{t('appTagline')}</div>
          </div>
        </div>

        <h1 className="login-heading">{t('signIn')}</h1>
        <p className="login-sub">{t('signInSub')}</p>

        <form onSubmit={handleSubmit} style={{ marginTop: 26 }}>
          <label className="field-label">{t('usernameOrEmail')}</label>
          <input
            className="field-input"
            type="text"
            placeholder="sara.ahmadi / sara@firma.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            dir="ltr"
          />
          <label className="field-label" style={{ marginTop: 14 }}>{t('password')}</label>
          <div className="password-field-wrap">
            <input
              className="field-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              title={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <div className="login-footer">{t('demoAccount')}: admin_demo / Admin@2024!</div>
      </div>
    </div>
  );
}
