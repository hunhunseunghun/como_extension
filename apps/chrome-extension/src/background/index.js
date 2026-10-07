import { evaluatePriceAlert } from './lib/priceAlert.js';
import { formatBadgePrice, formatPercent, shiftDate } from './lib/format.js';
import { computeKimchiPremium as computeKimchiPremiumFrom, KRW_EXCHANGES } from './lib/kimchi.js';
import { coinOf, pickBadgeFrame } from './lib/badge.js';
import { addSample, evaluateSurge } from './lib/surge.js';
import { isInQuietHours } from './lib/quietHours.js';
import { altseasonCandidates, altseasonIndex, klineReturn, openInterestChange } from './lib/derivatives.js';
import { matchesWhaleRule, parseBinanceAggTrade, parseUpbitTrade } from './lib/whale.js';
import { alertText } from './lib/texts.js';
import { aggregateUpbitWallet } from './lib/walletStatus.js';
import { allExchangesTickers } from './state.js';
import { fetchJson } from './net.js';
import { ensureAlarm } from './alarms.js';
import { configureFeeds, refreshEconCalendar } from './feeds.js';
import {
  configureExchanges,
  UpbitData,
  BithumbData,
  BinanceData,
  BybitData,
  OkxData,
  CoinbaseData,
  BitgetData,
  KrakenData,
  CoindcxData,
  CoinoneData,
  DigitalxData,
} from './exchanges.js';

// 초기 설정 및 전역 변수
const maxChangeRate = { exchange: '', market: '', changeRate: 0 };

const getKSTDate = () =>
  new Date()
    .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\./g, '')
    .replace(/ /g, '');

let CURRENT_DATE = getKSTDate();

// 날짜가 바뀌었으면 CURRENT_DATE를 바꾸고 true를 돌려준다. 하루 한 번 규칙은 확인할 때마다 이걸 불러 자정 직후에도 바로 풀린다.
function refreshCurrentDate() {
  const date = getKSTDate();
  if (date === CURRENT_DATE) return false;
  CURRENT_DATE = date;
  return true;
}

chrome.alarms.create('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate' && refreshCurrentDate()) {
    // 서비스 워커가 날짜를 넘겨 살아 있으면 환율이 갱신되지 않으므로 날짜가 바뀔 때 다시 조회한다.
    exchangeRateManager.updateExchangeRate();
  }
});

// 방해 금지 시간대: 그동안 오는 알림은 띄우지 않고 제목만 모아 두었다가, 끝나면 한 번에 요약해 알린다.
const QUIET_HOURS_KEY = 'quietHours';
const QUIET_MISSED_KEY = 'quietHoursMissed';
let quietHours = null;
const quietHoursReady = chrome.storage.local.get(QUIET_HOURS_KEY).then(result => {
  quietHours = result[QUIET_HOURS_KEY] ?? null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[QUIET_HOURS_KEY]) quietHours = changes[QUIET_HOURS_KEY].newValue ?? null;
});
let missedQueue = Promise.resolve();
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
    silent: quietMode,
  });
}
ensureAlarm('quietHoursSummary', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'quietHoursSummary') flushMissedAlerts();
});

// 알림은 모두 이걸로 띄운다. 조용한 모드에서는 소리 없이, 방해 금지 시간에는 띄우지 않고 모아 둔다.
const createNotification = (id, options) => {
  const muted = isInQuietHours(quietHours, new Date());
  recordAlert(id, options, muted);
  if (muted) {
    rememberMissed(options.title);
    return;
  }
  chrome.notifications.create(id, { ...options, silent: quietMode });
};

// 알림 기록함: OS 알림을 놓쳐도 팝업에서 다시 볼 수 있게 최근 200건을 남긴다(방해 금지로 띄우지 않은 것도 포함).
const ALERT_HISTORY_KEY = 'alertHistory';
const ALERT_HISTORY_MAX = 200;
let alertHistoryQueue = Promise.resolve();
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
const alertCache = { priceAlerts: {}, triggeredPrices: {}, deadbandSettings: {} };
const ALERT_KEYS = Object.keys(alertCache);

