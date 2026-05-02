// Mini chess board — SVG renderer that draws from a board map.
// Designed for thumbnails (60-200px). Pieces are simple Unicode glyphs at first;
// for richer fidelity we draw filled silhouettes via path data.
//
// Usage:  <BMMiniBoard fen="..." size={120} highlight={['e4','d5']} />
// Or pass a 64-cell array of {p:'wK'|'bN'|...|null}.

const PIECE_GLYPH = {
  wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659',
  bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F',
};

// Parse a tiny FEN-like string ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")
function parseFen(fen) {
  const rows = (fen || '').split(' ')[0].split('/');
  const out = [];
  for (let r = 0; r < 8; r++) {
    const row = rows[r] || '8';
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        for (let i = 0; i < parseInt(ch); i++) out.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const piece = ch.toUpperCase();
        out.push(color + piece);
      }
    }
  }
  while (out.length < 64) out.push(null);
  return out;
}

const FILES = ['a','b','c','d','e','f','g','h'];
function squareToIdx(sq) {
  const f = FILES.indexOf(sq[0]);
  const r = 8 - parseInt(sq[1]);
  return r * 8 + f;
}

const BMMiniBoard = ({ fen, size = 120, highlight = [], lastMove = null,
                       light = '#E8DCBF', dark = '#8C6840', flipped = false,
                       border = true, glow = null }) => {
  const cells = parseFen(fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
  const cellSize = size / 8;
  const hl = new Set(highlight.map(squareToIdx));
  const lm = lastMove ? new Set(lastMove.map(squareToIdx)) : new Set();

  return (
    <div style={{
      width: size, height: size, position: 'relative',
      borderRadius: 6, overflow: 'hidden',
      boxShadow: border ? '0 1px 2px rgba(0,0,0,.08), 0 0 0 0.5px rgba(0,0,0,.1)' : 'none',
      ...(glow ? { boxShadow: `0 0 0 2px ${glow}, 0 6px 18px ${glow}55` } : {}),
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
           style={{ display: 'block', fontFamily: 'serif' }}>
        {Array.from({ length: 64 }).map((_, i) => {
          const rIdx = flipped ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
          const fIdx = flipped ? 7 - (i % 8) : (i % 8);
          const isLight = (rIdx + fIdx) % 2 === 0;
          const x = (i % 8) * cellSize;
          const y = Math.floor(i / 8) * cellSize;
          const realIdx = rIdx * 8 + fIdx;
          const piece = cells[realIdx];
          const isHl = hl.has(realIdx);
          const isLm = lm.has(realIdx);
          return (
            <g key={i}>
              <rect x={x} y={y} width={cellSize} height={cellSize}
                    fill={isLight ? light : dark} />
              {isLm && (
                <rect x={x} y={y} width={cellSize} height={cellSize}
                      fill="rgba(43,91,215,.28)" />
              )}
              {isHl && (
                <rect x={x} y={y} width={cellSize} height={cellSize}
                      fill="rgba(208,56,50,.32)" />
              )}
              {piece && (
                <text x={x + cellSize / 2} y={y + cellSize / 2 + cellSize * 0.32}
                      textAnchor="middle"
                      fontSize={cellSize * 0.92}
                      fill={piece[0] === 'w' ? '#fafafa' : '#1c1d1f'}
                      stroke={piece[0] === 'w' ? '#1c1d1f' : 'none'}
                      strokeWidth={piece[0] === 'w' ? 0.8 : 0}
                      style={{ paintOrder: 'stroke fill' }}>
                  {PIECE_GLYPH[piece]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

window.BMMiniBoard = BMMiniBoard;
