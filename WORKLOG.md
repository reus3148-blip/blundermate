# Blundermate 작업 내역

모바일 우선 체스 게임 리뷰 웹앱. Chess.com / Lichess / PGN으로 게임을 불러와 Stockfish 분석 + Gemini 한국어 해설.

스택: Pure ES6 modules (빌드 없음) · Vercel Edge Functions · Supabase · Stockfish WASM · Chessground · Chess.js

> phase 정렬은 chronological 아님 — 작성자가 그 시점 기준 위에 추가하는 스타일. 옛 phase의 결정도 후속에서 회귀할 수 있음 (예: Phase 32 → 35).

---

## Phase 51 — NAG export (2026-05-10)

분류 결과를 PGN 표준 NAG(`$N` 글리프)로 export. chess.com / lichess analysis import 시 `??`/`?`/`!!` 자동 표시 → 외부 도구 round-trip 호환.

- 매핑 ([utils.js](utils.js) `NAG_BY_CLASS`): Brilliant `$3`(!!), Great `$1`(!), Inaccuracy `$6`(?!), Mistake `$2`(?), Blunder/missed_mate `$4`(??). Best/Excellent/Good/Forced는 null. 표준 1~6만 — chess.com/lichess/ChessBase 모두 인식
- **우회 구현**: chess.js v1.4.0 `setNag` API 부재 (Phase 50 단계 0 검증). `tmp.pgn()` 출력 후 SAN 토큰 walk + `$N` 직접 주입 (`injectNags`)
- 한계: chess.js v1 `loadPgn`이 NAG silently strip → 본 프로젝트 안 round-trip 안 됨. 외부 도구는 표준 인식이라 OK. 향후 1.5+에서 `setNag` 도입 시 `injectNags` 단일 호출이라 교체 비용 작음

## Phase 50 — chess.js 0.10.3 → 1.4.0 ESM 마이그레이션 (2026-05-10)

8년 정체 chess.js 0.10.3 글로벌 `<script>`를 1.4.0 ES module로. 누적 ~43줄 net 감소 + PGN 코멘트 우회 / 그림자 상태 / parseAndLoadPgn 폴백 제거. user-visible 효과 0. 코드 명료성 + chess.js 활발 유지보수 트랙 합류가 ROI.

**단계 0 사전 검증으로 plan 축소 (후속 phase의 grounding)**: 1.4.0 정적 검증 결과 ❌ NAG API 부재, ❌ public 변형 API 부재, ⚠️ `setComment(text, fen)` 시그니처 가정 틀림 — v1은 `setComment(text)` 현재 위치 한정. → NAG / 변형 export 명분 무효, plan 축소.

- v1 의미론 변화: `loadPgn`/`load` boolean → throw, `validateFen` instance method → top-level + 반환 `{valid}` → `{ok}`, `setComment` 위치 한정. `safeLoad` helper로 v1 throw → 0.10 boolean 의미 wrap (13 사이트)
- `buildQueueFromPgn` 그림자 상태(`originalPgn` 2번째 인자) 제거 — chess instance 단일 진실 소스, `getComments()` Map<fen,comment>로 fen 매칭
- `parseAndLoadPgn` raw-token 폴백 50줄 삭제 — bywxx chess.com 50건 v1 직접 통과율 **50/50 (100%)**
- baseline 비교 light로 축소: classifyMove는 chess.js 보드 헬퍼(체스 규칙 표준)에만 의존 → 0.10/v1 의미 변화 없음

## Phase 49 — Vault + Saved Games 디자인 시스템 정렬 (2026-05-09)

Apple HIG / Notion / Lichess / chess.com 4 시스템 병렬 리서치 → 합성 → vault + saved-games "premium calm" 톤 정렬. 카드 패턴, empty state, 분류 chip, 필터 탭, 터치 타겟 통합. 기능 신규 0.

핵심 합성 결정 (후속 phase의 디자인 grounding):

- **3-tier 타이포 (15/14/12)** — Notion 3-weight + Apple iOS 17/15/13 한 단계 축소 (모바일 9:16). chess.com 1.6× 숫자 hero 거부
- **Inset grouped 리스트** (단일 컨테이너 + hairline 디바이더) — Apple Mail/Notes 패턴. chess.com per-card shadow + accent strip 거부
- **Press = invisible row + gray fill, no scale** — Notion + Apple. chess.com scale 0.97 거부
- **필터 = text+underline 단일 패턴** — Notion + Lichess single-axis
- **Move classification glyph chip** (??/?/?!/M3) — chess.com + lichess 표준
- **Empty state = icon 80px + 헤드라인 + body + CTA** — Apple HIG
- **터치 타겟 ≥ 44px** — HIG 강제

신규 컴포넌트: tokens.css 8개 토큰(typography scale + press affordance + inset grouped 치수), `renderEmptyState` helper (3종 분산 통합), `classificationChipHtml` helper, `.list-group`/`.list-row` 마크업.

