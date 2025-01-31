// const CURRENT_DATE = new Date()
//   .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
//   .replace(/\./g, '')
//   .replace(/ /g, '');

// const getDynamicUserAgent = () => navigator.userAgent;

// let updatedVersion = '';

// chrome.runtime.onInstalled.addListener(details => {
//   // como extension  제거시 왈라 설문조사 다이렉션
//   if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
//     chrome.runtime.setUninstallURL('https://walla.my/v/a6J0FV5gUKCyzupMaG71');
//   }
//   // como extension 설치 or 업데이트시 update note icon 변경
//   if (details.reason === 'update') {
//     updatedVersion = details?.previousVersion || null;
//   }
// });

// //chrome alarm background script 주기적 실행
// chrome.alarms.create('keepAlive', { periodInMinutes: 10 });
// chrome.alarms.onAlarm.addListener(alarm => {
//   return;
// });

// // Popup 토글 리스너
// chrome.runtime.onMessage.addListener(message => {
//   if (message.action === 'openPopup') chrome.action.openPopup();
//   if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
//   if (message.action === 'getActiveExchange' && activePort) {
//     activePort.postMessage({ type: 'activeExchange', data: activeExchange });
//   }
// });

// // ExchangeRateManager 클래스 (환율 관리)
// class ExchangeRateManager {
//   constructor() {
//     this.port = null;
//     this.exchangeRateUSD = null;
//     this.storages = {
//       exchangeRateUSD: null,
//       updatedDate: null,
//       favoriteCoins: { upbit: [], bithumb: [] },
//     };
//   }

//   async initialize() {
//     const keys = Object.keys(this.storages);
//     const results = await Promise.all(
//       keys.map(
//         key =>
//           new Promise(resolve => {
//             chrome.storage.local.get(key, result => resolve(result));
//           }),
//       ),
//     );
//     results.forEach((result, index) => {
//       this.storages[keys[index]] = result[keys[index]];
//     });

//     if (!this.storages.exchangeRateUSD || this.storages.updatedDate !== CURRENT_DATE) {
//       await this.updateExchangeRate();
//     }
//   }

//   async updateExchangeRate() {
//     try {
//       await this.fetchFromAPI();
//     } catch (error) {
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
//       this.exchangeRateUSD = null;
//     }
//   }

//   async saveExchangeRate(rate, date) {
//     await chrome.storage.local.set({ exchangeRateUSD: rate, currentDate: date });
//     if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate || this.storages.exchangeRateUSD });
//   }
// }

// // ExchangeData 클래스 (거래소 데이터 관리)
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
//     this.reconnectDelay = 3000;
//     this.isActive = false;
//   }

//   async fetchInitialTickers() {
//     try {
//       const marketsParam = this.markets?.join(',');
//       const response = await fetch(`${this.apiUrl}/ticker?markets=${marketsParam}`, {
//         headers: { Accept: 'application/json' },
//       });
//       const tickersArray = await response.json();

//       this.tickers = tickersArray.reduce((acc, ticker) => {
//         if (ticker.market) acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
//         return acc;
//       }, {});
//       // 팝업이 이미 연결된 경우 즉시 전송
//       if (this.port && this.isActive) {
//         this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
//       }
//     } catch (error) {
//       throw error;
//     }
//   }

//   connectPopup(port) {
//     if (!port || port.name !== 'popup') {
//       return;
//     }
//     this.port = port;
//     this.port.onDisconnect.addListener(() => {
//       this.port = null;
//       // if (this.socket) this.socket.close();
//       return;
//     });

//     if (this.isActive && this.tickers) {
//       this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
//     }
//   }

//   async connectWebSocket() {
//     if (!this.isActive) return;
//     if (this.socket && this.socket?.readyState === WebSocket.OPEN) return;

//     if (this.socket) {
//       this.socket.close();
//       this.socket = null;
//     }
//     this.socket = new WebSocket(this.wsUrl);

//     this.socket.onopen = () => {
//       if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
//         console.warn(`${this.name} WebSocket opened but socket is invalid or not open`);
//         return;
//       }

//       this.socket.send(JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }]));
//     };

//     this.socket.onmessage = async event => {
//       try {
//         let data = event.data;
//         if (data instanceof Blob) data = await data.text();
//         const ticker = JSON.parse(data);
//         if (this.isActive && this.port) {
//           this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
//         }
//       } catch (error) {
//         throw error;
//       }
//     };

//     this.socket.onerror = error => {
//       this.socket = null;
//     };

//     this.socket.onclose = event => {
//       this.socket = null;

//       if (this.isActive)
//         setTimeout(() => {
//           this.connectWebSocket();
//         }, this.reconnectDelay);
//     };
//   }

