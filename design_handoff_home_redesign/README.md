# Handoff: Blundermate 홈 화면 리디자인

## 개요

체스 분석 앱 **Blundermate**의 모바일 홈 화면 정보 배치를 리디자인했습니다. 기존 홈은 한 화면에 너무 많은 컨트롤(설정·검색·FAB·프로필 카드·시간대 필터·최근 게임·피드백·4탭 nav)을 요구했고, 이를 정리해 **"어떤 게임을 다시 들여다볼까요?"** 라는 단일 질문 중심으로 재구성했습니다.

핵심 제약: 이 앱은 자원 제약상 **사용자가 직접 트리거한 게임만 분석**됩니다. 따라서 홈 카드는 분석 여부에 따라 두 가지 상태를 가지지만, **카드 자체의 크기/구조는 동일**하고 분석 결과 데이터(정확도%, move-class 칩)만 조건부로 표시됩니다.

## 디자인 파일에 대해

`design_files/` 폴더의 HTML/JSX는 **디자인 참조 프로토타입**입니다. 운영 코드로 그대로 쓰는 것이 아니라, 대상 코드베이스의 환경(React/Vue/Swift 등)에서 기존 패턴을 활용해 **이 디자인을 재현**하는 것이 목표입니다. 환경이 아직 없다면 프로젝트에 적합한 프레임워크를 골라 구현하세요.

GitHub 원본 코드: `reus3148-blip/blundermate` (vanilla JS, `index.html` + `main.js` + `styles.css` 구조)

## 충실도

**Hi-fi (high-fidelity)** — 색·간격·타이포·인터랙션 모두 확정. 픽셀 단위로 재현해야 합니다.

## 스코프

**이 핸드오프에 포함된 것**: 홈 화면 한 개 (모바일).
**포함되지 않은 것**: 라이브러리, 통계, 분석 화면. 단, 하단 3탭 네비게이션(홈·라이브러리·통계)은 홈에서 셋 다 보이므로 함께 구현해야 합니다.

---

## 화면 구조

### 홈 화면 (`Home`)

**목적**: 사용자가 분석할 게임을 고르거나, 미분석 게임의 분석을 트리거하거나, PGN으로 새 게임을 가져옵니다.

**전체 레이아웃** (모바일, 390 × 844 기준):
- `display: flex; flex-direction: column; height: 100%`
- 상단 바 (52px 고정) → 스크롤 본문 (`flex: 1; overflow-y: auto; padding: 20px 20px 100px`) → 하단 네비 (64px 고정)
- 배경: `#FAF8F4` (페이퍼 톤, 따뜻한 오프화이트)
- 폰트 패밀리: `'Inter', sans-serif`
- 기본 텍스트색: `#1C1D1F`

#### 1. 상단 바

`display: grid; grid-template-columns: 44px 1fr 44px; height: 52px; padding: 0 12px; align-items: center`

- **좌**: 설정 아이콘 (Lucide `settings`, 20px, `#62646A`, 44×44 hit target)
- **중앙**: 워드마크 — `<span style="font-weight: 700">blunder</span><span style="font-weight: 400">mate</span>` · `font-size: 15px; letter-spacing: -0.01em`. **홈 화면에서만** 워드마크. 다른 화면에서는 화면 타이틀로 교체.
- **우**: + 아이콘 (line1: 12,5→12,19; line2: 5,12→19,12 / 22px / `#14140F` / 2px stroke). 탭하면 PGN 임포트 모달.

#### 2. 히어로 섹션

`padding: 24px 0 28px`

- 메인 카피 (2줄):
  - 한국어: "어떤 게임을\n다시 들여다볼까요?"
  - 영어: "What game\nshall we review?"
- 스타일: `font-size: 38px; font-weight: 600; letter-spacing: -0.035em; line-height: 1.05; color: #14140F`

- 메타 행 (`margin-top: 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #62646A`):
  1. **레이팅 pill** — `display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #fff; border-radius: 999px; border: 1px solid rgba(28,29,31,.08)` 안에:
     - 6×6 dot (`background: #3A8560`)
     - 레이팅 숫자 (`color: #1C1D1F; font-weight: 600`, 예: "1812")
     - 시간 컨트롤명 (예: "Rapid")
  2. 점 구분자 ("·", `color: #9A9CA3`)
  3. "최근 15경기" (영어: "Last 15")
  4. **폼 스트립** — 최근 15경기 결과를 4×12px 세로 막대로. 승=`#3A8560`, 패=`#D03832`, 무=`#C7C9CE`. `gap: 2px`. opacity는 가장 오래된 것이 0.4, 최신이 1.0으로 그라데이션: `opacity: 0.4 + (i / 15) * 0.6`.

