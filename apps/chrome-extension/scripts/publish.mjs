// 스토어에 새 버전을 올린다. 먼저 `pnpm build && pnpm package`로 release/ zip을 만든다.
//   node scripts/publish.mjs chrome|edge|firefox|all [--submit] [--notes "심사 메모"]
//   node scripts/publish.mjs status — 세 스토어의 게시·심사 중 버전만 읽는다(아무것도 보내지 않음).
// --submit 없이 실행하면 올릴 파일과 자격 증명만 확인하고 아무것도 보내지 않는다.
// 네이버 웨일 스토어는 업로드 API가 없어 개발자 센터에서 직접 올린다(docs/release-checklist.md).
//
// 자격 증명은 환경 변수나 apps/chrome-extension/.env.store(저장소에 올리지 않음)에 둔다.
//   Chrome:  CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID, CWS_ITEM_ID
//   Edge:    EDGE_PRODUCT_ID, EDGE_CLIENT_ID, EDGE_API_KEY
//   Firefox: AMO_JWT_ISSUER, AMO_JWT_SECRET
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..', '..');
const RELEASE = path.join(ROOT, 'release');

const envFile = path.join(ROOT, '.env.store');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const args = process.argv.slice(2);
const target = args.find(arg => !arg.startsWith('--')) ?? '';
const submit = args.includes('--submit');
const notesIndex = args.indexOf('--notes');
const notes = notesIndex >= 0 ? args[notesIndex + 1] : '';
const version = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'manifest.json'), 'utf8')).version;

const zipFor = store => {
  const file = path.join(RELEASE, `como-${version()}-${store === 'firefox' ? 'firefox' : 'chrome'}.zip`);
  if (!fs.existsSync(file))
    throw new Error(`${path.relative(ROOT, file)}가 없습니다. pnpm build && pnpm package를 먼저 실행하세요.`);
  return file;
};
const requireEnv = names => {
  const missing = names.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`환경 변수가 없습니다: ${missing.join(', ')}`);
  return Object.fromEntries(names.map(name => [name, process.env[name]]));
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${url} → ${response.status} ${text.slice(0, 500)}`);
  return { response, body: text ? safeJson(text) : null };
};
const safeJson = text => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

// Chrome Web Store API v2 (OAuth 새로 고침 토큰)
const CWS_ENV = ['CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_ITEM_ID'];
const chromeAuth = async env => {
  const { body: token } = await request('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.CWS_CLIENT_ID,
      client_secret: env.CWS_CLIENT_SECRET,
      refresh_token: env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  return { Authorization: `Bearer ${token.access_token}` };
};
const chrome = async () => {
  const env = requireEnv(CWS_ENV);
  const zip = zipFor('chrome');
  console.log(`[chrome] ${path.basename(zip)} → item ${env.CWS_ITEM_ID}`);
  if (!submit) return;
  const headers = await chromeAuth(env);
  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_ITEM_ID}`;
  const upload = await request(`https://chromewebstore.googleapis.com/upload/v2/${item}:upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: fs.readFileSync(zip),
  });
  console.log('[chrome] 업로드', JSON.stringify(upload.body));
  const publish = await request(`https://chromewebstore.googleapis.com/v2/${item}:publish`, {
    method: 'POST',
    headers,
  });
  console.log('[chrome] 심사 제출', JSON.stringify(publish.body));
};

