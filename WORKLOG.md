# Blundermate 작업 내역

모바일 우선 체스 게임 리뷰 웹앱. Chess.com / PGN으로 게임을 불러와 Stockfish 분석 + Gemini 한국어 해설을 제공.

스택: Pure ES6 modules (빌드 없음) · Vercel Edge Functions · Supabase · Stockfish WASM · Chessground · Chess.js

---

## Phase 1 — 초기 프로토타입 (~0407)

- 모바일 우선 PGN 리뷰 앱 골격 (`Initial commit`, `3233062`)
- 체스 보드 크기 최적화, 모바일 UI 적용
- 수 평가 알고리즘 도입 (`378afcf`)
- 게임 저장 기능 (`e66f040`)

## Phase 2 — Gemini AI 연동 (~0409)

- Gemini 2.5 Flash 연동, SSE 스트리밍 (`cb3dfe1`, `36c23a3`)
- iOS Safari 호환성 해결 (`af91925`)
- `api/analyze.js` Vercel Edge Function — API 키 서버사이드 격리

## Phase 3 — 분석 화면 UI 재설계 (Claude Code 도입 후)

- Chess.com/Lichess 스타일 분석 뷰 (`0629a52`)
- 보드 색상 변경 (`#E8DCBF` / `#8C6840`)
- eval 바 대칭, 상단 바 중앙정렬, 평가치 그래프
- 컨트롤 바 + 탭 바 통합 (‹ Engine · Save · AI ›)
- 기보 오버레이(☰ 슬라이드업) 추가 (`0b0e940`)
- 시뮬레이션 패널, 엔진 라인 UI 개선
- AI 해설 어조 개선, maxOutputTokens 2048, 마크다운 렌더링

## Phase 4 — 홈 화면 재설계

- 카드 제거, 플랫 레이아웃, 버튼 개편 (`2cee942`)
- State A/B 두 상태 레이아웃 (`8d1971b`)
- 하단바 분류 색상 세분화, 분류 라벨, 구분선
- 승률 표시, 진영 선택 모달

## Phase 5 — i18n & 데스크탑 대응

- 한국어/영어 언어 전환 (`1932dd5`)
- 데스크탑 와이드 레이아웃 중앙 정렬, 최대 너비 제한
- 브라우저 언어 자동 감지 (`e4d810b`)

## Phase 6 — Supabase 연동

- 초기 Supabase UI (`09d4f2a`)
- 피드백 저장: `api/feedback.js`에서 PostgREST 직접 호출 (SDK 미사용)
- Vault/Saved Games는 localStorage 유지 — 추후 Supabase 전환 예정 (`storage.js`가 추상화 계층)
- `api/db.js`에 `user_id` 검증 추가 (DELETE/INSERT spoofing 차단, `f1f6658`)

## Phase 7 — 복기(Vault) 기능

- Vault 모듈 분리 (`vault.js`, `6c12ee4`)
- 분석 화면에서 Vault 항목을 전체 게임으로 열기 (`5f80a0d`)
- PGN 다운로드, 수 두기(탐색 모드)

## Phase 8 — 시작화면 / PWA / 정리

- 시작화면 개선 (`f91bbd6`)
- PWA 도입 후 제거 (`49c5dc4` → `1e75ddd`)
- 0수 리포트 통합 (`649660b`)

## Phase 9 — Vault 버그 수정 (2026-04-19)

- **저장 버그** (`4561386`): 모달 열림 시점에 `vaultSnapshot`으로 즉시 캡처 — 모달 후 인덱스 변경에 영향 안 받게
- **조회 버그** (`c1664a9`): `findMoveIndexByFen()` 추가, Supabase에 `move_index` 등 누락 필드 저장. 3단계 인덱스 결정(직접 → FEN 매칭 → 폴백)

## Phase 10 — 홈 화면 최근 게임 카드

