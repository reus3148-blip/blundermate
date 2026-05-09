# blundermate

체스 게임 리뷰 모바일 웹앱. Chess.com / Lichess / PGN 입력으로 게임 불러와 Stockfish 분석 + Gemini AI 한국어 해설.

## 강제되는 invariants

이 항목들은 **현재 코드 전수에서 일치**. 위반 발견 시 즉시 픽스 + 이 섹션 갱신. (Phase 48 기준)

- 모바일 우선 (`100dvh` 기준, 터치 친화). PC에선 `width: min(100vw, calc(100dvh * 9 / 16))`로 9:16 비율 컨테이너
- UI 한국어 기본 ([strings.js](strings.js)). EN은 fallback. 화면 텍스트는 모두 `t(key)` 경유 — 한국어/영어 하드코드 금지
- Pure ES6 modules, 빌드 도구 없음. Chessground는 CDN(global), Chess.js는 jsDelivr ESM(`+esm` 1.4.0), Stockfish는 [engine/](engine/) static
- 프론트엔드 npm 의존성 0 — package.json 없음
- Gemini API 키 클라이언트 노출 0 — 모든 호출은 [api/analyze.js](api/analyze.js) Edge proxy 경유. 키는 `process.env.GOOGLE_API_KEY`로 서버에만
- 사용자 입력 + 외부 API 닉네임 / PGN 헤더는 `escapeHtml()` ([utils.js](utils.js)) 통과 후 innerHTML. `textContent`로 충분하면 그것이 우선
- localStorage 접근은 모두 [storage.js](storage.js)의 `lsGet/lsSet` 또는 그 위에 빌드된 accessor (`getIsCoordsEnabled`, `getMyUserId`, `getMyPlatform`, `setLocale` 등) 경유 — 직접 `localStorage.getItem/setItem` 호출 금지 (Safari private mode throw 흡수)
- `(user_id, platform)` 페어로 모든 영속 데이터 격리 — 'chesscom' / 'lichess'. 로컬 캐시 lookup도 platform 필터 필수. callDB가 platform 자동 주입 + insert 시 row에도 박아 서버측 spoofing 검증
- user_id는 lowercase 정규화 — 클라이언트 (`setMyUserId`) + 서버 (`api/db.js`) 양 진입 시점
- OS `alert/confirm/prompt` 금지 — [dialogs.js](dialogs.js)의 `showToast/showAlert/showConfirm` 사용 (모바일 톤 일관)

## 데이터 / 인증

- 인증 없음. user_id = chess.com / lichess 닉네임
- Supabase 5개 테이블 + localStorage 폴백 ([storage.js](storage.js)가 추상화 계층)
  - `vault_items` — 자동 수집된 블런더/메이트 퍼즐
  - `saved_games` — 사용자가 명시 저장한 게임
  - `analyzed_games` — 분석된 게임의 PGN + 캐시 (vault_items가 `analyzed_game_id`로 참조)
  - `username_logs` — 온보딩 닉네임 로그
  - `feedback` — 사용자 피드백
- `callDB`는 서킷 브레이커 + pilot coalescing — /api/db 죽은 환경 콜드 로드 5xx 폭주 방지. race 의도는 코드 코멘트 참조
- 자세한 스키마: [supabase-schema.md](supabase-schema.md)

## 모듈 책임

