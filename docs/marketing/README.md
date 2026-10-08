# 사용자 유입

2026-10-08 분석에서 나온 일과 그 도구. 숫자는 그날 기준(Chrome 사용자 160·평점 6개, 웨일 387).

## 1. 측정 — 어디서 들어왔는지

Chrome 웹스토어 대시보드 → 항목 → **통계(분석)**에서 노출·설치·제거와 **UTM별 획득**을 본다. 스토어 링크에 UTM을 붙여야 채널이 갈린다.

| 채널 | utm_source | 링크 |
| --- | --- | --- |
| 소개 페이지 | `como-site` | 페이지 안 버튼에 이미 붙어 있다(`site-src/build.mjs`) |
| 코인판 | `coinpan` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=coinpan&utm_medium=community&utm_campaign=launch-3-5 |
| 디시 비트코인 갤러리 | `dcinside` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=dcinside&utm_medium=community&utm_campaign=launch-3-5 |
| 네이버 카페 | `naver-cafe` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=naver-cafe&utm_medium=community&utm_campaign=launch-3-5 |
| 블로그 | `blog` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=blog&utm_medium=content&utm_campaign=kimp-guide |
| 텔레그램 | `telegram` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=telegram&utm_medium=community&utm_campaign=launch-3-5 |
| Reddit 등 영어권 | `reddit` | https://chromewebstore.google.com/detail/camiahnljjgndaficdcpboimdbdphnok?utm_source=reddit&utm_medium=community&utm_campaign=launch-3-5 |

- 웨일 스토어 링크는 https://store.whale.naver.com/detail/gbjlmpnhijdgcobpfpgeiepdfegdhkgl (UTM 집계 없음)
- 소개 페이지: https://hunhunseunghun.github.io/como_extension/ (영어 `/en/`)
- 제거할 때 뜨는 설문(walla.my) 응답도 한 달에 한 번 본다 — 제거 이유가 가장 정확한 개선 목록이다

**한 달에 한 번 볼 숫자**: 스토어 노출 → 설치 전환율, 주간 사용자, 제거 수, 평점 수. 검색어 개선(3.5.1) 전후를 비교한다.

| 기준(3.5.1 제출 전, 2026-09-08~10-06) | 값 |
| --- | --- |
| Chrome 스토어 노출 | 231 |
| 상세 페이지 조회 | 52 (출처: ext_sidebar·chatgpt.com·ext_app_menu, 캠페인 없음) |
| 설치 / 제거 | 55 / 33 (제거는 91%가 한국) |
| 주간 사용자 | 156 (한국 93%) |
| 웨일 사용자 | 385 |

## 2. 검색 노출 — 스토어 안에서 찾게

- 이름·요약(`public/_locales/*/messages.json`): 한국어에 김프·업비트·빗썸·바이낸스, 영어에 Kimchi Premium·Upbit·Bithumb·Binance (3.5.1)
- 웨일 등록 화면의 **키워드**(웨일 검색은 글자가 그대로 맞아야 한다 — '김치 프리미엄'으로는 '김치프리미엄'이 안 잡힌다). 쉼표·공백 포함 100바이트(UTF-8, 한글 한 자 3바이트)까지라 다 넣지 못한다. 3.5.1에 넣은 것(98바이트):
  `김프,김치프리미엄,비트코인,업비트,빗썸,코인시세,가상화폐,암호화폐,BTC`
  (전에는 비트코인,BTC,이더리움,ETH,리플,XRP,업비트,빗썸,바이낸스,실시간 시세. 바이낸스·코인 시세는 한국어 이름에 들어 있다)
- 공유 카드 오른쪽 아래 '스토어에서 COMO 코인 검색'(한국어)·'COMO crypto'(영어) — 두 검색어 모두 COMO가 1위로 나오는 것을 확인했다

## 3. 평점

- 리뷰 요청: 알림을 받은 뒤 두 번째 열 때, 또는 5회·2일 사용 뒤. '나중에'는 14일, 세 번 거절하면 묻지 않는다(`pages/popup/src/lib/reviewPrompt.ts`)
- 스토어별 리뷰 주소: Chrome·웨일·Edge. Firefox는 목록 주소가 정해지면 넣는다

## 4. 커뮤니티 소개 글 초안

각 커뮤니티의 홍보 규칙을 먼저 확인하고(홍보 게시판·요일 제한 등), 개발자라는 사실을 밝힌다. 같은 글을 여러 곳에 한꺼번에 올리지 않는다.

### 코인판·디시(짧게)

> 제목: 김프랑 업비트·바이낸스 시세 한 번에 보는 크롬 확장 만들었습니다 (무료)
>
> 개인적으로 쓰려고 만든 확장 프로그램인데 쓸 만해져서 공유합니다. 개발자 본인이에요.
>
> - 업비트·빗썸·코인원·바이낸스·코인베이스·바이비트·OKX 등 11곳 실시간 시세
> - 원화 마켓 코인마다 김프 표시, 김프 추이·차익 계산기
> - 지정가·1분 급등락·대량 체결·거래 공지 알림 (방해 금지 시간 있음)
> - 툴바 아이콘에 BTC 가격, 보유 자산 손익
>
> 광고·회원가입 없고, 시세는 거래소 공개 API만 씁니다. 쓰다가 불편한 점 댓글로 남겨 주시면 바로 고칩니다.
>
> 크롬: (위 표의 coinpan/dcinside 링크) · 웨일: 스토어에서 'COMO' 검색

### 네이버 카페·블로그(길게)

- 제목 예: 「김프 실시간으로 확인하는 법 — 크롬·웨일 확장 프로그램 COMO」
- 구성: 김프가 뭔지(2~3문장) → 확인하는 방법들(사이트·앱·확장 비교) → COMO로 보는 법(스크린샷 3장: 시세 표 김프 열, 김프 추이, 김프 알림) → 지정가 알림 설정법 → 마무리 링크(blog UTM)
- 블로그 검색어: 김프, 김치프리미엄, 김프 확인, 업비트 시세 확장, 코인 시세 크롬 확장
- 스크린샷: `apps/chrome-extension/store/screenshots/ko/`

### 영어(Reddit 등)

> Title: I built a free Chrome extension that shows live prices from 11 exchanges (incl. Korean ones) with the kimchi premium
>
> Dev here. COMO puts Binance, Coinbase, Bybit, OKX, Kraken, Upbit and Bithumb prices in one popup, shows the kimchi premium per coin, and has price/surge/whale alerts and a toolbar price badge. No ads, no account, only public exchange APIs. Feedback welcome.

## 5. 스토어 자산

- 스크린샷 1280×800(5장, 한·영): `node scripts/store-screenshots.mjs ko en`
  - Chrome: 현지화 스크린샷 영·한 5장, 전 언어 공통은 영어 5장(다른 언어용)
  - 웨일: 언어별 4장까지(1~4번). 공통 스크린샷은 모든 언어에서 언어별보다 먼저 보이므로 비워 둔다
- 프로모션 타일 440×280·1400×560(한·영): `node scripts/store-promo.mjs` → `store/promo/`. Chrome에는 언어 공통 한 벌만 올라가서 영어를 썼다
- Chrome 홈페이지 URL은 소개 페이지, 지원 URL은 GitHub 이슈
- 소개 페이지: `node site-src/build.mjs` → `site/` (push하면 Pages 워크플로가 올린다)
- 30초 소개 영상은 아직 없다(유튜브 계정에 올려야 등록할 수 있다)
