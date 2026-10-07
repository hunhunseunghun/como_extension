// 보유 자산 계산기와 2027 과세 미리보기(순수 함수). node --experimental-strip-types로 단위 테스트한다.

// 물타기(추가 매수) 뒤 평균 단가
export const averageAfterBuy = (quantity: number, avgPrice: number, buyPrice: number, buyQuantity: number) => {
  const total = quantity + buyQuantity;
  if (!(total > 0) || !(buyPrice > 0) || buyQuantity < 0) return null;
  return { quantity: total, avgPrice: (quantity * avgPrice + buyQuantity * buyPrice) / total };
};

// 목표 평단을 만들려면 buyPrice에 몇 개를 더 사야 하는지. 목표가 현재 평단과 매수가 사이에 있어야 가능하다.
export const quantityForTargetAverage = (quantity: number, avgPrice: number, buyPrice: number, target: number) => {
  const between = (buyPrice < target && target < avgPrice) || (avgPrice < target && target < buyPrice);
  if (!(quantity > 0) || !between) return null;
  return (quantity * (avgPrice - target)) / (target - buyPrice);
};

// 사고팔 때 각각 수수료(feeRate, 0.0005 = 0.05%)를 낸다고 보고 본전이 되는 매도가
export const breakEvenPrice = (avgPrice: number, feeRate: number) => {
  if (!(avgPrice > 0) || feeRate < 0 || feeRate >= 1) return null;
  return (avgPrice * (1 + feeRate)) / (1 - feeRate);
};

// 지금 팔면 수수료를 뺀 손익
export const netProfit = (quantity: number, avgPrice: number, price: number, feeRate: number) =>
  quantity * price * (1 - feeRate) - quantity * avgPrice * (1 + feeRate);

// 가상자산 과세(2027-01-01 시행): 연 250만 원 기본공제, 지방세 포함 22%.
// 2027년 전에 산 코인은 2026-12-31 시가와 실제 취득가 중 큰 쪽을 취득가로 본다(의제취득가).
export const TAX_DEDUCTION_KRW = 2_500_000;
export const TAX_RATE = 0.22;
export const TAX_BASELINE_DATE = '2026-12-31';

export type TaxHolding = { quantity: number; avgPrice: number; price: number; baselinePrice: number | null };

export const estimateCryptoTax = (holdings: TaxHolding[]) => {
  let gain = 0;
  let gainWithoutBaseline = 0;
  for (const { quantity, avgPrice, price, baselinePrice } of holdings) {
    const deemedCost = Math.max(avgPrice, baselinePrice ?? avgPrice);
    gain += (price - deemedCost) * quantity;
    gainWithoutBaseline += (price - avgPrice) * quantity;
  }
  const taxable = Math.max(0, gain - TAX_DEDUCTION_KRW);
  return {
    gain,
    // 의제취득가 덕분에 과세 대상에서 빠지는 이익
    shielded: gainWithoutBaseline - gain,
    taxable,
    tax: Math.round(taxable * TAX_RATE),
  };
};

// 보유 자산 일별 기록: 하루 한 칸(한국 시각 날짜). 평가금액(v)·원금(c)을 통화별 원래 금액으로 남긴다.
// USD로 바꿔 두면 원화 원금이 매일 환율에 따라 달라져 매매가 없어도 손익이 생긴다(환율 효과가 섞임).
export type Quote = 'KRW' | 'USD' | 'INR';
export type Amounts = Partial<Record<Quote, number>>;
export type PortfolioSnapshot = { d: string; v: Amounts; c: Amounts };
export const HISTORY_MAX_DAYS = 400;

export const kstDate = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);

export const upsertSnapshot = (history: PortfolioSnapshot[], snapshot: PortfolioSnapshot) =>
  [...history.filter(item => item.d !== snapshot.d), snapshot].sort((a, b) => a.d.localeCompare(b.d)).slice(-HISTORY_MAX_DAYS);

// 통화별 금액을 화면 통화로 합친다(지금 환율). 하나라도 바꿀 수 없으면 null.
export const sumIn = (amounts: Amounts, toDisplay: (amount: number, quote: Quote) => number | null) => {
  let total = 0;
  for (const [quote, amount] of Object.entries(amounts) as [Quote, number][]) {
    const converted = toDisplay(amount, quote);
    if (converted == null) return null;
    total += converted;
  }
  return total;
};

// days일 전(그날이 없으면 그 이전 가장 가까운 날) 대비 손익. 통화마다 (평가금액 변화 - 원금 변화)를 구해 지금 환율로 합친다.
export const periodChange = (
  history: PortfolioSnapshot[],
  today: string,
  days: number,
  current: { v: Amounts; c: Amounts },
  toDisplay: (amount: number, quote: Quote) => number | null,
) => {
  const target = kstDate(Date.parse(`${today}T00:00:00+09:00`) - days * 86_400_000);
  const base = [...history].reverse().find(item => item.d <= target);
  if (!base) return null;
  const quotes = new Set([...Object.keys(current.v), ...Object.keys(base.v)] as Quote[]);
  const delta: Amounts = {};
  for (const quote of quotes) {
    delta[quote] = (current.v[quote] ?? 0) - (base.v[quote] ?? 0) - ((current.c[quote] ?? 0) - (base.c[quote] ?? 0));
  }
  const change = sumIn(delta, toDisplay);
  const baseValue = sumIn(base.v, toDisplay);
  if (change == null || !baseValue || !(baseValue > 0)) return null;
  return { change, rate: (change / baseValue) * 100, from: base.d };
};