const alertsReady = chrome.storage.local.get(ALERT_KEYS).then(result => {
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

function checkPriceAlerts(exchange, ticker, currentPrice) {
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

  alertPrices.forEach(({ price: alertPrice, deadband: alertDeadband }) => {
    if (alertPrice === undefined) return;
    const deadband = deadbandSettings[exchange]?.[ticker]?.[alertPrice] ?? alertDeadband ?? 0;
    const wasTriggered = !!tickerTriggered[alertPrice];
    const result = evaluatePriceAlert({ lastPrice, currentPrice, alertPrice, deadband, triggered: wasTriggered });
    if (result.notify) sendNotification(exchange, ticker, currentPrice, alertPrice, result.crossedUp);
    if (result.triggered !== wasTriggered) {
      tickerTriggered[alertPrice] = result.triggered;
      changed = true;
    }
  });

  if (changed) chrome.storage.local.set({ triggeredPrices: triggered });
}

// 알림 문구는 팝업에서 고른 언어를 따르고, 설정이 없으면 브라우저 언어를 따른다.
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
let userLanguage = null;
const languageReady = chrome.storage.local.get('language').then(result => {
  userLanguage = result.language || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) userLanguage = changes.language.newValue || null;
});
const getLanguage = () => {
  const language = userLanguage || chrome.i18n?.getUILanguage?.().toLowerCase().split('-')[0];
  return NOTIFICATION_TEXT[language] ? language : 'en';
};

// 방향은 가격 비교로 다시 구하지 않는다. 올라오다 목표가에 딱 닿으면(현재가 = 목표가) 하향으로 잘못 표시된다.
function sendNotification(exchange, ticker, currentPrice, alertPrice, crossedUp) {
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
const alertTargetUrl = notificationId => {
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

// 신규 상장 알림: 업비트·빗썸의 KRW 마켓 목록을 주기적으로 비교해 새로 생긴 마켓을 알린다.
// 공지 API 대신 이미 허용된 market/all을 쓰므로 호스트 권한을 늘리지 않는다.
const LISTING_SOURCES = {
  upbit: 'https://api.upbit.com/v1/market/all',
  bithumb: 'https://api.bithumb.com/v1/market/all',
};
const LISTING_SETTING_KEY = 'listingAlerts';
const KNOWN_MARKETS_KEY = 'knownKrwMarkets';
const LISTING_TEXT = {
  ko: '원화 마켓 신규 상장',
  en: 'New KRW market listing',
  es: 'Nuevo listado en el mercado KRW',
  pt: 'Nova listagem no mercado KRW',
  vi: 'Niêm yết mới trên thị trường KRW',
  tr: 'KRW pazarında yeni listeleme',
  id: 'Listing baru di pasar KRW',
  ja: 'ウォン市場に新規上場',
  zh: '韩元市场新上币',
  hi: 'KRW बाज़ार में नई लिस्टिंग',
};

// 설정이 없으면 한국어 사용자에게만 켠다. 팝업의 기본값(isListingAlertsDefault)과 같은 규칙이다.
const isListingAlertsEnabled = stored => stored ?? getLanguage() === 'ko';

let listingCheckRunning = false;
async function checkNewListings() {
  // 시작 직후 확인과 알람이 겹치면 같은 상장을 두 번 알릴 수 있다.
  if (listingCheckRunning) return;
  listingCheckRunning = true;
  try {
    await languageReady;
    await checkNewListingsOnce();
  } finally {
    listingCheckRunning = false;
  }
}

async function checkNewListingsOnce() {
  const result = await chrome.storage.local.get([LISTING_SETTING_KEY, KNOWN_MARKETS_KEY]);
  const known = result[KNOWN_MARKETS_KEY] || {};
  const notify = isListingAlertsEnabled(result[LISTING_SETTING_KEY]);
  const next = { ...known };

  for (const [exchange, url] of Object.entries(LISTING_SOURCES)) {
    let markets;
    try {
      const response = await fetch(url);
      markets = (await response.json()).filter(market => market.market?.startsWith('KRW-'));
    } catch (error) {
      console.warn(error);
      continue;
    }
    const previous = known[exchange];
    // 일시적으로 목록이 짧게 오면 기준을 덮어쓰지 않는다.
    if (!markets.length || (previous && markets.length < previous.length * 0.8)) continue;
    next[exchange] = markets.map(market => market.market);
    if (!previous || !notify) continue;

    const added = markets.filter(market => !previous.includes(market.market));
    // 한꺼번에 많이 생기면 상장이 아니라 목록 형식 변화로 보고 알리지 않는다.
    if (added.length > 5) continue;
    added.forEach(market => {
      const name = getLanguage() === 'ko' ? market.korean_name : market.english_name;
      createNotification(`${exchange}:${market.market}:listing`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${name || market.market} (${market.market.slice(4)}) · ${exchange.toUpperCase()}`,
        message: LISTING_TEXT[getLanguage()],
      });
    });
  }
  chrome.storage.local.set({ [KNOWN_MARKETS_KEY]: next });
}

// 변동률·김프 알림 규칙. 지정가 알림과 따로 저장하고, 백그라운드가 받는 전 거래소 시세로 10초마다 확인한다.
//   change: { id, type: 'change', exchange, market, threshold }  24시간 등락률 절댓값이 threshold(%) 이상이면 하루 한 번
//   kimchi: { id, type: 'kimchi', exchange: 'upbit'|'bithumb', coin, above?, below? }  김프가 기준을 넘으면 한 번, 0.3%p 되돌아오면 다시 무장
const RULES_KEY = 'alertRules';
const RULE_STATE_KEY = 'alertRuleState';
const KIMCHI_REARM_GAP = 0.3;
const RULE_TEXT = {
  ko: { change: '24시간 변동', kimchiAbove: '김프 상단 도달', kimchiBelow: '김프 하단 도달' },
  en: { change: '24h move', kimchiAbove: 'Kimchi premium above', kimchiBelow: 'Kimchi premium below' },
  es: { change: 'Movimiento 24 h', kimchiAbove: 'Prima kimchi por encima', kimchiBelow: 'Prima kimchi por debajo' },
  pt: { change: 'Variação 24 h', kimchiAbove: 'Prêmio kimchi acima', kimchiBelow: 'Prêmio kimchi abaixo' },
  vi: { change: 'Biến động 24h', kimchiAbove: 'Kimchi premium vượt trên', kimchiBelow: 'Kimchi premium xuống dưới' },
  tr: { change: '24s hareket', kimchiAbove: 'Kimchi primi üstünde', kimchiBelow: 'Kimchi primi altında' },
  id: { change: 'Pergerakan 24 jam', kimchiAbove: 'Kimchi premium di atas', kimchiBelow: 'Kimchi premium di bawah' },
  ja: { change: '24時間変動', kimchiAbove: 'キムチプレミアム上限到達', kimchiBelow: 'キムチプレミアム下限到達' },
  zh: { change: '24小时涨跌', kimchiAbove: '泡菜溢价达到上限', kimchiBelow: '泡菜溢价达到下限' },
  hi: { change: '24 घंटे की चाल', kimchiAbove: 'किमची प्रीमियम ऊपर', kimchiBelow: 'किमची प्रीमियम नीचे' },
};
const ruleCache = { rules: [], state: {} };
// 단기 급등락 규칙의 최근 가격 표본(거래소:마켓 → [{ t, p }]). 서비스 워커가 다시 시작되면 처음부터 쌓는다.
const surgeSamples = new Map();
// 바이낸스 선물 미결제약정(기호 → { usd, change1h, change24h }). 롱숏 비율과 함께 5분마다 받는다.
const openInterest = new Map();
const rulesReady = chrome.storage.local.get([RULES_KEY, RULE_STATE_KEY]).then(result => {
  ruleCache.rules = result[RULES_KEY] || [];
  ruleCache.state = result[RULE_STATE_KEY] || {};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[RULES_KEY]) ruleCache.rules = changes[RULES_KEY].newValue || [];
  if (changes[RULE_STATE_KEY]) ruleCache.state = changes[RULE_STATE_KEY].newValue || {};
});

function checkAlertRules() {
  if (!ruleCache.rules.length) {
    surgeSamples.clear();
    return;
  }
  refreshCurrentDate();
  const text = RULE_TEXT[getLanguage()] ?? RULE_TEXT.en;
  // 지운 규칙의 상태는 남기지 않는다.
  const ruleIds = new Set(ruleCache.rules.map(rule => rule.id));
  const state = Object.fromEntries(Object.entries(ruleCache.state).filter(([id]) => ruleIds.has(id)));
  let changed = Object.keys(state).length !== Object.keys(ruleCache.state).length;
  let kimchi = null;
  const notify = (id, exchange, market, title, message) => {
    createNotification(`${exchange}:${market}:rule-${id}`, { type: 'basic', iconUrl: 'como-logo.png', title, message });
    chrome.storage.local.set({ alertFiredAt: Date.now() });
  };

  const now = Date.now();
  const sampled = new Set();
  for (const rule of ruleCache.rules) {
    const current = { ...state[rule.id] };
    if (rule.type === 'change' && rule.window) {
      // 단기 급등락: 10초마다 가격을 쌓아 창 안의 최저·최고가와 비교한다.
      const key = `${rule.exchange}:${rule.market}`;
      const price = allExchangesTickers[rule.exchange]?.[rule.market]?.currentPrice;
      if (!surgeSamples.has(key)) surgeSamples.set(key, []);
      if (!sampled.has(key)) addSample(surgeSamples.get(key), now, price);
      sampled.add(key);
      const move = evaluateSurge(rule, surgeSamples.get(key), now, current.firedAt);
      if (move != null) {
        const label = alertText(getLanguage(), move >= 0 ? 'surgeUp' : 'surgeDown', { n: rule.window });
        notify(rule.id, rule.exchange, rule.market, `${rule.market} ${formatPercent(move)} · ${rule.exchange.toUpperCase()}`, `${label} ≥ ${rule.threshold}%`);
        current.firedAt = now;
      }
    } else if (rule.type === 'oi') {
      // 미결제약정: 5분마다 받는 1시간 변화율이 기준을 넘으면 알리고 1시간 쉰다.
      const item = openInterest.get(rule.symbol);
      if (item?.change1h == null || (current.firedAt && now - current.firedAt < 60 * 60_000)) continue;
      if (Math.abs(item.change1h) < rule.threshold) continue;
      createNotification(`binance:${rule.symbol}:rule-${rule.id}`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${rule.symbol.replace(/USDT$/, '')} OI ${formatPercent(item.change1h)} · BINANCE`,
        message: `${alertText(getLanguage(), 'oiChange', { v: formatPercent(item.change1h) })} (≥ ${rule.threshold}%)`,
      });
      chrome.storage.local.set({ alertFiredAt: now });
      current.firedAt = now;
    } else if (rule.type === 'change') {
      const ticker = allExchangesTickers[rule.exchange]?.[rule.market];
      if (!ticker?.currentPrice || current.firedOn === CURRENT_DATE) continue;
      const rate = ticker.changeRate ?? 0;
      if (Math.abs(rate) < rule.threshold) continue;
      notify(rule.id, rule.exchange, rule.market, `${rule.market} ${formatPercent(rate)} · ${rule.exchange.toUpperCase()}`, `${text.change} ≥ ${rule.threshold}%`);
      current.firedOn = CURRENT_DATE;
    } else if (rule.type === 'kimchi') {
      kimchi ??= computeKimchiPremium().items;
      const market = `KRW-${rule.coin}`;
      const premium = kimchi[`${rule.exchange}:${market}`]?.premium;
      if (premium == null) continue;
      const title = `${rule.coin} ${formatPercent(premium)} · ${rule.exchange.toUpperCase()}`;
      if (rule.above != null) {
        if (current.aboveFired !== true && premium >= rule.above) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiAbove} (${rule.above}%)`);
          current.aboveFired = true;
        } else if (current.aboveFired && premium < rule.above - KIMCHI_REARM_GAP) current.aboveFired = false;
      }
      if (rule.below != null) {
        if (current.belowFired !== true && premium <= rule.below) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiBelow} (${rule.below}%)`);
          current.belowFired = true;
        } else if (current.belowFired && premium > rule.below + KIMCHI_REARM_GAP) current.belowFired = false;
      }
    }
    if (JSON.stringify(current) !== JSON.stringify(state[rule.id] ?? {})) {
      state[rule.id] = current;
      changed = true;
    }
  }
  // 지운 단기 규칙의 표본은 버린다.
  for (const key of surgeSamples.keys()) if (!sampled.has(key)) surgeSamples.delete(key);
  if (changed) {
    ruleCache.state = state;
    chrome.storage.local.set({ [RULE_STATE_KEY]: state });
  }
}
setInterval(checkAlertRules, 10_000);

chrome.alarms.create('listingCheck', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'listingCheck') checkNewListings();
});
// 시작 직후 거래소 시세 요청과 겹쳐 업비트 요청 한도에 걸리지 않게 조금 늦춘다.
setTimeout(checkNewListings, 15_000);