- 진영 아이콘(♙/♟) → 세로바 색상으로 전환
- 상대 닉네임/레이팅, 레이팅 변화 diff(+초록/-빨강)
- 타임컨트롤 변환("600" → "10분"), 상대 날짜
- Chess.com stats API로 Rapid/Blitz/Bullet 레이팅 헤더 표시
- 인사말 1줄로 통합 (`bywxx · Rapid 1120 · Blitz 694 · Bullet 364`)

## Phase 11 — OG / SEO / FEN 입력

- OG / Twitter Card 메타 + `og-image.png` (`80d0d79`)
- FEN 입력 단일 포지션 분석 (`423d5a6`)
- Vercel Analytics 연결

## Phase 12 — SPA & eval 관례 변경

- History API 기반 SPA 네비게이션 — 모바일 뒤로가기 버그 수정 (`dc98a26`)
- eval 표시를 엔진 관례(+ = 백 유리)로 통일, 승률 %는 유저 관점 유지 (`e0e37b9`)
- 체크메이트 수가 Blunder로 분류되는 버그 수정 (`af56099`)

## Phase 13 — 코드 정리 & 홈 개선

- `styles.css` 죽은 코드 434줄 제거 (`53707be`)
- 홈 프로필 카드, 페어 버튼, 레이아웃 재정렬 (`63ebfcd`)
- i18n 하드코딩 문자열 일괄 전환
- 게임 스크롤 박스 6.5 → 4.5개, 모달 오버플로 방지
- 닉네임 길이별 폰트 축소
- 탐색 모드 평가치 표시, 엔진 depth 설정 추가
- 오프닝 한국어 표시 (ECO 30개 하드코딩 + 범위 fallback, `6f4e29c`)

## Phase 14 — 디자인 시스템 전면 교체 (`8721497`)

다크 + 앰버 → **Warm Paper** 라이트 테마. `:root` 색상 변수 통합:

- 배경 `#F5F2EA` / `#FAF8F2` / `#EDE8DB`
- 텍스트 `#2C2824` / `#6B6358` / `#A89F90` (소프트 블랙)
- 포인트 앰버 `#8B6F2A` — 로고/극소수 강조 전용. UI는 무채색 중심
- 분류색 라이트 배경용 어둡게: blunder `#9A3A2A`, mistake `#B5612A`, best `#5A7A3A`, brilliant `#3A8560`
- 보드 `#E8DCBF` / `#8C6840` 유지

원칙: 파랑/인디고 금지, 하드코딩 색 금지, 다크 모드 토글 없음.

## Phase 15 — 홈 프로필 카드 + 티어 + 바텀 네비 (`525bace`)

- 홈 프로필 카드, 티어 시스템, 바텀 네비게이션

## Phase 16 — 분석 컨트롤러 모듈 분리 (`05a1daa`)

`main.js`의 23개 전역 상태 → 4개 모듈로 캡슐화:

- **`analysis.js`** — 엔진 + 큐 라이프사이클 (stockfish, ANALYSIS_DEPTH, analysisQueue, currentAnalysisIndex, isAnalyzing, isWaitingForStop, pendingQueue, pendingTargetIndex). `scheduleRestart`/`consumePendingRestart`로 비동기 stop+재시작 패턴 일원화
- **`board.js`** — 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes)
- **`modes.js`** — 동작 모드 (appMode, explorationChess, explorationEngineLines, simulationQueue, simulationIndex, isPreviewMode)
- **`gemini.js`** — 자체 상태 내장 (isGeminiLoading, geminiAbortController, isGeminiEnabled). `getState/setState` 콜백 제거하고 직접 import

**뷰 가시성 단일화:** `main.js`의 `renderScreen`이 모든 view 표시/숨김을 단독 관리. vault/savedGames/insights 모듈은 데이터 로드(`loadXxxData`)만 담당 — 새 화면 추가 시 형제 모듈 수정 불필요.

