// 초기 설정 및 전역 변수
const allExchangesTickers = {
  upbit: {},
  bithumb: {},
  binance: {},
  bybit: {},
  okx: {},
  coinbase: {},
  bitget: {},
  kraken: {},
  coindcx: {},
};
const maxChangeRate = { exchange: '', market: '', changeRate: 0 };

const getKSTDate = () =>
  new Date()
    .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .replace(/\./g, '')
    .replace(/ /g, '');

let CURRENT_DATE = getKSTDate();

// 날짜가 바뀌었으면 CURRENT_DATE를 바꾸고 true를 돌려준다. 하루 한 번 규칙은 확인할 때마다 이걸 불러 자정 직후에도 바로 풀린다.
function refreshCurrentDate() {
  const date = getKSTDate();
  if (date === CURRENT_DATE) return false;
  CURRENT_DATE = date;
  return true;
}

// 'yyyymmdd'에서 days일 전 날짜를 같은 형식으로 돌려준다(KST 날짜 문자열 기준, 시간대 변환 없음).
function shiftDate(yyyymmdd, days) {
  const date = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) - days));
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

chrome.alarms.create('updateDate', { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateDate' && refreshCurrentDate()) {
    // 서비스 워커가 날짜를 넘겨 살아 있으면 환율이 갱신되지 않으므로 날짜가 바뀔 때 다시 조회한다.
    exchangeRateManager.updateExchangeRate();
  }
});

// 지정가 알림 관련 함수
// 웹소켓 틱마다 storage를 읽지 않도록 알림 설정을 메모리에 캐시하고 storage 변경 시 동기화한다.
const alertCache = { priceAlerts: {}, triggeredPrices: {}, deadbandSettings: {} };
const ALERT_KEYS = Object.keys(alertCache);

const alertsReady = chrome.storage.local.get(ALERT_KEYS).then(result => {
  ALERT_KEYS.forEach(key => {
    alertCache[key] = result[key] || {};
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  ALERT_KEYS.forEach(key => {
    if (changes[key]) alertCache[key] = changes[key].newValue || {};
  });
});

function checkPriceAlerts(exchange, ticker, currentPrice) {
  // 알림 미설정 ticker도 lastPrice 추적: 첫 알림 등록 후 즉시 크로싱 검출 가능하도록.
  const lastPrice = allExchangesTickers[exchange][ticker]?.lastPrice ?? null;
  allExchangesTickers[exchange][ticker] = allExchangesTickers[exchange][ticker] || {};
  allExchangesTickers[exchange][ticker].lastPrice = currentPrice;

  const alertPrices = alertCache.priceAlerts[exchange]?.[ticker];
  if (!alertPrices?.length || lastPrice === null) return;

  const triggered = alertCache.triggeredPrices;
  const deadbandSettings = alertCache.deadbandSettings;
  triggered[exchange] = triggered[exchange] || {};
  triggered[exchange][ticker] = triggered[exchange][ticker] || {};
  const tickerTriggered = triggered[exchange][ticker];
  let changed = false;

  alertPrices.forEach(({ price: alertPrice, deadband: alertDeadband }) => {
    if (alertPrice === undefined) return;
    const deadband = deadbandSettings[exchange]?.[ticker]?.[alertPrice] ?? alertDeadband ?? 0;
    const crossedUp = lastPrice < alertPrice && currentPrice >= alertPrice;
    const crossedDown = lastPrice > alertPrice && currentPrice <= alertPrice;

    if (deadband === 0) {
      if (crossedUp || crossedDown) sendNotification(exchange, ticker, currentPrice, alertPrice, crossedUp);
      return;
    }

    if (!tickerTriggered[alertPrice]) {
      if (crossedUp || crossedDown) {
        sendNotification(exchange, ticker, currentPrice, alertPrice, crossedUp);
        tickerTriggered[alertPrice] = true;
        changed = true;
      }
    } else {
      const deadbandValue = alertPrice * deadband;
      if (currentPrice <= alertPrice - deadbandValue || currentPrice >= alertPrice + deadbandValue) {
        tickerTriggered[alertPrice] = false;
        changed = true;
      }
    }
  });

  if (changed) chrome.storage.local.set({ triggeredPrices: triggered });
}

// 알림 문구는 팝업에서 고른 언어를 따르고, 설정이 없으면 브라우저 언어를 따른다.
const NOTIFICATION_TEXT = {
  ko: { up: '상향 도달', down: '하향 도달' },
  en: { up: 'reached (rising)', down: 'reached (falling)' },
  es: { up: 'alcanzado (subiendo)', down: 'alcanzado (bajando)' },
  pt: { up: 'atingido (subindo)', down: 'atingido (caindo)' },
  vi: { up: 'đã chạm (tăng)', down: 'đã chạm (giảm)' },
  tr: { up: 'ulaştı (yükseliş)', down: 'ulaştı (düşüş)' },
  id: { up: 'tercapai (naik)', down: 'tercapai (turun)' },
  ja: { up: '到達（上昇）', down: '到達（下落）' },
  zh: { up: '已到达（上涨）', down: '已到达（下跌）' },
  hi: { up: 'पहुँचा (बढ़त)', down: 'पहुँचा (गिरावट)' },
};
let userLanguage = null;
const languageReady = chrome.storage.local.get('language').then(result => {
  userLanguage = result.language || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.language) userLanguage = changes.language.newValue || null;
});
const getLanguage = () => {
  const language = userLanguage || chrome.i18n?.getUILanguage?.().toLowerCase().split('-')[0];
  return NOTIFICATION_TEXT[language] ? language : 'en';
};

// 방향은 가격 비교로 다시 구하지 않는다. 올라오다 목표가에 딱 닿으면(현재가 = 목표가) 하향으로 잘못 표시된다.
function sendNotification(exchange, ticker, currentPrice, alertPrice, crossedUp) {
  const notificationId = `${exchange}:${ticker}:${alertPrice}`;
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'como-logo.png',
    title: `${alertPrice > 10 ? alertPrice.toLocaleString('en-US') : alertPrice} ${ticker} ${exchange.toUpperCase()}`,
    message: `${ticker} ${NOTIFICATION_TEXT[getLanguage()][crossedUp ? 'up' : 'down']}`,
  });
  // 알림이 실제로 울린 시점은 리뷰 요청 조건으로 쓴다.
  chrome.storage.local.set({ alertFiredAt: Date.now() });
}

// 알림을 누르면 해당 거래소의 거래 화면을 연다.
const getTradeUrl = (exchange, market) => {
  const quote = ['USDT', 'USD', 'INR', 'BTC'].find(q => market.endsWith(q)) ?? '';
  const base = quote ? market.slice(0, -quote.length) : market;
  switch (exchange) {
    case 'upbit':
      return `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`;
    case 'bithumb':
      return `https://www.bithumb.com/react/trade/order/${market.split('-').reverse().join('-')}`;
    case 'binance':
      return `https://www.binance.com/en/trade/${base}_${quote}?type=spot`;
    case 'bybit':
      return `https://www.bybit.com/trade/spot/${base}/${quote}`;
    case 'okx':
      return `https://www.okx.com/trade-spot/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case 'coinbase':
      return `https://www.coinbase.com/advanced-trade/spot/${base}-${quote}`;
    case 'bitget':
      return `https://www.bitget.com/spot/${base}${quote}`;
    case 'kraken':
      return `https://pro.kraken.com/app/trade/${base.toLowerCase()}-${quote.toLowerCase()}`;
    case 'coindcx':
      return `https://coindcx.com/trade/${market}`;
    default:
      return null;
  }
};

chrome.notifications.onClicked.addListener(notificationId => {
  // 공지 알림: notice:<거래소>:<공지 id>
  if (notificationId.startsWith('notice:')) {
    const [, exchange, id] = notificationId.split(':');
    if (exchange === 'upbit') chrome.tabs.create({ url: `https://upbit.com/service_center/notice?id=${id}` });
    chrome.notifications.clear(notificationId);
    return;
  }
  const [exchange, market] = notificationId.split(':');
  const url = market && getTradeUrl(exchange, market);
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notificationId);
});