//   async start() {
//     this.markets = await this.fetchMarkets();

//     if (this.markets.length) {
//       await this.fetchInitialTickers();
//       if (this.isActive) this.connectWebSocket();
//     }
//   }

//   setActive(active) {
//     this.isActive = active;
//     if (active) {
//       this.start();
//       // this.connectWebSocket();
//     } else if (this.socket) {
//       // this.socket.close();
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
//       return (this.markets = ['KRW-BTC']);
//     }
//   }
// }

// // BithumbData 클래스
// class BithumbData extends ExchangeData {
//   constructor() {
//     super('bithumb', 'https://api.bithumb.com/v1', 'wss://ws-api.bithumb.com/websocket/v1');
//   }

//   async fetchMarkets() {
//     try {
//       const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
//       const data = await response.json();

//       this.markets = data.map(ticker => ticker.market);

//       this.marketsInfo = data.reduce((acc, ticker) => {
//         acc[ticker.market] = { ...ticker };
//         return acc;
//       }, {});

//       return this.markets;
//     } catch (error) {
//       return (this.markets = ['KRW-BTC']);
//     }
//   }
// }
// // Binance 클래스
// class BinanceData extends ExchangeData {
//   constructor() {
//     super('binance', ' https://api.binance.com/api/v3', 'wss://stream.binance.com:9443/ws/!ticker@arr');
//   }

//   async fetchInitialTickers() {
//     try {
//       const response = await fetch(`${this.apiUrl}/ticker/24hr`, {
//         headers: { Accept: 'application/json' },
//       });
//       const tickersArray = await response.json();

//       this.tickers = tickersArray.reduce((acc, ticker) => {
//         if (ticker.symbol && Number(ticker.lastPrice) !== 0) acc[ticker.symbol] = { ...ticker, market: ticker.symbol };
//         return acc;
//       }, {});
//       // 팝업이 이미 연결된 경우 즉시 전송
//       if (this.port && this.isActive) {
//         this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
//       }
//     } catch (error) {
//       throw error;
//     }
//   }

//   async connectWebSocket() {
//     if (!this.isActive) return;

//     if (this.socket && this.socket?.readyState === WebSocket.OPEN) return;

//     if (this.socket) {
//       this.socket.close();
//       this.socket = null;
//     }
//     this.socket = new WebSocket(this.wsUrl);

//     this.socket.onopen = () => {
//       if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
//         console.warn(`${this.name} WebSocket opened but socket is invalid or not open`);
//         return;
//       }
//     };

//     this.socket.onmessage = async event => {
//       try {
//         let data = event.data;
//         if (data instanceof Blob) data = await data.text();
//         const ticker = JSON.parse(data);
//         if (this.isActive && this.port) {
//           this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
//         }
//       } catch (error) {
//         throw error;
//       }
//     };

//     this.socket.onerror = error => {
//       this.socket = null;
//     };

//     this.socket.onclose = event => {
//       this.socket = null;

//       if (this.isActive)
//         setTimeout(() => {
//           this.connectWebSocket();
//         }, this.reconnectDelay);
//     };
//   }

//   async start() {
//     await this.fetchInitialTickers();
//     if (this.isActive) this.connectWebSocket();
//   }
// }

// // 상태 저장 및 관리
// const STORAGE_KEY = 'activeExchangePlatform';
// let activeExchange = null;

// async function saveActiveExchange(exchange) {
//   await chrome.storage.local.set({ [STORAGE_KEY]: exchange });
//   activeExchange = exchange;
// }

// async function loadActiveExchange() {
//   const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
//   return state || 'upbit';
// }

// async function handleExchangeChange(exchange) {
//   if (activeExchange === exchange) return;

//   if (activeExchange === 'upbit') upbit.setActive(false);
//   if (activeExchange === 'bithumb') bithumb.setActive(false);
//   if (activeExchange === 'binance') binance.setActive(false);

//   if (exchange === 'upbit') {
//     upbit.setActive(true);
//     if (activePort) upbit.connectPopup(activePort);
//   } else if (exchange === 'bithumb') {
//     bithumb.setActive(true);
//     if (activePort) bithumb.connectPopup(activePort);
//   } else if (exchange === 'binance') {
//     binance.setActive(true);
//     if (activePort) binance.connectPopup(activePort);
//   }

//   await saveActiveExchange(exchange);
// }

// // 메인 실행 로직
// const exchangeRateManager = new ExchangeRateManager();
// const upbit = new UpbitData();
// const bithumb = new BithumbData();
// const binance = new BinanceData();

// let activePort = null;

// async function initialize() {
//   // 저장된 상태 불러오기
//   activeExchange = await loadActiveExchange();

