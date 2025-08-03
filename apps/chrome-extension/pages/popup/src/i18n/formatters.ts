import { useTranslation } from 'react-i18next';

// 날짜/시간 포맷팅
export const useDateFormatter = () => {
  const { i18n } = useTranslation();

  const formatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

    return new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options,
    }).format(dateObj);
  };

  const formatTime = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

    return new Intl.DateTimeFormat(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options,
    }).format(dateObj);
  };

  const formatDateTime = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;

    return new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    }).format(dateObj);
  };

  const formatRelativeTime = (date: Date | string | number) => {
    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });

    if (diffInSeconds < 60) {
      return rtf.format(-diffInSeconds, 'second');
    } else if (diffInSeconds < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    } else if (diffInSeconds < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    } else if (diffInSeconds < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
    } else if (diffInSeconds < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
    }
  };

  return {
    formatDate,
    formatTime,
    formatDateTime,
    formatRelativeTime,
  };
};

// 숫자 포맷팅
export const useNumberFormatter = () => {
  const { i18n } = useTranslation();

  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, options).format(value);
  };

  const formatCurrency = (value: number, currency: string = 'USD', options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency,
      ...options,
    }).format(value);
  };

  const formatPercent = (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(value / 100);
  };

  const formatCompactNumber = (value: number, options?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(i18n.language, {
      notation: 'compact',
      ...options,
    }).format(value);
  };

  const formatCryptoAmount = (value: number, symbol: string, decimals: number = 8) => {
    const formatted = new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(value);

    return `${formatted} ${symbol}`;
  };

  const formatKRWAmount = (value: number) => {
    if (value >= 100000000) {
      return `${(value / 100000000).toFixed(1)}억원`;
    } else if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}만원`;
    } else {
      return `${value.toLocaleString()}원`;
    }
  };

  const formatUSDAmount = (value: number) => {
    if (value >= 1000000000) {
      return `$${(value / 1000000000).toFixed(1)}B`;
    } else if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    } else {
      return `$${value.toFixed(2)}`;
    }
  };

  return {
    formatNumber,
    formatCurrency,
    formatPercent,
    formatCompactNumber,
    formatCryptoAmount,
    formatKRWAmount,
    formatUSDAmount,
  };
};

// RTL 언어 감지
export const isRTL = (language: string): boolean => {
  const rtlLanguages = [
    'ar', // Arabic
    'he', // Hebrew
    'fa', // Persian/Farsi
    'ur', // Urdu
    'ps', // Pashto
    'sd', // Sindhi
    'yi', // Yiddish
    'ku', // Kurdish
    'az', // Azerbaijani (some variants)
  ];

  return rtlLanguages.includes(language);
};

// 언어별 통화 매핑은 사용자 요청에 따라 취소됨

// 시간대 매핑
export const getTimezoneForLanguage = (language: string): string => {
  const timezoneMap: { [key: string]: string } = {
    ko: 'Asia/Seoul',
    en: 'America/New_York',
    ja: 'Asia/Tokyo',
    zh: 'Asia/Shanghai',
    es: 'Europe/Madrid',
    fr: 'Europe/Paris',
    de: 'Europe/Berlin',
    it: 'Europe/Rome',
    pt: 'Europe/Lisbon',
    ru: 'Europe/Moscow',
    ar: 'Asia/Riyadh',
    he: 'Asia/Jerusalem',
    fa: 'Asia/Tehran',
    ur: 'Asia/Karachi',
    tr: 'Europe/Istanbul',
    hi: 'Asia/Kolkata',
    th: 'Asia/Bangkok',
    vi: 'Asia/Ho_Chi_Minh',
    id: 'Asia/Jakarta',
    ms: 'Asia/Kuala_Lumpur',
    tl: 'Asia/Manila',
    bn: 'Asia/Dhaka',
    ta: 'Asia/Kolkata',
    te: 'Asia/Kolkata',
    ml: 'Asia/Kolkata',
    kn: 'Asia/Kolkata',
    gu: 'Asia/Kolkata',
    pa: 'Asia/Kolkata',
    or: 'Asia/Kolkata',
    as: 'Asia/Kolkata',
    ne: 'Asia/Kathmandu',
    si: 'Asia/Colombo',
    my: 'Asia/Yangon',
    km: 'Asia/Phnom_Penh',
    lo: 'Asia/Vientiane',
    mn: 'Asia/Ulaanbaatar',
    ka: 'Asia/Tbilisi',
    hy: 'Asia/Yerevan',
    az: 'Asia/Baku',
    kk: 'Asia/Almaty',
    ky: 'Asia/Bishkek',
    uz: 'Asia/Tashkent',
    tk: 'Asia/Ashgabat',
    tg: 'Asia/Dushanbe',
    ps: 'Asia/Kabul',
    sd: 'Asia/Karachi',
    yi: 'America/New_York',
    ku: 'Asia/Baghdad',
    am: 'Africa/Addis_Ababa',
    ti: 'Africa/Addis_Ababa',
    so: 'Africa/Mogadishu',
    sw: 'Africa/Dar_es_Salaam',
    zu: 'Africa/Johannesburg',
    af: 'Africa/Johannesburg',
    xh: 'Africa/Johannesburg',
    st: 'Africa/Johannesburg',
    sn: 'Africa/Harare',
    ny: 'Africa/Blantyre',
    lg: 'Africa/Kampala',
    rw: 'Africa/Kigali',
    ak: 'Africa/Accra',
    yo: 'Africa/Lagos',
    ig: 'Africa/Lagos',
    ha: 'Africa/Lagos',
    ff: 'Africa/Lagos',
    wo: 'Africa/Dakar',
    bm: 'Africa/Bamako',
    dy: 'Africa/Ouagadougou',
    sg: 'Africa/Brazzaville',
    ln: 'Africa/Kinshasa',
    kg: 'Africa/Brazzaville',
    lu: 'Africa/Lubumbashi',
    mg: 'Indian/Antananarivo',
    mt: 'Europe/Malta',
    sq: 'Europe/Tirane',
    mk: 'Europe/Skopje',
    bg: 'Europe/Sofia',
    ro: 'Europe/Bucharest',
    hr: 'Europe/Zagreb',
    sr: 'Europe/Belgrade',
    bs: 'Europe/Sarajevo',
    me: 'Europe/Podgorica',
    sl: 'Europe/Ljubljana',
    sk: 'Europe/Bratislava',
    cs: 'Europe/Prague',
    pl: 'Europe/Warsaw',
    hu: 'Europe/Budapest',
    et: 'Europe/Tallinn',
    lv: 'Europe/Riga',
    lt: 'Europe/Vilnius',
    fi: 'Europe/Helsinki',
    sv: 'Europe/Stockholm',
    da: 'Europe/Copenhagen',
    no: 'Europe/Oslo',
    is: 'Atlantic/Reykjavik',
    fo: 'Atlantic/Faroe',
    gl: 'America/Godthab',
    eu: 'Europe/Madrid',
    ca: 'Europe/Madrid',
    cy: 'Europe/London',
    ga: 'Europe/Dublin',
    gd: 'Europe/London',
    kw: 'Europe/London',
    br: 'Europe/Paris',
    lb: 'Asia/Beirut',
    sy: 'Asia/Damascus',
    iq: 'Asia/Baghdad',
    jo: 'Asia/Amman',
    sa: 'Asia/Riyadh',
    ye: 'Asia/Aden',
    om: 'Asia/Muscat',
    ae: 'Asia/Dubai',
    qa: 'Asia/Qatar',
    bh: 'Asia/Bahrain',
    eg: 'Africa/Cairo',
    ly: 'Africa/Tripoli',
    tn: 'Africa/Tunis',
    dz: 'Africa/Algiers',
    ma: 'Africa/Casablanca',
    eh: 'Africa/El_Aaiun',
    mr: 'Africa/Nouakchott',
    bf: 'Africa/Ouagadougou',
    td: 'Africa/Ndjamena',
    cm: 'Africa/Douala',
    cf: 'Africa/Bangui',
    gq: 'Africa/Malabo',
    cg: 'Africa/Brazzaville',
    cd: 'Africa/Kinshasa',
    ao: 'Africa/Luanda',
    zm: 'Africa/Lusaka',
    mw: 'Africa/Blantyre',
    zw: 'Africa/Harare',
    bw: 'Africa/Gaborone',
    na: 'Africa/Windhoek',
    ls: 'Africa/Maseru',
    sz: 'Africa/Mbabane',
    mz: 'Africa/Maputo',
    mu: 'Indian/Mauritius',
    sc: 'Indian/Mahe',
    yt: 'Indian/Mayotte',
    re: 'Indian/Reunion',
    dj: 'Africa/Djibouti',
    er: 'Africa/Asmara',
    ss: 'Africa/Juba',
    ke: 'Africa/Nairobi',
    ug: 'Africa/Kampala',
    bi: 'Africa/Bujumbura',
    tz: 'Africa/Dar_es_Salaam',
  };

  return timezoneMap[language] || 'UTC';
};
