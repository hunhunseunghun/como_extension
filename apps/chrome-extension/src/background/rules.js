// @ts-check
// 알림 규칙(24시간 변동률·김프·단기 급등락·OI)과 대량 체결(고래) 스트림. index.js에서 나눔. 타이머·리스너는 import될 때 건다.
import { formatBadgePrice, formatPercent } from './lib/format.js';
import { addSample, evaluateSurge } from './lib/surge.js';
import { matchesWhaleRule, parseBinanceAggTrade, parseUpbitTrade } from './lib/whale.js';
import { alertText } from './lib/texts.js';
import { allExchangesTickers, openInterest, refreshCurrentDate, today } from './state.js';
import { createNotification, getLanguage } from './notify.js';
import { computeKimchiPremium } from './premium.js';

// 변동률·김프 알림 규칙. 지정가 알림과 따로 저장하고, 백그라운드가 받는 전 거래소 시세로 10초마다 확인한다.
//   change: { id, type: 'change', exchange, market, threshold }  24시간 등락률 절댓값이 threshold(%) 이상이면 하루 한 번
//   kimchi: { id, type: 'kimchi', exchange: 'upbit'|'bithumb', coin, above?, below? }  김프가 기준을 넘으면 한 번, 0.3%p 되돌아오면 다시 무장
/**
 * 저장된 알림 규칙. type마다 쓰는 필드가 다르다(위 설명, 고래·OI는 아래).
 * @typedef {{ id: string, type: 'change' | 'kimchi' | 'oi' | 'whale', exchange: string, market: string, symbol: string, coin: string,
 *   threshold: number, window?: number, direction?: 'up' | 'down' | 'both', above?: number, below?: number, minAmount: number }} AlertRule
 */
/** @typedef {{ firedAt?: number, firedOn?: string, aboveFired?: boolean, belowFired?: boolean }} RuleState */
/** @typedef {import('./lib/whale.js').WhaleTrade} WhaleTrade */
export const RULES_KEY = 'alertRules';
const RULE_STATE_KEY = 'alertRuleState';
const KIMCHI_REARM_GAP = 0.3;
/** @type {Record<string, { change: string, kimchiAbove: string, kimchiBelow: string }>} */
const RULE_TEXT = {
  ko: { change: '24시간 변동', kimchiAbove: '김프 상단 도달', kimchiBelow: '김프 하단 도달' },
  en: { change: '24h move', kimchiAbove: 'Kimchi premium above', kimchiBelow: 'Kimchi premium below' },
  es: { change: 'Movimiento 24 h', kimchiAbove: 'Prima kimchi por encima', kimchiBelow: 'Prima kimchi por debajo' },
  pt: { change: 'Variação 24 h', kimchiAbove: 'Prêmio kimchi acima', kimchiBelow: 'Prêmio kimchi abaixo' },
  vi: { change: 'Biến động 24h', kimchiAbove: 'Kimchi premium vượt trên', kimchiBelow: 'Kimchi premium xuống dưới' },
  tr: { change: '24s hareket', kimchiAbove: 'Kimchi primi üstünde', kimchiBelow: 'Kimchi primi altında' },
  id: { change: 'Pergerakan 24 jam', kimchiAbove: 'Kimchi premium di atas', kimchiBelow: 'Kimchi premium di bawah' },
  ja: { change: '24時間変動', kimchiAbove: 'キムチプレミアム上限到達', kimchiBelow: 'キムチプレミアム下限到達' },
  zh: { change: '24小时涨跌', kimchiAbove: '泡菜溢价达到上限', kimchiBelow: '泡菜溢价达到下限' },
  hi: { change: '24 घंटे की चाल', kimchiAbove: 'किमची प्रीमियम ऊपर', kimchiBelow: 'किमची प्रीमियम नीचे' },
};
/** @type {{ rules: AlertRule[], state: Record<string, RuleState> }} */
export const ruleCache = { rules: [], state: {} };
// 단기 급등락 규칙의 최근 가격 표본(거래소:마켓 → [{ t, p }]). 서비스 워커가 다시 시작되면 처음부터 쌓는다.
/** @type {Map<string, import('./lib/surge.js').Sample[]>} */
const surgeSamples = new Map();
export const rulesReady = chrome.storage.local.get([RULES_KEY, RULE_STATE_KEY]).then(result => {
  ruleCache.rules = result[RULES_KEY] || [];
  ruleCache.state = result[RULE_STATE_KEY] || {};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[RULES_KEY]) ruleCache.rules = changes[RULES_KEY].newValue || [];
  if (changes[RULE_STATE_KEY]) ruleCache.state = changes[RULE_STATE_KEY].newValue || {};
});

