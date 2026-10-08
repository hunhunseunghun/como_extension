// @ts-check
// 지정가 알림 저장·삭제. 한 번에 하나씩 처리하고, 저장 전에 메모리 캐시부터 바꾼다. index.js에서 나눔.
import { alertCache } from './notify.js';

// 저장·삭제를 한 번에 하나씩 처리한다. 빠르게 두 번 추가하거나 팝업·사이드 패널에서 동시에 추가하면
// 둘 다 같은 옛 값을 읽고 덮어써 하나가 사라진다.
/** @typedef {{ price: number, deadband: number | null }} PricePair */
/** @typedef {(result: { success: boolean, prices: PricePair[] }) => void} Respond */

/** @type {Promise<void>} */
let alertWriteQueue = Promise.resolve();
/** @param {(release: () => void) => void} task 끝나면 release를 부른다 */
function queueAlertWrite(task) {
  alertWriteQueue = alertWriteQueue.then(() => new Promise(resolve => task(() => resolve(undefined)))).catch(error => console.warn(error));
}

// 시세 틱이 저장 직후 옛 triggeredPrices를 다시 쓰지 않도록 저장 전에 메모리 캐시부터 바꾼다.
/**
 * @param {Partial<typeof alertCache>} values
 * @param {() => void} done
 */
function setAlertStorage(values, done) {
  Object.entries(values).forEach(([key, value]) => {
    if (key in alertCache) alertCache[/** @type {keyof typeof alertCache} */ (key)] = value;
  });
  chrome.storage.local.set(values, done);
}

/**
 * @param {string} exchange
 * @param {string} ticker 마켓 코드
 * @param {PricePair[]} priceDeadbandPairs
 * @param {Respond} response
 */
export function savePriceAlert(exchange, ticker, priceDeadbandPairs, response) {
  queueAlertWrite(release => savePriceAlertNow(exchange, ticker, priceDeadbandPairs, result => {
    response(result);
    release();
  }));
}

/**
 * @param {string} exchange
 * @param {string} ticker 마켓 코드
 * @param {number} priceToDelete
 * @param {Respond} response
 */
export function deletePriceAlert(exchange, ticker, priceToDelete, response) {
  queueAlertWrite(release => deletePriceAlertNow(exchange, ticker, priceToDelete, result => {
    response(result);
    release();
  }));
}

/**
 * @param {string} exchange
 * @param {string} ticker
 * @param {PricePair[]} priceDeadbandPairs
 * @param {Respond} response
 */
function savePriceAlertNow(exchange, ticker, priceDeadbandPairs, response) {
  chrome.storage.local.get(['priceAlerts', 'triggeredPrices', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let triggered = result.triggeredPrices || {};
    let deadbandSettings = result.deadbandSettings || {};

    if (!alerts[exchange]) alerts[exchange] = {};
    if (!deadbandSettings[exchange]) deadbandSettings[exchange] = {};
    if (!deadbandSettings[exchange][ticker]) deadbandSettings[exchange][ticker] = {};

    /** @type {PricePair[]} */
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

/**
 * @param {string} exchange
 * @param {string} ticker
 * @param {number} priceToDelete
 * @param {Respond} response
 */
function deletePriceAlertNow(exchange, ticker, priceToDelete, response) {
  chrome.storage.local.get(['priceAlerts', 'deadbandSettings'], result => {
    let alerts = result.priceAlerts || {};
    let deadbandSettings = result.deadbandSettings || {};

    // priceAlerts에서 삭제
    // 이미 지워진 알림이어도 팝업이 응답을 기다리며 멈추지 않게 빈 목록으로 처리한다.
    const updatedPairs = /** @type {PricePair[]} */ (alerts[exchange]?.[ticker] ?? []).filter(pair => pair.price !== priceToDelete);
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
