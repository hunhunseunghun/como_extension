// 초기 설정 및 전역 변수
const allExchangesTickers = { upbit: {}, bithumb: {}, binance: {}, bybit: {}, okx: {}, coinbase: {} };
const maxChangeRate = { exchange: '', market: '', changeRate: 0 };

const getKSTDate = () =>
  new Date()
    .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\./g, '')
    .replace(/ /g, '');

let CURRENT_DATE = getKSTDate();

chrome.alarms.create('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate') {
    const date = getKSTDate();
    if (date === CURRENT_DATE) return;
    CURRENT_DATE = date;
    // 서비스 워커가 날짜를 넘겨 살아 있으면 환율이 갱신되지 않으므로 날짜가 바뀔 때 다시 조회한다.
    exchangeRateManager.updateExchangeRate();
  }
});

// 지정가 알림 관련 함수
// 웹소켓 틱마다 storage를 읽지 않도록 알림 설정을 메모리에 캐시하고 storage 변경 시 동기화한다.
const alertCache = { priceAlerts: {}, triggeredPrices: {}, deadbandSettings: {} };
const ALERT_KEYS = Object.keys(alertCache);

chrome.storage.local.get(ALERT_KEYS, result => {
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
    const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
    const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;

    if (deadband === 0) {
      if (crossedUp || crossedDown) sendNotification(exchange, ticker, currentPrice, alertPrice);
      return;
    }

    if (!tickerTriggered[alertPrice]) {
      if (crossedUp || crossedDown) {
        sendNotification(exchange, ticker, currentPrice, alertPrice);
        tickerTriggered[alertPrice] = true;
        changed = true;
      }
    } else {
      const deadbandValue = alertPrice * deadband;
      if (currentPrice <= alertPrice - deadbandValue || currentPrice >= alertPrice + deadbandValue) {
        tickerTriggered[alertPrice] = false;
        changed = true;
      }
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
chrome.storage.local.get('language', result => {
  userLanguage = result.language || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) userLanguage = changes.language.newValue || null;
});
const getLanguage = () => {
  const language = userLanguage || chrome.i18n?.getUILanguage?.().toLowerCase().split('-')[0];
  return NOTIFICATION_TEXT[language] ? language : 'en';
};

function sendNotification(exchange, ticker, currentPrice, alertPrice) {
  const notificationId = `${exchange}:${ticker}:${alertPrice}`;
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'como-logo.png',
    title: `${alertPrice > 10 ? alertPrice.toLocaleString('en-US') : alertPrice} ${ticker} ${exchange.toUpperCase()}`,
    message: `${ticker} ${NOTIFICATION_TEXT[getLanguage()][currentPrice > alertPrice ? 'up' : 'down']}`,
  });
  // 알림이 실제로 울린 시점은 리뷰 요청 조건으로 쓴다.
  chrome.storage.local.set({ alertFiredAt: Date.now() });
}

// 알림을 누르면 해당 거래소의 거래 화면을 연다.
const getTradeUrl = (exchange, market) => {
  const quote = ['USDT', 'BTC', 'USD'].find(q => market.endsWith(q)) ?? '';
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
    default:
      return null;
  }
};