function checkAlertRules() {
  if (!ruleCache.rules.length) {
    surgeSamples.clear();
    return;
  }
  refreshCurrentDate();
  const text = RULE_TEXT[getLanguage()] ?? RULE_TEXT.en;
  // 지운 규칙의 상태는 남기지 않는다.
  const ruleIds = new Set(ruleCache.rules.map(rule => rule.id));
  const state = Object.fromEntries(Object.entries(ruleCache.state).filter(([id]) => ruleIds.has(id)));
  let changed = Object.keys(state).length !== Object.keys(ruleCache.state).length;
  /** @type {Record<string, { premium: number | null }> | null} */
  let kimchi = null;
  /**
   * @param {string} id
   * @param {string} exchange
   * @param {string} market
   * @param {string} title
   * @param {string} message
   */
  const notify = (id, exchange, market, title, message) => {
    createNotification(`${exchange}:${market}:rule-${id}`, { type: 'basic', iconUrl: 'como-logo.png', title, message });
    chrome.storage.local.set({ alertFiredAt: Date.now() });
  };

  const now = Date.now();
  const sampled = new Set();
  for (const rule of ruleCache.rules) {
    /** @type {RuleState} */
    const current = { ...state[rule.id] };
    if (rule.type === 'change' && rule.window) {
      // 단기 급등락: 10초마다 가격을 쌓아 창 안의 최저·최고가와 비교한다.
      const key = `${rule.exchange}:${rule.market}`;
      const price = allExchangesTickers[rule.exchange]?.[rule.market]?.currentPrice;
      if (!surgeSamples.has(key)) surgeSamples.set(key, []);
      const samples = /** @type {import('./lib/surge.js').Sample[]} */ (surgeSamples.get(key));
      if (!sampled.has(key)) addSample(samples, now, price);
      sampled.add(key);
      const move = evaluateSurge({ ...rule, window: rule.window }, samples, now, current.firedAt);
      if (move != null) {
        const label = alertText(getLanguage(), move >= 0 ? 'surgeUp' : 'surgeDown', { n: rule.window });
        notify(rule.id, rule.exchange, rule.market, `${rule.market} ${formatPercent(move)} · ${rule.exchange.toUpperCase()}`, `${label} ≥ ${rule.threshold}%`);
        current.firedAt = now;
      }
    } else if (rule.type === 'oi') {
      // 미결제약정: 5분마다 받는 1시간 변화율이 기준을 넘으면 알리고 1시간 쉰다.
      const item = openInterest.get(rule.symbol);
      if (item?.change1h == null || (current.firedAt && now - current.firedAt < 60 * 60_000)) continue;
      if (Math.abs(item.change1h) < rule.threshold) continue;
      createNotification(`binance:${rule.symbol}:rule-${rule.id}`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${rule.symbol.replace(/USDT$/, '')} OI ${formatPercent(item.change1h)} · BINANCE`,
        message: `${alertText(getLanguage(), 'oiChange', { v: formatPercent(item.change1h) })} (≥ ${rule.threshold}%)`,
      });
      chrome.storage.local.set({ alertFiredAt: now });
      current.firedAt = now;
    } else if (rule.type === 'change') {
      const ticker = allExchangesTickers[rule.exchange]?.[rule.market];
      if (!ticker?.currentPrice || current.firedOn === today.date) continue;
      const rate = ticker.changeRate ?? 0;
      if (Math.abs(rate) < rule.threshold) continue;
      notify(rule.id, rule.exchange, rule.market, `${rule.market} ${formatPercent(rate)} · ${rule.exchange.toUpperCase()}`, `${text.change} ≥ ${rule.threshold}%`);
      current.firedOn = today.date;
    } else if (rule.type === 'kimchi') {
      kimchi ??= computeKimchiPremium().items;
      const market = `KRW-${rule.coin}`;
      const premium = kimchi[`${rule.exchange}:${market}`]?.premium;
      if (premium == null) continue;
      const title = `${rule.coin} ${formatPercent(premium)} · ${rule.exchange.toUpperCase()}`;
      if (rule.above != null) {
        if (current.aboveFired !== true && premium >= rule.above) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiAbove} (${rule.above}%)`);
          current.aboveFired = true;
        } else if (current.aboveFired && premium < rule.above - KIMCHI_REARM_GAP) current.aboveFired = false;
      }
      if (rule.below != null) {
        if (current.belowFired !== true && premium <= rule.below) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiBelow} (${rule.below}%)`);
          current.belowFired = true;
        } else if (current.belowFired && premium > rule.below + KIMCHI_REARM_GAP) current.belowFired = false;
      }
    }
    if (JSON.stringify(current) !== JSON.stringify(state[rule.id] ?? {})) {
      state[rule.id] = current;
      changed = true;
    }
  }
  // 지운 단기 규칙의 표본은 버린다.
  for (const key of surgeSamples.keys()) if (!sampled.has(key)) surgeSamples.delete(key);
  if (changed) {
    ruleCache.state = state;
    chrome.storage.local.set({ [RULE_STATE_KEY]: state });
  }
}
setInterval(checkAlertRules, 10_000);

// 대량 체결(고래) 알림: 'whale' 규칙이 있는 마켓만 업비트·바이낸스 체결 스트림에 따로 연결한다.
// 규칙: { id, type: 'whale', exchange: 'upbit'|'binance', market, minAmount, direction? } (금액은 원화 또는 USDT)
const WHALE_FEED_SIZE = 20;
/** @type {WhaleTrade[]} */
export const whaleFeed = [];
/** @type {Map<string, number>} */
const whaleLastAt = new Map();
/** @type {Record<string, WebSocket | null>} */
const whaleSockets = { upbit: null, binance: null };
let whaleSignature = '';
const whaleRules = () => ruleCache.rules.filter(rule => rule.type === 'whale');

/** @param {WhaleTrade | null} trade */
function onWhaleTrade(trade) {
  if (!trade) return;
  const rules = whaleRules().filter(rule => rule.exchange === trade.exchange && rule.market === trade.market);
  // 화면에 보여 줄 최근 대량 체결: 이 마켓 규칙 중 가장 낮은 기준 이상
  const minimum = Math.min(...rules.map(rule => rule.minAmount));
  if (!(trade.amount >= minimum)) return;
  whaleFeed.unshift(trade);
  if (whaleFeed.length > WHALE_FEED_SIZE) whaleFeed.length = WHALE_FEED_SIZE;
  const language = getLanguage();
  for (const rule of rules) {
    if (!matchesWhaleRule(rule, trade, whaleLastAt.get(rule.id))) continue;
    whaleLastAt.set(rule.id, trade.time);
    const quote = trade.exchange === 'upbit' ? '₩' : '$';
    createNotification(`${trade.exchange}:${trade.market}:rule-${rule.id}-${trade.time}`, {
      type: 'basic',
      iconUrl: 'como-logo.png',
      title: `${trade.market} ${quote}${formatBadgePrice(trade.amount)} · ${trade.exchange.toUpperCase()}`,
      message: `${alertText(language, trade.side === 'buy' ? 'whaleBuy' : 'whaleSell')} @ ${trade.price.toLocaleString('en-US')}`,
    });
    chrome.storage.local.set({ alertFiredAt: Date.now() });
  }
}

/**
 * @param {string} exchange 'upbit' | 'binance'
 * @param {string[]} markets
 */
function openWhaleSocket(exchange, markets) {
  const socket =
    exchange === 'upbit'
      ? new WebSocket('wss://api.upbit.com/websocket/v1')
      : new WebSocket(`wss://stream.binance.com:9443/stream?streams=${markets.map(market => `${market.toLowerCase()}@aggTrade`).join('/')}`);
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let pingTimer;
  socket.onopen = () => {
    if (exchange !== 'upbit') return;
    socket.send(JSON.stringify([{ ticket: `como-whale-${Date.now()}` }, { type: 'trade', codes: markets }]));
    // 업비트는 2분 동안 오가는 데이터가 없으면 끊는다.
    pingTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send('PING'), 60_000);
  };
  socket.onmessage = async event => {
    try {
      let data = event.data;
      if (data instanceof Blob) data = await data.text();
      const message = JSON.parse(data);
      onWhaleTrade(exchange === 'upbit' ? parseUpbitTrade(message) : parseBinanceAggTrade(message));
    } catch {
      // PONG 등 JSON이 아닌 메시지
    }
  };
  socket.onclose = () => {
    clearInterval(pingTimer);
    // 규칙이 그대로면 5초 뒤 다시 잇는다.
    if (whaleSockets[exchange] === socket) {
      whaleSockets[exchange] = null;
      setTimeout(syncWhaleSockets, 5000);
    }
  };
  socket.onerror = () => socket.close();
  return socket;
}

function syncWhaleSockets(force = false) {
  /** @type {Record<string, Set<string>>} */
  const byExchange = { upbit: new Set(), binance: new Set() };
  whaleRules().forEach(rule => byExchange[rule.exchange]?.add(rule.market));
  const signature = JSON.stringify(Object.entries(byExchange).map(([name, set]) => [name, [...set].sort()]));
  if (signature === whaleSignature && !force && Object.entries(byExchange).every(([name, set]) => !set.size || whaleSockets[name])) return;
  whaleSignature = signature;
  for (const [exchange, set] of Object.entries(byExchange)) {
    const previous = whaleSockets[exchange];
    whaleSockets[exchange] = null;
    previous?.close();
    if (set.size) whaleSockets[exchange] = openWhaleSocket(exchange, [...set]);
  }
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[RULES_KEY]) syncWhaleSockets();
});
rulesReady.then(() => syncWhaleSockets());
