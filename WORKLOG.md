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

---

## 핵심 아키텍처 메모

### 모듈 책임

| 파일 | 역할 |
|------|------|
| `main.js` | 앱 컨트롤러 — 이벤트 와이어링, 뷰 네비(`renderScreen`이 모든 view 표시/숨김 단독 관리), 분석 큐 오케스트레이션 |
| `analysis.js` | 엔진 + 큐 라이프사이클 (stockfish, analysisQueue, scheduleRestart/consumePendingRestart) |
| `board.js` | 보드 뷰 상태 (chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes) |
| `modes.js` | 동작 모드 (appMode, exploration, simulation, preview) |
| `vault.js` | 복기 — 데이터 로드(`loadVaultData`) |
| `savedGames.js` | 저장 게임 — 데이터 로드 |
| `insights.js` | 통계 — 색깔/시간제어/오프닝 등 집계 |
| `ui.js` | DOM 렌더링 (상태 변경 없음) |
| `utils.js` | 순수 로직 — eval 파싱, 수 분류, FEN/PGN, `rootOpeningName` |
| `engine.js` | `StockfishEngine` — Web Worker 래퍼, UCI 파싱 |
| `gemini.js` | `/api/analyze` SSE, 결과 캐시, 자체 상태 |
| `chessApi.js` | Chess.com REST (캐시 공유) |
| `storage.js` | localStorage CRUD — **데이터 계층**. Supabase 전환 시 이 파일만 교체 |
| `api/analyze.js` | Gemini 프록시 (Vercel Edge) |
| `api/feedback.js` | Supabase PostgREST 피드백 저장 |
| `api/db.js` | Supabase 데이터 액세스 (user_id 검증) |

### 데이터 흐름

```
Input (PGN/Chess.com/board)
  → Chess.js parse → analysisQueue[]
  → FEN → Stockfish Worker (MultiPV=3, depth=12)
  → UCI → classifyMove() (Lichess CPL)
  → ui.js 렌더
  → 실수 시 /api/analyze SSE → Gemini 해설
  → 해설은 analysisQueue[i].geminiExplanation에 캐시
  → vault/saved games는 localStorage 영속
```

### 수 분류 (Lichess CPL)

Best (엔진 1수) / Excellent (≤10) / Good (≤50) / Inaccuracy (≤100) / Mistake (≤200) / Blunder (>200). eval은 항상 현재 차례 관점, `parseEvalData()`가 부호 전환.

### 분석 화면 핵심 바

- **상단 바** (`.analysis-top-bar`) — 뒤로가기, 타이틀, 기보(☰)
- **중간 바** (`.unified-controls` / `#panelTabs`) — 이전/다음, Engine⇄AI 토글, 분류 라벨, 승률/eval, 저장
- **리뷰 모드** — `isReviewMode = true` (인덱스 -1) = 전체화면 5단계 리포트

### Supabase 스키마

- `vault_items`: id(uuid), user_id(text), move, classification, notes, position_fen, pgn, created_at — 추가 필드: move_index, move_number, best_move, game_title 등
- `saved_games`: id, user_id, title, category(my_game/otb/opening/pro), pgn, notes, created_at
- `user_id`는 localStorage `blundermate_user_id` (Chess.com ID 또는 커스텀 ID, 인증 없음)
- 모든 쿼리는 user_id 필터, try/catch 필수, 실패 시 localStorage 폴백

### 디자인 시스템 (Warm Paper, 라이트 전용)

- 배경 `#F5F2EA` / `#FAF8F2` / `#EDE8DB`
- 텍스트 `#2C2824` / `#6B6358` / `#A89F90`
- 포인트 앰버 `#8B6F2A` (로고/극소수 강조)
- 분류색: blunder `#9A3A2A` / mistake `#B5612A` / inaccuracy `#8B6F2A` / best `#5A7A3A` / brilliant `#3A8560`
- 보드 `#E8DCBF` / `#8C6840`
- **금지:** 파랑/인디고, 하드코딩 색, 다크 모드 토글, 흰 오버레이

### 핵심 제약

- 모바일 우선 (`100dvh`, 터치 친화)
- 프론트엔드 npm 의존성 금지 — Chessground/Chess.js는 CDN/static
- `escapeHtml()` 필수 (XSS 방지)
- Gemini API 키는 절대 클라이언트로 가지 않음
- localStorage는 try/catch
- UI는 한국어
