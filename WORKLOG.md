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

## Phase 24 — 엔진 평가 코드 정리 + depth 14 기본 (`64a8976`, `a6eccc6`)

WDL 도입/회귀 와리가리하면서 남은 잔재 정리, 그리고 Phase 21 워커 풀 이후 체감 속도 여유로 기본 depth 상향.

- `classifyMove`/`runBatch`의 `isUserWhite` 파라미터 제거 — 받기만 하고 안 씀
- `cpToWhiteWinPct` / `computePlayerAccuracy` / `updateTopEvalDisplay` 주석에서 WDL 결정 히스토리 제거
- `ui.js` `'evalDisplayMode'` 하드코딩 → `EVAL_MODE_KEY` 상수
- **기본 depth 12 → 14** — quiet move의 Best/Excellent 구분 등 분류 정확도 향상. 설정 모달에서 명시 저장한 사용자는 자기 값 유지(localStorage 우선), 그 외는 자동 14 적용

## Phase 25 — 홈/통계 Apple/Notion 스타일 재정비 (`81618d5`, `59d1046`)

1px 하드 보더 + flat fill 톤에서 soft elevation ring + hairline 톤으로 전환. 홈/통계만 적용 (분석 화면은 정보 밀도가 다름).

- **카드 톤** — 1px 보더 제거 → `box-shadow` soft ring (radius 10), 좌측 status stripe(애플 메일 결)
- **상단 바** — 3px 구분선 → 1px hairline
- **라벨 + pill inline 두 줄 레이아웃** — "최근 게임" 라벨 옆 시간 pill, 통계 필터도 동일 패턴. "전체" pill은 디폴트라 제거
- **시간대 필터** — pill 박스 → text-tab + 액센트 언더라인 + 세로 구분선. 라벨 좌측은 카드 직선 시작점(border-radius 10px) 기준 정렬
- **스페이싱** — 상단바↔히어로 36px → 20px (유령 spacer 제거), 히어로↔게임목록 16 → 8px
- **카드 그룹 순서 (통계)** — 정체 → 스타일 → 시계 → 습관
- **타이포** — 800 → 700, manifest theme `#F7F7F8`, eval win/loss 색 토큰 정합

## Phase 26 — Vault 자동 블런더 수집 + 퍼즐 보기 모드 (`6d64477`)

수동 저장에 의존하던 vault에 자동 수집 + 출제 모드 추가. 분석 끝나면 손 안 대도 풀이 채워지고, 별도 탭에서 무작위 출제됨.

**자동 수집 (`autoBlunders.js` — 신규):**
- 분석 `onComplete` 직후 호출. 사용자 수만 대상으로 두 종류 후보 추출:
  1. **워스트 2** — `classification ∈ {Mistake, Blunder}` 중 CPL 내림차순 상위 2
  2. **missed_mate** — 직전 top eval이 mover에게 mate-in-1~4였는데 그 수를 안 둔 케이스
- 한 인덱스가 두 분류 모두 걸리면 **missed_mate 우선**
- `cp→mate`로 끌려간 케이스는 cpLoss 계산 불가 → 큰 가상값(9999)으로 정렬 보장
- **dedup은 `position_fen` 기준** — 같은 포지션이 다른 게임에서 재발해도 한 번만 저장
- 에러는 토스트 없이 `console.warn`만 — 백그라운드 fire-and-forget

**`analyzed_games` 테이블 분리:**
- vault_item마다 PGN을 들고 다니면 한 게임당 N행 중복 → 한 게임당 1행으로 분리
- `vault_items.analyzed_game_id`로 참조, `source='auto'` row는 `pgn` 컬럼이 NULL
- `pgn_hash` (SHA-256) upsert 키 — 같은 PGN이면 재삽입 안 함
- legacy `manual` row는 그대로 PGN 직접 보관 (호환)

**Vault UI — 텍스트 탭 (목록/보기):**
- **목록** = 기존 수동 저장 vault_items
- **블런더 목록** 서브뷰 — 자동 풀 전용 리스트
- **보기** = 자동 풀에서 무작위 출제 → 직전 포지션 보드 표시 → 한 수 입력 → `bestUci` 비교 → 다음 문제
- 모드 진입 시 항상 `list` 리셋 (퍼즐 후 재진입 자연스러움)