## Phase 17 — 0수 화면 통일 + 리포트 5단계 카드 (`4323763`, `af86bf8`)

- **0수 화면** 미리보기 화면 양식으로 통일, dead code 제거
- **`isReviewMode` 도입** — `-1` 인덱스 = 전체화면 리뷰. ☰ 오버레이 "리뷰 보기" 진입점, 0수에서 prev로도 진입
- **리포트 5단계 카드:**
  1. 게임 헤더 (오프닝/타이틀/결과)
  2. Hero 정확도 (56px + 상대 비교)
  3. 수별 평가 차트 (16:4)
  4. 수 분류 표
  5. "첫 수부터 복기" CTA
- 홈 시간대 필터(전체/래피드/블리츠/불렛, 기본 래피드) — 선택 시 게임 목록 + 프로필 레이팅·티어·W/L/D 동기 갱신
- 게임 fetch 30 → 100개 + 홈↔통계 캐시 공유
- `countMovesFromPgn`을 chess.js 기반으로 정확화 (PGN 헤더 날짜 점 매치 버그). insights는 정규식 fast path로 100배 단축
- 통계 진입 잔렉: rAF + setTimeout으로 무거운 계산 deferred
- 설정 모달: 피드백 버튼 홈 → 설정 이동

## Phase 18 — 통계(insights) 화면 + 오프닝 그룹화 (`e96dc0b`, `81a3d17`)

- **`insights.js`** — 통계 화면. 색깔/시간제어별 승률, Top5 오프닝, 게임 길이/종료 사유/시간대별 분포. 바텀 네비 4번째 탭
- 상단 두 필터 바 (전체/래피드/블리츠/불렛, 전체/백/흑). 캐시된 100게임에서 클라이언트 사이드 필터 — 재 fetch 없음
- subtitle 동적 결합: "최근 100게임 중 래피드 · 백 N개"
- 필터 활성 시 byColor/byTimeClass 카드 자동 숨김 (redundant 제거)
- **`utils.rootOpeningName`** — chess.com ECOUrl 슬러그가 변종까지 포함해 같은 루트가 분산되는 문제 해결. 첫 root 키워드(Gambit/Defense/Game/Opening/System/Attack)까지 자름. 통계 화면만 적용
  - "Scotch Gambit Haxo Gambit Sicilian" → "Scotch Gambit"
  - "King's Indian Defense Advance" → "King's Indian Defense"
- `styles.css` 빈 룰셋 제거 + 섹션 헤더 정돈

## Phase 19 — 닉네임 로깅 & lowercase 정규화 (`0e7c464`, `5918500`)

- **`api/log-username.js`** — 새 Edge Function. `username_logs` 테이블로 fire-and-forget INSERT (source: onboarding/search/cached, 64자 cap)
- `main.js`에 `logUsernameToServer` 헬퍼 — localStorage 기반 source+username dedup, 실패 무시. 온보딩 제출 / 유저 검색 / 캐시된 기존 사용자(첫 방문 1회) 3개 지점에서 호출
- `supabase-username-logs.md`: 테이블 생성 SQL + RLS(anon INSERT only) + 조회 쿼리
- 기존 `CLAUDE.md`/`README.md`/`CHANGELOG-2026-04-19.md`/`supabase schema reference.md`/`instructionsnow.md` 5개 문서 → `worklog.md` 단일 파일로 통합
- **잠수함 패치 — 닉네임 lowercase 정규화:** Chess.com이 대소문자 구분하지 않으므로 클라이언트/서버 양쪽 경계에서 lowercase 통일. 같은 유저가 케이스 바꿔 입력해도 vault/saved_games/username_logs가 분산되지 않음
  - `storage.js` setMyUserId/getMyUserId 양쪽 lowercase, read 시점 자동 정규화 (마이그레이션 불필요)
  - `api/db.js` select/insert/delete 진입 시점에서 user_id 정규화 (구버전 클라이언트 호환)
  - `chessApi.js`가 chess.com의 캐노니컬 케이스(`player.username`)를 displayName으로 반환 — 홈 프로필은 lowercase로 잠시 보였다가 displayName으로 갱신
  - `supabase-username-logs.md`에 일회성 lowercase 마이그레이션 SQL 추가

