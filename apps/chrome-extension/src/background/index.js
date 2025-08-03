// 초기 설정 및 전역 변수
const allExchangesTickers = { upbit: {}, bithumb: {}, binance: {}, coinbase: {} };
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
  chrome.storage.local.get(['priceAlerts', 'triggeredPrices', 'deadbandSettings'], result => {
    const alerts = result.priceAlerts || {};
    let triggered = result.triggeredPrices || {};
    const deadbandSettings = result.deadbandSettings || {};

    if (!alerts[exchange] || !alerts[exchange][ticker]) return;

    const lastPrice = allExchangesTickers[exchange][ticker]?.lastPrice ?? null;
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
            sendNotification(exchange, ticker, currentPrice, alertPrice, deadband);
          }
        } else {
          const deadbandValue = alertPrice * deadband;
          const upperBound = alertPrice + deadbandValue;
          const lowerBound = alertPrice - deadbandValue;

          if (!triggered[exchange][ticker][alertPrice]) {
            const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
            const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;
            if (crossedUp || crossedDown) {
              sendNotification(exchange, ticker, currentPrice, alertPrice, deadband);
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

    allExchangesTickers[exchange][ticker] = allExchangesTickers[exchange][ticker] || {};
    allExchangesTickers[exchange][ticker].lastPrice = currentPrice;
    if (Object.keys(triggered[exchange][ticker]).length > 0) {
      chrome.storage.local.set({ triggeredPrices: triggered }, () => {});
    }
  });
}

