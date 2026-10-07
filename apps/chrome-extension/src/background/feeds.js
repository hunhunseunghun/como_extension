// 주기 확인: 거래소 공지(업비트·빗썸), 업비트 시장경보, 경제 일정, 보유 자산 일별 기록. index.js에서 나눔.
// 알림 띄우기·언어·거래소 객체는 index.js가 configureFeeds로 넘긴다. 알람·저장소 리스너는 import될 때 바로 건다(MV3는 시작 직후 동기 등록이 필요).
import { parseBithumbNotices, pickNewNotices } from './lib/notices.js';
import { diffMarketEvents, summarizeMarketEvents } from './lib/marketWarning.js';
import { parseEconCalendar, upcomingEvents } from './lib/econ.js';
import { alertText } from './lib/texts.js';
import { kstDate, portfolioAmounts, upsertSnapshot } from './lib/portfolioHistory.js';
import { allExchangesTickers } from './state.js';
import { fetchJson } from './net.js';
import { ensureAlarm } from './alarms.js';

const deps = {
  /** @type {(id: string, options: chrome.notifications.NotificationOptions<true>) => void} */
  createNotification: () => {},
  /** @type {() => string} */
  getLanguage: () => 'en',
  /** @type {Record<string, any>} */
  exchanges: {},
};
/** @param {Partial<typeof deps>} values */
export function configureFeeds(values) {
  Object.assign(deps, values);
}

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
          deps.createNotification(`notice:upbit:${notice.id}`, {
            type: 'basic',
            iconUrl: 'como-logo.png',
            title: notice.title,
            message: `UPBIT · ${NOTICE_TEXT[deps.getLanguage()] ?? NOTICE_TEXT.en}`,
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

// 빗썸 거래 공지(입출금 중단, 거래유의 지정, 거래지원 종료 등).
// api.bithumb.com/v1/notices는 feed-api.bithumb.com으로 넘겨 주는데 그쪽은 CORS를 열지 않아, 업비트 공지처럼 선택 권한으로 받는다.
const BITHUMB_NOTICE_SETTING_KEY = 'bithumbNoticeAlerts';
const BITHUMB_NOTICE_ORIGIN = 'https://feed-api.bithumb.com/*';
const BITHUMB_NOTICE_LAST_ID_KEY = 'lastBithumbNoticeId';
let bithumbNoticeRunning = false;
async function checkBithumbNotices() {
  if (bithumbNoticeRunning) return;
  bithumbNoticeRunning = true;
  try {
    const result = await chrome.storage.local.get([BITHUMB_NOTICE_SETTING_KEY, BITHUMB_NOTICE_LAST_ID_KEY]);
    if (!result[BITHUMB_NOTICE_SETTING_KEY]) return;
    if (!(await chrome.permissions.contains({ origins: [BITHUMB_NOTICE_ORIGIN] }))) return;
    const notices = parseBithumbNotices(await fetchJson('https://feed-api.bithumb.com/v1/notices?count=20'));
    const { fresh, maxId } = pickNewNotices(notices, result[BITHUMB_NOTICE_LAST_ID_KEY]);
    fresh.forEach(notice =>
      deps.createNotification(`notice:bithumb:${notice.id}`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: notice.title,
        message: `BITHUMB · ${notice.category || alertText(deps.getLanguage(), 'exchangeNotice')}`,
      }),
    );
    if (maxId != null && maxId !== result[BITHUMB_NOTICE_LAST_ID_KEY]) await chrome.storage.local.set({ [BITHUMB_NOTICE_LAST_ID_KEY]: maxId });
  } catch (error) {
    console.warn(error);
  } finally {
    bithumbNoticeRunning = false;
  }
}

// 업비트 시장경보: 원화 마켓에 유의 지정이나 주의 사유(가격 급등락·거래량 급등·입금량 급등·글로벌 시세 차이·소수 계정 집중)가
// 새로 붙으면 알린다. 'watched'는 즐겨찾기·보유 코인만, 'all'은 전체 원화 마켓.
const MARKET_WARNING_SETTING_KEY = 'marketWarningAlerts';
const MARKET_EVENTS_KEY = 'upbitMarketEvents';
let marketWarningRunning = false;
async function checkMarketWarnings() {
  if (marketWarningRunning) return;
  marketWarningRunning = true;
  try {
    const result = await chrome.storage.local.get([MARKET_WARNING_SETTING_KEY, MARKET_EVENTS_KEY, 'favoriteCoins', 'portfolio']);
    const scope = result[MARKET_WARNING_SETTING_KEY];
    if (scope !== 'watched' && scope !== 'all') return;
    const current = summarizeMarketEvents(await fetchJson('https://api.upbit.com/v1/market/all?isDetails=true'));
    // 일시적으로 빈 응답이 오면 기준을 덮어쓰지 않는다.
    if (!Object.keys(current).length && Object.keys(result[MARKET_EVENTS_KEY] ?? {}).length > 3) return;
    const coin = market => market.split('-')[1];
    const watched = new Set([
      ...Object.values(result.favoriteCoins ?? {}).flat().filter(market => typeof market === 'string' && market.startsWith('KRW-')).map(coin),
      ...(result.portfolio ?? []).filter(holding => holding.market?.startsWith('KRW-')).map(holding => coin(holding.market)),
    ]);
    const include = scope === 'all' ? undefined : market => watched.has(coin(market));
    const added = diffMarketEvents(result[MARKET_EVENTS_KEY], current, include);
    const language = deps.getLanguage();
    // 한꺼번에 많으면 앞의 5개만 알린다.
    added.slice(0, 5).forEach(({ market, added: flags }) => {
      const info = deps.exchanges.upbit.marketsInfo[market];
      const name = (language === 'ko' ? info?.korean_name : info?.english_name) || market;
      deps.createNotification(`upbit:${market}:warning-${flags.join('-')}`, {
        type: 'basic',
        iconUrl: 'como-logo.png',
        title: `${name} (${coin(market)}) · ${alertText(language, 'marketWarning')}`,
        message: flags.map(flag => alertText(language, flag)).join(' · '),
      });
    });
    await chrome.storage.local.set({ [MARKET_EVENTS_KEY]: current });
  } catch (error) {
    console.warn(error);
  } finally {
    marketWarningRunning = false;
  }
}

// 경제 일정: 이번 주 미국 고영향 지표(FOMC·CPI 등). 선택 권한이라 트렌드 탭에서 켤 때 허락받는다.
// 1시간마다 받아 두고(요청 한도), 'econAlerts'를 켰으면 발표 30분 전에 한 번 알린다.
const ECON_ORIGIN = 'https://nfs.faireconomy.media/*';
const ECON_EVENTS_KEY = 'econEvents';
const ECON_ALERTED_KEY = 'econAlerted';
const ECON_LEAD_MS = 30 * 60_000;
export async function refreshEconCalendar() {
  try {
    if (!(await chrome.permissions.contains({ origins: [ECON_ORIGIN] }))) return;
    const events = parseEconCalendar(await fetchJson('https://nfs.faireconomy.media/ff_calendar_thisweek.json'));
    if (events.length) await chrome.storage.local.set({ [ECON_EVENTS_KEY]: { events, updatedAt: Date.now() } });
  } catch (error) {
    console.warn(error);
  }
}
async function checkEconAlerts() {
  const result = await chrome.storage.local.get(['econAlerts', ECON_EVENTS_KEY, ECON_ALERTED_KEY]);
  if (!result.econAlerts) return;
  if (!(await chrome.permissions.contains({ origins: [ECON_ORIGIN] }))) return;
  const events = result[ECON_EVENTS_KEY]?.events ?? [];
  const now = Date.now();
  // 지난 일정의 알림 기록은 정리한다.
  const alerted = (result[ECON_ALERTED_KEY] ?? []).filter(id => events.some(item => item.id === id && item.time > now - 86_400_000));
  const soon = upcomingEvents(events, now, ECON_LEAD_MS, alerted);
  const language = deps.getLanguage();
  soon.forEach(item => {
    const minutes = Math.max(1, Math.round((item.time - now) / 60_000));
    const detail = [item.forecast && `F ${item.forecast}`, item.previous && `P ${item.previous}`].filter(Boolean).join(' · ');
    deps.createNotification(`econ:${item.id}`, {
      type: 'basic',
      iconUrl: 'como-logo.png',
      title: `${alertText(language, 'econSoon', { n: minutes })} · ${item.title}`,
      message: `${item.country}${detail ? ` · ${detail}` : ''}`,
    });
  });
  if (soon.length || alerted.length !== (result[ECON_ALERTED_KEY] ?? []).length) {
    await chrome.storage.local.set({ [ECON_ALERTED_KEY]: [...alerted, ...soon.map(item => item.id)] });
  }
}
ensureAlarm('econCalendar', { periodInMinutes: 60 });
ensureAlarm('econCheck', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'econCalendar') refreshEconCalendar();
  if (alarm.name === 'econCheck') checkEconAlerts();
});
chrome.permissions.onAdded.addListener(permissions => {
  if (permissions.origins?.includes(ECON_ORIGIN)) refreshEconCalendar();
});
// 브라우저 설정에서 권한을 빼면 받아 둔 일정과 알림 설정을 지운다(팝업은 권한이 없으면 스위치를 숨긴다).
chrome.permissions.onRemoved.addListener(permissions => {
  if (permissions.origins?.includes(ECON_ORIGIN)) {
    chrome.storage.local.remove([ECON_EVENTS_KEY, ECON_ALERTED_KEY]);
    chrome.storage.local.set({ econAlerts: false });
  }
});