비-목표: 다크 모드, Insights/Home/분석 화면, 빈 상태 SVG 일러스트.

## Phase 48 — 코드 건강 점검: 버그/보안 sweep + simplify (2026-05-09)

27 .js / ~13k 라인 전수 점검(6 병렬 에이전트 → ~100건). critical/security만 픽스 + simplify 3-agent 패스. 16 파일 +220 -123. 기능 신규 0, 신뢰성 5건 + XSS 차단 1.

- **Engine pool 워커 수명주기** ([engine.js](engine.js)): 죽은 워커 풀 재삽입 → 영구 격리, 모든 워커 실패 시 task reject (이전엔 hang), `_retireFailed`로 terminate + splice (Web Worker 스레드 leak), `ready()` `Promise.allSettled`
- **Storage 격리 race 4건** ([storage.js](storage.js)): callDB 진입 시점 platform 스냅샷, breaker reset race, `getAnalyzedGameById` cross-platform leak, `updateSavedGame` Supabase sync 누락. CLAUDE.md "(user_id, platform) 격리"가 4 경로에서 어긋나 있던 거 일괄 픽스
- **Gemini**: 모듈 로드 시 `localStorage.getItem` throw → `lsGet` (Safari private mode), error.message reflected XSS → escapeHtml, reader leak → try/finally
- **`escapeHtml(0)` 버그**: `if (!unsafe)`가 0/false도 빈 문자열 → null/undefined 명시 체크
- **OS prompt 제거** (clipboard fallback) → `showToast` (CLAUDE.md "OS alert/confirm 대체" 위반)
- 의도적 스킵: API rate limit, CORS allowlist, Gemini DOMPurify(npm 0 충돌), `parseAndLoadPgn` 폴백 (Phase 50에서 결과적으로 제거)

## Phase 47 — PC 비율 / vault 화면 전반 재디자인 / 분석 결 eval 표시 / 한 수 풀이 (2026-05-09)

vault 화면 전반 한 세션 재구성 + PC 모드 비율 보정 + 분석 결의 eval display 도입 + 한 수 풀이로 정답 판정 단순화.

- PC 9:16 비율 — `width: min(100vw, calc(100dvh * 9 / 16))` (1080p→607px). aspect-ratio 대신 calc 명시 — 자식 min-content가 폭 미는 케이스 회피
- vault top bar — iOS HIG segmented pill, 좌측 underline 탭 → 중앙 정렬 + ☰ 우측
- vault 4요소 위계: Duolingo 결 progress bar, category chip, board flash (정답/오답 0.55s ring), 하단 액션바 `다음`만 잉크블루 강조
- **Eval transition display** — 분석 화면의 `.win-chance-display` 재사용. cursor scrub: backward=직전 best winChance(회색), forward=드롭된 winChance(빨강)
- `withScreenLoading` ([ui.js](ui.js)) — vault/saved 진입 supabase fetch 동안 빈 화면 가림. 200ms minDuration으로 캐시 hit 깜빡임 방지
- **블런더 한 수 풀이**: 시퀀스 lock 50줄 + 상태 변수 통째 삭제. 첫 수가 acceptable 어느 라인이든 매칭 → 즉시 정답. 메이트는 그대로 (시퀀스 학습 가치)

## Phase 46 — vault 자동 전용 전환 + saved_games로 단일 저장 흐름 통합 (2026-05-08)

vault에서 수동 저장 흐름 통째 들어내고 자동 수집(블런더/메이트)만 남김. 분석/라이브의 💾는 더 이상 "vault vs game" 갈래 없이 곧바로 saved_games. vault top-bar 3탭→2탭.

- 사용자 명시: "복기 상단바는 블런더/메이트 둘만, 자동 저장만. 실수 저장은 saved_games 통합"
- '기타' deck (Phase 27의 positional 흡수용)은 사용 빈도 낮고 "정답 없는 감상"이 vault 풀이 정체성과 어긋남
- 옛 manual row(category='positional' 등)는 `categorize()` null 반환으로 자연 제외 — 데이터 손실 0, 호환만 유지

## Phase 45 — Phase 40~44 simplify 패스 (2026-05-08)

3-agent /simplify 리뷰 → 6건 픽스. 분석 화면 무수정 제약 유지.

- `placePieceBadge` 공유 헬퍼 ([ui.js](ui.js)) — main.js BADGE_MAP+showPieceBadge ~53줄과 vault.js renderBlunderVisualization 거의 동일 logic 통합
- **`_replayGen` cancellation token** ([vault.js](vault.js)) — replay loop 중 사용자가 다음 퍼즐 이동 시 stale loop이 새 puzzleChess 오염 실 버그. 진입 시 `_replayGen++`, async 가드로 stale 검출
- 의도적 스킵: `setTimeout(80ms)` Chessground race hack (주석 WHY 명시), `scoreNum` leaky encoding (renderEngineLines API 변경하면 분석 영향)