**기타:**
- `api/db.js` 화이트리스트에 `analyzed_games` 추가 — 허용 컬럼은 `pgn_hash` / `id`만 (SQL 분리 차단)
- `storage.js`에 `computePgnHash` / `upsertAnalyzedGame` / `addVaultItemsBatch` / `getAnalyzedGameById` 추가, `ANALYZED_GAMES_KEY` localStorage 폴백

## Phase 27 — Vault 재구조화: 분류축 전환 + 자동 다음 제거 (`d311f81`)

직접/자동(source)을 1차로 두던 분류를 실수/메이트/기타(category)로 갈아끼우고, 풀이 진행을 사용자가 직접 넘기도록 한 단계 큰 정리.

**왜 바꿨나:** vault 진입 시 사용자 머릿속 첫 질문은 "어떻게 들어왔는지"가 아니라 "뭘 풀까". 풀이 UX도 cp 실수(한 수 비교)와 메이트(엔진 응수까지 따라감)가 갈라지는 게 본질이라 그쪽이 1차 분류로 자연스러움. 직접 저장은 사용량이 적어 보조로 내려도 손실 작음.

**분류축 전환:**
- `categorize(item)` — `mistake`/`blunder` → 실수, `missed_mate` → 메이트, 그 외(`positional` 등) → 기타. source 무관.
- `_autoItemsCache` → `_itemsCache`로 이름 변경, manual+auto 통합. `getVaultItems({source})` 필터 호출 제거.
- `deckState` 3개(mistake/mate/other), 각자 stories history 위치 독립 유지.
- '**기타**' deck — 정답 없는 감상용. 보드 인터랙션 잠금, 노트+수 표시, 진입 즉시 좌/우 탭존 활성. positional 직접 저장이 들어갈 자리.

**자동 다음 제거:**
- `_autoNextTimer` / `AUTO_NEXT_DELAY` / `scheduleAutoNext` / `cancelAutoNext` 전부 삭제. 풀이 deck도 정답/오답 후 사용자가 직접 좌/우/화살표/다음 버튼으로 넘김.
- 풀이 deck은 풀이 완료 후, 'other' deck은 진입 즉시 탭존/화살표 활성.

**진입 즉시 stories:**
- 옛 `vaultModeTabs`(목록/보기) 제거 — 진입하면 바로 stories pane.
- 보조 리스트는 우상단 ☰(`vaultListLink`)로 진입. 게임 날짜(`played_date`) desc, NULL이면 `created_at` 폴백 정렬.

**`played_date` 컬럼 추가:**
- 자동/수동 두 출처가 같은 정렬 키를 공유하도록 `vault_items.played_date` 신설. autoBlunders는 PGN `UTCDate||Date`에서, 수동 저장은 `chess.header()`에서 추출. `storage.js`의 normalize 2곳(Supabase row / localStorage) + insert 매핑 일관 처리.
- 옛 자동 항목은 `analyzed_games.played_date`로 1회 백필 SQL 제공. 옛 수동 항목은 PGN을 SQL로 못 파싱하니 NULL 유지(폴백으로 자연 처리).

**`navigateTo` 일원화 (부수 수정):**
- `vault.js`가 `_navigateTo('vault_blunder_list')`만 호출하던 ☰/detail 진입로가 `history.pushState`만 되고 `renderScreen`이 안 돌아 화면이 안 바뀌어 사용자 시각엔 무반응. main.js `navigateTo`가 `pushState + renderScreen`을 한 호출에 처리하도록 일원화.
- bottom nav 4곳의 `navigateTo + renderScreen` 중복 호출도 정리 — 옛날엔 `loadVaultData` 등 데이터 로드가 nav 한 번에 두 번 돌던 부작용도 사라짐.

**UI 안전망:**
- vault stories 세로 부족 시 다음 버튼이 viewport 밖으로 밀리던 이슈: `vault-puzzle-stage`에 `overflow-y: auto`, 분석 화면 기준이던 board `max-width`를 vault 전용으로 빡빡하게(`calc(100dvh - 340px)`).

## Phase 28 — 분석 화면 컨트롤바 재배치 + 엔진라인 상단 이동 시도 폐기 (`18023a6`, `f400daa`)

분석 화면 정보 계층을 정리해보려 한 일련의 실험. 아이디어로 시작해 일부는 본선 진입, 일부는 폐기.

