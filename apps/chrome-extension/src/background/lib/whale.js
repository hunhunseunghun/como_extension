// @ts-check
// 대량 체결(순수 함수): 업비트·바이낸스 체결 메시지를 { market, price, quantity, amount, side, time }로 바꾼다.
// side: 'buy'는 매수 주문이 시장가로 받아 간 체결(가격을 올리는 쪽), 'sell'은 그 반대.

/** @typedef {{ exchange: string, market: string, price: number, quantity: number, amount: number, side: 'buy' | 'sell', time: number }} WhaleTrade */

/**
 * 업비트 웹소켓 trade 메시지(SIMPLE이 아닌 기본 형식)
 * @param {any} message
 * @returns {WhaleTrade | null}
 */
export function parseUpbitTrade(message) {
  if (message?.type !== 'trade') return null;
  const price = Number(message.trade_price);
  const quantity = Number(message.trade_volume);
  if (!(price > 0) || !(quantity > 0)) return null;
  return {
    exchange: 'upbit',
    market: message.code,
    price,
    quantity,
    amount: price * quantity,
    side: message.ask_bid === 'BID' ? 'buy' : 'sell',
    time: Number(message.trade_timestamp) || Date.now(),
  };
}

/**
 * 바이낸스 결합 스트림의 aggTrade 메시지 ({ stream, data })
 * @param {any} message
 * @returns {WhaleTrade | null}
 */
export function parseBinanceAggTrade(message) {
  const data = message?.data ?? message;
  if (data?.e !== 'aggTrade') return null;
  const price = Number(data.p);
  const quantity = Number(data.q);
  if (!(price > 0) || !(quantity > 0)) return null;
  return {
    exchange: 'binance',
    market: data.s,
    price,
    quantity,
    amount: price * quantity,
    // 매수자가 메이커면 매도 주문이 시장가로 들어온 것이다.
    side: data.m ? 'sell' : 'buy',
    time: Number(data.T) || Date.now(),
  };
}

/**
 * 규칙에 맞는 체결인지. 같은 규칙은 throttleMs 안에 한 번만 알린다.
 * @param {{ exchange: string, market: string, minAmount: number, direction?: 'up' | 'down' | 'both' }} rule
 * @param {WhaleTrade} trade
 * @param {number | undefined} lastAt
 * @param {number} [throttleMs]
 */
export function matchesWhaleRule(rule, trade, lastAt, throttleMs = 30_000) {
  if (rule.exchange !== trade.exchange || rule.market !== trade.market || trade.amount < rule.minAmount) return false;
  const direction = rule.direction ?? 'both';
  if ((direction === 'up' && trade.side !== 'buy') || (direction === 'down' && trade.side !== 'sell')) return false;
  return !lastAt || trade.time - lastAt >= throttleMs;
}
