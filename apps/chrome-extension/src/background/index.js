// @ts-check
import { ensureAlarm } from './alarms.js';
import { KRW_EXCHANGES } from './lib/kimchi.js';
import { allExchangesTickers, refreshCurrentDate } from './state.js';
import { ExchangeRateManager } from './exchangeRate.js';
import { deletePriceAlert, savePriceAlert } from './alertStore.js';
import { BADGE_STORAGE_KEY, badgeReady, getBadgeSettings, updateBadge } from './toolbarBadge.js';
import { RULES_KEY, ruleCache, rulesReady, whaleFeed } from './rules.js';
import {
  configureMarket,
  connectLiquidations,
  derivatives,
  disconnectLiquidations,
  liquidationsConnected,
  longShort,
  polledData,
  summarizeLiquidations,
  trending,
} from './market.js';
import {
  alertCache,
  alertsReady,
  alertTargetUrl,
  clearAlertHistory,
  getLanguage,
  languageReady,
} from './notify.js';
import { computeKimchiPremium, computeSpreads, configurePremium } from './premium.js';
import './listings.js';
import { configureFeeds, refreshEconCalendar } from './feeds.js';
import { configureAccount, syncExchangeAccount } from './account.js';
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

ensureAlarm('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate' && refreshCurrentDate()) {
    // 서비스 워커가 날짜를 넘겨 살아 있으면 환율이 갱신되지 않으므로 날짜가 바뀔 때 다시 조회한다.
    exchangeRateManager.updateExchangeRate();
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
  // 쉬다가 깨어난 직후면 새 값을 받을 때까지 기다린다.
  if (message.action === 'getDerivatives') {
    Promise.all([derivatives.pending, longShort.pending]).then(() =>
      sendResponse({ funding: derivatives.value, liquidations: summarizeLiquidations(), longShort: longShort.value }),
    );
    return true;
  }
  if (message.action === 'getTrending') {
    Promise.resolve(trending.pending).then(() => sendResponse(trending.value ?? []));
    return true;
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
    clearAlertHistory().then(() => sendResponse({ ok: true }));
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
  // 화면이 시세를 기다리다 '다시 시도'를 눌렀다. 기다리는 재시도 간격을 건너뛰고 바로 다시 받는다.
  if (message.action === 'retryExchange') {
    const exchange = exchanges[message.exchange];
    if (exchange && !exchange.suspended && !exchange.locked) {
      clearTimeout(exchange.startTimer);
      const retry = exchange.started
        ? exchange.fetchInitialTickers().then(() => {
            exchange.dropSocket();
            exchange.connectWebSocket();
          })
        : exchange.start();
      retry
        .catch(console.warn)
        .finally(() => activePort && activeExchange === message.exchange && exchange.connectPopup(activePort));
    }
  }
  // 거래소별 연결 상태(점검·E2E용)
  if (message.action === 'getConnectionStatus') {
    sendResponse(
      Object.fromEntries(
        Object.entries(exchanges).map(([name, exchange]) => [
          name,
          {
            suspended: exchange.suspended,
            locked: exchange.locked,
            connected: exchange.socket?.readyState === WebSocket.OPEN || ('pollTimer' in exchange && !!exchange.pollTimer),
          },
        ]),
      ),
    );
  }
  // 화면용 시장 데이터를 쉬고 있는지(점검·E2E용)
  if (message.action === 'getMarketDataStatus') {
    sendResponse({
      liquidations: liquidationsConnected(),
      derivatives: !derivatives.paused,
      trending: !trending.paused,
      longShort: !longShort.paused,
    });
  }
  if (message.action === 'getAllExchangesTickers') {
    sendResponse(Object.values(allExchangesTickers).flatMap(tickers => Object.values(tickers)));
  }
});

// 설치 및 업데이트 처리
/** @type {string | null} 업데이트 전 버전(새 기능 안내 카드). 업데이트가 아니면 빈 문자열 */
let updatedVersion = '';
chrome.storage.local.get('updatedFromVersion').then(result => {
  updatedVersion ||= result.updatedFromVersion || '';
});
chrome.runtime.onInstalled.addListener(async details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // 새로 설치한 사용자에게만 첫 실행 안내(Onboarding)를 보여 준다. 업데이트한 사용자는 이미 설정을 마쳤다.
    await chrome.storage.local.set({ onboardingPending: true, [INSTALLED_AT_KEY]: Date.now() });
    updateUninstallUrl();
    // 확장은 툴바에 고정되지 않은 채 설치돼 아이콘을 못 찾는 사용자가 있다. 고정하는 법을 한 번 보여 준다.
    await languageReady;
    chrome.tabs.create({ url: `${WELCOME_URL}${getLanguage() === 'ko' ? '' : 'en/'}` }).catch(console.warn);
  }
  if (details.reason === 'update') {
    updatedVersion = details?.previousVersion || null;
    chrome.storage.local.set({ updatedFromVersion: updatedVersion });
  }
});