**시도(폐기됨) — 엔진라인을 보드 위로:**
- vault stories의 prompt 영역과 같은 리듬으로 PV 2줄 + 평가 row를 보드 위에 상시 노출, 보드 아래는 [AI 물어보기/저장/<>] 단순화. 위(엔진의 시선) ↔ 아래(내 시선) 이분 구조 의도.
- 두 커밋(`06070db` engineLines 위로 이동, `14742df` PV 2줄 + info row + 컨트롤바 재구성)으로 진행했으나 **분석화면이 vault stories와 너무 닮아 정체성이 흐려짐** — 사용자 피드백으로 두 커밋 모두 force-reset(`741e606`로). 빈 커밋(`d025723`)으로 재배포 트리거.
- 폐기 이유 기록: 시각언어 일관성 ↑은 매력적이었지만, 분석화면이 "vault 형제"가 되면 화면 자체의 무게감이 떨어짐. 보드 위는 비워두고 정보는 컨트롤바·패널에 모으는 기존 구조가 더 분석적이라는 판단.

**적용된 것 — 컨트롤바 재배치(`18023a6`):**
- 좌(prev/AI) → (AI/저장), 우(저장/next) → (prev/next). 평가(분류·승률)는 중앙 유지.
- 바 높이 44 → 52px, 보드 `max-width` 259 → 267px로 보정 (vault detail 포함 글로벌 .board-container 영향).

**버튼 크기·간격 정리(`f400daa`):**
- AI(텍스트, ~24px) vs 저장(아이콘, 36px)의 폭 불균형 + AI에 min-height 없어 터치 타겟 작던 문제. 모든 버튼 44×44로 통일, ctrl-group 내 4px gap, AI에 active 스케일 피드백 추가. 좌·우 그룹 폭 92px로 대칭.

## Phase 29 — vault 표기/레이아웃 일관화 + 통계 8 카드 추가 + 시각 재편

vault 표기·레이아웃 안정화부터 통계 화면 대규모 확장·시각 재편까지 한 세션에 묶음. **모든 통계는 stockfish 없이** chess.com PGN/헤더 + vault 자동 수집 데이터로 도출 (사이트 정체성: 체스닷컴 리뷰 못 돌리는 사람 대상).

**vault 표기 일관 (사이트 정체성 = blunder + mate):**
- `vault_puzzle_find_mate` "외통" → "메이트"
- 풀이 모드 카테고리 라벨 "실수" → "블런더" (mistake+blunder cp 손실 통합 카테고리)
- onboarding tagline "체스 실수" → "블런더와 놓친 메이트"
- `vaultDetail`의 raw `item.category` 노출 버그 수정 — `categoryVisual()` 의 한국어 라벨 사용

**vault 보드 y좌표 픽셀 락:**
- filter-tabs(30px), indicator(26px), prompt(50px) 모두 `height` 명시 + `box-sizing: border-box`. min-height 사용 금지.
- prompt 안 헤더(20px line-height/height) + subhead(16px) 픽셀 박스로 — 한/영/숫자 mix와 폰트 weight 변동에도 동일.
- 카테고리(블런더/메이트/기타) 전환 시 보드 윗변 1픽셀 흔들림 없음.
- indicator `MAX_INDICATOR_SEGS=12` cap, 초과 시 우측 카운터(`5/30`)로 보강.
- 빈 `.vault-info-row` 자동 숨김 (`:has(:empty)`), "다음" 버튼 풀 상태별 라벨 (`다시 풀기` / `처음부터` / `다음`).

**root 탭 back 버튼 제거 (iOS 패턴):**
- vaultView, savedGamesView, insightsView 의 top-bar 에서 back 버튼 제거 — bottom-nav 가 root 진입점이라 중복.
- drilldown(vaultDetail, vaultBlunderList) 은 back 유지.
- top-bar grid `1fr auto 1fr` 슬롯 균형 위해 `<div class="top-bar-spacer">` 보강 (title 중앙 정렬 보존).

**CSS 청소:**
- 데드 셀렉터 제거 — `.input-controls`, `.vault-mode-tabs`, `.vault-sub-row`, `.vault-sub-link` (Phase 27 에서 구조 제거됐는데 CSS만 남아있던 것)
- `!important` 1건 (`.empty-state padding`) 제거 — 오버라이드 없는데 박혀있던 잔재
- 스테일 fallback 색 (Phase 14 워페이퍼 잔재) 제거 — `var(--bg-elevated, #EDE8DB)` 등
- 데드 i18n 키 제거 — `vault_unknown`, `insights_filter_tc`, `insights_filter_color`