## Phase 20 — 통계 시간 카드 + 리포트 4단계 + 티어 모달 (`0dbf2fe`)

- **`utils.js` 클럭 파싱 헬퍼** — `extractClocks` / `parseInitialTime` / `parseIncrement` / `extractMoveTimesForUser`. chess.com PGN의 `{[%clk]}` 주석 기반. correspondence/clock 없는 게임은 자동 스킵
- **통계 시간 카드 4종** (insights.js): 평균 사고 시간 / 단계별(오프닝·미들·엔드) / 시간 압박(잔여 ≤10초 비율) / 즉답 비율(<3초 비율). 분석 화면은 정보 밀도 부담으로 통계에서만 노출
- **분석 리포트 5 → 4단계 축소:** Hero 정확도 카드 제거 (표에 정확도 행이 이미 있어 중복). 헤더/차트/통계표/CTA만 남김. 관련 i18n 키(`review_accuracy_yours/opponent`), CSS(`.review-hero-*`) 모두 정리
- 홈 `home-ad-space` placeholder(60px) 제거 → 게임 카드 1개 더 노출
- **티어 라벨 → 버튼 + 랭크 모달:** 탭 시 TIERS 데이터로 동적 생성, 현재 티어 행은 앰버 배경 강조

## Phase 21 — Stockfish 워커 풀 병렬화 + 로딩 명언 + 피드백 FAB (`1cea959`)

- **`engine.js`에 `EnginePool` 추가** — N개 독립 워커 인스턴스, Hash 32MB 옵션, `parseEvalLine` 공유. 배치 분석을 진짜 병렬로 처리
- **`analysis.js` 배치 경로 재작성** — 풀 promise 기반으로 전환. `currentAnalysisIndex`/`processNext` 제거, scheduleRestart는 explore 전용으로 축소
- `main.js`: `engineCallbacks`를 explore 전용으로 축소, 배치 dead writes 청소, `cleanupAnalysis`에 analyzeBtn 활성화 보강
- **로딩 카드** — 명언 100선(`quotes.js` + `quote.json`) + 진행률 % 바. 0수/preview 골격 유지하며 보드만 카드로 교체
- **피드백 FAB** — 홈 우측 하단, 기존 피드백 모달 재사용

## Phase 23 — cp ↔ win% 단일 소스 (freechess 본가 방식 회귀)

Phase 22에서 도입한 SF18 WDL 기반 win%가 표시 cp(정규화)와 모순되는 문제 해결.

**문제:** SF18은 NNUE의 WDL을 직접 출력하면서, cp 출력은 정규화된 값(100cp ≈ 50% 승률)으로 압축. WDL은 NN 분포 직접 / cp는 압축된 다른 모델이라 같은 포지션이 두 모델로 평가되어 "+1.5인데 99%?" 같은 모순 발생.

**중간 시도 폐기:** WDL을 살리고 표시 cp를 역시그모이드로 파생하는 방식도 시도했지만, 그 경우 표시 cp가 SF의 실제 평가가 아닌 Lichess 곡선 위의 가짜값이 되고 분류용 cp(raw)와도 달라져서 폐기.

**최종 해결:** **freechess 본가와 동일하게 raw cp + Lichess 시그모이드 단일 소스**. SF NN의 WDL은 사용하지 않음.

- 표시 cp = SF raw cp ("+1.5") — 엔진 그대로 정직한 값
- 표시 win% = `cpToWhiteWinPct(scoreNum)` ("63%") — 같은 cp의 시그모이드 변환
- 정확도 / 그래프 / 분류 모두 동일한 raw cp 기반 → 완전 일관