## Phase 44 — vault 풀이 후 "내가 둔 수" replay 엔트리 (2026-05-08)

풀이 종료 후 정답 라인 패널에 ◾ 한 줄 추가 — Phase 41에서 캡처한 `gameContext.plies`로 사용자가 실제로 둔 수의 흐름을 step-by-step 재생. 정답 라인과 자기 라인을 나란히 비교해 "왜 이 길이 더 좋은가" 직관 형성.

- `★` canonical 베스트 / `=` 동급 정답 / `◾` 내가 둔 수 마커
- 옛 row(Phase 41 이전, gameContext 부재)는 ◾ 미추가 — 자연 폴백

## Phase 43 — 메이트 퍼즐 엔진 검증 (시퀀스 lock 해제) (2026-05-08)

메이트 카드 풀이 검증을 시퀀스 매치에서 **엔진 기반**으로 전환. 사용자 명시: "추천 1수랑 달라도 4수 메이트하면 성공, 5수 6수로 돌아가면 실패".

- 분기 순서 한 줄 변경 — `puzzleIsMate` 우선 → `handleMateMove` (엔진 검증)이 solution 시퀀스 lock보다 먼저
- `handleMateMove`: in_checkmate 즉시 성공 / 예산 초과 fail (느려진 메이트 거부) / `analyzeForMate` post-user fen에서 mate 여전 보임 확인

## Phase 42 — vault 시각 통일 (분석 chrome 채택) + 정답 라인 engine-line UI + 하단 액션바 (2026-05-08)

vault chrome을 분석 화면과 같은 골격으로 통일. **분석 화면은 한 줄도 안 건드림** — vault HTML이 같은 CSS 클래스를 차용하는 일방향 의존만.

- vault 풀이 후 정답 라인은 [`renderEngineLines`](ui.js) import — 베스트 `★`, 동급 정답 `=`, 호버=paleGreen 화살표, 클릭=350ms replay
- 이전/다시/다음 퍼즐은 별도 하단 `live-action-bar` (Phase 36 라이브 모드 패턴 재사용)
- 좌/우 탭존 제거 → 명시 버튼이 같은 일을 더 명확히
- `<` `>`는 `gameContext` scrubbing 한 가지 의미로 고정 (정답 시퀀스 navigate option β는 모드 충돌 회피로 거부)

## Phase 41 — vault 카드 시각: 블런더 화살표 + 분류 배지 + 수동 저장 통합 + ±3수 게임 컨텍스트 (2026-05-08)

Phase 40으로 알고리즘 완성, 41은 **카드의 학습 컨텍스트** 보강. 자동/수동 카드의 데이터 비대칭 제거.

- 블런더 시각화: `renderBlunderVisualization` — 빨간 화살표 + ?/?? 배지. **setTimeout 80ms hack** — Chessground init/redraw가 board children을 wipe해서 sync attach 시 사라짐 (주석에 WHY 명시)
- `gameContext.plies` ±3수 윈도우 캡처 (post-move fen 직접 저장, 7×80byte ≈ 560byte) — 자동/수동 둘 다 같은 `solution` 객체 안에 nested
- `buildAcceptableLines` + `buildGameContext`를 [autoBlunders.js](autoBlunders.js)에서 export → 자동과 수동이 같은 로직

## Phase 40 — vault 알고리즘 v2: 승률 기반 트리거 + 시퀀스 풀이 + 정답 라인 다중 인정 (2026-05-08)

