// 릴리스 전 자동 점검(docs/release-checklist.md의 ☑ 항목). CI에서도 돈다.
//   - package.json들과 manifest의 버전이 같은지
//   - 릴리스 노트와 10개 언어 스토어 설명에 이번 버전 블록이 있는지
//   - manifest의 모든 호스트 권한에 스토어 심사용 사유가 적혀 있는지
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..', '..');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = [];

const manifest = readJson(path.join(ROOT, 'public', 'manifest.json'));
const { version } = manifest;
for (const file of ['package.json', 'apps/chrome-extension/package.json', 'apps/chrome-extension/pages/popup/package.json']) {
  const other = readJson(path.join(REPO, file)).version;
  if (other !== version) problems.push(`${file} 버전 ${other} ≠ manifest ${version}`);
}

const notes = fs.readFileSync(path.join(ROOT, 'store', 'release-notes.ko.txt'), 'utf8');
if (!notes.trimStart().startsWith(`🔹 ${version}`)) problems.push(`store/release-notes.ko.txt 맨 위에 🔹 ${version} 블록이 없음`);
const descriptions = fs.readdirSync(path.join(ROOT, 'store')).filter(name => /^description\..+\.txt$/.test(name));
if (descriptions.length < 10) problems.push(`스토어 설명이 ${descriptions.length}개 언어뿐(10개 필요)`);
for (const name of descriptions) {
  if (!fs.readFileSync(path.join(ROOT, 'store', name), 'utf8').includes(version)) problems.push(`store/${name}에 ${version} 소개가 없음`);
}

const checklist = fs.readFileSync(path.join(REPO, 'docs', 'release-checklist.md'), 'utf8');
const hosts = [...(manifest.host_permissions ?? []), ...(manifest.optional_host_permissions ?? [])];
for (const host of hosts) {
  if (!checklist.includes(`| \`${host}\` |`)) problems.push(`docs/release-checklist.md 권한 사유 표에 ${host}가 없음`);
}

if (problems.length) {
  console.error(`릴리스 점검 실패 (${version})\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`릴리스 점검 통과: ${version}, 설명 ${descriptions.length}개 언어, 호스트 권한 ${hosts.length}개`);
