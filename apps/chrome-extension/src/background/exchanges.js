// @ts-check
// 거래소 연결(시세 스냅샷 + 실시간 웹소켓/폴링). index.js에서 나눔.
// index.js에 있는 알림 확인·권한·미니 창 상태는 configureExchanges로 받는다(순환 import를 피한다).
import { toGlobalSnapshot, toGlobalTick } from './lib/globalTicks.js';
import { allExchangesTickers } from './state.js';
import { fetchJson } from './net.js';
import { checkPriceAlerts } from './notify.js';

/** @typedef {ReturnType<typeof setTimeout>} Timer */
/**
 * 스냅샷 한 종목(setSnapshot이 받음). ticker는 팝업에 보내는 거래소 원본에 가까운 모양.
 * @typedef {{ key: string, ticker: any, price: number, changeRate: number, volume?: number | string, koreanName?: string | null }} SnapshotEntry
 */
/**
 * 실시간 갱신 한 건(applyUpdates가 받음). tick은 팝업에 보내는 모양.
 * @typedef {{ key: string, tick: any, price: number, changeRate: number, volume?: number }} TickUpdate
 */

/**
 * 시세를 보낼 화면 포트. 실제 chrome.runtime.Port와, 연결된 화면 모두에 보내는 index.js의 broadcastPort가 같은 모양이다.
 * @typedef {{ name: string, postMessage: (message: any) => void, onDisconnect: { addListener: (callback: () => void) => void } }} ScreenPort
 */

const deps = {
  /** @type {(name: string) => Promise<boolean>} */
  hasExchangePermission: async () => true,
  /** @type {(name: string) => boolean} */
  isWatchedByMini: () => false,
  /** @type {Record<string, ExchangeData>} */
  exchanges: {},
};
/** @param {Partial<typeof deps>} values */
export function configureExchanges(values) {
  Object.assign(deps, values);
}

//  ExchangeData 클래스
// 공통: 스냅샷 보관, 실시간 갱신 병합, 지정가 알림 확인, 팝업 전달.
// 거래소별: fetchMarkets / fetchInitialTickers / getSubscriptions / parseMessage 만 구현한다.
const TICKER_CHUNK_SIZE = 100;
const HEARTBEAT_INTERVAL = 20000;
// 이 시간 동안 메시지가 없으면 반쯤 끊긴 연결로 보고 다시 연결한다. 구독한 거래소는 모두 초 단위로 메시지를 보낸다.
const STALE_SOCKET_MS = 60_000;
// 시작할 때 마켓 목록을 못 받으면 30초부터 늘려 가며 최대 10분 간격으로 다시 시도한다.
const START_RETRY_MIN_MS = 30_000;
const START_RETRY_MAX_MS = 10 * 60_000;
// OKX·Bybit는 종목별로 초당 수백~수천 건을 보내므로 해외 거래소 틱은 모아서 팝업에 전달한다.
const GLOBAL_FORWARD_INTERVAL = 200;

export class ExchangeData {
  /**
   * @param {string} name
   * @param {string} apiUrl
   * @param {string | null} wsUrl 웹소켓이 없는 거래소(폴링)는 null
   * @param {{ isGlobal?: boolean }} [options]
   */
  constructor(name, apiUrl, wsUrl, { isGlobal = false } = {}) {
    this.name = name;
    this.apiUrl = apiUrl;
    this.wsUrl = wsUrl;
    // 해외(USDT) 거래소는 팝업에서 바이낸스와 같은 필드 형태를 사용한다.
    this.isGlobal = isGlobal;
    /** @type {WebSocket | null} */
    this.socket = null;
    /** @type {ScreenPort | null} */
    this.port = null;
    /** @type {string[]} */
    this.markets = [];
    /** @type {Record<string, any>} 마켓 → 이름·경보 등 거래소 마켓 정보 */
    this.marketsInfo = {};
    /** @type {Record<string, any> | null} 마켓 → 팝업에 보내는 시세 */
    this.tickers = null;
    /** @type {any[] | null} 해외 거래소: fetchMarkets가 받은 시세를 첫 스냅샷까지 잠시 둔다 */
    this.initialList = null;
    this.initialReconnectDelay = 2000;
    this.currentReconnectDelay = this.initialReconnectDelay;
    this.maxReconnectDelay = 10000;
    this.backoffFactor = 1.5;
    this.isPopupActive = false;
    this.isReconnecting = false;
    /** @type {Timer | undefined} */
    this.heartbeatId = undefined;
    /** @type {Record<string, any>} */
    this.pendingTicks = {};
    /** @type {Timer | undefined} */
    this.forwardTimer = undefined;
    this.lastMessageAt = 0;
    // started: 마켓 목록과 첫 시세를 받았다. suspended: 화면이 닫혀 있고 쓰는 곳이 없어 연결을 끊어 뒀다.
    this.started = false;
    this.suspended = false;
    /** @type {Timer | undefined} */
    this.startTimer = undefined;
    this.startRetryDelay = START_RETRY_MIN_MS;
    // 구독 메시지 사이 간격. 일부 거래소(Bitget 등)는 초당 메시지 수를 제한한다.
    this.subscribeGap = 120;
    // locked: 선택 권한 거래소인데 아직 허락받지 않았다.
    this.locked = false;
  }