vault 자동 수집을 [Lichess 퍼즐 생성기](https://github.com/ornicar/lichess-puzzler) 방식으로 재설계. "한 위치 + 한 정답"의 정적 구조에서 풀이 시퀀스 + 다중 정답 라인까지 저장·재생 확장. user 학습용이라 Lichess의 "유일해" 게이트는 도입 안 함 — 베스트 대비 승률 −10%p 초과 떨어지지 않으면 정답 후보 인정.

- 승률 변환 — `winChance` Lichess 시그모이드 (`1 / (1 + exp(-0.00368208 · cp))`). 기존 `cpToWhiteWinPct`는 보존 (analysis 화면 의존)
- 메이트/우위 분리: 메이트 퍼즐은 끝까지 저장 + mate 라인만 인정, 우위는 5플라이 cap + `trimTrailingForced`
- Supabase 3 신 컬럼 + 옛 row 폴백 (null이면 단일 best_move 옛 path 자동 사용)
- 시퀀스 핸들러 — 첫 수가 acceptable 라인과 매칭되면 그 라인 lock + opponent 응수 250ms 자동 재생

## Phase 39 — 픽셀 로고 + SEO/보안 메타 + PWA 브랜딩 + 분석/설정 UX 정리 (2026-05-07)

10개 커밋. 두 줄기 — (1) 시각 정체성·SEO·보안·프라이버시, (2) 분석 화면 EXPLORE/SIMULATE 확장 + 설정 모달→페이지 분리.

- 픽셀 룩 로고 (잉크 블루 #2B5BD7) + manifest 영문 워드마크. JSON-LD `alternateName: '블런더메이트'`로 한국어 검색 유지
- vercel.json 보안 헤더, JSON-LD WebApplication, robots.txt, privacy.html
- maskable 아이콘 시도 → 제거 (Android 설치 시 룩 너무 작음)
- EXPLORE `<` 변형 한 수씩 undo + redo 스택, SIMULATE 큐 끝에서 `>` 단일 엔진(depth 12, MultiPV=1)로 best move 무한 확장
- 설정/About/피드백 모달 → 페이지 ([settings.js](settings.js) 신설)
- **홈 TC 드롭다운 vs 설정 기본값 의미 분리**: 같은 localStorage 키 공유 → 분리 (설정=영속, 홈=메모리만)

## Phase 38 — P0/P1 코드 위생 통합 + 2회 simplify 패스 (2026-05-05 ~ 06)

P0/P1 안전성·구조 항목 통합 + 2회 `/simplify` 패스로 14건 사전 해결. 기능 추가 없음.

- **P0 — `callDB` 서킷 브레이커 + pilot coalescing**: /api/db 죽은 환경 콜드 로드 시 in-flight 200+ 가 모두 5xx 받던 폭주 → pilot 패턴 + `_dbBreakerUntil` 60s. 콜드 fetch 200+ → **1건**
- **P0 — `dialogs.js` 신규**: `alert`/`confirm` 9곳 교체. cancelBtn 자동 focus + Enter 글로벌 핸들러 제거 (모달 밖 input focus 시 의도치 않은 OK 트리거 차단)
- **P1**: console.* 게이트 (비-localhost noop, error 보존), `/api/version` (GitHub API rate limit 60/h 제거), `home.js` 추출 (-455줄), `styles/tokens.css` 분리

## Phase 37 — sw.js 영구 삭제 (2026-05-05)

**결정: Service Worker는 다시 켜지 않는다.** sw.js 117줄 + vercel.json SW 헤더 룰 제거.

- 현재 상태(SW 없음 + manifest.webmanifest만)가 사실상 최선의 PWA 변종 — iOS/Android 둘 다 "홈 화면 추가" + standalone + theme-color 정상, 매번 fresh fetch로 자동 업데이트 깨끗
- 오프라인은 사용자 명시 "필요 없음" → 도입 비용 대비 ROI 음수
- main.js 옛 SW unregister 블록은 영구 보존 — Phase 8 PWA 시기 sw.js 등록한 사용자 자동 마이그레이션 메커니즘

## Phase 36 — 수 입력 → 라이브 분석 모드 (2026-05-04)

기존 별도 `inputView`(보드 입력 전용)을 폐기하고 분석 화면을 재사용해 **사용자가 수를 둘 때마다 단일 엔진이 실시간 분석**. chess.com/lichess 분석 보드와 동일 UX.

- `APP_MODES.LIVE_INPUT` 도입 — `isLiveInputMode` boolean 4곳 분기 → enum 흡수
- `kickExploreEngine(fen)` 헬퍼: stop + clear + analyzeFen 시퀀스 통합. depth는 LIVE=12 (즉응성), explore=getDepth()
- 라이브 수 분류: classifyMove를 explore 콜백에 push, stale info 필터(PV 첫 수 from-square 기물 검증)
- 의사결정: 라이브 모드에 분류/그래프/AI/Save 다 채우려다 좁은 v1로 컷. `appMode` 4값 + isPreview/isReview 2 플래그가 모드 공간 — 5번째 분기 추가는 충돌 신호

## Phase 1 — 초기 프로토타입 (~0407)

- 모바일 우선 PGN 리뷰 앱 골격 (`Initial commit`, `3233062`)
- 체스 보드 크기 최적화, 모바일 UI 적용
- 수 평가 알고리즘 도입 (`378afcf`)
- 게임 저장 기능 (`e66f040`)

## Phase 2 — Gemini AI 연동 (~0409)

- Gemini 2.5 Flash 연동, SSE 스트리밍 (`cb3dfe1`, `36c23a3`)
- iOS Safari 호환성 해결 (`af91925`)
- `api/analyze.js` Vercel Edge Function — API 키 서버사이드 격리 (CLAUDE.md "API 키 클라이언트 노출 0" invariant 기원)

## Phase 3 — 분석 화면 UI 재설계 (Claude Code 도입 후)

- chess.com/Lichess 스타일 분석 뷰 (`0629a52`)
- 컨트롤 바 + 탭 바 통합 (‹ Engine · Save · AI ›)
- 기보 오버레이(☰ 슬라이드업) 추가 (`0b0e940`)
- AI 해설 어조 개선, maxOutputTokens 2048, 마크다운 렌더링

## Phase 4 — 홈 화면 재설계

- 카드 제거, 플랫 레이아웃, 버튼 개편 (`2cee942`)
- State A/B 두 상태 레이아웃 (`8d1971b`)
- 승률 표시, 진영 선택 모달

## Phase 5 — i18n & 데스크탑 대응

- 한국어/영어 언어 전환 (`1932dd5`)
- 데스크탑 와이드 레이아웃 중앙 정렬, 최대 너비 제한
- 브라우저 언어 자동 감지 (`e4d810b`)

## Phase 6 — Supabase 연동

- 초기 Supabase UI (`09d4f2a`)
- 피드백 저장: `api/feedback.js`에서 PostgREST 직접 호출 (SDK 미사용) — 의존성 0 제약
- Vault/Saved Games는 localStorage 유지, 추후 Supabase 전환 (`storage.js` 추상화 계층)
- `api/db.js`에 `user_id` 검증 추가 — DELETE/INSERT spoofing 차단 (`f1f6658`)

## Phase 7 — 복기(Vault) 기능

- Vault 모듈 분리 (`vault.js`, `6c12ee4`)
- 분석 화면에서 Vault 항목을 전체 게임으로 열기 (`5f80a0d`)
- PGN 다운로드, 수 두기(탐색 모드)

## Phase 8 — 시작화면 / PWA / 정리

- 시작화면 개선 (`f91bbd6`)
- PWA 도입 후 제거 (`49c5dc4` → `1e75ddd`) — Phase 37에서 sw.js 영구 삭제 결정
- 0수 리포트 통합 (`649660b`)

## Phase 9 — Vault 버그 수정 (2026-04-19)

- **저장 버그** (`4561386`): 모달 열림 시점에 `vaultSnapshot`으로 즉시 캡처 — 모달 후 인덱스 변경에 영향 안 받게
- **조회 버그** (`c1664a9`): `findMoveIndexByFen()` 추가, Supabase에 `move_index` 등 누락 필드 저장. 3단계 인덱스 결정(직접 → FEN 매칭 → 폴백)

## Phase 10 — 홈 화면 최근 게임 카드

- 진영 아이콘(♙/♟) → 세로바 인디케이터
- 상대 닉네임/레이팅, 레이팅 변화 diff
- 타임컨트롤 변환("600" → "10분"), 상대 날짜
- chess.com stats API로 Rapid/Blitz/Bullet 헤더 표시
- 인사말 1줄 통합 (`bywxx · Rapid 1120 · Blitz 694 · Bullet 364`)

## Phase 11 — OG / SEO / FEN 입력

- OG / Twitter Card 메타 + `og-image.png` (`80d0d79`)
- FEN 입력 단일 포지션 분석 (`423d5a6`)
- Vercel Analytics 연결

## Phase 12 — SPA & eval 관례 변경

- History API 기반 SPA 네비 — 모바일 뒤로가기 버그 픽스 (`dc98a26`)
- eval 표시를 엔진 관례(+ = 백 유리)로 통일, 승률 %는 유저 관점 유지 (`e0e37b9`) — 표시 일관성 vs 사용자 직관성 분리
- 체크메이트 수 Blunder 분류 버그 픽스 (`af56099`)

## Phase 13 — 코드 정리 & 홈 개선

- `styles.css` 죽은 코드 434줄 제거 (`53707be`)
- 홈 프로필 카드, 페어 버튼, 레이아웃 재정렬 (`63ebfcd`)
- i18n 하드코딩 일괄 전환
- 게임 스크롤 박스 6.5 → 4.5개, 모달 오버플로 방지
- 탐색 모드 평가치 표시, 엔진 depth 설정 추가
- 오프닝 한국어 표시 (ECO 30개 하드코딩 + 범위 fallback, `6f4e29c`)

## Phase 15 — 홈 프로필 카드 + 티어 + 바텀 네비 (`525bace`)

홈 프로필 카드, 티어 시스템, 바텀 네비게이션 도입.

## Phase 16 — 분석 컨트롤러 모듈 분리 (`05a1daa`)

`main.js` 23개 전역 상태 → 4개 모듈로 캡슐화.

- **`analysis.js`** — 엔진 + 큐 라이프사이클. `scheduleRestart`/`consumePendingRestart`로 비동기 stop+재시작 일원화
- **`board.js`** — 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes)
- **`modes.js`** — 동작 모드 (appMode, exploration, simulation, preview)
- **`gemini.js`** — 자체 상태 내장. `getState/setState` 콜백 제거하고 직접 import
- 뷰 가시성 단일화: `main.js`의 `renderScreen`이 모든 view 표시/숨김 단독 관리. 형제 모듈은 데이터 로드만 담당 — 새 화면 추가 시 형제 수정 불필요

## Phase 17 — 0수 화면 통일 + 리포트 5단계 카드 (`4323763`, `af86bf8`)

- `isReviewMode` 도입 — 인덱스 -1 = 전체화면 리뷰. ☰ 오버레이 진입점
- 리포트 5단계 카드: 게임 헤더 / Hero 정확도 / 차트 / 분류 표 / CTA (Phase 20에서 4단계로 축소)
- 홈 시간대 필터 (전체/래피드/블리츠/불렛, 기본 래피드)
- 게임 fetch 30 → 100개 + 홈↔통계 캐시 공유
- `countMovesFromPgn` chess.js 기반 정확화 (PGN 헤더 날짜 점 매치 버그 픽스)

## Phase 18 — 통계(insights) 화면 + 오프닝 그룹화 (`e96dc0b`, `81a3d17`)

- `insights.js` 신규 — 진영/시간제어별 승률, Top5 오프닝, 게임 길이/종료 사유/시간대별 분포. 바텀 네비 4번째 탭
- 캐시된 100게임에서 클라이언트 사이드 필터 — 재 fetch 없음
- 필터 활성 시 byColor/byTimeClass 카드 자동 숨김 (redundant 제거)
- `utils.rootOpeningName` — chess.com ECOUrl 슬러그가 변종까지 포함해 같은 루트 분산되는 문제 해결

## Phase 19 — 닉네임 로깅 & lowercase 정규화 (`0e7c464`, `5918500`)

- `api/log-username.js` 신규 — `username_logs` 테이블 fire-and-forget INSERT
- **잠수함 패치 — 닉네임 lowercase 정규화**: chess.com이 대소문자 구분 안 하므로 클라이언트(`storage.js`) + 서버(`api/db.js`) 양쪽 진입 시점에서 lowercase 통일. 같은 유저가 케이스 바꿔 입력해도 데이터 분산 안 됨
- chessApi가 chess.com 캐노니컬 케이스를 displayName으로 반환 — 홈 프로필은 lowercase로 잠시 보였다가 displayName으로 갱신
- 기존 5개 문서 → `worklog.md` 단일 파일 통합

## Phase 20 — 통계 시간 카드 + 리포트 4단계 + 티어 모달 (`0dbf2fe`)

- `utils.js` 클럭 파싱 헬퍼 (`extractClocks` / `parseInitialTime` / `parseIncrement` / `extractMoveTimesForUser`) — chess.com PGN의 `{[%clk]}` 주석 기반
- 통계 시간 카드 4종(평균 사고 / 단계별 / 시간 압박 / 즉답 비율)
- 분석 리포트 5→4단계 — Hero 정확도 카드 제거 (표에 정확도 행이 이미 있어 중복)
- 티어 라벨 → 버튼 + 랭크 모달 (TIERS 데이터로 동적 생성)

## Phase 21 — Stockfish 워커 풀 병렬화 + 로딩 명언 + 피드백 FAB (`1cea959`)

분석 속도 핵심 개선. **WHY**: 단일 워커로 매 수 시퀀셜 분석은 30~60수 게임에서 너무 오래 걸림.

- `engine.js`에 `EnginePool` 추가 — N개 독립 워커 인스턴스, Hash 32MB. 배치 분석을 진짜 병렬로
- `analysis.js` 배치 경로 풀 promise 기반으로 재작성. `currentAnalysisIndex`/`processNext` 제거
- 로딩 카드 — 명언 100선 + 진행률 바
- 피드백 FAB — 홈 우측 하단 (Phase 32에서 설정 모달로 통합되며 제거)

## Phase 23 — cp ↔ win% 단일 소스 (freechess 본가 방식 회귀)

Phase 22에서 도입한 SF18 WDL win%가 표시 cp와 모순되던 문제 해결. **WHY**: SF18은 NNUE WDL을 직접 출력하면서 cp는 정규화된 값으로 압축. 두 모델이 달라서 "+1.5인데 99%?" 같은 모순 발생.

- 최종 결정: freechess 본가와 동일하게 raw cp + Lichess 시그모이드 단일 소스. SF NN의 WDL 사용 안 함
- 표시 cp = SF raw, 표시 win% = `cpToWhiteWinPct(scoreNum)` — 두 표시 항상 일치
- **트레이드오프**: SF NN의 진짜 확신도(결정적 엔드게임 99%)는 잃음. 정직성과 일관성 우선

## Phase 24 — 엔진 평가 코드 정리 + depth 14 기본 (`64a8976`, `a6eccc6`)

WDL 와리가리 잔재 정리 + Phase 21 워커 풀 이후 체감 속도 여유로 기본 depth 상향.

- 기본 depth **12 → 14** — quiet move의 Best/Excellent 구분 등 분류 정확도 향상. 사용자가 명시 저장한 값은 유지
- `classifyMove`/`runBatch`의 `isUserWhite` 파라미터 제거 (받기만 하고 안 씀)

## Phase 26 — Vault 자동 블런더 수집 + 퍼즐 보기 모드 (`6d64477`)

수동 저장에 의존하던 vault에 자동 수집 + 출제 모드 추가. **WHY**: 분석 끝나면 손 안 대도 풀이 채워지고, 별도 탭에서 무작위 출제됨.

- `autoBlunders.js` 신규 — 분석 `onComplete` 직후 fire-and-forget. 워스트 2(Mistake/Blunder CPL 상위) + missed_mate(M1~4). missed_mate 우선
- dedup은 `position_fen` 기준 — 같은 포지션이 다른 게임에서 재발해도 한 번만
- `analyzed_games` 테이블 분리 — 한 게임당 1행, vault_items가 `analyzed_game_id`로 참조. `pgn_hash`(SHA-256) upsert 키

## Phase 27 — Vault 재구조화: 분류축 전환 + 자동 다음 제거 (`d311f81`)

직접/자동(source) 1차 분류 → 실수/메이트/기타(category) 1차 분류로 전환. **WHY**: vault 진입 시 사용자 첫 질문은 "어떻게 들어왔는지"가 아니라 "뭘 풀까". cp 실수(한 수 비교)와 메이트(엔진 응수까지 따라감)가 풀이 본질에서 갈라지므로 1차 분류로 자연스러움.

- `categorize(item)` — source 무관, classification만 본다
- '기타' deck — 정답 없는 감상용 (Phase 46에서 제거됨)
- 자동 다음 제거 — 사용자가 직접 좌/우/다음으로 넘김
- 진입 즉시 stories — 옛 `vaultModeTabs`(목록/보기) 제거
- `played_date` 컬럼 추가 — 자동/수동이 같은 정렬 키 공유

## Phase 28 — 분석 화면 컨트롤바 재배치 + 엔진라인 상단 이동 시도 폐기 (`18023a6`, `f400daa`)

분석 화면 정보 계층 정리 실험. 일부 적용, 일부 폐기.

- **시도(폐기)**: 엔진라인을 보드 위로 + PV 2줄 상시 노출. 두 커밋 force-reset(`741e606`) — 분석화면이 vault stories와 너무 닮아 정체성 흐려짐. 보드 위는 비워두고 정보는 컨트롤바·패널에 모으는 기존 구조가 더 분석적
- **적용**: 좌(prev/AI)→(AI/저장), 우(저장/next)→(prev/next). 평가는 중앙 유지. 바 높이 44→52px
- **버튼 정리**: 모든 버튼 44×44 통일, ctrl-group 4px gap, 좌·우 그룹 폭 92px 대칭

## Phase 29 — vault 표기/레이아웃 일관화 + 통계 8 카드 추가 + 시각 재편

vault 표기·레이아웃 안정화부터 통계 화면 대규모 확장·시각 재편까지 한 세션에 묶음. **모든 통계는 stockfish 없이** chess.com PGN/헤더 + vault 자동 수집 데이터로 도출 (사이트 정체성: chess.com 리뷰 못 돌리는 사람 대상).

- vault 라벨 통일: "외통"→"메이트", "실수"→"블런더" — 사이트 정체성(blunder + mate) 명시
- 보드 y좌표 픽셀 락 (`height` 명시 + `box-sizing: border-box`, min-height 금지) — 카테고리 전환 시 보드 윗변 1픽셀 흔들림 차단
- root 탭 back 버튼 제거 (iOS 패턴) — bottom-nav가 root 진입점이라 중복
- 통계 8 카드 추가 (상대 레이팅 / 첫 수 / 캐슬링 / 거래 활동 / 요일 / 자주 만난 상대 / 레이팅 변화 / 핫스팟)
- `subVariantName` / `compactOpeningLabel` — 같은 root의 다른 변종을 컴팩트 라벨로 합성

## Phase 30 — Saved Games 화면 리팩터 (`2afc008`)

저장 게임 카드를 home/vault 카드 결과 통합. 휴지통을 카드 외부에서 편집 모달 안 destructive 버튼으로 옮김 — management 액션은 편집 컨텍스트에 있어야 사용자 멘탈 모델과 일치.

- 카드: 제목+노트만, 카테고리는 좌측 인디케이터(`::before`)로 일임
- 빈 상태 Notion/Linear 결: 56px 북마크 아이콘 + 타이틀 + 설명
- card-save-btn(다시 저장) 제거 — 기능 중복

## Phase 35 — 홈 프로필 카드 + 무한 스크롤 재도입 + 오프닝 root 그룹화 + 분석 캐시 hash fix (`0160f12`, `343f220`, `3308054`)

Phase 32 디렉션의 한계점을 실사용으로 확인 → 부분 회귀 + 오프닝 표기 통합 + 분석 캐시 silent miss fix.

- Phase 32 회귀: 프로필 카드 (다중 사용자 식별 사유) + 무한 스크롤 (100판 자유 탐색 사유) 부활
- 오프닝 root 그룹화: 카드/통계 모두 root family만, 변종은 게임 진입 시 노출
- 분석 캐시 hash fix — 두 silent miss 픽스:
  - `collectAutoBlunders` early return 시 `upsertAnalyzedGame` 스킵 → `_persistAnalysisCache`가 직접 호출하도록 분리
  - chess.com 원본 PGN의 black ellipsis(`1... d5`)가 chess.js round-trip에서 사라져 hash 미스매치 → `computePgnHash`에 ellipsis/변형/NAG/결과 토큰 정규화 추가

## Phase 32 — 홈 화면 hi-fi 리디자인 (디자인 핸드오프 기반)

`design_handoff_home_redesign/` hi-fi 핸드오프를 vanilla JS로 1:1 재현. "어떤 게임을 다시 들여다볼까요?" 단일 질문 중심으로 정보 위계 재정리. 분석 캐시(`computePgnHash` SHA-256 → `loadAnalysisCache`)에서 정확도/move-class를 카드에 직접 노출이 핵심 변화.

- 38px 히어로 + 레이팅 pill — 프로필 카드 / 피드백 FAB / 검색 버튼 제거 (Phase 35에서 일부 회귀)
- 84×84 SVG 미니보드 카드 + `parsePgnSummary` (chess.js 1회 로드로 FEN/마지막수/수카운트 동시 추출)
- 시간대 드롭다운 필터 (래피드/블리츠/불렛/전체)
- 4 + "모두 보기" → 15 (Phase 35에서 무한 스크롤로 회귀)

## Phase 34 — Lichess 멀티 플랫폼 지원 + DB 격리 (`51d0170`)

Chess.com 단일 → chess.com / lichess 2플랫폼. **(user_id, platform) 쌍**을 모든 영속 레이어 격리 키로 도입. 이후 모든 phase의 grounding.

- `chessApi.js` router + `chesscom.js` / `lichess.js` 어댑터 (Lichess NDJSON → chess.com normalized shape)
- 4개 테이블 모두 `platform` 컬럼 추가, `analyzed_games` UNIQUE 키 `(user_id, platform, pgn_hash)`
- `callDB` 자동 platform 주입 — 호출자 무수정
- 기존 데이터는 `platform='chesscom'` 디폴트로 마이그레이션

## Phase 33 — 유지보수 배치: a11y + 시맨틱 + dead code 정리 (May 1-2)

홈 hi-fi(Phase 32)·Lichess(Phase 34) 직전 청소. 단일 기능 추가 없음.

- a11y: form input 12건 `label for`/`aria-label`, view-container `<main>` 감싸기 + sr-only h1
- flex chain 회귀 fix (`ba2d039`): `<main>` 기본 `display: block`이 flex chain 끊음 → `main { display: contents }`로 ARIA landmark 보존하며 layout 복구 ('flex chain wrapper 주의' 패턴)
- `<template id="vaultFilterTabsTemplate">`로 vault filter tabs HTML 중복 제거
- console.log 9건 제거, catch 안 console.log → console.warn

## Phase 31 — 분석 화면 엔진 라인 빈 행 패딩 (`4458b0e`)

MultiPV=3 기준 `TARGET_ROWS=3` 패딩 — 메이트/소수 합법수로 라인이 1~2개만 와도 항상 3행 유지 → UI 점프 없음. placeholder는 `engine-line--empty` + `aria-hidden`.

## Phase 22 — 수 분류 알고리즘 freechess 포팅 + WDL win% 도입

기존 CPL 기반 4-tier를 폐기하고 chess.com review 라벨 체계로 전환 — [WintrCat/freechess](https://github.com/WintrCat/freechess) 1:1 포팅. **WHY**: 자체 휴리스틱(WCL 임계 + 1-ply SEE)으로 Brilliant/Great를 만들어보다가 false positive 잡으려 가드 5+ 추가한 끝에 whack-a-mole 패턴. freechess는 chess.com 클론 목표로 reverse-engineered되어 같은 라벨 체계 + 검증된 임계값.

- 8 + Forced 라벨: **Brilliant(!!) / Great(!) / Best(✦) / Excellent(✓) / Good / Inaccuracy(?!) / Mistake(?) / Blunder(??) / Forced(□)**
- `getEvaluationLossThreshold` quadratic CPL — 이미 +5 우세에서 100cp 손실은 페널티 거의 없음
- `utils.js` board 헬퍼 포팅: `getAttackers/getDefenders/isPieceHanging` (CC BY-NC-SA 4.0 라이선스 — 알고리즘 핵심 변경 자제)
- 모듈 레벨 chess.js 인스턴스 7개 재사용 — Brilliant 검사 hot path alloc 절감
- WDL은 분류엔 안 씀 — 중간 바 win% 표시용 (Phase 23에서 WDL 자체 제거)
