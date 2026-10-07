import type { Language } from '@/i18n';
import type { ExchangePlatform } from '@/types';

export const BADGE_STORAGE_KEY = 'badgeSettings';
// rotate: 배지 코인 다음에 같은 거래소 즐겨찾기를 번갈아 보여 준다.
export type BadgeSettings = { enabled: boolean; exchange: ExchangePlatform; market: string; rotate?: boolean };

// 배지 설정이 없을 때 백그라운드와 같은 기본값을 쓴다.
export const defaultBadgeSettings = (language: Language): BadgeSettings =>
  language === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' };

export const isSidePanelView = () => new URLSearchParams(window.location.search).get('view') === 'sidepanel';
// 창 크기에 맞춰 그리는 화면: 사이드 패널, 그리고 팝업을 전체 화면으로 여는 Firefox Android.
// (데스크톱 팝업은 그리기 전 innerWidth가 작게 잡힐 수 있어 너비가 아니라 기기로 판단한다.)
export const isFluidView = () => isSidePanelView() || /Android/i.test(navigator.userAgent);

// 신규 상장 알림: 설정이 없으면 한국어 사용자에게만 켠다. 백그라운드(isListingAlertsEnabled)와 같은 규칙이다.
export const LISTING_ALERTS_STORAGE_KEY = 'listingAlerts';
export const isListingAlertsDefault = (language: Language) => language === 'ko';
