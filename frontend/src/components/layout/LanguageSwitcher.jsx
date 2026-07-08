// src/components/layout/LanguageSwitcher.jsx
import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import { LANGUAGES } from '../../i18n/translations';

export default function LanguageSwitcher() {
  const { lang, setLang } = useTranslation();

  return (
    <div className="lang-switcher" role="group" aria-label="Language / Sprache">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          className={`lang-pill ${lang === l.code ? 'active' : ''}`}
          onClick={() => setLang(l.code)}
          title={l.code === 'de' ? 'Deutsch' : 'English'}
        >
          <span className="lang-flag">{l.flag}</span>
          <span>{l.label}</span>
        </button>
      ))}
    </div>
  );
}
