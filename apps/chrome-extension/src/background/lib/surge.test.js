import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSample, evaluateSurge, SAMPLE_KEEP_MS, surgeMove } from './surge.js';

const MIN = 60_000;
const series = prices => prices.map((p, i) => ({ t: i * 10_000, p }));

test('창 안의 최저가 대비 상승률과 최고가 대비 하락률을 구한다', () => {
  const samples = series([100, 98, 103]);
  const move = surgeMove(samples, 20_000, MIN);
  assert.ok(Math.abs(move.up - 5.102) < 0.001);
  // 현재가가 창 안의 최고가면 하락률은 0이다.
  assert.equal(move.down, 0);
  assert.ok(Math.abs(surgeMove(series([100, 103, 98]), 20_000, MIN).down - -4.854) < 0.001);
});

test('창 밖의 표본은 보지 않고, 표본이 하나면 판단하지 않는다', () => {
  const samples = [{ t: 0, p: 50 }, { t: 5 * MIN, p: 100 }, { t: 5 * MIN + 10_000, p: 101 }];
  assert.ok(Math.abs(surgeMove(samples, 5 * MIN + 10_000, MIN).up - 1) < 1e-9);
  assert.equal(surgeMove([{ t: 0, p: 1 }], 0, MIN), null);
});

test('방향과 기준에 맞을 때만 울리고, 울린 뒤에는 창 길이만큼 쉰다', () => {
  const up = series([100, 101, 104]);
  const rule = { window: 1, threshold: 3 };
  assert.ok(evaluateSurge(rule, up, 20_000, undefined) > 3);
  assert.equal(evaluateSurge({ ...rule, direction: 'down' }, up, 20_000, undefined), null);
  assert.equal(evaluateSurge({ ...rule, threshold: 5 }, up, 20_000, undefined), null);
  // 30초 전에 울렸으면 1분 창이 지나기 전까지 쉰다.
  assert.equal(evaluateSurge(rule, up, 20_000, -10_000), null);
  assert.ok(evaluateSurge(rule, up, 20_000, -50_000) > 3);

  const down = series([100, 99, 96]);
  assert.ok(evaluateSurge({ ...rule, direction: 'down' }, down, 20_000, undefined) < -3);
  assert.equal(evaluateSurge({ ...rule, direction: 'up' }, down, 20_000, undefined), null);
});

test('표본은 16분만 보관하고 0 이하 가격은 버린다', () => {
  const samples = [];
  addSample(samples, 0, 1);
  addSample(samples, SAMPLE_KEEP_MS + 1, 2);
  addSample(samples, SAMPLE_KEEP_MS + 2, 0);
  assert.deepEqual(samples, [{ t: SAMPLE_KEEP_MS + 1, p: 2 }]);
});