#### 3. 최근 게임 섹션

섹션 헤더:
- `display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; padding: 0 2px`
- 좌측 h2: "최근 게임" / "Recent games" — `font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #9A9CA3; margin: 0`
- 우측 버튼: "모두 보기" / "See all" — `background: none; border: none; padding: 0; font-size: 12px; color: #62646A; cursor: pointer`

게임 카드 리스트:
- `display: flex; flex-direction: column; gap: 10px`
- 가장 최근 4개 정도. 시간순 (최신이 위).

##### 게임 카드

모든 게임이 동일한 카드 구조를 사용합니다. 분석 여부에 따라 일부 영역만 다릅니다.

**컨테이너**:
```
background: #fff;
border-radius: 14px;
padding: 14px;
display: flex;
gap: 12px;
align-items: stretch;
box-shadow: 0 1px 2px rgba(20,20,15,.04), 0 0 0 0.5px rgba(20,20,15,.06);
cursor: pointer;
```

**좌: 미니보드** (84 × 84px)
- SVG 8×8 그리드, 한 칸 `84/8 = 10.5px`
- 라이트 칸 `#E8DCBF`, 다크 칸 `#8C6840`
- 마지막 수 하이라이트: 출발/도착 칸에 `fill: rgba(43,91,215,.28)` 오버레이
- 기물은 유니코드 글리프 (`♔♕♖♗♘♙` 등). 흰 기물 fill `#fafafa` + stroke `#1c1d1f` 0.8px (`paint-order: stroke fill`). 검 기물 fill `#1c1d1f`.
- `font-size: 칸크기 * 0.92`, 칸 중앙에서 살짝 아래 (`y + 칸크기 * 0.32`)
- 보드 자체 `border-radius: 6px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 0.5px rgba(0,0,0,.1)` (단, 카드 안에서는 `border={false}`로 boxShadow 제거)

**중간: 본문** (`flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between`)

상단:
- 헤더 행 (`display: flex; align-items: center; gap: 8px; margin-bottom: 4px`):
  - **결과 칩** — `font-size: 10px; font-weight: 700; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 3px`. 한 글자: 한국어 "승"/"패"/"무", 영어 "W"/"L"/"D".
    - 승: `background: #3A856014` (= `#3A8560` 12% alpha), `color: #3A8560`
    - 패: `background: #D0383214`, `color: #D03832`
    - 무: `background: #9A9CA314`, `color: #9A9CA3`
    - 주의: 코드의 `+'1f'` 표기는 hex alpha (≈12%).
  - 상대 닉네임 — `font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`
  - 상대 레이팅 — `font-size: 11px; color: #9A9CA3`

- 메타 행 (`font-size: 11px; color: #62646A; display: flex; gap: 6px; align-items: center; flex-wrap: wrap`):
  - 오프닝 이름 (예: "시실리안 디펜스" / "Sicilian Defense")
  - 점 구분자 (`color: #C7C9CE`)
  - 수 카운트 (예: "47수" / "47 moves")

  **출처 뱃지(chess.com/lichess/PGN)는 표시하지 않습니다.**

하단 (분석된 게임만):
- `margin-top: 8px`
- **Move-class 칩 그룹** — `display: inline-flex; gap: 6px; flex-wrap: wrap`. 각 칩:
  - `display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #62646A`
  - 6×6 동그라미 + 숫자
  - 색상: 브릴리언트 `#3A8560`, 그레이트 `#2D6E55`, 미스 `#D97706`, 블런더 `#D03832`
  - 카운트가 0이면 표시하지 않음

미분석 게임은 이 영역 자체를 렌더하지 않음 (조건부).

**우: 우측 메타 컬럼**
```
display: flex;
flex-direction: column;
align-items: flex-end;
justify-content: space-between;
flex-shrink: 0;
min-width: 52px;
```
모든 텍스트 `white-space: nowrap` 필수. (없으면 한국어가 한 글자씩 세로로 쪼개짐)

