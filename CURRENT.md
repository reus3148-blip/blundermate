# CURRENT

Codex should read this at the start of a session. Keep it current and short; detailed history belongs in [WORKLOG.md](WORKLOG.md).

## Product Snapshot

Blundermate is live at `blundermate.app`.

It is a mobile-first chess review app for users who find chess.com/lichess desktop analysis strong but mobile review clunky. The core loop is:

`choose/import game -> Stockfish analysis -> mobile review -> auto-save mistakes into Vault puzzles`

Current positioning: mobile game review first, Korean-friendly by default, chess.com-heavy in practice but supports chess.com, lichess, and PGN.

## Current Stage

- Public hobby project with real users.
- Domestic communities/open chat have been posted once; another domestic repost is planned around 2026-05-14/15.
- Vault polish is the next major product milestone.
- Reddit launch should wait until Vault first experience feels complete.

## Operating Numbers

Supabase anon-readable aggregate snapshot checked on 2026-05-14:

- `analyzed_games`: 1,437 total, 1,303 with `analysis_json`, 206 distinct users.
- Last 7 days: 573 analyzed games, 96 analyzed users.
- `vault_items`: 2,324 total, 2,301 auto, 195 users.
- `saved_games`: 51 total, 16 users.
- `feedbacks`: 13 total, 1 in last 7 days.
- `opening_comments`: 0.
- Platform skew: analysis is overwhelmingly chess.com (`1422 chesscom` vs `15 lichess` in the snapshot).

These numbers are for direction, not privacy-sensitive reporting. Avoid dumping raw PGNs/usernames in chat unless explicitly requested.

## Active Priorities

1. Preserve and polish the analysis flow: game selection -> preview/cache -> analysis -> review.
2. Finish Vault as the retention loop: auto-collected mistakes should feel like useful review puzzles, not hidden storage.
3. Add clearer analysis-complete messaging that Vault items were collected.
4. Improve operational safety before larger launches: rate limit, Gemini markdown sanitization, RLS/anon-key risk plan.
5. Prepare English copy and screenshots for Reddit after Vault is ready.

## Do Not Break

- `MAIN`, `EXPLORE`, `LIVE_INPUT`, `SIMULATE` mode flows.
- Branch analysis from dragging a new move on the review board.
- Engine-line simulation and line extension.
- Paste/PGN/FEN import cleanup from branch/live/sim states.
- Mobile 9:16 layout and touch target assumptions.
- Korean UI through `t(key)` with English fallback.
- No frontend npm/build step.
- `localStorage` safe wrapper and `(user_id, platform)` isolation.

## Product Voice

Not "I built a better chess.com." The honest wedge:

`I love chess.com and lichess on desktop, but mobile game review felt clunky, so I built a mobile-first review tool.`

For domestic reposts, ask users to try the analysis UI on mobile. Do not over-promote the forum. Mention Vault lightly until the first experience is polished.
