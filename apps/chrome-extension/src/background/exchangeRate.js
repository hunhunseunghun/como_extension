// @ts-check
// 원·달러 고시 환율(한국수출입은행, 예비 네이버). 하루 한 번 받아 저장해 두고 화면 표시·김프 예비 환율로 쓴다. index.js에서 나눔.
import { shiftDate } from './lib/format.js';
import { today } from './state.js';

//  ExchangeRateManager 클래스
export class ExchangeRateManager {
  constructor() {
    // 연결된 화면(팝업·사이드 패널)이 있으면 환율이 바뀔 때 바로 보낸다. index.js가 연결·해제 때 넣고 뺀다.
    /** @type {{ postMessage: (message: unknown) => void } | null} */
    this.port = null;
    /** @type {number | null} */
    this.exchangeRateUSD = null;
    /** @type {{ exchangeRateUSD: number | string | null, updatedDate: string | null, favoriteCoins: Record<string, string[]> }} */
    this.storages = {
      exchangeRateUSD: null,
      updatedDate: null,
      favoriteCoins: { upbit: [], bithumb: [], binance: [] },
    };
  }

  async initialize() {
    const keys = /** @type {(keyof ExchangeRateManager['storages'])[]} */ (Object.keys(this.storages));
    const results = await Promise.all(
      keys.map(key => new Promise(resolve => chrome.storage.local.get(key, result => resolve(result)))),
    );
    results.forEach((/** @type {Record<string, any>} */ result, index) => {
      /** @type {Record<string, any>} */ (this.storages)[keys[index]] = result[keys[index]];
    });

    if (this.storages.exchangeRateUSD) this.exchangeRateUSD = Number(this.storages.exchangeRateUSD);
    if (!this.storages.exchangeRateUSD || this.storages.updatedDate !== today.date) {
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
    let searchDate = today.date;

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

      searchDate = shiftDate(today.date, attempt + 1);
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
      await this.saveExchangeRate(exchangeRateUSD, today.date);
    } catch {
      // 조회 실패 시 마지막으로 저장된 환율을 계속 사용한다.
      this.exchangeRateUSD = Number(this.storages.exchangeRateUSD) || null;
    }
  }

  /**
   * @param {number | null} rate
   * @param {string | null} date
   */
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
