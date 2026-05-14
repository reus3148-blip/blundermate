# blundermate Codex Guide

Codex entrypoint for this repo. Keep this file short. The current product map lives in [CURRENT.md](CURRENT.md); history lives in [WORKLOG.md](WORKLOG.md).

## Read Order

1. Read [CURRENT.md](CURRENT.md) first.
2. Read this file for invariants.
3. Open [TESTING.md](TESTING.md) before/after analysis, board, vault, or navigation changes.
4. Open [supabase-schema.md](supabase-schema.md) for DB work and [OPERATIONS.md](OPERATIONS.md) for production/logging decisions.
5. Use [WORKLOG.md](WORKLOG.md) only for historical context. Prefer `rg` and `git log` over reading the whole file.

## Product

Blundermate is a mobile-first chess review web app for Korean users. Core loop:

`chess.com / lichess / PGN game import -> Stockfish analysis -> mobile review UI -> automatic Vault puzzle collection -> optional Gemini Korean explanation`

The wedge is not replacing chess.com or lichess on desktop. It is making mobile game review feel fast, readable, and Korean-friendly.

## Non-Negotiable Invariants

- Mobile first. Main app container uses `100dvh`; desktop is constrained to 9:16 with `width: min(100vw, calc(100dvh * 9 / 16))`.
- UI text must go through `t(key)` in [strings.js](strings.js). No new hardcoded Korean/English screen text.
- Pure ES modules, no frontend build step, no frontend npm dependency, no `package.json`.
- Chessground is CDN/global, Chess.js is jsDelivr ESM `chess.js@1.4.0/+esm`, Stockfish is static under [engine/](engine/).
- Gemini key is server-only. Client calls [api/analyze.js](api/analyze.js); current code reads `process.env.GEMINI_API_KEY`.
- User input, external usernames, PGN headers, and API text that enters HTML must pass `escapeHtml()` unless safely assigned with `textContent`.
- `localStorage.getItem/setItem` must be wrapped by `lsGet/lsSet` or higher-level accessors in [storage.js](storage.js). Exceptions: [index.html](index.html) FOUC inline script and wrapper definitions inside [storage.js](storage.js).
- Persistent user data is isolated by `(user_id, platform)` where platform is `chesscom` or `lichess`. Local cache lookups also need platform filtering.
- `user_id` is lowercased at both client and server entry points.
- OS `alert/confirm/prompt` are banned. Use [dialogs.js](dialogs.js) `showToast/showAlert/showConfirm`.
- `utils.js` chess-classification helpers include freechess-derived logic. Avoid algorithmic rewrites unless the task explicitly targets them.

## Architecture Map

- [main.js](main.js): SPA shell and largest controller. Navigation, analysis view, branch/sim/live modes, overlays, review mode, eval bar, bottom bar.
- [modes.js](modes.js), [board.js](board.js), [analysis.js](analysis.js): mode state, board state, analysis queue/batch orchestration.
- [engine.js](engine.js): Stockfish worker wrapper and worker pool. Failed pool workers are retired.
- [storage.js](storage.js): Supabase proxy client, safe localStorage fallback, `(user_id, platform)` isolation, DB circuit breaker.
- [home.js](home.js): onboarding, profile card, recent game list, mini boards, time-class filter.
- [vault.js](vault.js), [autoBlunders.js](autoBlunders.js): automatic blunder/mate collection and review puzzle UI.
- [savedGames.js](savedGames.js): explicit game saves.
- [insights.js](insights.js): stats dashboard.
- [forum.js](forum.js), [api/forum.js](api/forum.js): opening forum deep links and comments.
- [gemini.js](gemini.js), [api/analyze.js](api/analyze.js): Gemini streaming explanation path.
- [api/db.js](api/db.js): whitelisted CRUD proxy for `vault_items`, `saved_games`, `analyzed_games`.

## Known Gaps

- No automated test suite. Manual regression is [TESTING.md](TESTING.md).
- API rate limit is still 0. Public anonymous POST endpoints exist.
- Gemini markdown rendering uses `marked` without DOMPurify.
- Supabase RLS is not enabled for core app data tables; Edge Functions enforce guards. Treat anon-key exposure as a serious risk.
- `main.js`, [styles.css](styles.css), [index.html](index.html), [insights.js](insights.js), and [vault.js](vault.js) are large. Prefer scoped edits over broad rewrites.
- [EnginePool.destroy()](engine.js) exists but is not wired to an app unmount lifecycle.

## Working Rules

- Code is the truth source. If docs disagree with code, trust code and update docs.
- Before edits, inspect the relevant module and nearest existing pattern.
- Keep changes small and sympathetic to the current no-build architecture.
- For big UI/analysis changes, run the relevant [TESTING.md](TESTING.md) flow manually or state what was not verified.
- Do not commit, stage, or push unless explicitly asked.
- Update [CURRENT.md](CURRENT.md) when product priorities, launch plans, or operating numbers materially change.
