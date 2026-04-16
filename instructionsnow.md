Add recent games list to home screen when user_id exists.

## Placement
Between the search input and the 보관함 divider.
Only show when localStorage "blundermate_user_id" exists.

## Data loading
On home screen load, if user_id exists:
- Fetch games using existing Chess.com API function
- Use stored user_id as username
- Load 10 most recent games
- Show loading state while fetching
- If fetch fails: show nothing (no error message to user)

## Loading state
Show 3 skeleton cards while loading:
  height: 64px, border-radius: 8px
  background: var(--bg-surface)
  opacity: 0.5
  gap: 8px

## Game card UI
Each card (height: 64px, padding: 0 14px):
  background: var(--bg-surface)
  border: 1px solid var(--brd)
  border-radius: 8px
  display: flex, align-items: center, gap: 12px

Left side:
  Result indicator (width 4px, height 32px, border-radius 2px):
  - Win:  background var(--best)
  - Loss: background var(--blunder)
  - Draw: background var(--tx3)

Center (flex: 1):
  Top row: "vs {opponent}" font-size 13px, font-weight 600, color var(--tx)
  Bottom row: date · move count · time control
    font-size 11px, color var(--tx2)

Right side:
  Result text: "승" / "W" · "패" / "L" · "무" / "D"
  font-size 12px, font-weight 700
  color: var(--best) / var(--blunder) / var(--tx3)

## Section label above cards
"최근 게임" / "Recent games"
font-size: 11px, font-weight: 700
letter-spacing: 0.06em, color: var(--tx3)
margin-bottom: 8px

## On card tap
Navigate to analysis screen with that game.
Same behavior as existing game list.

## i18n
ko.js:
  home_recent_games: "최근 게임"
  game_result_win: "승"
  game_result_loss: "패"
  game_result_draw: "무"

en.js:
  home_recent_games: "Recent games"
  game_result_win: "W"
  game_result_loss: "L"
  game_result_draw: "D"

Do not change existing game loading logic.
Reuse existing Chess.com API fetch function.
Only add the display layer on home screen.