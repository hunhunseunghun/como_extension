import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'ko' | 'en';
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

const ko = {
  topGainer: '상위 상승 종목',
  marketCount: '현재 거래소 종목수',
  exchangeRateSource: '한국수출입은행 고시 환율',
  searchPlaceholder: 'BTC , 비트',
  language: '언어',
  numberLocale: 'ko-KR',

  exchange_upbit: '업비트',
  exchange_bithumb: '빗썸',
  exchange_binance: '바이낸스',

  name: '이름',
  nameKR: '한글명',
  nameEN: '영문명',
  currentPrice: '현재가',
  change: '전일대비',
  fromHigh24h: '고가대비(24H)',
  fromLow24h: '저가대비(24H)',
  fromHigh52w: '고가대비(52주)',
  fromLow52w: '저가대비(52주)',
  volume: '거래금(일)',
  warningShort: '유',
  cautionShort: '주',

  tf_1m: '1분',
  tf_3m: '3분',
  tf_5m: '5분',
  tf_10m: '10분',
  tf_15m: '15분',
  tf_30m: '30분',
  tf_60m: '1시간',
  tf_240m: '4시간',
  tf_1d: '1일',
  tf_1w: '1주',
  tf_1M: '1월',

  kimchiShort: '김프',
  kimchiTooltip: '김치 프리미엄 (vs Binance USDT)',

  alertTitle: '지정가 알림 설정',
  alertInvalid: '유효한 종목과 지정가를 입력해주세요.',
  selectMarket: '종목 선택',
  targetPrice: '지정 가격',
  deadband: '데드밴드',
  deadbandHelp1: '0%: 지정가 도달마다 알림',
  deadbandHelp2: '예시: 지정가 100,데드밴드 10%',
  deadbandHelp3: '1.100 도달 시 첫 알림',
  deadbandHelp4: '2.90-110 범위를 벗어난 후 다시 100 도달 시 두번째 알림',
  addAlert: '알림 추가',
  allAlerts: '전체 지정가 알림',
  noAlerts: '전체 지정가가 없습니다.',
};

export type MessageKey = keyof typeof ko;

const en: Record<MessageKey, string> = {
  topGainer: 'Top gainer',
  marketCount: 'Markets on this exchange',
  exchangeRateSource: 'USD/KRW rate (Export-Import Bank of Korea)',
  searchPlaceholder: 'BTC, ETH',
  language: 'Language',
  numberLocale: 'en-US',

  exchange_upbit: 'Upbit',
  exchange_bithumb: 'Bithumb',
  exchange_binance: 'Binance',

  name: 'Name',
  nameKR: 'KR name',
  nameEN: 'EN name',
  currentPrice: 'Price',
  change: 'Change',
  fromHigh24h: 'From high (24H)',
  fromLow24h: 'From low (24H)',
  fromHigh52w: 'From high (52W)',
  fromLow52w: 'From low (52W)',
  volume: 'Volume (1D)',
  warningShort: 'W',
  cautionShort: 'C',

  tf_1m: '1m',
  tf_3m: '3m',
  tf_5m: '5m',
  tf_10m: '10m',
  tf_15m: '15m',
  tf_30m: '30m',
  tf_60m: '1h',
  tf_240m: '4h',
  tf_1d: '1D',
  tf_1w: '1W',
  tf_1M: '1M',

  kimchiShort: 'K-Prem',
  kimchiTooltip: 'Kimchi premium (vs Binance USDT)',

  alertTitle: 'Price alerts',
  alertInvalid: 'Enter a valid market and target price.',
  selectMarket: 'Select market',
  targetPrice: 'Target price',
  deadband: 'Deadband',
  deadbandHelp1: '0%: alert every time the price is reached',
  deadbandHelp2: 'e.g. target 100, deadband 10%',
  deadbandHelp3: '1. First alert when 100 is reached',
  deadbandHelp4: '2. Next alert only after leaving 90-110 and reaching 100 again',
  addAlert: 'Add alert',
  allAlerts: 'All price alerts',
  noAlerts: 'No price alerts.',
};

const messages: Record<Language, Record<MessageKey, string>> = { ko, en };

export type Translate = (key: MessageKey) => string;

export const TIMEFRAME_VALUES = ['1m', '3m', '5m', '10m', '15m', '30m', '60m', '240m', '1d', '1w', '1M'] as const;
export const getTimeframes = (t: Translate) =>
  TIMEFRAME_VALUES.map(value => ({ value, label: t(`tf_${value}` as MessageKey) }));

export const LANGUAGE_STORAGE_KEY = 'language';

const detectLanguage = (): Language => {
  const ui = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage ? chrome.i18n.getUILanguage() : navigator.language;
  return ui?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
};

type I18nContextValue = { language: Language; setLanguage: (language: Language) => void; t: Translate };

const I18nContext = createContext<I18nContextValue>({
  language: 'ko',
  setLanguage: () => {},
  t: key => ko[key],
});

export const I18nProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(detectLanguage);

  useEffect(() => {
    chrome.storage.local.get(LANGUAGE_STORAGE_KEY, result => {
      const stored = result?.[LANGUAGE_STORAGE_KEY];
      if (stored === 'ko' || stored === 'en') setLanguageState(stored);
    });
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: next });
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t: key => messages[language][key] ?? ko[key] }),
    [language, setLanguage],
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
