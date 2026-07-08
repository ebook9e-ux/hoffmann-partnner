// src/i18n/I18nContext.jsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations } from './translations';

const I18nContext = createContext(null);

function getInitialLang() {
  const saved = localStorage.getItem('ad_lang');
  if (saved === 'en' || saved === 'de') return saved;
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLang);

  const setLang = useCallback((code) => {
    setLangState(code);
    localStorage.setItem('ad_lang', code);
    document.documentElement.lang = code;
  }, []);

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within I18nProvider');
  return ctx;
}
