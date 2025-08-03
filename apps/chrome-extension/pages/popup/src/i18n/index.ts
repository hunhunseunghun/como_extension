import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { messages } from './messages';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: messages.ko },
      en: { translation: messages.en },
      ja: { translation: messages.ja },
      zh: { translation: messages.zh },
      es: { translation: messages.es },
      fr: { translation: messages.fr },
      de: { translation: messages.de },
      it: { translation: messages.it },
      pt: { translation: messages.pt },
      ru: { translation: messages.ru },
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
