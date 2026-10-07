import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUpbitWallet } from './walletStatus.js';

test('네트워크 하나라도 되면 가능, 둘 다 되는 코인은 뺀다', () => {
  const result = aggregateUpbitWallet([
    // USDT: 한 네트워크만 멈춰도 다른 네트워크가 정상이면 정상
    { currency: 'USDT', net_type: 'TRX', wallet_state: 'paused' },
    { currency: 'USDT', net_type: 'ETH', wallet_state: 'working' },
    { currency: 'XRP', net_type: 'XRP', wallet_state: 'withdraw_only' },
    { currency: 'SOL', net_type: 'SOL', wallet_state: 'deposit_only' },
    { currency: 'BTC', net_type: 'BTC', wallet_state: 'working' },
    { currency: 'ABC', net_type: 'ABC', wallet_state: 'paused' },
    { currency: 'OLD', net_type: 'OLD', wallet_state: 'unsupported' },
  ]);
  assert.deepEqual(result, {
    XRP: { deposit: false, withdraw: true },
    SOL: { deposit: true, withdraw: false },
    ABC: { deposit: false, withdraw: false },
    OLD: { deposit: false, withdraw: false },
  });
  // 한 네트워크는 입금만, 다른 네트워크는 출금만 되면 둘 다 가능
  assert.deepEqual(
    aggregateUpbitWallet([
      { currency: 'ETH', wallet_state: 'deposit_only' },
      { currency: 'ETH', wallet_state: 'withdraw_only' },
    ]),
    {},
  );
  assert.deepEqual(aggregateUpbitWallet({ error: 'x' }), {});
});