// 신규 상장 알림: 업비트·빗썸의 KRW 마켓 목록을 주기적으로 비교해 새로 생긴 마켓을 알린다.
// 공지 API 대신 이미 허용된 market/all을 쓰므로 호스트 권한을 늘리지 않는다.
const LISTING_SOURCES = {
  upbit: 'https://api.upbit.com/v1/market/all',
  bithumb: 'https://api.bithumb.com/v1/market/all',
};
const LISTING_SETTING_KEY = 'listingAlerts';
const KNOWN_MARKETS_KEY = 'knownKrwMarkets';
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
const isListingAlertsEnabled = stored => stored ?? getLanguage() === 'ko';

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
    let markets;
    try {
      const response = await fetch(url);
      markets = (await response.json()).filter(market => market.market?.startsWith('KRW-'));
    } catch (error) {
      console.warn(error);
      continue;
    }
    const previous = known[exchange];
    // 일시적으로 목록이 짧게 오면 기준을 덮어쓰지 않는다.
    if (!markets.length || (previous && markets.length < previous.length * 0.8)) continue;
    next[exchange] = markets.map(market => market.market);
    if (!previous || !notify) continue;

    const added = markets.filter(market => !previous.includes(market.market));
    // 한꺼번에 많이 생기면 상장이 아니라 목록 형식 변화로 보고 알리지 않는다.
    if (added.length > 5) continue;
    added.forEach(market => {
      const name = getLanguage() === 'ko' ? market.korean_name : market.english_name;
      chrome.notifications.create(`${exchange}:${market.market}:listing`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${name || market.market} (${market.market.slice(4)}) · ${exchange.toUpperCase()}`,
        message: LISTING_TEXT[getLanguage()],
      });
    });
  }
  chrome.storage.local.set({ [KNOWN_MARKETS_KEY]: next });
}

// 변동률·김프 알림 규칙. 지정가 알림과 따로 저장하고, 백그라운드가 받는 전 거래소 시세로 10초마다 확인한다.
//   change: { id, type: 'change', exchange, market, threshold }  24시간 등락률 절댓값이 threshold(%) 이상이면 하루 한 번
//   kimchi: { id, type: 'kimchi', exchange: 'upbit'|'bithumb', coin, above?, below? }  김프가 기준을 넘으면 한 번, 0.3%p 되돌아오면 다시 무장
const RULES_KEY = 'alertRules';
const RULE_STATE_KEY = 'alertRuleState';
const KIMCHI_REARM_GAP = 0.3;
const RULE_TEXT = {
  ko: { change: '24시간 변동', kimchiAbove: '김프 상단 도달', kimchiBelow: '김프 하단 도달' },
  en: { change: '24h move', kimchiAbove: 'Kimchi premium above', kimchiBelow: 'Kimchi premium below' },
  es: { change: 'Movimiento 24 h', kimchiAbove: 'Prima kimchi por encima', kimchiBelow: 'Prima kimchi por debajo' },
  pt: { change: 'Variação 24 h', kimchiAbove: 'Prêmio kimchi acima', kimchiBelow: 'Prêmio kimchi abaixo' },
  vi: { change: 'Biến động 24h', kimchiAbove: 'Kimchi premium vượt trên', kimchiBelow: 'Kimchi premium xuống dưới' },
  tr: { change: '24s hareket', kimchiAbove: 'Kimchi primi üstünde', kimchiBelow: 'Kimchi primi altında' },
  id: { change: 'Pergerakan 24 jam', kimchiAbove: 'Kimchi premium di atas', kimchiBelow: 'Kimchi premium di bawah' },
  ja: { change: '24時間変動', kimchiAbove: 'キムチプレミアム上限到達', kimchiBelow: 'キムチプレミアム下限到達' },
  zh: { change: '24小时涨跌', kimchiAbove: '泡菜溢价达到上限', kimchiBelow: '泡菜溢价达到下限' },
  hi: { change: '24 घंटे की चाल', kimchiAbove: 'किमची प्रीमियम ऊपर', kimchiBelow: 'किमची प्रीमियम नीचे' },
};
const ruleCache = { rules: [], state: {} };
const rulesReady = chrome.storage.local.get([RULES_KEY, RULE_STATE_KEY]).then(result => {
  ruleCache.rules = result[RULES_KEY] || [];
  ruleCache.state = result[RULE_STATE_KEY] || {};
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[RULES_KEY]) ruleCache.rules = changes[RULES_KEY].newValue || [];
  if (changes[RULE_STATE_KEY]) ruleCache.state = changes[RULE_STATE_KEY].newValue || {};
});

const formatPercent = value => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

function checkAlertRules() {
  if (!ruleCache.rules.length) return;
  refreshCurrentDate();
  const text = RULE_TEXT[getLanguage()] ?? RULE_TEXT.en;
  // 지운 규칙의 상태는 남기지 않는다.
  const ruleIds = new Set(ruleCache.rules.map(rule => rule.id));
  const state = Object.fromEntries(Object.entries(ruleCache.state).filter(([id]) => ruleIds.has(id)));
  let changed = Object.keys(state).length !== Object.keys(ruleCache.state).length;
  let kimchi = null;
  const notify = (id, exchange, market, title, message) => {
    chrome.notifications.create(`${exchange}:${market}:rule-${id}`, { type: 'basic', iconUrl: 'como-logo.png', title, message });
    chrome.storage.local.set({ alertFiredAt: Date.now() });
  };

  for (const rule of ruleCache.rules) {
    const current = { ...state[rule.id] };
    if (rule.type === 'change') {
      const ticker = allExchangesTickers[rule.exchange]?.[rule.market];
      if (!ticker?.currentPrice || current.firedOn === CURRENT_DATE) continue;
      const rate = ticker.changeRate ?? 0;
      if (Math.abs(rate) < rule.threshold) continue;
      notify(rule.id, rule.exchange, rule.market, `${rule.market} ${formatPercent(rate)} · ${rule.exchange.toUpperCase()}`, `${text.change} ≥ ${rule.threshold}%`);
      current.firedOn = CURRENT_DATE;
    } else if (rule.type === 'kimchi') {
      kimchi ??= computeKimchiPremium().items;
      const market = `KRW-${rule.coin}`;
      const premium = kimchi[`${rule.exchange}:${market}`]?.premium;
      if (premium == null) continue;
      const title = `${rule.coin} ${formatPercent(premium)} · ${rule.exchange.toUpperCase()}`;
      if (rule.above != null) {
        if (current.aboveFired !== true && premium >= rule.above) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiAbove} (${rule.above}%)`);
          current.aboveFired = true;
        } else if (current.aboveFired && premium < rule.above - KIMCHI_REARM_GAP) current.aboveFired = false;
      }
      if (rule.below != null) {
        if (current.belowFired !== true && premium <= rule.below) {
          notify(rule.id, rule.exchange, market, title, `${text.kimchiBelow} (${rule.below}%)`);
          current.belowFired = true;
        } else if (current.belowFired && premium > rule.below + KIMCHI_REARM_GAP) current.belowFired = false;
      }
    }
    if (JSON.stringify(current) !== JSON.stringify(state[rule.id] ?? {})) {
      state[rule.id] = current;
      changed = true;
    }
  }
  if (changed) {
    ruleCache.state = state;
    chrome.storage.local.set({ [RULE_STATE_KEY]: state });
  }
}
setInterval(checkAlertRules, 10_000);

// 업비트 거래 공지(신규 거래지원 예정, 유의 종목 지정·해제, 거래지원 종료) 알림.
// 마켓 목록 비교는 거래가 열린 뒤에야 알 수 있어, 공지가 올라오는 즉시 알리는 쪽이 빠르다.
// 공지 API는 선택 권한이라 설정에서 켤 때 사용자에게 권한을 받는다.
const NOTICE_SETTING_KEY = 'noticeAlerts';
const NOTICE_LAST_ID_KEY = 'lastUpbitNoticeId';
const UPBIT_NOTICE_ORIGIN = 'https://api-manager.upbit.com/*';
let noticeCheckRunning = false;

async function checkUpbitNotices() {
  if (noticeCheckRunning) return;
  noticeCheckRunning = true;
  try {
    const result = await chrome.storage.local.get([NOTICE_SETTING_KEY, NOTICE_LAST_ID_KEY]);
    if (!result[NOTICE_SETTING_KEY]) return;
    if (!(await chrome.permissions.contains({ origins: [UPBIT_NOTICE_ORIGIN] }))) return;
    const { data } = await fetchJson('https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page=20&category=trade');
    const notices = data?.notices ?? [];
    if (!notices.length) return;
    const lastId = result[NOTICE_LAST_ID_KEY];
    const maxId = Math.max(...notices.map(notice => notice.id));
    // 처음 켰을 때는 지난 공지를 한꺼번에 알리지 않고 기준만 잡는다.
    if (lastId != null) {
      notices
        .filter(notice => notice.id > lastId)
        .slice(0, 5)
        .forEach(notice => {
          chrome.notifications.create(`notice:upbit:${notice.id}`, {
            type: 'basic',
            iconUrl: 'como-logo.png',
            title: notice.title,
            message: `UPBIT · ${NOTICE_TEXT[getLanguage()] ?? NOTICE_TEXT.en}`,
          });
        });
    }
    if (maxId !== lastId) await chrome.storage.local.set({ [NOTICE_LAST_ID_KEY]: maxId });
  } catch (error) {
    console.warn(error);
  } finally {
    noticeCheckRunning = false;
  }
}
const NOTICE_TEXT = {
  ko: '거래 공지',
  en: 'Trading notice',
  es: 'Aviso de trading',
  pt: 'Aviso de negociação',
  vi: 'Thông báo giao dịch',
  tr: 'İşlem duyurusu',
  id: 'Pengumuman trading',
  ja: '取引のお知らせ',
  zh: '交易公告',
  hi: 'ट्रेडिंग सूचना',
};

chrome.alarms.create('noticeCheck', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'noticeCheck') checkUpbitNotices();
});
chrome.storage.onChanged.addListener((changes, area) => {
  // 켜자마자 기준 공지를 잡아 둔다.
  if (area === 'local' && changes[NOTICE_SETTING_KEY]?.newValue) checkUpbitNotices();
});

chrome.alarms.create('listingCheck', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'listingCheck') // 시작 직후 거래소 시세 요청과 겹쳐 업비트 요청 한도에 걸리지 않게 조금 늦춘다.
setTimeout(checkNewListings, 15_000);
});
checkNewListings();

// 툴바 배지: 고른 종목의 가격을 4글자 안으로 줄여 보여주고, 등락에 따라 배경색을 바꾼다.
const BADGE_STORAGE_KEY = 'badgeSettings';
let badgeSettings = null;
let upDownSetting = null;
let lastBadge = '';
const badgeReady = chrome.storage.local.get([BADGE_STORAGE_KEY, 'upDownColors']).then(result => {
  badgeSettings = result[BADGE_STORAGE_KEY] || null;
  upDownSetting = result.upDownColors || null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[BADGE_STORAGE_KEY]) badgeSettings = changes[BADGE_STORAGE_KEY].newValue || null;
  if (changes.upDownColors) upDownSetting = changes.upDownColors.newValue || null;
  if (changes[BADGE_STORAGE_KEY] || changes.upDownColors || changes.language) updateBadge();
});

const getBadgeSettings = () =>
  badgeSettings ??
  (getLanguage() === 'ko'
    ? { enabled: true, exchange: 'upbit', market: 'KRW-BTC' }
    : { enabled: true, exchange: 'binance', market: 'BTCUSDT' });

function formatBadgePrice(price) {
  for (const [unit, size] of [
    ['B', 1e9],
    ['M', 1e6],
    ['K', 1e3],
  ]) {
    if (price >= size) {
      const value = price / size;
      return `${value >= 10 ? Math.round(value) : value.toFixed(1)}${unit}`;
    }
  }
  if (price >= 100) return price.toFixed(0);
  if (price >= 10) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.001) return price.toFixed(3).slice(1);
  return price.toExponential(0);
}

function updateBadge() {
  const settings = getBadgeSettings();
  const ticker = settings.enabled ? allExchangesTickers[settings.exchange]?.[settings.market] : null;
  if (!ticker?.currentPrice) {
    if (lastBadge) {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: chrome.i18n?.getMessage?.('extName') || 'COMO' });
      lastBadge = '';
    }
    return;
  }

  const changeRate = ticker.changeRate ?? 0;
  const redUp = (upDownSetting ?? (['ko', 'ja', 'zh'].includes(getLanguage()) ? 'red-up' : 'green-up')) === 'red-up';
  const color = changeRate >= 0 ? (redUp ? '#ef4444' : '#16a34a') : redUp ? '#3b82f6' : '#ef4444';
  const text = formatBadgePrice(ticker.currentPrice);
  const title = `${settings.market} ${ticker.currentPrice.toLocaleString('en-US')} (${changeRate >= 0 ? '+' : ''}${changeRate.toFixed(2)}%) · ${settings.exchange}`;
  const key = `${text}|${color}|${title}`;
  if (key === lastBadge) return;
  lastBadge = key;
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  chrome.action.setTitle({ title });
}

// 저장·삭제를 한 번에 하나씩 처리한다. 빠르게 두 번 추가하거나 팝업·사이드 패널에서 동시에 추가하면
// 둘 다 같은 옛 값을 읽고 덮어써 하나가 사라진다.
let alertWriteQueue = Promise.resolve();
function queueAlertWrite(task) {
  alertWriteQueue = alertWriteQueue.then(() => new Promise(resolve => task(resolve))).catch(error => console.warn(error));
}

// 시세 틱이 저장 직후 옛 triggeredPrices를 다시 쓰지 않도록 저장 전에 메모리 캐시부터 바꾼다.
function setAlertStorage(values, done) {
  Object.entries(values).forEach(([key, value]) => {
    if (key in alertCache) alertCache[key] = value;
  });
  chrome.storage.local.set(values, done);
}

