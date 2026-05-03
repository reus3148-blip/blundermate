# blundermate

체스 게임 리뷰 모바일 웹앱. Chess.com / Lichess / PGN 입력으로 게임 불러와 Stockfish 분석 + Gemini AI 한국어 해설.

## 변치 않는 제약

- 모바일 우선 (`100dvh` 기준, 터치 친화)
- UI 한국어 (i18n: strings.js. 영어도 있지만 기본은 한국어)
- Pure ES6 modules, 빌드 없음. Chessground/Chess.js는 CDN, Stockfish는 static
- 프론트엔드 npm 의존성 금지
- Gemini API 키 클라이언트 노출 금지 (api/analyze.js Edge proxy 경유)
- 사용자 입력 + 외부 API 닉네임 → escapeHtml 필수
- localStorage 접근 try/catch

## 데이터 / 인증

- 인증 없음. user_id = chess.com / lichess 닉네임 (lowercase 정규화 — 클라/서버 양쪽 진입 시점)
- Supabase 5개 테이블 + localStorage 폴백 (storage.js가 추상화 계층)
- 모든 영속 레이어는 `(user_id, platform)` 쌍으로 격리 — 'chesscom' / 'lichess'
- 자세한 스키마: [supabase-schema.md](supabase-schema.md)

## 모듈 책임 (1줄 요약, 디테일은 코드)

- `main.js` — 앱 컨트롤러, 이벤트 와이어링, 뷰 네비, 분석 큐 오케스트레이션
- `analysis.js` / `board.js` / `modes.js` — 분석 / 보드 / 동작 모드 상태
- `vault.js` / `savedGames.js` / `insights.js` — 화면 모듈
- `autoBlunders.js` — 분석 직후 자동 블런더 수집 (fire-and-forget)
- `utils.js` — 순수 헬퍼 (parseAndLoadPgn, classifyMove, escapeHtml 등)
- `storage.js` — 데이터 계층 (Supabase + localStorage 폴백)
- `engine.js` — Stockfish (StockfishEngine 단일 + EnginePool 병렬)
- `gemini.js` — Gemini SSE 클라이언트
- `chessApi.js` → `chesscom.js` / `lichess.js` — 플랫폼 어댑터
- `ui.js` — DOM 렌더링 (상태 변경 없음)
- `api/*.js` — Vercel Edge Functions. `api/_*.js`는 라우팅 안 됨 (`_http.js`, `_platform.js` 공유 헬퍼)

## 라이선스

GPL v3 (Stockfish + Chessground 의존). [NOTICE.md](NOTICE.md) 참조.

`utils.js`의 `classifyMove` / `getAttackers` / `getDefenders` / `isPieceHanging`은 [freechess](https://github.com/WintrCat/freechess) (CC BY-NC-SA 4.0) 포팅 — 알고리즘 핵심은 변경 자제.

## 컨텍스트 (가변)

진행 중 작업 / 최근 의사결정 / UX 톤은 [WORKLOG.md](WORKLOG.md) **latest phase** 참조.

> phase 정렬은 chronological 아님 — 작성자가 그 시점 기준 위에 추가하는 스타일. 옛 phase의 결정도 후속에서 회귀할 수 있음 (예: Phase 32 → 35).

**의심 시 코드를 truth source로 신뢰.** 이 문서나 워크로그가 코드와 어긋나면 코드 우선 — 그리고 어긋남을 발견했으면 문서 갱신.