// Microsoft Edge Add-ons API v1.1 (API 키)
const edge = async () => {
  const env = requireEnv(['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY']);
  const zip = zipFor('edge');
  console.log(`[edge] ${path.basename(zip)} → product ${env.EDGE_PRODUCT_ID}`);
  if (!submit) return;
  const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${env.EDGE_PRODUCT_ID}/submissions`;
  const headers = { Authorization: `ApiKey ${env.EDGE_API_KEY}`, 'X-ClientID': env.EDGE_CLIENT_ID };
  const waitFor = async url => {
    for (let i = 0; i < 60; i++) {
      const { body } = await request(url, { headers });
      if (body?.status && body.status !== 'InProgress') {
        if (body.status !== 'Succeeded')
          throw new Error(`[edge] ${body.status}: ${JSON.stringify(body.errors ?? body.message)}`);
        return body;
      }
      await sleep(5000);
    }
    throw new Error(`[edge] 시간 초과: ${url}`);
  };
  const upload = await request(`${base}/draft/package`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: fs.readFileSync(zip),
  });
  await waitFor(`${base}/draft/package/operations/${upload.response.headers.get('location')}`);
  console.log('[edge] 업로드 완료');
  const publish = await request(base, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: notes || `COMO ${version()}` }),
  });
  await waitFor(`${base}/operations/${publish.response.headers.get('location')}`);
  console.log('[edge] 심사 제출 완료');
};

// Firefox Add-ons: web-ext sign(listed). 빌드 결과가 번들이라 AMO 규정대로 소스 zip을 함께 올린다.
const firefox = async () => {
  const env = requireEnv(['AMO_JWT_ISSUER', 'AMO_JWT_SECRET']);
  const zip = zipFor('firefox');
  const source = path.join(RELEASE, `como-${version()}-source.zip`);
  console.log(`[firefox] ${path.basename(zip)} + ${path.basename(source)}`);
  execFileSync('git', ['archive', '--format=zip', '-o', source, 'HEAD'], { cwd: REPO, stdio: 'inherit' });
  if (!submit) return;
  const dir = fs.mkdtempSync(path.join(RELEASE, 'firefox-'));
  try {
    // Windows에서는 Git Bash의 GNU tar가 먼저 잡히면 zip을 못 풀고 «C:»를 원격 주소로 읽는다. 시스템 tar(bsdtar)를 쓴다.
    const tar =
      process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    execFileSync(tar, ['-xf', zip, '-C', dir], { stdio: 'inherit' });
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        '--yes',
        'web-ext@8',
        'sign',
        '--channel=listed',
        `--source-dir=${dir}`,
        `--artifacts-dir=${RELEASE}`,
        `--upload-source-code=${source}`,
        // 목록 버전은 심사에 며칠 걸린다. 올리고 나면 승인을 기다리지 않는다(기다리면 시간 초과로 실패처럼 보인다).
        '--approval-timeout=0',
      ],
      // 자격 증명은 명령줄 대신 환경 변수로 넘긴다. 실패하면 명령줄이 오류 메시지에 그대로 찍힌다.
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
        env: { ...process.env, WEB_EXT_API_KEY: env.AMO_JWT_ISSUER, WEB_EXT_API_SECRET: env.AMO_JWT_SECRET },
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

// 심사 상태. Edge API에는 상태 조회가 없어 공개 목록의 버전을 본다.
const status = async () => {
  const env = requireEnv(CWS_ENV);
  const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_ITEM_ID}`;
  const { body: cws } = await request(`https://chromewebstore.googleapis.com/v2/${item}:fetchStatus`, {
    headers: await chromeAuth(env),
  });
  const revision = state => (state ? `${state.distributionChannels?.[0]?.crxVersion} ${state.state}` : '없음');
  console.log(
    `[chrome] 게시 ${revision(cws.publishedItemRevisionStatus)} · 제출 ${revision(cws.submittedItemRevisionStatus)}`,
  );

  const { body: edge } = await request(
    'https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/nikdopfhkilmeedoblhlbbalkhiogmkd',
  );
  console.log(`[edge] 게시 ${edge.version} (${new Date(edge.lastUpdateDate * 1000).toISOString().slice(0, 10)})`);

  const amo = requireEnv(['AMO_JWT_ISSUER', 'AMO_JWT_SECRET']);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: amo.AMO_JWT_ISSUER, jti: crypto.randomUUID(), iat: now, exp: now + 60 })}`;
  const signature = crypto.createHmac('sha256', amo.AMO_JWT_SECRET).update(unsigned).digest('base64url');
  const { body: versions } = await request(
    'https://addons.mozilla.org/api/v5/addons/addon/como-crypto-price-tracker/versions/?filter=all_with_unlisted',
    { headers: { Authorization: `JWT ${unsigned}.${signature}` } },
  );
  console.log(`[firefox] ${versions.results.map(v => `${v.version} ${v.file?.status}`).join(' · ')}`);
  console.log('[whale] API 없음 — 개발자 센터에서 확인');
};

const STORES = { chrome, edge, firefox };
if (target === 'status') {
  await status();
  process.exit(0);
}
const targets = target === 'all' ? Object.keys(STORES) : [target];
if (!targets.every(name => name in STORES)) {
  console.error('사용법: node scripts/publish.mjs chrome|edge|firefox|all|status [--submit] [--notes "..."]');
  process.exit(1);
}
if (!submit) console.log('확인만 합니다(--submit을 붙이면 실제로 올립니다).');
let failed = false;
for (const name of targets) {
  try {
    await STORES[name]();
  } catch (error) {
    failed = true;
    console.error(error.message);
  }
}
process.exit(failed ? 1 : 0);
