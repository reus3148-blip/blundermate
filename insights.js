import { fetchRecentGames } from './chessApi.js';
import { getMyUserId } from './storage.js';
import { escapeHtml, parseOpeningFromPgn, rootOpeningName, isWhitePlayer, classifyGameResult, extractMoveTimesForUser } from './utils.js';
import { t } from './strings.js';

// 통계 bucket 분류용 가벼운 수 카운트.
// utils.countMovesFromPgn은 chess.js로 PGN을 매번 파싱(100게임 × ~5ms)하는데,
// bucket 경계(20/40/60수)에선 ±1 오차가 분류에 영향 없으므로 정규식 fallback으로 충분하다.
// 1) [PlyCount "..."] 헤더가 있으면 즉시 반환 (가장 빠름)
// 2) 헤더/시계 주석 제거 후 "1."/"2." 매치 카운트 — "1..." 흑 표기는 lookahead로 제외
function countMovesFromPgnFast(pgn) {
    if (!pgn) return 0;
    const plyHeader = pgn.match(/\[PlyCount "(\d+)"\]/)?.[1];
    if (plyHeader) return Math.ceil(parseInt(plyHeader, 10) / 2);
    const body = pgn
        .replace(/^\[[^\]]*\]\s*\n?/gm, '')
        .replace(/\{[^}]*\}/g, '');
    const matches = body.match(/\d+\.(?!\.)/g);
    return matches ? matches.length : 0;
}

const INSIGHTS_GAMES_LIMIT = 100;

const insightsBody = document.getElementById('insightsBody');
const insightsBackBtn = document.getElementById('insightsBackBtn');
const insightsSubtitle = document.getElementById('insightsSubtitle');
const insightsTimeFilterBar = document.getElementById('insightsTimeFilterBar');
const insightsColorFilterBar = document.getElementById('insightsColorFilterBar');

// 통계 화면 필터 상태.
// timeClass: 'all' | 'rapid' | 'blitz' | 'bullet' (기본 rapid — 일반 사용자가 가장 자주 보는 시간대)
// color: 'all' | 'white' | 'black' (기본 all — 오프닝은 흑백 분리해서 봐야 의미 있지만 첫 진입은 종합 보기)
let insightsTimeClassFilter = 'rapid';
let insightsColorFilter = 'all';
// 마지막 fetch한 게임 + 사용자 (필터 변경 시 재 fetch 없이 다시 compute용)
let lastInsightsGames = null;
let lastInsightsUser = null;

const TC_LABEL_KEY = {
    rapid: 'home_filter_rapid',
    blitz: 'home_filter_blitz',
    bullet: 'home_filter_bullet',
};
const COLOR_LABEL_KEY = {
    white: 'insights_white',
    black: 'insights_black',
};

function classifyTermination(game, userLower) {
    const isWhite = isWhitePlayer(game, userLower);
    const myRc = (isWhite ? game.white : game.black).result;
    const oppRc = (isWhite ? game.black : game.white).result;

    const reasonOf = (rc) => {
        if (rc === 'checkmated') return 'checkmate';
        if (rc === 'timeout') return 'timeout';
        if (rc === 'resigned') return 'resign';
        if (rc === 'abandoned') return 'abandon';
        if (['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient'].includes(rc)) return 'draw';
        return 'other';
    };

    // 이긴 경우 상대 쪽 코드가 끝난 사유, 진/비긴 경우 내 쪽 코드가 사유.
    if (myRc === 'win') return reasonOf(oppRc);
    return reasonOf(myRc);
}

function hourBucket(endTime) {
    if (!endTime) return null;
    const h = new Date(endTime * 1000).getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    if (h >= 18 && h < 23) return 'evening';
    return 'night';
}

function moveCountBucket(pgn) {
    const moves = countMovesFromPgnFast(pgn);
    if (moves === 0) return null;
    if (moves < 20) return 'short';
    if (moves < 40) return 'medium';
    if (moves < 60) return 'long';
    return 'marathon';
}