chrome.notifications.onClicked.addListener(notificationId => {
  const [exchange, market] = notificationId.split(':');
  const url = market && getTradeUrl(exchange, market);
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

// 툴바 배지: 고른 종목의 가격을 4글자 안으로 줄여 보여주고, 등락에 따라 배경색을 바꾼다.
const BADGE_STORAGE_KEY = 'badgeSettings';
let badgeSettings = null;
let upDownSetting = null;
let lastBadge = '';
chrome.storage.local.get([BADGE_STORAGE_KEY, 'upDownColors'], result => {
  badgeSettings = result[BADGE_STORAGE_KEY] || null;
  upDownSetting = result.upDownColors || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[BADGE_STORAGE_KEY]) badgeSettings = changes[BADGE_STORAGE_KEY].newValue || null;
  if (changes.upDownColors) upDownSetting = changes.upDownColors.newValue || null;
  if (changes[BADGE_STORAGE_KEY] || changes.upDownColors || changes.language) updateBadge();
});

const getBadgeSettings = () =>
  badgeSettings ??
  (getLanguage() === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' });

function formatBadgePrice(price) {
  for (const [unit, size] of [
    ['B', 1e9],
    ['M', 1e6],
    ['K', 1e3],
  ]) {
    if (price >= size) {
      const value = price / size;
      return `${value >= 10 ? Math.round(value) : value.toFixed(1)}${unit}`;
    }
  }
  if (price >= 100) return price.toFixed(0);
  if (price >= 10) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(3).slice(1);
  return price.toExponential(0);
}

function updateBadge() {
  const settings = getBadgeSettings();
  const ticker = settings.enabled ? allExchangesTickers[settings.exchange]?.[settings.market] : null;
  if (!ticker?.currentPrice) {
    if (lastBadge) {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: chrome.i18n?.getMessage?.('extName') || 'COMO' });
      lastBadge = '';
    }
    return;
  }

  const changeRate = ticker.changeRate ?? 0;
  const redUp = (upDownSetting ?? (['ko', 'ja', 'zh'].includes(getLanguage()) ? 'red-up' : 'green-up')) === 'red-up';
  const color = changeRate >= 0 ? (redUp ? '#ef4444' : '#16a34a') : redUp ? '#3b82f6' : '#ef4444';
  const text = formatBadgePrice(ticker.currentPrice);
  const title = `${settings.market} ${ticker.currentPrice.toLocaleString('en-US')} (${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}%) · ${settings.exchange}`;
  const key = `${text}|${color}|${title}`;
  if (key === lastBadge) return;
  lastBadge = key;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setTitle({ title });
}

function savePriceAlert(exchange, ticker, priceDeadbandPairs, response) {
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

    chrome.storage.local.set({ priceAlerts: alerts, triggeredPrices: triggered, deadbandSettings }, () => {
      response({ success: true, prices: existingPrices });
    });
  });
}

function deletePriceAlert(exchange, ticker, priceToDelete, response) {
  chrome.storage.local.get(['priceAlerts', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let deadbandSettings = result.deadbandSettings || {};

    // priceAlerts에서 삭제
    const updatedPairs = alerts[exchange][ticker].filter(pair => pair.price !== priceToDelete);
    alerts[exchange][ticker] = updatedPairs;

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

    chrome.storage.local.set({ priceAlerts: alerts, deadbandSettings }, () => {
      response({ success: true, prices: updatedPairs });
    });
  });
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPopup') chrome.action.openPopup();
  if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
  if (message.action === 'getActiveExchange' && activePort) {
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
  if (message.action === 'getAllExchangesTickers') {
    sendResponse(Object.values(allExchangesTickers).flatMap(tickers => Object.values(tickers)));
  }
});

// 설치 및 업데이트 처리
let updatedVersion = '';
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.setUninstallURL('https://walla.my/v/a6J0FV5gUKCyzupMaG71');
  }
  if (details.reason === 'update') {
    updatedVersion = details?.previousVersion || null;
  }
});

