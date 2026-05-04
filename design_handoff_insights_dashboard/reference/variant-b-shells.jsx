// Variant B shells — three navigation patterns sharing the same 11 cards.
// All read from window.BMInsightsB (theme + cards + groups).

(function () {
  const { IconHome, IconLibrary, IconChart } = window.BMIcons;
  const { makeTheme, atoms, getGroups } = window.BMInsightsB;

  // ── Shared chrome ─────────────────────────────────────────────────────
  function Header({ t, kor, right }) {
    return (
      <header style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 44px',
        alignItems: 'center', padding: '0 12px', height: 52, flexShrink: 0,
        borderBottom: `1px solid ${t.brd}`, background: t.surf,
      }}>
        <div></div>
        <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: t.ink }}>
          {kor ? '통계' : 'Insights'}
        </div>
        <div style={{ textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace",
                       fontSize: 10, color: t.tx3, paddingRight: 6 }}>{right || '30D'}</div>
      </header>
    );
  }

  function BottomNav({ t, kor }) {
    return (
      <nav style={{
        display: 'flex', alignItems: 'stretch', justifyContent: 'space-around',
        background: t.surf, borderTop: `1px solid ${t.brd}`, flexShrink: 0,
      }}>
        {[
          { Ic: IconHome, label: kor ? '홈' : 'Home' },
          { Ic: IconLibrary, label: kor ? '라이브러리' : 'Library' },
          { Ic: IconChart, label: kor ? '통계' : 'Insights', active: true },
        ].map((tab, i) => (
          <button key={i} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            height: 64, background: 'none', border: 'none',
            color: tab.active ? t.ink : t.tx3, cursor: 'pointer',
          }}>
            <tab.Ic size={22} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>{tab.label}</span>
          </button>
        ))}
      </nav>
    );
  }

  function Stack({ children, gap = 14 }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {children}
      </div>
    );
  }

  function renderCards(cards, ctx) {
    return cards.map((Card, i) => <Card key={i} {...ctx} />);
  }

  // ── Shell D — sticky summary + segmented tabs ────────────────────────
  // Top: KPI grid + Rating chart always visible (the "summary that can't
  // be hidden"). Below: 3 tabs (Results / Openings / Patterns).
  const BMInsightsB_D = ({ kor = true, tweaks = {} }) => {
    const t = makeTheme(tweaks);
    const data = window.BMInsightsData(kor);
    const groups = getGroups(kor);
    const summary = groups[0];
    const tabs = groups.slice(1);  // results, openings, patterns
    const [active, setActive] = React.useState('results');
    const ctx = { t, data, kor };
    const activeGroup = tabs.find(g => g.id === active) || tabs[0];

    return (
      <div style={{
        width: '100%', height: '100%', background: t.bg, color: t.ink,
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', sans-serif", overflow: 'hidden',
      }}>
        <Header t={t} kor={kor} />

        {/* Sticky summary block */}
        <div style={{
          padding: '14px 14px 0', background: t.bg, flexShrink: 0,
          borderBottom: `1px solid ${t.brd}`,
        }}>
          <Stack gap={10}>
            <window.BMInsightsB.cards.KPIGrid {...ctx} />
            <window.BMInsightsB.cards.RatingCard {...ctx} />
          </Stack>

          {/* Segmented tabs (3, since summary is pinned) */}
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
            gap: 0, marginTop: 14, marginBottom: -1,
            position: 'relative', zIndex: 1,
          }}>
            {tabs.map(g => {
              const isActive = g.id === active;
              return (
                <button key={g.id} onClick={() => setActive(g.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '12px 0 13px', position: 'relative',
                    fontSize: 12, fontWeight: isActive ? 600 : 500,
                    color: isActive ? t.ink : t.tx2,
                    fontFamily: 'inherit', letterSpacing: '-0.01em',
                  }}>
                  {g.label}
                  {isActive && (
                    <span style={{
                      position: 'absolute', left: '20%', right: '20%', bottom: -1,
                      height: 2, background: t.ink, borderRadius: 1,
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 100px' }}>
          <Stack gap={14}>
            {renderCards(activeGroup.cards, ctx)}
          </Stack>
        </div>

        <BottomNav t={t} kor={kor} />
      </div>
    );
  };

  // ── Shell C — accordion (one open at a time) ─────────────────────────
  // 4 sections collapsed by default; tap header to expand. Default-open
  // first section so the screen isn't blank on load. Expand: chevron rotates.
  const BMInsightsB_C = ({ kor = true, tweaks = {} }) => {
    const t = makeTheme(tweaks);
    const data = window.BMInsightsData(kor);
    const groups = getGroups(kor);
    const [open, setOpen] = React.useState('summary');
    const ctx = { t, data, kor };
    const { Eyebrow } = atoms(t);

    return (
      <div style={{
        width: '100%', height: '100%', background: t.bg, color: t.ink,
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', sans-serif", overflow: 'hidden',
      }}>
        <Header t={t} kor={kor} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 100px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(g => {
              const isOpen = open === g.id;
              return (
                <div key={g.id} style={{
                  background: t.surf, borderRadius: t.cardR,
                  border: `1px solid ${t.brd}`, overflow: 'hidden',
                }}>
                  <button onClick={() => setOpen(isOpen ? null : g.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      gap: 10, padding: '14px 16px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: t.ink, fontFamily: 'inherit', textAlign: 'left',
                    }}>
                    <span style={{
                      fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', flex: 1,
                    }}>
                      {g.label}
                    </span>
                    <span style={{
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 10, color: t.tx3,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {g.cards.length} {kor ? '항목' : 'items'}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 12 12"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform .18s', color: t.tx2 }}>
                      <path d="M3 4.5L6 7.5L9 4.5" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 12px 14px',
                                    borderTop: `1px solid ${t.brd}` }}>
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14,
                      }}>
                        {renderCards(g.cards, ctx)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <BottomNav t={t} kor={kor} />
      </div>
    );
  };

  // ── Shell A — segmented tabs (full swap) ─────────────────────────────
  // 4 horizontal tabs at top. Active tab swaps the entire scroll body.
  // Most aggressive at reducing scroll length per session.
  const BMInsightsB_A = ({ kor = true, tweaks = {} }) => {
    const t = makeTheme(tweaks);
    const data = window.BMInsightsData(kor);
    const groups = getGroups(kor);
    const [active, setActive] = React.useState('summary');
    const ctx = { t, data, kor };
    const activeGroup = groups.find(g => g.id === active) || groups[0];

    return (
      <div style={{
        width: '100%', height: '100%', background: t.bg, color: t.ink,
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', sans-serif", overflow: 'hidden',
      }}>
        <Header t={t} kor={kor} />

        {/* Pill tab bar */}
        <div style={{
          padding: '12px 14px', background: t.bg, flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', gap: 4, padding: 3,
            background: t.surf, borderRadius: 999,
            border: `1px solid ${t.brd}`,
          }}>
            {groups.map(g => {
              const isActive = g.id === active;
              return (
                <button key={g.id} onClick={() => setActive(g.id)}
                  style={{
                    flex: 1, padding: '8px 10px',
                    background: isActive ? t.ink : 'transparent',
                    color: isActive ? t.surf : t.tx2,
                    border: 'none', borderRadius: 999, cursor: 'pointer',
                    fontSize: 12, fontWeight: isActive ? 600 : 500,
                    fontFamily: 'inherit', letterSpacing: '-0.01em',
                    transition: 'background .15s, color .15s',
                  }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active group's cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 100px' }}>
          <Stack gap={14}>
            {renderCards(activeGroup.cards, ctx)}
          </Stack>
        </div>

        <BottomNav t={t} kor={kor} />
      </div>
    );
  };

  Object.assign(window, { BMInsightsB_D, BMInsightsB_C, BMInsightsB_A });
})();
