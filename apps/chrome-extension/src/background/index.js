//popup toggle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});
// popup 연결을 위한 리스너

const CURRENT_DATE = String(
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
)
  .replace(/\./g, '')
  .replace(/ /g, '');

class comoInitialize {
  constructor() {
    this.port = null;
    this.localstorage = { como_extension: { ui_theme: null, exchangeRateUSD: null, updatedDate: null } };
    this.exchangeRateUSD = null;
  }

  async initializeStorage() {
    // when extensions install, chrome localstorage initialize
    chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set(this.localstorage));

    const result = await chrome.storage.local.get(['como_extension']);
    const comoStorage = result.como_extension ?? this.localstorage.como_extension;

    console.log('RESULT STORAGE : ', JSON.stringify(result));
    console.log('comoStorage : ', JSON.stringify(comoStorage));

    if (!comoStorage.exchangeRateUSD || comoStorage.updatedDate !== CURRENT_DATE) {
      try {
        await this.fetchExchangeRate();
      } catch (error) {
        await chrome.storage.local.set({ como_extension: this.localstorage.como_extension });
        console.error('fetchExchangeRate failed:', error.message);
      }
    }
  }

  getDynamicUserAgent(isSuc) {
    const defaultUA = navigator.userAgent;
    console.log('defaultUA : ', defaultUA);
    return defaultUA;
  }

  async crawlingNaverUSDchangeRate() {
    try {
      const url = 'https://finance.naver.com/marketindex/';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.getDynamicUserAgent(),
        },
      });

      const html = await response.text();

      // 정규식 USD 환율 추출
      const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
      const match = html.match(usdRegex);
      let exchangeRateUSD = null;

      if (match && match[1]) {
        exchangeRateUSD = match[1].replace(/,/g, ''); // 쉼표 제거
      } else {
        throw new Error('crawlingNaverUSDchangeRate match failed');
      }

      this.exchangeRateUSD = Number(exchangeRateUSD);

      this.localstorage.como_extension = {
        ...this.localstorage,
        changeRate: exchangeRateUSD,
        updatedDate: CURRENT_DATE,
      };

      await chrome.storage.local.set(this.localstorage);

      if (this.port) {
        this.port.postMessage({ type: 'exchangeRateUSD', data: this.exchangeRateUSD });
      }
    } catch (error) {
      console.error('crawlingNaverUSDchangeRate failed :', error);

      return null;
    }
  }

  async fetchExchangeRate() {
    try {
      const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
      let searchDate = CURRENT_DATE;
      let attempts = 0;
      const maxAttempts = 7; // 최대 7일간 검색

      const fetchRate = async date => {
        const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${date}&data=AP01`;
        const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
        return await response.json();
      };

      while (attempts < maxAttempts) {
        const data = await fetchRate(searchDate);

        if (Array.isArray(data) && data.length > 0) {
          const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
          if (usdRate) {
            this.exchangeRateUSD = Number(usdRate);
            this.localstorage.como_extension = {
              ...this.localstorage.como_extension,
              exchangeRateUSD: usdRate,
              updatedDate: searchDate,
            };
            await chrome.storage.local.set(this.localstorage);

            if (this.port) {
              this.port.postMessage({ type: 'exchangeRateUSD', data: this.exchangeRateUSD });
            }
            return;
          }
        }

        // 하루 전으로 이동
        attempts++;
        const prevDate = new Date();
        prevDate.setDate(prevDate.getDate() - attempts);
        searchDate = prevDate.toISOString().slice(0, 10).replace(/-/g, '');
      }

      // API에서 데이터를 찾지 못한 경우 네이버 크롤링 시도
      await this.crawlingNaverUSDchangeRate();
    } catch (error) {
      console.error('fetchExchangeRate error:', error);
      await this.crawlingNaverUSDchangeRate();
    }
  }
}

class UpbitData {
  constructor() {
    this.socket = null;
    this.port = null;
    this.upbitMarkets = [];
    this.upbitMarketsInfo = null;
    this.tickersInitData = null;
    // this.comoLocalStorage = { como_extension: { ui_theme: null, changeRateUSD: null, updatedDate: null } };
    // this.changeRateUSD = null;
  }

  // popup 연결 시 port 처리
  connectPopup(port) {
    this.port = port;

    this.port.onDisconnect.addListener(() => {
      this.port = null;
    });

    if (this.tickersInitData && this.port) {
      this.port.postMessage({ type: 'upbitTickers', data: this.tickersInitData });
    }

    if (this.port && this.changeRateUSD) {
      this.port.postMessage({ type: 'changeRateUSD', data: this.changeRateUSD });
    }
  }

  // getDynamicUserAgent(isSuc) {
  //   const defaultUA = navigator.userAgent;
  //   return defaultUA;
  // }

  // async crawlingNaverUSDchangeRate() {
  //   try {
  //     const url = 'https://finance.naver.com/marketindex/';
  //     const response = await fetch(url, {
  //       method: 'GET',
  //       headers: {
  //         'User-Agent': this.getDynamicUserAgent(),
  //       },
  //     });

  //     const html = await response.text();

  //     // 정규식 USD 환율 추출
  //     const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
  //     const match = html.match(usdRegex);
  //     let changeRateUSD = null;

  //     if (match && match[1]) {
  //       changeRateUSD = match[1].replace(/,/g, ''); // 쉼표 제거
  //     } else {
  //       throw new Error('crawlingNaverUSDchangeRate match failed');
  //     }

  //     this.changeRateUSD = Number(changeRateUSD);

  //     this.comoLocalStorage.como_extension = {
  //       ...this.comoLocalStorage,
  //       changeRate: changeRateUSD,
  //       updatedDate: CURRENT_DATE,
  //     };

  //     await chrome.storage.local.set(this.comoLocalStorage);

  //     if (this.port) {
  //       this.port.postMessage({ type: 'changeRateUSD', data: this.changeRateUSD });
  //     }
  //   } catch (error) {
  //     console.error('crawlingNaverUSDchangeRate failed :', error);

  //     return null;
  //   }
  // }

  async fetchUpbitMarkets() {
    try {
      const response = await fetch('https://api.upbit.com/v1/market/all?is_details=true', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const tickers = await response.json();
      this.upbitMarkets = tickers.map(ticker => ticker.market ?? ticker.market);
      const cautionFilteredData = tickers.map(ticker => {
        const isCautionTrue = ticker.market_event?.caution
          ? Object.values(ticker.market_event.caution).some(value => value === true)
          : false;
        if (ticker.market_event) ticker.market_event.caution = isCautionTrue;
        return ticker;
      });
      this.upbitMarketsInfo = cautionFilteredData.reduce((acc, curr) => {
        if (curr.market) {
          acc[curr.market] = { ...curr };
        }
        return acc;
      }, {});

      return this.upbitMarkets;
    } catch (error) {
      console.error('fetchUpbitMarketsfailed:', error.message);
      this.upbitMarkets = ['KRW-BTC'];
      return this.upbitMarkets;
    }
  }

  async fetchUpbitTickersInit() {
    try {
      const param = this.upbitMarkets.join(',');
      const url = `https://api.upbit.com/v1/ticker?markets=${param}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const tickersArray = await response.json();
      this.tickersInitData = tickersArray.reduce((acc, curr) => {
        if (curr.market) {
          acc[curr.market] = { ...curr, ...this.upbitMarketsInfo[curr.market] };
        }
        return acc;
      }, {});
    } catch (error) {
      throw error;
    }
  }

  async connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    this.socket = new WebSocket('wss://api.upbit.com/websocket/v1');
    this.socket.onopen = () => {
      this.socket.send(JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.upbitMarkets }])); // 마켓 코드 전송
    };

    this.socket.onmessage = async event => {
      const data = await event.data.text();
      const ticker = JSON.parse(data);

      if (this.port) {
        this.port.postMessage({ type: 'upbitWebsocketTicker', data: ticker });
      }
    };

    this.socket.onerror = error => {
      console.error('❌ WebSocket Error:', error);
      this.socket = null;
      this.port = null;
    };

    this.socket.onclose = () => {
      this.socket = null;
      setTimeout(() => this.connectWebSocket(), 1000);
    };
  }

  async connectUpbitData() {
    this.upbitMarkets = await this.fetchUpbitMarkets();

    if (this.upbitMarkets.length > 2) {
      await this.fetchUpbitTickersInit();
      this.connectWebSocket();
    }
  }
}