**통계 신규 8 카드:**
- 상대 레이팅별 성적 (5단 버킷: ≤−200 / −100 / 비슷 / +100 / ≥+200)
- 첫 수 (백 게임만, e4/d4/c4/Nf3/기타) — 표본 ≥5 일 때만 노출
- 캐슬링 패턴 (kingside/queenside/none)
- 거래 활동 (캡쳐 비율 → 소극/균형/활발/공격 라벨, 임계 12/20/28%)
- 요일별 성적 (월~일)
- 자주 만난 상대 Top 5 (≥2판)
- 레이팅 변화 (시작→끝 델타, 최고/최저) — 단일 시간제어 필터에서만
- 블런더 핫스팟 (vault auto items moveNumber 5수 단위 히스토그램)

**통계 시각 재편:**
- **컬럼 차트** (`renderColumnChartCard`) — 분포 카드는 7-row WDL 대신 vertical bar chart. 막대 높이 = 표본, 색 = 승률 HSL 보간 (red→gray→green). 적용: 요일/시간대/상대레이팅/첫수/핫스팟.
- **2/3-up 페어링** (`.insight-pair`, `pairCards()`) — 작은 metric 카드(평균/압박/즉답/거래) 사이드바이사이드. 360px 미만 1열 fallback.
- **6 카테고리 탭** (요약/오프닝/시계/시간/사람/약점) — `insightsCategoryFilter` state, 본문 분할로 스압 감소. 가로 스크롤 폴백.
- **iOS 세그먼트 컨트롤** 필터 (`.pill-filter-bar--insights` modifier) — 둥근 컨테이너, 선택 셀만 흰 fill + soft shadow.
- **좌우 정렬** — 시간제어 left, 진영 right (`justify-content: space-between`). 카테고리 탭도 동일 패턴 (6 탭 균등 분포).
- **WDL row 헤더 분리** (`.insight-row-header`) — label-left / %-right column 정렬, 카운트 아래 muted gray. row 간 % 비교 시각 쉬움.

**오프닝 root + variant 합성 (`utils.subVariantName` / `compactOpeningLabel`):**
- `Sicilian Defense Najdorf Variation` / `Sicilian Defense Dragon Variation` 등 같은 root 의 다른 variant 가 별도 버킷으로 분리. root 의 trailing `Defense/Game/Opening` 스트립해 `Sicilian Najdorf` / `Sicilian Dragon` 라벨로 컴팩트.
- 변종 없을 땐 root 그대로 유지.

**기타:**
- `getMyUserId()` 미설정 시 vault 핫스팟 `getVaultItems({source:'auto'})` 가 localStorage 폴백으로 동작
- chess.com 게임 + vault 핫스팟 병렬 `Promise.all` 로 동시 fetch (insights 진입 시간 단축)

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
| `vault.js` | 복기 — 실수/메이트/기타 카테고리 stories deck, 보조 리스트 뷰, 데이터 로드(`loadVaultData`) |
| `autoBlunders.js` | 분석 완료 직후 워스트 2 + missed_mate(≤4) 자동 수집, position_fen dedup, fire-and-forget |
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
  → onComplete: collectAutoBlunders → analyzed_games 1행 + vault_items(source='auto') N행
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
- **중간 바** (`.unified-controls` / `#panelTabs`, height 52px) — 좌(AI 토글, 저장) · 중앙(분류 라벨/승률) · 우(이전, 다음). 모든 버튼 44×44
- **리뷰 모드** — `isReviewMode = true` (인덱스 -1) = 전체화면 4단계 리포트 (헤더/차트/통계표/CTA)

### Supabase 스키마

- `vault_items`: id(uuid), user_id(text), move, classification, notes, position_fen, pgn, created_at — 추가 필드: move_index, move_number, best_move, game_title, source('manual'|'auto'), analyzed_game_id, cp_loss, mate_in, played_date(자동·수동 공통 정렬 키)
- `analyzed_games`: id(uuid), user_id, pgn_hash(SHA-256, upsert 키), pgn, headers_json, played_date, created_at — 한 게임당 1행, vault_items(source='auto')가 analyzed_game_id로 참조
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
