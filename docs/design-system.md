# COMO 디자인 시스템

COMO 팝업·사이드 패널의 시각 규칙과 토큰 정의다. 구현은 `apps/chrome-extension/pages/popup/src/styles/index.css` 한 곳에 있다.

## 버전

| 버전 | 정의 | 언제 |
|---|---|---|
| **v1** | 3.0.0까지의 화면. shadcn neutral 변수 + Tailwind 회색 팔레트(`neutral`·`gray`·`zinc`·`stone`) 값을 그대로 보존한다. | 3.0.0 이하 |
| **v2** | 이 문서의 토큰 체계. 값은 [SEED Design](https://github.com/daangn/seed-design)(Apache-2.0)의 팔레트·간격·모서리·모션을 바탕으로 한다. | 3.1.0부터 기본 |

- 두 버전은 **같은 의미 토큰**을 쓰고 값만 다르다. 컴포넌트 코드는 하나다.
- 설정 → 디자인에서 `v1` / `v2`를 고른다. 값은 `localStorage['como-ds']`에 저장되고, `<html data-ds="v1|v2">`가 토큰 값을 바꾼다. 렌더 전에 `main.tsx`에서 적용해 깜빡임이 없다.
- 다크 모드는 `.dark` 클래스가 같은 토큰을 다시 채운다. 테마는 라이트 · 다크 · 시스템(기본) 세 가지다.

```
:root                     v2 라이트 (기본)
.dark                     v2 다크
:root[data-ds='v1']       v1 라이트
:root[data-ds='v1'].dark  v1 다크
```

## 원칙

1. **의미 토큰만 쓴다.** 컴포넌트에 `text-gray-500`, `#6b7280`, `text-[10px]` 같은 원시 값을 쓰지 않는다. 필요한 역할이 없으면 토큰을 먼저 추가한다.
2. **숫자는 세로로 맞춘다.** 가격·수량·등락률처럼 행끼리 비교하는 숫자에는 `.num`(v2에서 `tabular-nums`)을 붙인다.
3. **위계는 굵기보다 회색 단계로.** 본문 `fg-neutral` → 보조 `fg-muted` → `fg-subtle` → `fg-faint` 순으로 약해진다. 굵기는 400·500·600·700만 쓴다.
4. **강조색은 시세 색 하나.** 빨강·파랑(초록)은 상승·하락 전용이다. 다른 강조(경고·오류)는 `fg-critical`처럼 별도 토큰을 쓰고 상승색과 겹치지 않게 한다.
5. **v2는 11px 아래 글자를 쓰지 않는다.** 아이콘 안의 글리프(`warningIcon`)만 예외다.

## 색

### 배경

| 토큰 (Tailwind) | 역할 | v2 라이트 | v2 다크 | v1 라이트 | v1 다크 |
|---|---|---|---|---|---|
| `bg-layer-default` | 기본 화면 | `#ffffff` | `#16171b` | `hsl(0 0% 100%)` | `hsl(0 0% 13%)` |
| `bg-layer-floating` | 팝오버·메뉴·다이얼로그 | `#ffffff` | `#1d2025` | `#ffffff` | `hsl(0 0% 3.9%)` |
| `bg-layer-raised` | 한 단계 올라온 면 (즐겨찾기 고정 행) | `#f7f8f9` | `#1d2025` | `#f3f4f6` | `#1f2937` |
| `bg-neutral-weak` | 약한 면 (표 머리, hover, 선택) | `#eeeff1` | `#2b2e35` | `#e4e4e7` | `#27272a` |
| `bg-neutral-weak-pressed` | 약한 면 눌림 / 자리표시 원 | `#dcdee3` | `#393d46` | `#d4d4d4` | `#404040` |
| `bg-overlay` | 모달 뒤 | `rgb(0 0 0 / .7)` | 같음 | 같음 | 같음 |

### 글자

| 토큰 | 역할 | v2 라이트 | v2 다크 | v1 라이트 | v1 다크 |
|---|---|---|---|---|---|
| `text-fg-neutral` | 본문 | `#1a1c20` | `#f3f4f5` | `hsl(0 0% 3.9%)` | `hsl(0 0% 98%)` |
| `text-fg-muted` | 보조 (표 머리 글자) | `#555d6d` | `#dcdee3` | `#292524` | `#9ca3af` |
| `text-fg-subtle` | 약한 보조 (마켓 코드, 단위) | `#868b94` | `#b0b3ba` | `#6b7280` | `#6b7280` |
| `text-fg-faint` | 가장 약한 보조 (안내 문구) | `#868b94` | `#b0b3ba` | `#a3a3a3` | `#a3a3a3` |
| `text-fg-placeholder` | 입력 안내 | `#b0b3ba` | `#868b94` | `#525252` | `#a3a3a3` |
| `text-fg-disabled` | 비활성 | `#d1d3d8` | `#5b606a` | `#a3a3a3` | `#525252` |
| `text-fg-critical` | 오류·삭제 | `#fa342c` | `#ff6e60` | `hsl(0 84% 60%)` | `hsl(0 63% 31%)` |

v2에서 `fg-subtle`과 `fg-faint`는 같은 값이다(SEED에는 한 단계뿐). v1의 두 회색(gray-500 / neutral-400)을 보존하려고 토큰을 나눴다.

### 선

| 토큰 | v2 라이트 | v2 다크 | v1 |
|---|---|---|---|
| `border-stroke-weak` (= `border`) | `#dcdee3` | `#393d46` | `hsl(0 0% 87%)` / 다크 `hsla(0 0% 28% / .89)` |
| `ring-stroke-strong` | `#b0b3ba` | `#868b94` | `#a3a3a3` |
| `ring-stroke-focus` | `#1e82eb` | `#41a2f9` | `#0a0a0a` / 다크 `#d4d4d4` |

### 시세

| 토큰 | 빨강 상승 (`red-up`, 한·중·일 기본) | 초록 상승 (`green-up`) |
|---|---|---|
| `text-up` / `bg-up-weak` | `#ef4444` / 12% | `#16a34a` / 12% |
| `text-down` / `bg-down-weak` | `#3b82f6` / 12% | `#ef4444` / 12% |

- `<html data-updown="red-up|green-up">`가 바꾼다. 두 디자인 버전에서 같다.
- 툴바 배지(`src/background/index.js`의 `updateBadge`)와 차트 캔들(`ChartToolTip`, `--como-up`/`--como-down`을 읽음)도 같은 값을 쓴다. 값을 바꾸면 세 곳을 함께 바꾼다.

### shadcn/ui 변수

`--background`, `--primary`, `--border` 등은 v2에서 위 의미 토큰을 가리키고, v1에서는 3.0.0의 hsl 값을 그대로 쓴다. `components/ui/*`는 이 변수와 의미 토큰만 쓴다.

## 글자

| 토큰 | v2 | v1 | 줄 높이 | 쓰임 |
|---|---|---|---|---|
| `text-cap-xs` | 11px | 9px | 부모 | 아주 작은 부가 정보 (DEX 주소, 인사이트 보조) |
| `text-cap-s` | 11px | 10px | 부모 | 표 보조 줄, 설정 컨트롤 |
| `text-cap` | 11px | 11px | 부모 | 팝오버 본문, 헤더 칩 |
| `text-body-s` | 12px | 12px | 16px | 표 본문, 툴팁 |
| `text-body` | 13px | 13px | 18px | — |
| `text-title-s` | 14px | 14px | 19px (v1 20px) | 기본 버튼·메뉴 |
| `text-title` | 16px | 16px | 22px | 섹션 제목 |
| `text-display` | 20px | 20px | 27px | 큰 숫자 (총 평가금액) |

- 글꼴: Pretendard(jsDelivr) → 시스템 산세리프. 별도 라이선스가 필요 없는 글꼴만 쓴다.
- `cn()`(`lib/utils.ts`)은 `tailwind-merge`에 위 크기 이름을 알려 준다. 새 크기를 추가하면 거기도 추가한다. 빠뜨리면 `text-cap`을 글자색으로 오인해 `text-primary-foreground`를 지운다.

## 간격 · 크기

- 4px 격자 (Tailwind 기본 `1` = 4px). SEED `x1`–`x16`과 같다.
- 팝업: 420×430(기본), 800×600(넓게). 사이드 패널은 가득 채우고 700px 이상에서 넓은 열을 쓴다.
- 표 행 48px. 헤더 칩·작은 버튼 높이 24px(`h-6`), 입력 28px(`h-7`).
- 팝오버 너비 288px(`w-72`)·320px(`w-80`).

## 모서리

| Tailwind | v2 | v1 |
|---|---|---|
| `rounded-sm` | 4px | `0.6rem - 4px` |
| `rounded-md` | 8px | `0.6rem - 2px` |
| `rounded-lg` | 12px | `0.6rem` |
| `rounded-xl` | 16px | `0.6rem + 4px` |
| `rounded-full` | 배지·아바타 | 같음 |

## 모션

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--como-duration-d2` | 100ms | hover 색 |
| `--como-duration-d3` | 150ms | 상호작용 |
| `--como-duration-d4` | 200ms | 팝오버 열고 닫기 |
| `--como-duration-d6` | 300ms | 가격 깜빡임 (`FlashCell`) |
| `ease-como` / `ease-como-enter` / `ease-como-exit` | SEED 곡선 | 기본 / 들어옴 / 나감 |

`prefers-reduced-motion: reduce`이면 모든 애니메이션·전환을 1ms로 줄인다.

## 컴포넌트 규칙

- 기반은 shadcn/ui + Radix (`components/ui/`). 새 컴포넌트도 의미 토큰만 쓴다.
- 팝오버: `bg-background`(또는 `bg-layer-floating`) + `border` + `text-cap`, 안쪽 여백 `p-2`.
- 툴팁: 지금은 헤더 버튼마다 `span`으로 직접 그린다(`bg-black opacity-50`). 새로 만들 때는 `components/ui/tooltip`을 쓴다.
- 시세 숫자: `FlashCell`이 `.num`과 깜빡임 색을 붙인다. 직접 그릴 때도 `num text-up|text-down`.
- 아이콘: lucide-react, 크기 `size-3.5`(14px) 기본.

## 토큰 추가 절차

1. `index.css`의 `:root`(v2 라이트)와 `.dark`(v2 다크)에 `--como-*` 값을 넣는다.
2. v1에서 다른 값이어야 하면 `:root[data-ds='v1']`, `:root[data-ds='v1'].dark`에도 넣는다(없으면 v2 값을 물려받는다).
3. `@theme inline`에 `--color-*` / `--text-*`로 노출한다.
4. 글자 크기면 `lib/utils.ts`의 `tailwind-merge` 설정에 이름을 더한다.
5. 이 문서의 표를 갱신한다.

## 참고와 라이선스

- **SEED Design** (당근, Apache-2.0): 팔레트 회색·빨강·파랑 값, 의미 토큰 이름 체계(`bg`/`fg`/`stroke` × 역할), 모서리 r1–r4, 모션 d1–d6과 easing을 참고했다. 당근 로고·이름·캐릭터 같은 브랜드 자산은 쓰지 않는다.
- **토스 TDS**: 앱인토스 전용 라이선스라 코드·글꼴(Toss Product Sans)·에셋을 쓰지 않는다. 원칙(고정폭 숫자, 회색 단계 위계, 강조색 최소화)만 참고했다.
