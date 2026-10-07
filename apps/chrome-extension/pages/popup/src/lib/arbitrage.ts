// 김프 차익 계산(순수 함수). node --experimental-strip-types로 단위 테스트한다.
//   toKorea: 원화로 테더를 사서(국내 거래소 USDT 가격) 해외에서 코인을 사고, 국내로 보내 원화로 판다. 김프가 높을 때.
//   toGlobal: 국내에서 원화로 코인을 사서 해외로 보내 USDT로 팔고, 테더 가격으로 원화 가치를 본다. 역프일 때.
export type ArbitrageInput = {
  direction: 'toKorea' | 'toGlobal';
  amountKrw: number;
  krwPrice: number; // 국내 거래소 코인 원화 가격
  usdtPrice: number; // 해외 거래소 코인 USDT 가격
  usdtKrw: number; // 국내 거래소 USDT 원화 가격(테더 시세)
  krwFee: number; // 국내 거래 수수료(0.0005 = 0.05%)
  globalFee: number; // 해외 거래 수수료
  withdrawFee: number; // 코인을 보낼 때 빠지는 수량
};

export const arbitrage = (input: ArbitrageInput) => {
  const { direction, amountKrw, krwPrice, usdtPrice, usdtKrw, krwFee, globalFee, withdrawFee } = input;
  if (![amountKrw, krwPrice, usdtPrice, usdtKrw].every(value => value > 0)) return null;
  // 테더 기준 김프: 국내 가격 ÷ (해외 가격 × 테더 원화 가격) - 1
  const premium = (krwPrice / (usdtPrice * usdtKrw) - 1) * 100;
  let coins: number;
  let finalKrw: number;
  if (direction === 'toKorea') {
    coins = (amountKrw / usdtKrw / usdtPrice) * (1 - globalFee) - withdrawFee;
    finalKrw = Math.max(0, coins) * krwPrice * (1 - krwFee);
  } else {
    coins = (amountKrw / krwPrice) * (1 - krwFee) - withdrawFee;
    finalKrw = Math.max(0, coins) * usdtPrice * (1 - globalFee) * usdtKrw;
  }
  const profit = finalKrw - amountKrw;
  return { premium, coins: Math.max(0, coins), finalKrw, profit, profitRate: (profit / amountKrw) * 100 };
};
