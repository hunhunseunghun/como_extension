import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBithumbNotices, pickNewNotices } from './notices.js';

const sample = [
  { categories: ['입출금'], title: '테더(USDT) 출금 일시 중단', pc_url: 'https://feed.bithumb.com/notice/1655185' },
  { categories: ['거래유의'], title: '블라스트(BLAST) 거래유의종목 지정', pc_url: 'https://feed.bithumb.com/notice/1655184' },
  { categories: ['안내'], title: '보안 체계 강화', pc_url: 'https://feed.bithumb.com/notice/1655183' },
  { categories: ['이벤트'], title: '이벤트', pc_url: 'https://feed.bithumb.com/notice/1655182' },
  { categories: ['거래지원종료'], title: '번호 없음', pc_url: 'https://feed.bithumb.com/notice/' },
];

test('빗썸 공지에서 번호를 뽑고 이벤트·안내는 뺀다', () => {
  const parsed = parseBithumbNotices(sample);
  assert.deepEqual(
    parsed.map(item => [item.id, item.category]),
    [
      [1655185, '입출금'],
      [1655184, '거래유의'],
    ],
  );
  assert.deepEqual(parseBithumbNotices({ error: 'x' }), []);
});

test('처음에는 기준만 잡고, 그다음부터 새 공지만 오래된 순으로 고른다', () => {
  const notices = [{ id: 5 }, { id: 3 }, { id: 4 }];
  assert.deepEqual(pickNewNotices(notices, undefined), { fresh: [], maxId: 5 });
  assert.deepEqual(pickNewNotices(notices, 3), { fresh: [{ id: 4 }, { id: 5 }], maxId: 5 });
  assert.deepEqual(pickNewNotices(notices, 5), { fresh: [], maxId: 5 });
  // 한꺼번에 많으면 최근 limit개만
  assert.deepEqual(pickNewNotices(notices, 0, 2).fresh, [{ id: 4 }, { id: 5 }]);
  assert.deepEqual(pickNewNotices([], 7), { fresh: [], maxId: 7 });
});
