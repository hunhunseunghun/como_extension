// @ts-check
// 알림 공통: 방해 금지 시간·알림 기록함·지정가 알림 확인·알림 문구 언어·알림을 눌렀을 때 열 주소. index.js에서 나눔.
import { evaluatePriceAlert } from './lib/priceAlert.js';
import { isInQuietHours } from './lib/quietHours.js';
import { alertText } from './lib/texts.js';
import { allExchangesTickers, uiState } from './state.js';
import { ensureAlarm } from './alarms.js';

// 방해 금지 시간대: 그동안 오는 알림은 띄우지 않고 제목만 모아 두었다가, 끝나면 한 번에 요약해 알린다.
const QUIET_HOURS_KEY = 'quietHours';
const QUIET_MISSED_KEY = 'quietHoursMissed';
/** @type {{ enabled?: boolean, start?: string, end?: string } | null} */
let quietHours = null;
const quietHoursReady = chrome.storage.local.get(QUIET_HOURS_KEY).then(result => {
  quietHours = result[QUIET_HOURS_KEY] ?? null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[QUIET_HOURS_KEY]) quietHours = changes[QUIET_HOURS_KEY].newValue ?? null;
});
/** @type {Promise<void>} */
let missedQueue = Promise.resolve();
/** @param {string} title */
function rememberMissed(title) {
  missedQueue = missedQueue.then(async () => {
    const result = await chrome.storage.local.get(QUIET_MISSED_KEY);
    const missed = [...(result[QUIET_MISSED_KEY] ?? []), title].slice(-50);
    await chrome.storage.local.set({ [QUIET_MISSED_KEY]: missed });
  });
}
async function flushMissedAlerts() {
  await quietHoursReady;
  if (isInQuietHours(quietHours, new Date())) return;
  const result = await chrome.storage.local.get(QUIET_MISSED_KEY);
  const missed = result[QUIET_MISSED_KEY] ?? [];
  if (!missed.length) return;
  await chrome.storage.local.set({ [QUIET_MISSED_KEY]: [] });
  chrome.notifications.create('quiet-hours-summary', {
    type: 'basic',
    iconUrl: 'como-logo.png',
    title: alertText(getLanguage(), 'quietSummary', { n: missed.length }),
    message: missed.slice(-3).reverse().join('\n'),
    silent: uiState.quietMode,
  });
}
ensureAlarm('quietHoursSummary', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'quietHoursSummary') flushMissedAlerts();
});

/** @typedef {{ type: 'basic', iconUrl: string, title: string, message: string }} AlertOptions */

// 알림은 모두 이걸로 띄운다. 조용한 모드에서는 소리 없이, 방해 금지 시간에는 띄우지 않고 모아 둔다.
/**
 * @param {string} id
 * @param {AlertOptions} options
 */
export const createNotification = (id, options) => {
  const muted = isInQuietHours(quietHours, new Date());
  recordAlert(id, options, muted);
  if (muted) {
    rememberMissed(options.title);
    return;
  }
  chrome.notifications.create(id, { ...options, silent: uiState.quietMode });
};

// 알림 기록함: OS 알림을 놓쳐도 팝업에서 다시 볼 수 있게 최근 200건을 남긴다(방해 금지로 띄우지 않은 것도 포함).
const ALERT_HISTORY_KEY = 'alertHistory';
const ALERT_HISTORY_MAX = 200;
/** @type {Promise<void>} */
let alertHistoryQueue = Promise.resolve();
/**
 * @param {string} id
 * @param {AlertOptions} options
 * @param {boolean} muted
 */
function recordAlert(id, options, muted) {
  const entry = { id, title: options.title, message: options.message, time: Date.now(), ...(muted ? { muted: true } : {}) };
  alertHistoryQueue = alertHistoryQueue.then(async () => {
    const result = await chrome.storage.local.get(ALERT_HISTORY_KEY);
    const list = [entry, ...(result[ALERT_HISTORY_KEY] ?? [])].slice(0, ALERT_HISTORY_MAX);
    await chrome.storage.local.set({ [ALERT_HISTORY_KEY]: list });
  });
}