- 상단: 시간 ("오늘"/"어제"/"2일 전" / "Today"/"Yesterday"/"2d ago") — `font-size: 11px; color: #9A9CA3`
- 하단:
  - 분석됨 → 정확도% — `font-size: 13px; font-weight: 700; color: #1C1D1F` (예: "91%")
  - 미분석 → "분석" 버튼 — `font-size: 11px; font-weight: 600; color: #14140F; padding: 5px 10px; background: #F2EDE3; border: none; border-radius: 6px; cursor: pointer`

#### 4. 하단 네비게이션

`display: flex; justify-content: space-around; background: #fff; border-top: 1px solid rgba(28,29,31,.08); flex-shrink: 0`

3개 탭 (균등 분할, 각 64px 높이):
1. 홈 (Home) — Lucide `home` 아이콘
2. 라이브러리 (Library) — 책 옆구리 4개 세로선 아이콘
3. 통계 (Insights) — 막대 차트 아이콘

각 탭 버튼:
```
flex: 1;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
height: 64px;
background: none;
border: none;
cursor: pointer;
```
- 아이콘 22px, 라벨 `font-size: 10px; font-weight: 500`
- 활성: `color: #1C1D1F`
- 비활성: `color: #9A9CA3`

---

## 인터랙션

- **게임 카드 탭**:
  - 분석됨 → 분석 결과 화면(오답노트)으로 네비게이션
  - 미분석 → 우측 "분석" 버튼이 시각적으로 명확하므로 카드 본체 탭도 분석 트리거하도록 처리 가능 (아직 미확정 — 개발자 판단)
- **"분석" 버튼**: 게임당 약 30초~1분 소요. 진행 중 상태 UI는 별도 디자인 필요 (이번 핸드오프에 미포함).
- **+ 아이콘**: PGN 붙여넣기 모달 오픈.
- **설정 아이콘**: 설정 화면.
- **검색은 제거됨** — 라이브러리 화면에서 처리.
- **워드마크**: 다른 화면 진입 시 화면 타이틀로 교체. 홈에서만 워드마크.

---

## 상태 / 데이터 모델

```ts
type Game = {
  id: number | string;
  result: 'win' | 'loss' | 'draw';
  opponent: string;
  oppRating: number;
  tc: string;          // "Rapid 10+0" 등
  ago: string;         // "오늘"/"어제"/"2일 전" — 사전 포맷팅
  moves: number;
  opening: string;
  fen: string;         // 마지막 위치
  lastMove?: [string, string];  // ["e2","e4"] — 미분석이라도 기록 가능
  analyzed: boolean;
  // 분석된 경우만:
  classification?: { brilliant: number; great: number; mistake: number; blunder: number };
  accuracy?: number;
};

type User = {
  rating: number;
  tc: string;
  delta?: number;      // 세션 변동
};

type Form = ('w' | 'l' | 'd')[];  // 길이 15, 시간순
```

---

## 디자인 토큰

### 색상

| 토큰 | 값 | 용도 |
|---|---|---|
| `--p-bg-warm` | `#FAF8F4` | 화면 배경 (페이퍼 톤) |
| `--p-bg-cream` | `#F2EDE3` | "분석" 버튼 배경 등 |
| `--p-ink` | `#14140F` | 본문 강조, 다크 CTA 배경 |
| `--tx` | `#1C1D1F` | 기본 텍스트 |
| `--tx2` | `#62646A` | 보조 텍스트 |
| `--tx3` | `#9A9CA3` | 메타 텍스트, 비활성 |
| `--rule` | `#C7C9CE` | 점 구분자, 가는 선 |
| 카드 배경 | `#fff` | |
| 카드 외곽선 | `rgba(28,29,31,.08)` | 1px |

**브랜드/평가 색** (move-class):
| 토큰 | 값 | 의미 |
|---|---|---|
| `--p-brand-1` | `#3A8560` | brilliant, 승 |
| `--p-brand-2` | `#2D6E55` | great |
| `--p-warn-1` | `#D97706` | mistake |
| `--p-warn-2` | `#D03832` | blunder, 패 |

**보드 색**:
- 라이트 칸 `#E8DCBF`, 다크 칸 `#8C6840`
- 마지막 수 하이라이트 `rgba(43,91,215,.28)`

### 타이포

- 패밀리: Inter (모든 weight)
- 히어로 디스플레이: 38px / 600 / -0.035em / 1.05
- 카드 헤딩 (상대 닉): 13px / 600
- 본문/메타 보조: 11–12px / 400–500
- uppercase 라벨: 11px / 600 / 0.08em / uppercase

### 간격 / 모서리

