// Variant A — final: 단일 카드 디자인. 분석 결과는 조건부.
// 분석됨: move-class chips + accuracy% 표시
// 미분석: 같은 카드, chips 자리 비움, 우측에 "분석" 작은 버튼
// 카드 크기/구조 동일. 출처 뱃지(chess.com/lichess/PGN) 메타에 인라인.

const BMHomeAFinal = ({ kor = true }) => {
  const { IconArrowRight, IconChevronRight } = window.BMIcons;
  const Board = window.BMMiniBoard;
  const { resultColor, resultLetter, FormStrip, MoveClassChips,
          HomeTopBar, HomeBottomNav, SectionHead, shellStyle, ratingPill } = window.BMHomeShared;
  const { SourceBadge, PlusBtn } = window.HomeAAtoms;
  const data = window.HomeAData(kor);

  return (
    <div style={shellStyle}>
      <HomeTopBar kor={kor} showWordmark={true} rightSlot={<PlusBtn />} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px' }}>
        {/* HERO */}
        <section style={{ padding: '24px 0 28px' }}>
          <div style={{
            fontSize: 38, fontWeight: 600,
            letterSpacing: '-0.035em', lineHeight: 1.05,
            color: '#14140F',
          }}>
            {kor ? <>어떤 게임을<br/>다시 들여다볼까요?</> : <>What game<br/>shall we review?</>}
          </div>
          <div style={{
            marginTop: 16, display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: '#62646A', flexWrap: 'wrap',
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

        {/* Recent games — 동일한 카드, 분석된 것만 칩/정확도 표시 */}
        <section>
          <SectionHead title={kor ? '최근 게임' : 'Recent games'} action={kor ? '모두 보기' : 'See all'} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.games.map(g => (
              <article key={g.id} style={{
                background: '#fff', borderRadius: 14, padding: 14,
                display: 'flex', gap: 12, alignItems: 'stretch',
                boxShadow: '0 1px 2px rgba(20,20,15,.04), 0 0 0 0.5px rgba(20,20,15,.06)',
                cursor: 'pointer',
              }}>
                <Board fen={g.fen} size={84} lastMove={g.lastMove} border={false} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        padding: '2px 6px', borderRadius: 3,
                        background: resultColor(g.result) + '1f', color: resultColor(g.result),
                      }}>{resultLetter(g.result, kor)}</span>
                      <span style={{ fontSize: 13, fontWeight: 600,
                                     overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.opponent}
                      </span>
                      <span style={{ fontSize: 11, color: '#9A9CA3' }}>{g.oppRating}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#62646A', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{g.opening}</span>
                      <span style={{ color: '#C7C9CE' }}>·</span>
                      <span>{g.moves}{kor ? '수' : ' moves'}</span>
                    </div>
                  </div>
                  {/* 분석된 것만 chips 표시. 미분석은 이 영역 비움. */}
                  {g.analyzed && g.classification && (
                    <div style={{ marginTop: 8 }}>
                      <MoveClassChips c={g.classification} kor={kor} compact />
                    </div>
                  )}
                </div>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                  justifyContent: 'space-between', flexShrink: 0, minWidth: 52,
                }}>
                  <span style={{ fontSize: 11, color: '#9A9CA3', whiteSpace: 'nowrap' }}>{g.ago}</span>
                  {g.analyzed ? (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1D1F', whiteSpace: 'nowrap' }}>{g.accuracy}%</span>
                  ) : (
                    <button style={{
                      fontSize: 11, fontWeight: 600, color: '#14140F',
                      padding: '5px 10px', background: '#F2EDE3',
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}>{kor ? '분석' : 'Analyze'}</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <HomeBottomNav kor={kor} active="home" />
    </div>
  );
};

window.BMHomeAFinal = BMHomeAFinal;