// 툴바 배지: 고른 종목의 가격을 4글자 안으로 줄여 보여주고, 등락에 따라 배경색을 바꾼다.
const BADGE_STORAGE_KEY = 'badgeSettings';
let badgeSettings = null;
let upDownSetting = null;
let lastBadge = '';
// 조용한 모드: 배지를 비우고 알림 소리를 끈다. 팝업은 상승·하락 색을 끈다.
const QUIET_MODE_KEY = 'quietMode';
let quietMode = false;
// 번갈아 표시와 마우스를 올렸을 때 보이는 가격 목록에 쓰는 즐겨찾기
let favoriteCoins = {};
const badgeReady = chrome.storage.local
  .get([BADGE_STORAGE_KEY, 'upDownColors', QUIET_MODE_KEY, 'favoriteCoins'])
  .then(result => {
    badgeSettings = result[BADGE_STORAGE_KEY] || null;
    upDownSetting = result.upDownColors || null;
    quietMode = !!result[QUIET_MODE_KEY];
    favoriteCoins = result.favoriteCoins || {};
  });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[BADGE_STORAGE_KEY]) badgeSettings = changes[BADGE_STORAGE_KEY].newValue || null;
  if (changes.upDownColors) upDownSetting = changes.upDownColors.newValue || null;
  if (changes[QUIET_MODE_KEY]) quietMode = !!changes[QUIET_MODE_KEY].newValue;
  if (changes.favoriteCoins) favoriteCoins = changes.favoriteCoins.newValue || {};
  if (changes[BADGE_STORAGE_KEY] || changes.upDownColors || changes.language || changes[QUIET_MODE_KEY]) updateBadge();
});

// 단축키(기본 Alt+Shift+Q)로 조용한 모드를 켜고 끈다.
chrome.commands?.onCommand.addListener(command => {
  if (command === 'toggle-quiet-mode') chrome.storage.local.set({ [QUIET_MODE_KEY]: !quietMode });
});

const getBadgeSettings = () =>
  badgeSettings ??
  (getLanguage() === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' });

// 마우스를 올렸을 때 보이는 가격 목록(배지 코인 + 같은 거래소 즐겨찾기 최대 8개)
const BADGE_TITLE_LIMIT = 9;
let badgeTick = 0;

function updateBadge() {
  const settings = getBadgeSettings();
  const tickers = allExchangesTickers[settings.exchange] ?? {};
  const favorites = favoriteCoins[settings.exchange] ?? [];
  const hasPrice = market => !!tickers[market]?.currentPrice;
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
  const text = quietMode ? '' : frame.showSymbol ? coinOf(frame.market).slice(0, 4) : formatBadgePrice(ticker.currentPrice);
  const line = market => {
    const { currentPrice, changeRate: rate = 0 } = tickers[market];
    return `${coinOf(market)} ${currentPrice.toLocaleString('en-US')} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)`;
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

// 저장·삭제를 한 번에 하나씩 처리한다. 빠르게 두 번 추가하거나 팝업·사이드 패널에서 동시에 추가하면
// 둘 다 같은 옛 값을 읽고 덮어써 하나가 사라진다.
let alertWriteQueue = Promise.resolve();
function queueAlertWrite(task) {
  alertWriteQueue = alertWriteQueue.then(() => new Promise(resolve => task(resolve))).catch(error => console.warn(error));
}

// 시세 틱이 저장 직후 옛 triggeredPrices를 다시 쓰지 않도록 저장 전에 메모리 캐시부터 바꾼다.
function setAlertStorage(values, done) {
  Object.entries(values).forEach(([key, value]) => {
    if (key in alertCache) alertCache[key] = value;
  });
  chrome.storage.local.set(values, done);
}

function savePriceAlert(exchange, ticker, priceDeadbandPairs, response) {
  queueAlertWrite(release => savePriceAlertNow(exchange, ticker, priceDeadbandPairs, result => {
    response(result);
    release();
  }));
}

function deletePriceAlert(exchange, ticker, priceToDelete, response) {
  queueAlertWrite(release => deletePriceAlertNow(exchange, ticker, priceToDelete, result => {
    response(result);
    release();
  }));
}

function savePriceAlertNow(exchange, ticker, priceDeadbandPairs, response) {
  chrome.storage.local.get(['priceAlerts', 'triggeredPrices', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let triggered = result.triggeredPrices || {};
    let deadbandSettings = result.deadbandSettings || {};

    if (!alerts[exchange]) alerts[exchange] = {};
    if (!deadbandSettings[exchange]) deadbandSettings[exchange] = {};
    if (!deadbandSettings[exchange][ticker]) deadbandSettings[exchange][ticker] = {};

    const existingPrices = alerts[exchange][ticker] || [];
    priceDeadbandPairs.forEach(({ price, deadband }) => {
      if (!existingPrices.some(p => p.price === price)) {
        existingPrices.push({ price, deadband });
        if (deadband !== null) {
          deadbandSettings[exchange][ticker][price] = deadband;
        }
      }
    });
    alerts[exchange][ticker] = existingPrices;

    if (triggered[exchange] && triggered[exchange][ticker]) {
      triggered[exchange][ticker] = {};
    }

    setAlertStorage({ priceAlerts: alerts, triggeredPrices: triggered, deadbandSettings }, () => {
      response({ success: true, prices: existingPrices });
    });
  });
}

function deletePriceAlertNow(exchange, ticker, priceToDelete, response) {
  chrome.storage.local.get(['priceAlerts', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let deadbandSettings = result.deadbandSettings || {};

    // priceAlerts에서 삭제
    // 이미 지워진 알림이어도 팝업이 응답을 기다리며 멈추지 않게 빈 목록으로 처리한다.
    const updatedPairs = (alerts[exchange]?.[ticker] ?? []).filter(pair => pair.price !== priceToDelete);
    alerts[exchange] = { ...alerts[exchange], [ticker]: updatedPairs };

    // deadbandSettings에서 삭제
    if (deadbandSettings[exchange]?.[ticker]?.[priceToDelete]) {
      delete deadbandSettings[exchange][ticker][priceToDelete];
      if (Object.keys(deadbandSettings[exchange][ticker]).length === 0) {
        delete deadbandSettings[exchange][ticker];
      }
      if (Object.keys(deadbandSettings[exchange]).length === 0) {
        delete deadbandSettings[exchange];
      }
    }

    setAlertStorage({ priceAlerts: alerts, deadbandSettings }, () => {
      response({ success: true, prices: updatedPairs });
    });
  });
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPopup') chrome.action.openPopup();
  if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
  if (message.action === 'pendingExchange') pendingExchange = { name: message.exchange, at: Date.now() };
  if (message.action === 'getActiveExchange' && activePort && activeExchange) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
  }
  if (message.action === 'setPriceAlert') {
    const { exchange, ticker, prices } = message;
    savePriceAlert(exchange, ticker, prices, response => {
      sendResponse(response);
    });
    return true;
  }
  if (message.action === 'deletePriceAlert') {
    const { exchange, ticker, price } = message;
    deletePriceAlert(exchange, ticker, price, response => {
      sendResponse(response);
    });
    return true;
  }
  if (message.action === 'getSpreads') {
    sendResponse(computeSpreads({ includeKrw: message.includeKrw !== false }));
  }
  if (message.action === 'getKimchiPremium') {
    sendResponse(computeKimchiPremium());
  }
  if (message.action === 'getDerivatives') {
    sendResponse({ funding: derivatives.value, liquidations: summarizeLiquidations(), longShort: longShort.value });
  }
  if (message.action === 'getTrending') {
    sendResponse(trending.value ?? []);
  }
  if (message.action === 'getWhaleFeed') {
    sendResponse(whaleFeed);
  }
  if (message.action === 'refreshEcon') {
    refreshEconCalendar().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'clearAlertHistory') {
    // recordAlert와 같은 큐에서 비워, 동시에 들어온 알림이 지운 목록을 되살리지 않게 한다.
    alertHistoryQueue = alertHistoryQueue.then(() => chrome.storage.local.set({ [ALERT_HISTORY_KEY]: [] }));
    alertHistoryQueue.then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'openAlertTarget') {
    const url = alertTargetUrl(String(message.id ?? ''));
    if (url) chrome.tabs.create({ url });
    sendResponse({ opened: !!url });
  }
  if (message.action === 'syncExchangeAccount') {
    syncExchangeAccount(message.exchange).then(sendResponse);
    return true;
  }
  // 거래소별 연결 상태(점검·E2E용)
  if (message.action === 'getConnectionStatus') {
    sendResponse(
      Object.fromEntries(
        Object.entries(exchanges).map(([name, exchange]) => [
          name,
          { suspended: exchange.suspended, locked: exchange.locked, connected: exchange.socket?.readyState === WebSocket.OPEN || !!exchange.pollTimer },
        ]),
      ),
    );
  }
  if (message.action === 'getAllExchangesTickers') {
    sendResponse(Object.values(allExchangesTickers).flatMap(tickers => Object.values(tickers)));
  }
});

// 설치 및 업데이트 처리
let updatedVersion = '';
chrome.storage.local.get('updatedFromVersion').then(result => {
  updatedVersion ||= result.updatedFromVersion || '';
});
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.setUninstallURL('https://walla.my/v/a6J0FV5gUKCyzupMaG71');
    // 새로 설치한 사용자에게만 첫 실행 안내(Onboarding)를 보여 준다. 업데이트한 사용자는 이미 설정을 마쳤다.
    chrome.storage.local.set({ onboardingPending: true });
  }
  if (details.reason === 'update') {
    updatedVersion = details?.previousVersion || null;
    chrome.storage.local.set({ updatedFromVersion: updatedVersion });
  }
});