function savePriceAlert(exchange, ticker, priceDeadbandPairs, response) {
  queueAlertWrite(release => savePriceAlertNow(exchange, ticker, priceDeadbandPairs, result => {
    response(result);
    release();
  }));
}

function deletePriceAlert(exchange, ticker, priceToDelete, response) {
  queueAlertWrite(release => deletePriceAlertNow(exchange, ticker, priceToDelete, result => {
    response(result);
    release();
  }));
}

function savePriceAlertNow(exchange, ticker, priceDeadbandPairs, response) {
  chrome.storage.local.get(['priceAlerts', 'triggeredPrices', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let triggered = result.triggeredPrices || {};
    let deadbandSettings = result.deadbandSettings || {};

    if (!alerts[exchange]) alerts[exchange] = {};
    if (!deadbandSettings[exchange]) deadbandSettings[exchange] = {};
    if (!deadbandSettings[exchange][ticker]) deadbandSettings[exchange][ticker] = {};

    const existingPrices = alerts[exchange][ticker] || [];
    priceDeadbandPairs.forEach(({ price, deadband }) => {
      if (!existingPrices.some(p => p.price === price)) {
        existingPrices.push({ price, deadband });
        if (deadband !== null) {
          deadbandSettings[exchange][ticker][price] = deadband;
        }
      }
    });
    alerts[exchange][ticker] = existingPrices;

    if (triggered[exchange] && triggered[exchange][ticker]) {
      triggered[exchange][ticker] = {};
    }

    setAlertStorage({ priceAlerts: alerts, triggeredPrices: triggered, deadbandSettings }, () => {
      response({ success: true, prices: existingPrices });
    });
  });
}

function deletePriceAlertNow(exchange, ticker, priceToDelete, response) {
  chrome.storage.local.get(['priceAlerts', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let deadbandSettings = result.deadbandSettings || {};

    // priceAlerts에서 삭제
    // 이미 지워진 알림이어도 팝업이 응답을 기다리며 멈추지 않게 빈 목록으로 처리한다.
    const updatedPairs = (alerts[exchange]?.[ticker] ?? []).filter(pair => pair.price !== priceToDelete);
    alerts[exchange] = { ...alerts[exchange], [ticker]: updatedPairs };

    // deadbandSettings에서 삭제
    if (deadbandSettings[exchange]?.[ticker]?.[priceToDelete]) {
      delete deadbandSettings[exchange][ticker][priceToDelete];
      if (Object.keys(deadbandSettings[exchange][ticker]).length === 0) {
        delete deadbandSettings[exchange][ticker];
      }
      if (Object.keys(deadbandSettings[exchange]).length === 0) {
        delete deadbandSettings[exchange];
      }
    }

    setAlertStorage({ priceAlerts: alerts, deadbandSettings }, () => {
      response({ success: true, prices: updatedPairs });
    });
  });
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openPopup') chrome.action.openPopup();
  if (message.action === 'changeExchange') handleExchangeChange(message.exchange);
  if (message.action === 'getActiveExchange' && activePort && activeExchange) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
  }
  if (message.action === 'setPriceAlert') {
    const { exchange, ticker, prices } = message;
    savePriceAlert(exchange, ticker, prices, response => {
      sendResponse(response);
    });
    return true;
  }
  if (message.action === 'deletePriceAlert') {
    const { exchange, ticker, price } = message;
    deletePriceAlert(exchange, ticker, price, response => {
      sendResponse(response);
    });
    return true;
  }
  if (message.action === 'getSpreads') {
    sendResponse(computeSpreads({ includeKrw: message.includeKrw !== false }));
  }
  if (message.action === 'getKimchiPremium') {
    sendResponse(computeKimchiPremium());
  }
  if (message.action === 'getDerivatives') {
    sendResponse({ funding: derivatives.value, liquidations: summarizeLiquidations() });
  }
  if (message.action === 'getTrending') {
    sendResponse(trending.value ?? []);
  }
  if (message.action === 'syncExchangeAccount') {
    syncExchangeAccount(message.exchange).then(sendResponse);
    return true;
  }
  // 거래소별 연결 상태(점검·E2E용)
  if (message.action === 'getConnectionStatus') {
    sendResponse(
      Object.fromEntries(
        Object.entries(exchanges).map(([name, exchange]) => [
          name,
          { suspended: exchange.suspended, connected: exchange.socket?.readyState === WebSocket.OPEN || !!exchange.pollTimer },
        ]),
      ),
    );
  }
  if (message.action === 'getAllExchangesTickers') {
    sendResponse(Object.values(allExchangesTickers).flatMap(tickers => Object.values(tickers)));
  }
});

// 설치 및 업데이트 처리
let updatedVersion = '';
chrome.storage.local.get('updatedFromVersion').then(result => {
  updatedVersion ||= result.updatedFromVersion || '';
});
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.runtime.setUninstallURL('https://walla.my/v/a6J0FV5gUKCyzupMaG71');
    // 새로 설치한 사용자에게만 첫 실행 안내(Onboarding)를 보여 준다. 업데이트한 사용자는 이미 설정을 마쳤다.
    chrome.storage.local.set({ onboardingPending: true });
  }
  if (details.reason === 'update') {
    updatedVersion = details?.previousVersion || null;
    chrome.storage.local.set({ updatedFromVersion: updatedVersion });
  }
});

chrome.alarms.clear('keepAlive');

//  ExchangeRateManager 클래스
class ExchangeRateManager {
  constructor() {
    this.port = null;
    this.exchangeRateUSD = null;
    this.storages = {
      exchangeRateUSD: null,
      updatedDate: null,
      favoriteCoins: { upbit: [], bithumb: [], binance: [] },
    };
  }

  async initialize() {
    const keys = Object.keys(this.storages);
    const results = await Promise.all(
      keys.map(key => new Promise(resolve => chrome.storage.local.get(key, result => resolve(result)))),
    );
    results.forEach((result, index) => {
      this.storages[keys[index]] = result[keys[index]];
    });

    if (this.storages.exchangeRateUSD) this.exchangeRateUSD = Number(this.storages.exchangeRateUSD);
    if (!this.storages.exchangeRateUSD || this.storages.updatedDate !== CURRENT_DATE) {
      await this.updateExchangeRate();
    }
  }

  async updateExchangeRate() {
    try {
      await this.fetchFromAPI();
    } catch {
      await this.fetchFromNaver();
    }
  }

  async fetchFromAPI() {
    const AUTH_KEY = 'lhvJTBDL3jYjY7HvXsMBLacy5TEjsavr';
    const MAX_ATTEMPTS = 7;
    let searchDate = CURRENT_DATE;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const url = `https://www.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${AUTH_KEY}&searchdate=${searchDate}&data=AP01`;
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      const data = await response.json();

      if (Array.isArray(data) && data.length) {
        const usdRate = data.find(rate => rate.cur_unit === 'USD')?.deal_bas_r?.replace(/,/g, '');
        if (usdRate) {
          this.exchangeRateUSD = Number(usdRate);
          await this.saveExchangeRate(usdRate, searchDate);
          return;
        }
      }

      searchDate = shiftDate(CURRENT_DATE, attempt + 1);
    }

    throw new Error('No USD rate found in API');
  }

  async fetchFromNaver() {
    // finance.naver.com HTML 구조가 바뀌어 파싱이 깨졌으므로 JSON API를 사용한다.
    const url = 'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW';
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = await response.json();
      const exchangeRateUSD = Number(json?.result?.calcPrice ?? String(json?.result?.closePrice ?? '').replace(/,/g, ''));
      if (!Number.isFinite(exchangeRateUSD) || exchangeRateUSD <= 0) throw new Error('Failed to parse USD rate from Naver');

      this.exchangeRateUSD = exchangeRateUSD;
      await this.saveExchangeRate(exchangeRateUSD, CURRENT_DATE);
    } catch {
      // 조회 실패 시 마지막으로 저장된 환율을 계속 사용한다.
      this.exchangeRateUSD = Number(this.storages.exchangeRateUSD) || null;
    }
  }

  async saveExchangeRate(rate, date) {
    this.storages.exchangeRateUSD = rate ?? this.storages.exchangeRateUSD;
    this.storages.updatedDate = date ?? this.storages.updatedDate;
    await chrome.storage.local.set({
      exchangeRateUSD: this.storages.exchangeRateUSD,
      updatedDate: this.storages.updatedDate,
    });
    if (this.port) this.port.postMessage({ type: 'exchangeRateUSD', data: this.storages.exchangeRateUSD });
  }
}

//  ExchangeData 클래스
// 공통: 스냅샷 보관, 실시간 갱신 병합, 지정가 알림 확인, 팝업 전달.
// 거래소별: fetchMarkets / fetchInitialTickers / getSubscriptions / parseMessage 만 구현한다.
const TICKER_CHUNK_SIZE = 100;
const HEARTBEAT_INTERVAL = 20000;
// 이 시간 동안 메시지가 없으면 반쯤 끊긴 연결로 보고 다시 연결한다. 구독한 거래소는 모두 초 단위로 메시지를 보낸다.
const STALE_SOCKET_MS = 60_000;
// 시작할 때 마켓 목록을 못 받으면 30초부터 늘려 가며 최대 10분 간격으로 다시 시도한다.
const START_RETRY_MIN_MS = 30_000;
const START_RETRY_MAX_MS = 10 * 60_000;
// OKX·Bybit는 종목별로 초당 수백~수천 건을 보내므로 해외 거래소 틱은 모아서 팝업에 전달한다.
const GLOBAL_FORWARD_INTERVAL = 200;

class ExchangeData {
  constructor(name, apiUrl, wsUrl, { isGlobal = false } = {}) {
    this.name = name;
    this.apiUrl = apiUrl;
    this.wsUrl = wsUrl;
    // 해외(USDT) 거래소는 팝업에서 바이낸스와 같은 필드 형태를 사용한다.
    this.isGlobal = isGlobal;
    this.socket = null;
    this.port = null;
    this.markets = [];
    this.marketsInfo = {};
    this.tickers = null;
    this.initialReconnectDelay = 2000;
    this.currentReconnectDelay = this.initialReconnectDelay;
    this.maxReconnectDelay = 10000;
    this.backoffFactor = 1.5;
    this.isPopupActive = false;
    this.isReconnecting = false;
    this.heartbeatId = null;
    this.pendingTicks = {};
    this.forwardTimer = null;
    this.lastMessageAt = 0;
    // started: 마켓 목록과 첫 시세를 받았다. suspended: 화면이 닫혀 있고 쓰는 곳이 없어 연결을 끊어 뒀다.
    this.started = false;
    this.suspended = false;
    this.startTimer = null;
    this.startRetryDelay = START_RETRY_MIN_MS;
  }