- 카드 padding: 14px, gap 12px, radius 14px
- 화면 padding: 좌우 20px
- pill radius: 999px
- 작은 칩 radius: 3–6px
- 그림자(카드): `0 1px 2px rgba(20,20,15,.04), 0 0 0 0.5px rgba(20,20,15,.06)`

---

## 자산

- **아이콘**: Lucide 스타일 인라인 SVG. `viewBox="0 0 24 24"`, `currentColor`, `stroke-width: 2`, `round` 캡/조인. 사용한 아이콘: home, library(=책 4선), chart(=세로 막대), settings, search(미사용), arrow-right, chevron-right, chevron-left, chevron-down, bookmark, sparkle, flame, clock, target, close, plus. 정의는 `design_files/icons.jsx` 참조.
- **체스 기물**: 유니코드 글리프 (`♔♕♖♗♘♙♚♛♜♝♞♟`). 외부 자산 없음.
- **로고/브랜드 자산**: 별도. 이번 핸드오프에는 워드마크(텍스트)만 사용.

---

## 파일

`design_files/` 폴더 안:

| 파일 | 역할 |
|---|---|
| `Home A Final.html` | 단독 실행 가능한 프로토타입 진입점. 더블클릭으로 열어 확인. |
| `variant-a-final.jsx` | **메인 컴포넌트** `BMHomeAFinal` — 이 화면의 정답 구현. |
| `_shared.jsx` | 공유 데이터(`BMHomeData`)와 atoms (`HomeTopBar`, `HomeBottomNav`, `MoveClassChips`, `FormStrip`, `resultColor`, `resultLetter`, `SectionHead`) |
| `a-shared.jsx` | A 변형 전용 atoms (`HomeAData` 샘플 데이터, `PlusBtn`, `SourceBadge`). `SourceBadge`는 import만 되고 사용처에서 제거됨 — 무시. |
| `variant-a.jsx` | 초기 베이스라인. 참고용으로만. 최종 구현은 `variant-a-final.jsx` 기준. |
| `icons.jsx` | Lucide 스타일 SVG 아이콘 모음 |
| `mini-board.jsx` | FEN을 받아 SVG로 그리는 미니 체스보드 (`BMMiniBoard`). props: `fen`, `size`, `lastMove`, `light`, `dark`, `flipped`, `border`, `glow` |
| `colors_and_type.css` | 프로젝트 공통 색/타입 변수 |

---

## 구현 노트 (주의할 함정)

1. **우측 메타 컬럼은 반드시 `flex-shrink: 0` + `min-width: 52px` + 텍스트 `white-space: nowrap`** — 한국어 환경에서 빠뜨리면 "오늘", "분석" 같은 짧은 텍스트가 한 글자씩 세로로 쪼개집니다.
2. **분석 결과는 조건부 렌더링** — 미분석 게임은 카드 자체는 동일하지만 (a) 하단 move-class 칩 영역 자체를 렌더하지 않고 (b) 우측 정확도% 자리에 "분석" 버튼을 렌더합니다. **별도 카드 컴포넌트 만들지 마세요.** 같은 카드, 조건부 슬롯입니다.
3. **출처 뱃지(chess.com/lichess/PGN) 미사용** — 코드에 `SourceBadge`가 정의되어 있지만 최종안에서는 표시하지 않습니다.
4. **상단 + 아이콘** — FAB(우측 하단 동그란 버튼) 아닙니다. 상단 바 우측 슬롯에 작게.
5. **3탭 nav** — 4탭 아닙니다. 기존 Vault + Saved를 라이브러리 한 탭으로 통합한 결과.
6. **워드마크는 홈에서만** — 다른 화면(라이브러리, 통계)은 화면 타이틀로 교체.
7. **색상 alpha 표기**: 코드에 `'#3A8560' + '1f'` 같은 패턴이 있습니다. `1f`는 16진수 31 ≈ 12% alpha. 자체 코드베이스에서는 `rgba(58,133,96,0.12)` 또는 8자리 hex (`#3A85601F`)로 변환해 사용하세요.

---

## 다음 단계 (이번 핸드오프 범위 밖)

- 라이브러리 화면 (Vault + Saved 통합)
- 통계 화면 (1축 시간 × 4 섹션)
- 분석/오답노트 화면
- 분석 진행 중 상태 표시
- PGN 임포트 모달
- 설정 화면
- 빈 상태(분석된 게임 0개) 처리
- 색·로고 최종 결정 (현재는 임시)
