import type { Language } from '@/i18n';
import type { ExchangePlatform } from '@/types';

export const BADGE_STORAGE_KEY = 'badgeSettings';
export type BadgeSettings = { enabled: boolean; exchange: ExchangePlatform; market: string };

// 배지 설정이 없을 때 백그라운드와 같은 기본값을 쓴다.
export const defaultBadgeSettings = (language: Language): BadgeSettings =>
  language === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' };

export const isSidePanelView = () => new URLSearchParams(window.location.search).get('view') === 'sidepanel';