//   // 초기 활성화 설정
//   if (activeExchange === 'upbit') upbit.setActive(true);
//   else if (activeExchange === 'bithumb') bithumb.setActive(true);
//   else if (activeExchange === 'binance') binance.setActive(true);

//   // 데이터 초기화 및 시작
//   await exchangeRateManager.initialize();

//   // await upbit.start();
//   // await bithumb.start();

//   if (activePort) {
//     if (activeExchange === 'upbit' && upbit.tickers) {
//       activePort.postMessage({ type: 'upbitTickers', data: upbit.tickers });
//     } else if (activeExchange === 'bithumb' && bithumb.tickers) {
//       activePort.postMessage({ type: 'bithumbTickers', data: bithumb.tickers });
//     } else if (activeExchange === 'binance' && binance.tickers) {
//       activePort.postMessage({ type: 'binanceTickers', data: binance.tickers });
//     }
//   }
// }

// chrome.runtime.onConnect.addListener(port => {
//   if (!port || port.name !== 'popup') {
//     return;
//   }
//   activePort = port;
//   exchangeRateManager.port = port;
//   //port open 시 환율 전송
//   exchangeRateManager.saveExchangeRate(exchangeRateManager.exchangeRateUSD, exchangeRateManager.updatedDate);

//   // 현재 활성화된 거래소에 연결
//   if (activeExchange === 'upbit' && upbit.tickers) {
//     upbit.connectPopup(activePort);
//   } else if (activeExchange === 'bithumb' && bithumb.tickers) {
//     bithumb.connectPopup(activePort);
//   } else if (activeExchange === 'binance' && binance.tickers) {
//     binance.connectPopup(activePort);
//   }

//   //updated version post
//   if (activePort) {
//     activePort.postMessage({ type: 'updatedVersion', data: updatedVersion });
//   }

//   port;
//   port.onDisconnect.addListener(() => {
//     activePort = null;
//   });

//   // 팝업에 현재 상태 전송 (필요 시)
//   port.postMessage({ type: 'activeExchange', data: activeExchange });
// });

// initialize();

// 전체 거래소 종목 정보
const allExchangesTickers = { upbit: {}, bithumb: {}, binance: {} };
// 최고 changeRate 종목
const maxChangeRate = { exchange: null, market: null, changeRate: null };

const CURRENT_DATE = new Date()
  .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
  .replace(/\./g, '')
  .replace(/ /g, '');

// 30분마다 Date update, 환율 갱신목적
chrome.alarms.create('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate') {
    CURRENT_DATE = new Date()
      .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/\./g, '')
      .replace(/ /g, '');
  }
});

setInterval(() => {
  let maxRate = -Infinity;
  let maxTicker = { exchange: null, market: null, changeRate: null };
  let changeCount = 0;

  const compare = { ...allExchangesTickers };

  for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
    for (const [market, ticker] of Object.entries(tickers)) {
      const changeRate = ticker.changeRate ?? 0;
      if (changeRate > maxRate) {
        maxRate = changeRate;
        maxTicker.exchange = ticker.exchange;
        maxTicker.market = ticker.market;
        maxTicker.changeRate = changeRate;
      }
      changeCount++;
    }
  }
  maxChangeRate.exchange = maxTicker.exchange;
  maxChangeRate.market = maxTicker.market;
  maxChangeRate.changeRate = maxTicker.changeRate;
}, 30000);

const getDynamicUserAgent = () => navigator.userAgent;

// 설치시 : 업데이트 버전, 제거시: 왈라설문조사
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
chrome.alarms.onAlarm.addListener(alarm => {
  return;
});

//events listener
chrome.runtime.onMessage.addListener(message => {
  if (message.action === 'openPopup') chrome.action.openPopup();
  if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
  if (message.action === 'getActiveExchange' && activePort) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
  }
});

// ExchangeRateManager 클래스 (변경 없음)
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
      this.exchangeRateUSD = null;
    }
  }

  async saveExchangeRate(rate, date) {
    await chrome.storage.local.set({ exchangeRateUSD: rate, currentDate: date });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: rate || this.storages.exchangeRateUSD });
  }
}

