import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coinOf, pickBadgeFrame, ROTATE_TICKS } from './badge.js';

test('마켓 코드에서 코인 기호를 뽑는다', () => {
  assert.equal(coinOf('KRW-BTC'), 'BTC');
  assert.equal(coinOf('BTCUSDT'), 'BTC');
  assert.equal(coinOf('ETHBTC'), 'ETH');
  assert.equal(coinOf('SOLINR'), 'SOL');
  assert.equal(coinOf('USDT'), 'USDT');
});

const hasPrice = market => market !== 'KRW-NOPE';

test('번갈아 표시를 끄면 배지 코인 가격만 보인다', () => {
  for (let tick = 0; tick < 10; tick++) {
    assert.deepEqual(pickBadgeFrame({ market: 'KRW-BTC', favorites: ['KRW-ETH'], hasPrice, tick }), {
      market: 'KRW-BTC',
      showSymbol: false,
    });
  }
});

test('번갈아 표시는 코인마다 이름 한 칸, 가격 두 칸을 보인다', () => {
  const frames = Array.from({ length: ROTATE_TICKS * 2 }, (_, tick) =>
    pickBadgeFrame({ market: 'KRW-BTC', favorites: ['KRW-BTC', 'KRW-NOPE', 'KRW-ETH'], rotate: true, hasPrice, tick }),
  );
  assert.deepEqual(
    frames.map(frame => `${frame.market}:${frame.showSymbol ? 'name' : 'price'}`),
    ['KRW-BTC:name', 'KRW-BTC:price', 'KRW-BTC:price', 'KRW-ETH:name', 'KRW-ETH:price', 'KRW-ETH:price'],
  );
});

test('보일 코인이 하나뿐이면 이름 없이 가격만 보인다', () => {
  assert.deepEqual(pickBadgeFrame({ market: 'KRW-BTC', favorites: ['KRW-NOPE'], rotate: true, hasPrice, tick: 0 }), {
    market: 'KRW-BTC',
    showSymbol: false,
  });
});

test('가격이 있는 마켓이 없으면 비운다', () => {
  assert.equal(pickBadgeFrame({ market: 'KRW-NOPE', hasPrice, tick: 0 }), null);
});
