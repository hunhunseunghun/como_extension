import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  averageAfterBuy,
  breakEvenPrice,
  estimateCryptoTax,
  netProfit,
  quantityForTargetAverage,
} from './portfolioCalc.ts';

test('물타기 뒤 평균 단가', () => {
  assert.deepEqual(averageAfterBuy(10, 100, 50, 10), { quantity: 20, avgPrice: 75 });
  assert.equal(averageAfterBuy(0, 0, 0, 1), null);
});

test('목표 평단에 필요한 추가 매수 수량', () => {
  // 10개 @100, 50원에 사서 평단 75 → 10개
  assert.equal(quantityForTargetAverage(10, 100, 50, 75), 10);
  // 목표가 매수가보다 낮으면 불가능
  assert.equal(quantityForTargetAverage(10, 100, 50, 40), null);
  // 불타기(평단 올리기)도 계산한다
  assert.equal(quantityForTargetAverage(10, 50, 100, 75), 10);
});

test('수수료를 반영한 손익분기 매도가와 순손익', () => {
  assert.ok(Math.abs(breakEvenPrice(100, 0.0005)! - 100.10005) < 1e-6);
  assert.equal(breakEvenPrice(100, 1), null);
  assert.ok(Math.abs(netProfit(1, 100, breakEvenPrice(100, 0.0005)!, 0.0005)) < 1e-9);
});

test('2027 과세: 의제취득가와 250만 원 공제, 22%', () => {
  // 평단 1,000만, 12/31 시가 2,000만, 현재 3,000만, 1개 → 이익 1,000만(의제취득가 기준), 공제 후 750만, 세금 165만
  const result = estimateCryptoTax([{ quantity: 1, avgPrice: 10_000_000, price: 30_000_000, baselinePrice: 20_000_000 }]);
  assert.equal(result.gain, 10_000_000);
  assert.equal(result.shielded, 10_000_000);
  assert.equal(result.taxable, 7_500_000);
  assert.equal(result.tax, 1_650_000);
  // 12/31 시가가 평단보다 낮으면 실제 취득가를 쓴다. 손실과 이익은 합산한다.
  const mixed = estimateCryptoTax([
    { quantity: 1, avgPrice: 5_000_000, price: 9_000_000, baselinePrice: 4_000_000 },
    { quantity: 2, avgPrice: 1_000_000, price: 500_000, baselinePrice: null },
  ]);
  assert.equal(mixed.gain, 3_000_000);
  assert.equal(mixed.taxable, 500_000);
  assert.equal(mixed.tax, 110_000);
  assert.equal(estimateCryptoTax([]).tax, 0);
});

test('일별 기록: 같은 날은 덮고, 기간 손익은 통화별로 원금 변화를 빼고 지금 환율로 합친다', async () => {
  const { upsertSnapshot, periodChange, kstDate } = await import('./portfolioCalc.ts');
  assert.equal(kstDate(Date.parse('2026-10-06T16:00:00Z')), '2026-10-07');
  let history = upsertSnapshot([], { d: '2026-10-01', v: { KRW: 1_000_000 }, c: { KRW: 800_000 } });
  history = upsertSnapshot(history, { d: '2026-10-06', v: { KRW: 1_100_000 }, c: { KRW: 800_000 } });
  history = upsertSnapshot(history, { d: '2026-10-06', v: { KRW: 1_150_000 }, c: { KRW: 800_000 } });
  assert.deepEqual(history.map(item => item.d), ['2026-10-01', '2026-10-06']);
  const krw = (amount: number, quote: string) => (quote === 'KRW' ? amount : quote === 'USD' ? amount * 1_400 : null);
  // 1일 전(10/06) 대비 +50,000원. 원화만 있으면 환율과 상관없다.
  assert.deepEqual(periodChange(history, '2026-10-07', 1, { v: { KRW: 1_200_000 }, c: { KRW: 800_000 } }, krw), {
    change: 50_000,
    rate: (50_000 / 1_150_000) * 100,
    from: '2026-10-06',
  });
  // 7일 전 기록이 없으면 null, 6일 전은 10/01 기준. 그사이 20만 원을 더 샀으면 그만큼 뺀다: 140만 - 100만 - 20만 = +20만
  assert.equal(periodChange(history, '2026-10-07', 7, { v: { KRW: 1_200_000 }, c: { KRW: 800_000 } }, krw), null);
  assert.equal(periodChange(history, '2026-10-07', 6, { v: { KRW: 1_400_000 }, c: { KRW: 1_000_000 } }, krw)!.change, 200_000);
  // 달러 보유분은 달러로 변화를 구해 지금 환율로 바꾼다: (+$10) × 1,400
  const mixed = [{ d: '2026-10-06', v: { KRW: 1_000_000, USD: 100 }, c: { KRW: 1_000_000, USD: 100 } }];
  assert.equal(periodChange(mixed, '2026-10-07', 1, { v: { KRW: 1_000_000, USD: 110 }, c: { KRW: 1_000_000, USD: 100 } }, krw)!.change, 14_000);
  // 바꿀 수 없는 통화가 있으면 null
  assert.equal(periodChange([{ d: '2026-10-06', v: { INR: 1 }, c: { INR: 1 } }], '2026-10-07', 1, { v: { INR: 2 }, c: { INR: 1 } }, krw), null);
});
