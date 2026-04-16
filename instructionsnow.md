Adjust home screen spacing.

The main content area between the input section and the
library rows is too tall when empty.

Change the spacer/gap between "PGN 붙여넣기" link and
the 복기 row:
- min-height: 32px
- max-height: 80px  
- flex: 1

This way:
- When game list appears below the input: space compresses naturally
- When empty: library rows sit closer to the input section,
  not pushed to the very bottom

Also add a section label above the library rows:
"보관함" / "Archive"
font-size: 11px, font-weight: 700, letter-spacing: 0.06em
color: var(--tx3), padding: 0 16px, margin-bottom: 4px