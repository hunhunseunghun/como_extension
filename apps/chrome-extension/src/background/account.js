// @ts-check
// 거래소 계정 연동(읽기 전용 API 키로 잔고 조회)과 업비트 입출금 상태. index.js에서 나눔.
import { aggregateUpbitWallet } from './lib/walletStatus.js';
import { allExchangesTickers } from './state.js';

const deps = {
  /** 업비트 동기화가 끝나면 입출금 상태를 다시 받는다. @type {() => void} */
  onUpbitSynced: () => {},
};
/** @param {Partial<typeof deps>} values */
export function configureAccount(values) {
  Object.assign(deps, values);
}

// 거래소 계정 연동(읽기 전용): 사용자가 넣은 API 키로 잔고만 조회한다. 키는 이 기기의 storage.local에만 있고 다른 곳으로 보내지 않는다.
const ACCOUNT_KEYS_STORAGE = 'exchangeApiKeys'; // { upbit?: { accessKey, secretKey }, binance?: { apiKey, secretKey } }
/** @typedef {{ accessKey: string, secretKey: string }} UpbitKeys */
/** @typedef {{ apiKey: string, secretKey: string }} BinanceKeys */
/** @typedef {{ market: string, quantity: number, avgPrice: number | null }} Holding */
const encoder = new TextEncoder();
/** @param {ArrayBuffer | Uint8Array} bytes */
const base64Url = bytes =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
/**
 * @param {string} secret
 * @param {string} message
 */
const hmacSha256 = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
};
/** @param {ArrayBuffer} bytes */
const toHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');

// 거래소 오류를 팝업이 번역해 보여줄 수 있는 코드로 바꾼다. 원문은 detail로 함께 넘긴다.
class AccountSyncError extends Error {
  /**
   * @param {string} code
   * @param {string} [detail]
   */
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

/** @type {Record<string, string>} */
const UPBIT_ERROR_CODES = {
  no_authorization_ip: 'ip',
  invalid_access_key: 'invalidKey',
  jwt_verification: 'invalidKey',
  expired_access_key: 'expired',
  out_of_scope: 'permission',
};
// -2015: 키·IP·권한 중 하나가 맞지 않음, -2008/-2014/-1022: 없는 키·키 형식·서명 오류
/** @type {Record<string, string>} */
const BINANCE_ERROR_CODES = { '-2015': 'ip', '-2008': 'invalidKey', '-2014': 'invalidKey', '-1022': 'invalidKey' };

// 바이낸스 키에 거래·출금·이체 권한이 하나라도 켜져 있으면 저장하지 않는다. 읽기 전용 안내만으로는 실수를 막지 못한다.
/** @param {BinanceKeys} keys */
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

// 업비트 인증 헤더: JWT(HS256) { access_key, nonce }. 쿼리가 없는 조회 API에 쓴다.
/** @param {UpbitKeys} keys */
async function upbitAuthHeader({ accessKey, secretKey }) {
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = base64Url(encoder.encode(JSON.stringify({ access_key: accessKey, nonce: crypto.randomUUID() })));
  const signature = base64Url(await hmacSha256(secretKey, `${header}.${payload}`));
  return `Bearer ${header}.${payload}.${signature}`;
}

// 업비트 입출금 상태(연동 키가 있을 때만). 네트워크별 응답을 코인 단위로 합쳐 막힌 코인만 돌려준다(lib/walletStatus.js).
export async function loadUpbitWalletStatus() {
  const keys = await loadAccountKeys('upbit');
  if (!keys) return null;
  const response = await fetch('https://api.upbit.com/v1/status/wallet', {
    headers: { Authorization: await upbitAuthHeader(keys), Accept: 'application/json' },
  });
  if (!response.ok) return null;
  return aggregateUpbitWallet(await response.json());
}

/** @type {Record<string, (keys: any) => Promise<Holding[]>>} */
const ACCOUNT_LOADERS = {
  // 업비트: 평균 매수가(avg_buy_price)를 함께 준다.
  /** @param {UpbitKeys} keys */
  async upbit(keys) {
    const response = await fetch('https://api.upbit.com/v1/accounts', {
      headers: { Authorization: await upbitAuthHeader(keys), Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new AccountSyncError(UPBIT_ERROR_CODES[data?.error?.name] ?? 'unknown', data?.error?.message || `upbit ${response.status}`);
    }
    return /** @type {any[]} */ (data)
      .filter(item => item.currency !== 'KRW' && item.unit_currency === 'KRW')
      .map(item => ({
        market: `KRW-${item.currency}`,
        quantity: Number(item.balance) + Number(item.locked),
        avgPrice: Number(item.avg_buy_price) || null,
      }))
      .filter(item => item.quantity > 0);
  },
  // 바이낸스: HMAC-SHA256 서명 쿼리. 평균 매수가는 주지 않는다.
  /** @param {BinanceKeys} keys */
  async binance({ apiKey, secretKey }) {
    await assertBinanceReadOnly({ apiKey, secretKey });
    const query = `timestamp=${Date.now()}&recvWindow=10000&omitZeroBalances=true`;
    const signature = toHex(await hmacSha256(secretKey, query));
    const response = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey, Accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) throw new AccountSyncError(BINANCE_ERROR_CODES[String(data?.code)] ?? 'unknown', data?.msg || `binance ${response.status}`);
    return /** @type {any[]} */ (data.balances ?? [])
      .filter(item => !['USDT', 'USDC', 'FDUSD', 'BUSD'].includes(item.asset))
      .map(item => ({ market: `${item.asset}USDT`, quantity: Number(item.free) + Number(item.locked), avgPrice: null }))
      .filter(item => item.quantity > 0 && allExchangesTickers.binance[item.market]);
  },
};

// 키는 '이 기기에 저장'을 끄면 storage.session(브라우저를 닫으면 지워짐)에, 켜면 storage.local에 둔다.
/** @param {string} exchange */
async function loadAccountKeys(exchange) {
  const [session, local] = await Promise.all([
    chrome.storage.session.get(ACCOUNT_KEYS_STORAGE),
    chrome.storage.local.get(ACCOUNT_KEYS_STORAGE),
  ]);
  return session[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? local[ACCOUNT_KEYS_STORAGE]?.[exchange] ?? null;
}

/** @param {string} exchange */
export async function syncExchangeAccount(exchange) {
  const keys = await loadAccountKeys(exchange);
  if (!keys || !ACCOUNT_LOADERS[exchange]) return { ok: false, code: 'noKeys' };
  try {
    const holdings = await ACCOUNT_LOADERS[exchange](keys);
    // 업비트 키가 새로 생겼으면 입출금 상태도 바로 받아 둔다.
    if (exchange === 'upbit') deps.onUpbitSynced();
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
    return { ok: false, code: error instanceof TypeError ? 'network' : 'unknown', error: String(/** @type {Error} */ (error)?.message || error) };
  }
}
