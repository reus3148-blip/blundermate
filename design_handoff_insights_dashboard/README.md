# Insights Dashboard — Implementation Handoff

> Target variant: **B-A (Segmented Tabs)** — single chosen direction.
> Stack assumption: **Pure ES6 + CSS** (no framework, no build pipeline assumed).
> Reference React/JSX in `reference/` is **prototype-only**. Do not port the JSX literally — re-implement in your existing component pattern.

---

## 0 · What this is

A redesigned BadukMate-style **Insights** screen for the chess.com client. The current screen is a long single-column scroll. This handoff replaces it with:

1. **A scope/period selector pinned at the top** (carried over from existing UX — not redesigned here).
2. **A pill-shaped segmented tab bar** (4 tabs) directly below the header.
3. **The active tab swaps the entire scroll body.** Inactive tabs are not in the DOM.
4. **11 cards total**, distributed across the 4 tabs (3 / 2 / 4 / 2).

Why this layout:

- Each tab fits in roughly 1–1.5 phone screens of scroll → users see the whole group without losing context.
- The tab labels themselves are an information hierarchy: **요약 → 결과 → 오프닝 → 패턴**.
- Aggressive scroll reduction vs. the "one giant scroll" baseline.

D (sticky summary + tabs) and C (accordion) were evaluated and **dropped**. Only B-A ships.

---

## 1 · Data source — chess.com public API only

Everything renders from the **free** chess.com public API. No Stockfish, no engine analysis, no premium endpoints.

**Primary endpoints:**

| Endpoint | Use |
|---|---|
| `GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}` | Per-month archive of finished games. Loop the last N months. |
| `GET https://api.chess.com/pub/player/{username}/games/archives` | List of available month URLs (paginate from this). |
| `GET https://api.chess.com/pub/player/{username}/stats` | Current ratings (rapid/blitz/bullet) + best ratings + W-D-L lifetime totals. |
| `GET https://api.chess.com/pub/player/{username}` | Profile (avatar, country, joined). |

**Per-game fields used** (from the `games[]` array of the monthly archive):

```
white.username, white.rating, white.result          // 'win' | 'checkmated' | 'timeout' | 'resigned' | 'agreed' | 'stalemate' | 'repetition' | 'insufficient' | 'abandoned' | '50move' | 'kingofthehill' | 'threecheck' | 'bughousepartnerlose' | 'timevsinsufficient'
black.username, black.rating, black.result
time_control                                         // e.g. "600", "180+2", "1/86400"
time_class                                           // 'rapid' | 'blitz' | 'bullet' | 'daily'
end_time                                             // unix seconds — used for date / hour-of-day
pgn                                                  // multi-line PGN; parse for ECO, Opening header, move count, first move
rules                                                // expect 'chess'; skip variants
rated                                                // boolean — filter to rated only for rating-based stats
```

**Critical: do NOT use any field that requires engine evaluation.** No `accuracies`, no per-move quality, no centipawn loss, no review. The dashboard is intentionally engine-free.

**Caching:** The `/games/{YYYY}/{MM}` endpoints honor `Last-Modified` / `ETag`. Cache aggressively — only the current month changes.

---

## 2 · The 4 tabs and their 11 cards

Tab IDs are stable strings; use them in URLs / state.

### Tab 1 · `summary` ("요약")
1. **KPI grid** (6 tiles) — current rapid rating, total games (period), win-rate %, current win streak, avg game length (moves), review streak (days).
2. **Recent 20 games ribbon** — color-coded W/D/L squares, oldest → newest, fade older.
3. **Rating multi-line chart** — 12 weeks. Rapid (bold), Blitz (regular), Bullet (dashed).

### Tab 2 · `results` ("결과")
4. **Results breakdown** — donut: Win/Draw/Loss + side donut: end-reason (resignation / checkmate / timeout / agreement / abandon / stalemate / 50-move).
5. **By color** — horizontal stack bars: White W-D-L vs Black W-D-L, with win-rate % per side.

### Tab 3 · `openings` ("오프닝")
6. **vs Opponent rating bands** — bars for buckets `[-200, -100, ±50, +100, +200, +200+]`, score % per band, 50% balance line.
7. **Time control table** — rows = Rapid/Blitz/Bullet/Daily, cols = games / W-D-L / win-rate / avg moves.
8. **Top openings table** — rows by ECO code (e.g. `B40` Sicilian, `D02` London, `B12` Caro-Kann), cols = games / win-rate / avg moves.
9. **First-move distribution** — when **playing White**: 1.e4 / 1.d4 / 1.Nf3 / 1.c4 / other %. When **facing White**: same buckets for opponent's first move. Show both as paired bar groups.

