# 릴리스 체크리스트

만든 버전이 스토어에 올라가지 않은 채 쌓이는 일(크롬 3.0.0에서 3.1~3.3이 빠짐)을 막기 위한 순서다.
`node apps/chrome-extension/scripts/check-release.mjs`가 아래 ☑ 표시 항목을 자동으로 확인한다(CI에서도 돈다).

## 1. 버전 올리기

- [ ] `pnpm update-version <x.y.z>` — package.json 6개와 `public/manifest.json`을 함께 바꾼다 ☑
- [ ] `store/release-notes.ko.txt` 맨 위에 `🔹 x.y.z` 블록 ☑
- [ ] `store/description.*.txt` 10개 언어에 새 버전 소개 블록 ☑
- [ ] 새 권한이 생겼으면 아래 [권한 사유](#권한-사유) 표에 한 줄 추가 ☑ (표에 없는 호스트가 manifest에 있으면 검사가 실패한다)

## 2. 검증

- [ ] `pnpm --filter chrome-extension test:unit`
- [ ] `pnpm --filter chrome-extension lint` · `pnpm --filter popup lint`
- [ ] `pnpm build` (popup#build는 캐시하지 않는다)
- [ ] `pnpm --filter chrome-extension test:e2e` — 보조 API는 모의 응답, 거래소는 실제 서버. 실제 서버로만 보려면 `COMO_E2E_LIVE=1`
- [ ] `docs/qa/test-cases.md`에 새 버전 항목과 결과 기록

## 3. 패키지

- [ ] `pnpm --filter chrome-extension package` → `release/como-x.y.z-{chrome,firefox}.zip`
- [ ] Firefox: `npx web-ext@8 lint --source-dir <firefox zip을 푼 폴더>` 오류 0

## 4. 스토어 제출

자격 증명은 `apps/chrome-extension/.env.store`(저장소에 올리지 않음). 변수 이름은 `scripts/publish.mjs` 머리말 참고.

- [ ] 확인만: `pnpm --filter chrome-extension publish:store all`
- [ ] Chrome 웹스토어: `publish:store chrome --submit` (API v2). 권한이 바뀌었으면 대시보드 '개인정보 보호' 탭의 호스트 권한 사유를 아래 표대로 갱신
- [ ] Microsoft Edge: `publish:store edge --submit --notes "<심사 메모>"`. 권한이 바뀌었으면 Partner Center의 사유도 갱신
- [ ] Firefox(AMO): `publish:store firefox --submit` — 소스 zip(`git archive`)을 함께 올린다. 빌드 방법: 루트에서 `pnpm install && pnpm build && pnpm --filter chrome-extension package`. 상품 페이지 이름은 50자 제한(넘으면 잘림 — « – » 앞부분만), 힌디어·인도네시아어는 AMO에 없어 8개 언어. 웹으로 올릴 때 버전 노트·심사자 메모(빌드 방법)를 빠뜨렸으면 제출 뒤 버전 편집에서 채울 수 있다
- [ ] 네이버 웨일 스토어: 업로드 API가 없어 [개발자 센터](https://store.whale.naver.com/developer)에서 chrome zip을 직접 올린다
- [ ] 사용자용 업데이트 노트에 새 버전 추가 — 확장의 「업데이트 노트」 버튼과 새 기능 안내가 여는 공개 Notion 페이지([COMO(코모) 확장 프로그램 업데이트 노트](https://trusted-surf-f62.notion.site/COMO-15f29bb357f98026be3dd2c062a18257), `UpdateNoteToggle.tsx`·`WhatsNew.tsx`). `store/release-notes.ko.txt`를 그 페이지 말투(「~추가했습니다」)로 맨 위에 넣는다. 다른 워크스페이스라 Notion 연결은 `notion-como`(COMO TODO 워크스페이스로 인증돼 있으면 404 — `/mcp`에서 이 페이지가 있는 워크스페이스로 다시 인증). 넣은 뒤 아래쪽 옛 기록 모양이 그대로인지 확인(편집 도구가 「1. …」로 시작하는 글머리를 번호 목록으로 바꾼 적이 있다)
- [ ] 제출한 날짜와 각 스토어 상태를 `docs/qa/test-cases.md` 해당 버전 아래에 기록

## 5. 심사 뒤

- [ ] 네 스토어 모두 게시됐는지 확인 — `pnpm --filter chrome-extension publish:store status`(Chrome·Edge·Firefox, 웨일은 개발자 센터)
- [ ] 리뷰·오류 신고 확인

## 권한 사유

스토어 심사 양식에 붙여 넣는 문구. 선택 권한은 사용자가 해당 기능을 켤 때만 요청한다.

| 호스트 | 구분 | 사유 |
| --- | --- | --- |
| `https://api.upbit.com/*` | 필수 | 업비트 시세·종목 목록, 계정 연동 시 잔고·입출금 상태(읽기 전용) |
| `https://api.bithumb.com/*` | 필수 | 빗썸 시세·종목 목록·입출금 상태 |
| `https://api.binance.com/*` | 필수 | 바이낸스 현물 시세·캔들, 계정 연동 시 잔고(읽기 전용) |
| `https://fapi.binance.com/*` | 필수 | 바이낸스 선물 펀딩비·청산·롱숏 비율·미결제약정 |
| `https://api.bybit.com/*` | 필수 | 바이비트 시세 |
| `https://www.okx.com/*` | 필수 | OKX 시세 |
| `https://api.exchange.coinbase.com/*` | 필수 | 코인베이스 시세 |
| `https://api.bitget.com/*` | 필수 | 비트겟 시세 |
| `https://api.kraken.com/*` | 필수 | 크라켄 시세 |
| `https://api.coindcx.com/*` | 필수 | CoinDCX 시세 |
| `https://public.coindcx.com/*` | 필수 | CoinDCX 시세(공개 캔들) |
| `https://www.koreaexim.go.kr/*` | 필수 | 원·달러 환율(김프 계산) |
| `https://m.stock.naver.com/*` | 필수 | 원·달러 환율 예비 출처 |
| `https://open.er-api.com/*` | 필수 | 표시 통화 환율 |
| `https://api.alternative.me/*` | 필수 | 공포·탐욕 지수 |
| `https://api.coingecko.com/*` | 필수 | BTC 도미넌스, 역대 최고가, 트렌딩 코인 |
| `https://api.dexscreener.com/*` | 필수 | DEX 토큰 검색과 관심 목록 시세 |
| `https://www.coindesk.com/*` | 선택 | 영어 뉴스 RSS(트렌드 탭 · 차트 급등락 봉) |
| `https://www.blockmedia.co.kr/*` | 선택 | 한국어 뉴스 RSS(트렌드 탭 · 차트 급등락 봉) |
| `https://defillama-datasets.llama.fi/*` | 선택 | 토큰 언락 일정 |
| `https://api-manager.upbit.com/*` | 선택 | 업비트 거래 공지 알림 |
| `https://feed-api.bithumb.com/*` | 선택 | 빗썸 거래 공지 알림 |
| `https://nfs.faireconomy.media/*` | 선택 | 경제 일정(FOMC·CPI 등)과 발표 전 알림 |
| `https://api.coinone.co.kr/*` | 선택 | 코인원 시세(처음 고를 때 요청) |
| `https://api.digitalx.miraeasset.com/*` | 선택 | 디지털엑스 시세(처음 고를 때 요청) |

API 권한: `storage`(설정·알림 규칙), `notifications`(가격·공지 알림), `alarms`(주기 확인), `sidePanel`(사이드 패널 보기, Firefox 제외).