class BithumbData {
  constructor() {
    this.socket = null;
    this.port = null;
    this.bithumbMarkets = [];
    this.bithumbTickersMarketInfo = null;
    this.bithumbTickersInitData = null;
  }

  async fetchBithumMarkets() {
    try {
      const url = 'https://api.bithumb.com/v1/market/all?isDetails=true';
      const options = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      };
      const response = await fetch(url, options);
      const tickers = await response.json();

      this.bithumbMarkets = tickers?.map(ticker => ticker.market ?? ticker.market);

      this.bithumbTickerInitData = tickers?.reduce((acc, curr) => {
        if (curr.market && curr.market_warning) {
          acc[curr.market] = { ...curr, market_warning: true };
        } else if (curr.market) {
          acc[curr.market] = { ...curr };
        }
        return acc;
      }, {});
    } catch (error) {
      this.bithumbMarkets = ['KRW-BTC'];
    }
  }

  async fetchBithumbTickersInit() {
    try {
      const url = 'https://api.bithumb.com/v1/ticker';
      const param = this.bithumbMarkets?.join(',');
      const response = await fetch(`${url}?markets=${param}`);
      const tickers = await response.json();
      this.bithumbTickersInit = tickers?.reduce((acc, curr) => {
        if (curr.market) {
          acc[curr.market] = { ...curr, ...this.bithumbTickersMarketInfo[curr.market] };
        }
        return acc;
      }, {});
    } catch (error) {
      throw error;
    }
  }
  async connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.socket = new WebSocket('wss://ws-api.bithumb.com/websocket/v1');

    this.socket.onopen = () => {
      this.socket.send(
        JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.bithumbMarkets, isOnlyRealtime: true }]),
      ); // 마켓 코드 전송
    };
    this.socket.onmessage = async event => {
      const data = await event.data.text();
      const ticker = JSON.parse(data);

      if (this.port) {
        this.port.postMessage({ type: 'BithumbWebsocketTicker', data: ticker });
      }
    };
    this.socket.onerror = error => {
      console.error('Bithumb WebSocket Error:', error);
      this.socket = null;
      this.port = null;
    };

    this.socket.onclose = () => {
      this.socket = null;
      setTimeout(() => this.connectWebSocket(), 1000);
    };
  }

  async connectBithumbData() {
    this.bithumbMarkets = await this.fetchBithumbMarkets();

    if (this.bithumbMarkets.length > 2) {
      await this.fetchBithumbTickersInit();
      this.connectWebSocket();
    }
  }
}

// 인스턴스를
const comoInit = new comoInitialize();
const upbitData = new UpbitData();
const bithumbData = new BithumbData();

chrome.runtime.onConnect.addListener(port => {
  upbitData.connectPopup(port);
});

comoInit.initializeStorage();
// Upbit 데이터 수집 시작
upbitData.connectUpbitData();