chrome.alarms.create('keepAlive', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(() => {});

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

      const prevDate = new Date();
      prevDate.setDate(prevDate.getDate() - (attempt + 1));
      searchDate = prevDate.toISOString().slice(0, 10).replace(/-/g, '');
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

//  ExchangeData 클래스
// 공통: 스냅샷 보관, 실시간 갱신 병합, 지정가 알림 확인, 팝업 전달.
// 거래소별: fetchMarkets / fetchInitialTickers / getSubscriptions / parseMessage 만 구현한다.
const TICKER_CHUNK_SIZE = 100;
const HEARTBEAT_INTERVAL = 20000;
// OKX·Bybit는 종목별로 초당 수백~수천 건을 보내므로 해외 거래소 틱은 모아서 팝업에 전달한다.
const GLOBAL_FORWARD_INTERVAL = 200;

class ExchangeData {
  constructor(name, apiUrl, wsUrl, { isGlobal = false } = {}) {
    this.name = name;
    this.apiUrl = apiUrl;
    this.wsUrl = wsUrl;
    // 해외(USDT) 거래소는 팝업에서 바이낸스와 같은 필드 형태를 사용한다.
    this.isGlobal = isGlobal;
    this.socket = null;
    this.port = null;
    this.markets = [];
    this.marketsInfo = {};
    this.tickers = null;
    this.initialReconnectDelay = 2000;
    this.currentReconnectDelay = this.initialReconnectDelay;
    this.maxReconnectDelay = 10000;
    this.backoffFactor = 1.5;
    this.isPopupActive = false;
    this.isReconnecting = false;
    this.heartbeatId = null;
    this.pendingTicks = {};
    this.forwardTimer = null;
  }

  forwardTicks(updates) {
    if (!this.isGlobal) {
      this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: updates[0].tick });
      return;
    }
    for (const { key, tick } of updates) this.pendingTicks[key] = tick;
    if (this.forwardTimer) return;
    this.forwardTimer = setTimeout(() => {
      this.forwardTimer = null;
      const ticks = Object.values(this.pendingTicks);
      this.pendingTicks = {};
      if (ticks.length && this.isPopupActive && this.port) {
        this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticks });
      }
    }, GLOBAL_FORWARD_INTERVAL);
  }

  // entries: [{ key, ticker, price, changeRate, koreanName? }]
  setSnapshot(entries) {
    const tickers = {};
    const store = allExchangesTickers[this.name];
    for (const { key, ticker, price, changeRate, volume = 0, koreanName = null } of entries) {
      if (!key) continue;
      store[key] = {
        ...store[key],
        exchange: this.name,
        market: key,
        currentPrice: price ?? 0,
        changeRate: changeRate ?? 0,
        // 24시간 거래대금(호가 통화 기준). 거래소 간 가격 차이에서 거래가 끊긴 마켓을 거르는 데 쓴다.
        volume: Number(volume) || 0,
        koreanName,
      };
      tickers[key] = ticker;
    }
    this.tickers = tickers;
    if (this.port && this.isPopupActive) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  // 업비트·빗썸 공통 REST 스냅샷
  async fetchInitialTickers() {
    try {
      // 마켓 전체를 한 URL에 넣으면 빗썸이 414(URI Too Long)로 거부하므로 나눠서 요청한다.
      const chunks = [];
      for (let i = 0; i < this.markets.length; i += TICKER_CHUNK_SIZE) {
        chunks.push(this.markets.slice(i, i + TICKER_CHUNK_SIZE));
      }
      const responses = await Promise.all(
        chunks.map(async chunk => {
          const response = await fetch(`${this.apiUrl}/ticker?markets=${chunk.join(',')}`, {
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`${this.name} ticker ${response.status}`);
          return response.json();
        }),
      );
      this.setSnapshot(
        responses.flat().map(ticker => ({
          key: ticker.market,
          ticker: { ...ticker, ...this.marketsInfo[ticker.market] },
          price: ticker.trade_price,
          changeRate: (ticker.signed_change_rate ?? 0) * 100,
          volume: ticker.acc_trade_price_24h,
          koreanName: this.marketsInfo[ticker.market]?.korean_name ?? null,
        })),
      );
    } catch (error) {
      console.warn(error);
    }
  }

  // 업비트·빗썸 공통 구독/파싱
  getSubscriptions() {
    return [JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }])];
  }

  parseMessage(message) {
    if (!message?.code) return [];
    return [
      {
        key: message.code,
        tick: message,
        price: Number(message.trade_price) || 0,
        changeRate: (Number(message.signed_change_rate) || 0) * 100,
        volume: Number(message.acc_trade_price_24h) || undefined,
      },
    ];
  }

  getHeartbeatMessage() {
    return null;
  }

  connectPopup(port) {
    if (!port || port.name !== 'popup') return;
    this.port = port;
    port.onDisconnect.addListener(() => {
      if (this.port === port) this.port = null;
    });
    if (this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket) this.socket.close();

    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.isReconnecting = false;
      this.currentReconnectDelay = this.initialReconnectDelay;
      this.getSubscriptions().forEach(subscription => socket.send(subscription));

      const heartbeat = this.getHeartbeatMessage();
      clearInterval(this.heartbeatId);
      if (heartbeat) {
        this.heartbeatId = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(heartbeat);
        }, HEARTBEAT_INTERVAL);
      }
    };

    socket.onmessage = async event => {
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        if (data === 'pong') return;

        const updates = this.parseMessage(JSON.parse(data));
        if (!updates.length) return;

        const store = allExchangesTickers[this.name];
        for (const { key, tick, price, changeRate, volume } of updates) {
          store[key] = { ...store[key], exchange: this.name, market: key, currentPrice: price, changeRate };
          if (volume) store[key].volume = volume;
          checkPriceAlerts(this.name, key, price);
          this.mergeTicker(key, tick);
        }

        if (this.isPopupActive && this.port) this.forwardTicks(updates);
      } catch (error) {
        console.warn(error);
      }
    };

    const handleClose = () => {
      if (this.socket !== socket) return;
      clearInterval(this.heartbeatId);
      this.socket = null;
      this.reconnectWebSocket();
    };
    socket.onerror = handleClose;
    socket.onclose = handleClose;
  }

  // 팝업을 다시 열 때 보내는 스냅샷이 최초 REST 응답에 머물지 않도록 웹소켓 갱신분을 병합한다.
  mergeTicker(key, data) {
    const current = this.tickers?.[key];
    if (current) Object.assign(current, data);
  }

  reconnectWebSocket() {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    const delay = this.currentReconnectDelay;

    setTimeout(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.isReconnecting = false;
        this.currentReconnectDelay = this.initialReconnectDelay;
        return;
      }

      this.connectWebSocket();
      this.currentReconnectDelay = Math.min(this.currentReconnectDelay * this.backoffFactor, this.maxReconnectDelay);
      this.isReconnecting = false;
    }, delay);
  }

  async start() {
    this.markets = await this.fetchMarkets();
    if (this.markets.length) {
      await this.fetchInitialTickers();
      this.connectWebSocket();
    }
  }

  setPopupActive(active) {
    this.isPopupActive = active;
    if (this.port && this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }
}

