// @ts-check
// 툴바 배지(가격·등락 색·즐겨찾기 번갈아 표시)와 조용한 모드 단축키. index.js에서 나눔. 리스너는 import될 때 건다.
import { formatBadgePrice } from './lib/format.js';
import { coinOf, pickBadgeFrame } from './lib/badge.js';
import { allExchangesTickers, uiState } from './state.js';
import { getLanguage } from './notify.js';

// 툴바 배지: 고른 종목의 가격을 4글자 안으로 줄여 보여주고, 등락에 따라 배경색을 바꾼다.
export const BADGE_STORAGE_KEY = 'badgeSettings';
/** @typedef {{ enabled: boolean, exchange: string, market: string, rotate?: boolean }} BadgeSettings */
/** @type {BadgeSettings | null} */
let badgeSettings = null;
/** @type {'red-up' | 'green-up' | null} */
let upDownSetting = null;
let lastBadge = '';
// 조용한 모드: 배지를 비우고 알림 소리를 끈다. 팝업은 상승·하락 색을 끈다.
const QUIET_MODE_KEY = 'quietMode';
// 번갈아 표시와 마우스를 올렸을 때 보이는 가격 목록에 쓰는 즐겨찾기
/** @type {Record<string, string[]>} */
let favoriteCoins = {};
export const badgeReady = chrome.storage.local
  .get([BADGE_STORAGE_KEY, 'upDownColors', QUIET_MODE_KEY, 'favoriteCoins'])
  .then(result => {
    badgeSettings = result[BADGE_STORAGE_KEY] || null;
    upDownSetting = result.upDownColors || null;
    uiState.quietMode = !!result[QUIET_MODE_KEY];
    favoriteCoins = result.favoriteCoins || {};
  });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[BADGE_STORAGE_KEY]) badgeSettings = changes[BADGE_STORAGE_KEY].newValue || null;
  if (changes.upDownColors) upDownSetting = changes.upDownColors.newValue || null;
  if (changes[QUIET_MODE_KEY]) uiState.quietMode = !!changes[QUIET_MODE_KEY].newValue;
  if (changes.favoriteCoins) favoriteCoins = changes.favoriteCoins.newValue || {};
  if (changes[BADGE_STORAGE_KEY] || changes.upDownColors || changes.language || changes[QUIET_MODE_KEY]) updateBadge();
});

// 단축키(기본 Alt+Shift+Q)로 조용한 모드를 켜고 끈다.
chrome.commands?.onCommand.addListener(command => {
  if (command === 'toggle-quiet-mode') chrome.storage.local.set({ [QUIET_MODE_KEY]: !uiState.quietMode });
});

/** @returns {BadgeSettings} */
export const getBadgeSettings = () =>
  badgeSettings ??
  (getLanguage() === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' });

// 마우스를 올렸을 때 보이는 가격 목록(배지 코인 + 같은 거래소 즐겨찾기 최대 8개)
const BADGE_TITLE_LIMIT = 9;
let badgeTick = 0;

export function updateBadge() {
  const settings = getBadgeSettings();
  const tickers = allExchangesTickers[settings.exchange] ?? {};
  const favorites = favoriteCoins[settings.exchange] ?? [];
  const hasPrice = /** @param {string} market */ market => !!tickers[market]?.currentPrice;
  const frame = settings.enabled
    ? pickBadgeFrame({ market: settings.market, favorites, rotate: settings.rotate, hasPrice, tick: badgeTick++ })
    : null;
  if (!frame) {
    if (lastBadge) {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: chrome.i18n?.getMessage?.('extName') || 'COMO' });
      lastBadge = '';
    }
    return;
  }

  const ticker = tickers[frame.market];
  const changeRate = ticker.changeRate ?? 0;
  const redUp = (upDownSetting ?? (['ko', 'ja', 'zh'].includes(getLanguage()) ? 'red-up' : 'green-up')) === 'red-up';
  const color = frame.showSymbol
    ? '#6b7280'
    : changeRate >= 0
      ? redUp
        ? '#ef4444'
        : '#16a34a'
      : redUp
        ? '#3b82f6'
        : '#ef4444';
  // 조용한 모드에서는 배지를 비운다. 가격은 마우스를 올리면 보인다.
  const text = uiState.quietMode ? '' : frame.showSymbol ? coinOf(frame.market).slice(0, 4) : formatBadgePrice(/** @type {number} 고른 칸은 가격이 있는 종목뿐 */ (ticker.currentPrice));
  const line = /** @param {string} market */ market => {
    const { currentPrice, changeRate: rate = 0 } = tickers[market];
    return `${coinOf(market)} ${/** @type {number} 목록은 가격이 있는 종목만 */ (currentPrice).toLocaleString('en-US')} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)`;
  };
  const listed = [...new Set([settings.market, ...favorites])].filter(hasPrice).slice(0, BADGE_TITLE_LIMIT);
  const title = `${listed.map(line).join('\n')}\n· ${settings.exchange}`;
  const key = `${text}|${color}|${title}`;
  if (key === lastBadge) return;
  lastBadge = key;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setTitle({ title });
}
