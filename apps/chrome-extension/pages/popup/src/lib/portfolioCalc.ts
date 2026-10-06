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