// 지정가 알림 관련 함수
// 웹소켓 틱마다 storage를 읽지 않도록 알림 설정을 메모리에 캐시하고 storage 변경 시 동기화한다.
// priceAlerts: { [exchange]: { [market]: [{ price, deadband? }] } }, triggeredPrices: { [exchange]: { [market]: { [price]: boolean } } },
// deadbandSettings: { [exchange]: { [market]: { [price]: number } } }
/** @type {{ priceAlerts: Record<string, any>, triggeredPrices: Record<string, any>, deadbandSettings: Record<string, any> }} */
export const alertCache = { priceAlerts: {}, triggeredPrices: {}, deadbandSettings: {} };
const ALERT_KEYS = /** @type {(keyof typeof alertCache)[]} */ (Object.keys(alertCache));

export const alertsReady = chrome.storage.local.get(ALERT_KEYS).then(result => {
  ALERT_KEYS.forEach(key => {
    alertCache[key] = result[key] || {};
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  ALERT_KEYS.forEach(key => {
    if (changes[key]) alertCache[key] = changes[key].newValue || {};
  });
});

/**
 * @param {string} exchange
 * @param {string} ticker 마켓 코드
 * @param {number} currentPrice
 */
export function checkPriceAlerts(exchange, ticker, currentPrice) {
  // 알림 미설정 ticker도 lastPrice 추적: 첫 알림 등록 후 즉시 크로싱 검출 가능하도록.
  const lastPrice = allExchangesTickers[exchange][ticker]?.lastPrice ?? null;
  allExchangesTickers[exchange][ticker] = allExchangesTickers[exchange][ticker] || {};
  allExchangesTickers[exchange][ticker].lastPrice = currentPrice;

  const alertPrices = alertCache.priceAlerts[exchange]?.[ticker];
  if (!alertPrices?.length || lastPrice === null) return;

  const triggered = alertCache.triggeredPrices;
  const deadbandSettings = alertCache.deadbandSettings;
  triggered[exchange] = triggered[exchange] || {};
  triggered[exchange][ticker] = triggered[exchange][ticker] || {};
  const tickerTriggered = triggered[exchange][ticker];
  let changed = false;

  /** @type {{ price?: number, deadband?: number }[]} */ (alertPrices).forEach(({ price: alertPrice, deadband: alertDeadband }) => {
    if (alertPrice === undefined) return;
    const deadband = deadbandSettings[exchange]?.[ticker]?.[alertPrice] ?? alertDeadband ?? 0;
    const wasTriggered = !!tickerTriggered[alertPrice];
    const result = evaluatePriceAlert({ lastPrice, currentPrice, alertPrice, deadband, triggered: wasTriggered });
    if (result.notify) sendNotification(exchange, ticker, alertPrice, result.crossedUp);
    if (result.triggered !== wasTriggered) {
      tickerTriggered[alertPrice] = result.triggered;
      changed = true;
    }
  });

  if (changed) chrome.storage.local.set({ triggeredPrices: triggered });
}

// 알림 문구는 팝업에서 고른 언어를 따르고, 설정이 없으면 브라우저 언어를 따른다.
/** @type {Record<string, { up: string, down: string }>} */
const NOTIFICATION_TEXT = {
  ko: { up: '상향 도달', down: '하향 도달' },
  en: { up: 'reached (rising)', down: 'reached (falling)' },
  es: { up: 'alcanzado (subiendo)', down: 'alcanzado (bajando)' },
  pt: { up: 'atingido (subindo)', down: 'atingido (caindo)' },
  vi: { up: 'đã chạm (tăng)', down: 'đã chạm (giảm)' },
  tr: { up: 'ulaştı (yükseliş)', down: 'ulaştı (düşüş)' },
  id: { up: 'tercapai (naik)', down: 'tercapai (turun)' },
  ja: { up: '到達（上昇）', down: '到達（下落）' },
  zh: { up: '已到达（上涨）', down: '已到达（下跌）' },
  hi: { up: 'पहुँचा (बढ़त)', down: 'पहुँचा (गिरावट)' },
};
/** @type {string | null} */
let userLanguage = null;
export const languageReady = chrome.storage.local.get('language').then(result => {
  userLanguage = result.language || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) userLanguage = changes.language.newValue || null;
});
/** @returns {string} */
export const getLanguage = () => {
  const language = userLanguage || chrome.i18n?.getUILanguage?.().toLowerCase().split('-')[0] || 'en';
  return NOTIFICATION_TEXT[language] ? language : 'en';
};

// 방향은 가격 비교로 다시 구하지 않는다. 올라오다 목표가에 딱 닿으면(현재가 = 목표가) 하향으로 잘못 표시된다.
/**
 * @param {string} exchange
 * @param {string} ticker
 * @param {number} alertPrice
 * @param {boolean} crossedUp
 */
function sendNotification(exchange, ticker, alertPrice, crossedUp) {
  const notificationId = `${exchange}:${ticker}:${alertPrice}`;
  createNotification(notificationId, {
    type: 'basic',
    iconUrl: 'como-logo.png',
    title: `${alertPrice > 10 ? alertPrice.toLocaleString('en-US') : alertPrice} ${ticker} ${exchange.toUpperCase()}`,
    message: `${ticker} ${NOTIFICATION_TEXT[getLanguage()][crossedUp ? 'up' : 'down']}`,
  });
  // 알림이 실제로 울린 시점은 리뷰 요청 조건으로 쓴다.
  chrome.storage.local.set({ alertFiredAt: Date.now() });
}

// 알림을 누르면 해당 거래소의 거래 화면을 연다.
/**
 * @param {string} exchange
 * @param {string} market
 * @returns {string | null}
 */
const getTradeUrl = (exchange, market) => {
  const quote = ['USDT', 'USD', 'INR', 'BTC'].find(q => market.endsWith(q)) ?? '';
  const base = quote ? market.slice(0, -quote.length) : market;
  switch (exchange) {
    case 'upbit':
      return `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`;
    case 'bithumb':
      return `https://www.bithumb.com/react/trade/order/${market.split('-').reverse().join('-')}`;
    case 'binance':
      return `https://www.binance.com/en/trade/${base}_${quote}?type=spot`;
    case 'bybit':
      return `https://www.bybit.com/trade/spot/${base}/${quote}`;
    case 'okx':
      return `https://www.okx.com/trade-spot/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case 'coinbase':
      return `https://www.coinbase.com/advanced-trade/spot/${base}-${quote}`;
    case 'bitget':
      return `https://www.bitget.com/spot/${base}${quote}`;
    case 'kraken':
      return `https://pro.kraken.com/app/trade/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case 'coindcx':
      return `https://coindcx.com/trade/${market}`;
    case 'coinone':
      return `https://coinone.co.kr/exchange/trade/${market.slice(4).toLowerCase()}/krw`;
    case 'digitalx':
      return `https://exchange.digitalx.miraeasset.com/trade/?symbol=${market.slice(4).toLowerCase()}_krw`;
    default:
      return null;
  }
};

// 알림 id로 열 페이지. 알림을 누를 때와 알림 기록함에서 누를 때 같이 쓴다.
//   notice:<거래소>:<공지 id> → 공지, econ:<일정 id> → 없음, <거래소>:<마켓>:... → 거래 화면
/**
 * @param {string} notificationId
 * @returns {string | null}
 */
export const alertTargetUrl = notificationId => {
  if (notificationId.startsWith('notice:')) {
    const [, exchange, id] = notificationId.split(':');
    if (exchange === 'upbit') return `https://upbit.com/service_center/notice?id=${id}`;
    if (exchange === 'bithumb') return `https://feed.bithumb.com/notice/${id}`;
    return null;
  }
  const [exchange, market] = notificationId.split(':');
  return (market && getTradeUrl(exchange, market)) || null;
};

chrome.notifications.onClicked.addListener(notificationId => {
  const url = alertTargetUrl(notificationId);
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

// 알림 기록함 비우기. 동시에 들어온 알림이 비운 뒤에 되살아나지 않도록 기록과 같은 큐에서 처리한다.
export function clearAlertHistory() {
  alertHistoryQueue = alertHistoryQueue.then(() => chrome.storage.local.set({ [ALERT_HISTORY_KEY]: [] }));
  return alertHistoryQueue;
}
