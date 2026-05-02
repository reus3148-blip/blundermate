// Variant A — Question-first (current baseline, kept as reference)
// Priority: 1) Question hero  2) Identity strip  3) Recent games list  4) Import CTA
// Best for: open-ended browsing. User decides which game to dive into.

const BMHomeVariantA = ({ kor = true }) => {
  const { IconArrowRight, IconSparkle } = window.BMIcons;
  const Board = window.BMMiniBoard;
  const { resultColor, resultLetter, FormStrip, MoveClassChips,
          HomeTopBar, HomeBottomNav } = window.BMHomeShared;
  const data = window.BMHomeData(kor);

  return (
    <div style={shellStyle}>
      <HomeTopBar kor={kor} showWordmark={true} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px' }}>
        {/* HERO — the question */}
        <section style={{ padding: '24px 0 28px' }}>
          <div style={{
            fontSize: 40, fontWeight: 600,
            letterSpacing: '-0.035em', lineHeight: 1.05,
            color: '#14140F',
          }}>
            {kor ? <>어떤 게임을<br/>분석할까요?</> : <>What game<br/>shall we review?</>}
          </div>
          <div style={{
            marginTop: 18, display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: '#62646A',
          }}>
            <span style={ratingPill}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3A8560' }}></span>
              <span style={{ color: '#1C1D1F', fontWeight: 600 }}>{data.user.rating}</span>
              <span>{data.user.tc}</span>
            </span>
            <span style={{ color: '#9A9CA3' }}>·</span>
            <span>{kor ? '최근 15경기' : 'Last 15'}</span>
            <FormStrip form={data.form} h={12} />
          </div>
        </section>

        {/* Recent games list */}
        <section>
          <SectionHead title={kor ? '최근 게임' : 'Recent games'} action={kor ? '모두 보기' : 'See all'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.games.slice(0, 3).map(g => (
              <article key={g.id} style={cardStyle}>
                <Board fen={g.fen} size={84} lastMove={g.lastMove} border={false} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        padding: '2px 6px', borderRadius: 3,
                        background: resultColor(g.result) + '1f', color: resultColor(g.result),
                      }}>{resultLetter(g.result, kor)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1C1D1F',
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.opponent}
                      </span>
                      <span style={{ fontSize: 11, color: '#9A9CA3' }}>{g.oppRating}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#62646A', lineHeight: 1.4 }}>
                      {g.opening} · {g.moves}{kor ? '수' : ' moves'} · {g.tc}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <MoveClassChips c={g.classification} kor={kor} />
                  </div>
                </div>
                <div style={tailMeta}>
                  <span style={{ fontSize: 11, color: '#9A9CA3' }}>{g.ago}</span>
                  <IconArrowRight size={14} />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* PGN CTA */}
        <section style={{ marginTop: 24 }}>
          <button style={pgnCtaStyle}>
            <IconSparkle size={18} />
            {kor ? 'PGN으로 새 게임 분석하기' : 'Analyze a new game from PGN'}
          </button>
        </section>
      </div>

      <HomeBottomNav kor={kor} active="home" />
    </div>
  );
};

const SectionHead = ({ title, action }) => (
  <div style={{
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 12, padding: '0 2px',
  }}>
    <h2 style={{
      fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: '#9A9CA3', margin: 0,
    }}>{title}</h2>
    {action && (
      <button style={{
        background: 'none', border: 'none', padding: 0,
        fontSize: 12, color: '#62646A', cursor: 'pointer',
      }}>{action}</button>
    )}
  </div>
);

const shellStyle = {
  width: '100%', height: '100%',
  background: '#FAF8F4',
  display: 'flex', flexDirection: 'column',
  fontFamily: "'Inter', sans-serif", color: '#1C1D1F',
  overflow: 'hidden',
};
const ratingPill = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '4px 10px', background: '#fff',
  borderRadius: 999, border: '1px solid rgba(28,29,31,.08)',
};
const cardStyle = {
  background: '#fff', borderRadius: 14, padding: 14,
  display: 'flex', gap: 12, alignItems: 'stretch',
  boxShadow: '0 1px 2px rgba(20,20,15,.04), 0 0 0 0.5px rgba(20,20,15,.06)',
  cursor: 'pointer',
};
const tailMeta = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
  justifyContent: 'space-between',
};
const pgnCtaStyle = {
  width: '100%', height: 56,
  background: '#14140F', color: '#fff',
  border: 'none', borderRadius: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(20,20,15,.06), 0 8px 24px rgba(20,20,15,.12)',
};

window.BMHomeVariantA = BMHomeVariantA;
window.BMHomeShared.SectionHead = SectionHead;
window.BMHomeShared.shellStyle = shellStyle;
window.BMHomeShared.ratingPill = ratingPill;