  /** @param {TickUpdate[]} updates */
  forwardTicks(updates) {
    // 원화 거래소 틱은 팝업이 하나씩 받는다(웹소켓은 메시지마다 하나, 폴링은 바뀐 종목 전부).
    if (!this.isGlobal) {
      for (const { tick } of updates) this.port?.postMessage({ type: `${this.name}WebsocketTicker`, data: tick });
      return;
    }
    for (const { key, tick } of updates) this.pendingTicks[key] = tick;
    if (this.forwardTimer) return;
    this.forwardTimer = setTimeout(() => {
      this.forwardTimer = undefined;
      const ticks = Object.values(this.pendingTicks);
      this.pendingTicks = {};
      if (ticks.length && this.isPopupActive && this.port) {
        this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticks });
      }
    }, GLOBAL_FORWARD_INTERVAL);
  }

  /** @param {SnapshotEntry[]} entries */
  setSnapshot(entries) {
    /** @type {Record<string, any>} */
    const tickers = {};
    const store = allExchangesTickers[this.name];
    for (const { key, ticker, price, changeRate, volume = 0, koreanName = null } of entries) {
      if (!key) continue;
      if (price) checkPriceAlerts(this.name, key, price);
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
      // 한꺼번에 보내면 업비트가 초당 요청 한도(429)로 일부를 거절해 스냅샷 전체가 비므로 차례로 보내고, 429면 잠시 뒤 다시 보낸다.
      const responses = [];
      for (let i = 0; i < this.markets.length; i += TICKER_CHUNK_SIZE) {
        const chunk = this.markets.slice(i, i + TICKER_CHUNK_SIZE);
        responses.push(await this.fetchTickerChunk(chunk));
      }
      this.setSnapshot(
        responses.flat().map((/** @type {any} */ ticker) => ({
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

  /**
   * @param {string[]} chunk
   * @param {number} [attempt]
   * @returns {Promise<any[]>}
   */
  async fetchTickerChunk(chunk, attempt = 0) {
    const response = await fetch(`${this.apiUrl}/ticker?markets=${chunk.join(',')}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 429 && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
      return this.fetchTickerChunk(chunk, attempt + 1);
    }
    if (!response.ok) throw new Error(`${this.name} ticker ${response.status}`);
    return response.json();
  }

  // 하위 클래스: 마켓 코드 목록. 실패하면 빈 목록(시작을 나중에 다시 시도한다).
  /** @returns {Promise<string[]>} */
  async fetchMarkets() {
    return [];
  }

  // 업비트·빗썸 공통 구독/파싱
  /** @returns {string[]} */
  getSubscriptions() {
    return [JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }])];
  }

  /**
   * @param {any} message 웹소켓 메시지(JSON)
   * @returns {TickUpdate[]}
   */
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

  /** @returns {string | null} 주기적으로 보낼 핑(없으면 null) */
  getHeartbeatMessage() {
    return null;
  }

  /** @param {ScreenPort} port */
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
    if (this.suspended) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket) this.dropSocket();

    const socket = new WebSocket(/** @type {string} 폴링 거래소는 이 메서드를 덮어쓴다 */ (this.wsUrl));
    this.socket = socket;

    socket.onopen = () => {
      this.lastMessageAt = Date.now();
      this.isReconnecting = false;
      this.currentReconnectDelay = this.initialReconnectDelay;
      this.getSubscriptions().forEach((subscription, index) =>
        setTimeout(() => socket.readyState === WebSocket.OPEN && socket.send(subscription), index * this.subscribeGap),
      );

      const heartbeat = this.getHeartbeatMessage();
      clearInterval(this.heartbeatId);
      if (heartbeat) {
        this.heartbeatId = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(heartbeat);
        }, HEARTBEAT_INTERVAL);
      }
    };

    socket.onmessage = async event => {
      this.lastMessageAt = Date.now();
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        if (data === 'pong') return;

        this.applyUpdates(this.parseMessage(JSON.parse(data)));
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

  // 실시간 갱신(웹소켓·폴링)을 전 거래소 시세에 반영하고, 알림을 확인하고, 팝업에 보낸다.
  /** @param {TickUpdate[]} updates */
  applyUpdates(updates) {
    if (!updates.length) return;
    const store = allExchangesTickers[this.name];
    for (const { key, tick, price, changeRate, volume } of updates) {
      store[key] = { ...store[key], exchange: this.name, market: key, currentPrice: price, changeRate };
      if (volume) store[key].volume = volume;
      checkPriceAlerts(this.name, key, price);
      this.mergeTicker(key, tick);
    }
    if (this.isPopupActive && this.port) this.forwardTicks(updates);
  }

  // 팝업을 다시 열 때 보내는 스냅샷이 최초 REST 응답에 머물지 않도록 웹소켓 갱신분을 병합한다.
  /**
   * @param {string} key
   * @param {any} data
   */
  mergeTicker(key, data) {
    const current = this.tickers?.[key];
    if (current) Object.assign(current, data);
  }

  // 소켓을 이벤트 없이 닫는다. 닫힘 이벤트로 재연결이 또 걸리지 않게 핸들러를 먼저 뗀다.
  dropSocket() {
    const socket = this.socket;
    this.socket = null;
    clearInterval(this.heartbeatId);
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    try {
      socket.close();
    } catch {
      // 이미 닫힌 소켓
    }
  }

  // 절전·네트워크 변경 뒤 반쯤 끊긴 연결은 onclose가 오지 않아 시세와 알림이 조용히 멈춘다.
  checkStale() {
    if (this.suspended || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMessageAt < STALE_SOCKET_MS) return;
    this.dropSocket();
    this.reconnectWebSocket();
  }

  reconnectWebSocket() {
    if (this.isReconnecting || this.suspended) {
      return;
    }

    this.isReconnecting = true;
    // 네트워크가 돌아올 때 여러 거래소가 한꺼번에 다시 붙지 않도록 지연을 조금씩 흩뜨린다.
    const delay = this.currentReconnectDelay * (0.8 + Math.random() * 0.4);

    setTimeout(() => {
      if (this.suspended) {
        this.isReconnecting = false;
        return;
      }
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
    if (this.suspended) return;
    clearTimeout(this.startTimer);
    this.locked = !(await deps.hasExchangePermission(this.name));
    if (this.locked) return;
    const markets = await this.fetchMarkets();
    if (!markets.length) {
      // 처음에 한 번 실패했다고 이 거래소가 세션 내내 비어 있지 않게 다시 시도한다.
      this.startTimer = setTimeout(() => this.start().catch(console.warn), this.startRetryDelay);
      this.startRetryDelay = Math.min(this.startRetryDelay * 2, START_RETRY_MAX_MS);
      return;
    }
    this.startRetryDelay = START_RETRY_MIN_MS;
    this.markets = markets;
    await this.fetchInitialTickers();
    this.started = true;
    this.connectWebSocket();
  }

  // 신규 상장 종목도 시세·지정가 알림을 받도록 마켓 목록을 주기적으로 다시 받는다. 바뀌었으면 스냅샷과 구독을 새로 한다.
  async refreshMarkets() {
    if (this.suspended || !this.started) return;
    const markets = await this.fetchMarkets();
    if (!markets.length) return;
    const known = new Set(this.markets);
    if (markets.length === this.markets.length && markets.every(market => known.has(market))) {
      this.initialList = null;
      return;
    }
    this.markets = markets;
    await this.fetchInitialTickers();
    if (this.socket) {
      this.dropSocket();
      this.connectWebSocket();
    }
  }

  // 화면이 닫혀 있고 배지·알림에도 쓰지 않는 거래소는 연결을 끊어 배터리와 데이터를 아낀다.
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    clearTimeout(this.startTimer);
    this.dropSocket();
  }

  async resume() {
    if (!this.suspended) return;
    this.suspended = false;
    if (!this.started) {
      await this.start();
      return;
    }
    // 끊겨 있던 동안 바뀐 시세를 REST로 다시 받고 연결한다.
    const markets = await this.fetchMarkets();
    if (this.suspended) return;
    if (markets.length) this.markets = markets;
    await this.fetchInitialTickers();
    this.connectWebSocket();
  }

  /** @param {boolean} active */
  setPopupActive(active) {
    this.isPopupActive = active;
    if (this.port && this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }
}

// 해외 거래소 응답을 setSnapshot·applyUpdates가 받는 형태로 바꾼다(필드 변환은 lib/globalTicks.js).
/** @typedef {{ last: any, open: any, high: any, low: any, quoteVolume: any }} GlobalFields */
/**
 * @param {string} symbol
 * @param {GlobalFields} fields
 * @returns {SnapshotEntry}
 */
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

/**
 * @param {ExchangeData} exchange
 * @param {string} symbol
 * @param {GlobalFields} fields
 * @returns {TickUpdate}
 */
const globalUpdate = (exchange, symbol, fields) => {
  const tick = toGlobalTick(symbol, fields, exchange.tickers?.[symbol]);
  return { key: symbol, tick, price: Number(tick.c), changeRate: Number(tick.P), volume: Number(tick.q) || undefined };
};

const GLOBAL_QUOTES = ['USDT', 'BTC'];
const hasGlobalQuote = /** @param {string} symbol */ symbol => GLOBAL_QUOTES.some(quote => symbol.endsWith(quote));

//  거래소별 클래스
export class UpbitData extends ExchangeData {
  constructor() {
    super('upbit', 'https://api.upbit.com/v1', 'wss://api.upbit.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const tickers = /** @type {any[]} */ (await response.json());
      this.marketsInfo = tickers.reduce((/** @type {any} */ acc, /** @type {any} */ ticker) => {
        // 팝업은 caution을 참·거짓으로 읽는다. 어떤 사유인지는 cautionReasons로 따로 넘겨 아이콘에 보여 준다.
        const reasons = Object.entries(ticker.market_event?.caution ?? {})
          .filter(([, value]) => value === true)
          .map(([reason]) => reason);
        acc[ticker.market] = {
          ...ticker,
          market_event: { ...ticker.market_event, caution: reasons.length > 0, cautionReasons: reasons },
        };
        return acc;
      }, {});
      resolveKrwNames();
      return tickers.map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }
}

export class BithumbData extends ExchangeData {
  constructor() {
    super('bithumb', 'https://api.bithumb.com/v1', 'wss://ws-api.bithumb.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const data = await response.json();
      this.marketsInfo = Object.fromEntries(data.map((/** @type {any} */ ticker) => [ticker.market, { ...ticker }]));
      resolveKrwNames();
      return /** @type {any[]} */ (data).map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }
}

export class BinanceData extends ExchangeData {
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
      const tickersArray = /** @type {any[]} */ (await response.json());
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

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (!Array.isArray(message)) return [];
    return message.map(t => globalUpdate(this, t.s, { last: t.c, open: t.o, high: t.h, low: t.l, quoteVolume: t.q }));
  }
}

export class BybitData extends ExchangeData {
  constructor() {
    super('bybit', 'https://api.bybit.com/v5', 'wss://stream.bybit.com/v5/public/spot', { isGlobal: true });
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
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
      this.initialList = /** @type {any[]} */ (result.list).filter(t => hasGlobalQuote(t.symbol) && Number(t.lastPrice) > 0);
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

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    const t = message?.data;
    if (!message?.topic?.startsWith('tickers.') || !t?.symbol) return [];
    return [globalUpdate(this, t.symbol, BybitData.fields(t))];
  }
}

export class OkxData extends ExchangeData {
  constructor() {
    super('okx', 'https://www.okx.com/api/v5', 'wss://ws.okx.com:8443/ws/v5/public', { isGlobal: true });
    // 팝업·알림에서는 BTCUSDT 형태를 쓰고, OKX API에는 BTC-USDT 형태를 쓴다.
    /** @type {Record<string, string>} BTCUSDT → BTC-USDT */
    this.instIds = {};
  }

  /** @param {string} instId */
  static symbol(instId) {
    return instId.replace('-', '');
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
  static fields(t) {
    return { last: t.last, open: t.open24h, high: t.high24h, low: t.low24h, quoteVolume: t.volCcy24h };
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/tickers?instType=SPOT`);
      const { data } = await response.json();
      this.initialList = /** @type {any[]} */ (data).filter(
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

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (message?.arg?.channel !== 'tickers' || !Array.isArray(message.data)) return [];
    return message.data.map((/** @type {any} */ t) => globalUpdate(this, OkxData.symbol(t.instId), OkxData.fields(t)));
  }
}

export class CoinbaseData extends ExchangeData {
  constructor() {
    super('coinbase', 'https://api.exchange.coinbase.com', 'wss://ws-feed.exchange.coinbase.com', { isGlobal: true });
    // 팝업·알림에서는 BTCUSD 형태를 쓰고, Coinbase API에는 BTC-USD 형태를 쓴다.
    /** @type {Record<string, string>} BTCUSD → BTC-USD */
    this.productIds = {};
  }

  /** @param {string} productId */
  static symbol(productId) {
    return productId.replace('-', '');
  }

  // Coinbase는 거래량을 기준 코인 수량으로 주므로 가격을 곱해 USD 거래대금으로 맞춘다.
  /**
   * @param {any} t
   * @param {any} [last]
   */
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
      this.initialList = /** @type {any[]} */ (products)
        .filter((/** @type {any} */ p) => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled)
        .map((/** @type {any} */ p) => ({ id: p.id, stats: stats[p.id]?.stats_24hour }))
        .filter((/** @type {any} */ p) => Number(p.stats?.last) > 0);
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

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (message?.type !== 'ticker' || !message.product_id) return [];
    return [globalUpdate(this, CoinbaseData.symbol(message.product_id), CoinbaseData.fields(message, message.price))];
  }
}

// Bitget: 현물 3천여 마켓 중 거래대금 상위만 실시간으로 받는다 (연결당 구독 1000개 제한).
const BITGET_MAX_MARKETS = 900;

export class BitgetData extends ExchangeData {
  constructor() {
    super('bitget', 'https://api.bitget.com/api/v2', 'wss://ws.bitget.com/v2/ws/public', { isGlobal: true });
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
  static fields(t) {
    return { last: t.lastPr, open: t.open ?? t.open24h, high: t.high24h, low: t.low24h, quoteVolume: t.quoteVolume };
  }

  async fetchMarkets() {
    try {
      const { data } = await fetchJson(`${this.apiUrl}/spot/market/tickers`);
      this.initialList = /** @type {any[]} */ (data)
        .filter((/** @type {any} */ t) => hasGlobalQuote(t.symbol) && Number(t.lastPr) > 0)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.usdtVolume) - Number(a.usdtVolume))
        .slice(0, BITGET_MAX_MARKETS);
      return this.initialList.map(t => t.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.symbol, BitgetData.fields(t))));
    this.initialList = null;
  }

  getSubscriptions() {
    const messages = [];
    for (let i = 0; i < this.markets.length; i += 50) {
      const args = this.markets.slice(i, i + 50).map(instId => ({ instType: 'SPOT', channel: 'ticker', instId }));
      messages.push(JSON.stringify({ op: 'subscribe', args }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return 'ping';
  }

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (message?.arg?.channel !== 'ticker' || !Array.isArray(message.data)) return [];
    return message.data.map((/** @type {any} */ t) => globalUpdate(this, t.instId, BitgetData.fields(t)));
  }
}

// Kraken: USD 마켓. REST 이름(XBT)과 웹소켓 이름(BTC)이 달라 BTC 기준 심볼(BTCUSD)로 맞춘다.
// EUR/USD 같은 외환 페어와 스테이블코인 페어는 코인 시세가 아니므로 뺀다.
const NON_CRYPTO_BASES = new Set(['EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'USDT', 'USDC', 'DAI', 'PYUSD', 'TUSD', 'USDS', 'USDG', 'RLUSD', 'EURT', 'EURQ', 'EURR', 'USDQ', 'USDR']);
export class KrakenData extends ExchangeData {
  constructor() {
    super('kraken', 'https://api.kraken.com/0/public', 'wss://ws.kraken.com/v2', { isGlobal: true });
    /** @type {Record<string, string>} BTCUSD → BTC/USD */
    this.wsSymbols = {};
  }

  /** @param {string} wsname */
  static symbol(wsname) {
    const [base, quote] = wsname.split('/');
    return `${base === 'XBT' ? 'BTC' : base === 'XDG' ? 'DOGE' : base}${quote}`;
  }

  async fetchMarkets() {
    try {
      const [pairs, tickers] = await Promise.all([
        fetchJson(`${this.apiUrl}/AssetPairs`),
        fetchJson(`${this.apiUrl}/Ticker`),
      ]);
      this.initialList = Object.entries(pairs.result)
        .filter(
          ([, pair]) =>
            pair.wsname?.endsWith('/USD') && pair.status === 'online' && !NON_CRYPTO_BASES.has(pair.wsname.split('/')[0]),
        )
        .map(([key, pair]) => ({ symbol: KrakenData.symbol(pair.wsname), wsname: pair.wsname, ticker: tickers.result[key] }))
        .filter(item => Number(item.ticker?.c?.[0]) > 0);
      // 웹소켓 v2는 XBT 대신 BTC처럼 표준 코드를 쓴다.
      this.wsSymbols = Object.fromEntries(
        this.initialList.map(({ symbol, wsname }) => [symbol, wsname.replace(/^XBT\//, 'BTC/').replace(/^XDG\//, 'DOGE/')]),
      );
      return this.initialList.map(item => item.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(({ symbol, ticker }) =>
        globalEntry(symbol, {
          last: ticker.c[0],
          open: ticker.o,
          high: ticker.h[1],
          low: ticker.l[1],
          quoteVolume: Number(ticker.v[1]) * Number(ticker.p[1]),
        }),
      ),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    const symbols = Object.values(this.wsSymbols);
    const messages = [];
    for (let i = 0; i < symbols.length; i += TICKER_CHUNK_SIZE) {
      messages.push(
        JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: symbols.slice(i, i + TICKER_CHUNK_SIZE) } }),
      );
    }
    return messages;
  }

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (message?.channel !== 'ticker' || !Array.isArray(message.data)) return [];
    return message.data.map((/** @type {any} */ t) =>
      globalUpdate(this, KrakenData.symbol(t.symbol), {
        last: t.last,
        open: t.last - t.change,
        high: t.high,
        low: t.low,
        quoteVolume: Number(t.volume) * Number(t.vwap ?? t.last),
      }),
    );
  }
}

// 웹소켓을 쓸 수 없는 거래소는 REST 전체 시세를 주기적으로 받는다.
// 팝업·미니 창에서 보고 있을 때만 자주(3초) 받고, 아니면 알림·포트폴리오용으로 1분마다 받는다.
const POLL_ACTIVE_INTERVAL = 3000;
const POLL_IDLE_INTERVAL = 60_000;

export class PollingExchangeData extends ExchangeData {
  /** @param {ConstructorParameters<typeof ExchangeData>} args */
  constructor(...args) {
    super(...args);
    /** @type {Timer | undefined} */
    this.pollTimer = undefined;
  }

  // 하위 클래스: applyUpdates가 받는 갱신 목록을 돌려준다.
  /** @returns {Promise<TickUpdate[]>} */
  async fetchUpdates() {
    return [];
  }

  async poll() {
    if (this.suspended) return;
    try {
      this.applyUpdates(await this.fetchUpdates());
    } catch (error) {
      console.warn(error);
    }
    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.poll(), this.pollInterval());
  }

  pollInterval() {
    const watched = (this.isPopupActive && this.port) || deps.isWatchedByMini(this.name);
    return watched ? POLL_ACTIVE_INTERVAL : POLL_IDLE_INTERVAL;
  }

  // 시작이 끝나기 전에 화면이 이 거래소를 골랐을 수도 있어, 첫 주기도 보고 있는지에 맞춘다.
  connectWebSocket() {
    if (this.suspended) return;
    if (!this.pollTimer) this.pollTimer = setTimeout(() => this.poll(), this.pollInterval());
  }

  suspend() {
    super.suspend();
    clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  // 팝업에서 이 거래소를 열면 바로 빠른 주기로 바꾼다.
  /** @param {boolean} active */
  setPopupActive(active) {
    super.setPopupActive(active);
    if (active && this.pollTimer) this.poll();
  }

  /** @param {ScreenPort} port */
  connectPopup(port) {
    super.connectPopup(port);
    if (this.isPopupActive && this.pollTimer) this.poll();
  }
}

// CoinDCX: 인도 1위 거래소. 공개 웹소켓이 socket.io라 폴링한다.
export class CoindcxData extends PollingExchangeData {
  constructor() {
    super('coindcx', 'https://api.coindcx.com/exchange', null, { isGlobal: true });
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
  static fields(t) {
    const last = Number(t.last_price);
    const changeRate = Number(t.change_24_hour) || 0;
    return {
      last,
      open: last / (1 + changeRate / 100),
      high: t.high,
      low: t.low,
      // volume은 호가 통화(INR·USDT) 기준 거래대금이다.
      quoteVolume: t.volume,
    };
  }

  /** @returns {Promise<any[]>} */
  async fetchTickers() {
    const tickers = await fetchJson(`${this.apiUrl}/ticker`);
    return tickers.filter((/** @type {any} */ t) => /(INR|USDT)$/.test(t.market) && Number(t.last_price) > 0);
  }

  async fetchMarkets() {
    try {
      this.initialList = await this.fetchTickers();
      return this.initialList.map(t => t.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.market, CoindcxData.fields(t))));
    this.initialList = null;
  }

  async fetchUpdates() {
    return (await this.fetchTickers()).map((/** @type {any} */ t) => globalUpdate(this, t.market, CoindcxData.fields(t)));
  }
}

// 코인원·디지털엑스(옛 코빗): 업비트와 같은 모양(KRW-BTC, trade_price 등)으로 바꿔 보내 팝업이 원화 거래소 표를 그대로 쓴다.
// 두 거래소 API는 코인 이름을 영문으로만 주므로, 업비트·빗썸 마켓 정보에서 한글 이름을 빌려 온다.
/** @type {(value?: unknown) => void} */
let resolveKrwNames = () => {};
const krwNamesReady = new Promise(resolve => {
  resolveKrwNames = resolve;
  setTimeout(resolve, 10_000);
});

/** @param {string} coin */
const krwNameOf = coin => {
  const market = `KRW-${coin}`;
  const info = deps.exchanges.upbit.marketsInfo[market] ?? deps.exchanges.bithumb.marketsInfo[market];
  return { korean_name: info?.korean_name ?? coin, english_name: info?.english_name ?? coin };
};

// base: 등락 기준가(코인원은 24시간 전 가격, 디지털엑스는 전일 종가)
/** @typedef {{ price: number, base: number, high: number, low: number, volume: number, timestamp: number }} KrwFields */
/**
 * @param {string} coin
 * @param {KrwFields} fields
 */
const toKrwTicker = (coin, { price, base, high, low, volume, timestamp }) => {
  const change = base ? price - base : 0;
  return {
    market: `KRW-${coin}`,
    code: `KRW-${coin}`,
    trade_price: price,
    prev_closing_price: base,
    high_price: high,
    low_price: low,
    signed_change_price: change,
    signed_change_rate: base ? change / base : 0,
    change: change > 0 ? 'RISE' : change < 0 ? 'FALL' : 'EVEN',
    acc_trade_price_24h: volume,
    timestamp,
  };
};

/**
 * @param {ExchangeData} exchange
 * @param {string} coin
 * @param {KrwFields} fields
 * @returns {SnapshotEntry}
 */
const krwEntry = (exchange, coin, fields) => {
  const ticker = { ...toKrwTicker(coin, fields), ...exchange.marketsInfo[`KRW-${coin}`] };
  return {
    key: ticker.market,
    ticker,
    price: ticker.trade_price,
    changeRate: ticker.signed_change_rate * 100,
    volume: ticker.acc_trade_price_24h,
    koreanName: ticker.korean_name ?? null,
  };
};

/**
 * @param {string} coin
 * @param {KrwFields} fields
 * @returns {TickUpdate}
 */
const krwUpdate = (coin, fields) => {
  const tick = toKrwTicker(coin, fields);
  return {
    key: tick.market,
    tick,
    price: tick.trade_price,
    changeRate: tick.signed_change_rate * 100,
    volume: tick.acc_trade_price_24h || undefined,
  };
};

/**
 * @param {ExchangeData} exchange
 * @param {string[]} coins
 */
async function loadKrwNames(exchange, coins) {
  await krwNamesReady;
  exchange.marketsInfo = Object.fromEntries(coins.map(coin => [`KRW-${coin}`, { market: `KRW-${coin}`, ...krwNameOf(coin) }]));
}

export class CoinoneData extends ExchangeData {
  constructor() {
    super('coinone', 'https://api.coinone.co.kr/public/v2', 'wss://stream.coinone.co.kr');
    // 코인마다 구독 메시지를 하나씩 보내야 해서(약 360개) 간격을 짧게 둔다.
    this.subscribeGap = 10;
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
  static fields(t) {
    return {
      price: Number(t.last),
      base: Number(t.first),
      high: Number(t.high),
      low: Number(t.low),
      volume: Number(t.quote_volume),
      timestamp: Number(t.timestamp),
    };
  }

  async fetchMarkets() {
    try {
      const { markets } = await fetchJson(`${this.apiUrl}/markets/KRW`);
      /** @type {string[]} */
      const coins = markets.filter((/** @type {any} */ m) => m.trade_status === 1 && !m.maintenance_status).map((/** @type {any} */ m) => m.target_currency);
      await loadKrwNames(this, coins);
      return coins.map(coin => `KRW-${coin}`);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    try {
      const { tickers } = await fetchJson(`${this.apiUrl}/ticker_new/KRW`);
      const listed = new Set(this.markets);
      this.setSnapshot(
        tickers
          .filter((/** @type {any} */ t) => listed.has(`KRW-${t.target_currency.toUpperCase()}`))
          .map((/** @type {any} */ t) => krwEntry(this, t.target_currency.toUpperCase(), CoinoneData.fields(t))),
      );
    } catch (error) {
      console.warn(error);
    }
  }

  getSubscriptions() {
    return this.markets.map(market =>
      JSON.stringify({
        request_type: 'SUBSCRIBE',
        channel: 'TICKER',
        topic: { quote_currency: 'KRW', target_currency: market.slice(4) },
      }),
    );
  }

  // 30분 동안 아무것도 보내지 않으면 코인원이 연결을 끊는다.
  getHeartbeatMessage() {
    return JSON.stringify({ request_type: 'PING' });
  }

  /**
   * @param {any} message
   * @returns {TickUpdate[]}
   */
  parseMessage(message) {
    if (message?.response_type !== 'DATA' || message.channel !== 'TICKER') return [];
    const t = message.data;
    return [krwUpdate(t.target_currency.toUpperCase(), CoinoneData.fields(t))];
  }
}

// 디지털엑스 웹소켓은 자기 사이트에서 연 연결만 받아(Origin 확인) 확장에서는 쓸 수 없다. 전체 시세 REST를 폴링한다.
export class DigitalxData extends PollingExchangeData {
  constructor() {
    super('digitalx', 'https://api.digitalx.miraeasset.com/v2', null);
  }

  /** @param {any} t 거래소 시세 응답 한 건 */
  static fields(t) {
    return {
      price: Number(t.close),
      base: Number(t.prevClose),
      high: Number(t.high),
      low: Number(t.low),
      volume: Number(t.quoteVolume),
      timestamp: Number(t.lastTradedAt),
    };
  }

  // btc_krw → BTC
  /** @param {string} symbol */
  static coinOf(symbol) {
    return symbol.split('_')[0].toUpperCase();
  }

  async fetchMarkets() {
    try {
      const { data } = await fetchJson(`${this.apiUrl}/currencyPairs`);
      /** @type {string[]} */
      const coins = data.filter((/** @type {any} */ p) => p.status === 'launched' && p.quoteCurrency === 'krw').map((/** @type {any} */ p) => DigitalxData.coinOf(p.symbol));
      await loadKrwNames(this, coins);
      return coins.map(coin => `KRW-${coin}`);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchListedTickers() {
    const { data } = await fetchJson(`${this.apiUrl}/tickers`);
    const listed = new Set(this.markets);
    return data.filter((/** @type {any} */ t) => listed.has(`KRW-${DigitalxData.coinOf(t.symbol)}`));
  }

  async fetchInitialTickers() {
    try {
      this.setSnapshot(
        (await this.fetchListedTickers()).map((/** @type {any} */ t) => krwEntry(this, DigitalxData.coinOf(t.symbol), DigitalxData.fields(t))),
      );
    } catch (error) {
      console.warn(error);
    }
  }

  // 3초마다 전체를 받으므로, 가격·거래대금이 바뀐 종목만 팝업에 보낸다.
  async fetchUpdates() {
    const store = allExchangesTickers[this.name];
    return (await this.fetchListedTickers())
      .map((/** @type {any} */ t) => krwUpdate(DigitalxData.coinOf(t.symbol), DigitalxData.fields(t)))
      .filter((/** @type {TickUpdate} */ { key, price, volume }) => store[key]?.currentPrice !== price || store[key]?.volume !== volume);
  }
}
