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
    this.comoLocalStorage = { como_extension: { ui_theme: null, changeRateUSD: null, updatedDate: null } };
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

  getDynamicUserAgent() {
    // 크롬 확장 환경에서는 navigator.userAgent를 통해 현재 브라우저 정보 가져오기
    const defaultUA = navigator.userAgent;
    return defaultUA;
  }

  async fetchExchangeRate() {
    try {
      const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr'; // 실제 인증키로 교체
      let searchDate = CURRENT_DATE; // 기본적으로 오늘 날짜
      let attempts = 0;
      const maxAttempts = 7; // 최대 7일 전까지 확인 (주말/공휴일 대비)
      let foundRate = false;

      while (attempts < maxAttempts && !foundRate) {
        const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${searchDate}&data=AP01`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (data.length > 0) {
          const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
          if (usdRate) {
            this.changeRateUSD = Number(usdRate);
            console.log(`USD 환율 (한국수출입은행 기준, ${searchDate}):`, this.changeRateUSD);

            this.comoLocalStorage.como_extension.changeRateUSD = usdRate;
            this.comoLocalStorage.como_extension.updatedDate = searchDate;
            chrome.storage.local.set(this.comoLocalStorage);

            if (this.port) {
              this.port.postMessage({ type: 'changeRateUSD', data: this.changeRateUSD });
            }

            foundRate = true; // ✅ 환율을 찾았으므로 while 종료 조건을 만족하게 함
          }
        }

        // 데이터가 없으면 하루 전으로 이동
        attempts++;
        const prevDate = new Date();
        prevDate.setDate(prevDate.getDate() - attempts);
        searchDate = prevDate.toISOString().slice(0, 10).replace(/-/g, '');
      }
    } catch (error) {
      console.error('한국수출입은행 API 에러:', error);
      return null;
    }

    // try {
    //   const url = 'https://finance.naver.com/marketindex/';
    //   const response = await fetch(url, {
    //     method: 'GET',
    //     headers: {
    //       'User-Agent': this.getDynamicUserAgent(),
    //     },
    //   });

    //   const html = await response.text();

    //   // 정규식으로 USD 환율 추출
    //   const usdRegex = /<li class="on">[\s\S]*?<span class="value">([\d,]+\.\d+)<\/span>/i;
    //   const match = html.match(usdRegex);
    //   let changeRateUSD = null;

    //   if (match && match[1]) {
    //     changeRateUSD = match[1].replace(/,/g, ''); // 쉼표 제거
    //   } else {
    //     throw new Error('USD 환율을 찾을 수 없습니다.');
    //   }

    //   this.changeRateUSD = Number(changeRateUSD);
    //   console.log('USD 환율 (네이버, 하나은행 기준):', this.changeRateUSD);

    //   chrome.storage.local.set({
    //     como_extension: { changeRate: this.changeRateUSD, updatedDate: CURRENT_DATE },
    //   });

    //   return { changeRate: this.changeRateUSD, updatedDate: CURRENT_DATE };
    // } catch (error) {
    //   console.error('환율 크롤링 에러:', error);

    //   return null;
    // }
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

async function initializeStorage() {
  // when extensions install, chrome localstorage initialize
  chrome.runtime.onInstalled.addListener(() => chrome.storage.local.set(upbitData.comoLocalStorage));

  const result = await chrome.storage.local.get(['como_extension']);
  const comoStorage = result.como_extension ?? upbitData.comoLocalStorage;

  if (comoStorage.changeRate == null || comoStorage.updatedDate !== CURRENT_DATE) {
    await upbitData.fetchExchangeRate();
  } else if (!result) {
    await chrome.storage.local.set({ como_extension: upbitData.comoLocalStorage.como_extension });
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