// 보유 자산 일별 기록: 1시간마다 오늘 칸을 덮어 쓴다(팝업이 열려 있으면 팝업도 기록한다).
// 통화별 원래 금액으로 남겨 환율 변동이 손익에 섞이지 않게 한다. 가격이 비면 그 시각은 건너뛴다.
const PORTFOLIO_HISTORY_KEY = 'portfolioHistory';
async function snapshotPortfolio() {
  const result = await chrome.storage.local.get(['portfolio', PORTFOLIO_HISTORY_KEY]);
  const holdings = (result.portfolio ?? []).filter(holding => holding.quantity > 0);
  const value = portfolioAmounts(holdings, (exchange, market) => allExchangesTickers[exchange]?.[market]?.currentPrice);
  if (!value) return;
  const history = upsertSnapshot(result[PORTFOLIO_HISTORY_KEY] ?? [], { d: kstDate(Date.now()), ...value });
  await chrome.storage.local.set({ [PORTFOLIO_HISTORY_KEY]: history });
}
ensureAlarm('portfolioSnapshot', { periodInMinutes: 60, delayInMinutes: 2 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'portfolioSnapshot') snapshotPortfolio().catch(console.warn);
});

chrome.alarms.create('noticeCheck', { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'noticeCheck') {
    checkUpbitNotices();
    checkBithumbNotices();
    checkMarketWarnings();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // 켜자마자 기준을 잡아 둔다. 범위를 바꿀 때도 다시 잡아 바뀐 범위의 기존 경보를 한꺼번에 알리지 않는다.
  if (changes[BITHUMB_NOTICE_SETTING_KEY]?.newValue) checkBithumbNotices();
  if (changes[MARKET_WARNING_SETTING_KEY]) {
    chrome.storage.local.remove(MARKET_EVENTS_KEY).then(checkMarketWarnings);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  // 켜자마자 기준 공지를 잡아 둔다.
  if (area === 'local' && changes[NOTICE_SETTING_KEY]?.newValue) checkUpbitNotices();
});
