// 소개 페이지(GitHub Pages)를 만든다: site/index.html(한국어), site/en/index.html(영어).
//   node site-src/build.mjs   → 이미지는 site/img(스토어 스크린샷·프로모션 타일에서 복사)
// 스토어 버튼에는 UTM을 붙여 Chrome 웹스토어 대시보드에서 소개 페이지로 들어온 설치를 따로 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const BASE_URL = 'https://hunhunseunghun.github.io/como_extension/';
const UTM = 'utm_source=como-site&utm_medium=web&utm_campaign=landing';

const STORES = {
  chrome: `https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?${UTM}`,
  whale: `https://store.whale.naver.com/detail/gbjlmpnhijdgcobpfpgeiepdfegdhkgl?${UTM}`,
  edge: `https://microsoftedge.microsoft.com/addons/detail/nikdopfhkilmeedoblhlbbalkhiogmkd?${UTM}`,
};
const LINKS = {
  notes: 'https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257',
  issues: 'https://github.com/hunhunseunghun/como_extension/issues',
  source: 'https://github.com/hunhunseunghun/como_extension',
};

const T = {
  ko: {
    lang: 'ko',
    path: '',
    other: { href: 'en/', label: 'English' },
    title: 'COMO – 김프·코인 실시간 시세 크롬 확장 프로그램 | 업비트·빗썸·바이낸스',
    description: '업비트·빗썸·바이낸스 등 거래소 11곳의 비트코인·코인 실시간 시세와 코인별 김프(김치 프리미엄)를 툴바에서. 지정가·급등락 알림, 보유 자산 손익, 차트. 무료·회원가입 없음.',
    hero: ['김프·코인 실시간 시세를', '브라우저 툴바에서'],
    lead: '업비트·빗썸·바이낸스 등 거래소 11곳의 시세와 코인별 김치 프리미엄, 지정가·급등락 알림을 한 화면에서. 무료이고 회원가입도 필요 없어요.',
    cta: { chrome: 'Chrome에 추가', whale: '웨일 스토어', edge: 'Edge 부가 기능', firefox: 'Firefox (심사 중)' },
    badges: ['거래소 11곳', '10개 언어', '사용자 500+', '평점 5.0'],
    featuresTitle: '이런 걸 할 수 있어요',
    features: [
      ['1-prices.jpg', '김프까지 한눈에', '업비트·빗썸·코인원·디지털엑스와 바이낸스·코인베이스·바이비트·OKX·비트겟·크라켄·CoinDCX 시세를 실시간으로. 원화 마켓은 코인마다 김치 프리미엄을 함께 보여 줘요.'],
      ['2-chart.jpg', '보조지표와 급등락 봉', '이동평균선·볼린저밴드·RSI를 켜고, 크게 움직인 봉에 마우스를 올리면 그 시각 뉴스를 보여 줘요.'],
      ['3-alerts.jpg', '놓치지 않는 알림', '지정가, 1·5·15분 급등락, 김프, 대량 체결, 선물 미결제약정, 거래 공지, 경제 일정 알림. 방해 금지 시간과 알림 기록함까지.'],
      ['4-portfolio.jpg', '보유 자산 손익', '코인·수량·평균가만 넣으면 평가금액과 1·7·30일 손익을 15개 통화로. 물타기·손익분기 계산기, 2027 과세 미리보기도 있어요.'],
      ['5-insights.jpg', '시장 인사이트', '공포·탐욕 지수, BTC 도미넌스, 알트코인 시즌, 김프 추이, 수수료까지 넣은 김프 차익 계산기, 펀딩비·청산·롱숏 비율.'],
    ],
    moreTitle: '그 밖에',
    more: ['툴바 아이콘에 실시간 가격', '사이드 패널·다른 창 위 미니 창', '즐겨찾기 고정과 24시간 미니 차트', '다크 모드·조용한 모드', 'DEX·밈코인 검색', '설정 백업·복원'],
    privacyTitle: '개인정보는 브라우저 밖으로 나가지 않아요',
    privacy: '거래소의 공개 시세 API만 조회하고, 방문하는 웹페이지는 읽지 않아요. 설정·알림·보유 자산은 브라우저에만 저장돼요. 거래소 계정 연동은 선택이며 읽기 전용 키만 받아요.',
    faqTitle: '자주 묻는 질문',
    faq: [
      ['무료인가요?', '네, 모든 기능이 무료이고 광고도 없어요.'],
      ['거래소 계정이 있어야 하나요?', '아니요. 시세·알림·보유 자산은 계정 없이 써요. 보유 자산을 자동으로 불러오고 싶을 때만 읽기 전용 API 키를 연결하면 돼요.'],
      ['김프는 어떻게 계산하나요?', '원화 마켓 가격을 바이낸스 USDT 가격과 실시간 원·달러 환율로 비교해요. 거래가 적은 마켓은 계산에서 빼요.'],
      ['어떤 브라우저에서 되나요?', 'Chrome, 네이버 웨일, Microsoft Edge에서 쓸 수 있어요. Firefox는 스토어 심사 중이에요.'],
    ],
    footer: { notes: '업데이트 노트', issues: '문의·제안', source: '소스 코드', privacy: '개인정보처리방침' },
  },
  en: {
    lang: 'en',
    path: 'en/',
    other: { href: '../', label: '한국어' },
    title: 'COMO – Bitcoin & Crypto Price Tracker with Kimchi Premium | Chrome extension',
    description: 'Live Bitcoin and crypto prices from 11 exchanges incl. Binance, Coinbase, Upbit and Bithumb, the kimchi premium for every coin, price alerts, portfolio P/L and charts. Free, no sign-up.',
    hero: ['Live crypto prices,', 'right in your toolbar'],
    lead: 'Prices from 11 exchanges, the kimchi premium for every coin, and price and surge alerts — in one popup. Free, no account needed.',
    cta: { chrome: 'Add to Chrome', whale: 'Naver Whale', edge: 'Microsoft Edge', firefox: 'Firefox (in review)' },
    badges: ['11 exchanges', '10 languages', '500+ users', 'Rated 5.0'],
    featuresTitle: 'What you can do',
    features: [
      ['en-1-prices.jpg', 'Every price at a glance', 'Binance, Coinbase, Bybit, OKX, Bitget, Kraken, CoinDCX, Upbit, Bithumb, Coinone and DigitalX in real time, with the kimchi premium on Korean markets.'],
      ['en-2-chart.jpg', 'Charts with indicators', 'Turn on moving averages, Bollinger Bands and RSI, and hover big candles to see the news from that moment.'],
      ['en-3-alerts.jpg', 'Alerts you won’t miss', 'Price, 1/5/15-minute surges, kimchi premium, whale trades, open interest, trading notices and the economic calendar — with quiet hours and alert history.'],
      ['en-4-portfolio.jpg', 'Portfolio P/L', 'Enter coins, amounts and average prices to see total value and 1/7/30-day P/L in 15 currencies, plus averaging and break-even calculators.'],
      ['en-5-insights.jpg', 'Market insights', 'Fear & Greed, BTC dominance, altcoin season, kimchi premium trend, an arbitrage calculator with fees, funding rates, liquidations and long/short ratios.'],
    ],
    moreTitle: 'And more',
    more: ['Live price on the toolbar icon', 'Side panel and always-on-top mini window', 'Pinned favorites with 24h sparklines', 'Dark mode and quiet mode', 'DEX and meme coin search', 'Settings backup and restore'],
    privacyTitle: 'Your data stays in your browser',
    privacy: 'COMO only calls public exchange market APIs and never reads the pages you visit. Settings, alerts and holdings are stored locally. Account sync is optional and accepts read-only keys only.',
    faqTitle: 'FAQ',
    faq: [
      ['Is it free?', 'Yes — every feature is free, with no ads.'],
      ['Do I need an exchange account?', 'No. Prices, alerts and portfolio work without one. Link a read-only API key only if you want holdings imported automatically.'],
      ['What is the kimchi premium?', 'How much more a coin costs on Korean won markets than on global USDT markets. COMO compares Korean prices with Binance USDT prices at the live USD/KRW rate.'],
      ['Which browsers are supported?', 'Chrome, Naver Whale and Microsoft Edge. Firefox is in store review.'],
    ],
    footer: { notes: 'Release notes', issues: 'Feedback', source: 'Source code', privacy: 'Privacy policy' },
  },
};