  forwardTicks(updates) {
    if (!this.isGlobal) {
      this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: updates[0].tick });
      return;
    }
    for (const { key, tick } of updates) this.pendingTicks[key] = tick;
    if (this.forwardTimer) return;
    this.forwardTimer = setTimeout(() => {
      this.forwardTimer = null;
      const ticks = Object.values(this.pendingTicks);
      this.pendingTicks = {};
      if (ticks.length && this.isPopupActive && this.port) {
        this.port.postMessage({ type: `${this.name}WebsocketTicker`, data: ticks });
      }
    }, GLOBAL_FORWARD_INTERVAL);
  }

  // entries: [{ key, ticker, price, changeRate, koreanName? }]
  setSnapshot(entries) {
    const tickers = {};
    const store = allExchangesTickers[this.name];
    for (const { key, ticker, price, changeRate, volume = 0, koreanName = null } of entries) {
      if (!key) continue;
      if (price) checkPriceAlerts(this.name, key, price);
      store[key] = {
        ...store[key],
        exchange: this.name,
        market: key,
        currentPrice: price ?? 0,
        changeRate: changeRate ?? 0,
        // 24시간 거래대금(호가 통화 기준). 거래소 간 가격 차이에서 거래가 끊긴 마켓을 거르는 데 쓴다.
        volume: Number(volume) || 0,
        koreanName,
      };
      tickers[key] = ticker;
    }
    this.tickers = tickers;
    if (this.port && this.isPopupActive) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  // 업비트·빗썸 공통 REST 스냅샷
  async fetchInitialTickers() {
    try {
      // 마켓 전체를 한 URL에 넣으면 빗썸이 414(URI Too Long)로 거부하므로 나눠서 요청한다.
      // 한꺼번에 보내면 업비트가 초당 요청 한도(429)로 일부를 거절해 스냅샷 전체가 비므로 차례로 보내고, 429면 잠시 뒤 다시 보낸다.
      const responses = [];
      for (let i = 0; i < this.markets.length; i += TICKER_CHUNK_SIZE) {
        const chunk = this.markets.slice(i, i + TICKER_CHUNK_SIZE);
        responses.push(await this.fetchTickerChunk(chunk));
      }
      this.setSnapshot(
        responses.flat().map(ticker => ({
          key: ticker.market,
          ticker: { ...ticker, ...this.marketsInfo[ticker.market] },
          price: ticker.trade_price,
          changeRate: (ticker.signed_change_rate ?? 0) * 100,
          volume: ticker.acc_trade_price_24h,
          koreanName: this.marketsInfo[ticker.market]?.korean_name ?? null,
        })),
      );
    } catch (error) {
      console.warn(error);
    }
  }

  async fetchTickerChunk(chunk, attempt = 0) {
    const response = await fetch(`${this.apiUrl}/ticker?markets=${chunk.join(',')}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 429 && attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
      return this.fetchTickerChunk(chunk, attempt + 1);
    }
    if (!response.ok) throw new Error(`${this.name} ticker ${response.status}`);
    return response.json();
  }

  // 업비트·빗썸 공통 구독/파싱
  getSubscriptions() {
    return [JSON.stringify([{ ticket: 'como' }, { type: 'ticker', codes: this.markets }])];
  }

  parseMessage(message) {
    if (!message?.code) return [];
    return [
      {
        key: message.code,
        tick: message,
        price: Number(message.trade_price) || 0,
        changeRate: (Number(message.signed_change_rate) || 0) * 100,
        volume: Number(message.acc_trade_price_24h) || undefined,
      },
    ];
  }

  getHeartbeatMessage() {
    return null;
  }

  connectPopup(port) {
    if (!port || port.name !== 'popup') return;
    this.port = port;
    port.onDisconnect.addListener(() => {
      if (this.port === port) this.port = null;
    });
    if (this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }

  connectWebSocket() {
    if (this.suspended) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.socket) this.dropSocket();

    const socket = new WebSocket(this.wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.lastMessageAt = Date.now();
      this.isReconnecting = false;
      this.currentReconnectDelay = this.initialReconnectDelay;
      // 일부 거래소(Bitget 등)는 초당 메시지 수를 제한하므로 구독 메시지를 나눠 보낸다.
      this.getSubscriptions().forEach((subscription, index) =>
        setTimeout(() => socket.readyState === WebSocket.OPEN && socket.send(subscription), index * 120),
      );

      const heartbeat = this.getHeartbeatMessage();
      clearInterval(this.heartbeatId);
      if (heartbeat) {
        this.heartbeatId = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(heartbeat);
        }, HEARTBEAT_INTERVAL);
      }
    };

    socket.onmessage = async event => {
      this.lastMessageAt = Date.now();
      try {
        let data = event.data;
        if (data instanceof Blob) data = await data.text();
        if (data === 'pong') return;

        this.applyUpdates(this.parseMessage(JSON.parse(data)));
      } catch (error) {
        console.warn(error);
      }
    };

    const handleClose = () => {
      if (this.socket !== socket) return;
      clearInterval(this.heartbeatId);
      this.socket = null;
      this.reconnectWebSocket();
    };
    socket.onerror = handleClose;
    socket.onclose = handleClose;
  }

  // 실시간 갱신(웹소켓·폴링)을 전 거래소 시세에 반영하고, 알림을 확인하고, 팝업에 보낸다.
  applyUpdates(updates) {
    if (!updates.length) return;
    const store = allExchangesTickers[this.name];
    for (const { key, tick, price, changeRate, volume } of updates) {
      store[key] = { ...store[key], exchange: this.name, market: key, currentPrice: price, changeRate };
      if (volume) store[key].volume = volume;
      checkPriceAlerts(this.name, key, price);
      this.mergeTicker(key, tick);
    }
    if (this.isPopupActive && this.port) this.forwardTicks(updates);
  }

  // 팝업을 다시 열 때 보내는 스냅샷이 최초 REST 응답에 머물지 않도록 웹소켓 갱신분을 병합한다.
  mergeTicker(key, data) {
    const current = this.tickers?.[key];
    if (current) Object.assign(current, data);
  }

  // 소켓을 이벤트 없이 닫는다. 닫힘 이벤트로 재연결이 또 걸리지 않게 핸들러를 먼저 뗀다.
  dropSocket() {
    const socket = this.socket;
    this.socket = null;
    clearInterval(this.heartbeatId);
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    try {
      socket.close();
    } catch {
      // 이미 닫힌 소켓
    }
  }

  // 절전·네트워크 변경 뒤 반쯤 끊긴 연결은 onclose가 오지 않아 시세와 알림이 조용히 멈춘다.
  checkStale() {
    if (this.suspended || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMessageAt < STALE_SOCKET_MS) return;
    this.dropSocket();
    this.reconnectWebSocket();
  }

  reconnectWebSocket() {
    if (this.isReconnecting || this.suspended) {
      return;
    }

    this.isReconnecting = true;
    // 네트워크가 돌아올 때 여러 거래소가 한꺼번에 다시 붙지 않도록 지연을 조금씩 흩뜨린다.
    const delay = this.currentReconnectDelay * (0.8 + Math.random() * 0.4);

    setTimeout(() => {
      if (this.suspended) {
        this.isReconnecting = false;
        return;
      }
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.isReconnecting = false;
        this.currentReconnectDelay = this.initialReconnectDelay;
        return;
      }

      this.connectWebSocket();
      this.currentReconnectDelay = Math.min(this.currentReconnectDelay * this.backoffFactor, this.maxReconnectDelay);
      this.isReconnecting = false;
    }, delay);
  }

  async start() {
    if (this.suspended) return;
    clearTimeout(this.startTimer);
    const markets = await this.fetchMarkets();
    if (!markets.length) {
      // 처음에 한 번 실패했다고 이 거래소가 세션 내내 비어 있지 않게 다시 시도한다.
      this.startTimer = setTimeout(() => this.start().catch(console.warn), this.startRetryDelay);
      this.startRetryDelay = Math.min(this.startRetryDelay * 2, START_RETRY_MAX_MS);
      return;
    }
    this.startRetryDelay = START_RETRY_MIN_MS;
    this.markets = markets;
    await this.fetchInitialTickers();
    this.started = true;
    this.connectWebSocket();
  }

  // 신규 상장 종목도 시세·지정가 알림을 받도록 마켓 목록을 주기적으로 다시 받는다. 바뀌었으면 스냅샷과 구독을 새로 한다.
  async refreshMarkets() {
    if (this.suspended || !this.started) return;
    const markets = await this.fetchMarkets();
    if (!markets.length) return;
    const known = new Set(this.markets);
    if (markets.length === this.markets.length && markets.every(market => known.has(market))) {
      this.initialList = null;
      return;
    }
    this.markets = markets;
    await this.fetchInitialTickers();
    if (this.socket) {
      this.dropSocket();
      this.connectWebSocket();
    }
  }

  // 화면이 닫혀 있고 배지·알림에도 쓰지 않는 거래소는 연결을 끊어 배터리와 데이터를 아낀다.
  suspend() {
    if (this.suspended) return;
    this.suspended = true;
    clearTimeout(this.startTimer);
    this.dropSocket();
  }

  async resume() {
    if (!this.suspended) return;
    this.suspended = false;
    if (!this.started) {
      await this.start();
      return;
    }
    // 끊겨 있던 동안 바뀐 시세를 REST로 다시 받고 연결한다.
    const markets = await this.fetchMarkets();
    if (this.suspended) return;
    if (markets.length) this.markets = markets;
    await this.fetchInitialTickers();
    this.connectWebSocket();
  }

  setPopupActive(active) {
    this.isPopupActive = active;
    if (this.port && this.isPopupActive && this.tickers) {
      this.port.postMessage({ type: `${this.name}Tickers`, data: this.tickers });
    }
  }
}

// 해외 거래소 시세를 바이낸스 24hrTicker(스냅샷)·웹소켓 필드 형태로 맞춘다.
// 팝업은 c <= b 이면 BID(상승색)로 표시하므로 직전 가격 대비 방향으로 b를 채운다.
function toGlobalTick(symbol, { last, open, high, low, quoteVolume }, prev) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  // REST 응답과 같은 소수 8자리 문자열로 맞춰 부동소수점 오차가 표시되지 않게 한다.
  const priceChange = change.toFixed(8);
  const prevPrice = Number(prev?.c ?? prev?.lastPrice);
  return {
    s: symbol,
    c: String(last),
    o: String(open),
    h: String(high),
    l: String(low),
    q: String(quoteVolume),
    p: priceChange,
    priceChange,
    P: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
    b: Number.isFinite(prevPrice) && close >= prevPrice ? String(last) : '0',
  };
}

function toGlobalSnapshot(symbol, { last, open, high, low, quoteVolume }) {
  const close = Number(last);
  const openPrice = Number(open);
  const change = close - openPrice;
  return {
    symbol,
    market: symbol,
    lastPrice: String(last),
    openPrice: String(open),
    highPrice: String(high),
    lowPrice: String(low),
    quoteVolume: String(quoteVolume),
    priceChange: change.toFixed(8),
    priceChangePercent: openPrice ? ((change / openPrice) * 100).toFixed(3) : '0',
  };
}

const globalEntry = (symbol, fields) => {
  const ticker = toGlobalSnapshot(symbol, fields);
  return {
    key: symbol,
    ticker,
    price: Number(ticker.lastPrice),
    changeRate: Number(ticker.priceChangePercent),
    volume: ticker.quoteVolume,
  };
};

const globalUpdate = (exchange, symbol, fields) => {
  const tick = toGlobalTick(symbol, fields, exchange.tickers?.[symbol]);
  return { key: symbol, tick, price: Number(tick.c), changeRate: Number(tick.P), volume: Number(tick.q) || undefined };
};

const GLOBAL_QUOTES = ['USDT', 'BTC'];
const hasGlobalQuote = symbol => GLOBAL_QUOTES.some(quote => symbol.endsWith(quote));

//  거래소별 클래스
class UpbitData extends ExchangeData {
  constructor() {
    super('upbit', 'https://api.upbit.com/v1', 'wss://api.upbit.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const tickers = await response.json();
      this.marketsInfo = tickers.reduce((acc, ticker) => {
        const caution = ticker.market_event?.caution ? Object.values(ticker.market_event.caution).some(Boolean) : false;
        acc[ticker.market] = { ...ticker, market_event: { ...ticker.market_event, caution } };
        return acc;
      }, {});
      return tickers.map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }
}

class BithumbData extends ExchangeData {
  constructor() {
    super('bithumb', 'https://api.bithumb.com/v1', 'wss://ws-api.bithumb.com/websocket/v1');
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/all?isDetails=true`);
      const data = await response.json();
      this.marketsInfo = Object.fromEntries(data.map(ticker => [ticker.market, { ...ticker }]));
      return data.map(ticker => ticker.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }
}

class BinanceData extends ExchangeData {
  constructor() {
    // !ticker@arr 스트림은 연결은 되지만 더 이상 메시지를 보내지 않아 !miniTicker@arr를 사용한다.
    super('binance', 'https://api.binance.com/api/v3', 'wss://stream.binance.com:9443/ws/!miniTicker@arr', {
      isGlobal: true,
    });
  }

  // exchangeInfo(약 17MB)는 쓰지 않으므로 받지 않고, 24시간 시세(약 2MB)에서 마켓 목록을 얻는다.
  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/ticker/24hr`, { headers: { Accept: 'application/json' } });
      const tickersArray = await response.json();
      this.initialList = tickersArray.filter(ticker => ticker.symbol && Number(ticker.lastPrice) !== 0);
      return this.initialList.map(ticker => ticker.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(ticker => ({
        key: ticker.symbol,
        ticker: { ...ticker, market: ticker.symbol },
        price: Number(ticker.lastPrice) || 0,
        changeRate: Number(ticker.priceChangePercent) || 0,
        volume: ticker.quoteVolume,
      })),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    return [];
  }

  parseMessage(message) {
    if (!Array.isArray(message)) return [];
    return message.map(t => globalUpdate(this, t.s, { last: t.c, open: t.o, high: t.h, low: t.l, quoteVolume: t.q }));
  }
}

class BybitData extends ExchangeData {
  constructor() {
    super('bybit', 'https://api.bybit.com/v5', 'wss://stream.bybit.com/v5/public/spot', { isGlobal: true });
  }

  static fields(t) {
    return {
      last: t.lastPrice,
      open: t.prevPrice24h,
      high: t.highPrice24h,
      low: t.lowPrice24h,
      quoteVolume: t.turnover24h,
    };
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/tickers?category=spot`);
      const { result } = await response.json();
      this.initialList = result.list.filter(t => hasGlobalQuote(t.symbol) && Number(t.lastPrice) > 0);
      return this.initialList.map(t => t.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.symbol, BybitData.fields(t))));
    this.initialList = null;
  }

  // Bybit 현물은 요청당 구독 10개 제한이 있다.
  getSubscriptions() {
    const messages = [];
    for (let i = 0; i < this.markets.length; i += 10) {
      messages.push(JSON.stringify({ op: 'subscribe', args: this.markets.slice(i, i + 10).map(s => `tickers.${s}`) }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return JSON.stringify({ op: 'ping' });
  }

  parseMessage(message) {
    const t = message?.data;
    if (!message?.topic?.startsWith('tickers.') || !t?.symbol) return [];
    return [globalUpdate(this, t.symbol, BybitData.fields(t))];
  }
}

class OkxData extends ExchangeData {
  constructor() {
    super('okx', 'https://www.okx.com/api/v5', 'wss://ws.okx.com:8443/ws/v5/public', { isGlobal: true });
    // 팝업·알림에서는 BTCUSDT 형태를 쓰고, OKX API에는 BTC-USDT 형태를 쓴다.
    this.instIds = {};
  }

  static symbol(instId) {
    return instId.replace('-', '');
  }

  static fields(t) {
    return { last: t.last, open: t.open24h, high: t.high24h, low: t.low24h, quoteVolume: t.volCcy24h };
  }

  async fetchMarkets() {
    try {
      const response = await fetch(`${this.apiUrl}/market/tickers?instType=SPOT`);
      const { data } = await response.json();
      this.initialList = data.filter(
        t => GLOBAL_QUOTES.some(quote => t.instId.endsWith(`-${quote}`)) && Number(t.last) > 0,
      );
      this.instIds = Object.fromEntries(this.initialList.map(t => [OkxData.symbol(t.instId), t.instId]));
      return Object.keys(this.instIds);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(t => {
        const entry = globalEntry(OkxData.symbol(t.instId), OkxData.fields(t));
        entry.ticker.instId = t.instId;
        return entry;
      }),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    const args = this.markets.map(symbol => ({ channel: 'tickers', instId: this.instIds[symbol] }));
    const messages = [];
    for (let i = 0; i < args.length; i += TICKER_CHUNK_SIZE) {
      messages.push(JSON.stringify({ op: 'subscribe', args: args.slice(i, i + TICKER_CHUNK_SIZE) }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return 'ping';
  }

  parseMessage(message) {
    if (message?.arg?.channel !== 'tickers' || !Array.isArray(message.data)) return [];
    return message.data.map(t => globalUpdate(this, OkxData.symbol(t.instId), OkxData.fields(t)));
  }
}

class CoinbaseData extends ExchangeData {
  constructor() {
    super('coinbase', 'https://api.exchange.coinbase.com', 'wss://ws-feed.exchange.coinbase.com', { isGlobal: true });
    // 팝업·알림에서는 BTCUSD 형태를 쓰고, Coinbase API에는 BTC-USD 형태를 쓴다.
    this.productIds = {};
  }

  static symbol(productId) {
    return productId.replace('-', '');
  }

  // Coinbase는 거래량을 기준 코인 수량으로 주므로 가격을 곱해 USD 거래대금으로 맞춘다.
  static fields(t, last = t.last) {
    return {
      last,
      open: t.open ?? t.open_24h,
      high: t.high ?? t.high_24h,
      low: t.low ?? t.low_24h,
      quoteVolume: Number(t.volume ?? t.volume_24h) * Number(last),
    };
  }

  async fetchMarkets() {
    try {
      const [products, stats] = await Promise.all([
        fetchJson(`${this.apiUrl}/products`),
        fetchJson(`${this.apiUrl}/products/stats`),
      ]);
      this.initialList = products
        .filter(p => p.quote_currency === 'USD' && p.status === 'online' && !p.trading_disabled)
        .map(p => ({ id: p.id, stats: stats[p.id]?.stats_24hour }))
        .filter(p => Number(p.stats?.last) > 0);
      this.productIds = Object.fromEntries(this.initialList.map(p => [CoinbaseData.symbol(p.id), p.id]));
      return Object.keys(this.productIds);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(p => {
        const entry = globalEntry(CoinbaseData.symbol(p.id), CoinbaseData.fields(p.stats));
        entry.ticker.productId = p.id;
        return entry;
      }),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    return [JSON.stringify({ type: 'subscribe', product_ids: Object.values(this.productIds), channels: ['ticker'] })];
  }

  parseMessage(message) {
    if (message?.type !== 'ticker' || !message.product_id) return [];
    return [globalUpdate(this, CoinbaseData.symbol(message.product_id), CoinbaseData.fields(message, message.price))];
  }
}

// Bitget: 현물 3천여 마켓 중 거래대금 상위만 실시간으로 받는다 (연결당 구독 1000개 제한).
const BITGET_MAX_MARKETS = 900;

class BitgetData extends ExchangeData {
  constructor() {
    super('bitget', 'https://api.bitget.com/api/v2', 'wss://ws.bitget.com/v2/ws/public', { isGlobal: true });
  }

  static fields(t) {
    return { last: t.lastPr, open: t.open ?? t.open24h, high: t.high24h, low: t.low24h, quoteVolume: t.quoteVolume };
  }

  async fetchMarkets() {
    try {
      const { data } = await fetchJson(`${this.apiUrl}/spot/market/tickers`);
      this.initialList = data
        .filter(t => hasGlobalQuote(t.symbol) && Number(t.lastPr) > 0)
        .sort((a, b) => Number(b.usdtVolume) - Number(a.usdtVolume))
        .slice(0, BITGET_MAX_MARKETS);
      return this.initialList.map(t => t.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.symbol, BitgetData.fields(t))));
    this.initialList = null;
  }

  getSubscriptions() {
    const messages = [];
    for (let i = 0; i < this.markets.length; i += 50) {
      const args = this.markets.slice(i, i + 50).map(instId => ({ instType: 'SPOT', channel: 'ticker', instId }));
      messages.push(JSON.stringify({ op: 'subscribe', args }));
    }
    return messages;
  }

  getHeartbeatMessage() {
    return 'ping';
  }

  parseMessage(message) {
    if (message?.arg?.channel !== 'ticker' || !Array.isArray(message.data)) return [];
    return message.data.map(t => globalUpdate(this, t.instId, BitgetData.fields(t)));
  }
}

// Kraken: USD 마켓. REST 이름(XBT)과 웹소켓 이름(BTC)이 달라 BTC 기준 심볼(BTCUSD)로 맞춘다.
// EUR/USD 같은 외환 페어와 스테이블코인 페어는 코인 시세가 아니므로 뺀다.
const NON_CRYPTO_BASES = new Set(['EUR', 'GBP', 'AUD', 'CAD', 'CHF', 'JPY', 'USDT', 'USDC', 'DAI', 'PYUSD', 'TUSD', 'USDS', 'USDG', 'RLUSD', 'EURT', 'EURQ', 'EURR', 'USDQ', 'USDR']);
class KrakenData extends ExchangeData {
  constructor() {
    super('kraken', 'https://api.kraken.com/0/public', 'wss://ws.kraken.com/v2', { isGlobal: true });
    this.wsSymbols = {};
  }

  static symbol(wsname) {
    const [base, quote] = wsname.split('/');
    return `${base === 'XBT' ? 'BTC' : base === 'XDG' ? 'DOGE' : base}${quote}`;
  }

  async fetchMarkets() {
    try {
      const [pairs, tickers] = await Promise.all([
        fetchJson(`${this.apiUrl}/AssetPairs`),
        fetchJson(`${this.apiUrl}/Ticker`),
      ]);
      this.initialList = Object.entries(pairs.result)
        .filter(
          ([, pair]) =>
            pair.wsname?.endsWith('/USD') && pair.status === 'online' && !NON_CRYPTO_BASES.has(pair.wsname.split('/')[0]),
        )
        .map(([key, pair]) => ({ symbol: KrakenData.symbol(pair.wsname), wsname: pair.wsname, ticker: tickers.result[key] }))
        .filter(item => Number(item.ticker?.c?.[0]) > 0);
      // 웹소켓 v2는 XBT 대신 BTC처럼 표준 코드를 쓴다.
      this.wsSymbols = Object.fromEntries(
        this.initialList.map(({ symbol, wsname }) => [symbol, wsname.replace(/^XBT\//, 'BTC/').replace(/^XDG\//, 'DOGE/')]),
      );
      return this.initialList.map(item => item.symbol);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot(
      (this.initialList ?? []).map(({ symbol, ticker }) =>
        globalEntry(symbol, {
          last: ticker.c[0],
          open: ticker.o,
          high: ticker.h[1],
          low: ticker.l[1],
          quoteVolume: Number(ticker.v[1]) * Number(ticker.p[1]),
        }),
      ),
    );
    this.initialList = null;
  }

  getSubscriptions() {
    const symbols = Object.values(this.wsSymbols);
    const messages = [];
    for (let i = 0; i < symbols.length; i += TICKER_CHUNK_SIZE) {
      messages.push(
        JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: symbols.slice(i, i + TICKER_CHUNK_SIZE) } }),
      );
    }
    return messages;
  }

  parseMessage(message) {
    if (message?.channel !== 'ticker' || !Array.isArray(message.data)) return [];
    return message.data.map(t =>
      globalUpdate(this, KrakenData.symbol(t.symbol), {
        last: t.last,
        open: t.last - t.change,
        high: t.high,
        low: t.low,
        quoteVolume: Number(t.volume) * Number(t.vwap ?? t.last),
      }),
    );
  }
}

// CoinDCX: 인도 1위 거래소. 공개 웹소켓이 socket.io라 REST 전체 시세를 주기적으로 받는다.
// 팝업에서 보고 있을 때만 자주(3초) 받고, 아니면 알림·포트폴리오용으로 1분마다 받는다.
const COINDCX_ACTIVE_INTERVAL = 3000;
const COINDCX_IDLE_INTERVAL = 60_000;

class CoindcxData extends ExchangeData {
  constructor() {
    super('coindcx', 'https://api.coindcx.com/exchange', null, { isGlobal: true });
    this.pollTimer = null;
  }

  static fields(t) {
    const last = Number(t.last_price);
    const changeRate = Number(t.change_24_hour) || 0;
    return {
      last,
      open: last / (1 + changeRate / 100),
      high: t.high,
      low: t.low,
      // volume은 호가 통화(INR·USDT) 기준 거래대금이다.
      quoteVolume: t.volume,
    };
  }

  async fetchTickers() {
    const tickers = await fetchJson(`${this.apiUrl}/ticker`);
    return tickers.filter(t => /(INR|USDT)$/.test(t.market) && Number(t.last_price) > 0);
  }

  async fetchMarkets() {
    try {
      this.initialList = await this.fetchTickers();
      return this.initialList.map(t => t.market);
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async fetchInitialTickers() {
    this.setSnapshot((this.initialList ?? []).map(t => globalEntry(t.market, CoindcxData.fields(t))));
    this.initialList = null;
  }

  async poll() {
    if (this.suspended) return;
    try {
      const updates = (await this.fetchTickers()).map(t => globalUpdate(this, t.market, CoindcxData.fields(t)));
      this.applyUpdates(updates);
    } catch (error) {
      console.warn(error);
    }
    clearTimeout(this.pollTimer);
    const interval = this.isPopupActive && this.port ? COINDCX_ACTIVE_INTERVAL : COINDCX_IDLE_INTERVAL;
    this.pollTimer = setTimeout(() => this.poll(), interval);
  }

  connectWebSocket() {
    if (this.suspended) return;
    if (!this.pollTimer) this.pollTimer = setTimeout(() => this.poll(), COINDCX_IDLE_INTERVAL);
  }

  suspend() {
    super.suspend();
    clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  // 팝업에서 이 거래소를 열면 바로 빠른 주기로 바꾼다.
  setPopupActive(active) {
    super.setPopupActive(active);
    if (active && this.pollTimer) this.poll();
  }

  connectPopup(port) {
    super.connectPopup(port);
    if (this.isPopupActive && this.pollTimer) this.poll();
  }
}

// 9. 활성 거래소 관리
const STORAGE_KEY = 'activeExchangePlatform';
let activeExchange = null;

async function saveActiveExchange(exchange) {
  await chrome.storage.local.set({ [STORAGE_KEY]: exchange });
  activeExchange = exchange;
}

async function loadActiveExchange() {
  const { [STORAGE_KEY]: state } = await chrome.storage.local.get(STORAGE_KEY);
  return exchanges[state] ? state : 'upbit';
}

function getExchangeInstance(name) {
  return exchanges[name] ?? null;
}

async function handleExchangeChange(exchange) {
  if (activeExchange === exchange) return;

  const prev = getExchangeInstance(activeExchange);
  if (prev) prev.setPopupActive(false);

  activeExchange = exchange;
  // 다른 창도 같은 거래소로 맞춘다. 한쪽만 바뀌면 다른 창은 오지 않는 시세를 기다리며 멈춘다.
  // 화면은 거래소가 바뀌면 시세를 비우므로, 새 거래소 시세보다 먼저 보낸다.
  if (activePort) activePort.postMessage({ type: 'activeExchange', data: exchange });

  const next = getExchangeInstance(exchange);
  if (next) {
    next.setPopupActive(true);
    if (activePort) next.connectPopup(activePort);
  }

  await saveActiveExchange(exchange);
}

// 10. 메인 실행 로직
const exchangeRateManager = new ExchangeRateManager();
const exchanges = {
  upbit: new UpbitData(),
  bithumb: new BithumbData(),
  binance: new BinanceData(),
  bybit: new BybitData(),
  okx: new OkxData(),
  coinbase: new CoinbaseData(),
  bitget: new BitgetData(),
  kraken: new KrakenData(),
  coindcx: new CoindcxData(),
};

// 팝업과 사이드 패널이 동시에 열릴 수 있어 연결된 화면 모두에 보낸다.
// activePort는 연결된 화면이 하나라도 있으면 broadcastPort, 없으면 null이다.
const popupPorts = new Set();
const broadcastPort = {
  name: 'popup',
  postMessage(message) {
    popupPorts.forEach(port => {
      try {
        port.postMessage(message);
      } catch (error) {
        popupPorts.delete(port);
      }
    });
  },
  onDisconnect: { addListener() {} },
};
let activePort = null;
let maxChangeRateIntervalId = null;

// 화면이 모두 닫히면 1분 뒤 배지·지정가 알림·알림 규칙에 쓰는 거래소만 연결해 둔다.
// 9개 거래소가 종일 초당 수많은 메시지를 보내면 노트북 배터리와 데이터를 계속 쓴다.
const IDLE_SUSPEND_DELAY = 60_000;
let idleTimer = null;

function exchangesNeededWhenIdle() {
  const needed = new Set();
  const badge = getBadgeSettings();
  if (badge.enabled) needed.add(badge.exchange);
  for (const [exchange, tickers] of Object.entries(alertCache.priceAlerts)) {
    if (Object.values(tickers ?? {}).some(list => list?.length)) needed.add(exchange);
  }
  for (const rule of ruleCache.rules) {
    needed.add(rule.exchange);
    // 김프는 바이낸스 USDT 가격과 비교한다.
    if (rule.type === 'kimchi') needed.add('binance');
  }
  return needed;
}

function applyIdleConnections() {
  idleTimer = null;
  if (popupPorts.size) return;
  const needed = exchangesNeededWhenIdle();
  Object.entries(exchanges).forEach(([name, exchange]) =>
    needed.has(name) ? exchange.resume().catch(console.warn) : exchange.suspend(),
  );
}

function scheduleIdleConnections(delay = IDLE_SUSPEND_DELAY) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(applyIdleConnections, delay);
}

function resumeAllExchanges() {
  clearTimeout(idleTimer);
  idleTimer = null;
  Object.values(exchanges).forEach(exchange => exchange.resume().catch(console.warn));
}

// 화면이 닫혀 있는 동안 배지·알림 설정이 바뀌면 필요한 거래소를 다시 고른다.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || popupPorts.size) return;
  if (changes.priceAlerts || changes[RULES_KEY] || changes[BADGE_STORAGE_KEY]) scheduleIdleConnections(1000);
});

setInterval(() => Object.values(exchanges).forEach(exchange => exchange.checkStale()), 15_000);
setInterval(() => Object.values(exchanges).forEach(exchange => exchange.refreshMarkets().catch(console.warn)), 30 * 60_000);

// 주기적으로 받아오는 부가 데이터(법정화폐 환율, 시장 지표). 팝업이 연결되면 마지막 값을 바로 보낸다.
class PolledData {
  constructor(type, intervalMs, load) {
    this.type = type;
    this.intervalMs = intervalMs;
    this.load = load;
    this.value = null;
  }

  async refresh() {
    try {
      const value = await this.load();
      if (!value) return;
      this.value = value;
      this.post(activePort);
    } catch (error) {
      console.warn(error);
    }
  }

  start() {
    this.refresh();
    setInterval(() => this.refresh(), this.intervalMs);
  }

  post(port) {
    if (port && this.value) port.postMessage({ type: this.type, data: this.value });
  }
}

const fetchJson = async url => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
};

const polledData = [
  // 입출금이 멈춘 코인. 빗썸만 공개 API로 준다(업비트는 인증이 필요하다). 멈춘 코인만 보내 메시지를 작게 둔다.
  new PolledData('walletStatus', 10 * 60 * 1000, async () => {
    const { status, data } = await fetchJson('https://api.bithumb.com/public/assetsstatus/ALL');
    if (status !== '0000' || !data) return null;
    const bithumb = {};
    for (const [coin, { deposit_status: deposit, withdrawal_status: withdraw }] of Object.entries(data)) {
      if (deposit !== 1 || withdraw !== 1) bithumb[coin] = { deposit: deposit === 1, withdraw: withdraw === 1 };
    }
    return { bithumb };
  }),
  // USD 기준 166개 법정화폐 환율
  new PolledData('fiatRates', 6 * 60 * 60 * 1000, async () => {
    const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
    return data?.result === 'success' ? data.rates : null;
  }),
  // 공포·탐욕 지수, BTC 도미넌스, BTC 펀딩비. 하나가 실패해도 나머지는 보낸다.
  new PolledData('marketStats', 5 * 60 * 1000, async () => {
    const [fearGreed, global, funding] = await Promise.allSettled([
      fetchJson('https://api.alternative.me/fng/'),
      fetchJson('https://api.coingecko.com/api/v3/global'),
      fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
    ]);
    const fng = fearGreed.value?.data?.[0];
    return {
      fearGreed: fng ? { value: Number(fng.value), classification: fng.value_classification } : null,
      btcDominance: global.value?.data?.market_cap_percentage?.btc ?? null,
      fundingRate: funding.value?.lastFundingRate != null ? Number(funding.value.lastFundingRate) : null,
    };
  }),
];

// 파생 지표: 바이낸스 USDT 무기한 선물의 펀딩비 순위(1분마다)와 강제 청산 스트림(최근 1시간 누적).
const FUNDING_LIST_SIZE = 5;
const derivatives = new PolledData('derivatives', 60 * 1000, async () => {
  const list = await fetchJson('https://fapi.binance.com/fapi/v1/premiumIndex');
  const rates = list
    .filter(item => item.symbol.endsWith('USDT') && item.lastFundingRate !== '')
    .map(item => ({ symbol: item.symbol, rate: Number(item.lastFundingRate), nextFundingTime: item.nextFundingTime }))
    .filter(item => Number.isFinite(item.rate))
    .sort((a, b) => b.rate - a.rate);
  return { highest: rates.slice(0, FUNDING_LIST_SIZE), lowest: rates.slice(-FUNDING_LIST_SIZE).reverse(), updatedAt: Date.now() };
});
derivatives.post = () => {}; // 팝업이 열 때 메시지로 받아 간다.

const LIQUIDATION_WINDOW = 60 * 60 * 1000;
const liquidations = [];
let liquidationSocket = null;
function connectLiquidations() {
  // 심볼마다 1초에 최대 1건(가장 큰 청산)만 오는 스냅샷 스트림이라 가볍다.
  // 예전 /ws 경로는 연결은 되지만 메시지를 보내지 않는다. 시장 데이터 스트림은 /market/ws를 쓴다.
  liquidationSocket = new WebSocket('wss://fstream.binance.com/market/ws/!forceOrder@arr');
  liquidationSocket.onmessage = event => {
    try {
      const order = JSON.parse(event.data)?.o;
      if (!order) return;
      const usd = Number(order.ap) * Number(order.z || order.q);
      if (!Number.isFinite(usd)) return;
      // 매도 체결 = 롱 포지션 청산, 매수 체결 = 숏 포지션 청산
      liquidations.push({ symbol: order.s, side: order.S === 'SELL' ? 'long' : 'short', usd, price: Number(order.ap), time: order.T });
      const cutoff = Date.now() - LIQUIDATION_WINDOW;
      while (liquidations.length && liquidations[0].time < cutoff) liquidations.shift();
      if (liquidations.length > 5000) liquidations.splice(0, liquidations.length - 5000);
    } catch (error) {
      console.warn(error);
    }
  };
  liquidationSocket.onclose = () => setTimeout(connectLiquidations, 5000);
  liquidationSocket.onerror = () => liquidationSocket?.close();
}
const startedAt = Date.now();
function summarizeLiquidations() {
  const cutoff = Date.now() - LIQUIDATION_WINDOW;
  const recent = liquidations.filter(item => item.time >= cutoff);
  const sum = side => recent.filter(item => item.side === side).reduce((total, item) => total + item.usd, 0);
  return {
    longUsd: sum('long'),
    shortUsd: sum('short'),
    count: recent.length,
    largest: [...recent].sort((a, b) => b.usd - a.usd).slice(0, 5),
    // 서비스 워커가 시작한 지 1시간이 안 됐으면 그만큼만 모은 값이다.
    windowMs: Math.min(LIQUIDATION_WINDOW, Date.now() - startedAt),
  };
}

// 트렌딩 코인: CoinGecko 검색 상위(10분마다)
const trending = new PolledData('trending', 10 * 60 * 1000, async () => {
  const data = await fetchJson('https://api.coingecko.com/api/v3/search/trending');
  return (data?.coins ?? []).slice(0, 10).map(({ item }) => ({
    id: item.id,
    symbol: item.symbol,
    name: item.name,
    thumb: item.thumb,
    rank: item.market_cap_rank,
    change24h: item.data?.price_change_percentage_24h?.usd ?? null,
  }));
});
trending.post = () => {};

// 거래소 계정 연동(읽기 전용): 사용자가 넣은 API 키로 잔고만 조회한다. 키는 이 기기의 storage.local에만 있고 다른 곳으로 보내지 않는다.
const ACCOUNT_KEYS_STORAGE = 'exchangeApiKeys'; // { upbit?: { accessKey, secretKey }, binance?: { apiKey, secretKey } }
const encoder = new TextEncoder();
const base64Url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const hmacSha256 = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
};
const toHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

// 거래소 오류를 팝업이 번역해 보여줄 수 있는 코드로 바꾼다. 원문은 detail로 함께 넘긴다.
class AccountSyncError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

const UPBIT_ERROR_CODES = {
  no_authorization_ip: 'ip',
  invalid_access_key: 'invalidKey',
  jwt_verification: 'invalidKey',
  expired_access_key: 'expired',
  out_of_scope: 'permission',
};
// -2015: 키·IP·권한 중 하나가 맞지 않음, -2008/-2014/-1022: 없는 키·키 형식·서명 오류
const BINANCE_ERROR_CODES = { '-2015': 'ip', '-2008': 'invalidKey', '-2014': 'invalidKey', '-1022': 'invalidKey' };

// 바이낸스 키에 거래·출금·이체 권한이 하나라도 켜져 있으면 저장하지 않는다. 읽기 전용 안내만으로는 실수를 막지 못한다.
async function assertBinanceReadOnly({ apiKey, secretKey }) {
  const query = `timestamp=${Date.now()}&recvWindow=10000`;
  const signature = toHex(await hmacSha256(secretKey, query));
  const response = await fetch(`https://api.binance.com/sapi/v1/account/apiRestrictions?${query}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new AccountSyncError(BINANCE_ERROR_CODES[String(data?.code)] ?? 'unknown', data?.msg);
  const dangerous = [
    'enableWithdrawals',
    'enableSpotAndMarginTrading',
    'enableMargin',
    'enableFutures',
    'enableInternalTransfer',
    'permitsUniversalTransfer',
    'enableVanillaOptions',
    'enablePortfolioMarginTrading',
  ];
  if (dangerous.some(key => data?.[key] === true)) throw new AccountSyncError('tradeKey');
}

const ACCOUNT_LOADERS = {
  // 업비트: JWT(HS256) { access_key, nonce }. 평균 매수가(avg_buy_price)를 함께 준다.
  async upbit({ accessKey, secretKey }) {
    const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const payload = base64Url(encoder.encode(JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })));
    const signature = base64Url(await hmacSha256(secretKey, `${header}.${payload}`));
    const response = await fetch('https://api.upbit.com/v1/accounts', {
      headers: { Authorization: `Bearer ${header}.${payload}.${signature}`, Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new AccountSyncError(UPBIT_ERROR_CODES[data?.error?.name] ?? 'unknown', data?.error?.message || `upbit ${response.status}`);
    }
    return data
      .filter(item => item.currency !== 'KRW' && item.unit_currency === 'KRW')
      .map(item => ({
        market: `KRW-${item.currency}`,
        quantity: Number(item.balance) + Number(item.locked),
        avgPrice: Number(item.avg_buy_price) || null,
      }))
      .filter(item => item.quantity > 0);
  },
  // 바이낸스: HMAC-SHA256 서명 쿼리. 평균 매수가는 주지 않는다.
  async binance({ apiKey, secretKey }) {
    await assertBinanceReadOnly({ apiKey, secretKey });
    const query = `timestamp=${Date.now()}&recvWindow=10000&omitZeroBalances=true`;
    const signature = toHex(await hmacSha256(secretKey, query));
    const response = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new AccountSyncError(BINANCE_ERROR_CODES[String(data?.code)] ?? 'unknown', data?.msg || `binance ${response.status}`);
    return (data.balances ?? [])
      .filter(item => !['USDT', 'USDC', 'FDUSD', 'BUSD'].includes(item.asset))
      .map(item => ({ market: `${item.asset}USDT`, quantity: Number(item.free) + Number(item.locked), avgPrice: null }))
      .filter(item => item.quantity > 0 && allExchangesTickers.binance[item.market]);
  },
};

// 키는 '이 기기에 저장'을 끄면 storage.session(브라우저를 닫으면 지워짐)에, 켜면 storage.local에 둔다.
async function loadAccountKeys(exchange) {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(ACCOUNT_KEYS_STORAGE),
    chrome.storage.local.get(ACCOUNT_KEYS_STORAGE),
  ]);
  return session[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? local[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? null;
}

async function syncExchangeAccount(exchange) {
  const keys = await loadAccountKeys(exchange);
  if (!keys || !ACCOUNT_LOADERS[exchange]) return { ok: false, code: 'noKeys' };
  try {
    const holdings = await ACCOUNT_LOADERS[exchange](keys);
    // 평균 매수가가 없으면 지금 가격으로 두고 avgEstimated로 표시한다. 팝업은 이미 있던 평균가를 유지한다.
    return {
      ok: true,
      holdings: holdings.map(item => ({
        ...item,
        avgEstimated: item.avgPrice == null,
        avgPrice: item.avgPrice ?? allExchangesTickers[exchange][item.market]?.currentPrice ?? 0,
      })),
    };
  } catch (error) {
    if (error instanceof AccountSyncError) return { ok: false, code: error.code, error: error.detail };
    // fetch 자체가 실패하면 네트워크 문제다.
    return { ok: false, code: error instanceof TypeError ? 'network' : 'unknown', error: String(error?.message || error) };
  }
}

async function initialize() {
  await Promise.all([alertsReady, rulesReady, badgeReady, languageReady]);
  activeExchange = await loadActiveExchange();
  derivatives.start();
  trending.start();
  connectLiquidations();
  const initial = getExchangeInstance(activeExchange);
  if (initial) initial.setPopupActive(true);
  // 서비스 워커가 깨어나는 중에 화면이 먼저 연결됐으면, 활성 거래소를 이제 알려 주고 시세를 이어 준다.
  if (activePort) {
    activePort.postMessage({ type: 'activeExchange', data: activeExchange });
    if (initial) initial.connectPopup(activePort);
  }

  // 거래소 하나가 느리거나 실패해도 나머지는 바로 시작한다.
  polledData.forEach(data => data.start());
  setInterval(updateBadge, 2000);
  // 화면 없이 깨어났으면(알람 등) 필요한 거래소만 시작한다. 화면이 연결되면 나머지도 시작한다.
  if (!popupPorts.size) {
    const needed = exchangesNeededWhenIdle();
    Object.entries(exchanges).forEach(([name, exchange]) => {
      if (!needed.has(name)) exchange.suspended = true;
    });
  }
  await Promise.allSettled([
    ...Object.values(exchanges).map(exchange => exchange.start()),
    exchangeRateManager.initialize(),
  ]);
}

chrome.runtime.onConnect.addListener(port => {
  if (!port || port.name !== 'popup') return;

  popupPorts.add(port);
  activePort = broadcastPort;
  exchangeRateManager.port = broadcastPort;
  resumeAllExchanges();

  if (exchangeRateManager.exchangeRateUSD) {
    port.postMessage({ type: 'exchangeRateUSD', data: exchangeRateManager.exchangeRateUSD });
  }
  polledData.forEach(data => data.post(port));

  // 화면은 거래소가 바뀌면 시세를 비우므로, 거래소를 시세 스냅샷보다 먼저 알린다.
  // 아직 저장된 거래소를 읽는 중(activeExchange가 null)이면 initialize가 대신 알린다.
  if (activeExchange) port.postMessage({ type: 'activeExchange', data: activeExchange });

  const active = getExchangeInstance(activeExchange);
  if (active) active.connectPopup(activePort);

  port.postMessage({ type: 'updatedVersion', data: updatedVersion });

  port.onDisconnect.addListener(() => {
    popupPorts.delete(port);
    if (popupPorts.size) return;
    scheduleIdleConnections();
    activePort = null;
    exchangeRateManager.port = null;
    Object.values(exchanges).forEach(exchange => {
      if (exchange.port === broadcastPort) exchange.port = null;
    });
    if (maxChangeRateIntervalId !== null) {
      clearInterval(maxChangeRateIntervalId);
      maxChangeRateIntervalId = null;
    }
  });

  if (maxChangeRateIntervalId !== null) return;
  maxChangeRateIntervalId = setInterval(() => {
    let maxRate = -Infinity;
    let maxTicker = { exchange: '', market: '', changeRate: 0 };

    for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
      for (const [market, ticker] of Object.entries(tickers)) {
        // 거래가 적은 FDUSD·EUR 등 기타 페어가 상위 상승 종목을 차지하지 않도록 KRW·USDT 마켓만 비교한다.
        const isUsdMarket = (exchange === 'coinbase' || exchange === 'kraken') && market.endsWith('USD');
        if (!market.startsWith('KRW-') && !market.endsWith('USDT') && !isUsdMarket) continue;
        const changeRate = ticker.changeRate ?? 0;
        if (changeRate > maxRate) {
          maxRate = changeRate;
          maxTicker.exchange = ticker.exchange;
          maxTicker.market = ticker.market;
          maxTicker.changeRate = changeRate;
        }
      }
    }
    maxChangeRate.exchange = maxTicker.exchange;
    maxChangeRate.market = maxTicker.market;
    maxChangeRate.changeRate = maxTicker.changeRate;

    if (activePort) {
      try {
        activePort.postMessage({ type: 'maxChangeRate', data: maxChangeRate });
        activePort.postMessage({ type: 'kimchiPremium', data: computeKimchiPremium() });
      } catch (error) {
        console.warn(error);
      }
    }
  }, 2000);
});

// 김치 프리미엄: KRW 마켓 가격 vs (Binance USDT 가격 × USD/KRW 환율).
// USDT≈USD 가정. 두 페어가 모두 살아있고 환율이 있을 때만 산출.
// 김프는 장중 실시간 환율로 계산한다. 수출입은행 고시 환율은 하루 한 번(고시 전에는 전날 값)이라 장중에 0.5~1%p 어긋난다.
// 표시용 환율(exchangeRateUSD)은 화면 안내대로 고시 환율을 그대로 쓴다.
const LIVE_FX_INTERVAL = 5 * 60_000;
let liveUsdKrw = null;
async function refreshLiveUsdKrw() {
  try {
    const response = await fetch(
      'https://m.stock.naver.com/front-api/marketIndex/productDetail?category=exchange&reutersCode=FX_USDKRW',
      { headers: { Accept: 'application/json' } },
    );
    const json = await response.json();
    const rate = Number(json?.result?.calcPrice ?? String(json?.result?.closePrice ?? '').replace(/,/g, ''));
    if (Number.isFinite(rate) && rate > 0) liveUsdKrw = rate;
  } catch (error) {
    console.warn(error);
  }
}
refreshLiveUsdKrw();
setInterval(refreshLiveUsdKrw, LIVE_FX_INTERVAL);

// 김프 추이: 10분마다 BTC 김프(업비트·빗썸)와 테더 프리미엄을 7일치 기록한다.
// 화면이 닫혀 소켓을 끊어 둔 동안에도 이어지도록 웹소켓 대신 REST로 가격을 받는다.
const KIMCHI_HISTORY_KEY = 'kimchiHistory';
const KIMCHI_HISTORY_MAX = 7 * 24 * 6;

async function recordKimchiHistory() {
  try {
    if (!liveUsdKrw) await refreshLiveUsdKrw();
    const usdRate = liveUsdKrw || exchangeRateManager.exchangeRateUSD;
    if (!usdRate) return;
    const [upbit, bithumb, binance] = await Promise.all([
      fetchJson('https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT'),
      fetchJson('https://api.bithumb.com/v1/ticker?markets=KRW-BTC'),
      fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
    ]);
    const btcUsdt = Number(binance?.price);
    if (!btcUsdt) return;
    const price = (list, market) => list?.find?.(item => item.market === market)?.trade_price;
    const premium = krw => (krw ? Number(((krw / (btcUsdt * usdRate) - 1) * 100).toFixed(3)) : null);
    const usdtKrw = price(upbit, 'KRW-USDT');
    const point = {
      t: Date.now(),
      upbit: premium(price(upbit, 'KRW-BTC')),
      bithumb: premium(price(bithumb, 'KRW-BTC')),
      tether: usdtKrw ? Number(((usdtKrw / usdRate - 1) * 100).toFixed(3)) : null,
    };
    const history = (await chrome.storage.local.get(KIMCHI_HISTORY_KEY))[KIMCHI_HISTORY_KEY] ?? [];
    await chrome.storage.local.set({ [KIMCHI_HISTORY_KEY]: [...history, point].slice(-KIMCHI_HISTORY_MAX) });
  } catch (error) {
    console.warn(error);
  }
}
chrome.alarms.create('kimchiHistory', { periodInMinutes: 10 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'kimchiHistory') recordKimchiHistory();
});
// 서비스 워커가 오래 쉬었다 깨어났으면 바로 한 점을 남긴다.
chrome.storage.local.get(KIMCHI_HISTORY_KEY).then(result => {
  const last = result[KIMCHI_HISTORY_KEY]?.at(-1);
  // 시작 직후에는 거래소 시세 스냅샷 요청이 몰려 있어 잠시 뒤에 남긴다.
  if (!last || Date.now() - last.t > 10 * 60_000) setTimeout(recordKimchiHistory, 30_000);
});

function computeKimchiPremium() {
  const usdRate = liveUsdKrw || exchangeRateManager.exchangeRateUSD;
  if (!usdRate) return { rate: usdRate, items: {} };

  const items = {};
  for (const krwExchange of ['upbit', 'bithumb']) {
    const krwTickers = allExchangesTickers[krwExchange];
    if (!krwTickers) continue;
    for (const market in krwTickers) {
      if (!market.startsWith('KRW-')) continue;
      const coin = market.slice(4);
      if (coin === 'USDT' || coin === 'USDC') continue;
      const krwPrice = krwTickers[market]?.currentPrice;
      const binTicker = allExchangesTickers.binance?.[`${coin}USDT`];
      const usdtPrice = binTicker?.currentPrice;
      if (!krwPrice || !usdtPrice) continue;

      const premium = (krwPrice / (usdtPrice * usdRate) - 1) * 100;
      items[`${krwExchange}:${market}`] = {
        exchange: krwExchange,
        market,
        coin,
        premium,
        krwPrice,
        usdtPrice,
      };
    }
  }
  // 테더 프리미엄: 원화로 산 USDT가 실제 달러 환율보다 얼마나 비싼지. 김프의 기준선으로 많이 본다.
  const tether = {};
  for (const krwExchange of ['upbit', 'bithumb']) {
    const price = allExchangesTickers[krwExchange]?.['KRW-USDT']?.currentPrice;
    if (price) tether[krwExchange] = (price / usdRate - 1) * 100;
  }
  return { rate: usdRate, items, tether };
}

// 거래소 간 가격 차이: 같은 코인을 USD로 환산해 가장 싼 곳과 비싼 곳의 차이를 구한다.
// 원화 마켓은 환율로 환산하므로 김치 프리미엄도 함께 반영된다(includeKrw=false면 제외).
const MAX_SPREAD = 30; // 이보다 크면 같은 티커의 다른 코인이거나 거래가 끊긴 마켓일 가능성이 높다.
const MIN_SPREAD_VOLUME_USD = 100_000; // 24시간 거래대금이 이보다 적은 마켓은 시세가 오래됐을 수 있어 뺀다.

function computeSpreads({ includeKrw = true, limit = 30 } = {}) {
  const usdRate = exchangeRateManager.exchangeRateUSD;
  const byCoin = {};
  for (const [exchange, tickers] of Object.entries(allExchangesTickers)) {
    for (const [market, ticker] of Object.entries(tickers)) {
      const price = ticker.currentPrice;
      if (!price) continue;
      let coin = null;
      let usdPrice = null;
      if (market.startsWith('KRW-')) {
        if (!includeKrw || !usdRate) continue;
        coin = market.slice(4);
        usdPrice = price / usdRate;
      } else if (market.endsWith('USDT')) {
        coin = market.slice(0, -4);
        usdPrice = price;
      } else if ((exchange === 'coinbase' || exchange === 'kraken') && market.endsWith('USD')) {
        coin = market.slice(0, -3);
        usdPrice = price;
      } else if (market.endsWith('INR')) {
        const inrRate = polledData.find(data => data.type === 'fiatRates')?.value?.INR;
        if (!inrRate) continue;
        coin = market.slice(0, -3);
        usdPrice = price / inrRate;
      }
      if (!coin || coin === 'USDT' || coin === 'USDC') continue;
      const volumeUsd = (ticker.volume ?? 0) * (usdPrice / price);
      if (volumeUsd < MIN_SPREAD_VOLUME_USD) continue;
      (byCoin[coin] ??= []).push({ exchange, market, price, usdPrice });
    }
  }

  const items = [];
  for (const [coin, quotes] of Object.entries(byCoin)) {
    if (quotes.length < 2) continue;
    let low = quotes[0];
    let high = quotes[0];
    for (const quote of quotes) {
      if (quote.usdPrice < low.usdPrice) low = quote;
      if (quote.usdPrice > high.usdPrice) high = quote;
    }
    if (low.exchange === high.exchange) continue;
    const spread = ((high.usdPrice - low.usdPrice) / low.usdPrice) * 100;
    if (spread > 0 && spread <= MAX_SPREAD) items.push({ coin, spread, low, high, exchanges: quotes.length });
  }
  items.sort((a, b) => b.spread - a.spread);
  return { usdRate, items: items.slice(0, limit) };
}

initialize();
