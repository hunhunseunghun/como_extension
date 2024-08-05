const CURRENT_DATE = new Date()
  .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\./g, '')
  .replace(/ /g, '');

const getDynamicUserAgent = () => navigator.userAgent;

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
  #storageKey = 'como_extension';
  #defaultStorage = { uiTheme: null, exchangeRateUSD: null, updatedDate: null };

  constructor() {
    this.port = null;
    this.exchangeRateUSD = null;
  }

  async initialize() {
    chrome.runtime.onInstalled.addListener(() =>
      chrome.storage.local.set({ [this.#storageKey]: this.#defaultStorage }),
    );

    const { [this.#storageKey]: storage } = await chrome.storage.local.get(this.#storageKey);
    const currentStorage = storage || this.#defaultStorage;

    if (!currentStorage.exchangeRateUSD || currentStorage.updatedDate !== CURRENT_DATE) {
      await this.updateExchangeRate();
    }
  }

  async updateExchangeRate() {
    try {
      await this.fetchFromAPI();
    } catch (error) {
      console.error('API fetch failed:', error.message);
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
    } catch (error) {
      console.error('Naver crawling failed:', error.message);
      this.exchangeRateUSD = null;
    }
  }

  async saveExchangeRate(rate, date) {
    const storage = { ...this.#defaultStorage, exchangeRateUSD: rate, updatedDate: date };
    await chrome.storage.local.set({ [this.#storageKey]: storage });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate });
  }
}

// ExchangeData 추상 클래스 (거래소 데이터 관리)
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
    this.reconnectDelay = 2000;
    this.isActive = false;
  }

  async fetchMarkets() {
    throw new Error('fetchMarkets must be implemented by subclass');
  }

  async fetchInitialTickers() {
    throw new Error('fetchInitialTickers must be implemented by subclass');
  }

  connectPopup(port) {
    this.port = port;
    this.port.onDisconnect.addListener(() => (this.port = null));
    if (this.isActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  async connectWebSocket() {
    if (!this.isActive) return;
    if (this.socket?.readyState === WebSocket.OPEN) return;

    if (this.socket) this.socket.close();
    this.socket = new WebSocket(this.wsUrl);

    this.socket.onopen = () => {
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
        console.error(`${this.name} WebSocket message parsing failed:`, error);
      }
    };

    this.socket.onerror = error => {
      console.error(`${this.name} WebSocket Error:`, error);
      this.socket = null;
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (this.isActive) setTimeout(() => this.connectWebSocket(), this.reconnectDelay);
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
      this.connectWebSocket();
    } else if (this.socket) {
      this.socket.close();
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
      console.error('Upbit fetchMarkets failed:', error.message);
      return (this.markets = ['KRW-BTC']);
    }
  }

  async fetchInitialTickers() {
    const marketsParam = this.markets.join(',');
    const response = await fetch(`${this.apiUrl}/ticker?markets=${marketsParam}`, {
      headers: { Accept: 'application/json' },
    });
    const tickersArray = await response.json();
    this.tickers = tickersArray.reduce((acc, ticker) => {
      if (ticker.market) acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
      return acc;
    }, {});
  }
}

// BithumbData 클래스
class BithumbData extends ExchangeData {
  constructor() {
    super('bithumb', 'https://api.bithumb.com/public', 'wss://pubwss.bithumb.com/pub/ws');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/ticker/ALL_KRW`);
      const { status, data } = await response.json();
      if (status !== '0000') throw new Error('Bithumb API error');
      this.markets = Object.keys(data).filter(key => key !== 'date');
      this.marketsInfo = Object.entries(data).reduce((acc, [market, info]) => {
        if (market !== 'date') acc[market] = { market_warning: false, ...info };
        return acc;
      }, {});
      return this.markets;
    } catch (error) {
      console.error('Bithumb fetchMarkets failed:', error.message);
      return (this.markets = ['BTC_KRW']);
    }
  }

  async fetchInitialTickers() {
    const response = await fetch(`${this.apiUrl}/ticker/ALL_KRW`);
    const { data } = await response.json();
    this.tickers = Object.entries(data).reduce((acc, [market, info]) => {
      if (market !== 'date') acc[market] = { market, ...info, ...this.marketsInfo[market] };
      return acc;
    }, {});
  }
}

// 상태 저장 및 관리
const STORAGE_KEY = 'como_extension_state';
let activeExchange = null;

async function saveActiveExchange(exchange) {
  await chrome.storage.local.set({ [STORAGE_KEY]: { activeExchange: exchange } });
  activeExchange = exchange;
}

async function loadActiveExchange() {
  const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
  return state?.activeExchange || 'upbit'; // 기본값은 'upbit'
}

async function handleExchangeChange(exchange) {
  if (activeExchange === exchange) return;

  // 이전 거래소 비활성화
  if (activeExchange === 'upbit') upbit.setActive(false);
  if (activeExchange === 'bithumb') bithumb.setActive(false);

  // 새로운 거래소 활성화
  if (exchange === 'upbit') {
    upbit.setActive(true);
    upbit.connectPopup(activePort);
  } else if (exchange === 'bithumb') {
    bithumb.setActive(true);
    bithumb.connectPopup(activePort);
  }

  // 상태 저장
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
  await upbit.start();
  await bithumb.start();
}

chrome.runtime.onConnect.addListener(port => {
  activePort = port;
  exchangeRateManager.port = port;

  // 현재 활성화된 거래소에 연결
  if (activeExchange === 'upbit') upbit.connectPopup(port);
  else if (activeExchange === 'bithumb') bithumb.connectPopup(port);

  // 팝업에 현재 상태 전송 (필요 시)
  port.postMessage({ type: 'activeExchange', data: activeExchange });
});

// 초기화 실행
initialize();

//=================================================================================

// //popup toggle
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === 'openPopup') {
//     chrome.action.openPopup();
//   }
// });
// // popup 연결을 위한 리스너

// const CURRENT_DATE = String(
//   new Intl.DateTimeFormat('ko-KR', {
//     timeZone: 'Asia/Seoul',
//     year: 'numeric',
//     month: '2-digit',
//     day: '2-digit',
//   }).format(new Date()),
// )
//   .replace(/\./g, '')
//   .replace(/ /g, '');

// class comoInitialize {
//   constructor() {
//     this.port = null;
//     this.localstorage = { como_extension: { ui_theme: null, exchangeRateUSD: null, updatedDate: null } };
//     this.exchangeRateUSD = null;
//   }

//   async initializeStorage() {
//     // when extensions install, chrome localstorage initialize
//     chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set(this.localstorage));

//     const result = await chrome.storage.local.get(['como_extension']);
//     const comoStorage = result.como_extension ?? this.localstorage.como_extension;

//     console.log('RESULT STORAGE : ', JSON.stringify(result));
//     console.log('comoStorage : ', JSON.stringify(comoStorage));

//     if (!comoStorage.exchangeRateUSD || comoStorage.updatedDate !== CURRENT_DATE) {
//       try {
//         await this.fetchExchangeRate();
//       } catch (error) {
//         await chrome.storage.local.set({ como_extension: this.localstorage.como_extension });
//         console.error('fetchExchangeRate failed:', error.message);
//       }
//     }
//   }

//   getDynamicUserAgent(isSuc) {
//     const defaultUA = navigator.userAgent;
//     console.log('defaultUA : ', defaultUA);
//     return defaultUA;
//   }

//   async crawlingNaverUSDchangeRate() {
//     try {
//       const url = 'https://finance.naver.com/marketindex/';
//       const response = await fetch(url, {
//         method: 'GET',
//         headers: {
//           'User-Agent': this.getDynamicUserAgent(),
//         },
//       });

//       const html = await response.text();

//       // 정규식 USD 환율 추출
//       const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
//       const match = html.match(usdRegex);
//       let exchangeRateUSD = null;

//       if (match && match[1]) {
//         exchangeRateUSD = match[1].replace(/,/g, ''); // 쉼표 제거
//       } else {
//         throw new Error('crawlingNaverUSDchangeRate match failed');
//       }

//       this.exchangeRateUSD = Number(exchangeRateUSD);

//       this.localstorage.como_extension = {
//         ...this.localstorage,
//         changeRate: exchangeRateUSD,
//         updatedDate: CURRENT_DATE,
//       };

//       await chrome.storage.local.set({ como_extension: this.localstorage.como_extension });

//       if (this.port) {
//         this.port.postMessage({ type: 'exchangeRateUSD', data: this.exchangeRateUSD });
//       }
//     } catch (error) {
//       console.error('crawlingNaverUSDchangeRate failed :', error);

//       return null;
//     }
//   }

//   async fetchExchangeRate() {
//     try {
//       const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
//       let searchDate = CURRENT_DATE;
//       let attempts = 0;
//       const maxAttempts = 7; // 최대 7일간 검색

//       const fetchRate = async date => {
//         const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${date}&data=AP01`;
//         const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
//         return await response.json();
//       };

//       while (attempts < maxAttempts) {
//         const data = await fetchRate(searchDate);

//         if (Array.isArray(data) && data.length > 0) {
//           const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
//           if (usdRate) {
//             this.exchangeRateUSD = Number(usdRate);
//             this.localstorage.como_extension = {
//               ...this.localstorage.como_extension,
//               exchangeRateUSD: usdRate,
//               updatedDate: searchDate,
//             };
//             await chrome.storage.local.set(this.localstorage);

//             if (this.port) {
//               this.port.postMessage({ type: 'exchangeRateUSD', data: this.exchangeRateUSD });
//             }
//             return;
//           }
//         }

//         // 하루 전으로 이동
//         attempts++;
//         const prevDate = new Date();
//         prevDate.setDate(prevDate.getDate() - attempts);
//         searchDate = prevDate.toISOString().slice(0, 10).replace(/-/g, '');
//       }

//       // API에서 데이터를 찾지 못한 경우 네이버 크롤링 시도
//       await this.crawlingNaverUSDchangeRate();
//     } catch (error) {
//       console.error('fetchExchangeRate error:', error);
//       await this.crawlingNaverUSDchangeRate();
//     }
//   }
// }

// class UpbitData {
//   constructor() {
//     this.socket = null;
//     this.port = null;
//     this.upbitMarkets = [];
//     this.upbitMarketsInfo = null;
//     this.tickersInitData = null;
//   }

//   // popup 연결 시 port 처리
//   connectPopup(port) {
//     this.port = port;

//     this.port.onDisconnect.addListener(() => {
//       this.port = null;
//     });

//     if (this.tickersInitData && this.port) {
//       this.port.postMessage({ type: 'upbitTickers', data: this.tickersInitData });
//     }

//     if (this.port && this.changeRateUSD) {
//       this.port.postMessage({ type: 'changeRateUSD', data: this.changeRateUSD });
//     }
//   }

//   async fetchUpbitMarkets() {
//     try {
//       const response = await fetch('https://api.upbit.com/v1/market/all?is_details=true', {
//         method: 'GET',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//       });
//       const tickers = await response.json();
//       this.upbitMarkets = tickers.map(ticker => ticker.market ?? ticker.market);
//       const cautionFilteredData = tickers.map(ticker => {
//         const isCautionTrue = ticker.market_event?.caution
//           ? Object.values(ticker.market_event.caution || {}).some(value => value === true)
//           : false;
//         return {
//           ...ticker,
//           market_event: { ...ticker.market_event, caution: isCautionTrue },
//         };
//       });
//       this.upbitMarketsInfo = cautionFilteredData.reduce((acc, curr) => {
//         if (curr.market) {
//           acc[curr.market] = { ...curr };
//         }
//         return acc;
//       }, {});

//       return this.upbitMarkets;
//     } catch (error) {
//       console.error('fetchUpbitMarketsfailed:', error.message);
//       this.upbitMarkets = ['KRW-BTC'];
//       return this.upbitMarkets;
//     }
//   }

//   async fetchUpbitTickersInit() {
//     try {
//       const param = this.upbitMarkets.join(',');
//       const url = `https://api.upbit.com/v1/ticker?markets=${param}`;
//       const response = await fetch(url, {
//         method: 'GET',
//         headers: {
//           Accept: 'application/json',
//         },
//       });

//       const tickersArray = await response.json();
//       this.tickersInitData = tickersArray.reduce((acc, curr) => {
//         if (curr.market) {
//           acc[curr.market] = { ...curr, ...this.upbitMarketsInfo[curr.market] };
//         }
//         return acc;
//       }, {});
//     } catch (error) {
//       throw error;
//     }
//   }

//   async connectWebSocket() {
//     if (this.socket) {
//       this.socket.close();
//       this.socket = null;
//     }

//     this.socket = new WebSocket('wss://api.upbit.com/websocket/v1');
//     this.socket.onopen = () => {
//       this.socket.send(JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.upbitMarkets }])); // 마켓 코드 전송
//     };

//     this.socket.onmessage = async event => {
//       const data = await event.data.text();
//       const ticker = JSON.parse(data);

//       if (this.port) {
//         this.port.postMessage({ type: 'upbitWebsocketTicker', data: ticker });
//       }
//     };

//     this.socket.onerror = error => {
//       console.error('❌ WebSocket Error:', error);
//       this.socket = null;
//       this.port = null;
//     };

//     this.socket.onclose = () => {
//       this.socket = null;
//       setTimeout(() => this.connectWebSocket(), 1000);
//     };
//   }

//   async connectUpbitData() {
//     this.upbitMarkets = await this.fetchUpbitMarkets();

//     if (this.upbitMarkets.length > 2) {
//       await this.fetchUpbitTickersInit();
//       this.connectWebSocket();
//     }
//   }
// }

// class BithumbData {
//   constructor() {
//     this.socket = null;
//     this.port = null;
//     this.bithumbMarkets = [];
//     this.bithumbTickersMarketInfo = null;
//     this.bithumbTickersInitData = null;
//   }

//   async fetchBithumMarkets() {
//     try {
//       const url = 'https://api.bithumb.com/v1/market/all?isDetails=true';
//       const options = {
//         method: 'GET',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//       };
//       const response = await fetch(url, options);
//       const tickers = await response.json();

//       this.bithumbMarkets = tickers?.map(ticker => ticker.market ?? ticker.market) || [];

//       this.bithumbTickerInitData = tickers?.reduce((acc, curr) => {
//         if (curr.market && curr.market_warning) {
//           acc[curr.market] = { ...curr, market_warning: true };
//         } else if (curr.market) {
//           acc[curr.market] = { ...curr };
//         }
//         return acc;
//       }, {});
//     } catch (error) {
//       console.error('Bithumb market fetch error:', error);
//       this.bithumbMarkets = ['KRW-BTC'];
//     }
//   }

//   async fetchBithumbTickersInit() {
//     try {
//       const url = 'https://api.bithumb.com/v1/ticker';
//       const param = this.bithumbMarkets?.join(',');
//       const response = await fetch(`${url}?markets=${param}`);
//       const tickers = await response.json();
//       this.bithumbTickersInit = tickers?.reduce((acc, curr) => {
//         if (curr.market) {
//           acc[curr.market] = { ...curr, ...this.bithumbTickersMarketInfo[curr.market] };
//         }
//         return acc;
//       }, {});
//     } catch (error) {
//       throw error;
//     }
//   }
//   async connectWebSocket() {
//     if (this.socket && this.socket.readyState === WebSocket.OPEN) {
//       return;
//     }

//     this.socket = new WebSocket('wss://ws-api.bithumb.com/websocket/v1');

//     this.socket.onopen = () => {
//       this.socket.send(
//         JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.bithumbMarkets, isOnlyRealtime: true }]),
//       ); // 마켓 코드 전송
//     };
//     this.socket.onmessage = async event => {
//       const data = await event.data.text();
//       const ticker = JSON.parse(data);

//       if (this.port) {
//         this.port.postMessage({ type: 'BithumbWebsocketTicker', data: ticker });
//       }
//     };
//     this.socket.onerror = error => {
//       console.error('Bithumb WebSocket Error:', error);
//       this.socket = null;
//       this.port = null;
//     };

//     this.socket.onclose = () => {
//       this.socket = null;
//       setTimeout(() => this.connectWebSocket(), 1000);
//     };
//   }

//   async connectBithumbData() {
//     this.bithumbMarkets = await this.fetchBithumbMarkets();

//     if (this.bithumbMarkets.length > 2) {
//       await this.fetchBithumbTickersInit();
//       this.connectWebSocket();
//     }
//   }
// }

// // 인스턴스를
// const comoInit = new comoInitialize();
// const upbitData = new UpbitData();
// const bithumbData = new BithumbData();

// chrome.runtime.onConnect.addListener(port => {
//   upbitData.connectPopup(port);
// });

// comoInit.initializeStorage();
// // Upbit 데이터 수집 시작
// upbitData.connectUpbitData();

//=================================================================================

// // 공통 유틸리티 및 상수
// const CURRENT_DATE = new Date()
//   .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
//   .replace(/\./g, '')
//   .replace(/ /g, '');

// const getDynamicUserAgent = () => navigator.userAgent; // 동적 User-Agent 확장 가능

// // Popup 토글 리스너
// chrome.runtime.onMessage.addListener(message => {
//   if (message.action === 'openPopup') chrome.action.openPopup();
// });

// // ExchangeRateManager 클래스 (환율 관리)
// class ExchangeRateManager {
//   #storageKey = 'como_extension';
//   #defaultStorage = { uiTheme: null, exchangeRateUSD: null, updatedDate: null };

//   constructor() {
//     this.port = null;
//     this.exchangeRateUSD = null;
//   }

//   async initialize() {
//     chrome.runtime.onInstalled.addListener(() =>
//       chrome.storage.local.set({ [this.#storageKey]: this.#defaultStorage }),
//     );

//     const { [this.#storageKey]: storage } = await chrome.storage.local.get(this.#storageKey);
//     const currentStorage = storage || this.#defaultStorage;

//     if (!currentStorage.exchangeRateUSD || currentStorage.updatedDate !== CURRENT_DATE) {
//       await this.updateExchangeRate();
//     }
//   }

//   async updateExchangeRate() {
//     try {
//       await this.fetchFromAPI();
//     } catch (error) {
//       console.error('API fetch failed:', error.message);
//       await this.fetchFromNaver();
//     }
//   }

//   async fetchFromAPI() {
//     const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
//     const MAX_ATTEMPTS = 7;
//     let searchDate = CURRENT_DATE;

//     for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
//       const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${searchDate}&data=AP01`;
//       const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
//       const data = await response.json();

//       if (Array.isArray(data) && data.length) {
//         const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
//         if (usdRate) {
//           this.exchangeRateUSD = Number(usdRate);
//           await this.saveExchangeRate(usdRate, searchDate);
//           return;
//         }
//       }

//       const prevDate = new Date();
//       prevDate.setDate(prevDate.getDate() - (attempt + 1));
//       searchDate = prevDate.toISOString().slice(0, 10).replace(/-/g, '');
//     }

//     throw new Error('No USD rate found in API');
//   }

//   async fetchFromNaver() {
//     const url = 'https://finance.naver.com/marketindex/';
//     try {
//       const response = await fetch(url, { headers: { 'User-Agent': getDynamicUserAgent() } });
//       const html = await response.text();
//       const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
//       const match = html.match(usdRegex);

//       if (!match || !match[1]) throw new Error('Failed to parse USD rate from Naver');

//       const exchangeRateUSD = Number(match[1].replace(/,/g, ''));
//       this.exchangeRateUSD = exchangeRateUSD;
//       await this.saveExchangeRate(exchangeRateUSD, CURRENT_DATE);
//     } catch (error) {
//       console.error('Naver crawling failed:', error.message);
//       this.exchangeRateUSD = null;
//     }
//   }

//   async saveExchangeRate(rate, date) {
//     const storage = { ...this.#defaultStorage, exchangeRateUSD: rate, updatedDate: date };
//     await chrome.storage.local.set({ [this.#storageKey]: storage });
//     if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate });
//   }
// }

// // ExchangeData 추상 클래스 (거래소 데이터 관리)
// class ExchangeData {
//   constructor(name, apiUrl, wsUrl) {
//     this.name = name;
//     this.apiUrl = apiUrl;
//     this.wsUrl = wsUrl;
//     this.socket = null;
//     this.port = null;
//     this.markets = [];
//     this.marketsInfo = null;
//     this.tickers = null;
//     this.reconnectDelay = 2000; // 429 방지용 기본 5초 딜레이
//   }

//   async fetchMarkets() {
//     throw new Error('fetchMarkets must be implemented by subclass');
//   }

//   async fetchInitialTickers() {
//     throw new Error('fetchInitialTickers must be implemented by subclass');
//   }

//   connectPopup(port) {
//     this.port = port;
//     this.port.onDisconnect.addListener(() => (this.port = null));
//     if (this.tickers) this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
//   }

//   async connectWebSocket() {
//     if (this.socket?.readyState === WebSocket.OPEN) return;

//     if (this.socket) this.socket.close();
//     this.socket = new WebSocket(this.wsUrl);

//     this.socket.onopen = () => {
//       this.socket.send(JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }]));
//     };

//     this.socket.onmessage = async event => {
//       try {
//         let data = event.data;
//         if (data instanceof Blob) {
//           data = await data.text(); // Blob을 문자열로 변환
//         }
//         const ticker = JSON.parse(data); // 변환된 문자열을 JSON으로 파싱
//         if (this.port) this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
//       } catch (error) {
//         console.error(`${this.name} WebSocket message parsing failed:`, error);
//       }
//     };

//     this.socket.onerror = error => {
//       console.error(`${this.name} WebSocket Error:`, error);
//       this.socket = null;
//     };

//     this.socket.onclose = () => {
//       this.socket = null;
//       setTimeout(() => this.connectWebSocket(), this.reconnectDelay);
//     };
//   }

//   async start() {
//     this.markets = await this.fetchMarkets();
//     if (this.markets.length) {
//       await this.fetchInitialTickers();
//       this.connectWebSocket();
//     }
//   }
// }

// // UpbitData 클래스
// class UpbitData extends ExchangeData {
//   constructor() {
//     super('upbit', 'https://api.upbit.com/v1', 'wss://api.upbit.com/websocket/v1');
//   }

//   async fetchMarkets() {
//     try {
//       const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
//       const tickers = await response.json();
//       this.markets = tickers.map(ticker => ticker.market);
//       this.marketsInfo = tickers.reduce((acc, ticker) => {
//         const caution = ticker.market_event?.caution ? Object.values(ticker.market_event.caution).some(Boolean) : false;
//         acc[ticker.market] = { ...ticker, market_event: { ...ticker.market_event, caution } };
//         return acc;
//       }, {});
//       return this.markets;
//     } catch (error) {
//       console.error('Upbit fetchMarkets failed:', error.message);
//       return (this.markets = ['KRW-BTC']);
//     }
//   }

//   async fetchInitialTickers() {
//     const marketsParam = this.markets.join(',');
//     const response = await fetch(`${this.apiUrl}/ticker?markets=${marketsParam}`, {
//       headers: { Accept: 'application/json' },
//     });
//     const tickersArray = await response.json();
//     this.tickers = tickersArray.reduce((acc, ticker) => {
//       if (ticker.market) acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
//       return acc;
//     }, {});
//   }
// }

// // BithumbData 클래스
// class BithumbData extends ExchangeData {
//   constructor() {
//     super('bithumb', 'https://api.bithumb.com/public', 'wss://pubwss.bithumb.com/pub/ws');
//   }

//   async fetchMarkets() {
//     try {
//       const response = await fetch(`${this.apiUrl}/ticker/ALL_KRW`);
//       const { status, data } = await response.json();
//       if (status !== '0000') throw new Error('Bithumb API error');
//       this.markets = Object.keys(data).filter(key => key !== 'date');
//       this.marketsInfo = Object.entries(data).reduce((acc, [market, info]) => {
//         if (market !== 'date') acc[market] = { market_warning: false, ...info };
//         return acc;
//       }, {});
//       return this.markets;
//     } catch (error) {
//       console.error('Bithumb fetchMarkets failed:', error.message);
//       return (this.markets = ['BTC_KRW']);
//     }
//   }

//   async fetchInitialTickers() {
//     const response = await fetch(`${this.apiUrl}/ticker/ALL_KRW`);
//     const { data } = await response.json();
//     this.tickers = Object.entries(data).reduce((acc, [market, info]) => {
//       if (market !== 'date') acc[market] = { market, ...info, ...this.marketsInfo[market] };
//       return acc;
//     }, {});
//   }
// }

// // 메인 실행 로직
// const exchangeRateManager = new ExchangeRateManager();
// const upbit = new UpbitData();
// const bithumb = new BithumbData();

// chrome.runtime.onConnect.addListener(port => {
//   exchangeRateManager.port = port;
//   upbit.connectPopup(port);
//   bithumb.connectPopup(port);
// });

// exchangeRateManager.initialize();
// upbit.start();
// bithumb.start();
