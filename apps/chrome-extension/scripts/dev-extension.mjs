// 개발용: 확장을 로드한 Chromium 창을 띄워 팝업을 보여주고, 코드가 바뀌면 다시 빌드·새로고침한다.
//   pnpm dev:ext              팝업 + 백그라운드 watch 빌드, 저장 시 자동 새로고침
//   pnpm dev:ext --devtools   팝업 탭에 개발자 도구를 함께 연다
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PROFILE = path.join(ROOT, 'node_modules', '.cache', 'como-dev-profile');
const withDevtools = process.argv.includes('--devtools');

const log = message => console.log(`[dev:ext] ${message}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 1. 백그라운드·팝업을 watch 모드로 빌드한다.
const watchers = [
  { name: 'background', cwd: ROOT },
  { name: 'popup', cwd: path.join(ROOT, 'pages', 'popup') },
].map(({ name, cwd }) => {
  const child = spawn('npx', ['vite', 'build', '--watch', '--logLevel', 'error'], {
    cwd,
    shell: true,
    stdio: 'inherit',
  });
  child.on('exit', code => code && log(`${name} watcher exited (${code})`));
  return child;
});

// Windows에서는 shell로 띄운 프로세스의 하위(vite)까지 함께 종료해야 한다.
const stopWatchers = () =>
  watchers.forEach(child => {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  });

let context = null;
let worker = null;
let page = null;
let popupUrl = '';
let isRestarting = false;

const shutdown = async code => {
  stopWatchers();
  await context?.close().catch(() => {});
  process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 2. 첫 빌드 결과가 생길 때까지 기다린다.
const required = ['background.iife.js', 'manifest.json', 'popup/index.html'].map(file => path.join(DIST, file));
while (!required.every(file => fs.existsSync(file))) await sleep(300);
await sleep(1500);

// 확장을 다시 로드하는 동안에는 팝업 주소가 잠시 막히므로 몇 번 재시도한다.
const openPopup = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await page.goto(popupUrl);
      return true;
    } catch {
      await sleep(500);
    }
  }
  log('팝업을 열지 못했습니다. 창에서 직접 새로고침해 주세요.');
  return false;
};

// 3. 확장을 로드한 브라우저를 띄운다. 프로필을 유지해 즐겨찾기·알림·보유 자산 설정이 남는다.
const launch = async () => {
  context = await chromium
    .launchPersistentContext(PROFILE, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--window-size=860,720',
        ...(withDevtools ? ['--auto-open-devtools-for-tabs'] : []),
      ],
    })
    .catch(error => {
      // 이전 dev:ext 창이 같은 프로필을 쓰고 있으면 실행되지 않는다.
      log('브라우저를 띄우지 못했습니다. 이미 열린 dev:ext 창이 있다면 닫고 다시 실행하세요.');
      log(error.message.split('\n')[0]);
      return shutdown(1);
    });
  context.on('close', () => {
    if (!isRestarting) shutdown(0);
  });

  [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  popupUrl = `chrome-extension://${worker.url().split('/')[2]}/popup/index.html`;

  page = context.pages()[0] ?? (await context.newPage());
  page.on('pageerror', error => log(`popup error: ${error.message}`));
  await openPopup();
};

await launch();
log(`팝업: ${popupUrl}`);
log('서비스 워커 로그는 chrome://extensions 에서 "서비스 워커"를 눌러 확인하세요. 종료: 창을 닫거나 Ctrl+C');

// 4. 팝업만 바뀌면 페이지만 새로고침하고, 백그라운드·manifest가 바뀌면 브라우저를 다시 띄운다.
//    (명령줄로 로드한 확장은 chrome.runtime.reload() 후 다시 열리지 않는다.)
let pending = new Set();
let timer = null;
// 첫 빌드가 늦게 끝나며 생기는 변경 이벤트는 무시한다.
let isReady = false;
setTimeout(() => (isReady = true), 3000);
fs.watch(DIST, { recursive: true }, (_event, file) => {
  if (!file || !isReady) return;
  pending.add(file.replaceAll('\\', '/'));
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const changed = [...pending];
    pending = new Set();
    try {
      if (changed.some(file => !file.startsWith('popup/'))) {
        log('백그라운드 변경 → 브라우저 다시 시작');
        isRestarting = true;
        await context.close();
        await launch();
        isRestarting = false;
      } else {
        log('팝업 변경 → 새로고침');
        await openPopup();
      }
    } catch (error) {
      isRestarting = false;
      log(`새로고침 실패: ${error.message}`);
    }
  }, 800);
});