### Tab 4 · `patterns` ("패턴")
10. **Win-rate by game length** — bars for `<20 / 20–30 / 30–40 / 40–60 / 60+` moves.
11. **Time-of-day heatmap** — 7 days × 24 hours, cell shade = **game count volume** (not accuracy). Use `end_time` in user's local timezone.

> The current prototype uses Korean labels by default. English labels exist in the reference; pass them through whatever i18n you already have.

---

## 3 · Visual spec — the segmented tab bar

This is the one component the prototype gets right and you should match closely. The buttons in the rest of the app aren't a great reference; this pill bar is the new pattern.

```
┌──────────────────────────────────────────────────────┐
│  [ 요약 ] [  결과  ] [ 오프닝 ] [ 패턴 ]              │   ← pill container
└──────────────────────────────────────────────────────┘
   ^ active                    ^ inactive
```

- **Outer container:** flex row, full width, `padding: 3px`, `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: 999px`. Sits in a `padding: 12px 14px` wrapper on the page background.
- **Each tab button:** `flex: 1` (equal width), `padding: 8px 10px`, `border-radius: 999px`, `border: none`, `font-size: 12px`, `letter-spacing: -0.01em`.
- **Active state:** `background: var(--ink)` (near-black), `color: var(--surface)` (off-white), `font-weight: 600`.
- **Inactive state:** `background: transparent`, `color: var(--text-2)`, `font-weight: 500`.
- **Transition:** `background .15s, color .15s` only. No transform, no shadow.
- **Hover** (desktop): inactive tab gets `color: var(--ink)`. Active tab unchanged.
- **Focus-visible:** 2px outline using accent token, offset 2px.
- **Touch target:** the button height ends up ~32–36px which is below 44pt; the **3px padding on the container** plus the natural tap area extending into the wrapper compensates. Verify on device.

There are exactly **4 tabs**; do not let it grow to 5+ without re-thinking layout (labels start truncating).

---

## 4 · Page structure

```
<header>             ← chess.com global header (existing, untouched)
  scope/period selector  (existing component — keep)
</header>

<nav class="insights-tabs">
  <button data-tab="summary"  aria-selected="true">요약</button>
  <button data-tab="results"  aria-selected="false">결과</button>
  <button data-tab="openings" aria-selected="false">오프닝</button>
  <button data-tab="patterns" aria-selected="false">패턴</button>
</nav>

<main class="insights-body">
  <!-- only the active tab's cards are mounted -->
</main>

<footer>             ← chess.com bottom nav (existing, untouched)
</footer>
```

- The tab bar is **not sticky**. It scrolls away with the body. (We tested sticky-on-scroll; it competes with the global header for vertical real estate. Skip it unless QA says otherwise.)
- The `<main>` is the only scroll container. Reset its scroll position to `0` on tab change.

---

## 5 · Routing — your call

The prototype uses in-memory React state for the active tab. **You decide** based on what the rest of the chess.com client already does:

- If insights URLs are already deep-linkable (e.g. `/member/{user}/insights`), make tabs append a hash (`#summary`, `#results`, …) or a query param (`?tab=summary`). Read on mount, write on change. This makes "open in new tab" work and lets us link directly to a section from elsewhere.
- If the surrounding app is purely in-memory, match it — don't introduce a routing dependency just for this screen.
- If there's an existing tab/segmented-control pattern elsewhere in the codebase (e.g. on the Profile page), **use that and ignore everything in section 3** except the visual specifics.

Default tab = `summary`. Unknown / malformed tab in URL → fall back to `summary` silently.

---

## 6 · CSS tokens

Keep these in your existing token file. Names match what the rest of the chess.com client probably already exposes; rename to fit your conventions.

