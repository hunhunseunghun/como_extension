const CURRENT_DATE = new Date()
  .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\./g, '')
  .replace(/ /g, '');

const getDynamicUserAgent = () => navigator.userAgent;

// como extension  제거시 왈라 설문조사 다이렉션
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.setUninstallURL('https://walla.my/v/a6J0FV5gUKCyzupMaG71');
  }
});

//chrome alarm background script 주기적 실행
chrome.alarms.create('keepAlive', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(alarm => {
  return;
});

// Popup 토글 리스너
chrome.runtime.onMessage.addListener(message => {
  if (message.action === 'openPopup') chrome.action.openPopup();
  if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
  if (message.action === 'getActiveExchange' && activePort) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
  }
});

// ExchangeRateManager 클래스 (환율 관리)
class ExchangeRateManager {
  constructor() {
    this.port = null;
    this.exchangeRateUSD = null;
    this.storages = {
      exchangeRateUSD: null,
      updatedDate: null,
      favoriteCoins: { upbit: [], bithumb: [] },
    };
  }

  async initialize() {
    const keys = Object.keys(this.storages);
    const results = await Promise.all(
      keys.map(
        key =>
          new Promise(resolve => {
            chrome.storage.local.get(key, result => resolve(result));
          }),
      ),
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
    } catch (error) {
      console.log('API fetch failed:', error.message);
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
      console.log('fetchFromNaver : ', html);
      if (!match || !match[1]) throw new Error('Failed to parse USD rate from Naver');

      const exchangeRateUSD = Number(match[1].replace(/,/g, ''));
      this.exchangeRateUSD = exchangeRateUSD;
      await this.saveExchangeRate(exchangeRateUSD, CURRENT_DATE);
    } catch (error) {
      console.log('Naver crawling failed:', error.message);
      this.exchangeRateUSD = null;
    }
  }

  async saveExchangeRate(rate, date) {
    await chrome.storage.local.set({ exchangeRateUSD: rate, currentDate: date });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate || this.storages.exchangeRateUSD });
  }
}

// ExchangeData 클래스 (거래소 데이터 관리)
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
    this.reconnectDelay = 3000;
    this.isActive = false;
  }

  async fetchInitialTickers() {
    try {
      const marketsParam = this.markets?.join(',');
      const response = await fetch(`${this.apiUrl}/ticker?markets=${marketsParam}`, {
        headers: { Accept: 'application/json' },
      });
      const tickersArray = await response.json();

      console.log('init api success : ', this.name);
      this.tickers = tickersArray.reduce((acc, ticker) => {
        if (ticker.market) acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
        return acc;
      }, {});
      // 팝업이 이미 연결된 경우 즉시 전송
      if (this.port && this.isActive) {
        this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
      }
    } catch (error) {
      console.log(`${this.name} fetchInitialTickers failed:`, error.message);
    }
  }

  connectPopup(port) {
    if (!port || port.name !== 'popup') {
      return;
    }
    this.port = port;
    this.port.onDisconnect.addListener(() => {
      console.log(`${this.name} popup disconnected`);
      this.port = null;
      // if (this.socket) this.socket.close();
      return;
    });
    if (this.isActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  async connectWebSocket() {
    console.log(this.name, 'connect websocket excute');
    if (!this.isActive) return;
    if (this.socket && this.socket?.readyState === WebSocket.OPEN) return;

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.socket = new WebSocket(this.wsUrl);

    this.socket.onopen = () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.warn(`${this.name} WebSocket opened but socket is invalid or not open`);
        return;
      }

      this.socket.send(JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }]));
    };

    this.socket.onmessage = async event => {
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        const ticker = JSON.parse(data);
        if (this.isActive && this.port) {
          this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
        }
      } catch (error) {
        console.log(`${this.name} WebSocket message parsing failed:`, error);
      }
    };

    this.socket.onerror = error => {
      console.log(`${this.name} WebSocket Error ! :`, error);
      this.socket = null;
    };

    this.socket.onclose = event => {
      this.socket = null;
      console.log('웹소켓 닫힌 이유 , 코드 : ', event.code, '이유', event.reason);
      if (this.isActive)
        setTimeout(() => {
          console.log(this.name, 'websocket 재연결 setTimeout');
          this.connectWebSocket();
        }, this.reconnectDelay);
    };
  }

  async start() {
    this.markets = await this.fetchMarkets();
    if (this.markets.length) {
      await this.fetchInitialTickers();
      if (this.isActive) this.connectWebSocket();
    }
  }

  setActive(active) {
    this.isActive = active;
    if (active) {
      this.start();
      // this.connectWebSocket();
    } else if (this.socket) {
      // this.socket.close();
    }
  }
}

// UpbitData 클래스
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
      console.log('Upbit fetchMarkets failed:', error.json());
      return (this.markets = ['KRW-BTC']);
    }
  }
}

// BithumbData 클래스
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
      console.log('Bithumb fetchMarkets failed:', error.message);
      return (this.markets = ['KRW-BTC']);
    }
  }
}

// 상태 저장 및 관리
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

  if (activeExchange === 'upbit') upbit.setActive(false);
  if (activeExchange === 'bithumb') bithumb.setActive(false);

  if (exchange === 'upbit') {
    upbit.setActive(true);
    if (activePort) upbit.connectPopup(activePort);
  } else if (exchange === 'bithumb') {
    bithumb.setActive(true);
    if (activePort) bithumb.connectPopup(activePort);
  }

  await saveActiveExchange(exchange);
}

// 메인 실행 로직
const exchangeRateManager = new ExchangeRateManager();
const upbit = new UpbitData();
const bithumb = new BithumbData();

let activePort = null;

async function initialize() {
  // 저장된 상태 불러오기
  activeExchange = await loadActiveExchange();

  // 초기 활성화 설정
  if (activeExchange === 'upbit') upbit.setActive(true);
  else if (activeExchange === 'bithumb') bithumb.setActive(true);

  // 데이터 초기화 및 시작
  await exchangeRateManager.initialize();

  // await upbit.start();
  // await bithumb.start();

  if (activePort) {
    if (activeExchange === 'upbit' && upbit.tickers) {
      activePort.postMessage({ type: 'upbitTickers', data: upbit.tickers });
    } else if (activeExchange === 'bithumb' && bithumb.tickers) {
      activePort.postMessage({ type: 'bithumbTickers', data: bithumb.tickers });
    }
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') {
    console.log('Invalid port received in onConnect');
    return;
  }
  activePort = port;
  exchangeRateManager.port = port;
  //port open 시 환율 전송
  exchangeRateManager.saveExchangeRate(exchangeRateManager.exchangeRateUSD, exchangeRateManager.updatedDate);

  // 현재 활성화된 거래소에 연결
  if (activeExchange === 'upbit' && upbit.tickers) {
    upbit.connectPopup(activePort);
  } else if (activeExchange === 'bithumb' && bithumb.tickers) {
    bithumb.connectPopup(activePort);
  }

  port;
  port.onDisconnect.addListener(() => {
    activePort = null;
  });

  // 팝업에 현재 상태 전송 (필요 시)
  port.postMessage({ type: 'activeExchange', data: activeExchange });
});

initialize();
