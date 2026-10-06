import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesWhaleRule, parseBinanceAggTrade, parseUpbitTrade } from './whale.js';

test('업비트 체결을 금액·방향과 함께 정리한다', () => {
  const trade = parseUpbitTrade({
    type: 'trade',
    code: 'KRW-BTC',
    trade_price: 100_000_000,
    trade_volume: 0.5,
    ask_bid: 'BID',
    trade_timestamp: 1000,
  });
  assert.deepEqual(trade, {
    exchange: 'upbit',
    market: 'KRW-BTC',
    price: 100_000_000,
    quantity: 0.5,
    amount: 50_000_000,
    side: 'buy',
    time: 1000,
  });
  assert.equal(parseUpbitTrade({ type: 'ticker' }), null);
});

test('바이낸스 aggTrade는 매수자가 메이커면 매도 체결이다', () => {
  const trade = parseBinanceAggTrade({ stream: 'btcusdt@aggTrade', data: { e: 'aggTrade', s: 'BTCUSDT', p: '85000', q: '2', m: true, T: 5 } });
  assert.equal(trade.amount, 170_000);
  assert.equal(trade.side, 'sell');
  assert.equal(parseBinanceAggTrade({ data: { e: 'trade' } }), null);
});

test('금액·방향이 맞고 30초 안에 알린 적이 없을 때만 알린다', () => {
  const rule = { exchange: 'binance', market: 'BTCUSDT', minAmount: 100_000 };
  const trade = { exchange: 'binance', market: 'BTCUSDT', price: 1, quantity: 1, amount: 170_000, side: 'sell', time: 100_000 };
  assert.equal(matchesWhaleRule(rule, trade, undefined), true);
  assert.equal(matchesWhaleRule({ ...rule, minAmount: 200_000 }, trade, undefined), false);
  assert.equal(matchesWhaleRule({ ...rule, direction: 'up' }, trade, undefined), false);
  assert.equal(matchesWhaleRule({ ...rule, direction: 'down' }, trade, undefined), true);
  assert.equal(matchesWhaleRule(rule, trade, 90_000), false);
  assert.equal(matchesWhaleRule(rule, trade, 70_000), true);
  assert.equal(matchesWhaleRule({ ...rule, market: 'ETHUSDT' }, trade, undefined), false);
});