function openingKey(pgn) {
    const { name, eco } = parseOpeningFromPgn(pgn || '');
    // 통계 그룹화는 루트 오프닝 단위 (변종은 합침). 화면에 보이는 분석 헤더 등은 풀 이름 그대로 사용.
    if (name) return { key: rootOpeningName(name), eco };
    if (eco) return { key: eco, eco };
    return null;
}

function emptyWDL() { return { games: 0, win: 0, draw: 0, loss: 0 }; }
function addResult(bucket, r) {
    bucket.games++;
    bucket[r]++;
}
function winPct(b) { return b.games === 0 ? 0 : Math.round((b.win / b.games) * 100); }

function computeInsights(games, userLower) {
    const overall = emptyWDL();
    const byColor = { white: emptyWDL(), black: emptyWDL() };
    const byTimeClass = {};
    const openings = new Map();
    const termination = { checkmate: 0, timeout: 0, resign: 0, abandon: 0, draw: 0, other: 0 };
    const moveBuckets = { short: emptyWDL(), medium: emptyWDL(), long: emptyWDL(), marathon: emptyWDL() };
    const timeBuckets = { morning: emptyWDL(), afternoon: emptyWDL(), evening: emptyWDL(), night: emptyWDL() };
    // 시간 통계: 클럭 주석 있는 게임만 누적. correspondence/clock 없는 게임은 자동 스킵.
    const timeStats = {
        gamesWithClocks: 0,
        totalMoves: 0,
        totalTimeSpent: 0,
        opening: { moves: 0, time: 0 },   // user moves 1–10
        middle:  { moves: 0, time: 0 },   // 11–30
        end:     { moves: 0, time: 0 },   // 31+
        timePressureMoves: 0,             // clockBefore ≤ 10s
        instantMoves: 0,                  // timeSpent < 3s
    };

    for (const game of games) {
        const isWhite = isWhitePlayer(game, userLower);
        const r = classifyGameResult(game, userLower);

        addResult(overall, r);
        addResult(isWhite ? byColor.white : byColor.black, r);

        const tc = game.time_class || 'other';
        if (!byTimeClass[tc]) byTimeClass[tc] = emptyWDL();
        addResult(byTimeClass[tc], r);

        const op = openingKey(game.pgn);
        if (op) {
            if (!openings.has(op.key)) openings.set(op.key, { ...emptyWDL(), eco: op.eco });
            addResult(openings.get(op.key), r);
        }

        const term = classifyTermination(game, userLower);
        if (termination[term] !== undefined) termination[term]++;

        const mb = moveCountBucket(game.pgn);
        if (mb) addResult(moveBuckets[mb], r);

        const hb = hourBucket(game.end_time);
        if (hb) addResult(timeBuckets[hb], r);

        const moveTimes = extractMoveTimesForUser(game.pgn || '', isWhite);
        if (moveTimes && moveTimes.length > 0) {
            timeStats.gamesWithClocks++;
            for (const m of moveTimes) {
                timeStats.totalMoves++;
                timeStats.totalTimeSpent += m.timeSpent;
                let phase;
                if (m.userMoveNumber <= 10) phase = timeStats.opening;
                else if (m.userMoveNumber <= 30) phase = timeStats.middle;
                else phase = timeStats.end;
                phase.moves++;
                phase.time += m.timeSpent;
                if (m.clockBefore <= 10) timeStats.timePressureMoves++;
                if (m.timeSpent < 3) timeStats.instantMoves++;
            }
        }
    }

    const topOpenings = [...openings.entries()]
        .map(([key, stats]) => ({ key, ...stats }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 5);

    return { overall, byColor, byTimeClass, topOpenings, termination, moveBuckets, timeBuckets, timeStats };
}

// ==========================================
// Rendering
// ==========================================
function renderWDLBar(b) {
    if (b.games === 0) return '<div class="wdl-bar wdl-bar--empty"></div>';
    const wPct = (b.win / b.games) * 100;
    const dPct = (b.draw / b.games) * 100;
    const lPct = (b.loss / b.games) * 100;
    return `
        <div class="wdl-bar">
            ${wPct > 0 ? `<div class="wdl-seg wdl-seg--win" style="width:${wPct}%"></div>` : ''}
            ${dPct > 0 ? `<div class="wdl-seg wdl-seg--draw" style="width:${dPct}%"></div>` : ''}
            ${lPct > 0 ? `<div class="wdl-seg wdl-seg--loss" style="width:${lPct}%"></div>` : ''}
        </div>`;
}

function renderWDLSummary(b) {
    return `<span class="wdl-summary">${b.win}${t('insights_w')} ${b.draw}${t('insights_d')} ${b.loss}${t('insights_l')} · ${winPct(b)}%</span>`;
}

function renderOverallCard(overall) {
    return `
        <div class="insight-card insight-card--hero">
            <div class="insight-hero-top">
                <div class="insight-hero-metric">
                    <span class="insight-hero-value">${winPct(overall)}%</span>
                    <span class="insight-hero-label">${t('insights_winrate')}</span>
                </div>
                <div class="insight-hero-counts">
                    <div><span class="hero-count hero-count--win">${overall.win}</span><span class="hero-count-label">${t('insights_wins')}</span></div>
                    <div><span class="hero-count hero-count--draw">${overall.draw}</span><span class="hero-count-label">${t('insights_draws')}</span></div>
                    <div><span class="hero-count hero-count--loss">${overall.loss}</span><span class="hero-count-label">${t('insights_losses')}</span></div>
                </div>
            </div>
            ${renderWDLBar(overall)}
            <div class="insight-hero-total">${t('insights_total_n').replace('{n}', overall.games)}</div>
        </div>`;
}

function renderRowCard(title, rows) {
    const body = rows.map(r => `
        <div class="insight-row">
            <div class="insight-row-label">${escapeHtml(r.label)}</div>
            <div class="insight-row-bar-wrap">
                ${renderWDLBar(r.stats)}
                ${renderWDLSummary(r.stats)}
            </div>
        </div>
    `).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${escapeHtml(title)}</div>
            <div class="insight-card-body">${body || `<div class="insight-empty">${t('insights_empty')}</div>`}</div>
        </div>`;
}

function renderColorCard(byColor) {
    return renderRowCard(t('insights_by_color'), [
        { label: t('insights_white'), stats: byColor.white },
        { label: t('insights_black'), stats: byColor.black },
    ].filter(r => r.stats.games > 0));
}

function renderTimeClassCard(byTimeClass) {
    const order = ['rapid', 'blitz', 'bullet', 'daily'];
    const labelMap = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', daily: 'Daily' };
    const rows = order
        .filter(tc => byTimeClass[tc] && byTimeClass[tc].games > 0)
        .map(tc => ({ label: labelMap[tc], stats: byTimeClass[tc] }));
    // Add any other time classes
    Object.keys(byTimeClass).forEach(tc => {
        if (!order.includes(tc) && byTimeClass[tc].games > 0) {
            rows.push({ label: tc, stats: byTimeClass[tc] });
        }
    });
    return renderRowCard(t('insights_by_tc'), rows);
}

function renderOpeningsCard(topOpenings) {
    if (topOpenings.length === 0) {
        return `
            <div class="insight-card">
                <div class="insight-card-title">${t('insights_top_openings')}</div>
                <div class="insight-card-body"><div class="insight-empty">${t('insights_empty')}</div></div>
            </div>`;
    }
    const rows = topOpenings.map(op => ({
        label: op.eco ? `${op.key} · ${op.eco}` : op.key,
        stats: op,
    }));
    return renderRowCard(t('insights_top_openings'), rows);
}

function renderTerminationCard(termination, total) {
    if (total === 0) {
        return `
            <div class="insight-card">
                <div class="insight-card-title">${t('insights_termination')}</div>
                <div class="insight-card-body"><div class="insight-empty">${t('insights_empty')}</div></div>
            </div>`;
    }
    const items = [
        { key: 'checkmate', label: t('insights_term_checkmate') },
        { key: 'resign',    label: t('insights_term_resign') },
        { key: 'timeout',   label: t('insights_term_timeout') },
        { key: 'draw',      label: t('insights_term_draw') },
        { key: 'abandon',   label: t('insights_term_abandon') },
    ].filter(x => termination[x.key] > 0);
    const body = items.map(it => {
        const n = termination[it.key];
        const pct = Math.round((n / total) * 100);
        return `
            <div class="insight-term-row">
                <div class="insight-term-label">${escapeHtml(it.label)}</div>
                <div class="insight-term-bar-wrap">
                    <div class="insight-term-bar"><div class="insight-term-bar-fill" style="width:${pct}%"></div></div>
                    <span class="insight-term-count">${n} · ${pct}%</span>
                </div>
            </div>`;
    }).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_termination')}</div>
            <div class="insight-card-body">${body}</div>
        </div>`;
}

function renderMoveLengthCard(moveBuckets) {
    const order = ['short', 'medium', 'long', 'marathon'];
    const labelMap = {
        short: t('insights_len_short'),
        medium: t('insights_len_medium'),
        long: t('insights_len_long'),
        marathon: t('insights_len_marathon'),
    };
    const rows = order
        .filter(k => moveBuckets[k].games > 0)
        .map(k => ({ label: labelMap[k], stats: moveBuckets[k] }));
    return renderRowCard(t('insights_game_length'), rows);
}

// ──────────────────────────────────────────────────────────────────
// Time stats cards (chess.com PGN clock annotations 기반)
// ──────────────────────────────────────────────────────────────────
function fmtSeconds(s) {
    if (!Number.isFinite(s)) return '—';
    if (s < 10) return `${s.toFixed(1)}${t('insights_time_unit_sec')}`;
    if (s < 60) return `${Math.round(s)}${t('insights_time_unit_sec')}`;
    const m = s / 60;
    return `${m.toFixed(1)}${t('insights_time_unit_min')}`;
}

function renderTimeStatsEmptyCard(title) {
    return `
        <div class="insight-card">
            <div class="insight-card-title">${escapeHtml(title)}</div>
            <div class="insight-card-body"><div class="insight-empty">${t('insights_time_no_clock')}</div></div>
        </div>`;
}

function renderAvgThinkCard(timeStats) {
    if (timeStats.totalMoves === 0) return renderTimeStatsEmptyCard(t('insights_avg_think'));
    const avg = timeStats.totalTimeSpent / timeStats.totalMoves;
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_avg_think')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value">${fmtSeconds(avg)}</span>
                    <span class="insight-big-sub">${t('insights_avg_think_sub').replace('{moves}', timeStats.totalMoves).replace('{games}', timeStats.gamesWithClocks)}</span>
                </div>
            </div>
        </div>`;
}

function renderPhaseTimeCard(timeStats) {
    if (timeStats.totalMoves === 0) return renderTimeStatsEmptyCard(t('insights_phase_time'));
    const phases = [
        { label: t('insights_phase_opening'), data: timeStats.opening },
        { label: t('insights_phase_middle'),  data: timeStats.middle },
        { label: t('insights_phase_end'),     data: timeStats.end },
    ].filter(p => p.data.moves > 0);
    const maxAvg = Math.max(...phases.map(p => p.data.time / p.data.moves), 0.001);
    const body = phases.map(p => {
        const avg = p.data.time / p.data.moves;
        const pct = (avg / maxAvg) * 100;
        return `
            <div class="insight-row">
                <div class="insight-row-label">${escapeHtml(p.label)}</div>
                <div class="insight-row-bar-wrap">
                    <div class="insight-term-bar"><div class="insight-term-bar-fill" style="width:${pct}%"></div></div>
                    <span class="insight-term-count">${fmtSeconds(avg)}</span>
                </div>
            </div>`;
    }).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_phase_time')}</div>
            <div class="insight-card-body">${body}</div>
        </div>`;
}

function renderTimePressureCard(timeStats) {
    if (timeStats.totalMoves === 0) return renderTimeStatsEmptyCard(t('insights_time_pressure'));
    const n = timeStats.timePressureMoves;
    const pct = (n / timeStats.totalMoves) * 100;
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_time_pressure')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value">${pct.toFixed(1)}%</span>
                    <span class="insight-big-sub">${t('insights_time_pressure_sub').replace('{n}', n).replace('{total}', timeStats.totalMoves)}</span>
                </div>
                <div class="insight-term-bar"><div class="insight-term-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
            </div>
        </div>`;
}

function renderInstantMovesCard(timeStats) {
    if (timeStats.totalMoves === 0) return renderTimeStatsEmptyCard(t('insights_instant'));
    const n = timeStats.instantMoves;
    const pct = (n / timeStats.totalMoves) * 100;
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_instant')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value">${pct.toFixed(1)}%</span>
                    <span class="insight-big-sub">${t('insights_instant_sub').replace('{n}', n).replace('{total}', timeStats.totalMoves)}</span>
                </div>
                <div class="insight-term-bar"><div class="insight-term-bar-fill" style="width:${Math.min(pct, 100)}%"></div></div>
            </div>
        </div>`;
}

function renderTimeOfDayCard(timeBuckets) {
    const order = ['morning', 'afternoon', 'evening', 'night'];
    const labelMap = {
        morning: t('insights_tod_morning'),
        afternoon: t('insights_tod_afternoon'),
        evening: t('insights_tod_evening'),
        night: t('insights_tod_night'),
    };
    const rows = order
        .filter(k => timeBuckets[k].games > 0)
        .map(k => ({ label: labelMap[k], stats: timeBuckets[k] }));
    return renderRowCard(t('insights_time_of_day'), rows);
}

function renderInsights(insights, opts = {}) {
    if (insights.overall.games === 0) {
        insightsBody.innerHTML = `<div class="insight-empty-state">${t('insights_no_games')}</div>`;
        return;
    }
    const cards = [renderOverallCard(insights.overall)];
    // 흑백 카드: 흑백 필터가 'all'일 때만 의미 있음 (필터 적용 시 한쪽만 표시되어 redundant).
    if (opts.showColorCard !== false) {
        cards.push(renderColorCard(insights.byColor));
    }
    // 타임 컨트롤 카드: 마찬가지로 'all'일 때만.
    if (opts.showTimeClassCard !== false) {
        cards.push(renderTimeClassCard(insights.byTimeClass));
    }
    cards.push(
        renderOpeningsCard(insights.topOpenings),
        renderAvgThinkCard(insights.timeStats),
        renderPhaseTimeCard(insights.timeStats),
        renderTimePressureCard(insights.timeStats),
        renderInstantMovesCard(insights.timeStats),
        renderMoveLengthCard(insights.moveBuckets),
        renderTerminationCard(insights.termination, insights.overall.games),
        renderTimeOfDayCard(insights.timeBuckets),
    );
    insightsBody.innerHTML = cards.join('');
}

function renderSkeleton() {
    insightsBody.innerHTML = `
        <div class="insight-skeleton"></div>
        <div class="insight-skeleton"></div>
        <div class="insight-skeleton"></div>
    `;
}

// ==========================================
// Public API
// ==========================================
// 현재 필터(타임 컨트롤 + 흑백) + 캐시된 게임으로 다시 compute & render. 재 fetch 없음.
function recomputeAndRender() {
    if (!lastInsightsGames || !lastInsightsUser) return;
    const tc = insightsTimeClassFilter;
    const color = insightsColorFilter;

    let filtered = lastInsightsGames;
    if (tc !== 'all') {
        filtered = filtered.filter(g => (g.time_class || '') === tc);
    }
    if (color !== 'all') {
        filtered = filtered.filter(g => {
            const isWhite = isWhitePlayer(g, lastInsightsUser);
            return color === 'white' ? isWhite : !isWhite;
        });
    }

    const insights = computeInsights(filtered, lastInsightsUser);
    renderInsights(insights, {
        // 타임 컨트롤 카드: 필터가 'all'일 때만 의미 있음 (한 종류만 표시되어 redundant)
        showTimeClassCard: tc === 'all',
        // 흑백 카드: 마찬가지
        showColorCard: color === 'all',
    });
    updateInsightsSubtitle(lastInsightsGames.length, filtered.length);
}

function updateInsightsSubtitle(total, filteredCount) {
    if (!insightsSubtitle) return;
    const labelParts = [];
    if (insightsTimeClassFilter !== 'all') {
        labelParts.push(t(TC_LABEL_KEY[insightsTimeClassFilter] || ''));
    }
    if (insightsColorFilter !== 'all') {
        labelParts.push(t(COLOR_LABEL_KEY[insightsColorFilter] || ''));
    }
    if (labelParts.length === 0) {
        insightsSubtitle.textContent = t('insights_subtitle_n').replace('{n}', total);
    } else {
        insightsSubtitle.textContent = t('insights_subtitle_filtered')
            .replace('{total}', total)
            .replace('{label}', labelParts.join(' · '))
            .replace('{n}', filteredCount);
    }
}

// 데이터 로드. 뷰 가시성은 main.js의 renderScreen이 단독 관리.
export async function loadInsightsData() {
    const username = getMyUserId();
    if (!username) {
        insightsBody.innerHTML = `<div class="insight-empty-state">${t('insights_need_username')}</div>`;
        if (insightsSubtitle) insightsSubtitle.textContent = '';
        return;
    }

    if (insightsSubtitle) insightsSubtitle.textContent = '';
    renderSkeleton();

    try {
        const games = await fetchRecentGames(username, INSIGHTS_GAMES_LIMIT);
        // 무거운 동기 계산(100게임 × PGN 파싱)을 다음 frame으로 미뤄 화면 전환 잔렉 제거.
        // rAF + setTimeout 0 = 화면이 그려진 뒤 계산 시작 → 부드러운 전환 + 짧은 스켈레톤.
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        lastInsightsGames = games;
        lastInsightsUser = username.toLowerCase();
        recomputeAndRender();
    } catch (err) {
        console.error('Insights fetch error:', err);
        insightsBody.innerHTML = `<div class="insight-empty-state">${t('insights_fetch_error')}</div>`;
        if (insightsSubtitle) insightsSubtitle.textContent = '';
    }
}

export function initInsights() {
    if (insightsBackBtn) {
        insightsBackBtn.addEventListener('click', () => history.back());
    }
    if (insightsTimeFilterBar) {
        insightsTimeFilterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill-btn');
            if (!btn) return;
            const tc = btn.dataset.tc;
            if (!tc || tc === insightsTimeClassFilter) return;
            insightsTimeClassFilter = tc;
            insightsTimeFilterBar.querySelectorAll('.pill-btn').forEach(b => {
                b.classList.toggle('selected', b.dataset.tc === tc);
            });
            recomputeAndRender();
        });
    }
    if (insightsColorFilterBar) {
        insightsColorFilterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill-btn');
            if (!btn) return;
            const color = btn.dataset.color;
            if (!color || color === insightsColorFilter) return;
            insightsColorFilter = color;
            insightsColorFilterBar.querySelectorAll('.pill-btn').forEach(b => {
                b.classList.toggle('selected', b.dataset.color === color);
            });
            recomputeAndRender();
        });
    }
}