chrome.alarms.clear('keepAlive');

//  ExchangeRateManager 클래스
class ExchangeRateManager {
  constructor() {
    this.port = null;
    this.exchangeRateUSD = null;
    this.storages = {
      exchangeRateUSD: null,
      updatedDate: null,
      favoriteCoins: { upbit: [], bithumb: [], binance: [] },
    };
  }

  async initialize() {
    const keys = Object.keys(this.storages);
    const results = await Promise.all(
      keys.map(key => new Promise(resolve => chrome.storage.local.get(key, result => resolve(result)))),
    );
    results.forEach((result, index) => {
      this.storages[keys[index]] = result[keys[index]];
    });

    if (this.storages.exchangeRateUSD) this.exchangeRateUSD = Number(this.storages.exchangeRateUSD);
    if (!this.storages.exchangeRateUSD || this.storages.updatedDate !== CURRENT_DATE) {
      await this.updateExchangeRate();
    }
  }

  async updateExchangeRate() {
    try {
      await this.fetchFromAPI();
    } catch {
      await this.fetchFromNaver();
    }
  }

  async fetchFromAPI() {
    const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
    const MAX_ATTEMPTS = 7;
    let searchDate = CURRENT_DATE;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${searchDate}&data=AP01`;
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await response.json();

      if (Array.isArray(data) && data.length) {
        const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
        if (usdRate) {
          this.exchangeRateUSD = Number(usdRate);
          await this.saveExchangeRate(usdRate, searchDate);
          return;
        }
      }

      searchDate = shiftDate(CURRENT_DATE, attempt + 1);
    }

    throw new Error('No USD rate found in API');
  }

  async fetchFromNaver() {
    // finance.naver.com HTML 구조가 바뀌어 파싱이 깨졌으므로 JSON API를 사용한다.
    const url = 'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW';
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = await response.json();
      const exchangeRateUSD = Number(json?.result?.calcPrice ?? String(json?.result?.closePrice ?? '').replace(/,/g, ''));
      if (!Number.isFinite(exchangeRateUSD) || exchangeRateUSD <= 0) throw new Error('Failed to parse USD rate from Naver');

      this.exchangeRateUSD = exchangeRateUSD;
      await this.saveExchangeRate(exchangeRateUSD, CURRENT_DATE);
    } catch {
      // 조회 실패 시 마지막으로 저장된 환율을 계속 사용한다.
      this.exchangeRateUSD = Number(this.storages.exchangeRateUSD) || null;
    }
  }

  async saveExchangeRate(rate, date) {
    this.storages.exchangeRateUSD = rate ?? this.storages.exchangeRateUSD;
    this.storages.updatedDate = date ?? this.storages.updatedDate;
    await chrome.storage.local.set({
      exchangeRateUSD: this.storages.exchangeRateUSD,
      updatedDate: this.storages.updatedDate,
    });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: this.storages.exchangeRateUSD });
  }
}

// 선택 권한 거래소: 기존 사용자에게 업데이트 때 새 권한 확인 창이 뜨지 않도록, 거래소를 처음 고를 때 허락받는다.
const OPTIONAL_EXCHANGE_ORIGINS = {
  coinone: ['https://api.coinone.co.kr/*'],
  digitalx: ['https://api.digitalx.miraeasset.com/*'],
};

async function hasExchangePermission(name) {
  const origins = OPTIONAL_EXCHANGE_ORIGINS[name];
  return origins ? chrome.permissions.contains({ origins }) : true;
}

// 팝업이 권한 창을 띄우기 전에 고른 거래소. 권한 창이 뜨면 툴바 팝업이 닫혀 버려서, 허락되면 여기서 거래소를 바꾼다.
// 오래된 요청으로 나중에 엉뚱하게 바뀌지 않도록 2분만 유효하다.
let pendingExchange = null;
const PENDING_EXCHANGE_TTL = 2 * 60_000;

chrome.permissions.onAdded.addListener(async () => {
  for (const name of Object.keys(OPTIONAL_EXCHANGE_ORIGINS)) {
    const exchange = exchanges[name];
    if (!exchange.locked || !(await hasExchangePermission(name))) continue;
    // 화면이 닫혀 있으면 1분 뒤 다른 거래소처럼 쉬게 된다.
    if (popupPorts.size) exchange.suspended = false;
    await exchange.start().catch(console.warn);
    const pending = pendingExchange?.name === name && Date.now() - pendingExchange.at < PENDING_EXCHANGE_TTL;
    if (pending) pendingExchange = null;
    if (activeExchange === name) {
      // 화면이 먼저 이 거래소로 바뀌어 시세를 기다리고 있다.
      exchange.setPopupActive(true);
      if (activePort) exchange.connectPopup(activePort);
    } else if (pending) {
      await handleExchangeChange(name);
    }
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  for (const name of Object.keys(OPTIONAL_EXCHANGE_ORIGINS)) {
    if (await hasExchangePermission(name)) continue;
    const exchange = exchanges[name];
    exchange.dropSocket();
    exchange.started = false;
    exchange.locked = true;
  }
});

// 9. 활성 거래소 관리
const STORAGE_KEY = 'activeExchangePlatform';
let activeExchange = null;

async function saveActiveExchange(exchange) {
  await chrome.storage.local.set({ [STORAGE_KEY]: exchange });
  activeExchange = exchange;
}

async function loadActiveExchange() {
  const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
  return exchanges[state] ? state : 'upbit';
}

function getExchangeInstance(name) {
  return exchanges[name] ?? null;
}

async function handleExchangeChange(exchange) {
  if (activeExchange === exchange) return;

  const prev = getExchangeInstance(activeExchange);
  if (prev) prev.setPopupActive(false);

  activeExchange = exchange;
  // 다른 창도 같은 거래소로 맞춘다. 한쪽만 바뀌면 다른 창은 오지 않는 시세를 기다리며 멈춘다.
  // 화면은 거래소가 바뀌면 시세를 비우므로, 새 거래소 시세보다 먼저 보낸다.
  if (activePort) activePort.postMessage({ type: 'activeExchange', data: exchange });

  const next = getExchangeInstance(exchange);
  if (next) {
    next.setPopupActive(true);
    if (activePort) next.connectPopup(activePort);
  }

  await saveActiveExchange(exchange);
}

// 10. 메인 실행 로직
const exchangeRateManager = new ExchangeRateManager();
const exchanges = {
  upbit: new UpbitData(),
  bithumb: new BithumbData(),
  binance: new BinanceData(),
  bybit: new BybitData(),
  okx: new OkxData(),
  coinbase: new CoinbaseData(),
  bitget: new BitgetData(),
  kraken: new KrakenData(),
  coindcx: new CoindcxData(),
  coinone: new CoinoneData(),
  digitalx: new DigitalxData(),
};
configureExchanges({ checkPriceAlerts, hasExchangePermission, isWatchedByMini, exchanges });
configureFeeds({ createNotification, getLanguage, exchanges });

// 팝업과 사이드 패널이 동시에 열릴 수 있어 연결된 화면 모두에 보낸다.
// activePort는 연결된 화면이 하나라도 있으면 broadcastPort, 없으면 null이다.
const popupPorts = new Set();
const broadcastPort = {
  name: 'popup',
  postMessage(message) {
    popupPorts.forEach(port => {
      try {
        port.postMessage(message);
      } catch {
        popupPorts.delete(port);
      }
    });
  },
  onDisconnect: { addListener() {} },
};
let activePort = null;
let maxChangeRateIntervalId = null;

// 화면이 모두 닫히면 1분 뒤 배지·지정가 알림·알림 규칙에 쓰는 거래소만 연결해 둔다.
// 9개 거래소가 종일 초당 수많은 메시지를 보내면 노트북 배터리와 데이터를 계속 쓴다.
const IDLE_SUSPEND_DELAY = 60_000;
let idleTimer = null;

function exchangesNeededWhenIdle() {
  const needed = new Set();
  const badge = getBadgeSettings();
  if (badge.enabled) needed.add(badge.exchange);
  for (const [exchange, tickers] of Object.entries(alertCache.priceAlerts)) {
    if (Object.values(tickers ?? {}).some(list => list?.length)) needed.add(exchange);
  }
  for (const rule of ruleCache.rules) {
    // OI·대량 체결 규칙은 시세 소켓이 아니라 따로 받는다.
    if (rule.type !== 'change' && rule.type !== 'kimchi') continue;
    needed.add(rule.exchange);
    // 김프는 바이낸스 USDT 가격과 비교한다.
    if (rule.type === 'kimchi') needed.add('binance');
  }
  for (const list of miniPorts.values()) {
    list.forEach(exchange => needed.add(exchange));
    // 미니 창은 원화 종목에 김프를 함께 보여 준다.
    if (list.some(exchange => KRW_EXCHANGES.includes(exchange))) needed.add('binance');
  }
  return needed;
}

function applyIdleConnections() {
  idleTimer = null;
  if (popupPorts.size) return;
  const needed = exchangesNeededWhenIdle();
  Object.entries(exchanges).forEach(([name, exchange]) =>
    needed.has(name) ? exchange.resume().catch(console.warn) : exchange.suspend(),
  );
}

function scheduleIdleConnections(delay = IDLE_SUSPEND_DELAY) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(applyIdleConnections, delay);
}

function resumeAllExchanges() {
  clearTimeout(idleTimer);
  idleTimer = null;
  Object.values(exchanges).forEach(exchange => exchange.resume().catch(console.warn));
}

// 화면이 닫혀 있는 동안 배지·알림 설정이 바뀌면 필요한 거래소를 다시 고른다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || popupPorts.size) return;
  if (changes.priceAlerts || changes[RULES_KEY] || changes[BADGE_STORAGE_KEY]) scheduleIdleConnections(1000);
});

setInterval(() => Object.values(exchanges).forEach(exchange => exchange.checkStale()), 15_000);
setInterval(() => Object.values(exchanges).forEach(exchange => exchange.refreshMarkets().catch(console.warn)), 30 * 60_000);

// 주기적으로 받아오는 부가 데이터(법정화폐 환율, 시장 지표). 팝업이 연결되면 마지막 값을 바로 보낸다.
const POLL_RETRY_MS = 2 * 60_000;
class PolledData {
  constructor(type, intervalMs, load) {
    this.type = type;
    this.intervalMs = intervalMs;
    this.load = load;
    this.value = null;
  }

  async refresh() {
    try {
      const value = await this.load();
      if (value) {
        this.value = value;
        this.post(activePort);
        return;
      }
    } catch (error) {
      console.warn(error);
    }
    // 아직 한 번도 받지 못했는데 실패하면(요청 한도 429 등) 다음 주기(최대 1시간)까지 비워 두지 않고 2분 뒤 다시 받는다.
    if (!this.value && this.intervalMs > POLL_RETRY_MS && !this.retryTimer) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.refresh();
      }, POLL_RETRY_MS);
    }
  }

  start() {
    this.refresh();
    setInterval(() => this.refresh(), this.intervalMs);
  }

  post(port) {
    if (port && this.value) port.postMessage({ type: this.type, data: this.value });
  }
}


const polledData = [
  // 입출금이 멈춘 코인. 빗썸만 공개 API로 준다(업비트는 인증이 필요하다). 멈춘 코인만 보내 메시지를 작게 둔다.
  // 업비트는 인증이 필요해 거래소 계정 연동(읽기 전용 키)을 한 사용자에게만 보여 준다.
  new PolledData('walletStatus', 10 * 60 * 1000, async () => {
    const [bithumbResult, upbitResult] = await Promise.allSettled([
      fetchJson('https://api.bithumb.com/public/assetsstatus/ALL'),
      loadUpbitWalletStatus(),
    ]);
    const result = {};
    const { status, data } = bithumbResult.value ?? {};
    if (status === '0000' && data) {
      const bithumb = {};
      for (const [coin, { deposit_status: deposit, withdrawal_status: withdraw }] of Object.entries(data)) {
        if (deposit !== 1 || withdraw !== 1) bithumb[coin] = { deposit: deposit === 1, withdraw: withdraw === 1 };
      }
      result.bithumb = bithumb;
    }
    if (upbitResult.value) result.upbit = upbitResult.value;
    // 한쪽 조회가 잠깐 실패해도 직전 값을 지워 경고 표시가 사라지지 않게 한다.
    const previous = polledData.find(data => data.type === 'walletStatus')?.value;
    if (!result.bithumb && previous?.bithumb) result.bithumb = previous.bithumb;
    if (!result.upbit && previous?.upbit && upbitResult.status === 'rejected') result.upbit = previous.upbit;
    return Object.keys(result).length ? result : null;
  }),
  // USD 기준 166개 법정화폐 환율
  new PolledData('fiatRates', 6 * 60 * 60 * 1000, async () => {
    const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
    return data?.result === 'success' ? data.rates : null;
  }),
  // 공포·탐욕 지수, BTC 도미넌스, BTC 펀딩비. 하나가 실패해도 나머지는 보낸다.
  new PolledData('marketStats', 5 * 60 * 1000, async () => {
    const [fearGreed, global, funding] = await Promise.allSettled([
      fetchJson('https://api.alternative.me/fng/'),
      fetchJson('https://api.coingecko.com/api/v3/global'),
      fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
    ]);
    const fng = fearGreed.value?.data?.[0];
    return {
      fearGreed: fng ? { value: Number(fng.value), classification: fng.value_classification } : null,
      btcDominance: global.value?.data?.market_cap_percentage?.btc ?? null,
      fundingRate: funding.value?.lastFundingRate != null ? Number(funding.value.lastFundingRate) : null,
    };
  }),
];

// 코인 시장 데이터(1시간마다): 시가총액 상위 500개의 역대 최고가(ATH) 대비 하락률과 알트코인 시즌 지수.
// 시즌 지수 = 시가총액 상위 알트코인 50개(스테이블·래핑 토큰 제외) 중 90일 동안 BTC보다 많이 오른 비율. 12시간마다 다시 계산한다.
const ALTSEASON_KEY = 'altseason';
const ALTSEASON_REFRESH_MS = 12 * 60 * 60_000;
const ALTSEASON_DAYS = 90;
async function computeAltseason(markets) {
  const stored = (await chrome.storage.local.get(ALTSEASON_KEY))[ALTSEASON_KEY];
  if (stored && Date.now() - stored.updatedAt < ALTSEASON_REFRESH_MS) return stored;
  const klines = symbol =>
    fetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${ALTSEASON_DAYS + 1}`).then(klineReturn, () => NaN);
  // 바이낸스에 없는 코인이 있어 넉넉히 고른 뒤 수익률을 구한 앞의 50개만 쓴다.
  const candidates = altseasonCandidates(markets, 65);
  const [btc, ...alts] = await Promise.all([klines('BTC'), ...candidates.map(klines)]);
  const returns = alts.filter(Number.isFinite).slice(0, 50);
  const value = altseasonIndex(btc, returns);
  if (value == null) return stored ?? null;
  const result = { value, count: returns.length, days: ALTSEASON_DAYS, updatedAt: Date.now() };
  await chrome.storage.local.set({ [ALTSEASON_KEY]: result });
  return result;
}
const coinMarket = new PolledData('coinMarket', 60 * 60_000, async () => {
  const pages = await Promise.all(
    [1, 2].map(page => fetchJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`)),
  );
  const markets = pages.flat();
  // 같은 기호가 여럿이면 시가총액이 큰(먼저 나온) 코인을 쓴다.
  const ath = {};
  for (const coin of markets) {
    const symbol = String(coin?.symbol ?? '').toUpperCase();
    if (symbol && !(symbol in ath) && Number.isFinite(coin.ath_change_percentage)) {
      ath[symbol] = { change: coin.ath_change_percentage, price: coin.ath, date: coin.ath_date };
    }
  }
  const altseason = await computeAltseason(markets).catch(error => {
    console.warn(error);
    return null;
  });
  return { ath, altseason };
});
polledData.push(coinMarket);

// 파생 지표: 바이낸스 USDT 무기한 선물의 펀딩비 순위(1분마다)와 강제 청산 스트림(최근 1시간 누적).
const FUNDING_LIST_SIZE = 5;
const derivatives = new PolledData('derivatives', 60 * 1000, async () => {
  const list = await fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex');
  const rates = list
    .filter(item => item.symbol.endsWith('USDT') && item.lastFundingRate !== '')
    .map(item => ({ symbol: item.symbol, rate: Number(item.lastFundingRate), nextFundingTime: item.nextFundingTime }))
    .filter(item => Number.isFinite(item.rate))
    .sort((a, b) => b.rate - a.rate);
  return { highest: rates.slice(0, FUNDING_LIST_SIZE), lowest: rates.slice(-FUNDING_LIST_SIZE).reverse(), updatedAt: Date.now() };
});
derivatives.post = () => {}; // 팝업이 열 때 메시지로 받아 간다.

// 롱숏 비율(바이낸스 선물, 5분 단위): 전체 계정 중 롱 비율과 상위 트레이더 포지션 중 롱 비율. 5분마다 받는다.
const LONG_SHORT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const longShort = new PolledData('longShort', 5 * 60 * 1000, async () => {
  const query = (path, symbol) => fetchJson(`https://fapi.binance.com/futures/data/${path}?symbol=${symbol}&period=5m&limit=1`);
  const items = await Promise.all(
    LONG_SHORT_SYMBOLS.map(async symbol => {
      const oiHistory = (period, limit) =>
        fetchJson(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`);
      const [accounts, top, oiHour, oiDay] = await Promise.allSettled([
        query('globalLongShortAccountRatio', symbol),
        query('topLongShortPositionRatio', symbol),
        // 미결제약정: 5분 단위 13개(1시간), 1시간 단위 25개(24시간)
        oiHistory('5m', 13),
        oiHistory('1h', 25),
      ]);
      const hour = openInterestChange(oiHour.value);
      const day = openInterestChange(oiDay.value);
      const oi = { usd: hour?.usd ?? day?.usd ?? null, change1h: hour?.change ?? null, change24h: day?.change ?? null };
      if (oi.usd != null) openInterest.set(symbol, oi);
      const account = accounts.value?.[0];
      if (!account) return null;
      return {
        symbol,
        longAccount: Number(account.longAccount),
        topLong: top.value?.[0] ? Number(top.value[0].longAccount) : null,
        openInterest: oi.usd != null ? oi : null,
      };
    }),
  );
  const list = items.filter(Boolean);
  return list.length ? { items: list, updatedAt: Date.now() } : null;
});
longShort.post = () => {};

const LIQUIDATION_WINDOW = 60 * 60 * 1000;
const liquidations = [];
let liquidationSocket = null;
function connectLiquidations() {
  // 심볼마다 1초에 최대 1건(가장 큰 청산)만 오는 스냅샷 스트림이라 가볍다.
  // 예전 /ws 경로는 연결은 되지만 메시지를 보내지 않는다. 시장 데이터 스트림은 /market/ws를 쓴다.
  liquidationSocket = new WebSocket('wss://fstream.binance.com/market/ws/!forceOrder@arr');
  liquidationSocket.onmessage = event => {
    try {
      const order = JSON.parse(event.data)?.o;
      if (!order) return;
      const usd = Number(order.ap) * Number(order.z || order.q);
      if (!Number.isFinite(usd)) return;
      // 매도 체결 = 롱 포지션 청산, 매수 체결 = 숏 포지션 청산
      liquidations.push({ symbol: order.s, side: order.S === 'SELL' ? 'long' : 'short', usd, price: Number(order.ap), time: order.T });
      const cutoff = Date.now() - LIQUIDATION_WINDOW;
      while (liquidations.length && liquidations[0].time < cutoff) liquidations.shift();
      if (liquidations.length > 5000) liquidations.splice(0, liquidations.length - 5000);
    } catch (error) {
      console.warn(error);
    }
  };
  liquidationSocket.onclose = () => setTimeout(connectLiquidations, 5000);
  liquidationSocket.onerror = () => liquidationSocket?.close();
}
// 대량 체결(고래) 알림: 'whale' 규칙이 있는 마켓만 업비트·바이낸스 체결 스트림에 따로 연결한다.
// 규칙: { id, type: 'whale', exchange: 'upbit'|'binance', market, minAmount, direction? } (금액은 원화 또는 USDT)
const WHALE_FEED_SIZE = 20;
const whaleFeed = [];
const whaleLastAt = new Map();
const whaleSockets = { upbit: null, binance: null };
let whaleSignature = '';
const whaleRules = () => ruleCache.rules.filter(rule => rule.type === 'whale');

function onWhaleTrade(trade) {
  if (!trade) return;
  const rules = whaleRules().filter(rule => rule.exchange === trade.exchange && rule.market === trade.market);
  // 화면에 보여 줄 최근 대량 체결: 이 마켓 규칙 중 가장 낮은 기준 이상
  const minimum = Math.min(...rules.map(rule => rule.minAmount));
  if (!(trade.amount >= minimum)) return;
  whaleFeed.unshift(trade);
  if (whaleFeed.length > WHALE_FEED_SIZE) whaleFeed.length = WHALE_FEED_SIZE;
  const language = getLanguage();
  for (const rule of rules) {
    if (!matchesWhaleRule(rule, trade, whaleLastAt.get(rule.id))) continue;
    whaleLastAt.set(rule.id, trade.time);
    const quote = trade.exchange === 'upbit' ? '₩' : '$';
    createNotification(`${trade.exchange}:${trade.market}:rule-${rule.id}-${trade.time}`, {
      type: 'basic',
      iconUrl: 'como-logo.png',
      title: `${trade.market} ${quote}${formatBadgePrice(trade.amount)} · ${trade.exchange.toUpperCase()}`,
      message: `${alertText(language, trade.side === 'buy' ? 'whaleBuy' : 'whaleSell')} @ ${trade.price.toLocaleString('en-US')}`,
    });
    chrome.storage.local.set({ alertFiredAt: Date.now() });
  }
}

function openWhaleSocket(exchange, markets) {
  const socket =
    exchange === 'upbit'
      ? new WebSocket('wss://api.upbit.com/websocket/v1')
      : new WebSocket(`wss://stream.binance.com:9443/stream?streams=${markets.map(market => `${market.toLowerCase()}@aggTrade`).join('/')}`);
  let pingTimer = null;
  socket.onopen = () => {
    if (exchange !== 'upbit') return;
    socket.send(JSON.stringify([{ ticket: `como-whale-${Date.now()}` }, { type: 'trade', codes: markets }]));
    // 업비트는 2분 동안 오가는 데이터가 없으면 끊는다.
    pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('PING'), 60_000);
  };
  socket.onmessage = async event => {
    try {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();
      const message = JSON.parse(data);
      onWhaleTrade(exchange === 'upbit' ? parseUpbitTrade(message) : parseBinanceAggTrade(message));
    } catch {
      // PONG 등 JSON이 아닌 메시지
    }
  };
  socket.onclose = () => {
    clearInterval(pingTimer);
    // 규칙이 그대로면 5초 뒤 다시 잇는다.
    if (whaleSockets[exchange] === socket) {
      whaleSockets[exchange] = null;
      setTimeout(syncWhaleSockets, 5000);
    }
  };
  socket.onerror = () => socket.close();
  return socket;
}

function syncWhaleSockets(force = false) {
  const byExchange = { upbit: new Set(), binance: new Set() };
  whaleRules().forEach(rule => byExchange[rule.exchange]?.add(rule.market));
  const signature = JSON.stringify(Object.entries(byExchange).map(([name, set]) => [name, [...set].sort()]));
  if (signature === whaleSignature && !force && Object.entries(byExchange).every(([name, set]) => !set.size || whaleSockets[name])) return;
  whaleSignature = signature;
  for (const [exchange, set] of Object.entries(byExchange)) {
    const previous = whaleSockets[exchange];
    whaleSockets[exchange] = null;
    previous?.close();
    if (set.size) whaleSockets[exchange] = openWhaleSocket(exchange, [...set]);
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[RULES_KEY]) syncWhaleSockets();
});
rulesReady.then(() => syncWhaleSockets());

const startedAt = Date.now();
function summarizeLiquidations() {
  const cutoff = Date.now() - LIQUIDATION_WINDOW;
  const recent = liquidations.filter(item => item.time >= cutoff);
  const sum = side => recent.filter(item => item.side === side).reduce((total, item) => total + item.usd, 0);
  return {
    longUsd: sum('long'),
    shortUsd: sum('short'),
    count: recent.length,
    largest: [...recent].sort((a, b) => b.usd - a.usd).slice(0, 5),
    // 서비스 워커가 시작한 지 1시간이 안 됐으면 그만큼만 모은 값이다.
    windowMs: Math.min(LIQUIDATION_WINDOW, Date.now() - startedAt),
  };
}

// 트렌딩 코인: CoinGecko 검색 상위(10분마다)
const trending = new PolledData('trending', 10 * 60 * 1000, async () => {
  const data = await fetchJson('https://api.coingecko.com/api/v3/search/trending');
  return (data?.coins ?? []).slice(0, 10).map(({ item }) => ({
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    thumb: item.thumb,
    rank: item.market_cap_rank,
    change24h: item.data?.price_change_percentage_24h?.usd ?? null,
  }));
});
trending.post = () => {};

// 거래소 계정 연동(읽기 전용): 사용자가 넣은 API 키로 잔고만 조회한다. 키는 이 기기의 storage.local에만 있고 다른 곳으로 보내지 않는다.
const ACCOUNT_KEYS_STORAGE = 'exchangeApiKeys'; // { upbit?: { accessKey, secretKey }, binance?: { apiKey, secretKey } }
const encoder = new TextEncoder();
const base64Url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const hmacSha256 = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
};
const toHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

// 거래소 오류를 팝업이 번역해 보여줄 수 있는 코드로 바꾼다. 원문은 detail로 함께 넘긴다.
class AccountSyncError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

const UPBIT_ERROR_CODES = {
  no_authorization_ip: 'ip',
  invalid_access_key: 'invalidKey',
  jwt_verification: 'invalidKey',
  expired_access_key: 'expired',
  out_of_scope: 'permission',
};
// -2015: 키·IP·권한 중 하나가 맞지 않음, -2008/-2014/-1022: 없는 키·키 형식·서명 오류
const BINANCE_ERROR_CODES = { '-2015': 'ip', '-2008': 'invalidKey', '-2014': 'invalidKey', '-1022': 'invalidKey' };

// 바이낸스 키에 거래·출금·이체 권한이 하나라도 켜져 있으면 저장하지 않는다. 읽기 전용 안내만으로는 실수를 막지 못한다.
async function assertBinanceReadOnly({ apiKey, secretKey }) {
  const query = `timestamp=${Date.now()}&recvWindow=10000`;
  const signature = toHex(await hmacSha256(secretKey, query));
  const response = await fetch(`https://api.binance.com/sapi/v1/account/apiRestrictions?${query}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new AccountSyncError(BINANCE_ERROR_CODES[String(data?.code)] ?? 'unknown', data?.msg);
  const dangerous = [
    'enableWithdrawals',
    'enableSpotAndMarginTrading',
    'enableMargin',
    'enableFutures',
    'enableInternalTransfer',
    'permitsUniversalTransfer',
    'enableVanillaOptions',
    'enablePortfolioMarginTrading',
  ];
  if (dangerous.some(key => data?.[key] === true)) throw new AccountSyncError('tradeKey');
}

// 업비트 인증 헤더: JWT(HS256) { access_key, nonce }. 쿼리가 없는 조회 API에 쓴다.
async function upbitAuthHeader({ accessKey, secretKey }) {
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })));
  const signature = base64Url(await hmacSha256(secretKey, `${header}.${payload}`));
  return `Bearer ${header}.${payload}.${signature}`;
}

// 업비트 입출금 상태(연동 키가 있을 때만). 네트워크별 응답을 코인 단위로 합쳐 막힌 코인만 돌려준다(lib/walletStatus.js).
async function loadUpbitWalletStatus() {
  const keys = await loadAccountKeys('upbit');
  if (!keys) return null;
  const response = await fetch('https://api.upbit.com/v1/status/wallet', {
    headers: { Authorization: await upbitAuthHeader(keys), Accept: 'application/json' },
  });
  if (!response.ok) return null;
  return aggregateUpbitWallet(await response.json());
}

const ACCOUNT_LOADERS = {
  // 업비트: 평균 매수가(avg_buy_price)를 함께 준다.
  async upbit(keys) {
    const response = await fetch('https://api.upbit.com/v1/accounts', {
      headers: { Authorization: await upbitAuthHeader(keys), Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new AccountSyncError(UPBIT_ERROR_CODES[data?.error?.name] ?? 'unknown', data?.error?.message || `upbit ${response.status}`);
    }
    return data
      .filter(item => item.currency !== 'KRW' && item.unit_currency === 'KRW')
      .map(item => ({
        market: `KRW-${item.currency}`,
        quantity: Number(item.balance) + Number(item.locked),
        avgPrice: Number(item.avg_buy_price) || null,
      }))
      .filter(item => item.quantity > 0);
  },
  // 바이낸스: HMAC-SHA256 서명 쿼리. 평균 매수가는 주지 않는다.
  async binance({ apiKey, secretKey }) {
    await assertBinanceReadOnly({ apiKey, secretKey });
    const query = `timestamp=${Date.now()}&recvWindow=10000&omitZeroBalances=true`;
    const signature = toHex(await hmacSha256(secretKey, query));
    const response = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new AccountSyncError(BINANCE_ERROR_CODES[String(data?.code)] ?? 'unknown', data?.msg || `binance ${response.status}`);
    return (data.balances ?? [])
      .filter(item => !['USDT', 'USDC', 'FDUSD', 'BUSD'].includes(item.asset))
      .map(item => ({ market: `${item.asset}USDT`, quantity: Number(item.free) + Number(item.locked), avgPrice: null }))
      .filter(item => item.quantity > 0 && allExchangesTickers.binance[item.market]);
  },
};

// 키는 '이 기기에 저장'을 끄면 storage.session(브라우저를 닫으면 지워짐)에, 켜면 storage.local에 둔다.
async function loadAccountKeys(exchange) {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(ACCOUNT_KEYS_STORAGE),
    chrome.storage.local.get(ACCOUNT_KEYS_STORAGE),
  ]);
  return session[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? local[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? null;
}

async function syncExchangeAccount(exchange) {
  const keys = await loadAccountKeys(exchange);
  if (!keys || !ACCOUNT_LOADERS[exchange]) return { ok: false, code: 'noKeys' };
  try {
    const holdings = await ACCOUNT_LOADERS[exchange](keys);
    // 업비트 키가 새로 생겼으면 입출금 상태도 바로 받아 둔다.
    if (exchange === 'upbit') polledData.find(data => data.type === 'walletStatus')?.refresh();
    // 평균 매수가가 없으면 지금 가격으로 두고 avgEstimated로 표시한다. 팝업은 이미 있던 평균가를 유지한다.
    return {
      ok: true,
      holdings: holdings.map(item => ({
        ...item,
        avgEstimated: item.avgPrice == null,
        avgPrice: item.avgPrice ?? allExchangesTickers[exchange][item.market]?.currentPrice ?? 0,
      })),
    };
  } catch (error) {
    if (error instanceof AccountSyncError) return { ok: false, code: error.code, error: error.detail };
    // fetch 자체가 실패하면 네트워크 문제다.
    return { ok: false, code: error instanceof TypeError ? 'network' : 'unknown', error: String(error?.message || error) };
  }
}

async function initialize() {
  await Promise.all([alertsReady, rulesReady, badgeReady, languageReady]);
  activeExchange = await loadActiveExchange();
  derivatives.start();
  longShort.start();
  trending.start();
  connectLiquidations();
  const initial = getExchangeInstance(activeExchange);
  if (initial) initial.setPopupActive(true);
  // 서비스 워커가 깨어나는 중에 화면이 먼저 연결됐으면, 활성 거래소를 이제 알려 주고 시세를 이어 준다.
  if (activePort) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
    if (initial) initial.connectPopup(activePort);
  }

  // 거래소 하나가 느리거나 실패해도 나머지는 바로 시작한다.
  polledData.forEach(data => data.start());
  setInterval(updateBadge, 2000);
  // 화면 없이 깨어났으면(알람 등) 필요한 거래소만 시작한다. 화면이 연결되면 나머지도 시작한다.
  if (!popupPorts.size) {
    const needed = exchangesNeededWhenIdle();
    Object.entries(exchanges).forEach(([name, exchange]) => {
      if (!needed.has(name)) exchange.suspended = true;
    });
  }
  await Promise.allSettled([
    ...Object.values(exchanges).map(exchange => exchange.start()),
    exchangeRateManager.initialize(),
  ]);
}

// 미니 창: 즐겨찾기 시세만 1초마다 받아 간다. 열려 있는 동안 그 거래소들은 쉬지 않는다.
const miniPorts = new Map();
function isWatchedByMini(exchange) {
  for (const list of miniPorts.values()) if (list.includes(exchange)) return true;
  return false;
}
chrome.runtime.onConnect.addListener(port => {
  if (port?.name !== 'mini') return;
  miniPorts.set(port, []);
  port.onMessage.addListener(message => {
    if (message?.type !== 'watch') return;
    const before = miniPorts.get(port).join();
    miniPorts.set(port, message.exchanges ?? []);
    if (!popupPorts.size && before !== miniPorts.get(port).join()) applyIdleConnections();
    const kimchiItems = computeKimchiPremium().items;
    const tickers = {};
    const kimchi = {};
    for (const key of message.keys ?? []) {
      const [exchange, market] = key.split(':');
      const ticker = allExchangesTickers[exchange]?.[market];
      if (ticker?.currentPrice) tickers[key] = ticker;
      if (kimchiItems[key]) kimchi[key] = { premium: kimchiItems[key].premium };
    }
    try {
      port.postMessage({ type: 'miniTickers', data: { tickers, kimchi } });
    } catch {
      miniPorts.delete(port);
    }
  });
  port.onDisconnect.addListener(() => {
    miniPorts.delete(port);
    if (!popupPorts.size) scheduleIdleConnections();
  });
});

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') return;

  popupPorts.add(port);
  activePort = broadcastPort;
  exchangeRateManager.port = broadcastPort;
  resumeAllExchanges();

  if (exchangeRateManager.exchangeRateUSD) {
    port.postMessage({ type: 'exchangeRateUSD', data: exchangeRateManager.exchangeRateUSD });
  }
  polledData.forEach(data => data.post(port));

  // 화면은 거래소가 바뀌면 시세를 비우므로, 거래소를 시세 스냅샷보다 먼저 알린다.
  // 아직 저장된 거래소를 읽는 중(activeExchange가 null)이면 initialize가 대신 알린다.
  if (activeExchange) port.postMessage({ type: 'activeExchange', data: activeExchange });

  const active = getExchangeInstance(activeExchange);
  if (active) active.connectPopup(activePort);

  port.postMessage({ type: 'updatedVersion', data: updatedVersion });

  port.onDisconnect.addListener(() => {
    popupPorts.delete(port);
    if (popupPorts.size) return;
    scheduleIdleConnections();
    activePort = null;
    exchangeRateManager.port = null;
    Object.values(exchanges).forEach(exchange => {
      if (exchange.port === broadcastPort) exchange.port = null;
    });
    if (maxChangeRateIntervalId !== null) {
      clearInterval(maxChangeRateIntervalId);
      maxChangeRateIntervalId = null;
    }
  });

  if (maxChangeRateIntervalId !== null) return;
  maxChangeRateIntervalId = setInterval(() => {
    let maxRate = -Infinity;
    let maxTicker = { exchange: '', market: '', changeRate: 0 };

    for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
      // 코인원·디지털엑스는 거래가 얇은 종목이 많아 상위 상승 종목에서 뺀다.
      if (OPTIONAL_EXCHANGE_ORIGINS[exchange]) continue;
      for (const [market, ticker] of Object.entries(tickers)) {
        // 거래가 적은 FDUSD·EUR 등 기타 페어가 상위 상승 종목을 차지하지 않도록 KRW·USDT 마켓만 비교한다.
        const isUsdMarket = (exchange === 'coinbase' || exchange === 'kraken') && market.endsWith('USD');
        if (!market.startsWith('KRW-') && !market.endsWith('USDT') && !isUsdMarket) continue;
        const changeRate = ticker.changeRate ?? 0;
        if (changeRate > maxRate) {
          maxRate = changeRate;
          maxTicker.exchange = ticker.exchange;
          maxTicker.market = ticker.market;
          maxTicker.changeRate = changeRate;
        }
      }
    }
    maxChangeRate.exchange = maxTicker.exchange;
    maxChangeRate.market = maxTicker.market;
    maxChangeRate.changeRate = maxTicker.changeRate;

    if (activePort) {
      try {
        activePort.postMessage({ type: 'maxChangeRate', data: maxChangeRate });
        activePort.postMessage({ type: 'kimchiPremium', data: computeKimchiPremium() });
      } catch (error) {
        console.warn(error);
      }
    }
  }, 2000);
});

// 김치 프리미엄: KRW 마켓 가격 vs (Binance USDT 가격 × USD/KRW 환율).
// USDT≈USD 가정. 두 페어가 모두 살아있고 환율이 있을 때만 산출.
// 김프는 장중 실시간 환율로 계산한다. 수출입은행 고시 환율은 하루 한 번(고시 전에는 전날 값)이라 장중에 0.5~1%p 어긋난다.
// 표시용 환율(exchangeRateUSD)은 화면 안내대로 고시 환율을 그대로 쓴다.
const LIVE_FX_INTERVAL = 5 * 60_000;
let liveUsdKrw = null;
async function refreshLiveUsdKrw() {
  try {
    const response = await fetch(
      'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
      { headers: { Accept: 'application/json' } },
    );
    const json = await response.json();
    const rate = Number(json?.result?.calcPrice ?? String(json?.result?.closePrice ?? '').replace(/,/g, ''));
    if (Number.isFinite(rate) && rate > 0) liveUsdKrw = rate;
  } catch (error) {
    console.warn(error);
  }
}
refreshLiveUsdKrw();
setInterval(refreshLiveUsdKrw, LIVE_FX_INTERVAL);

// 김프 추이: 10분마다 BTC 김프(업비트·빗썸)와 테더 프리미엄을 7일치 기록한다.
// 화면이 닫혀 소켓을 끊어 둔 동안에도 이어지도록 웹소켓 대신 REST로 가격을 받는다.
const KIMCHI_HISTORY_KEY = 'kimchiHistory';
const KIMCHI_HISTORY_MAX = 7 * 24 * 6;

async function recordKimchiHistory() {
  try {
    if (!liveUsdKrw) await refreshLiveUsdKrw();
    const usdRate = liveUsdKrw || exchangeRateManager.exchangeRateUSD;
    if (!usdRate) return;
    const [upbit, bithumb, binance] = await Promise.all([
      fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT'),
      fetchJson('https://api.bithumb.com/v1/ticker?markets=KRW-BTC'),
      fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    ]);
    const btcUsdt = Number(binance?.price);
    if (!btcUsdt) return;
    const price = (list, market) => list?.find?.(item => item.market === market)?.trade_price;
    const premium = krw => (krw ? Number(((krw / (btcUsdt * usdRate) - 1) * 100).toFixed(3)) : null);
    const usdtKrw = price(upbit, 'KRW-USDT');
    const point = {
      t: Date.now(),
      upbit: premium(price(upbit, 'KRW-BTC')),
      bithumb: premium(price(bithumb, 'KRW-BTC')),
      tether: usdtKrw ? Number(((usdtKrw / usdRate - 1) * 100).toFixed(3)) : null,
    };
    const history = (await chrome.storage.local.get(KIMCHI_HISTORY_KEY))[KIMCHI_HISTORY_KEY] ?? [];
    await chrome.storage.local.set({ [KIMCHI_HISTORY_KEY]: [...history, point].slice(-KIMCHI_HISTORY_MAX) });
  } catch (error) {
    console.warn(error);
  }
}
chrome.alarms.create('kimchiHistory', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'kimchiHistory') recordKimchiHistory();
});
// 서비스 워커가 오래 쉬었다 깨어났으면 바로 한 점을 남긴다.
chrome.storage.local.get(KIMCHI_HISTORY_KEY).then(result => {
  const last = result[KIMCHI_HISTORY_KEY]?.at(-1);
  // 시작 직후에는 거래소 시세 스냅샷 요청이 몰려 있어 잠시 뒤에 남긴다.
  if (!last || Date.now() - last.t > 10 * 60_000) setTimeout(recordKimchiHistory, 30_000);
});

function computeKimchiPremium() {
  return computeKimchiPremiumFrom(allExchangesTickers, liveUsdKrw || exchangeRateManager.exchangeRateUSD);
}

// 거래소 간 가격 차이: 같은 코인을 USD로 환산해 가장 싼 곳과 비싼 곳의 차이를 구한다.
// 원화 마켓은 환율로 환산하므로 김치 프리미엄도 함께 반영된다(includeKrw=false면 제외).
const MAX_SPREAD = 30; // 이보다 크면 같은 티커의 다른 코인이거나 거래가 끊긴 마켓일 가능성이 높다.
const MIN_SPREAD_VOLUME_USD = 100_000; // 24시간 거래대금이 이보다 적은 마켓은 시세가 오래됐을 수 있어 뺀다.

function computeSpreads({ includeKrw = true, limit = 30 } = {}) {
  const usdRate = exchangeRateManager.exchangeRateUSD;
  const byCoin = {};
  for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
    for (const [market, ticker] of Object.entries(tickers)) {
      const price = ticker.currentPrice;
      if (!price) continue;
      let coin = null;
      let usdPrice = null;
      if (market.startsWith('KRW-')) {
        if (!includeKrw || !usdRate) continue;
        coin = market.slice(4);
        usdPrice = price / usdRate;
      } else if (market.endsWith('USDT')) {
        coin = market.slice(0, -4);
        usdPrice = price;
      } else if ((exchange === 'coinbase' || exchange === 'kraken') && market.endsWith('USD')) {
        coin = market.slice(0, -3);
        usdPrice = price;
      } else if (market.endsWith('INR')) {
        const inrRate = polledData.find(data => data.type === 'fiatRates')?.value?.INR;
        if (!inrRate) continue;
        coin = market.slice(0, -3);
        usdPrice = price / inrRate;
      }
      if (!coin || coin === 'USDT' || coin === 'USDC') continue;
      const volumeUsd = (ticker.volume ?? 0) * (usdPrice / price);
      if (volumeUsd < MIN_SPREAD_VOLUME_USD) continue;
      (byCoin[coin] ??= []).push({ exchange, market, price, usdPrice });
    }
  }

  const items = [];
  for (const [coin, quotes] of Object.entries(byCoin)) {
    if (quotes.length < 2) continue;
    let low = quotes[0];
    let high = quotes[0];
    for (const quote of quotes) {
      if (quote.usdPrice < low.usdPrice) low = quote;
      if (quote.usdPrice > high.usdPrice) high = quote;
    }
    if (low.exchange === high.exchange) continue;
    const spread = ((high.usdPrice - low.usdPrice) / low.usdPrice) * 100;
    if (spread > 0 && spread <= MAX_SPREAD) items.push({ coin, spread, low, high, exchanges: quotes.length });
  }
  items.sort((a, b) => b.spread - a.spread);
  return { usdRate, items: items.slice(0, limit) };
}

initialize();