chrome.alarms.clear('keepAlive');

const WELCOME_URL = 'https://hunhunseunghun.github.io/como_extension/welcome/';
const UNINSTALL_SURVEY_URL = 'https://walla.my/v/a6J0FV5gUKCyzupMaG71';
const INSTALLED_AT_KEY = 'installedAt';
// 제거 설문에 버전·언어·사용 일수·거래소를 붙여 제거 이유를 나눠 본다. 서비스 워커가 시작할 때와 거래소를 바꿀 때 다시 정한다.
async function updateUninstallUrl() {
  const stored = await chrome.storage.local.get([INSTALLED_AT_KEY, 'usageStats']);
  // 설치일을 모르는 기존 사용자는 처음 연 날(리뷰 요청 통계)로 센다.
  const since = stored[INSTALLED_AT_KEY] ?? stored.usageStats?.firstOpenAt;
  const params = new URLSearchParams({
    v: chrome.runtime.getManifest().version,
    lang: getLanguage(),
    days: since ? String(Math.floor((Date.now() - since) / 86_400_000)) : '',
    exchange: activeExchange ?? '',
  });
  chrome.runtime.setUninstallURL(`${UNINSTALL_SURVEY_URL}?${params}`, () => void chrome.runtime.lastError);
}

// 선택 권한 거래소: 기존 사용자에게 업데이트 때 새 권한 확인 창이 뜨지 않도록, 거래소를 처음 고를 때 허락받는다.
/** @type {Record<string, string[]>} */
const OPTIONAL_EXCHANGE_ORIGINS = {
  coinone: ['https://api.coinone.co.kr/*'],
  digitalx: ['https://api.digitalx.miraeasset.com/*'],
};

/** @param {string} name */
async function hasExchangePermission(name) {
  const origins = OPTIONAL_EXCHANGE_ORIGINS[name];
  return origins ? chrome.permissions.contains({ origins }) : true;
}

// 팝업이 권한 창을 띄우기 전에 고른 거래소. 권한 창이 뜨면 툴바 팝업이 닫혀 버려서, 허락되면 여기서 거래소를 바꾼다.
// 오래된 요청으로 나중에 엉뚱하게 바뀌지 않도록 2분만 유효하다.
/** @type {{ name: string, at: number } | null} */
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
/** @type {string | null} */
let activeExchange = null;

/** @param {string} exchange */
async function saveActiveExchange(exchange) {
  await chrome.storage.local.set({ [STORAGE_KEY]: exchange });
  activeExchange = exchange;
  updateUninstallUrl();
}

async function loadActiveExchange() {
  const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
  // 처음 쓰는 사용자는 배지(toolbarBadge.js)와 같이 한국어면 업비트, 그 밖의 언어면 바이낸스로 시작한다.
  if (exchanges[state]) return state;
  return getLanguage() === 'ko' ? 'upbit' : 'binance';
}

/** @param {string | null} name */
function getExchangeInstance(name) {
  return (name && exchanges[name]) || null;
}

/** @param {string} exchange */
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
/** @type {Record<string, import('./exchanges.js').ExchangeData>} */
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
configureExchanges({ hasExchangePermission, isWatchedByMini, exchanges });
configureFeeds({ exchanges });
configureAccount({ onUpbitSynced: () => polledData.find(data => data.type === 'walletStatus')?.refresh() });
configureMarket({ getPort: () => activePort });
configurePremium({ officialUsdKrw: () => exchangeRateManager.exchangeRateUSD });

// 팝업과 사이드 패널이 동시에 열릴 수 있어 연결된 화면 모두에 보낸다.
// activePort는 연결된 화면이 하나라도 있으면 broadcastPort, 없으면 null이다.
/** @type {Set<chrome.runtime.Port>} */
const popupPorts = new Set();
/** @type {import('./exchanges.js').ScreenPort} */
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
/** @type {import('./exchanges.js').ScreenPort | null} */
let activePort = null;
/** @type {ReturnType<typeof setInterval> | null} */
let maxChangeRateIntervalId = null;

