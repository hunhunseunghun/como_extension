// 스토어 업로드용 zip을 만든다. 먼저 `pnpm build`가 필요하다.
//   release/como-<version>-chrome.zip   Chrome 웹스토어 · 네이버 웨일 스토어 · Edge Add-ons
//   release/como-<version>-firefox.zip  Firefox Add-ons (background.scripts, 사이드 패널 제외)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const RELEASE = path.join(ROOT, 'release');
// 스토어에 올리지 않는 파일
const EXCLUDE = new Set(['como_sequence_diagram.png', 'como_introduce.gif', 'como_screen.png']);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buffer => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

// 경로 구분자를 항상 '/'로 쓰는 최소 zip 작성기 (Windows Compress-Archive의 '\' 문제를 피한다).
const createZip = entries => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 파일 이름
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
};

const collect = (dir, base = '') =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (!base && EXCLUDE.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collect(full, relative) : [{ name: relative, data: fs.readFileSync(full) }];
  });

// 팝업 빌드는 이전 해시 파일을 지우지 않으므로 index.html이 참조하는 에셋만 넣는다.
const pruneStaleAssets = entries => {
  const html = entries.find(entry => entry.name === 'popup/index.html')?.data.toString('utf8') ?? '';
  const referenced = new Set([...html.matchAll(/assets\/([^"']+)/g)].map(match => match[1]));
  const js = entries.filter(entry => entry.name.startsWith('popup/assets/') && entry.name.endsWith('.js'));
  // 동적 import(차트 등)로 불러오는 청크도 포함한다.
  for (const entry of js) {
    if (!referenced.has(entry.name.slice('popup/assets/'.length))) continue;
    for (const match of entry.data.toString('utf8').matchAll(/["'`](?:\.\/)?([\w.-]+\.(?:js|css|png|svg|woff2?))["'`]/g)) {
      referenced.add(match[1]);
    }
  }
  return entries.filter(entry => !entry.name.startsWith('popup/assets/') || referenced.has(entry.name.slice('popup/assets/'.length)));
};

const toFirefoxManifest = manifest => {
  const firefox = structuredClone(manifest);
  firefox.background = { scripts: [manifest.background.service_worker] };
  delete firefox.side_panel;
  firefox.permissions = firefox.permissions.filter(permission => permission !== 'sidePanel');
  firefox.browser_specific_settings = {
    gecko: { id: 'como-crypto-price@como.extension', strict_min_version: '121.0' },
  };
  return firefox;
};

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
  console.error('dist/manifest.json이 없습니다. 먼저 pnpm build를 실행하세요.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));
const entries = pruneStaleAssets(collect(DIST));
fs.mkdirSync(RELEASE, { recursive: true });

const outputs = [
  ['chrome', entries],
  [
    'firefox',
    entries.map(entry =>
      entry.name === 'manifest.json'
        ? { ...entry, data: Buffer.from(JSON.stringify(toFirefoxManifest(manifest), null, 2)) }
        : entry,
    ),
  ],
];
for (const [target, files] of outputs) {
  const file = path.join(RELEASE, `como-${manifest.version}-${target}.zip`);
  fs.writeFileSync(file, createZip(files));
  console.log(`${path.relative(ROOT, file)}  (${files.length} files, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}