// 해외 거래소 시세를 바이낸스 24hrTicker(스냅샷)·웹소켓 필드 형태로 맞춘다.
// 팝업은 c <= b 이면 BID(상승색)로 표시하므로 직전 가격 대비 방향으로 b를 채운다.
function toGlobalTick(symbol, { last, open, high, low, quoteVolume }, prev) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  // REST 응답과 같은 소수 8자리 문자열로 맞춰 부동소수점 오차가 표시되지 않게 한다.
  const priceChange = change.toFixed(8);
  const prevPrice = Number(prev?.c ?? prev?.lastPrice);
  return {
    s: symbol,
    c: String(last),
    o: String(open),
    h: String(high),
    l: String(low),
    q: String(quoteVolume),
    p: priceChange,
    priceChange,
    P: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
    b: Number.isFinite(prevPrice) && close >= prevPrice ? String(last) : '0',
  };
}

function toGlobalSnapshot(symbol, { last, open, high, low, quoteVolume }) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  return {
    symbol,
    market: symbol,
    lastPrice: String(last),
    openPrice: String(open),
    highPrice: String(high),
    lowPrice: String(low),
    quoteVolume: String(quoteVolume),
    priceChange: change.toFixed(8),
    priceChangePercent: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
  };
}

const globalEntry = (symbol, fields) => {
  const ticker = toGlobalSnapshot(symbol, fields);
  return {
    key: symbol,
    ticker,
    price: Number(ticker.lastPrice),
    changeRate: Number(ticker.priceChangePercent),
    volume: ticker.quoteVolume,
  };
};

