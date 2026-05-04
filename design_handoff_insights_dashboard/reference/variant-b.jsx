// Variant B — Grid Dashboard (chess.com results API only — no Stockfish)
// Charts derivable from: result, opp rating, time control, ECO/opening,
// timestamp, termination, color, move count.

const BMInsightsVariantB = ({ kor = true, tweaks = {} }) => {
  const { IconHome, IconLibrary, IconChart } = window.BMIcons;
  const { LineChart, MultiLine, Donut, StackBar, VolumeHeat } = window.BMCharts;
  const data = window.BMInsightsData(kor);
  const accent = tweaks.accent || '#2B5BD7';
  const ink = tweaks.darkMode ? '#F2F2F0' : '#14140F';
  const bg = tweaks.darkMode ? '#16171A' : '#F7F7F8';
  const surf = tweaks.darkMode ? '#1F2125' : '#FFFFFF';
  const tx2 = tweaks.darkMode ? '#9C9DA1' : '#62646A';
  const tx3 = tweaks.darkMode ? '#6A6C70' : '#9A9CA3';
  const brd = tweaks.darkMode ? 'rgba(255,255,255,.08)' : 'rgba(28,29,31,.08)';
  const chartArea = tweaks.chartStyle !== 'line';
  const cardR = tweaks.density === 'tight' ? 8 : 12;
  const W_C = '#1F7A4D', D_C = '#9A9CA3', L_C = '#B23A3A';

  const Eyebrow = ({ children, style }) => (
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: tx3, ...style,
    }}>{children}</div>
  );

  const Card = ({ children, style }) => (
    <div style={{
      background: surf, borderRadius: cardR, padding: 14,
      border: `1px solid ${brd}`, ...style,
    }}>{children}</div>
  );

  const KPI = ({ label, value, unit, sub, subColor }) => (
    <Card style={{ padding: 12 }}>
      <Eyebrow style={{ marginBottom: 6, fontSize: 9 }}>{label}</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em',
                        lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: tx3 }}>{unit}</span>}
      </div>
      {sub != null && (
        <div style={{ fontSize: 10, color: subColor || tx2, marginTop: 4,
                        fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
          {sub}
        </div>
      )}
    </Card>
  );

  const s = data.summary;
  const winRate30 = s.winRate;

  return (
    <div style={{
      width: '100%', height: '100%', background: bg, color: ink,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      <header style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 44px',
        alignItems: 'center', padding: '0 12px', height: 52, flexShrink: 0,
        borderBottom: `1px solid ${brd}`, background: surf,
      }}>
        <div></div>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
          {kor ? '통계' : 'Insights'}
        </div>
        <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace",
                       fontSize: 10, color: tx3, paddingRight: 6 }}>30D</div>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 100px' }}>

        {/* KPI grid — 2×3, all derived from results API */}
        <section style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14,
        }}>
          <KPI label={kor ? '레이팅' : 'Rating'} value={data.user.rating}
               sub={`+${data.user.delta} 30d`} subColor={W_C} />
          <KPI label={kor ? '게임' : 'Games'} value={s.games}
               sub={`${(s.games/30).toFixed(1)}/${kor?'일':'d'}`} subColor={tx2} />
          <KPI label={kor ? '승률' : 'Win'} value={s.winRate} unit="%"
               sub={`${s.wins}-${s.draws}-${s.losses}`} subColor={tx2} />
          <KPI label={kor ? '연승' : 'Streak'}
               value={`${s.currentStreak.kind === 'w' ? 'W' : s.currentStreak.kind === 'l' ? 'L' : 'D'}${s.currentStreak.n}`}
               sub={`${kor ? '최고' : 'best'} W${s.bestStreak}`} subColor={tx2} />
          <KPI label={kor ? '평균 길이' : 'Avg len'} value={s.avgGameMoves}
               unit={kor ? '수' : 'mv'}
               sub={`${s.avgGameMinutes}${kor?'분':'min'}`} subColor={tx2} />
          <KPI label={kor ? '리뷰' : 'Review'} value={s.reviewStreak}
               unit={kor ? '일' : 'd'}
               sub={kor ? '연속' : 'streak'} subColor={tx2} />
        </section>

        {/* Last-20 ribbon */}
        <section style={{ marginBottom: 14 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <Eyebrow>{kor ? '최근 20게임' : 'Last 20'}</Eyebrow>
              <span style={{ fontSize: 9, color: tx3, fontFamily: "'IBM Plex Mono', monospace" }}>
                ← {kor ? '오래된' : 'older'}  ·  {kor ? '최근' : 'recent'} →
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {data.ribbon.map((r, i) => {
                const c = r === 'w' ? W_C : r === 'l' ? L_C : D_C;
                return (
                  <div key={i} style={{
                    flex: 1, height: 18, borderRadius: 2, background: c,
                    opacity: 0.4 + (i / data.ribbon.length) * 0.6,
                  }} title={r.toUpperCase()} />
                );
              })}
            </div>
          </Card>
        </section>

        {/* Rating multi-line — by time control */}
        <section style={{ marginBottom: 14 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <Eyebrow>{kor ? '레이팅 · 12주' : 'Rating · 12w'}</Eyebrow>
              <div style={{ display: 'flex', gap: 10, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                <span style={{ color: ink, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 2, background: ink }}></span>RAPID {data.rating.rapid.at(-1)}
                </span>
                <span style={{ color: tx3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 1, background: tx3 }}></span>BLZ {data.rating.blitz.at(-1)}
                </span>
                <span style={{ color: tx3, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 1, background: tx3, opacity: 0.5 }}></span>BLT {data.rating.bullet.at(-1)}
                </span>
              </div>
            </div>
            <MultiLine
              w={328} h={92}
              series={[
                { data: data.rating.rapid,  color: ink, bold: true },
                { data: data.rating.blitz,  color: tx2 },
                { data: data.rating.bullet, color: tx2, dashed: true },
              ]}
            />
          </Card>
        </section>

        {/* W/D/L donut + termination donut */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <Card>
            <Eyebrow style={{ marginBottom: 8 }}>{kor ? '결과 분포' : 'Results'}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Donut
                size={72} thickness={10}
                items={[
                  { n: s.wins,   color: W_C },
                  { n: s.draws,  color: D_C },
                  { n: s.losses, color: L_C },
                ]}
                center={
                  <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: ink }}>
                    {winRate30}<span style={{ fontSize: 8, color: tx3 }}>%</span>
                  </span>
                } />
              <div style={{ flex: 1, display: 'grid', gap: 4, minWidth: 0, fontSize: 10 }}>
                {[
                  { l: kor?'승':'Win',  n: s.wins,   c: W_C },
                  { l: kor?'무':'Draw', n: s.draws,  c: D_C },
                  { l: kor?'패':'Loss', n: s.losses, c: L_C },
                ].map((r,i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.c }}></span>
                    <span style={{ color: tx2 }}>{r.l}</span>
                    <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: r.c }}>{r.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <Eyebrow style={{ marginBottom: 8 }}>{kor ? '종료 사유' : 'Termination'}</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Donut
                size={72} thickness={10}
                items={data.termination.map(t => ({ n: t.n, color: t.color }))}
                center={
                  <span style={{ fontSize: 11, fontWeight: 600, color: ink, textAlign: 'center', lineHeight: 1.1 }}>
                    {data.termination[0].n}<br/>
                    <span style={{ fontSize: 8, color: tx3, fontWeight: 400 }}>
                      {data.termination[0].label}
                    </span>
                  </span>
                } />
              <div style={{ flex: 1, display: 'grid', gap: 3, minWidth: 0, fontSize: 9 }}>
                {data.termination.slice(0, 4).map((t,i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.color, flexShrink: 0 }}></span>
                    <span style={{ color: tx2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                    <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{t.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </section>

        {/* Color split — White vs Black */}
        <section style={{ marginBottom: 14 }}>
          <Card>
            <Eyebrow style={{ marginBottom: 12 }}>{kor ? '색상별 성적' : 'By color'}</Eyebrow>
            {[
              { side: 'W', d: data.byColor.white,  label: kor ? '백' : 'White' },
              { side: 'B', d: data.byColor.black,  label: kor ? '흑' : 'Black' },
            ].map((row) => {
              const wp = (row.d.win / row.d.games) * 100;
              const dp = (row.d.draw / row.d.games) * 100;
              const lp = (row.d.loss / row.d.games) * 100;
              return (
                <div key={row.side} style={{ marginTop: 6, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4,
                      background: row.side === 'W' ? '#FAF8F4' : '#14140F',
                      color: row.side === 'W' ? '#14140F' : '#FAF8F4',
                      border: row.side === 'W' ? `1px solid ${brd}` : 'none',
                      fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{row.side}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{row.label}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 11, color: ink, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {row.d.winRate}%
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: tx3,
                                    fontVariantNumeric: 'tabular-nums' }}>
                      {row.d.games}g
                    </span>
                  </div>
                  <div style={{ display: 'flex', height: 6, gap: 1, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${wp}%`, background: W_C }} />
                    <div style={{ width: `${dp}%`, background: D_C }} />
                    <div style={{ width: `${lp}%`, background: L_C }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>

        {/* Performance vs opponent rating */}
        <section style={{ marginBottom: 14 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <Eyebrow>{kor ? '상대 레이팅대별' : 'vs opponent rating'}</Eyebrow>
              <span style={{ fontSize: 9, color: tx3, fontFamily: "'IBM Plex Mono', monospace" }}>
                {kor ? '득점률' : 'SCORE %'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.vsRating.map((r, i) => {
                const isUnder = r.score < 50;
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '54px 1fr 36px', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace",
                                     fontSize: 10, color: tx2, fontVariantNumeric: 'tabular-nums' }}>
                      {r.bucket}
                    </span>
                    <div style={{ position: 'relative', height: 10, background: brd, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${r.score}%`,
                        background: isUnder ? L_C : (r.score > 70 ? W_C : accent),
                      }} />
                      <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1,
                                     background: tx3, opacity: 0.5 }} />
                    </div>
                    <span style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace",
                                     fontSize: 11, fontWeight: 700,
                                     color: isUnder ? L_C : ink,
                                     fontVariantNumeric: 'tabular-nums' }}>
                      {r.score}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: tx3, lineHeight: 1.5,
                            fontFamily: "'IBM Plex Mono', monospace" }}>
              {kor ? '나의 레이팅 1812 기준 · 50% = 균형' : 'Buckets vs your 1812 · 50% = even'}
            </div>
          </Card>
        </section>

        {/* Time control distribution */}
        <section style={{ marginBottom: 14 }}>
          <Card style={{ padding: 0 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 36px 70px 36px',
              gap: 8, padding: '10px 14px',
              borderBottom: `1px solid ${brd}`,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              color: tx3, textTransform: 'uppercase'
            }}>
              <span>{kor ? '시간 컨트롤' : 'Time control'}</span>
              <span style={{ textAlign: 'right' }}>G</span>
              <span style={{ textAlign: 'right' }}>W-D-L</span>
              <span style={{ textAlign: 'right' }}>%</span>
            </div>
            {data.tc.map((t, i) => {
              const wp = (t.win / t.games) * 100;
              return (
                <div key={t.name} style={{
                  display: 'grid', gridTemplateColumns: '1fr 36px 70px 36px',
                  gap: 8, padding: '9px 14px', alignItems: 'center',
                  borderTop: i === 0 ? 'none' : `1px solid ${brd}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: tx2, textAlign: 'right',
                                   fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums' }}>{t.games}</span>
                  <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    <span style={{ color: W_C }}>{t.win}</span>
                    <span style={{ color: tx3 }}>·{t.draw}·</span>
                    <span style={{ color: L_C }}>{t.loss}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700,
                                   color: wp < 50 ? L_C : ink,
                                   fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {Math.round(wp)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>

        {/* Opening table — ECO-based */}
        <section style={{ marginBottom: 14 }}>
          <Card style={{ padding: 0 }}>
            <div style={{ display: 'grid',
                            gridTemplateColumns: '20px 32px 1fr 36px 60px 36px',
                            gap: 6, padding: '10px 14px',
                            borderBottom: `1px solid ${brd}`,
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                            color: tx3, textTransform: 'uppercase' }}>
              <span>S</span><span>ECO</span><span>{kor ? '오프닝' : 'Opening'}</span>
              <span style={{ textAlign: 'right' }}>G</span>
              <span style={{ textAlign: 'right' }}>W-D-L</span>
              <span style={{ textAlign: 'right' }}>%</span>
            </div>
            {data.openings.map((o, i) => {
              const wp = (o.win / o.games) * 100;
              const weak = wp < 50;
              return (
                <div key={o.name} style={{
                  display: 'grid', gridTemplateColumns: '20px 32px 1fr 36px 60px 36px',
                  gap: 6, padding: '9px 14px', alignItems: 'center',
                  borderTop: i === 0 ? 'none' : `1px solid ${brd}`,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: o.side === 'W' ? '#14140F' : '#FAF8F4',
                    background: o.side === 'W' ? '#FAF8F4' : '#14140F',
                    border: o.side === 'W' ? `1px solid ${brd}` : 'none',
                    width: 16, height: 16, borderRadius: 3,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{o.side}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden',
                                   textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: tx2, textAlign: 'right',
                                   fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums' }}>{o.games}</span>
                  <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    <span style={{ color: W_C }}>{o.win}</span>
                    <span style={{ color: tx3 }}>·{o.draw}·</span>
                    <span style={{ color: L_C }}>{o.loss}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700,
                                   color: weak ? L_C : ink,
                                   fontFamily: "'IBM Plex Mono', monospace",
                                   fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                    {Math.round(wp)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>

        {/* Game-length distribution */}
        <section style={{ marginBottom: 14 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <Eyebrow>{kor ? '게임 길이별 승률' : 'Win % by length'}</Eyebrow>
              <span style={{ fontSize: 9, color: tx3, fontFamily: "'IBM Plex Mono', monospace" }}>
                {kor ? '수' : 'MOVES'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {data.lengthDist.map((b, i) => {
                const h = (b.winRate / 70) * 100;
                const weak = b.winRate < 50;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                          alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: weak ? L_C : ink,
                                     fontFamily: "'IBM Plex Mono', monospace",
                                     fontVariantNumeric: 'tabular-nums' }}>
                      {b.winRate}
                    </span>
                    <div style={{
                      width: '100%', height: `${h}%`,
                      background: weak ? L_C : accent,
                      borderRadius: '3px 3px 0 0',
                      opacity: 0.85,
                    }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {data.lengthDist.map((b, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: tx3,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontVariantNumeric: 'tabular-nums' }}>
                  {b.bucket}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 1 }}>
              {data.lengthDist.map((b, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: tx3,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontVariantNumeric: 'tabular-nums' }}>
                  {b.games}g
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* First move distribution */}
        <section style={{ marginBottom: 14 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <Eyebrow>{kor ? '첫 수' : 'First move'}</Eyebrow>
              <span style={{ fontSize: 9, color: tx3, fontFamily: "'IBM Plex Mono', monospace" }}>
                {kor ? '백 / 흑 상대' : 'AS WHITE / VS WHITE'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { title: kor ? '내가 백' : 'White', moves: data.firstMove.asWhite, side: 'W' },
                { title: kor ? '상대 백' : 'vs', moves: data.firstMove.asBlack, side: 'B' },
              ].map(col => (
                <div key={col.title}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 3,
                      background: col.side === 'W' ? '#FAF8F4' : '#14140F',
                      border: col.side === 'W' ? `1px solid ${brd}` : 'none',
                    }}></span>
                    <span style={{ fontSize: 11, color: tx2, fontWeight: 500 }}>{col.title}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {col.moves.map((m, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 28px',
                                              alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace",
                                         fontSize: 11, fontWeight: 600,
                                         fontVariantNumeric: 'tabular-nums' }}>
                          {m.move}
                        </span>
                        <div style={{ position: 'relative', height: 6, background: brd, borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', left: 0, height: '100%',
                                          width: `${m.winRate}%`,
                                          background: m.winRate < 50 ? L_C : (m.winRate > 60 ? W_C : accent) }} />
                        </div>
                        <span style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace",
                                         fontSize: 10, fontWeight: 600, color: tx2,
                                         fontVariantNumeric: 'tabular-nums' }}>
                          {m.winRate}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>

        {/* Volume heatmap */}
        <section>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <Eyebrow>{kor ? '플레이 시간대' : 'When you play'}</Eyebrow>
              <span style={{ fontSize: 9, color: tx3, fontFamily: "'IBM Plex Mono', monospace" }}>
                {kor ? '7일 × 4h · 게임 수' : '7d × 4h · GAMES'}
              </span>
            </div>
            <VolumeHeat
              rows={data.volumeHeat}
              days={kor ? ['월','화','수','목','금','토','일'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']}
              hours={['0','4','8','12','16','20']}
            />
            <div style={{ marginTop: 10, fontSize: 10, color: tx2, lineHeight: 1.5 }}>
              {kor ? '저녁 20–24시 · 주말 오후에 가장 활발' :
                     'Evenings 20–24h · busiest on weekends'}
            </div>
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

window.BMInsightsVariantB = BMInsightsVariantB;