// ExchangeData 클래스 (수정됨)
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
    this.isReconnecting = false; // 재연결 상태 플래그
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
            market: ticker.market,
            currentPrice: ticker.trade_price ?? 0,
            changeRate: ticker.signed_change_rate ?? 0,
          };
          acc[ticker.market] = { ...ticker, ...this.marketsInfo[ticker.market] };
        }
        return acc;
      }, {});
      if (this.port && this.isPopupActive) {
        this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
      }
    } catch (error) {
      console.error(`${this.name} 초기 티커 가져오기 실패:`, error);
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
      console.log(`${this.name} WebSocket 연결됨`);
      // 연결 성공 시 지연 시간 초기화
      this.isReconnecting = false;
      this.currentReconnectDelay = this.initialReconnectDelay;
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const subscription =
          this.name === 'binance'
            ? null
            : JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }]);
        if (subscription) this.socket.send(subscription);
      } else {
        console.warn(`${this.name} WebSocket open failed`);
      }
    };

    this.socket.onmessage = async event => {
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        const ticker = JSON.parse(data);

        //allExchangesTickers update
        if (this.name === 'binance' && Array.isArray(ticker)) {
          ticker.forEach(binanceTicker => {
            allExchangesTickers[this.name][binanceTicker.s] = {
              exchange: this.name,
              market: binanceTicker.s,
              currentPrice: binanceTicker.c ? Number(binanceTicker.c) : 0,
              changeRate: binanceTicker.P ? Number(binanceTicker.P) : 0,
            };
          });
        }
        if (this.name === 'upbit' || this.name === 'bithumb') {
          allExchangesTickers[this.name][ticker.market] = {
            exchange: this.name,
            market: ticker.market,
            currentPrice: ticker.trade_price ? Number(ticker.trade_price) * 100 : 0,
            changeRate: ticker.signed_change_rate ? Number(ticker.signed_change_rate) * 100 : 0,
          };
        }

        if (this.isPopupActive && this.port) {
          this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticker });
        }
      } catch (error) {
        console.error(`${this.name} WebSocket 메시지 처리 오류:`, error);
      }
    };

    this.socket.onerror = error => {
      console.error(`${this.name} WebSocket 에러:`, error.message || error);
      this.socket = null;
      this.reconnectWebSocket();
    };

    this.socket.onclose = () => {
      console.log(`${this.name} WebSocket 연결 종료`);
      this.socket = null;
      this.reconnectWebSocket();
    };
  }

  reconnectWebSocket() {
    // 이미 재연결 중이면 중복 실행 방지
    if (this.isReconnecting) {
      console.log(`${this.name} 이미 재연결 중입니다.`);
      return;
    }

    this.isReconnecting = true;
    const delay = this.currentReconnectDelay;

    console.log(`${this.name} WebSocket 재연결 대기 중, 지연: ${delay}ms`);

    setTimeout(() => {
      // WebSocket이 이미 연결된 경우 재연결 중지
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        console.log(`${this.name} WebSocket 이미 연결됨. 재연결 중지.`);
        this.isReconnecting = false;
        this.currentReconnectDelay = this.initialReconnectDelay; // 초기화
        return;
      }

      console.log(`${this.name} WebSocket 재연결 시도, 지연: ${this.currentReconnectDelay}ms`);
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
      console.error('Upbit 마켓 가져오기 실패:', error);
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
      console.error('Bithumb 마켓 가져오기 실패:', error);
      return (this.markets = ['KRW-BTC']);
    }
  }
}
// BinanceData 클래스
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
      console.error('Binance 마켓 가져오기 실패:', error);
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
      console.error('Binance 초기 티커 가져오기 실패:', error);
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

  if (activeExchange === 'upbit') upbit.setPopupActive(false);
  if (activeExchange === 'bithumb') bithumb.setPopupActive(false);
  if (activeExchange === 'binance') binance.setPopupActive(false);

  if (exchange === 'upbit') {
    upbit.setPopupActive(true);
    if (activePort) upbit.connectPopup(activePort);
  } else if (exchange === 'bithumb') {
    bithumb.setPopupActive(true);
    if (activePort) bithumb.connectPopup(activePort);
  } else if (exchange === 'binance') {
    binance.setPopupActive(true);
    if (activePort) binance.connectPopup(activePort);
  }

  await saveActiveExchange(exchange);
}

// 메인 실행 로직
const exchangeRateManager = new ExchangeRateManager();
const upbit = new UpbitData();
const bithumb = new BithumbData();
const binance = new BinanceData();

let activePort = null;

async function initialize() {
  activeExchange = await loadActiveExchange();

  await upbit.start();
  await bithumb.start();
  await binance.start();

  if (activeExchange === 'upbit') upbit.setPopupActive(true);
  else if (activeExchange === 'bithumb') bithumb.setPopupActive(true);
  else if (activeExchange === 'binance') binance.setPopupActive(true);

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

  if (activePort) {
    activePort.postMessage({ type: 'updatedVersion', data: updatedVersion });
  }

  port.onDisconnect.addListener(() => {
    activePort = null;
  });

  port.postMessage({ type: 'activeExchange', data: activeExchange });

  setInterval(() => {
    console.log('backgroundscript index.js', maxChangeRate);
    if (port) {
      port.postMessage({ type: 'maxChangeRate', data: maxChangeRate });
    }
  }, 2000);
});

initialize();
