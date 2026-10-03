import { getRegExp } from 'korean-regexp';

// 표 셀은 시세가 바뀔 때마다 다시 그려지므로 포맷터와 초성 정규식을 매번 만들지 않고 재사용한다.
const numberFormats = new Map<string, Intl.NumberFormat>();

export const getNumberFormat = (locale: string, options: Intl.NumberFormatOptions) => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
};

let lastChosung: { query: string; regExp: RegExp } | null = null;

// 검색어 하나로 모든 행을 거르므로 직전 검색어의 정규식만 기억하면 된다.
export const getChosungRegExp = (query: string) => {
  if (lastChosung?.query !== query) lastChosung = { query, regExp: getRegExp(query, { initialSearch: true }) };
  return lastChosung.regExp;
};
