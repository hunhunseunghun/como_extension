// @ts-check
// 툴바 배지에 무엇을 보일지 정한다(순수 함수).

const QUOTES = ['USDT', 'USD', 'INR', 'BTC'];

/**
 * 마켓 코드에서 코인 기호만 뽑는다. KRW-BTC → BTC, BTCUSDT → BTC
 * @param {string} market
 */
export function coinOf(market) {
  if (market.includes('-')) return market.split('-')[1];
  const quote = QUOTES.find(q => market.endsWith(q) && market.length > q.length);
  return quote ? market.slice(0, -quote.length) : market;
}

// 번갈아 표시할 때 한 코인에 머무는 칸 수(배지는 2초마다 갱신): 이름 1칸 → 가격 2칸
export const ROTATE_TICKS = 3;

/**
 * 배지에 보일 마켓과, 지금이 코인 이름을 보일 차례인지.
 * 번갈아 표시는 배지 코인 다음에 같은 거래소의 즐겨찾기를 차례로 보여 준다. 가격이 없는 마켓은 건너뛴다.
 * @param {{ market: string, favorites?: string[], rotate?: boolean, hasPrice: (market: string) => boolean, tick: number }} options
 * @returns {{ market: string, showSymbol: boolean } | null}
 */
export function pickBadgeFrame({ market, favorites = [], rotate = false, hasPrice, tick }) {
  const markets = rotate ? [...new Set([market, ...favorites])].filter(hasPrice) : [market].filter(hasPrice);
  if (!markets.length) return null;
  if (markets.length === 1) return { market: markets[0], showSymbol: false };
  const slot = Math.floor(tick / ROTATE_TICKS) % markets.length;
  return { market: markets[slot], showSymbol: tick % ROTATE_TICKS === 0 };
}
