Add a toggle between win percentage and eval score in the bottom bar.

The win% element becomes tappable. Tapping switches between two display modes.
Store the preference in localStorage key "evalDisplayMode" ('percent' or 'score').

Mode 1 — percent (default): "43%"
Mode 2 — score: "−3.2" (use − not -, format to 1 decimal place, show + for positive)

On tap:
- Toggle the mode
- Animate the switch: opacity 0 → value change → opacity 1, duration 150ms

Style stays identical in both modes:
- font-family: IBM Plex Mono
- font-size: 14px, font-weight: 700
- width: 44px, text-align: center, flex-shrink: 0
- Color logic same as before (--best if favorable, --blunder if unfavorable, --tx2 if neutral)

No other changes to the bar layout or behavior.