const globalUpdate = (exchange, symbol, fields) => {
  const tick = toGlobalTick(symbol, fields, exchange.tickers?.[symbol]);
  return { key: symbol, tick, price: Number(tick.c), changeRate: Number(tick.P), volume: Number(tick.q) || undefined };
};

const GLOBAL_QUOTES = ['USDT', 'BTC'];
const hasGlobalQuote = symbol => GLOBAL_QUOTES.some(quote => symbol.endsWith(quote));

//  거래소별 클래스
class UpbitData extends ExchangeData {
  constructor() {
    super('upbit', 'https://api.upbit.com/v1', 'wss://api.upbit.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const tickers = await response.json();
      this.marketsInfo = tickers.reduce((acc, ticker) => {
        const caution = ticker.market_event?.caution ? Object.values(ticker.market_event.caution).some(Boolean) : false;
        acc[ticker.market] = { ...ticker, market_event: { ...ticker.market_event, caution } };
        return acc;
      }, {});
      return tickers.map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return ['KRW-BTC'];
    }
  }
}

class BithumbData extends ExchangeData {
  constructor() {
    super('bithumb', 'https://api.bithumb.com/v1', 'wss://ws-api.bithumb.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const data = await response.json();
      this.marketsInfo = Object.fromEntries(data.map(ticker => [ticker.market, { ...ticker }]));
      return data.map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return ['KRW-BTC'];
    }
  }
}

class BinanceData extends ExchangeData {
  constructor() {
    // !ticker@arr 스트림은 연결은 되지만 더 이상 메시지를 보내지 않아 !miniTicker@arr를 사용한다.
    super('binance', 'https://api.binance.com/api/v3', 'wss://stream.binance.com:9443/ws/!miniTicker@arr', {
      isGlobal: true,
    });
  }