// 화면이 모두 닫히면 1분 뒤 배지·지정가 알림·알림 규칙에 쓰는 거래소만 연결해 둔다.
// 9개 거래소가 종일 초당 수많은 메시지를 보내면 노트북 배터리와 데이터를 계속 쓴다.
const IDLE_SUSPEND_DELAY = 60_000;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let idleTimer;

function exchangesNeededWhenIdle() {
  /** @type {Set<string>} */
  const needed = new Set();
  const badge = getBadgeSettings();
  if (badge.enabled) needed.add(badge.exchange);
  for (const [exchange, tickers] of Object.entries(alertCache.priceAlerts)) {
    if (Object.values(tickers ?? {}).some((/** @type {any[]} */ list) => list?.length)) needed.add(exchange);
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

// 화면에서만 보는 시장 데이터(펀딩비·청산·트렌딩)는 쉬는 동안 받지 않는다. 롱숏 요청이 함께 받는 미결제약정은 OI 알림 규칙이 쓴다.
/** @param {boolean} idle */
function setMarketDataIdle(idle) {
  if (!idle) {
    [derivatives, longShort, trending].forEach(data => data.resume());
    connectLiquidations();
    return;
  }
  derivatives.pause();
  trending.pause();
  if (ruleCache.rules.some(rule => rule.type === 'oi')) longShort.resume();
  else longShort.pause();
  disconnectLiquidations();
}

function applyIdleConnections() {
  idleTimer = undefined;
  if (popupPorts.size) return;
  const needed = exchangesNeededWhenIdle();
  Object.entries(exchanges).forEach(([name, exchange]) =>
    needed.has(name) ? exchange.resume().catch(console.warn) : exchange.suspend(),
  );
  setMarketDataIdle(true);
}

function scheduleIdleConnections(delay = IDLE_SUSPEND_DELAY) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(applyIdleConnections, delay);
}

function resumeAllExchanges() {
  clearTimeout(idleTimer);
  idleTimer = undefined;
  Object.values(exchanges).forEach(exchange => exchange.resume().catch(console.warn));
  setMarketDataIdle(false);
}

// 화면이 닫혀 있는 동안 배지·알림 설정이 바뀌면 필요한 거래소를 다시 고른다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || popupPorts.size) return;
  if (changes.priceAlerts || changes[RULES_KEY] || changes[BADGE_STORAGE_KEY]) scheduleIdleConnections(1000);
});

setInterval(() => Object.values(exchanges).forEach(exchange => exchange.checkStale()), 15_000);
setInterval(() => Object.values(exchanges).forEach(exchange => exchange.refreshMarkets().catch(console.warn)), 30 * 60_000);

async function initialize() {
  await Promise.all([alertsReady, rulesReady, badgeReady, languageReady]);
  activeExchange = await loadActiveExchange();
  updateUninstallUrl();
  // 화면 없이 깨어났으면(알람 등) 화면용 시장 데이터는 받지 않는다. 화면이 먼저 연결됐으면 이미 받기 시작했다.
  if (!popupPorts.size) setMarketDataIdle(true);
  derivatives.start();
  longShort.start();
  trending.start();
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
/** @type {Map<chrome.runtime.Port, string[]>} 미니 창 포트 → 보고 있는 거래소 */
const miniPorts = new Map();
/** @param {string} exchange */
function isWatchedByMini(exchange) {
  for (const list of miniPorts.values()) if (list.includes(exchange)) return true;
  return false;
}
chrome.runtime.onConnect.addListener(port => {
  if (port?.name !== 'mini') return;
  miniPorts.set(port, []);
  port.onMessage.addListener(message => {
    if (message?.type !== 'watch') return;
    const before = (miniPorts.get(port) ?? []).join();
    miniPorts.set(port, message.exchanges ?? []);
    if (!popupPorts.size && before !== (miniPorts.get(port) ?? []).join()) applyIdleConnections();
    const kimchiItems = computeKimchiPremium().items;
    /** @type {Record<string, any>} */
    const tickers = {};
    /** @type {Record<string, { premium: number | null }>} */
    const kimchi = {};
    for (const key of /** @type {string[]} */ (message.keys ?? [])) {
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

initialize();
