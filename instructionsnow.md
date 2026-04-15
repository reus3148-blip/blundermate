Replace the "직접 입력" popup and "PGN 붙여넣기" popup with a single
full-screen input screen. Both buttons on the home screen navigate
to this same screen.

## Layout — must be identical to the analysis screen

Use the exact same layout structure as the analysis screen:
- Same top bar (height, padding, font)
- Same board size and position (100% width, aspect-ratio: 1)
- Same background colors and spacing

Top bar:
- Left: ← Back button
- Center: "수 입력"
- Right: ↺ Undo button (icon only, same style as other icon-btns)

Board:
- Identical size and styling to analysis screen board
- Click/tap to input moves (existing logic)
- Highlight last moved piece (existing logic)

Below board — PGN input area:
- background: var(--bg-surface)
- border-top: 1px solid var(--brd)
- padding: 12px 14px
- Textarea:
    width: 100%
    min-height: 80px
    background: var(--bg-elevated)
    border: 1px solid var(--brd2)
    border-radius: 8px
    padding: 10px 12px
    font-family: 'IBM Plex Mono', monospace
    font-size: 12px
    color: var(--tx)
    placeholder: "PGN을 붙여넣거나 보드에서 수를 입력하세요"
    resize: none

Two-way sync:
- Moving on board → PGN textarea updates automatically
- Pasting PGN into textarea → board updates to show final position

Bottom bar:
- Same height and style as analysis screen bottom bar
- Left: Undo button (text, same style as existing)
- Right: "분석 시작 →" button
    height: 44px, border-radius: 8px
    background: var(--ac), color: #100E0B
    font-size: 14px, font-weight: 700
    flex: 1, margin-left: 12px

## Remove
- Existing popup/modal for 직접 입력
- Existing popup/modal for PGN 붙여넣기
- Both now navigate to this full-screen instead

Do not change any existing move input or PGN parsing logic.
Only change the presentation layer.