**트레이드오프:** SF NN의 진짜 확신도(결정적 엔드게임에서 99%)는 잃음. 정직성과 일관성을 우선시한 결정.

- `utils.js` — `cpToWhiteWinPct` 단일 헬퍼. `wdlToWhiteWinPct`/`getDisplayScore`/`whiteWinPctToDisplayPawns` 모두 제거
- `analysis.js` / `main.js` — engineLine에서 `whiteWinPct` 필드 제거. WDL 분기 삭제
- `ui.js` — `updateTopEvalDisplay(scoreStr, ...)` scoreStr만 받음. `evalToWinChance`는 `cpToWhiteWinPct`에 위임
- `engine.js` — `setoption UCI_ShowWDL value true` 송신 제거 + `parseEvalLine`의 wdl 토큰 파싱 제거

## Phase 22 — 수 분류 알고리즘 freechess 포팅 + WDL win% 도입

기존 CPL 기반 4-tier(Best/Excellent/Good/Inaccuracy/Mistake/Blunder)를 폐기하고 chess.com review 라벨 체계 미러링 — [WintrCat/freechess](https://github.com/WintrCat/freechess)의 알고리즘 1:1 포팅.

**왜 포팅:** 자체 휴리스틱(WCL 임계 + 1-ply SEE)으로 Brilliant/Great를 만들어보다가 false positive 잡으려고 가드를 5+ 추가한 끝에 whack-a-mole 패턴이 됨. freechess는 chess.com 클론 목표로 reverse-engineered되어 같은 라벨 체계(8 + Forced)에 검증된 임계값을 갖고 있음.

- **`engine.js`** — `setoption UCI_ShowWDL true` + `parseEvalLine`이 `wdl <w> <d> <l>` 토큰 파싱. SF의 NN이 직접 출력하는 W/D/L permille (STM 시점)
- **`analysis.js`** — engineLine에 `whiteWinPct` 채움 (WDL → 백 시점 win%; 미지원시 cp 시그모이드 fallback). `buildQueueFromPgn`이 `promotion` 필드 캐시(1순위 일치 비교 UCI에 필요)
- **`utils.js` board 헬퍼 (freechess board.ts 포팅):**
  - `pieceValues` (king=Infinity, m=0)
  - `getAttackers(fen, square)` — STM 뒤집어서 캡처 합법수 enumerate + 인접 적 킹 처리(legal capture or 다른 공격자 존재 시 포함)
  - `getDefenders(fen, square)` — testAttacker 시뮬레이션 후 그 자리 attacker 재검색
  - `isPieceHanging(lastFen, fen, square)` — 등가 트레이드/룩-마이너 유리 트레이드/폰 디펜더 케이스 모두 처리
  - 모듈 레벨 chess.js 인스턴스 7개 재사용 — Brilliant 검사가 64칸 × N회 도는 hot path라 alloc 절감
- **`utils.js` classifyMove (freechess analysis.ts loop body 포팅):**
  - 1순위 일치 → Best
  - 미일치 + cp→cp → quadratic CPL 임계 (`getEvaluationLossThreshold`): `0.0002 × prev² + 0.36 × prev + 108` 식. prevEval 클수록 임계 ↑ → 이미 +5 우세 포지션에서 100cp 손실은 거의 페널티 없음 (시그모이드 saturation과 동등)
  - mate↔cp 4가지 케이스(cp→mate / mate→cp / mate→mate / 같은 mate) 명시적 분기
  - **Brilliant** — 1순위 일치 + winning AND not winningAnyways(2nd가 700+cp 또는 둘 다 mate면 제외) + 비프로모션 + 체크 안 받는 상태 + 마이너 이상 우리 행잉 기물 존재 + 그 기물이 viably capturable (공격자 핀 없음, 룩 미만이면 mate-in-1 안 만들어짐)
  - **Great** — 1순위 일치 + 직전 상대 수가 Blunder + 1-2 ≥ 150cp + 둔 자리 안 행잉
  - **Forced** — 합법수 1개 (engine이 secondLine 못 채움)
  - **Blunder 디그레이드** — `|absEval| ≥ 600`이면 Good (이미 결판났거나 여전히 winning)
- **8 + Forced 라벨 체계:** Brilliant(!!) / Great(!) / Best(✦) / Excellent(✓) / Good / Inaccuracy(?!) / Mistake(?) / Blunder(??) / Forced(□)
  - `--excellent` 컬러 토큰 추가(#6B8C3A)
  - `BADGE_MAP`에 Excellent ✓ + Forced □ 심볼
  - i18n KO/EN 키 모두 추가
- **WDL은 분류엔 안 씀 — 중간 바 win% 표시용으로만.** 정확도 점수도 동일 소스(`getWhiteWinPct` 헬퍼)로 통일해서 표시 ↔ 라벨 모순 제거

---

## 핵심 아키텍처 메모

### 모듈 책임

| 파일 | 역할 |
|------|------|
| `main.js` | 앱 컨트롤러 — 이벤트 와이어링, 뷰 네비(`renderScreen`이 모든 view 표시/숨김 단독 관리), 분석 큐 오케스트레이션 |
| `analysis.js` | 엔진 + 큐 라이프사이클. 배치는 EnginePool 기반 병렬, scheduleRestart는 explore 전용 |
| `board.js` | 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes) |
| `modes.js` | 동작 모드 (appMode, exploration, simulation, preview) |
| `vault.js` | 복기 — 데이터 로드(`loadVaultData`) |
| `savedGames.js` | 저장 게임 — 데이터 로드 |
| `insights.js` | 통계 — 색깔/시간제어/오프닝 등 집계 |
| `ui.js` | DOM 렌더링 (상태 변경 없음) |
| `utils.js` | 순수 로직 — eval 파싱, 수 분류(freechess 포팅), FEN/PGN, `rootOpeningName`, 클럭 파싱, board 헬퍼(getAttackers/getDefenders/isPieceHanging) |
| `engine.js` | `StockfishEngine` (단일) + `EnginePool` (N워커 병렬), UCI 파싱 (cp/mate) |
| `gemini.js` | `/api/analyze` SSE, 결과 캐시, 자체 상태 |
| `chessApi.js` | Chess.com REST (캐시 공유). 캐노니컬 username을 displayName으로 반환 |
| `storage.js` | localStorage CRUD — **데이터 계층**. user_id는 read/write 양쪽 lowercase 정규화. Supabase 전환 시 이 파일만 교체 |
| `quotes.js` | 로딩 화면 명언 카드 데이터(100선, `quote.json`) |
| `api/analyze.js` | Gemini 프록시 (Vercel Edge) |
| `api/feedback.js` | Supabase PostgREST 피드백 저장 |
| `api/db.js` | Supabase 데이터 액세스 (user_id lowercase + 검증) |
| `api/log-username.js` | username_logs fire-and-forget INSERT (anon RLS) |

### 데이터 흐름

```
Input (PGN/Chess.com/board)
  → Chess.js parse → analysisQueue[]
  → FEN → EnginePool 워커 N개 병렬 (MultiPV=3, depth=14 기본, Hash=32MB)
  → cp/mate → engineLines (scoreStr/scoreNum)
  → classifyMove() (freechess 포팅 — quadratic CPL + 8 라벨 + Forced)
  → cpToWhiteWinPct (Lichess 시그모이드 단일 소스 → win% 표시 / 정확도)
  → ui.js 렌더
  → 실수 시 /api/analyze SSE → Gemini 해설
  → 해설은 analysisQueue[i].geminiExplanation에 캐시
  → vault/saved games는 localStorage 영속
```

### 수 분류 (freechess 포팅 — chess.com review 미러)

8 + Forced 라벨: **Brilliant(!!) / Great(!) / Best(✦) / Excellent(✓) / Good / Inaccuracy(?!) / Mistake(?) / Blunder(??) / Forced(□)**.

**핵심 흐름** (`utils.js classifyMove`):
1. **1순위 일치** → Best 후 Brilliant/Great 후보 검사
2. **미일치 + cp→cp** → `getEvaluationLossThreshold(class, |prevEval|)` quadratic 임계 비교, 첫 통과하는 분류 부여 (Best/Excellent/Good/Inaccuracy/Mistake/Blunder)
3. **mate↔cp 전환** 4가지 케이스 명시적 분기
4. **Brilliant** — winning + not-winning-anyways + 비프로모션 + 체크 안 받는 상태 + 마이너 이상 우리 기물 행잉 + viably capturable
5. **Great** — 직전 상대 수가 Blunder + 1-2 ≥ 150cp + 둔 자리 안 행잉
6. **Forced** — 합법수 1개
7. **Blunder 디그레이드** — `|absEval| ≥ 600` 또는 prev ≤ -600이면 Good

**Win% 표시 / accuracy**: `cpToWhiteWinPct(scoreNum)` 단일 소스 (Lichess 시그모이드, `0.00368208 * cp`). 표시 cp는 SF raw 그대로(엔진 그대로), win%는 그 cp의 시그모이드. 두 표시 항상 일치. SF18 WDL은 cp와 다른 모델이라 사용하지 않음 (Phase 23에서 freechess 본가 방식으로 회귀).

### 분석 화면 핵심 바

- **상단 바** (`.analysis-top-bar`) — 뒤로가기, 타이틀, 기보(☰)
- **중간 바** (`.unified-controls` / `#panelTabs`) — 이전/다음, Engine⇄AI 토글, 분류 라벨, 승률/eval, 저장
- **리뷰 모드** — `isReviewMode = true` (인덱스 -1) = 전체화면 4단계 리포트 (헤더/차트/통계표/CTA)

### Supabase 스키마

- `vault_items`: id(uuid), user_id(text), move, classification, notes, position_fen, pgn, created_at — 추가 필드: move_index, move_number, best_move, game_title 등
- `saved_games`: id, user_id, title, category(my_game/otb/opening/pro), pgn, notes, created_at
- `username_logs`: id, username, source(onboarding/search/cached), user_agent, created_at — anon INSERT only RLS
- `user_id`는 localStorage `blundermate_user_id` (Chess.com ID 또는 커스텀 ID, 인증 없음). **항상 lowercase로 저장/쿼리** — 클라이언트(`storage.js`)와 서버(`api/db.js`) 양쪽에서 진입 시점 정규화
- 모든 쿼리는 user_id 필터, try/catch 필수, 실패 시 localStorage 폴백

### 디자인 시스템 (Warm Paper, 라이트 전용)

- 배경 `#F5F2EA` / `#FAF8F2` / `#EDE8DB`
- 텍스트 `#2C2824` / `#6B6358` / `#A89F90`
- 포인트 앰버 `#8B6F2A` (로고/극소수 강조)
- 분류색: blunder `#9A3A2A` / mistake `#B5612A` / inaccuracy `#8B6F2A` / excellent `#6B8C3A` / best `#5A7A3A` / great `#2D6E55` / brilliant `#3A8560` / forced (`--tx2`)
- 보드 `#E8DCBF` / `#8C6840`
- **금지:** 파랑/인디고, 하드코딩 색, 다크 모드 토글, 흰 오버레이

### 핵심 제약

- 모바일 우선 (`100dvh`, 터치 친화)
- 프론트엔드 npm 의존성 금지 — Chessground/Chess.js는 CDN/static
- `escapeHtml()` 필수 (XSS 방지)
- Gemini API 키는 절대 클라이언트로 가지 않음
- localStorage는 try/catch
- UI는 한국어
