Change game loading behavior for both Chess.com game list
and Saved Games list.

## Current behavior (remove this)
Tapping a game immediately starts engine analysis.

## New behavior

Step 1 — Tapping a game opens the analysis screen
but does NOT start the engine.

Step 2 — Analysis screen shows a preview state:
- Board shows the opening position (move 1 or start)
- Bottom content area (where engine lines appear) shows game info:

  Game preview card (padding 16px, no border):
    - Title or "White vs Black" (font-size 16px, font-weight 700, color var(--tx))
    - Date · Move count · Opening name if available
      (font-size 12px, color var(--tx2), margin-top 4px)
    - "분석 시작" / "Start Analysis" button below:
        width 100%, height 48px, border-radius 8px
        background var(--ac), color #100E0B
        font-size 15px, font-weight 700
        margin-top 16px

Step 3 — Tapping "분석 시작" starts the engine
and transitions to normal analysis mode.
The preview card disappears and engine lines appear.

## Bottom bar in preview state
- ‹ › navigation disabled (grayed out, var(--tx3))
- Engine⇄ toggle disabled
- Save and AI buttons hidden
- Win% hidden, show "—" instead

## Apply to both
- Chess.com game list → analysis screen
- Saved Games list → analysis screen

## i18n
ko.js: analysis_start_btn: "분석 시작"
en.js: analysis_start_btn: "Start Analysis"

Do not change engine logic. Only change when it gets triggered.