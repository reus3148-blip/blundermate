# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Blundermate

Mobile-first chess game review web app. Users load games via Chess.com API or PGN paste, then get Stockfish engine analysis with optional Gemini AI explanations. Built with zero build step — pure ES6 modules deployed on Vercel.

## Development

**No build step.** Open `index.html` directly in a browser for local development.

**Deploy:** Push to main branch → auto-deploys via Vercel.

**Environment:** Copy `.env` with `GEMINI_API_KEY` for Gemini features locally. In production, the key lives in Vercel Environment Variables — never expose it client-side.

**Gemini backend:** `api/analyze.js` is a Vercel Edge Function. To test it locally, use `vercel dev` (requires Vercel CLI).

## Architecture

### Module Responsibilities

| File | Role |
|------|------|
| `main.js` | App controller — all global state, event wiring, view navigation, analysis queue |
| `vault.js` | Vault(복기) module — vault list/detail views, state, rendering, navigation |
| `savedGames.js` | Saved Games module — game save/load/delete, list view, rendering |
| `ui.js` | Pure DOM rendering functions — no state mutations |
| `utils.js` | Pure logic — eval parsing, move classification, FEN/PGN helpers |
| `engine.js` | `StockfishEngine` class — wraps Web Worker, parses UCI protocol |
| `gemini.js` | `createGeminiHandler()` — SSE streaming from `/api/analyze`, caches results |
| `chessApi.js` | Chess.com REST API — fetches recent games by username |
| `storage.js` | localStorage CRUD — vault items, saved games, settings. 데이터 계층으로 유지 — 장기적으로 Supabase 백엔드 전환 시 이 파일의 내부 구현만 교체하면 vault.js, savedGames.js 등은 수정 불필요 |
| `api/analyze.js` | Vercel Edge Function — Gemini proxy with system prompt, streams plain text |
| `api/feedback.js` | Vercel Edge Function — Supabase PostgREST로 피드백 저장 (현재 유일한 Supabase 연동 지점) |

### Data Flow

```
User Input (PGN / Chess.com API / board)
  → Chess.js parse → analysisQueue[] built
  → Each position FEN → Stockfish Web Worker (MultiPV=3, depth=12)
  → Parse UCI output → classifyMove() (EPL algorithm in utils.js)
  → Render moves table + board via ui.js
  → On mistake: Gemini explanation fetched via /api/analyze (SSE)
  → Explanation cached in analysisQueue[i].geminiExplanation
  → Vault/saved games persisted to localStorage
```

### Key State (global in `main.js`)

- `chess` — Chess.js instance tracking main game
- `analysisQueue` — array of move objects with evals, classifications, cached Gemini text
- `currentlyViewedIndex` — which move is displayed
- `isUserWhite` — player perspective (flips board + eval sign)
- `isExplorationMode` / `isSimulationMode` — alternate interaction modes

### Views

Two main screens toggled via CSS class on `.app-container`:
- **Home** — game input (Chess.com / PGN / board), My Vault, Saved Games, Practice Mode
- **Analysis** — Chessground board, eval bar, moves table, engine lines, Gemini panel

### Analysis View Key UI Bars

분석 화면에는 두 개의 핵심 바가 있으며, 이 구조를 유지해야 한다:

- **상단 바** (`.analysis-top-bar`) — 뒤로가기 버튼, 앱 타이틀(`blundermate`), 기보 오버레이 버튼(`☰`). 모든 뷰(분석, 보드입력, 복기 상세, 저장 게임)에서 동일 패턴으로 사용.
- **중간 바** (`.unified-controls` / `#panelTabs`) — 이전/다음 수 네비게이션, Engine⇄AI 탭 토글, 수 분류 라벨(`#moveClassLabel`), 승률/평가치 표시(`#winChanceDisplay`), 저장 버튼. 보드 바로 아래에 위치하며 분석 조작의 중심.

### Move Classification (EPL Algorithm)

`classifyMove()` in `utils.js` maps centipawn loss to: Blunder / Mistake / Inaccuracy / Good / Excellent / Best. Eval is always from the current player's perspective — `parseEvalData()` handles sign flipping.

### Stockfish Integration

Runs in a Web Worker (`engine/stockfish-18-lite-single.js` + `.wasm`). The lite single-thread build is used for mobile compatibility. Eval rendering is throttled at 100ms. `pvChess` is a reused Chess.js instance for PV → SAN conversion.

### Gemini Integration

- `gemini.js` sends board context (FEN, move, classification, eval drop) to `/api/analyze`
- Backend builds a Korean-language teacher persona prompt, streams Gemini 2.5 Flash response
- Client renders streamed markdown into the Gemini panel
- Results cached per `analysisQueue` entry — no repeat API calls for the same position

### Supabase Integration

- **현재:** `api/feedback.js`에서 피드백 저장용으로만 사용 (PostgREST REST API 직접 호출, SDK 미사용)
- **장기 계획:** vault(복기), saved games 데이터를 Supabase 백엔드로 전환 예정
- **전환 전략:** `storage.js`를 데이터 계층으로 유지 — 내부 구현을 localStorage → Supabase로 교체하면 vault.js, savedGames.js 등 소비자 코드는 수정 불필요

## Critical Constraints

- **Mobile-first, always.** Use `100dvh` for viewport height (iOS Safari fix). All interactive elements must be touch-friendly.
- **No npm dependencies on the frontend.** Chessground and Chess.js are loaded via CDN/static files. Do not introduce a build pipeline.
- **XSS prevention.** All user-supplied strings (username, PGN content) must go through `escapeHtml()` before DOM insertion.
- **Gemini API key must never reach the client.** All Gemini calls go through `api/analyze.js`.
- **localStorage operations must be wrapped in try/catch** — storage can be unavailable (private browsing, quota exceeded).
- **UI is Korean-language.** Button labels, prompts, and AI explanations are in Korean.