- `main.js` — **거대 컨트롤러** (~1700줄). 이벤트 와이어링, 뷰 네비, 분석 큐 오케스트레이션, 모달/오버레이 핸들링, simulation 모드, tier 모달, eval display toggle. Phase별로 책임을 외부 모듈로 추출해왔지만 여전히 SPA shell 보유
- `home.js` — 홈/온보딩 화면 (프로필 카드, 게임 카드 무한 스크롤, 미니보드 SVG, 시간대 필터, 온보딩 + 닉네임 검증). `homeProfileRatings`는 `export let` live binding으로 main.js에서 read
- `analysis.js` / `board.js` / `modes.js` — 분석 큐 / 보드 상태 / 동작 모드(main/explore/live_input/simulate)
- `vault.js` — 자동 수집 블런더/메이트 퍼즐 풀이 화면. Phase 46에서 수동 저장 흐름 제거. 단, legacy localStorage row 중 `source: 'manual'`이 storage.js의 폴백으로 살아있음 — 호환만 유지(렌더링 안 됨)
- `savedGames.js` — 사용자 저장 게임 화면 (분석/라이브 화면의 💾 진입). 카테고리 4종(my_game/otb/opening/pro) + 필터
- `insights.js` — 통계 화면 (4탭: 요약/결과/오프닝/패턴). chess.com / lichess 게임 100건 기준 집계
- `dialogs.js` — 토스트 + 확인 모달
- `autoBlunders.js` — 분석 직후 자동 블런더 수집 (fire-and-forget). `source: 'auto'`만 생성. PGN은 `analyzed_games`에 별도 보관해 vault row에서 미포함
- `utils.js` — 순수 헬퍼 (parseAndLoadPgn, classifyMove, escapeHtml, getAttackers/Defenders/isPieceHanging, formatMarkdownToHtml, getTier 등). 이 파일은 `t`/`getLocale` 외 사이드이펙트 없음
- `storage.js` — 데이터 계층. `lsGet/lsSet` 안전 래퍼, `(user_id, platform)` 격리 보장, callDB 서킷 브레이커 + pilot coalescing. accessor: `getMyUserId/setMyUserId`, `getMyPlatform/setMyPlatform`, `getIsCoordsEnabled/setIsCoordsEnabled`
- `engine.js` — Stockfish 워커 래퍼 (StockfishEngine 단일 + EnginePool 병렬). 풀의 실패 워커는 `_retireFailed`로 격리 + terminate. `EnginePool.ready()`는 `Promise.allSettled` — 일부 워커 실패해도 살아남은 워커가 있으면 진행
- `gemini.js` — Gemini streaming 클라이언트 (`/api/analyze` 프록시 경유). 응답은 `getReader()` 기반 raw text decode + markdown 렌더 — SSE 프레임 명시 파싱은 안 함
- `chessApi.js` → `chesscom.js` / `lichess.js` — 플랫폼 어댑터. 호출자는 `chessApi`만 import, 라우팅은 `getMyPlatform()` 기준
- `ui.js` — DOM 렌더링 (상태 변경 없음). `renderMovesTable` / `renderEngineLines` / `renderReviewReport` / `placePieceBadge` / `withScreenLoading` 등
- `styles/tokens.css` — 디자인 토큰(색상/z-index/치수 변수) + 베이스 리셋. styles.css보다 먼저 로드
- `api/*.js` — Vercel Edge Functions. `api/_*.js`는 라우팅 안 됨 — `_http.js`(corsHeaders/jsonResponse/methodGuard/supabaseHeaders), `_platform.js`(normalizePlatform) 공유 헬퍼. `api/db.js`의 update action은 테이블별 화이트리스트(`UPDATE_SCHEMA`) — analyzed_games(analysis_*) / saved_games(title/notes/category)

## 알려진 갭 (의도적 미해결)

인지하고 있지만 인프라/의존성/우선순위 결정으로 인해 보류. 작업 시 회피하거나 별도 phase로.

- **테스트 슈트 0** — 동시성/오류 경로(callDB pilot/breaker race, vault mate replay race 등) 검증은 수동 + preview server. PR 머지 후 production 모니터링 의존
- **API rate limit 0** — 4 엔드포인트(analyze/db/feedback/log-username) 모두 익명 POST + CORS `*`. Vercel KV / 외부 서비스 결정 필요
- **Gemini 본문 sanitization 0** — `formatMarkdownToHtml`이 `marked` 직접 호출 → DOMPurify 부재. prompt injection 위험 이론적 잔존. 의존성 추가 결정 필요 ("npm 0" 제약과 충돌)
- **다크 모드 0** — tokens.css 변수 체계는 있지만 dark palette 미결정
- **빈 상태 일러스트 0** — vault/saved/insights 빈 상태가 회색 텍스트 1줄. 디자이너 외주 영역
- **`EnginePool.destroy()` 와이어링 0** — `initAnalysis`가 한 번만 호출되는 사이트라 실 leak은 없지만 unmount 훅 부재

## 라이선스

GPL v3 (Stockfish + Chessground 의존). [NOTICE.md](NOTICE.md) 참조.

`utils.js`의 `classifyMove` / `getAttackers` / `getDefenders` / `isPieceHanging`은 [freechess](https://github.com/WintrCat/freechess) (CC BY-NC-SA 4.0) 포팅 — 알고리즘 핵심은 변경 자제.

## 컨텍스트 (가변)

진행 중 작업 / 최근 의사결정 / UX 톤은 [WORKLOG.md](WORKLOG.md) **latest phase** 참조.

> phase 정렬은 chronological 아님 — 작성자가 그 시점 기준 위에 추가하는 스타일. 옛 phase의 결정도 후속에서 회귀할 수 있음 (예: Phase 32 → 35).

**의심 시 코드를 truth source로 신뢰.** 이 문서나 워크로그가 코드와 어긋나면 코드 우선 — 그리고 어긋남을 발견했으면 문서 갱신.

> 이 문서의 "강제되는 invariants" 섹션은 과거 일부 코드가 위반하던 시기가 있었음 (Phase 48에서 일괄 정렬). 의심되면 grep으로 검증할 것 — `localStorage.getItem` 직접 호출 / 비-`escapeHtml` innerHTML / platform 필터 누락 등.
