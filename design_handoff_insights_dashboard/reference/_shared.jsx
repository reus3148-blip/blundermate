// Shared data + chart primitives for the Insights variants.
// IMPORTANT: This data set is restricted to what's derivable from the chess.com
// public-games API alone — NO Stockfish analysis. So:
//   ✓ Result, opponent rating, time control, ECO/opening, timestamp, termination
//   ✗ Accuracy %, move classifications, phase quality
// Tone: calm, quantitative.

const BMInsightsData = (kor = true) => ({
  user: { name: 'reus', rating: 1812, delta: +18 },

  // Headline counts (last 30d)
  summary: {
    games: 134,
    wins: 75, draws: 19, losses: 40,
    winRate: 56, drawRate: 14, lossRate: 30,
    bestStreak: 6,        // longest win streak
    currentStreak: { kind: 'w', n: 4 },  // current run
    reviewStreak: 12,     // consecutive days reviewing
    avgGameMoves: 38,
    avgGameMinutes: 9.4,
  },

  // 12-week rating history per time control
  rating: {
    rapid: [1758, 1764, 1772, 1768, 1779, 1785, 1782, 1790, 1798, 1804, 1808, 1812],
    blitz: [1654, 1662, 1670, 1665, 1671, 1684, 1690, 1685, 1692, 1700, 1708, 1714],
    bullet:[1490, 1498, 1505, 1500, 1512, 1520, 1518, 1525, 1530, 1540, 1548, 1556],
    peak: 1812,
  },

  // Time control distribution (30d)
  tc: [
    { name: 'Rapid 10+0',  games: 78, win: 48, draw: 10, loss: 20 },
    { name: 'Blitz 5+0',   games: 38, win: 20, draw: 6,  loss: 12 },
    { name: 'Bullet 1+0',  games: 12, win: 5,  draw: 2,  loss: 5  },
    { name: 'Daily',       games: 6,  win: 2,  draw: 1,  loss: 3  },
  ],

  // Color split
  byColor: {
    white: { games: 68, win: 41, draw: 9,  loss: 18, winRate: 60 },
    black: { games: 66, win: 34, draw: 10, loss: 22, winRate: 52 },
  },

  // Openings — derived from ECO codes / opening_name in chess.com API
  openings: [
    { name: kor ? '시실리안 디펜스' : 'Sicilian Defense', eco: 'B40', side: 'B', games: 14, win: 9, draw: 1, loss: 4 },
    { name: kor ? '런던 시스템' : 'London System',        eco: 'D02', side: 'W', games: 12, win: 4, draw: 2, loss: 6 },
    { name: kor ? '카로칸' : 'Caro-Kann',                 eco: 'B12', side: 'B', games: 9,  win: 4, draw: 2, loss: 3 },
    { name: kor ? '루이 로페즈' : 'Ruy Lopez',            eco: 'C65', side: 'W', games: 8,  win: 5, draw: 1, loss: 2 },
    { name: kor ? '이탈리안' : 'Italian Game',            eco: 'C50', side: 'W', games: 7,  win: 4, draw: 1, loss: 2 },
    { name: kor ? '프렌치' : 'French Defense',            eco: 'C00', side: 'B', games: 6,  win: 2, draw: 1, loss: 3 },
  ],

  // Termination reasons (chess.com provides this)
  termination: [
    { key: 'resign',    label: kor ? '기권' : 'Resign',     n: 58, color: '#62646A' },
    { key: 'mate',      label: kor ? '체크메이트' : 'Checkmate', n: 28, color: '#14140F' },
    { key: 'timeout',   label: kor ? '시간승' : 'Timeout',  n: 22, color: '#D97706' },
    { key: 'agreed',    label: kor ? '합의' : 'Agreed',     n: 12, color: '#9A9CA3' },
    { key: 'repetition',label: kor ? '반복수' : 'Repetition', n: 7,color: '#C7C9CE' },
    { key: 'abandon',   label: kor ? '포기' : 'Abandoned',  n: 4,  color: '#D03832' },
    { key: 'stalemate', label: kor ? '스테일메이트' : 'Stalemate', n: 3, color: '#C99B2D' },
  ],

  // Performance by opponent rating bucket (relative to user's 1812)
  vsRating: [
    { bucket: '−200+', games: 14, win: 12, draw: 1, loss: 1, score: 89 },   // much weaker
    { bucket: '−100',  games: 28, win: 21, draw: 3, loss: 4, score: 80 },
    { bucket: '±50',   games: 42, win: 21, draw: 8, loss: 13, score: 60 },  // even
    { bucket: '+100',  games: 32, win: 14, draw: 5, loss: 13, score: 51 },
    { bucket: '+200',  games: 14, win: 6,  draw: 2, loss: 6,  score: 50 },
    { bucket: '+200+', games: 4,  win: 1,  draw: 0, loss: 3,  score: 25 },  // much stronger
  ],

  // First move distribution (from PGN move 1)
  firstMove: {
    asWhite: [
      { move: '1.e4',  games: 38, winRate: 63 },
      { move: '1.d4',  games: 18, winRate: 56 },
      { move: '1.Nf3', games: 8,  winRate: 50 },
      { move: '1.c4',  games: 4,  winRate: 50 },
    ],
    asBlack: [
      { move: '1.e4',  games: 41, winRate: 49 },
      { move: '1.d4',  games: 16, winRate: 56 },
      { move: '1.Nf3', games: 6,  winRate: 67 },
      { move: '1.c4',  games: 3,  winRate: 33 },
    ],
  },

  // Day × hour heatmap — VOLUME (games played), not accuracy.
  // rows = Mon..Sun, cols = 0–4, 4–8, 8–12, 12–16, 16–20, 20–24
  volumeHeat: [
    [0, 0, 1, 4, 6, 8],   // Mon
    [0, 0, 2, 3, 5, 7],   // Tue
    [0, 0, 1, 2, 4, 9],   // Wed
    [0, 0, 1, 4, 7, 6],   // Thu
    [1, 0, 0, 3, 5, 11],  // Fri
    [2, 1, 3, 6, 8, 7],   // Sat
    [1, 2, 4, 7, 5, 4],   // Sun
  ],

  // Win-rate heatmap by day × hour (only computed where ≥3 games)
  winRateHeat: [
    [null, null, null, 75, 67, 50],   // Mon
    [null, null, null, 67, 60, 57],
    [null, null, null, null, 75, 56],
    [null, null, null, 75, 71, 50],
    [null, null, null, 67, 60, 55],
    [null, null, 67, 67, 63, 57],
    [null, null, 75, 71, 60, 50],     // Sun
  ],

  // 14-day W/D/L for stacked bars
  results14: [
    {w:1,d:0,l:0},{w:1,d:0,l:1},{w:0,d:1,l:0},{w:2,d:0,l:0},{w:1,d:0,l:1},
    {w:0,d:0,l:1},{w:1,d:0,l:0},{w:2,d:0,l:1},{w:1,d:1,l:0},{w:0,d:0,l:1},
    {w:1,d:0,l:0},{w:1,d:1,l:0},{w:2,d:0,l:0},{w:1,d:0,l:1},
  ],

  // Last 20 results — for streak ribbon (newest right)
  ribbon: ['l','w','w','l','w','d','w','l','l','w','w','w','d','l','w','w','w','l','w','w'],

  // Game-length distribution (move count buckets)
  lengthDist: [
    { bucket: '<20',  games: 8,  winRate: 35 },
    { bucket: '20-30',games: 26, winRate: 42 },
    { bucket: '30-40',games: 44, winRate: 58 },
    { bucket: '40-60',games: 38, winRate: 64 },
    { bucket: '60+',  games: 18, winRate: 67 },
  ],
});