const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const render = t => {
  const prefix = t.path ? '../' : '';
  const img = name => `${prefix}img/${name}`;
  const url = BASE_URL + t.path;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'COMO',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Chrome, Whale, Edge',
    description: t.description,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url,
    downloadUrl: STORES.chrome,
  };
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${BASE_URL}">
<link rel="alternate" hreflang="en" href="${BASE_URL}en/">
<link rel="alternate" hreflang="x-default" href="${BASE_URL}en/">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE_URL}img/og-${t.lang}.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${img('logo.png')}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
:root{--bg:#0f172a;--panel:#1e293b;--line:rgba(255,255,255,.1);--text:#f8fafc;--muted:#cbd5e1;--faint:#94a3b8;--accent:#a5b4fc;--cta:#6366f1}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic','Segoe UI',system-ui,sans-serif;line-height:1.6;word-break:keep-all}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:1px;text-decoration:none}
.brand img{width:32px;height:32px;border-radius:8px}
.lang{color:var(--faint);font-size:14px;text-decoration:none;border:1px solid var(--line);padding:6px 12px;border-radius:999px}
.hero{padding:56px 0 40px;background:radial-gradient(1000px 420px at 70% 0%,rgba(99,102,241,.35),transparent)}
h1{font-size:clamp(32px,6vw,56px);line-height:1.15;margin:0 0 18px;letter-spacing:-.5px}
.lead{font-size:clamp(16px,2.2vw,20px);color:var(--muted);max-width:640px;margin:0 0 28px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:12px;border:1px solid var(--line);background:var(--panel);font-weight:700;text-decoration:none;font-size:15px}
.btn.primary{background:var(--cta);border-color:transparent}
.btn.disabled{opacity:.5;pointer-events:none}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.badges li{font-size:13px;color:var(--accent);background:rgba(165,180,252,.12);padding:4px 10px;border-radius:999px}
/* 스토어 스크린샷(1280×800)에서 팝업 부분(x 420~1230, y 96~705)만 잘라 보여 준다. 여백 %는 상자 너비 기준 */
.crop{aspect-ratio:810/610;overflow:hidden;border-radius:14px;border:1px solid var(--line);background:#fff}
.crop img{display:block;width:158.02%;height:auto;margin-left:-51.85%;margin-top:-11.85%}
.hero .crop{margin-top:40px;max-width:820px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
section{padding:56px 0;border-top:1px solid var(--line)}
h2{font-size:clamp(24px,3.6vw,34px);margin:0 0 28px}
.feature{display:grid;grid-template-columns:1fr 1.4fr;gap:32px;align-items:center;margin-bottom:48px}
.feature:nth-child(even) .text{order:2}
.feature h3{font-size:22px;margin:0 0 8px}
.feature p{color:var(--muted);margin:0}

.more{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:0;list-style:none;margin:0}
.more li{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px;color:var(--muted)}
.privacy p,.faq dd{color:var(--muted)}
.faq dt{font-weight:700;margin-top:18px}
.faq dd{margin:6px 0 0}
footer{border-top:1px solid var(--line);padding:28px 0 48px;color:var(--faint);font-size:14px;display:flex;flex-wrap:wrap;gap:18px}
@media (max-width:720px){.feature{grid-template-columns:1fr;gap:14px}.feature:nth-child(even) .text{order:0}.more{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="hero">
  <div class="wrap">
    <header><a class="brand" href="./"><img src="${img('logo.png')}" alt="">COMO</a><a class="lang" href="${t.other.href}" hreflang="${t.lang === 'ko' ? 'en' : 'ko'}">${t.other.label}</a></header>
    <h1>${esc(t.hero[0])}<br>${esc(t.hero[1])}</h1>
    <p class="lead">${esc(t.lead)}</p>
    <div class="cta">
      <a class="btn primary" href="${STORES.chrome}" rel="noopener">${esc(t.cta.chrome)}</a>
      <a class="btn" href="${STORES.whale}" rel="noopener">${esc(t.cta.whale)}</a>
      <a class="btn" href="${STORES.edge}" rel="noopener">${esc(t.cta.edge)}</a>
      <span class="btn disabled" aria-disabled="true">${esc(t.cta.firefox)}</span>
    </div>
    <ul class="badges">${t.badges.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
    <div class="crop"><img src="${img(t.features[0][0])}" alt="${esc(t.features[0][1])}" width="1280" height="800"></div>
  </div>
</div>
<main class="wrap">
  <section>
    <h2>${esc(t.featuresTitle)}</h2>
    ${t.features
      .map(
        ([file, title, text]) => `<div class="feature"><div class="text"><h3>${esc(title)}</h3><p>${esc(text)}</p></div><div class="crop"><img src="${img(file)}" alt="${esc(title)}" width="1280" height="800" loading="lazy"></div></div>`,
      )
      .join('\n    ')}
  </section>
  <section>
    <h2>${esc(t.moreTitle)}</h2>
    <ul class="more">${t.more.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
  </section>
  <section class="privacy">
    <h2>${esc(t.privacyTitle)}</h2>
    <p>${esc(t.privacy)}</p>
  </section>
  <section class="faq">
    <h2>${esc(t.faqTitle)}</h2>
    <dl>${t.faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join('')}</dl>
    <p><a class="btn primary" href="${STORES.chrome}" rel="noopener">${esc(t.cta.chrome)}</a></p>
  </section>
</main>
<div class="wrap">
  <footer><a href="${LINKS.notes}">${esc(t.footer.notes)}</a><a href="${LINKS.issues}">${esc(t.footer.issues)}</a><a href="${LINKS.source}">${esc(t.footer.source)}</a><a href="${t.path ? '../' : ''}privacy/">${esc(t.footer.privacy)}</a><span>© COMO</span></footer>
</div>
</body>
</html>
`;
};

fs.writeFileSync(path.join(SITE, 'index.html'), render(T.ko));
fs.mkdirSync(path.join(SITE, 'en'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'en', 'index.html'), render(T.en));

const PRIVACY = {
  ko: {
    lang: 'ko',
    title: 'COMO 개인정보처리방침',
    updated: '시행일: 2026-10-09',
    items: [
      ['수집하는 정보', 'COMO는 개인정보를 수집하거나 개발자의 서버로 전송하지 않습니다. 회원가입이 없고, 광고·분석 도구도 쓰지 않습니다.'],
      ['브라우저에 저장되는 정보', '설정, 즐겨찾기, 알림 규칙, 보유 자산 정보는 사용자의 브라우저(chrome.storage)에만 저장되며 외부로 전송되지 않습니다.'],
      ['외부 서비스 호출', '시세·환율·지수·뉴스 등 공개 데이터를 가져오기 위해 업비트, 빗썸, 바이낸스 등 거래소와 데이터 제공처의 공개 API를 호출합니다. 방문하는 웹페이지의 내용은 읽지 않습니다.'],
      ['거래소 계정 연동(선택)', '사용자가 직접 입력한 읽기 전용 API 키는 브라우저에만 저장되며 해당 거래소에만 전송됩니다. 거래 권한이 있는 키는 거부합니다.'],
      ['제3자 제공', '개발자는 사용자 정보를 제3자에게 제공하거나 판매하지 않습니다.'],
      ['문의', 'GitHub 이슈(' + LINKS.issues + ') 또는 hunhunseunghun@gmail.com'],
    ],
    note: '이 방침이 바뀌면 이 페이지에 게시합니다.',
    back: '← COMO 소개',
    other: { href: 'en/', label: 'English' },
    backHref: '../',
  },
  en: {
    lang: 'en',
    title: 'COMO Privacy Policy',
    updated: 'Effective: 2026-10-09',
    items: [
      ['Information we collect', 'COMO does not collect personal information or send it to the developer\'s servers. There is no sign-up, and no ads or analytics tools are used.'],
      ['Information stored in your browser', 'Settings, favorites, alert rules and portfolio entries are stored only in your browser (chrome.storage) and are never sent elsewhere.'],
      ['Calls to external services', 'To fetch public data such as prices, exchange rates, indices and news, COMO calls the public APIs of exchanges (Upbit, Bithumb, Binance, etc.) and data providers. It does not read the content of the web pages you visit.'],
      ['Exchange account connection (optional)', 'A read-only API key you enter yourself is stored only in your browser and sent only to the corresponding exchange. Keys with trading permission are rejected.'],
      ['Sharing with third parties', 'The developer does not share or sell user information to third parties.'],
      ['Contact', 'GitHub issues (' + LINKS.issues + ') or hunhunseunghun@gmail.com'],
    ],
    note: 'If this policy changes, the new version will be posted on this page.',
    back: '← About COMO',
    other: { href: '../', label: '한국어' },
    backHref: '../../',
  },
};
const renderPrivacy = t => `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<meta name="robots" content="index,follow">
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1f24;--faint:#667085;--line:#e4e7ec}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e6e8eb;--faint:#98a2b3;--line:#2a2f37}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:26px;margin:16px 0 4px}h2{font-size:17px;margin:28px 0 4px}
p{margin:0}.faint{color:var(--faint);font-size:14px}a{color:inherit}
nav{display:flex;justify-content:space-between;font-size:14px}
</style>
</head>
<body>
<main>
  <nav><a href="${t.backHref}">${esc(t.back)}</a><a href="${t.other.href}">${esc(t.other.label)}</a></nav>
  <h1>${esc(t.title)}</h1>
  <p class="faint">${esc(t.updated)}</p>
  ${t.items.map(([h, b], i) => `<h2>${i + 1}. ${esc(h)}</h2><p>${esc(b)}</p>`).join('\n  ')}
  <p class="faint" style="margin-top:32px">${esc(t.note)}</p>
</main>
</body>
</html>
`;
fs.mkdirSync(path.join(SITE, 'privacy', 'en'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'privacy', 'index.html'), renderPrivacy(PRIVACY.ko));
fs.writeFileSync(path.join(SITE, 'privacy', 'en', 'index.html'), renderPrivacy(PRIVACY.en));
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}sitemap.xml\n`);
fs.writeFileSync(
  path.join(SITE, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${BASE_URL}</loc></url>\n  <url><loc>${BASE_URL}en/</loc></url>\n  <url><loc>${BASE_URL}privacy/</loc></url>\n  <url><loc>${BASE_URL}privacy/en/</loc></url>\n</urlset>\n`,
);
console.log('site built: index.html, en/index.html, robots.txt, sitemap.xml');
