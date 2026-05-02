// Shared sample data + utilities for all home variants.
// All variants pull from the same dataset so comparisons are fair.

const BMHomeData = (kor = true) => ({
  user: {
    name: 'reus',
    rating: 1812,
    tc: 'Rapid',
    delta: +18, // last session
  },
  // 15-game form strip (most recent on right)
  form: ['w','w','l','w','w','d','l','w','w','l','w','d','w','w','l'],

  // Coach insight — derived from last few games. The "must see" thing.
  insight: {
    kind: 'pattern', // pattern | repeated_blunder | streak | drop
    title: kor ? '같은 실수가 3번 반복됐어요' : 'Same mistake — 3 times this week',
    body: kor
      ? 'Caro-Kann에서 c4 푸시 타이밍을 놓치고 있어요. 어제·오늘 게임에서 같은 위치.'
      : 'You\'re missing the c4 break in the Caro-Kann. Same square in 3 games.',
    cta: kor ? '패턴 보기' : 'Review pattern',
    accent: '#D03832',
  },

  // Last finished game — the freshest, "tap to analyze"
  lastGame: {
    id: 0,
    result: 'loss',
    opponent: 'kimhana_kr',
    oppRating: 1855,
    tc: 'Rapid 10+0',
    when: kor ? '방금' : 'Just now',
    moves: 38,
    opening: kor ? '카로칸 디펜스' : 'Caro-Kann Defense',
    classification: { brilliant: 0, great: 1, mistake: 2, blunder: 1 },
    fen: '6k1/5ppp/8/8/3Q4/8/5PPP/6K1',
    lastMove: ['d1','d4'],
    accuracy: 78,
    oppAccuracy: 86,
    analyzed: false,
  },

  games: [
    {
      id: 1, result: 'win', opponent: 'magnusen2024', oppRating: 1842,
      tc: 'Rapid 10+0', ago: kor ? '오늘' : 'Today', moves: 47,
      opening: kor ? '시실리안' : 'Sicilian',
      classification: { brilliant: 1, great: 2, mistake: 1, blunder: 0 },
      fen: 'r4rk1/pp3ppp/2n2n2/3pq3/3P4/2N1P3/PP2BPPP/R2Q1RK1',
      lastMove: ['e2','b5'], accuracy: 91,
    },
    {
      id: 2, result: 'loss', opponent: 'kimhana_kr', oppRating: 1855,
      tc: 'Rapid 10+0', ago: kor ? '어제' : 'Yesterday', moves: 38,
      opening: kor ? '런던 시스템' : 'London',
      classification: { brilliant: 0, great: 0, mistake: 2, blunder: 1 },
      fen: '6k1/5ppp/8/8/3Q4/8/5PPP/6K1',
      lastMove: ['d1','d4'], accuracy: 74,
    },
    {
      id: 3, result: 'draw', opponent: 'chess_arc', oppRating: 1798,
      tc: 'Rapid 15+10', ago: kor ? '2일 전' : '2d', moves: 62,
      opening: kor ? '카로칸' : 'Caro-Kann',
      classification: { brilliant: 0, great: 1, mistake: 0, blunder: 0 },
      fen: '8/4k3/8/3pP3/3K4/8/8/8',
      lastMove: ['d4','d5'], accuracy: 84,
    },
    {
      id: 4, result: 'win', opponent: 'pawnstorm', oppRating: 1789,
      tc: 'Blitz 5+0', ago: kor ? '2일 전' : '2d', moves: 41,
      opening: kor ? '이탈리안' : 'Italian',
      classification: { brilliant: 0, great: 1, mistake: 1, blunder: 0 },
      fen: '2r3k1/5ppp/p7/1p6/3Q4/2P5/PP3PPP/6K1',
      lastMove: ['d1','d4'], accuracy: 88,
    },
  ],

  // Weakness training suggestion
  training: {
    title: kor ? '엔드게임 — 룩 vs 폰' : 'Endgame — R vs P',
    subtitle: kor ? '7개 퍼즐 · 약 8분' : '7 puzzles · ~8 min',
    why: kor ? '최근 약점' : 'Your weak spot',
  },
});

// ----- Shared visual atoms -----------------------------------------------