window.BMInsightsData = BMInsightsData;

// ──────────────────────────────────────────────────────────────────────
// Chart primitives — calm, all SVG.
// ──────────────────────────────────────────────────────────────────────

function LineChart({
  data, w = 300, h = 80, color = '#14140F', area = true,
  min, max, baseline = null, showLast = true, dim = 0.85,
  strokeWidth = 1.5, padTop = 6, padBottom = 4,
}) {
  const lo = min !== undefined ? min : Math.min(...data) - 2;
  const hi = max !== undefined ? max : Math.max(...data) + 2;
  const range = hi - lo || 1;
  const inner = h - padTop - padBottom;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = padTop + (1 - (v - lo) / range) * inner;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${path} L${w},${h} L0,${h} Z`;
  const last = pts[pts.length - 1];
  const baseY = baseline != null ? padTop + (1 - (baseline - lo) / range) * inner : null;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {area && <path d={areaPath} fill={color} opacity={0.08} />}
      {baseY != null && (
        <line x1="0" y1={baseY} x2={w} y2={baseY}
              stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.35" />
      )}
      <path d={path} fill="none" stroke={color}
            strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" opacity={dim} />
      {showLast && (
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="#fff" stroke={color} strokeWidth="1.5" />
      )}
    </svg>
  );
}

// Multi-line chart for rating per time control
function MultiLine({ series, w = 320, h = 96, padTop = 6, padBottom = 4 }) {
  const all = series.flatMap(s => s.data);
  const lo = Math.min(...all) - 5;
  const hi = Math.max(...all) + 5;
  const range = hi - lo || 1;
  const inner = h - padTop - padBottom;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {series.map((s, idx) => {
        const pts = s.data.map((v, i) => {
          const x = (i / (s.data.length - 1)) * w;
          const y = padTop + (1 - (v - lo) / range) * inner;
          return `${i === 0 ? 'M' : 'L'}${x},${y}`;
        }).join(' ');
        return (
          <path key={idx} d={pts} fill="none" stroke={s.color}
                strokeWidth={s.bold ? 1.75 : 1.25}
                strokeLinejoin="round" strokeLinecap="round"
                opacity={s.bold ? 1 : 0.7}
                strokeDasharray={s.dashed ? '3 3' : 'none'} />
        );
      })}
    </svg>
  );
}

function Donut({ items, size = 140, thickness = 16, center = null, gap = 1.5 }) {
  const total = items.reduce((s, i) => s + i.n, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(28,29,31,.06)" strokeWidth={thickness} />
      <g transform={`rotate(-90 ${c} ${c})`}>
        {items.map((it, idx) => {
          const frac = it.n / total;
          const len = frac * circ;
          const dasharray = `${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`;
          const offset = -acc * circ;
          acc += frac;
          return (
            <circle key={idx} cx={c} cy={c} r={r} fill="none"
                    stroke={it.color} strokeWidth={thickness}
                    strokeDasharray={dasharray} strokeDashoffset={offset} />
          );
        })}
      </g>
      {center && (
        <foreignObject x="0" y="0" width={size} height={size}>
          <div style={{
            width: size, height: size, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif",
          }}>{center}</div>
        </foreignObject>
      )}
    </svg>
  );
}

function StackBar({ segments, w = 220, h = 8, gap = 0, radius = 4 }) {
  const total = segments.reduce((s, x) => s + x.n, 0) || 1;
  let xAcc = 0;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
         style={{ display: 'block', borderRadius: radius, overflow: 'hidden' }}>
      {segments.map((s, i) => {
        const sw = (s.n / total) * w;
        const x = xAcc;
        xAcc += sw;
        return <rect key={i} x={x} y="0" width={sw - gap} height={h} fill={s.color} />;
      })}
    </svg>
  );
}

// Day × time heatmap — shows volume (count) with optional secondary value (winRate).
function VolumeHeat({ rows, days, hours, max }) {
  const flat = rows.flat();
  const m = max != null ? max : Math.max(...flat, 1);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${hours.length}, 1fr)`, gap: 3 }}>
      <div></div>
      {hours.map((h, i) => (
        <div key={i} style={{ fontSize: 9, color: '#9A9CA3', textAlign: 'center',
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontVariantNumeric: 'tabular-nums' }}>{h}</div>
      ))}
      {rows.map((row, ri) => (
        <React.Fragment key={ri}>
          <div style={{ fontSize: 10, color: '#62646A', display: 'flex', alignItems: 'center' }}>{days[ri]}</div>
          {row.map((v, ci) => {
            const t = v / m;
            const empty = !v;
            return (
              <div key={ci} style={{
                aspectRatio: '1',
                background: empty ? 'rgba(28,29,31,.04)' : `rgba(43,91,215,${0.10 + t * 0.7})`,
                borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 600,
                color: empty ? 'transparent' : (t > 0.55 ? '#fff' : '#1C1D1F'),
                fontVariantNumeric: 'tabular-nums',
              }}>{empty ? '' : v}</div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

window.BMCharts = { LineChart, MultiLine, Donut, StackBar, VolumeHeat };
