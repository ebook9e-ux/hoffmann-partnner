// src/pages/CustomersPage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { useTranslation } from '../i18n/I18nContext';
import {
  getCustomers, createCustomer, updateCustomer, resetCustomerPassword,
  getCustomerAccounts, assignAccountToCustomer, unassignAccountFromCustomer,
  getUnassignedAccounts,
} from '../services/api';

function CopyButton({ value, label }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className="copy-btn" onClick={handleCopy}>
      {copied ? `✓ ${t('copied')}` : `⧉ ${label || t('copy')}`}
    </button>
  );
}

function CustomerFormModal({ initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = !!initial;
  const [username, setUsername] = useState(initial?.username || '');
  const [fullName, setFullName] = useState(initial?.fullName || '');
  const [companyName, setCompanyName] = useState(initial?.companyName || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [passwordMode, setPasswordMode] = useState('auto');
  const [manualPassword, setManualPassword] = useState('');
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { username, generatedPassword }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Real international validation (every country's numbering plan) —
  // requires a country code, e.g. +41 44 111 22 33 or +1 415 555 0132.
  function isValidPhone(value) {
    try {
      return isValidPhoneNumber(value);
    } catch {
      return false;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError(t('fullName') + ' — required');
    if (!isEdit && username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (!email.trim() || !EMAIL_RE.test(email.trim())) return setError(t('invalidEmail'));
    if (!phone.trim() || !isValidPhone(phone.trim())) return setError(t('invalidPhone'));

    setSaving(true);
    try {
      if (isEdit) {
        await updateCustomer(initial.id, { fullName, companyName, email, phone });
        onSaved();
      } else {
        const payload = { username: username.trim(), fullName, companyName, email, phone };
        if (passwordMode === 'manual') payload.password = manualPassword;
        const res = await createCustomer(payload);
        setResult({
          username: res.customer.username,
          password: res.generatedPassword || manualPassword,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title">{t('createCustomer')}</div>
          <div className="credential-box">
            <div className="credential-box-title">✓ {t('credentialsCreated')}</div>
            <div className="credential-row">
              <div>
                <div className="credential-key">{t('username')}</div>
                <div className="credential-value">{result.username}</div>
              </div>
              <CopyButton value={result.username} />
            </div>
            <div className="credential-row">
              <div>
                <div className="credential-key">{t('password')}</div>
                <div className="credential-value">{result.password}</div>
              </div>
              <CopyButton value={result.password} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => { onSaved(); onClose(); }}>{t('close')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-title">{isEdit ? t('editCustomer') : t('addCustomer')}</div>
        <div className="modal-sub">{t('customersSubtitle')}</div>

        {!isEdit && (
          <div className="field-block">
            <label className="field-label">{t('username')}</label>
            <input className="field-input" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="acme_corp" />
          </div>
        )}

        <div className="field-block">
          <label className="field-label">{t('fullName')}</label>
          <input className="field-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Acme Corp AG" />
        </div>

        <div className="field-block">
          <label className="field-label">{t('companyName')}</label>
          <input className="field-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Corp AG" />
        </div>

        <div className="field-row" style={{ marginTop: 14 }}>
          <div>
            <label className="field-label">{t('email')} *</label>
            <input className="field-input" dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="finance@acme.com" />
          </div>
          <div>
            <label className="field-label">{t('phone')} *</label>
            <input className="field-input" dir="ltr" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+41 44 111 22 33" />
          </div>
        </div>

        {!isEdit && (
          <>
            <div className="radio-row">
              <label className="radio-option">
                <input type="radio" checked={passwordMode === 'auto'} onChange={() => setPasswordMode('auto')} />
                {t('autoGeneratePassword')}
              </label>
              <label className="radio-option">
                <input type="radio" checked={passwordMode === 'manual'} onChange={() => setPasswordMode('manual')} />
                {t('setPasswordManually')}
              </label>
            </div>
            {passwordMode === 'manual' && (
              <div className="field-block">
                <label className="field-label">{t('password')}</label>
                <div className="password-field-wrap">
                  <input
                    className="field-input"
                    dir="ltr"
                    type={showManualPassword ? 'text' : 'password'}
                    value={manualPassword}
                    onChange={(e) => setManualPassword(e.target.value)}
                    placeholder="min. 8 characters"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowManualPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showManualPassword ? t('hidePassword') : t('showPassword')}
                    title={showManualPassword ? t('hidePassword') : t('showPassword')}
                  >
                    {showManualPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {error && <div className="error-box" style={{ marginTop: 14 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {isEdit ? t('saveChanges') : t('createCustomer')}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountsDrawer({ customer, onChanged }) {
  const { t } = useTranslation();
  const [assigned, setAssigned] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, u] = await Promise.all([getCustomerAccounts(customer.id), getUnassignedAccounts()]);
    setAssigned(a);
    setUnassigned(u);
    setLoading(false);
  }, [customer.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign(accountId) {
    await assignAccountToCustomer(customer.id, accountId);
    await load();
    onChanged();
  }
  async function handleUnassign(accountId) {
    await unassignAccountFromCustomer(customer.id, accountId);
    await load();
    onChanged();
  }

  if (loading) return <div className="accounts-drawer"><span className="cell-muted">…</span></div>;

  return (
    <div className="accounts-drawer">
      <div className="accounts-drawer-head">
        <span className="panel-title">{t('accounts')} — {customer.fullName}</span>
      </div>
      <div>
        {assigned.length === 0 && <span className="cell-muted" style={{ fontSize: 12 }}>—</span>}
        {assigned.map((a) => (
          <span className="assigned-chip" key={a.id}>
            {a.accountNumber} · {a.label}
            <button onClick={() => handleUnassign(a.id)} title={t('unassign')}>×</button>
          </span>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">{t('assignAccount')}</label>
        {unassigned.length === 0 ? (
          <div className="field-hint">{t('noUnassignedAccounts')}</div>
        ) : (
          <select className="filter-select" style={{ marginTop: 6 }} defaultValue="" onChange={(e) => { if (e.target.value) { handleAssign(e.target.value); e.target.value = ''; } }}>
            <option value="" disabled>{t('assignAccount')}...</option>
            {unassigned.map((a) => (
              <option key={a.id} value={a.id}>{a.accountNumber} · {a.label} ({a.currency})</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | customer object (edit)
  const [expandedId, setExpandedId] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { username, newPassword }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCustomers(await getCustomers());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleActive(customer) {
    const goingActive = !customer.isActive;
    const msg = goingActive ? t('confirmActivate') : t('confirmDeactivate');
    if (!window.confirm(msg)) return;
    await updateCustomer(customer.id, { isActive: goingActive });
    load();
  }

  async function handleResetPassword(customer) {
    const res = await resetCustomerPassword(customer.id);
    setResetResult(res);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-head-title">{t('customersTitle')}</div>
          <div className="page-head-sub">{t('customersSubtitle')}</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ {t('addCustomer')}</button>
      </div>

      <div className="panel">
        {loading ? (
          <div className="inline-empty">…</div>
        ) : customers.length === 0 ? (
          <div className="inline-empty">{t('noCustomersYet')}</div>
        ) : (
          <div className="data-table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('fullName')}</th>
                  <th>{t('onlineNow')}</th>
                  <th>{t('username')}</th>
                  <th>{t('email')}</th>
                  <th>{t('phone')}</th>
                  <th>{t('accounts')}</th>
                  <th>{t('lastLogin')}</th>
                  <th>{t('active')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                      <td>
                        <div className="customer-name-cell">
                          <span className="primary">{c.fullName}</span>
                          {c.companyName && <span className="secondary">{c.companyName}</span>}
                        </div>
                      </td>
                      <td>
                        <span className={`online-dot ${c.isOnline ? 'on' : ''}`} style={{ display: 'inline-block' }} title={c.isOnline ? t('onlineNow') : ''} />
                      </td>
                      <td className="cell-mono">{c.username}</td>
                      <td className="cell-muted">{c.email || '—'}</td>
                      <td className="cell-muted cell-mono">{c.phone || '—'}</td>
                      <td className="cell-num">{c.accountCount}</td>
                      <td className="cell-muted">{c.lastLoginAt ? new Date(c.lastLoginAt).toLocaleString() : t('never')}</td>
                      <td>
                        <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={c.isActive} onChange={() => handleToggleActive(c)} />
                          <span className="toggle-slider" />
                        </label>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="icon-btn" onClick={() => setModal(c)}>{t('editCustomer')}</button>
                          <button className="icon-btn" onClick={() => handleResetPassword(c)}>{t('resetPassword')}</button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr>
                        <td colSpan={9} style={{ cursor: 'default' }}>
                          <AccountsDrawer customer={c} onChanged={load} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <CustomerFormModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {resetResult && (
        <div className="modal-overlay" onClick={() => setResetResult(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{t('resetPassword')}</div>
            <div className="credential-box">
              <div className="credential-box-title">✓ {t('newPasswordGenerated')}</div>
              <div className="credential-row">
                <div>
                  <div className="credential-key">{t('username')}</div>
                  <div className="credential-value">{resetResult.username}</div>
                </div>
                <CopyButton value={resetResult.username} />
              </div>
              <div className="credential-row">
                <div>
                  <div className="credential-key">{t('password')}</div>
                  <div className="credential-value">{resetResult.newPassword}</div>
                </div>
                <CopyButton value={resetResult.newPassword} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setResetResult(null)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
