// 초기 설정 및 전역 변수
const allExchangesTickers = { upbit: {}, bithumb: {}, binance: {} };
const maxChangeRate = { exchange: '', market: '', changeRate: 0 };

let CURRENT_DATE = new Date()
  .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\./g, '')
  .replace(/ /g, '');

chrome.alarms.create('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate') {
    CURRENT_DATE = new Date()
      .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\./g, '')
      .replace(/ /g, '');
  }
});

const getDynamicUserAgent = () => navigator.userAgent;

// 지정가 알림 관련 함수
function checkPriceAlerts(exchange, ticker, currentPrice) {
  // 알림 미설정 ticker도 lastPrice 추적: 첫 알림 등록 후 즉시 크로싱 검출 가능하도록.
  const lastPrice = allExchangesTickers[exchange][ticker]?.lastPrice ?? null;
  allExchangesTickers[exchange][ticker] = allExchangesTickers[exchange][ticker] || {};
  allExchangesTickers[exchange][ticker].lastPrice = currentPrice;

  chrome.storage.local.get(['priceAlerts', 'triggeredPrices', 'deadbandSettings'], result => {
    const alerts = result.priceAlerts || {};
    let triggered = result.triggeredPrices || {};
    const deadbandSettings = result.deadbandSettings || {};

    if (!alerts[exchange] || !alerts[exchange][ticker]) return;

    const alertPrices = alerts[exchange][ticker];
    triggered[exchange] = triggered[exchange] || {};
    triggered[exchange][ticker] = triggered[exchange][ticker] || {};

    alertPrices.forEach(({ price: alertPrice, deadband: alertDeadband }) => {
      if (lastPrice !== null && alertPrice !== undefined) {
        const deadband = deadbandSettings[exchange]?.[ticker]?.[alertPrice] ?? alertDeadband ?? 0;

        if (deadband === 0) {
          const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
          const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;
          if (crossedUp || crossedDown) {
            sendNotification(exchange, ticker, currentPrice, alertPrice);
          }
        } else {
          const deadbandValue = alertPrice * deadband;
          const upperBound = alertPrice + deadbandValue;
          const lowerBound = alertPrice - deadbandValue;

          if (!triggered[exchange][ticker][alertPrice]) {
            const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
            const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;
            if (crossedUp || crossedDown) {
              sendNotification(exchange, ticker, currentPrice, alertPrice);
              triggered[exchange][ticker][alertPrice] = true;
            }
          } else {
            if (currentPrice <= lowerBound || currentPrice >= upperBound) {
              triggered[exchange][ticker][alertPrice] = false;
            }
          }
        }
      }
    });

    if (Object.keys(triggered[exchange][ticker]).length > 0) {
      chrome.storage.local.set({ triggeredPrices: triggered }, () => {});
    }
  });
}

function sendNotification(exchange, ticker, currentPrice, alertPrice) {
  const notificationId = `${exchange}:${ticker}:${alertPrice}`;
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'como-logo.png',
    title: `${alertPrice > 10 ? alertPrice.toLocaleString('en-US') : alertPrice} ${ticker} ${exchange.toUpperCase()}`,
    message: `${ticker} ${currentPrice > alertPrice ? '상향' : '하향'} 도달`,
  });
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
  if (message.action === 'getAllExchangesTickers') {
    if (activePort) {
      const data = Object.values(allExchangesTickers)
        .map(tickers => Object.values(tickers))
        .reduce((acc, curr) => [...acc, ...curr], []);
      activePort.postMessage({ type: 'allExchangesTickers', data });
    }
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
    const url = 'https://finance.naver.com/marketindex/';
    try {
      const response = await fetch(url, { headers: { 'User-Agent': getDynamicUserAgent() } });
      const html = await response.text();
      const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
      const match = html.match(usdRegex);

      if (!match || !match[1]) throw new Error('Failed to parse USD rate from Naver');

      const exchangeRateUSD = Number(match[1].replace(/,/g, ''));
      this.exchangeRateUSD = exchangeRateUSD;
      await this.saveExchangeRate(exchangeRateUSD, CURRENT_DATE);
    } catch {
      this.exchangeRateUSD = null;
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
class ExchangeData {
  constructor(name, apiUrl, wsUrl) {
    this.name = name;
    this.apiUrl = apiUrl;
    this.wsUrl = wsUrl;
    this.socket = null;
    this.port = null;
    this.markets = [];
    this.marketsInfo = null;
    this.tickers = null;
    this.initialReconnectDelay = 2000;
    this.currentReconnectDelay = this.initialReconnectDelay;
    this.maxReconnectDelay = 10000;
    this.backoffFactor = 1.5;
    this.isPopupActive = false;
    this.isReconnecting = false;
  }

  async fetchInitialTickers() {
    try {
      const marketsParam = this.markets?.join(',');
      const response = await fetch(`${this.apiUrl}/ticker?markets=${marketsParam}`, {
        headers: { Accept: 'application/json' },
      });
      const tickersArray = await response.json();

      this.tickers = tickersArray.reduce((acc, ticker) => {
        if (ticker.market) {
          allExchangesTickers[this.name][ticker.market] = {
            exchange: this.name,
            market: ticker.market ?? '',
            currentPrice: ticker.trade_price ?? 0,
            changeRate: ticker.signed_change_rate ?? 0,
            koreanName: this.marketsInfo[ticker.market]?.korean_name ?? null,
          };
          acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
        }
        return acc;
      }, {});
      if (this.port && this.isPopupActive) {
        this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
      }
    } catch (error) {
      console.warn(error);
    }
  }

  connectPopup(port) {
    if (!port || port.name !== 'popup') return;
    this.port = port;
    this.port.onDisconnect.addListener(() => {
      this.port = null;
    });
    if (this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket) this.socket.close();

    this.socket = new WebSocket(this.wsUrl);

    this.socket.onopen = () => {
      this.isReconnecting = false;
      this.currentReconnectDelay = this.initialReconnectDelay;
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const subscription =
          this.name === 'binance'
            ? null
            : JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }]);
        if (subscription) this.socket.send(subscription);
      }
    };

    this.socket.onmessage = async event => {
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        const ticker = JSON.parse(data);

        if (this.name === 'binance' && Array.isArray(ticker)) {
          ticker.forEach(binanceTicker => {
            allExchangesTickers[this.name][binanceTicker.s] = {
              ...allExchangesTickers[this.name][binanceTicker.s],
              exchange: this.name,
              market: binanceTicker.s,
              currentPrice: binanceTicker.c ? Number(binanceTicker.c) : 0,
              changeRate: binanceTicker.P ? Number(binanceTicker.P) : 0,
            };
            checkPriceAlerts(this.name, binanceTicker.s, Number(binanceTicker.c));
          });
        }
        if (this.name === 'upbit' || this.name === 'bithumb') {
          allExchangesTickers[this.name][ticker.code] = {
            ...allExchangesTickers[this.name][ticker.code],
            exchange: this.name,
            market: ticker.code ?? '',
            currentPrice: ticker.trade_price ? Number(ticker.trade_price) : 0,
            changeRate: ticker.signed_change_rate ? Number(ticker.signed_change_rate) * 100 : 0,
          };
          checkPriceAlerts(this.name, ticker.code, Number(ticker.trade_price));
        }

        if (this.isPopupActive && this.port) {
          this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
        }
      } catch (error) {
        console.warn(error);
      }
    };

    this.socket.onerror = () => {
      this.socket = null;
      this.reconnectWebSocket();
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.reconnectWebSocket();
    };
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

