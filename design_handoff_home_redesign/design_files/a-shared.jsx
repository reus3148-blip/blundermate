// Variant A — narrowed: 분석 상태 처리 + 카드 디자인 3개 변형
// 공통: 상단바 우측 + 아이콘(PGN), 히어로 질문, 레이팅+폼 스트립, 출처 뱃지(chess.com/lichess/PGN)
// 변형: 카드의 정보 밀도와 크기

// ----- Sample data with analyzed/unanalyzed states + sources -----
const HomeAData = (kor = true) => ({
  user: { rating: 1812, tc: 'Rapid', delta: +18 },
  form: ['w','w','l','w','w','d','l','w','w','l','w','d','w','w','l'],
  games: [
    {
      id: 1, result: 'win', opponent: 'magnusen2024', oppRating: 1842,
      tc: 'Rapid 10+0', ago: kor ? '오늘' : 'Today', moves: 47,
      opening: kor ? '시실리안 디펜스' : 'Sicilian Defense',
      classification: { brilliant: 1, great: 2, mistake: 1, blunder: 0 },
      fen: 'r4rk1/pp3ppp/2n2n2/3pq3/3P4/2N1P3/PP2BPPP/R2Q1RK1',
      lastMove: ['e2','b5'], accuracy: 91,
      analyzed: true, source: 'chess.com',
    },
    {
      // unanalyzed — only basic metadata
      id: 2, result: 'loss', opponent: 'kimhana_kr', oppRating: 1855,
      tc: 'Rapid 10+0', ago: kor ? '오늘' : 'Today', moves: 38,
      opening: kor ? '런던 시스템' : 'London System',
      fen: '6k1/5ppp/8/8/3Q4/8/5PPP/6K1',
      lastMove: ['d1','d4'],
      analyzed: false, source: 'chess.com',
    },
    {
      id: 3, result: 'draw', opponent: 'chess_arc', oppRating: 1798,
      tc: 'Rapid 15+10', ago: kor ? '어제' : 'Yesterday', moves: 62,
      opening: kor ? '카로칸' : 'Caro-Kann',
      classification: { brilliant: 0, great: 1, mistake: 0, blunder: 0 },
      fen: '8/4k3/8/3pP3/3K4/8/8/8',
      lastMove: ['d4','d5'], accuracy: 84,
      analyzed: true, source: 'lichess',
    },
    {
      id: 4, result: 'loss', opponent: 'pawnstorm', oppRating: 1789,
      tc: 'Blitz 5+0', ago: kor ? '2일 전' : '2d ago', moves: 41,
      opening: kor ? '이탈리안' : 'Italian',
      fen: '2r3k1/5ppp/p7/1p6/3Q4/2P5/PP3PPP/6K1',
      lastMove: ['d1','d4'],
      analyzed: false, source: 'pgn',
    },
  ],
});

window.HomeAData = HomeAData;

// ----- Source badge atom -----
const SourceBadge = ({ source, kor = true }) => {
  const map = {
    'chess.com': { label: 'chess.com', color: '#6B9F5A' },
    'lichess':   { label: 'lichess',   color: '#62646A' },
    'pgn':       { label: 'PGN',       color: '#9A9CA3' },
  };
  const m = map[source] || map.pgn;
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
      color: m.color, textTransform: 'lowercase',
    }}>{m.label}</span>
  );
};

// ----- Plus icon for top-right (PGN import) -----
const PlusBtn = () => (
  <button style={{
    width: 44, height: 44, background: 'none', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#14140F', cursor: 'pointer', borderRadius: 8,
  }} aria-label="Import PGN">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
);

// ----- Hero copy options (variants pick one) -----
const heroCopy = {
  current: ['어떤 게임을', '분석할까요?'],
  warmer:  ['오늘은 어떤', '한 수를 볼까요.'],
  direct:  ['게임 한 판,', '복기해봐요.'],
};

window.HomeAAtoms = { SourceBadge, PlusBtn, heroCopy };
