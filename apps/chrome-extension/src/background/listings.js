// @ts-check
// 신규 상장 알림(업비트·빗썸 원화 마켓). index.js에서 나눔. 알람·타이머는 import될 때 건다.
import { ensureAlarm } from './alarms.js';
import { createNotification, getLanguage, languageReady } from './notify.js';

// 신규 상장 알림: 업비트·빗썸의 KRW 마켓 목록을 주기적으로 비교해 새로 생긴 마켓을 알린다.
// 공지 API 대신 이미 허용된 market/all을 쓰므로 호스트 권한을 늘리지 않는다.
const LISTING_SOURCES = {
  upbit: 'https://api.upbit.com/v1/market/all',
  bithumb: 'https://api.bithumb.com/v1/market/all',
};
const LISTING_SETTING_KEY = 'listingAlerts';
const KNOWN_MARKETS_KEY = 'knownKrwMarkets';
/** @type {Record<string, string>} */
const LISTING_TEXT = {
  ko: '원화 마켓 신규 상장',
  en: 'New KRW market listing',
  es: 'Nuevo listado en el mercado KRW',
  pt: 'Nova listagem no mercado KRW',
  vi: 'Niêm yết mới trên thị trường KRW',
  tr: 'KRW pazarında yeni listeleme',
  id: 'Listing baru di pasar KRW',
  ja: 'ウォン市場に新規上場',
  zh: '韩元市场新上币',
  hi: 'KRW बाज़ार में नई लिस्टिंग',
};

// 설정이 없으면 한국어 사용자에게만 켠다. 팝업의 기본값(isListingAlertsDefault)과 같은 규칙이다.
const isListingAlertsEnabled = /** @param {boolean | undefined} stored */ stored => stored ?? getLanguage() === 'ko';

let listingCheckRunning = false;
async function checkNewListings() {
  // 시작 직후 확인과 알람이 겹치면 같은 상장을 두 번 알릴 수 있다.
  if (listingCheckRunning) return;
  listingCheckRunning = true;
  try {
    await languageReady;
    await checkNewListingsOnce();
  } finally {
    listingCheckRunning = false;
  }
}

async function checkNewListingsOnce() {
  const result = await chrome.storage.local.get([LISTING_SETTING_KEY, KNOWN_MARKETS_KEY]);
  const known = result[KNOWN_MARKETS_KEY] || {};
  const notify = isListingAlertsEnabled(result[LISTING_SETTING_KEY]);
  const next = { ...known };

  for (const [exchange, url] of Object.entries(LISTING_SOURCES)) {
    /** @type {{ market: string, korean_name?: string, english_name?: string }[]} */
    let markets;
    try {
      const response = await fetch(url);
      markets = /** @type {typeof markets} */ (await response.json()).filter(market => market.market?.startsWith('KRW-'));
    } catch (error) {
      console.warn(error);
      continue;
    }
    const previous = /** @type {string[] | undefined} */ (known[exchange]);
    // 일시적으로 목록이 짧게 오면 기준을 덮어쓰지 않는다.
    if (!markets.length || (previous && markets.length < previous.length * 0.8)) continue;
    next[exchange] = markets.map(market => market.market);
    if (!previous || !notify) continue;

    const added = markets.filter(market => !previous.includes(market.market));
    // 한꺼번에 많이 생기면 상장이 아니라 목록 형식 변화로 보고 알리지 않는다.
    if (added.length > 5) continue;
    added.forEach(market => {
      const name = getLanguage() === 'ko' ? market.korean_name : market.english_name;
      createNotification(`${exchange}:${market.market}:listing`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${name || market.market} (${market.market.slice(4)}) · ${exchange.toUpperCase()}`,
        message: LISTING_TEXT[getLanguage()],
      });
    });
  }
  chrome.storage.local.set({ [KNOWN_MARKETS_KEY]: next });
}

ensureAlarm('listingCheck', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'listingCheck') checkNewListings();
});
// 시작 직후 거래소 시세 요청과 겹쳐 업비트 요청 한도에 걸리지 않게 조금 늦춘다.
setTimeout(checkNewListings, 15_000);