  // exchangeInfo(약 17MB)는 쓰지 않으므로 받지 않고, 24시간 시세(약 2MB)에서 마켓 목록을 얻는다.
  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/ticker/24hr`, { headers: { Accept: 'application/json' } });
      const tickersArray = await response.json();
      this.initialList = tickersArray.filter(ticker => ticker.symbol && Number(ticker.lastPrice) !== 0);
      return this.initialList.map(ticker => ticker.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(ticker => ({
        key: ticker.symbol,
        ticker: { ...ticker, market: ticker.symbol },
        price: Number(ticker.lastPrice) || 0,
        changeRate: Number(ticker.priceChangePercent) || 0,
        volume: ticker.quoteVolume,
      })),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    return [];
  }

  parseMessage(message) {
    if (!Array.isArray(message)) return [];
    return message.map(t => globalUpdate(this, t.s, { last: t.c, open: t.o, high: t.h, low: t.l, quoteVolume: t.q }));
  }
}

class BybitData extends ExchangeData {
  constructor() {
    super('bybit', 'https://api.bybit.com/v5', 'wss://stream.bybit.com/v5/public/spot', { isGlobal: true });
  }

  static fields(t) {
    return {
      last: t.lastPrice,
      open: t.prevPrice24h,
      high: t.highPrice24h,
      low: t.lowPrice24h,
      quoteVolume: t.turnover24h,
    };
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/tickers?category=spot`);
      const { result } = await response.json();
      this.initialList = result.list.filter(t => hasGlobalQuote(t.symbol) && Number(t.lastPrice) > 0);
      return this.initialList.map(t => t.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.symbol, BybitData.fields(t))));
    this.initialList = null;
  }

  // Bybit 현물은 요청당 구독 10개 제한이 있다.
  getSubscriptions() {
    const messages = [];
    for (let i = 0; i < this.markets.length; i += 10) {
      messages.push(JSON.stringify({ op: 'subscribe', args: this.markets.slice(i, i + 10).map(s => `tickers.${s}`) }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return JSON.stringify({ op: 'ping' });
  }

  parseMessage(message) {
    const t = message?.data;
    if (!message?.topic?.startsWith('tickers.') || !t?.symbol) return [];
    return [globalUpdate(this, t.symbol, BybitData.fields(t))];
  }
}

class OkxData extends ExchangeData {
  constructor() {
    super('okx', 'https://www.okx.com/api/v5', 'wss://ws.okx.com:8443/ws/v5/public', { isGlobal: true });
    // 팝업·알림에서는 BTCUSDT 형태를 쓰고, OKX API에는 BTC-USDT 형태를 쓴다.
    this.instIds = {};
  }

  static symbol(instId) {
    return instId.replace('-', '');
  }

  static fields(t) {
    return { last: t.last, open: t.open24h, high: t.high24h, low: t.low24h, quoteVolume: t.volCcy24h };
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/tickers?instType=SPOT`);
      const { data } = await response.json();
      this.initialList = data.filter(
        t => GLOBAL_QUOTES.some(quote => t.instId.endsWith(`-${quote}`)) && Number(t.last) > 0,
      );
      this.instIds = Object.fromEntries(this.initialList.map(t => [OkxData.symbol(t.instId), t.instId]));
      return Object.keys(this.instIds);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(t => {
        const entry = globalEntry(OkxData.symbol(t.instId), OkxData.fields(t));
        entry.ticker.instId = t.instId;
        return entry;
      }),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    const args = this.markets.map(symbol => ({ channel: 'tickers', instId: this.instIds[symbol] }));
    const messages = [];
    for (let i = 0; i < args.length; i += TICKER_CHUNK_SIZE) {
      messages.push(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + TICKER_CHUNK_SIZE) }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return 'ping';
  }

  parseMessage(message) {
    if (message?.arg?.channel !== 'tickers' || !Array.isArray(message.data)) return [];
    return message.data.map(t => globalUpdate(this, OkxData.symbol(t.instId), OkxData.fields(t)));
  }
}

class CoinbaseData extends ExchangeData {
  constructor() {
    super('coinbase', 'https://api.exchange.coinbase.com', 'wss://ws-feed.exchange.coinbase.com', { isGlobal: true });
    // 팝업·알림에서는 BTCUSD 형태를 쓰고, Coinbase API에는 BTC-USD 형태를 쓴다.
    this.productIds = {};
  }

  static symbol(productId) {
    return productId.replace('-', '');
  }

  // Coinbase는 거래량을 기준 코인 수량으로 주므로 가격을 곱해 USD 거래대금으로 맞춘다.
  static fields(t, last = t.last) {
    return {
      last,
      open: t.open ?? t.open_24h,
      high: t.high ?? t.high_24h,
      low: t.low ?? t.low_24h,
      quoteVolume: Number(t.volume ?? t.volume_24h) * Number(last),
    };
  }

  async fetchMarkets() {
    try {
      const [products, stats] = await Promise.all([
        fetchJson(`${this.apiUrl}/products`),
        fetchJson(`${this.apiUrl}/products/stats`),
      ]);
      this.initialList = products
        .filter(p => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled)
        .map(p => ({ id: p.id, stats: stats[p.id]?.stats_24hour }))
        .filter(p => Number(p.stats?.last) > 0);
      this.productIds = Object.fromEntries(this.initialList.map(p => [CoinbaseData.symbol(p.id), p.id]));
      return Object.keys(this.productIds);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(p => {
        const entry = globalEntry(CoinbaseData.symbol(p.id), CoinbaseData.fields(p.stats));
        entry.ticker.productId = p.id;
        return entry;
      }),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    return [JSON.stringify({ type: 'subscribe', product_ids: Object.values(this.productIds), channels: ['ticker'] })];
  }

  parseMessage(message) {
    if (message?.type !== 'ticker' || !message.product_id) return [];
    return [globalUpdate(this, CoinbaseData.symbol(message.product_id), CoinbaseData.fields(message, message.price))];
  }
}

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
};

let activePort = null;
let maxChangeRateIntervalId = null;

// 주기적으로 받아오는 부가 데이터(법정화폐 환율, 시장 지표). 팝업이 연결되면 마지막 값을 바로 보낸다.
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
      if (!value) return;
      this.value = value;
      this.post(activePort);
    } catch (error) {
      console.warn(error);
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

const fetchJson = async url => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};

const polledData = [
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

async function initialize() {
  activeExchange = await loadActiveExchange();
  const initial = getExchangeInstance(activeExchange);
  if (initial) initial.setPopupActive(true);

  // 거래소 하나가 느리거나 실패해도 나머지는 바로 시작한다.
  polledData.forEach(data => data.start());
  setInterval(updateBadge, 2000);
  await Promise.allSettled([
    ...Object.values(exchanges).map(exchange => exchange.start()),
    exchangeRateManager.initialize(),
  ]);
}

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') return;

  activePort = port;
  exchangeRateManager.port = port;

  if (exchangeRateManager.exchangeRateUSD) {
    port.postMessage({ type: 'exchangeRateUSD', data: exchangeRateManager.exchangeRateUSD });
  }
  polledData.forEach(data => data.post(port));

  const active = getExchangeInstance(activeExchange);
  if (active) active.connectPopup(activePort);

  if (activePort) {
    activePort.postMessage({ type: 'updatedVersion', data: updatedVersion });
  }

  port.onDisconnect.addListener(() => {
    if (activePort !== port) return;
    activePort = null;
    exchangeRateManager.port = null;
    if (maxChangeRateIntervalId !== null) {
      clearInterval(maxChangeRateIntervalId);
      maxChangeRateIntervalId = null;
    }
  });

  port.postMessage({ type: 'activeExchange', data: activeExchange });

  if (maxChangeRateIntervalId !== null) {
    clearInterval(maxChangeRateIntervalId);
  }
  maxChangeRateIntervalId = setInterval(() => {
    let maxRate = -Infinity;
    let maxTicker = { exchange: '', market: '', changeRate: 0 };

    for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
      for (const [market, ticker] of Object.entries(tickers)) {
        // 거래가 적은 FDUSD·EUR 등 기타 페어가 상위 상승 종목을 차지하지 않도록 KRW·USDT 마켓만 비교한다.
        if (!market.startsWith('KRW-') && !market.endsWith('USDT') && !(exchange === 'coinbase' && market.endsWith('USD')))
          continue;
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
function computeKimchiPremium() {
  const usdRate = exchangeRateManager.exchangeRateUSD;
  if (!usdRate) return { rate: usdRate, items: {} };

  const items = {};
  for (const krwExchange of ['upbit', 'bithumb']) {
    const krwTickers = allExchangesTickers[krwExchange];
    if (!krwTickers) continue;
    for (const market in krwTickers) {
      if (!market.startsWith('KRW-')) continue;
      const coin = market.slice(4);
      if (coin === 'USDT' || coin === 'USDC') continue;
      const krwPrice = krwTickers[market]?.currentPrice;
      const binTicker = allExchangesTickers.binance?.[`${coin}USDT`];
      const usdtPrice = binTicker?.currentPrice;
      if (!krwPrice || !usdtPrice) continue;

      const premium = (krwPrice / (usdtPrice * usdRate) - 1) * 100;
      items[`${krwExchange}:${market}`] = {
        exchange: krwExchange,
        market,
        coin,
        premium,
        krwPrice,
        usdtPrice,
      };
    }
  }
  return { rate: usdRate, items };
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
      } else if (exchange === 'coinbase' && market.endsWith('USD')) {
        coin = market.slice(0, -3);
        usdPrice = price;
      }
      if (!coin || coin === 'USDT' || coin === 'USDC') continue;
      const volumeUsd = market.startsWith('KRW-') ? (ticker.volume ?? 0) / usdRate : (ticker.volume ?? 0);
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
