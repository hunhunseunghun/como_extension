// Chrome 웹스토어 프로모션 타일(작은 타일 440×280, 마키 1400×560)을 만든다. 먼저 store-screenshots.mjs로 스크린샷을 만든다.
//   node scripts/store-promo.mjs   → store/promo/<lang>/{small,marquee}.jpg (알파 채널 없는 JPEG)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store', 'promo');
const LOGO = path.join(ROOT, 'public', 'como-logo.png');
const fileUrl = file => `file:///${file.replaceAll('\\', '/')}`;

const COPY = {
  ko: { title: '김프·코인 실시간 시세', sub: '업비트·빗썸·바이낸스 등 11곳 · 지정가·급등락 알림', tag: '무료 · 회원가입 없음' },
  en: { title: 'Crypto prices, live', sub: '11 exchanges · kimchi premium · price alerts', tag: 'Free · no sign-up' },
};

const page = (lang, size) => {
  const c = COPY[lang];
  const shot = path.join(ROOT, 'store', 'screenshots', lang, '1-prices.jpg');
  const small = size === 'small';
  const [w, h] = small ? [440, 280] : [1400, 560];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:'Pretendard','Malgun Gothic','Segoe UI',sans-serif;word-break:keep-all}
  body{background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#312e81 100%);color:#f8fafc;position:relative}
  .copy{position:absolute;left:${small ? 28 : 80}px;top:${small ? 46 : 120}px;width:${small ? 384 : 560}px}
  .brand{display:flex;align-items:center;gap:${small ? 10 : 16}px;font-weight:800;font-size:${small ? 22 : 40}px;letter-spacing:1px}
  .brand img{width:${small ? 34 : 64}px;height:${small ? 34 : 64}px;border-radius:${small ? 8 : 14}px}
  h1{margin:${small ? 18 : 36}px 0 ${small ? 8 : 14}px;font-size:${small ? 30 : 60}px;line-height:1.15;font-weight:800;letter-spacing:-0.5px}
  p{margin:0;font-size:${small ? 14 : 24}px;line-height:1.45;color:#cbd5e1}
  .tag{margin-top:${small ? 14 : 28}px;display:inline-block;padding:${small ? '4px 10px' : '8px 18px'};border-radius:999px;background:rgba(165,180,252,.18);color:#c7d2fe;font-size:${small ? 12 : 20}px;font-weight:700}
  /* 스크린샷(1280×800)에서 팝업 부분(x 420~1230, y 96~705)만 잘라 보여 준다 */
  .shot{position:absolute;left:700px;top:60px;width:810px;height:610px;overflow:hidden;border-radius:16px;box-shadow:0 30px 70px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.12);display:${small ? 'none' : 'block'}}
  .shot img{width:1280px;height:800px;margin-left:-420px;margin-top:-96px}
</style></head><body>
  <div class="copy"><div class="brand"><img src="${fileUrl(LOGO)}">COMO</div><h1>${c.title}</h1><p>${c.sub}</p><div class="tag">${c.tag}</div></div>
  <div class="shot"><img src="${fileUrl(shot)}"></div>
</body></html>`;
};

const browser = await chromium.launch({ channel: 'chromium' });
for (const lang of Object.keys(COPY)) {
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  for (const size of ['small', 'marquee']) {
    const [w, h] = size === 'small' ? [440, 280] : [1400, 560];
    const tab = await browser.newPage({ viewport: { width: w, height: h } });
    const html = path.join(OUT, lang, `${size}.html`);
    fs.writeFileSync(html, page(lang, size));
    await tab.goto(fileUrl(html));
    await tab.waitForLoadState('load');
    await tab.screenshot({ path: path.join(OUT, lang, `${size}.jpg`), type: 'jpeg', quality: 92 });
    fs.rmSync(html);
    await tab.close();
  }
  console.log(`${lang}: small 440×280, marquee 1400×560 → ${path.relative(ROOT, path.join(OUT, lang))}`);
}
await browser.close();