```css
:root {
  /* surfaces */
  --bg:        #f6f5f1;   /* page background — warm off-white */
  --surface:   #ffffff;   /* card background */
  --ink:       #1a1a1a;   /* primary text + active pill bg */
  --text-2:    #555555;   /* secondary text */
  --text-3:    #888888;   /* tertiary / metadata */
  --border:    #e8e6e0;   /* hairlines between cards, around pill */

  /* result semantics — used in donuts, ribbons, stack bars, by-color */
  --win:       #4a7c59;   /* sober green */
  --draw:      #b8a06a;   /* warm tan */
  --loss:      #b04a4a;   /* sober red */

  /* accent — sparingly: KPI deltas, heatmap top end */
  --accent:    #769656;   /* chess.com board green works fine */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:      #1a1a1a;
    --surface: #262626;
    --ink:     #f0f0f0;
    --text-2:  #aaaaaa;
    --text-3:  #777777;
    --border:  #333333;
  }
}
```

Do **not** use multi-stop gradients on cards. Flat fills only. The prototype briefly experimented with gradient KPI tiles — they scored worst in review.

---

## 7 · Charts

The prototype hand-rolls SVG. For production:

- **If chess.com already uses a chart library** (Chart.js, ApexCharts, ECharts, Highcharts, raw D3 — check first), use it. Don't fork the visual exactly; match the library's defaults and tweak colors via the tokens above.
- **If not**, hand-rolled SVG is fine — these charts are simple (lines, bars, donut, heatmap grid). Avoid bringing in a 50KB library for 5 small charts.

**Per-chart notes:**

- **Rating multi-line:** 12 weekly samples, 3 series. Use rating value at the *last* rated game of each week per `time_class`. If a week has zero games in a class, hold the prior value (no gaps).
- **Donuts:** stroke-based, no labels inside the ring. Legend below.
- **Heatmap:** 7×24 grid, single-hue scale (`--accent` at top, `--surface` at bottom). Empty cell = `--surface`. Tooltip on hover with day/hour/count.
- **Stack bars (by-color):** 100% stacked horizontal; W/D/L segments left-to-right. Show win-rate % to the right of the bar.
- **Tabular numerics:** all numeric columns and KPI values use `font-variant-numeric: tabular-nums` and a mono fallback like `IBM Plex Mono` if available, otherwise the system mono.

---

## 8 · States to implement

| State | Behavior |
|---|---|
| **Loading** | Skeleton cards (gray rectangles at correct heights) — do not block tab switching. |
| **Empty** (period has 0 games) | Single message card per tab: "이 기간에는 게임이 없습니다." Don't render zero-state charts. |
| **API error** | Inline retry banner above tabs. Tabs still switchable; cards show "데이터를 불러오지 못했습니다 · 다시 시도" with a retry link. |
| **Partial** (some months loaded) | Render with what you have; show a small "업데이트 중…" pill in the header. |

---

## 9 · `reference/` — what's in it

Prototype source. Read for **logic and labels only**, not for code structure.

| File | What to read it for |
|---|---|
| `Insights Variants.html` | Page shell — ignore. Just the entry point. |
| `variant-b-shells.jsx` | The `BMInsightsB_A` component — this is the chosen variant. ~60 lines. The pill bar CSS values come from here. |
| `variant-b-cards.jsx` | All 11 card components + the `getGroups()` function that defines tab→cards mapping. Ground truth for **what data each card needs**. |
| `_shared.jsx` | Mock data shape (`window.BMInsightsData`). Use this as a **reference data contract** — your real data layer should produce something equivalent before passing to renderers. |
| `variant-a.jsx` | Older "single scroll" variant. Not shipping. Read only if you want to see what was rejected. |
| `design-canvas.jsx`, `tweaks-panel.jsx` | Prototype scaffolding (canvas + tweak panel). Discard entirely. |

The reference uses React 18 via UMD + Babel-standalone in the browser. **None of that ships.** Strip it.

---

## 10 · Out of scope (don't build)

- **Filters / scope picker** — keep the existing one above the tabs. We didn't redesign it.
- **Engine analysis** — explicitly excluded. If product wants accuracy stats later, that's a separate spec.
- **Sharing / export** — not in this round.
- **Premium gating** — everything here is free-tier data.
- **Animations** — beyond the 150ms color crossfade on the active pill, no motion. The data should feel like it's already there when the tab is tapped.

---

## 11 · Open questions for the implementer

1. Does the chess.com client already have a tab/segmented-control component? If yes, use it and discard section 3.
2. What's the period selector's contract? (How does it expose "give me the games from X to Y"?) The cards need a uniform `(games[], stats)` input.
3. Confirm timezone handling for the heatmap — display in user's local TZ, not server UTC.
4. Confirm dark-mode behavior matches the rest of the app (system-pref vs. explicit toggle).

Ping the design owner with answers; the spec adapts cheaply.
