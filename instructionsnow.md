Refactor the moves overlay into a shared reusable component.

1. Extract the moves overlay into a single shared component/function
   called something like "showMovesOverlay(moves)" that can be called
   from any screen.

2. Add the ☰ moves button to the manual input screen top bar
   (right side, same style as analysis screen).
   Tapping it calls the same shared overlay with current moves.

3. Add a PGN download button inside the moves overlay header:
   - Place it between the title and the ✕ close button
   - Label: "PGN" or download icon
   - font-size: 12px, color: var(--ac)
   - On tap: generate PGN string from current moves,
     download as "blundermate.pgn" text file

   Download logic:
   const blob = new Blob([pgnString], { type: 'text/plain' })
   const url = URL.createObjectURL(blob)
   const a = document.createElement('a')
   a.href = url
   a.download = 'blundermate.pgn'
   a.click()

Do not rebuild the overlay UI — reuse whatever currently exists
in the analysis screen. Only share it and add the download button.