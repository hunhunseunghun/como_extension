import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ko, type MessageKey } from './messages/ko';
import { en } from './messages/en';
import { es } from './messages/es';
import { pt } from './messages/pt';
import { vi } from './messages/vi';
import { tr } from './messages/tr';
import { id } from './messages/id';
import { ja } from './messages/ja';
import { zh } from './messages/zh';
import { hi } from './messages/hi';

export type { MessageKey };

export const LANGUAGES = [
  { value: 'en', label: 'English', currency: 'USD' },
  { value: 'ko', label: '한국어', currency: 'KRW' },
  { value: 'es', label: 'Español', currency: 'USD' },
  { value: 'pt', label: 'Português', currency: 'BRL' },
  { value: 'vi', label: 'Tiếng Việt', currency: 'VND' },
  { value: 'tr', label: 'Türkçe', currency: 'TRY' },
  { value: 'id', label: 'Bahasa Indonesia', currency: 'IDR' },
  { value: 'ja', label: '日本語', currency: 'JPY' },
  { value: 'zh', label: '中文', currency: 'CNY' },
  { value: 'hi', label: 'हिन्दी', currency: 'INR' },
] as const;
export type Language = (typeof LANGUAGES)[number]['value'];

// 법정화폐 환율은 백그라운드가 USD 기준으로 받아온다 (open.er-api.com).
export const FIAT_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'KRW',
  'JPY',
  'CNY',
  'INR',
  'BRL',
  'VND',
  'TRY',
  'IDR',
  'NGN',
  'PKR',
  'PHP',
  'THB',
] as const;
export type DisplayCurrency = (typeof FIAT_CURRENCIES)[number];

// 번역이 비어 있는 키는 영어로 보여준다.
const messages: Record<Language, Partial<Record<MessageKey, string>>> = { ko, en, es, pt, vi, tr, id, ja, zh, hi };

export type Translate = (key: MessageKey) => string;

export const TIMEFRAME_VALUES = ['1m', '3m', '5m', '10m', '15m', '30m', '60m', '240m', '1d', '1w', '1M'] as const;
export const getTimeframes = (t: Translate) =>
  TIMEFRAME_VALUES.map(value => ({ value, label: t(`tf_${value}` as MessageKey) }));

export const LANGUAGE_STORAGE_KEY = 'language';
export const UP_DOWN_STORAGE_KEY = 'upDownColors';

// 한·중·일은 빨강이 상승, 그 외 대부분 지역은 초록이 상승이다.
export type UpDownColors = 'red-up' | 'green-up';
const defaultUpDown = (language: Language): UpDownColors =>
  language === 'ko' || language === 'ja' || language === 'zh' ? 'red-up' : 'green-up';
export const CURRENCY_STORAGE_KEY = 'displayCurrency';

const isLanguage = (value: unknown): value is Language => LANGUAGES.some(language => language.value === value);
const isCurrency = (value: unknown): value is DisplayCurrency =>
  (FIAT_CURRENCIES as readonly unknown[]).includes(value);

const detectLanguage = (): Language => {
  const ui =
    typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
  const code = ui?.toLowerCase().split('-')[0];
  return isLanguage(code) ? code : 'en';
};

const defaultCurrency = (language: Language): DisplayCurrency =>
  LANGUAGES.find(item => item.value === language)?.currency ?? 'USD';

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  // 해외 거래소 가격의 보조 표시와 포트폴리오 합계에 쓰는 통화
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  upDownColors: UpDownColors;
  setUpDownColors: (colors: UpDownColors) => void;
};

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: key => en[key],
  currency: 'USD',
  setCurrency: () => {},
  upDownColors: 'green-up',
  setUpDownColors: () => {},
});

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(detectLanguage);
  const [storedCurrency, setStoredCurrency] = useState<DisplayCurrency | null>(null);
  // 통화를 직접 고르지 않았다면 언어에 맞는 통화를 쓴다 (예: 한국어 KRW, 日本語 JPY).
  const currency = storedCurrency ?? defaultCurrency(language);
  const [storedUpDown, setStoredUpDown] = useState<UpDownColors | null>(null);
  const upDownColors = storedUpDown ?? defaultUpDown(language);

  useEffect(() => {
    chrome.storage.local.get([LANGUAGE_STORAGE_KEY, CURRENCY_STORAGE_KEY, UP_DOWN_STORAGE_KEY], result => {
      const storedColors = result?.[UP_DOWN_STORAGE_KEY];
      if (storedColors === 'red-up' || storedColors === 'green-up') setStoredUpDown(storedColors);
      const stored = result?.[LANGUAGE_STORAGE_KEY];
      if (isLanguage(stored)) setLanguageState(stored);
      const storedCur = result?.[CURRENCY_STORAGE_KEY];
      if (isCurrency(storedCur)) setStoredCurrency(storedCur);
    });
  }, []);

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setStoredCurrency(next);
    chrome.storage.local.set({ [CURRENCY_STORAGE_KEY]: next });
  }, []);

  const setUpDownColors = useCallback((next: UpDownColors) => {
    setStoredUpDown(next);
    chrome.storage.local.set({ [UP_DOWN_STORAGE_KEY]: next });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: key => messages[language][key] ?? en[key] ?? ko[key],
      currency,
      setCurrency,
      upDownColors,
      setUpDownColors,
    }),
    [language, setLanguage, currency, setCurrency, upDownColors, setUpDownColors],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.updown = upDownColors;
  }, [upDownColors]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
