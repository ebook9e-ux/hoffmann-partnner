// src/utils/format.js

export function formatCurrency(n, currency = 'CHF') {
  const value = Number(n) || 0;
  try {
    return new Intl.NumberFormat('en-CH', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

export function formatCompact(n) {
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function formatPercent(n) {
  return `${Number(n).toFixed(1)}%`;
}

export function formatDate(isoString) {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString) {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function monthLabel(year, month) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[month - 1]} ${year}`;
}
