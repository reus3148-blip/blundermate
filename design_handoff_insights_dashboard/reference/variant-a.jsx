// Variant A — "Daily" stat card style (no-Stockfish edition)
// Same data restriction as Variant B: chess.com results API only.
// Different visual angle: fewer cards, larger type, single-column rhythm,
// a hero "Last 30 days" summary card with rating sparkline.

const BMInsightsVariantA = ({ kor = true, tweaks = {} }) => {
  const { IconHome, IconLibrary, IconChart, IconChevronRight } = window.BMIcons;
  const { LineChart, MultiLine, StackBar, VolumeHeat } = window.BMCharts;
  const data = window.BMInsightsData(kor);
  const accent = tweaks.accent || '#14140F';
  const ink = tweaks.darkMode ? '#F2F2F0' : '#14140F';
  const bg = tweaks.darkMode ? '#1A1B1D' : '#FAF8F4';
  const surf = tweaks.darkMode ? '#26282B' : '#FFFFFF';
  const tx2 = tweaks.darkMode ? '#9C9DA1' : '#62646A';
  const tx3 = tweaks.darkMode ? '#6A6C70' : '#9A9CA3';
  const brd = tweaks.darkMode ? 'rgba(255,255,255,.08)' : 'rgba(28,29,31,.08)';
  const chartArea = tweaks.chartStyle !== 'line';
  const cardR = tweaks.density === 'tight' ? 12 : 16;
  const sectionGap = tweaks.density === 'tight' ? 16 : 24;

  const sum = data.summary;
  const ratingNow = data.rating.rapid.at(-1);
  const ratingDelta = ratingNow - data.rating.rapid[0];

  const Eyebrow = ({ children, style }) => (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: tx3, marginBottom: 8, ...style,
    }}>{children}</div>
  );
  const Card = ({ children, style }) => (
    <div style={{
      background: surf, borderRadius: cardR, padding: 18,
      boxShadow: tweaks.darkMode ? 'none' : '0 1px 2px rgba(20,20,15,.04), 0 0 0 0.5px rgba(20,20,15,.06)',
      border: tweaks.darkMode ? `1px solid ${brd}` : 'none',
      ...style,
    }}>{children}</div>
  );

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: ink,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      <header style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 44px',
        alignItems: 'center', padding: '0 12px', height: 52, flexShrink: 0,
      }}>
        <div></div>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
          {kor ? '통계' : 'Insights'}
        </div>
        <div></div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 100px' }}>

        {/* HERO — last 30 days at a glance */}
        <section style={{ marginBottom: sectionGap }}>
          <Card style={{ padding: 20 }}>
            <Eyebrow>{kor ? '지난 30일' : 'Last 30 days'}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
              <span style={{
                fontSize: 64, fontWeight: 600, letterSpacing: '-0.04em',
                lineHeight: 0.95, fontVariantNumeric: 'tabular-nums', color: ink,
              }}>{sum.games}</span>
              <span style={{ fontSize: 16, color: tx3 }}>{kor ? '게임' : 'games'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: tx2,
                              fontVariantNumeric: 'tabular-nums' }}>
                {(sum.games/30).toFixed(1)}/{kor?'일':'d'}
              </span>
            </div>
            <StackBar segments={[
              { n: sum.wins,   color: '#1F7A4D' },
              { n: sum.draws,  color: tx3 },
              { n: sum.losses, color: '#B23A3A' },
            ]} h={10} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8,
                            fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                            fontVariantNumeric: 'tabular-nums' }}>
              <span><span style={{ color: '#1F7A4D' }}>●</span> {sum.wins}W <span style={{ color: tx3 }}>{sum.winRate}%</span></span>
              <span><span style={{ color: tx3 }}>●</span> {sum.draws}D <span style={{ color: tx3 }}>{sum.drawRate}%</span></span>
              <span><span style={{ color: '#B23A3A' }}>●</span> {sum.losses}L <span style={{ color: tx3 }}>{sum.lossRate}%</span></span>
            </div>
          </Card>
        </section>

        {/* Rating */}
        <section style={{ marginBottom: sectionGap }}>
          <Eyebrow>{kor ? '레이팅 추이 · Rapid' : 'Rating · Rapid'}</Eyebrow>
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em',
                              fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {ratingNow}
              </span>
              <span style={{ fontSize: 13, color: '#1F7A4D', fontWeight: 600,
                              fontVariantNumeric: 'tabular-nums' }}>+{ratingDelta}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: tx3 }}>
                {kor ? '12주' : '12 weeks'}
              </span>
            </div>
            <LineChart data={data.rating.rapid} w={324} h={84}
                       color={accent} area={chartArea} dim={0.95} />
          </Card>
        </section>

        {/* Streak ribbon */}
        <section style={{ marginBottom: sectionGap }}>
          <Eyebrow>{kor ? '최근 20게임' : 'Last 20 games'}</Eyebrow>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(20, 1fr)', gap: 4 }}>
              {data.ribbon.map((r, i) => (
                <div key={i} style={{
                  aspectRatio: '1',
                  background: r === 'w' ? '#1F7A4D' : r === 'l' ? '#B23A3A' : tx3,
                  borderRadius: 3, opacity: 0.55 + (i / 20) * 0.45,
                }}></div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: tx2 }}>
              {kor
                ? <>현재 <b style={{ color: ink }}>{sum.currentStreak.n}연{sum.currentStreak.kind === 'w' ? '승' : '패'}</b> · 최고 {sum.bestStreak}연승</>
                : <>Current <b style={{ color: ink }}>{sum.currentStreak.n} {sum.currentStreak.kind === 'w' ? 'wins' : 'losses'}</b> · best {sum.bestStreak}</>}
            </div>
          </Card>
        </section>

        {/* By color */}
        <section style={{ marginBottom: sectionGap }}>
          <Eyebrow>{kor ? '색상별 승률' : 'By color'}</Eyebrow>
          <Card>
            {[
              { key: 'W', label: kor ? '백' : 'White', d: data.byColor.white, fg: '#14140F', bgC: '#FAF8F4' },
              { key: 'B', label: kor ? '흑' : 'Black', d: data.byColor.black, fg: '#FAF8F4', bgC: '#14140F' },
            ].map((c, i) => (
              <div key={c.key} style={{
                display: 'grid', gridTemplateColumns: '24px 60px 1fr 50px',
                alignItems: 'center', gap: 12,
                paddingTop: i === 0 ? 0 : 14,
                marginTop: i === 0 ? 0 : 14,
                borderTop: i === 0 ? 'none' : `1px solid ${brd}`,
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: c.bgC, color: c.fg,
                  border: c.key === 'W' ? `1px solid ${brd}` : 'none',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                }}>{c.key}</span>
                <span style={{ fontSize: 13, color: tx2 }}>{c.label}</span>
                <div>
                  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: brd }}>
                    <div style={{ width: `${(c.d.win/c.d.games)*100}%`, background: '#1F7A4D' }} />
                    <div style={{ width: `${(c.d.draw/c.d.games)*100}%`, background: tx3 }} />
                    <div style={{ width: `${(c.d.loss/c.d.games)*100}%`, background: '#B23A3A' }} />
                  </div>
                  <div style={{ fontSize: 10, color: tx3, marginTop: 4,
                                  fontFamily: "'IBM Plex Mono', monospace",
                                  fontVariantNumeric: 'tabular-nums' }}>
                    {c.d.win}-{c.d.draw}-{c.d.loss} · {c.d.games}g
                  </div>
                </div>
                <span style={{ textAlign: 'right', fontSize: 22, fontWeight: 600,
                                 letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  {c.d.winRate}<span style={{ fontSize: 11, color: tx3 }}>%</span>
                </span>
              </div>
            ))}
          </Card>
        </section>

        {/* Openings — top 4 */}
        <section style={{ marginBottom: sectionGap }}>
          <Eyebrow>{kor ? '주력 오프닝' : 'Top openings'}</Eyebrow>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {data.openings.slice(0, 4).map((o, i) => {
              const wp = (o.win / o.games) * 100;
              const weak = wp < 50;
              return (
                <div key={o.name} style={{
                  display: 'grid', gridTemplateColumns: '20px 1fr auto auto',
                  alignItems: 'center', gap: 10, padding: '14px 16px',
                  borderTop: i === 0 ? 'none' : `1px solid ${brd}`,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: o.side === 'W' ? '#14140F' : '#FAF8F4',
                    background: o.side === 'W' ? '#FAF8F4' : '#14140F',
                    border: o.side === 'W' ? `1px solid ${brd}` : 'none',
                    width: 16, height: 16, borderRadius: 3,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{o.side}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </div>
                    <div style={{ fontSize: 10, color: tx3, marginTop: 2,
                                    fontFamily: "'IBM Plex Mono', monospace" }}>
                      {o.eco} · {o.games}g
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 16, fontWeight: 700,
                                    color: weak ? '#D03832' : ink, letterSpacing: '-0.01em' }}>
                      {Math.round(wp)}%
                    </div>
                    <div style={{ fontSize: 10, color: tx3 }}>
                      {o.win}-{o.draw}-{o.loss}
                    </div>
                  </div>
                  <IconChevronRight size={14} style={{ color: tx3 }} />
                </div>
              );
            })}
          </Card>
        </section>

        {/* When you play */}
        <section>
          <Eyebrow>{kor ? '플레이 시간대' : 'When you play'}</Eyebrow>
          <Card>
            <VolumeHeat
              rows={data.volumeHeat}
              days={kor ? ['월','화','수','목','금','토','일'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
              hours={['0','4','8','12','16','20']}
            />
          </Card>
        </section>
      </div>

      {/* Bottom nav */}
      <nav style={{
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        background: surf, borderTop: `1px solid ${brd}`, flexShrink: 0,
      }}>
        {[
          { Ic: IconHome, label: kor ? '홈' : 'Home' },
          { Ic: IconLibrary, label: kor ? '라이브러리' : 'Library' },
          { Ic: IconChart, label: kor ? '통계' : 'Insights', active: true },
        ].map((t, i) => (
          <button key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            height: 64, background: 'none', border: 'none',
            color: t.active ? ink : tx3, cursor: 'pointer',
          }}>
            <t.Ic size={22} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

window.BMInsightsVariantA = BMInsightsVariantA;