function sendNotification(exchange, ticker, currentPrice, alertPrice, deadband) {
  chrome.notifications.create({
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
      console.log(
        `${exchange} ${ticker}에서 지정가 ${priceToDelete} 삭제 - 남은 지정가: ${JSON.stringify(updatedPairs)}`,
      );
      response({ success: true, prices: updatedPairs }); // PriceDeadbandPair[] 반환
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
    await chrome.storage.local.set({ exchangeRateUSD: rate, currentDate: date });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate || this.storages.exchangeRateUSD });
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
    // 초기 데이터가 완전히 로드된 후에만 전송
    if (this.isPopupActive && this.tickers && Object.keys(this.tickers).length > 0) {
      console.log(`[${this.name}] connectPopup: 초기 데이터 전송, 개수:`, Object.keys(this.tickers).length);
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
        this.isReconㅔㅞㅡㅡnecting = false;
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
    // 초기 데이터가 완전히 로드된 후에만 전송
    if (this.port && this.isPopupActive && this.tickers && Object.keys(this.tickers).length > 0) {
      console.log(`[${this.name}] setPopupActive: 초기 데이터 전송, 개수:`, Object.keys(this.tickers).length);
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

class CoinbaseData extends ExchangeData {
  constructor() {
    super('coinbase', 'https://api.exchange.coinbase.com', 'wss://ws-feed.exchange.coinbase.com');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/products`);
      const data = await response.json();
      // USD, USDT, EUR, GBP 페어 필터링
      const supportedQuoteCurrencies = ['USD', 'USDT', 'EUR', 'GBP'];
      this.markets = data
        .filter(product => product.status === 'online' && supportedQuoteCurrencies.includes(product.quote_currency))
        .map(product => product.id);
      this.marketsInfo = data.reduce((acc, product) => {
        acc[product.id] = { ...product };
        return acc;
      }, {});
      console.log('Coinbase markets fetched:', this.markets);
      return this.markets;
    } catch (error) {
      console.warn(error);
      return (this.markets = ['BTC-USD', 'ETH-USD', 'BTC-USDT']);
    }
  }

  async fetchInitialTickers() {
    console.log('[Coinbase] fetchInitialTickers 진입');
    try {
      // Coinbase Advanced Trade API를 사용하여 24시간 티커 데이터 조회
      const response = await fetch(`${this.apiUrl}/products/stats`, {
        headers: { Accept: 'application/json' },
      });
      const tickersArray = await response.json();

      console.log('[Coinbase] API 응답 tickersArray 개수:', Object.keys(tickersArray).length);
      console.log('[Coinbase] this.markets 개수:', this.markets.length);
      console.log('[Coinbase] this.markets 샘플:', this.markets.slice(0, 5));

      // API 응답 구조 확인
      const firstSymbol = Object.keys(tickersArray)[0];
      const firstTicker = tickersArray[firstSymbol];
      console.log('[Coinbase] 첫 번째 ticker 구조:', firstTicker);
      console.log('[Coinbase] 첫 번째 ticker 키들:', Object.keys(firstTicker));

      // stats_24hour 구조 확인
      if (firstTicker.stats_24hour) {
        console.log('[Coinbase] stats_24hour 구조:', firstTicker.stats_24hour);
        console.log('[Coinbase] stats_24hour 키들:', Object.keys(firstTicker.stats_24hour));
      }

      this.tickers = {};
      let processedCount = 0;
      let skippedCount = 0;

      for (const [symbol, ticker] of Object.entries(tickersArray)) {
        const hasMarket = this.markets.includes(symbol);
        const hasLast = ticker.stats_24hour?.last; // stats_24hour에서 last 확인

        if (hasMarket && hasLast) {
          const price = Number(ticker.stats_24hour.last);
          const open24h = Number(ticker.stats_24hour.open);
          const changeRate = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

          allExchangesTickers[this.name][symbol] = {
            exchange: this.name,
            market: symbol,
            currentPrice: price,
            changeRate: changeRate,
          };
          this.tickers[symbol] = {
            ...ticker,
            market: symbol,
            symbol: symbol,
            price: ticker.stats_24hour.last,
            product_id: symbol,
            exchange: this.name,
            // stats_24hour 데이터를 상위로 이동
            last: ticker.stats_24hour.last,
            open_24h: ticker.stats_24hour.open,
            high_24h: ticker.stats_24hour.high,
            low_24h: ticker.stats_24hour.low,
            volume_24h: ticker.stats_24hour.volume_24h,
          };
          processedCount++;
        } else {
          skippedCount++;
          if (skippedCount <= 5) {
            console.log(`[Coinbase] 스킵된 symbol: ${symbol}, hasMarket: ${hasMarket}, hasLast: ${hasLast}`);
          }
        }
      }

      console.log('[Coinbase] 처리된 tickers 개수:', processedCount);
      console.log('[Coinbase] 스킵된 tickers 개수:', skippedCount);
      console.log('[Coinbase] 초기 tickers 세팅:', this.tickers);
      console.log('[Coinbase] 초기 tickers 개수:', Object.keys(this.tickers).length);

      // 초기 데이터가 완전히 로드된 후에만 전송 (순차적 로딩 방지)
      if (this.port && this.isPopupActive && Object.keys(this.tickers).length > 0) {
        console.log('[Coinbase] 초기 tickers popup에 전송 (완전 로드 후):', this.tickers);
        this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
      }
    } catch (error) {
      console.warn(error);
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
        // Coinbase WebSocket 구독 메시지
        const subscription = {
          type: 'subscribe',
          product_ids: this.markets,
          channels: ['ticker'],
        };
        this.socket.send(JSON.stringify(subscription));
      }
    };

    this.socket.onmessage = async event => {
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        const message = JSON.parse(data);

        // Coinbase ticker 메시지 처리
        if (message.type === 'ticker' && message.product_id) {
          const price = Number(message.price);
          const open24h = Number(message.open_24h);
          const changeRate = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

          // 초기 데이터가 있는 경우에만 업데이트 (새로운 종목 추가 방지)
          if (this.tickers && this.tickers[message.product_id]) {
            allExchangesTickers[this.name][message.product_id] = {
              ...allExchangesTickers[this.name][message.product_id],
              exchange: this.name,
              market: message.product_id,
              currentPrice: price,
              changeRate: changeRate,
            };

            // this.tickers 업데이트
            this.tickers[message.product_id] = {
              ...this.tickers[message.product_id],
              ...message,
              price: message.price,
              market: message.product_id,
              symbol: message.product_id,
              product_id: message.product_id,
              exchange: this.name,
            };

            checkPriceAlerts(this.name, message.product_id, price);
          }
        }

        // 초기 데이터가 완전히 로드된 후에만 WebSocket 메시지 전송
        if (this.isPopupActive && this.port && this.tickers && this.tickers[message.product_id]) {
          console.log('Coinbase WebSocket data sent:', message);
          this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: message });
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

async function handleExchangeChange(exchange) {
  if (activeExchange === exchange) return;

  if (activeExchange === 'upbit') upbit.setPopupActive(false);
  if (activeExchange === 'bithumb') bithumb.setPopupActive(false);
  if (activeExchange === 'binance') binance.setPopupActive(false);
  if (activeExchange === 'coinbase') coinbase.setPopupActive(false);

  if (exchange === 'upbit') {
    upbit.setPopupActive(true);
    if (activePort) upbit.connectPopup(activePort);
  } else if (exchange === 'bithumb') {
    bithumb.setPopupActive(true);
    if (activePort) bithumb.connectPopup(activePort);
  } else if (exchange === 'binance') {
    binance.setPopupActive(true);
    if (activePort) binance.connectPopup(activePort);
  } else if (exchange === 'coinbase') {
    coinbase.setPopupActive(true);
    if (activePort) coinbase.connectPopup(activePort);
  }

  await saveActiveExchange(exchange);
}

// 10. 메인 실행 로직
const exchangeRateManager = new ExchangeRateManager();
const upbit = new UpbitData();
const bithumb = new BithumbData();
const binance = new BinanceData();
const coinbase = new CoinbaseData();

let activePort = null;

async function initialize() {
  activeExchange = await loadActiveExchange();

  await upbit.start();
  await bithumb.start();
  await binance.start();
  await coinbase.start();

  if (activeExchange === 'upbit') upbit.setPopupActive(true);
  else if (activeExchange === 'bithumb') bithumb.setPopupActive(true);
  else if (activeExchange === 'binance') binance.setPopupActive(true);
  else if (activeExchange === 'coinbase') coinbase.setPopupActive(true);

  await exchangeRateManager.initialize();
}

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') return;

  activePort = port;
  exchangeRateManager.port = port;

  exchangeRateManager.saveExchangeRate(exchangeRateManager.exchangeRateUSD, exchangeRateManager.updatedDate);

  if (activeExchange === 'upbit') upbit.connectPopup(activePort);
  else if (activeExchange === 'bithumb') bithumb.connectPopup(activePort);
  else if (activeExchange === 'binance') binance.connectPopup(activePort);
  else if (activeExchange === 'coinbase') coinbase.connectPopup(activePort);

  if (activePort) {
    activePort.postMessage({ type: 'updatedVersion', data: updatedVersion });
  }

  port.onDisconnect.addListener(() => {
    activePort = null;
  });

  port.postMessage({ type: 'activeExchange', data: activeExchange });

  setInterval(() => {
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
      } catch (error) {
        console.warn(error);
      }
    }
  }, 2000);
});

initialize();