const resultColor = (r) => r === 'win' ? '#3A8560' : r === 'loss' ? '#D03832' : '#9A9CA3';
const resultLetter = (r, kor = true) =>
  r === 'win' ? (kor ? '승' : 'W') :
  r === 'loss' ? (kor ? '패' : 'L') :
                 (kor ? '무' : 'D');

// Small "form bar" — 15 vertical bars showing recent w/l/d.
const FormStrip = ({ form, h = 12 }) => (
  <span style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>
    {form.map((r, i) => {
      const c = r === 'w' ? '#3A8560' : r === 'l' ? '#D03832' : '#C7C9CE';
      return <span key={i} style={{
        width: 4, height: h, borderRadius: 1, background: c,
        opacity: 0.4 + (i / form.length) * 0.6,
      }}></span>;
    })}
  </span>
);

// Top bar variants ---------------------------------------------------------

const HomeTopBar = ({ kor = true, showWordmark = true, rightSlot = null }) => {
  const { IconSettings, IconSearch } = window.BMIcons;
  const topbarBtn = {
    width: 44, height: 44, background: 'none', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#62646A', cursor: 'pointer', borderRadius: 8,
  };
  return (
    <header style={{
      display: 'grid', gridTemplateColumns: '44px 1fr 44px',
      alignItems: 'center', padding: '0 12px',
      height: 52, flexShrink: 0,
    }}>
      <button style={topbarBtn} aria-label="Settings"><IconSettings size={20} /></button>
      <div style={{ textAlign: 'center', fontSize: 15, letterSpacing: '-0.01em' }}>
        {showWordmark ? (
          <>
            <span style={{ fontWeight: 700 }}>blunder</span>
            <span style={{ fontWeight: 400 }}>mate</span>
          </>
        ) : null}
      </div>
      {rightSlot || (
        <button style={topbarBtn} aria-label="Search"><IconSearch size={20} /></button>
      )}
    </header>
  );
};

// Bottom 3-tab nav ---------------------------------------------------------

const HomeBottomNav = ({ kor = true, active = 'home' }) => {
  const { IconHome, IconLibrary, IconChart } = window.BMIcons;
  const tabs = [
    { id: 'home', Ic: IconHome, label: kor ? '홈' : 'Home' },
    { id: 'library', Ic: IconLibrary, label: kor ? '라이브러리' : 'Library' },
    { id: 'insights', Ic: IconChart, label: kor ? '통계' : 'Insights' },
  ];
  return (
    <nav style={{
      display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
      background: '#fff', borderTop: '1px solid rgba(28,29,31,.08)',
      flexShrink: 0,
    }}>
      {tabs.map((t, i) => {
        const isActive = t.id === active;
        return (
          <button key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            height: 64, background: 'none', border: 'none',
            color: isActive ? '#1C1D1F' : '#9A9CA3',
            cursor: 'pointer',
          }}>
            <t.Ic size={22} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

// Move-class chip (used in several variants)
const MoveClassChips = ({ c, kor = true, compact = false }) => {
  const items = [];
  if (c.brilliant > 0) items.push({ n: c.brilliant, color: '#3A8560', l: kor ? '브릴' : 'Bril' });
  if (c.great > 0)     items.push({ n: c.great, color: '#2D6E55', l: kor ? '그레이트' : 'Great' });
  if (c.mistake > 0)   items.push({ n: c.mistake, color: '#D97706', l: kor ? '미스' : 'Mist' });
  if (c.blunder > 0)   items.push({ n: c.blunder, color: '#D03832', l: kor ? '블런더' : 'Blun' });
  return (
    <span style={{ display: 'inline-flex', gap: compact ? 6 : 10, flexWrap: 'wrap' }}>
      {items.map((it, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: compact ? 10 : 11, color: '#62646A',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: it.color, display: 'inline-block',
          }}></span>
          {it.n}{compact ? '' : ' '}{compact ? '' : it.l}
        </span>
      ))}
    </span>
  );
};

window.BMHomeData = BMHomeData;
window.BMHomeShared = { resultColor, resultLetter, FormStrip, HomeTopBar, HomeBottomNav, MoveClassChips };
