/**
 * i18n setup — react-i18next + browser language detector.
 *
 * Languages: `en`, `zh` (zh covers all Chinese variants — zh-CN, zh-Hans,
 * zh-TW, etc. via i18next fallback). Detection order:
 *   1. localStorage key `playheads_lang` (user override)
 *   2. navigator.language → zh-* → zh, otherwise en
 * Persist user selection to localStorage on change.
 */
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

const STORAGE_KEY = 'playheads_lang';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    nonExplicitSupportedLngs: true, // zh-CN / zh-Hans / zh-TW → zh
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