//  UpbitData, BithumbData, BinanceData 클래스
class UpbitData extends ExchangeData {
  constructor() {
    super('upbit', 'https://api.upbit.com/v1', 'wss://api.upbit.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const tickers = await response.json();
      this.markets = tickers.map(ticker => ticker.market);
      this.marketsInfo = tickers.reduce((acc, ticker) => {
        const caution = ticker.market_event?.caution ? Object.values(ticker.market_event.caution).some(Boolean) : false;
        acc[ticker.market] = { ...ticker, market_event: { ...ticker.market_event, caution } };
        return acc;
      }, {});
      return this.markets;
    } catch (error) {
      console.warn(error);
      return (this.markets = ['KRW-BTC']);
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
      this.markets = data.map(ticker => ticker.market);
      this.marketsInfo = data.reduce((acc, ticker) => {
        acc[ticker.market] = { ...ticker };
        return acc;
      }, {});
      return this.markets;
    } catch (error) {
      console.warn(error);
      return (this.markets = ['KRW-BTC']);
    }
  }
}

class BinanceData extends ExchangeData {
  constructor() {
    super('binance', 'https://api.binance.com/api/v3', 'wss://stream.binance.com:9443/ws/!ticker@arr');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/exchangeInfo`);
      const data = await response.json();
      this.markets = data.symbols.map(symbol => symbol.symbol);
      this.marketsInfo = data.symbols.reduce((acc, symbol) => {
        acc[symbol.symbol] = { ...symbol };
        return acc;
      }, {});
      return this.markets;
    } catch (error) {
      console.warn(error);
      return (this.markets = ['BTCUSDT']);
    }
  }

  async fetchInitialTickers() {
    try {
      const response = await fetch(`${this.apiUrl}/ticker/24hr`, {
        headers: { Accept: 'application/json' },
      });
      const tickersArray = await response.json();
      this.tickers = tickersArray.reduce((acc, ticker) => {
        if (ticker.symbol && Number(ticker.lastPrice) !== 0) {
          allExchangesTickers[this.name][ticker.symbol] = {
            exchange: this.name,
            market: ticker.symbol,
            currentPrice: ticker.lastPrice ? Number(ticker.lastPrice) : 0,
            changeRate: ticker.priceChangePercent ? Number(ticker.priceChangePercent) : 0,
          };
          acc[ticker.symbol] = { ...ticker, market: ticker.symbol };
        }
        return acc;
      }, {});
      if (this.port && this.isPopupActive) {
        this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
      }
    } catch (error) {
      console.warn(error);
    }
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
  return state || 'upbit';
}

function getExchangeInstance(name) {
  switch (name) {
    case 'upbit':
      return upbit;
    case 'bithumb':
      return bithumb;
    case 'binance':
      return binance;
    default:
      return null;
  }
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
const upbit = new UpbitData();
const bithumb = new BithumbData();
const binance = new BinanceData();

let activePort = null;
let maxChangeRateIntervalId = null;

async function initialize() {
  activeExchange = await loadActiveExchange();

  await upbit.start();
  await bithumb.start();
  await binance.start();

  const initial = getExchangeInstance(activeExchange);
  if (initial) initial.setPopupActive(true);

  await exchangeRateManager.initialize();
}

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') return;

  activePort = port;
  exchangeRateManager.port = port;

  if (exchangeRateManager.exchangeRateUSD) {
    port.postMessage({ type: 'exchangeRateUSD', data: exchangeRateManager.exchangeRateUSD });
  }

  const active = getExchangeInstance(activeExchange);
  if (active) active.connectPopup(activePort);

  if (activePort) {
    activePort.postMessage({ type: 'updatedVersion', data: updatedVersion });
  }

  port.onDisconnect.addListener(() => {
    activePort = null;
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

initialize();
