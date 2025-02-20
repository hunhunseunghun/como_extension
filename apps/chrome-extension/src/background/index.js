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

class UpbitData {
  constructor() {
    this.socket = null;
    this.port = null;
    this.upbitMarkets = [];
    this.upbitMarketsInfo = null;
    this.tickersInitData = null;
    this.changeRateUSD = null;
  }

  // popup 연결 시 port 처리
  connectPopup(port) {
    console.log('📡 popup 연결됨:', port.name);
    this.port = port;

    this.port.onDisconnect.addListener(() => {
      console.log('❌ popup 연결 종료');
      this.port = null;
    });

    if (this.tickersInitData && this.port) {
      this.port.postMessage({ type: 'upbitTickers', data: this.tickersInitData });
    }

    if (this.port && this.changeRateUSD) {
      this.port.postMessage({ type: 'changeRateUSD', data: this.changeRateUSD });
    }
  }

  async fetchExchangeRate() {
    try {
      const API_URL = 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON';
      const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
      const DATA_TYPE = 'AP01';

      const REQUEST_URL = `${API_URL}?authkey=${AUTH_KEY}&data=AP01&searchdate=${CURRENT_DATE}`;

      const response = await fetch(REQUEST_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const responeseArray = await response.json();
      const changeRateUSD = responeseArray.filter(rate => rate.cur_unit === 'USD')[0]?.deal_bas_r?.replace(/,/g, '');

      chrome.storage.local.set({ como_extension: { changeRate: Number(changeRateUSD), updatedDate: CURRENT_DATE } });

      this.changeRateUSD = Number(changeRateUSD);

      console.log('this.changeRateUSD', this.changeRateUSD);
    } catch (error) {
      console.error(' 환율 fetching error :', error);
    }
  }

  async fetchUpbitMarkets() {
    try {
      const response = await fetch('https://api.upbit.com/v1/market/all?is_details=true', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      const cautionFilteredData = data.map(item => {
        const isCautionTrue = item.market_event?.caution
          ? Object.values(item.market_event.caution).some(value => value === true)
          : false;
        if (item.market_event) item.market_event.caution = isCautionTrue;
        return item;
      });
      this.upbitMarketsInfo = cautionFilteredData.reduce((acc, curr) => {
        if (curr.market) {
          acc[curr.market] = { ...curr };
        }
        return acc;
      }, {});
      this.upbitMarkets = cautionFilteredData.map(item => item.market);

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

      console.log('this.tickersInitData:', this.tickersInitData);
      console.log('this.upbitMarketsInfo:', this.upbitMarketsInfo);
    } catch (error) {
      console.error('fetchUpbitTickersInit failed:', error.message);
    }
  }

  async connectWebSocket() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket 이미 연결됨.');
      return;
    }

    this.socket = new WebSocket('wss://api.upbit.com/websocket/v1');

    this.socket.onopen = () => {
      console.log('✅ WebSocket 연결 성공');
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
      console.log('⚠️ WebSocket closed - Reconnecting...');
      this.socket = null;
      setTimeout(() => this.connectWebSocket(), 250);
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

async function initializeStorage() {
  // when extensions install, chrome localstorage initialize
  chrome.runtime.onInstalled.addListener(() =>
    chrome.storage.local.set({ como_extension: { changeRate: null, updatedDate: null } }),
  );

  const result = await chrome.storage.local.get(['como_extension']);

  console.log('backgournd storage result :', result);
  const comoStorage = result.como_extension ?? { changeRate: null, updatedDate: null };

  console.log('📌 Storage Data background :', comoStorage);

  if (!comoStorage.changeRate && comoStorage.updatedDate !== CURRENT_DATE) {
    await upbitData.fetchExchangeRate();
  } else if (!result) {
    await chrome.storage.local.set({ como_extension: { changeRate: null, updatedDate: null } });
  }
}

// UpbitData 인스턴스를 생성
const upbitData = new UpbitData();

// popup 연결을 위한 리스너
chrome.runtime.onConnect.addListener(port => {
  upbitData.connectPopup(port);
});

initializeStorage();

// Upbit 데이터 수집 시작
upbitData.connectUpbitData();
