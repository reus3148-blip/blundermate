import { fetchRecentGames } from './chessApi.js';
import { getMyUserId } from './storage.js';
import { escapeHtml, parseOpeningFromPgn, rootOpeningName, subVariantName, isWhitePlayer, classifyGameResult, extractMoveTimesForUser } from './utils.js';
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
const insightsSubtitle = document.getElementById('insightsSubtitle');
const insightsCategoryTabs = document.getElementById('insightsCategoryTabs');

// 통계 화면 필터 상태.
// timeClass: 'all' | 'rapid' | 'blitz' | 'bullet' (기본 rapid — 일반 사용자가 가장 자주 보는 시간대)
// color: 'all' | 'white' | 'black' (기본 all — 오프닝은 흑백 분리해서 봐야 의미 있지만 첫 진입은 종합 보기)
// category: 'summary' | 'results' | 'openings' | 'patterns'
//   design_handoff_insights_dashboard §2의 B-A 4탭 구조.
let insightsTimeClassFilter = 'rapid';
let insightsColorFilter = 'all';
let insightsCategoryFilter = 'summary';
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
    // root family로만 그룹화 — 변종까지 쪼개면 통계가 너무 세분화돼 의미가 약해짐.
    //   "Sicilian Defense Najdorf ..." & "Sicilian Defense Dragon ..." → 모두 "Sicilian Defense"로 합산.
    // 변종은 fullName으로 별도 보존 — 행 클릭 시 인라인 확장에서 사용.
    if (name) {
        const root = rootOpeningName(name);
        return { key: root, eco, root, fullName: name };
    }
    if (eco) return { key: eco, eco, root: '', fullName: '' };
    return null;
}

// JS Date.getDay()는 0=Sunday. 우리는 mon..sun 순서로 표시하므로 키 매핑.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function dayOfWeekKey(endTime) {
    if (!endTime) return null;
    return DAY_KEYS[new Date(endTime * 1000).getDay()];
}

// 상대 레이팅 - 내 레이팅 → 5단 버킷.
// 학습 가치를 위해 ±50 이내는 "비슷", ±200 이상은 "훨씬 강/약". 그 사이는 중간 단계.
function opponentDiffBucket(game, isWhite) {
    const my  = (isWhite ? game.white : game.black).rating;
    const opp = (isWhite ? game.black : game.white).rating;
    if (!my || !opp) return null;
    const d = opp - my;
    if (d <= -200) return 'much_lower';
    if (d <= -50)  return 'lower';
    if (d <  50)   return 'similar';
    if (d <  200)  return 'higher';
    return 'much_higher';
}

// PGN에서 헤더/시계 주석/이동번호 제거 후 토큰화 → 사용자 수만 추출.
// 캐슬링/캡쳐 분석에 공통 사용. chess.js 파싱 대비 ~10배 빠름.
// 이동번호는 "1." (백) / "1..." (흑 재개) 둘 다 가능, 공백 유무 모두 처리:
//   "1. e4" → " e4"
//   "1.e4"  → " e4"
//   "1...e5" → " e5"
function extractUserMoves(pgn, isUserWhite) {
    if (!pgn) return [];
    const body = pgn
        .replace(/^\[[^\]]*\]\s*\n?/gm, '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\d+\.+/g, ' '); // 이동번호 제거 (공백 유무 무관)
    const allMoves = [];
    for (const tok of body.split(/\s+/)) {
        if (!tok) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue; // result
        allMoves.push(tok);
    }
    const userMoves = [];
    const start = isUserWhite ? 0 : 1;
    for (let i = start; i < allMoves.length; i += 2) userMoves.push(allMoves[i]);
    return userMoves;
}

// 사용자 수 리스트에서 첫수 분류 / 캐슬 사이드 / 캡쳐 카운트를 한 번에 추출.
// 게임당 PGN 파싱 1회로 줄임 (100게임 × 3회 → 1회).
function analyzeUserMoves(userMoves) {
    if (userMoves.length === 0) return null;
    // 첫 수 — NAG (!, ?, !!, ?!, +, # 등) 제거 후 분류
    const first = userMoves[0].replace(/[+#?!]+$/, '');
    let firstMove;
    if (first === 'e4' || first === 'd4' || first === 'c4' || first === 'Nf3') firstMove = first;
    else firstMove = 'other';
    // 캐슬링 사이드 — 첫 등장
    let castle = 'none';
    for (const m of userMoves) {
        if (m.startsWith('O-O-O')) { castle = 'queenside'; break; }
        if (m.startsWith('O-O'))   { castle = 'kingside'; break; }
    }
    // 캡쳐 — 'x' 포함 수 카운트
    let captures = 0;
    for (const m of userMoves) if (m.includes('x')) captures++;
    return { firstMove, castle, captures, total: userMoves.length };
}

function emptyWDL() { return { games: 0, win: 0, draw: 0, loss: 0 }; }
function addResult(bucket, r) {
    bucket.games++;
    bucket[r]++;
}
function winPct(b) { return b.games === 0 ? 0 : Math.round((b.win / b.games) * 100); }

// opts.skipTimeStats=true면 PGN 시계 파싱 생략. 비교용 recent/prior 집계에서 사용
// (시계 통계는 full insights에만 표시되고 delta에 쓰이지 않으므로 100회 파싱 절감).
function computeInsights(games, userLower, opts = {}) {
    const { skipTimeStats = false } = opts;
    const overall = emptyWDL();
    const byColor = { white: emptyWDL(), black: emptyWDL() };
    const byTimeClass = {};
    const openings = new Map();
    const termination = { checkmate: 0, timeout: 0, resign: 0, abandon: 0, draw: 0, other: 0 };
    const moveBuckets = { short: emptyWDL(), medium: emptyWDL(), long: emptyWDL(), marathon: emptyWDL() };
    const timeBuckets = { morning: emptyWDL(), afternoon: emptyWDL(), evening: emptyWDL(), night: emptyWDL() };
    // 신규 집계 — 모두 WDL 버킷 기반
    const byDayOfWeek = { mon: emptyWDL(), tue: emptyWDL(), wed: emptyWDL(), thu: emptyWDL(), fri: emptyWDL(), sat: emptyWDL(), sun: emptyWDL() };
    const byOppDiff = { much_lower: emptyWDL(), lower: emptyWDL(), similar: emptyWDL(), higher: emptyWDL(), much_higher: emptyWDL() };
    const firstMoveWhite = { e4: emptyWDL(), d4: emptyWDL(), c4: emptyWDL(), Nf3: emptyWDL(), other: emptyWDL() };
    const castling = { kingside: emptyWDL(), queenside: emptyWDL(), none: emptyWDL() };
    const tradeActivity = { totalCaptures: 0, totalUserMoves: 0 };
    const opponents = new Map(); // username(lower) → { name, ...wdl }
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
            if (!openings.has(op.key)) openings.set(op.key, { ...emptyWDL(), eco: op.eco, variants: new Map() });
            const bucket = openings.get(op.key);
            addResult(bucket, r);
            // 변종 분해 — 클릭 시 인라인 확장. 변종 없으면 빈 문자열 키 = "기본 라인".
            const variantLabel = (op.fullName && op.root) ? subVariantName(op.fullName, op.root) : '';
            if (!bucket.variants.has(variantLabel)) bucket.variants.set(variantLabel, { ...emptyWDL(), label: variantLabel });
            addResult(bucket.variants.get(variantLabel), r);
        }

        const term = classifyTermination(game, userLower);
        if (termination[term] !== undefined) termination[term]++;

        const mb = moveCountBucket(game.pgn);
        if (mb) addResult(moveBuckets[mb], r);

        const hb = hourBucket(game.end_time);
        if (hb) addResult(timeBuckets[hb], r);

        const dow = dayOfWeekKey(game.end_time);
        if (dow) addResult(byDayOfWeek[dow], r);

        const od = opponentDiffBucket(game, isWhite);
        if (od) addResult(byOppDiff[od], r);

        // PGN 파싱 1회 → 첫수/캐슬/캡쳐 모두 추출
        const userMoves = extractUserMoves(game.pgn, isWhite);
        const ana = analyzeUserMoves(userMoves);
        if (ana) {
            // 첫 수는 백 게임만 (흑은 백의 응수에 따라가므로 의미 다름)
            if (isWhite) addResult(firstMoveWhite[ana.firstMove], r);
            addResult(castling[ana.castle], r);
            tradeActivity.totalCaptures += ana.captures;
            tradeActivity.totalUserMoves += ana.total;
        } else {
            // PGN 없거나 빈 케이스 — 캐슬 'none' 으로 카운트해서 castling 카드 합 일치 유지
            addResult(castling.none, r);
        }

        // 자주 만난 상대 — 닉네임 lowercase 키, 표시는 displayName 보존
        const oppPlayer = isWhite ? game.black : game.white;
        const oppName = oppPlayer?.username || '';
        if (oppName) {
            const key = oppName.toLowerCase();
            if (!opponents.has(key)) opponents.set(key, { name: oppName, ...emptyWDL() });
            addResult(opponents.get(key), r);
        }

        if (!skipTimeStats) {
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
    }

    const topOpenings = [...openings.entries()]
        .map(([key, stats]) => ({ key, ...stats }))
        .sort((a, b) => b.games - a.games)
        .slice(0, 5);

    // 자주 만난 상대 — 2판 이상만, Top 5
    const topOpponents = [...opponents.values()]
        .filter(o => o.games >= 2)
        .sort((a, b) => b.games - a.games)
        .slice(0, 5);

    return {
        overall, byColor, byTimeClass, topOpenings, openings, termination,
        moveBuckets, timeBuckets, timeStats,
        byDayOfWeek, byOppDiff, firstMoveWhite, castling, tradeActivity, topOpponents,
    };
}

// 레이팅 변화 — 필터 결과 내에서 가장 오래된 게임 → 가장 최근 게임의 사용자 레이팅 차이.
// games는 end_time desc 정렬 가정. 단일 시간제어 필터일 때만 의미 있음(시간제어별 레이팅 다름).
function computeRatingChange(games, userLower) {
    if (!games || games.length < 2) return null;
    // 시간제어가 섞여있으면 레이팅 비교 무의미 — 모두 같은 time_class인지 확인
    const tcs = new Set(games.map(g => g.time_class || 'other'));
    if (tcs.size > 1) return null;
    const ratings = [];
    // 가장 오래된 → 최신 순으로
    for (let i = games.length - 1; i >= 0; i--) {
        const g = games[i];
        const isWhite = isWhitePlayer(g, userLower);
        const r = (isWhite ? g.white : g.black).rating;
        if (r) ratings.push(r);
    }
    if (ratings.length < 2) return null;
    const first = ratings[0], last = ratings[ratings.length - 1];
    const peak = Math.max(...ratings);
    const trough = Math.min(...ratings);
    return { start: first, end: last, delta: last - first, peak, trough, samples: ratings.length };
}

// 비교용 게임 분할: 최근 절반 vs 그 전 절반.
// games는 end_time desc 정렬(가장 최근이 [0])이라 앞쪽이 recent.
// 의미 있는 비교를 위해 각 절반 ≥10게임이 되어야 한다.
function splitForComparison(filtered) {
    if (filtered.length < 20) return null;
    const half = Math.floor(filtered.length / 2);
    return {
        recent: filtered.slice(0, half),
        prior: filtered.slice(half, half * 2), // 홀수면 가운데 1개 버림
    };
}

// 연승/연패 + 최장 기록. games는 end_time desc 정렬.
// 현재 streak: 가장 최근 결과가 무승부면 null. 2 이상부터 의미 있다고 보고 표시.
function computeStreaks(games, userLower) {
    if (games.length === 0) return null;
    const results = games.map(g => classifyGameResult(g, userLower));
    let current = null;
    if (results[0] !== 'draw') {
        let len = 1;
        while (len < results.length && results[len] === results[0]) len++;
        if (len >= 2) current = { kind: results[0], len };
    }
    let longestWin = 0, longestLoss = 0;
    let runKind = null, runLen = 0;
    for (const r of results) {
        if (r === runKind) runLen++;
        else { runKind = r; runLen = 1; }
        if (r === 'win'  && runLen > longestWin)  longestWin  = runLen;
        if (r === 'loss' && runLen > longestLoss) longestLoss = runLen;
    }
    return { current, longestWin, longestLoss };
}

// 결과 흐름(streakiness) — "이번 결과가 직전 결과와 같은 비율"을 무작위 기대값과 비교.
// 무작위 가정 P(같음) = pW² + pD² + pL². 실제 비율이 +8%p 이상이면 연승/연패형, −8%p 이하면 교차형.
// 의미 있는 분류를 위해 30판 이상에서만 활성화.
function computeStreakiness(games, userLower) {
    if (games.length < 30) return null;
    const results = games.map(g => classifyGameResult(g, userLower));
    const N = results.length;

    let continuations = 0;
    for (let i = 1; i < N; i++) {
        if (results[i] === results[i - 1]) continuations++;
    }
    const actual = continuations / (N - 1);

    const counts = { win: 0, draw: 0, loss: 0 };
    for (const r of results) counts[r]++;
    const pW = counts.win / N, pD = counts.draw / N, pL = counts.loss / N;
    const expected = pW * pW + pD * pD + pL * pL;

    const delta = actual - expected;
    let style;
    if (delta >= 0.08) style = 'streaky';
    else if (delta <= -0.08) style = 'alternating';
    else style = 'neutral';

    return { actual, expected, delta, style };
}

// 가장 눈에 띄는 한 줄. 후보 중 |편차| 기반 점수가 가장 높은 것 하나만 출력.
// 후보가 모두 임계 미달이면 null — 노이즈가 narrative로 둔갑하는 걸 방지.
function computeNarrative(insights, recent, prior) {
    const cands = [];
    // 1. 최근 폼 트렌드 — recent 절반 vs 그 전 절반 (양쪽 ≥10게임)
    if (recent && prior && recent.overall.games >= 10 && prior.overall.games >= 10) {
        const d = winPct(recent.overall) - winPct(prior.overall);
        if (Math.abs(d) >= 8) {
            const n = recent.overall.games;
            cands.push({
                score: Math.abs(d) * 1.4, // 트렌드는 narrative로 가장 의미 있어 가중
                text: d > 0
                    ? t('insights_narr_trend_up').replace(/\{n\}/g, n).replace('{d}', `${d}`)
                    : t('insights_narr_trend_down').replace(/\{n\}/g, n).replace('{d}', `${-d}`),
            });
        }
    }
    // 2. 색깔 비대칭 (양쪽 ≥10게임)
    const wc = insights.byColor.white, bk = insights.byColor.black;
    if (wc.games >= 10 && bk.games >= 10) {
        const d = winPct(wc) - winPct(bk);
        if (Math.abs(d) >= 10) {
            cands.push({
                score: Math.abs(d),
                text: d > 0
                    ? t('insights_narr_white_strong').replace('{d}', `${d}`)
                    : t('insights_narr_black_strong').replace('{d}', `${-d}`),
            });
        }
    }
    // 3. 시계 — 시간 압박 / 즉답
    const ts = insights.timeStats;
    if (ts.totalMoves >= 100) {
        const tp = (ts.timePressureMoves / ts.totalMoves) * 100;
        if (tp >= 20) cands.push({
            score: tp - 8,
            text: t('insights_narr_time_pressure').replace('{pct}', tp.toFixed(0)),
        });
        const im = (ts.instantMoves / ts.totalMoves) * 100;
        if (im >= 40) cands.push({
            score: (im - 30) * 0.6,
            text: t('insights_narr_instant').replace('{pct}', im.toFixed(0)),
        });
    }
    // 4. 종료 사유 — 시간패 비중
    const termTotal = Object.values(insights.termination).reduce((sum, n) => sum + n, 0);
    if (termTotal >= 20) {
        const toPct = (insights.termination.timeout / termTotal) * 100;
        if (toPct >= 25) cands.push({
            score: toPct - 12,
            text: t('insights_narr_timeout').replace('{pct}', toPct.toFixed(0)),
        });
    }
    if (cands.length === 0) return null;
    cands.sort((a, b) => b.score - a.score);
    return cands[0].text;
}

// 최근 절반 vs 그 전 절반 승률 차이를 muted 텍스트로. 표시는 ≥3%p에서만.
function deltaSpan(recent, prior, minSample = 5, threshold = 3) {
    if (!recent || !prior || recent.games < minSample || prior.games < minSample) return '';
    const d = winPct(recent) - winPct(prior);
    if (Math.abs(d) < threshold) return '';
    const sign = d > 0 ? '+' : '−'; // unicode minus
    return ` <span class="wdl-delta">${sign}${Math.abs(d)}${t('insights_delta_unit')}</span>`;
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

// 카운트 한 줄 — "12W 5D 7L" 형식. 승률은 별도 열로 빠져서 여기에 없음.
function renderWDLCounts(b) {
    return `<span class="wdl-counts">${b.win}${t('insights_w')} ${b.draw}${t('insights_d')} ${b.loss}${t('insights_l')}</span>`;
}

// hero용 streak 한 줄: 현재 연승/연패 우선.
// 결과 흐름 카드가 보일 때(=샘플 ≥30)는 최장 연승 fallback 생략 — 새 카드와 중복 방지.
function formatStreakLine(streaks, hideExtremes) {
    if (!streaks) return null;
    if (streaks.current) {
        return streaks.current.kind === 'win'
            ? t('insights_streak_current_w').replace('{n}', streaks.current.len)
            : t('insights_streak_current_l').replace('{n}', streaks.current.len);
    }
    if (!hideExtremes && streaks.longestWin >= 3) {
        return t('insights_streak_best_w').replace('{n}', streaks.longestWin);
    }
    return null;
}

// 결과 흐름 카드 — streakiness 라벨 + actual vs expected + 최장 연승/연패.
function renderResultFlowCard(streakiness, streaks) {
    if (!streakiness) return ''; // 30판 미만이면 카드 자체 숨김
    const labelKey = streakiness.style === 'streaky'
        ? 'insights_flow_streaky'
        : streakiness.style === 'alternating'
            ? 'insights_flow_alternating'
            : 'insights_flow_neutral';
    const sub = t('insights_flow_sub')
        .replace('{actual}', Math.round(streakiness.actual * 100))
        .replace('{expected}', Math.round(streakiness.expected * 100));
    let extremesHtml = '';
    if (streaks) {
        const w = streaks.longestWin, l = streaks.longestLoss;
        let txt = '';
        if (w >= 2 && l >= 2) txt = t('insights_flow_extremes').replace('{w}', w).replace('{l}', l);
        else if (w >= 2)      txt = t('insights_flow_extremes_w_only').replace('{w}', w);
        else if (l >= 2)      txt = t('insights_flow_extremes_l_only').replace('{l}', l);
        if (txt) extremesHtml = `<div class="insight-flow-extremes">${escapeHtml(txt)}</div>`;
    }
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_flow_title')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value">${escapeHtml(t(labelKey))}</span>
                    <span class="insight-big-sub">${escapeHtml(sub)}</span>
                </div>
                ${extremesHtml}
            </div>
        </div>`;
}

function renderOverallCard(overall, opts = {}) {
    const { recent, prior, streaks, narrative, streakiness } = opts;
    const heroDelta = (() => {
        if (!recent || !prior || recent.overall.games < 5 || prior.overall.games < 5) return '';
        const d = winPct(recent.overall) - winPct(prior.overall);
        if (Math.abs(d) < 3) return '';
        const sign = d > 0 ? '+' : '−';
        return `<span class="insight-hero-delta">${sign}${Math.abs(d)}${t('insights_delta_unit')}</span>`;
    })();
    const streakLine = formatStreakLine(streaks, !!streakiness);
    const totalText = t('insights_total_n').replace('{n}', overall.games)
        + (streakLine ? ` · ${streakLine}` : '');
    return `
        <div class="insight-card insight-card--hero">
            <div class="insight-hero-top">
                <div class="insight-hero-metric">
                    <div class="insight-hero-value-row">
                        <span class="insight-hero-value">${winPct(overall)}%</span>
                        ${heroDelta}
                    </div>
                    <span class="insight-hero-label">${t('insights_winrate')}</span>
                </div>
                <div class="insight-hero-counts">
                    <div><span class="hero-count hero-count--win">${overall.win}</span><span class="hero-count-label">${t('insights_wins')}</span></div>
                    <div><span class="hero-count hero-count--draw">${overall.draw}</span><span class="hero-count-label">${t('insights_draws')}</span></div>
                    <div><span class="hero-count hero-count--loss">${overall.loss}</span><span class="hero-count-label">${t('insights_losses')}</span></div>
                </div>
            </div>
            ${renderWDLBar(overall)}
            <div class="insight-hero-total">${totalText}</div>
            ${narrative ? `<div class="insight-hero-narrative">${escapeHtml(narrative)}</div>` : ''}
        </div>`;
}

function renderRowCard(title, rows) {
    // 새 row 구조 — header(label-left, %-right), 바, 카운트.
    // 승률 % 가 카드 안에서 동일 column에 정렬되어 row 간 시각 비교가 쉬워짐.
    const body = rows.map(r => {
        const pct = winPct(r.stats);
        const delta = deltaSpan(r.recentStats, r.priorStats);
        return `
        <div class="insight-row">
            <div class="insight-row-header">
                <span class="insight-row-label">${escapeHtml(r.label)}</span>
                <span class="insight-row-pct">${pct}%${delta}</span>
            </div>
            ${renderWDLBar(r.stats)}
            ${renderWDLCounts(r.stats)}
        </div>`;
    }).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${escapeHtml(title)}</div>
            <div class="insight-card-body">${body || `<div class="insight-empty">${t('insights_empty')}</div>`}</div>
        </div>`;
}

// 승률 → HSL 색상 보간. 0%=레드, 50%=중립 그레이, 100%=그린.
// 채도/밝기 모두 거리에 비례해 강해져 50% 근방은 차분하게.
function winRateColor(pct) {
    if (pct >= 50) {
        const t = Math.min((pct - 50) / 50, 1);
        return `hsl(145, ${Math.round(18 + t * 32)}%, ${Math.round(56 - t * 22)}%)`;
    }
    const t = Math.min((50 - pct) / 50, 1);
    return `hsl(5, ${Math.round(18 + t * 38)}%, ${Math.round(56 - t * 18)}%)`;
}

// 분포 카드를 컬럼 차트로. items = [{label, games, winPct}].
// 표본이 모두 0이면 카드 자체 빈 상태로.
function renderColumnChartCard(title, items) {
    const meaningful = items.filter(i => i.games > 0);
    if (meaningful.length === 0) {
        return `
            <div class="insight-card">
                <div class="insight-card-title">${escapeHtml(title)}</div>
                <div class="insight-card-body"><div class="insight-empty">${t('insights_empty')}</div></div>
            </div>`;
    }
    const max = Math.max(...meaningful.map(i => i.games));
    const cols = items.map(i => {
        const isEmpty = i.games === 0;
        const heightPct = isEmpty ? 0 : Math.max(2, (i.games / max) * 100);
        const barClass = isEmpty ? 'insight-col-bar insight-col-bar--empty' : 'insight-col-bar';
        const barStyle = isEmpty ? '' : `height:${heightPct}%; background:${winRateColor(i.winPct)};`;
        const valueText = isEmpty ? '' : `${i.winPct}%`;
        return `
            <div class="insight-col">
                <div class="insight-col-value">${valueText}</div>
                <div class="insight-col-bar-wrap">
                    <div class="${barClass}" style="${barStyle}"></div>
                </div>
                <div class="insight-col-label">${escapeHtml(i.label)}</div>
                <div class="insight-col-count">${isEmpty ? '—' : i.games}</div>
            </div>`;
    }).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${escapeHtml(title)}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-cols">${cols}</div>
            </div>
        </div>`;
}

// WDL 버킷 객체를 column chart items로 변환.
function bucketToColumnItems(buckets, order, labelMap) {
    return order.map(k => ({
        label: labelMap[k],
        games: buckets[k]?.games || 0,
        winPct: buckets[k] ? winPct(buckets[k]) : 0,
    }));
}

function renderColorCard(byColor, recent, prior) {
    return renderRowCard(t('insights_by_color'), [
        {
            label: t('insights_white'), stats: byColor.white,
            recentStats: recent?.byColor?.white, priorStats: prior?.byColor?.white,
        },
        {
            label: t('insights_black'), stats: byColor.black,
            recentStats: recent?.byColor?.black, priorStats: prior?.byColor?.black,
        },
    ].filter(r => r.stats.games > 0));
}

function renderTimeClassCard(byTimeClass, recent, prior) {
    const order = ['rapid', 'blitz', 'bullet', 'daily'];
    const labelMap = { rapid: 'Rapid', blitz: 'Blitz', bullet: 'Bullet', daily: 'Daily' };
    const buildRow = (tc, label) => ({
        label,
        stats: byTimeClass[tc],
        recentStats: recent?.byTimeClass?.[tc],
        priorStats: prior?.byTimeClass?.[tc],
    });
    const rows = order
        .filter(tc => byTimeClass[tc] && byTimeClass[tc].games > 0)
        .map(tc => buildRow(tc, labelMap[tc]));
    Object.keys(byTimeClass).forEach(tc => {
        if (!order.includes(tc) && byTimeClass[tc].games > 0) {
            rows.push(buildRow(tc, tc));
        }
    });
    return renderRowCard(t('insights_by_tc'), rows);
}

function renderOpeningsCard(topOpenings, recent, prior) {
    if (topOpenings.length === 0) {
        return `
            <div class="insight-card">
                <div class="insight-card-title">${t('insights_top_openings')}</div>
                <div class="insight-card-body"><div class="insight-empty">${t('insights_empty')}</div></div>
            </div>`;
    }
    const body = topOpenings.map(op => {
        const label = op.key;
        const pct = winPct(op);
        const delta = deltaSpan(recent?.openings?.get(op.key), prior?.openings?.get(op.key));
        // 변종 행 — base는 마지막에, 나머지는 게임 수 내림차순. 1개뿐이면 펼쳐도 의미 없으므로 토글 숨김.
        const variantRows = [...(op.variants || [])]
            .map(([, v]) => ({ label: v.label || t('insights_opening_base'), isBase: !v.label, stats: v }))
            .sort((a, b) => Number(a.isBase) - Number(b.isBase) || b.stats.games - a.stats.games);
        const expandable = variantRows.length > 1;
        const variantHtml = expandable ? variantRows.map(vr => `
            <div class="insight-row insight-row--variant">
                <div class="insight-row-header">
                    <span class="insight-row-label">${escapeHtml(vr.label)}</span>
                    <span class="insight-row-pct">${winPct(vr.stats)}%</span>
                </div>
                ${renderWDLBar(vr.stats)}
                ${renderWDLCounts(vr.stats)}
            </div>`).join('') : '';
        const chev = expandable
            ? `<svg class="insight-row-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`
            : '';
        const rowClass = expandable ? 'insight-row insight-row--expandable' : 'insight-row';
        const ariaAttrs = expandable ? `role="button" tabindex="0" aria-expanded="false"` : '';
        return `
            <div class="${rowClass}" ${ariaAttrs}>
                <div class="insight-row-header">
                    <span class="insight-row-label">${escapeHtml(label)}${chev}</span>
                    <span class="insight-row-pct">${pct}%${delta}</span>
                </div>
                ${renderWDLBar(op)}
                ${renderWDLCounts(op)}
                ${variantHtml ? `<div class="insight-row-variants hidden">${variantHtml}</div>` : ''}
            </div>`;
    }).join('');
    return `
        <div class="insight-card">
            <div class="insight-card-title">${escapeHtml(t('insights_top_openings'))}</div>
            <div class="insight-card-body">${body}</div>
        </div>`;
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

function renderMoveLengthCard(moveBuckets, recent, prior) {
    const order = ['short', 'medium', 'long', 'marathon'];
    const labelMap = {
        short: t('insights_len_short'),
        medium: t('insights_len_medium'),
        long: t('insights_len_long'),
        marathon: t('insights_len_marathon'),
    };
    const rows = order
        .filter(k => moveBuckets[k].games > 0)
        .map(k => ({
            label: labelMap[k], stats: moveBuckets[k],
            recentStats: recent?.moveBuckets?.[k], priorStats: prior?.moveBuckets?.[k],
        }));
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
        // 단일 바 + 우측 값 — termination 카드와 동일 구조로 통일
        return `
            <div class="insight-term-row">
                <div class="insight-term-label">${escapeHtml(p.label)}</div>
                <div class="insight-term-bar-wrap">
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
    const labelMap = Object.fromEntries(order.map(k => [k, t(`insights_tod_short_${k}`)]));
    return renderColumnChartCard(t('insights_time_of_day'),
        bucketToColumnItems(timeBuckets, order, labelMap));
}

// ──────────────────────────────────────────────────────────────────
// 신규 카드들 (Stockfish 없이 PGN/헤더만으로)
// ──────────────────────────────────────────────────────────────────

function renderDayOfWeekCard(byDayOfWeek) {
    const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const labelMap = Object.fromEntries(order.map(k => [k, t(`insights_dow_short_${k}`)]));
    return renderColumnChartCard(t('insights_day_of_week'),
        bucketToColumnItems(byDayOfWeek, order, labelMap));
}

function renderOpponentDiffCard(byOppDiff) {
    const order = ['much_lower', 'lower', 'similar', 'higher', 'much_higher'];
    const labelMap = Object.fromEntries(order.map(k => [k, t(`insights_opp_short_${k}`)]));
    return renderColumnChartCard(t('insights_opp_diff'),
        bucketToColumnItems(byOppDiff, order, labelMap));
}

function renderFirstMoveCard(firstMoveWhite) {
    const total = Object.values(firstMoveWhite).reduce((s, b) => s + b.games, 0);
    if (total < 5) return '';
    const order = ['e4', 'd4', 'c4', 'Nf3', 'other'];
    const labelMap = {
        e4: 'e4', d4: 'd4', c4: 'c4', Nf3: 'Nf3',
        other: t('insights_first_move_other'),
    };
    return renderColumnChartCard(t('insights_first_move'),
        bucketToColumnItems(firstMoveWhite, order, labelMap));
}

function renderCastlingCard(castling, recent, prior) {
    const order = ['kingside', 'queenside', 'none'];
    const labelMap = {
        kingside:  t('insights_castle_king'),
        queenside: t('insights_castle_queen'),
        none:      t('insights_castle_none'),
    };
    const rows = order
        .filter(k => castling[k].games > 0)
        .map(k => ({
            label: labelMap[k], stats: castling[k],
            recentStats: recent?.castling?.[k], priorStats: prior?.castling?.[k],
        }));
    return renderRowCard(t('insights_castling'), rows);
}

function renderTradeActivityCard(tradeActivity) {
    if (tradeActivity.totalUserMoves === 0) {
        return `
            <div class="insight-card">
                <div class="insight-card-title">${t('insights_trade_activity')}</div>
                <div class="insight-card-body"><div class="insight-empty">${t('insights_empty')}</div></div>
            </div>`;
    }
    const ratio = tradeActivity.totalCaptures / tradeActivity.totalUserMoves;
    const pct = ratio * 100;
    // ratio 기반 라벨: 낮음 < 12% / 보통 12-20% / 활발 20-28% / 매우 활발 > 28%
    let styleKey;
    if (ratio < 0.12)      styleKey = 'insights_trade_passive';
    else if (ratio < 0.20) styleKey = 'insights_trade_balanced';
    else if (ratio < 0.28) styleKey = 'insights_trade_active';
    else                   styleKey = 'insights_trade_aggressive';
    const sub = t('insights_trade_sub')
        .replace('{cap}', tradeActivity.totalCaptures)
        .replace('{total}', tradeActivity.totalUserMoves);
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_trade_activity')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value">${pct.toFixed(1)}%</span>
                    <span class="insight-big-sub">${escapeHtml(t(styleKey))} · ${escapeHtml(sub)}</span>
                </div>
                <div class="insight-term-bar"><div class="insight-term-bar-fill" style="width:${Math.min(pct * 2.5, 100)}%"></div></div>
            </div>
        </div>`;
}

function renderOpponentsCard(topOpponents) {
    if (!topOpponents || topOpponents.length === 0) {
        return ''; // 2판 이상 만난 사람 없으면 카드 자체 숨김
    }
    const rows = topOpponents.map(o => ({
        label: o.name, stats: o,
    }));
    return renderRowCard(t('insights_top_opponents'), rows);
}

function renderRatingChangeCard(ratingChange) {
    if (!ratingChange) return ''; // 시간제어 'all' 또는 샘플 부족 시 숨김
    const { start, end, delta, peak, trough, samples } = ratingChange;
    const deltaSign = delta > 0 ? '+' : (delta < 0 ? '−' : '');
    const deltaAbs = Math.abs(delta);
    const deltaColor = delta > 0 ? 'var(--win)' : (delta < 0 ? 'var(--loss)' : 'var(--tx2)');
    const sub = t('insights_rating_sub')
        .replace('{start}', start)
        .replace('{end}', end)
        .replace('{n}', samples);
    const range = t('insights_rating_range')
        .replace('{peak}', peak)
        .replace('{trough}', trough);
    return `
        <div class="insight-card">
            <div class="insight-card-title">${t('insights_rating_change')}</div>
            <div class="insight-card-body insight-card-body--single">
                <div class="insight-big-metric">
                    <span class="insight-big-value" style="color:${deltaColor};">${deltaSign}${deltaAbs}</span>
                    <span class="insight-big-sub">${escapeHtml(sub)}</span>
                </div>
                <div class="insight-rating-range">${escapeHtml(range)}</div>
            </div>
        </div>`;
}

// 인접 카드들을 grid 페어로 묶음. 빈 카드 자동 제외.
//   pairCards(a)         → a (solo, no wrap)
//   pairCards(a, b)      → 2-up grid
//   pairCards(a, b, c)   → 3-up grid
//   모두 빈 카드면        → '' (페어 자체 사라짐)
function pairCards(...cards) {
    const filled = cards.filter(c => c && c.trim());
    if (filled.length === 0) return '';
    if (filled.length === 1) return filled[0];
    const cls = filled.length >= 3 ? 'insight-pair insight-pair--3' : 'insight-pair';
    return `<div class="${cls}">${filled.join('')}</div>`;
}

// 4탭 카드 빌더 (design_handoff_insights_dashboard §2 매핑).
//   summary:  hero 요약 + 결과 흐름 + 레이팅 변화
//   results:  by-color + termination + castling + trade activity
//   openings: by-time-class + top openings + first move
//   patterns: 게임 길이 + 시간대/요일 + 시계 + 단계별 + 상대 레이팅 차이 + 자주 만난 상대
function buildSummaryCards(insights, opts) {
    const { recent, prior, streaks, narrative, streakiness, ratingChange } = opts;
    const cards = [renderOverallCard(insights.overall, { recent, prior, streaks, narrative, streakiness })];
    const flowCard = renderResultFlowCard(streakiness, streaks);
    if (flowCard) cards.push(flowCard);
    const ratingCard = renderRatingChangeCard(ratingChange);
    if (ratingCard) cards.push(ratingCard);
    return cards;
}

function buildResultsCards(insights, opts) {
    const { recent, prior } = opts;
    const cards = [];
    if (opts.showColorCard !== false) cards.push(renderColorCard(insights.byColor, recent, prior));
    cards.push(renderTerminationCard(insights.termination, insights.overall.games));
    cards.push(renderCastlingCard(insights.castling, recent, prior));
    cards.push(renderTradeActivityCard(insights.tradeActivity));
    return cards;
}

function buildOpeningsCards(insights, opts) {
    const { recent, prior } = opts;
    const cards = [];
    if (opts.showTimeClassCard !== false) cards.push(renderTimeClassCard(insights.byTimeClass, recent, prior));
    cards.push(renderOpeningsCard(insights.topOpenings, recent, prior));
    cards.push(renderFirstMoveCard(insights.firstMoveWhite));
    return cards;
}

function buildPatternsCards(insights, opts) {
    const { recent, prior } = opts;
    return [
        renderMoveLengthCard(insights.moveBuckets, recent, prior),
        renderTimeOfDayCard(insights.timeBuckets),
        renderDayOfWeekCard(insights.byDayOfWeek),
        pairCards(
            renderAvgThinkCard(insights.timeStats),
            renderTimePressureCard(insights.timeStats),
            renderInstantMovesCard(insights.timeStats),
        ),
        renderPhaseTimeCard(insights.timeStats),
        // 상대 관련 카드 묶음(레이팅 차이별 성적 + 자주 만난 상대) — 둘 다 "vs 상대" 관점.
        renderOpponentDiffCard(insights.byOppDiff),
        renderOpponentsCard(insights.topOpponents),
    ];
}

const CATEGORY_BUILDERS = {
    summary:  buildSummaryCards,
    results:  buildResultsCards,
    openings: buildOpeningsCards,
    patterns: buildPatternsCards,
};

function renderInsights(insights, opts = {}) {
    if (insights.overall.games === 0) {
        insightsBody.innerHTML = `<div class="insight-empty-state">${t('insights_no_games')}</div>`;
        return;
    }
    const builder = CATEGORY_BUILDERS[insightsCategoryFilter] || buildSummaryCards;
    const cards = builder(insights, opts);
    const html = cards.filter(c => c).join('');
    insightsBody.innerHTML = html || `<div class="insight-empty-state">${t('insights_empty')}</div>`;
    insightsBody.scrollTop = 0;
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
    // 비교 델타용 — 필터된 게임을 두 절반으로 쪼개 각각 집계.
    const split = splitForComparison(filtered);
    // 비교용 절반 집계는 시계 통계 불필요 — 명시적으로 끔.
    const recent = split ? computeInsights(split.recent, lastInsightsUser, { skipTimeStats: true }) : null;
    const prior  = split ? computeInsights(split.prior,  lastInsightsUser, { skipTimeStats: true }) : null;
    const streaks = computeStreaks(filtered, lastInsightsUser);
    const streakiness = computeStreakiness(filtered, lastInsightsUser);
    const narrative = computeNarrative(insights, recent, prior);
    // 레이팅 변화 — 단일 시간제어 + 단일 색깔 필터일 때만 의미 있음(섞이면 다른 풀)
    const ratingChange = computeRatingChange(filtered, lastInsightsUser);
    renderInsights(insights, {
        // 타임 컨트롤 카드: 필터가 'all'일 때만 의미 있음 (한 종류만 표시되어 redundant)
        showTimeClassCard: tc === 'all',
        // 흑백 카드: 마찬가지
        showColorCard: color === 'all',
        recent, prior, streaks, streakiness, narrative,
        ratingChange,
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
    // 홈의 home-tc-filter 패턴과 동일.
    function makeScopeSetter({ valid, get, set, labelId, menuId, dataAttr, keyFor }) {
        return (value) => {
            if (!valid.includes(value) || value === get()) return;
            set(value);
            const labelEl = document.getElementById(labelId);
            if (labelEl) {
                const key = keyFor(value);
                labelEl.setAttribute('data-i18n', key);
                labelEl.textContent = t(key);
            }
            document.querySelectorAll(`#${menuId} .insights-scope-filter-option`).forEach(opt => {
                opt.setAttribute('aria-checked', opt.dataset[dataAttr] === value ? 'true' : 'false');
            });
            recomputeAndRender();
        };
    }
    const setInsightsTimeClassFilter = makeScopeSetter({
        valid: ['all', 'rapid', 'blitz', 'bullet'],
        get: () => insightsTimeClassFilter,
        set: (v) => { insightsTimeClassFilter = v; },
        labelId: 'insightsTcFilterLabel',
        menuId: 'insightsTcFilterMenu',
        dataAttr: 'tc',
        keyFor: (tc) => `home_filter_${tc}`,
    });
    const setInsightsColorFilter = makeScopeSetter({
        valid: ['all', 'white', 'black'],
        get: () => insightsColorFilter,
        set: (v) => { insightsColorFilter = v; },
        labelId: 'insightsColorFilterLabel',
        menuId: 'insightsColorFilterMenu',
        dataAttr: 'color',
        keyFor: (c) => c === 'all' ? 'saved_games_filter_all' : `insights_${c}`,
    });

    function toggleScopeMenu(triggerId, menuId, forceState) {
        const trigger = document.getElementById(triggerId);
        const menu = document.getElementById(menuId);
        if (!trigger || !menu) return;
        const open = forceState !== undefined ? forceState : menu.classList.contains('hidden');
        // 한 번에 메뉴 하나만 — 다른 메뉴가 열려있으면 닫기.
        if (open) closeAllScopeMenus(menuId);
        menu.classList.toggle('hidden', !open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeAllScopeMenus(exceptMenuId) {
        ['insightsTcFilterMenu', 'insightsColorFilterMenu'].forEach(id => {
            if (id === exceptMenuId) return;
            const m = document.getElementById(id);
            if (m && !m.classList.contains('hidden')) {
                m.classList.add('hidden');
                const triggerId = id.replace('Menu', 'Btn');
                document.getElementById(triggerId)?.setAttribute('aria-expanded', 'false');
            }
        });
    }

    document.getElementById('insightsTcFilterBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScopeMenu('insightsTcFilterBtn', 'insightsTcFilterMenu');
    });
    document.getElementById('insightsTcFilterMenu')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.insights-scope-filter-option');
        if (!opt) return;
        e.stopPropagation();
        setInsightsTimeClassFilter(opt.dataset.tc);
        toggleScopeMenu('insightsTcFilterBtn', 'insightsTcFilterMenu', false);
    });
    document.getElementById('insightsColorFilterBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleScopeMenu('insightsColorFilterBtn', 'insightsColorFilterMenu');
    });
    document.getElementById('insightsColorFilterMenu')?.addEventListener('click', (e) => {
        const opt = e.target.closest('.insights-scope-filter-option');
        if (!opt) return;
        e.stopPropagation();
        setInsightsColorFilter(opt.dataset.color);
        toggleScopeMenu('insightsColorFilterBtn', 'insightsColorFilterMenu', false);
    });
    // 외부 클릭 / ESC 시 닫기.
    document.addEventListener('click', (e) => {
        if (e.target.closest('.insights-scope-filter')) return;
        closeAllScopeMenus();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeAllScopeMenus();
    });

    if (insightsCategoryTabs) {
        insightsCategoryTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.insights-cat-tab');
            if (!btn) return;
            const cat = btn.dataset.cat;
            if (!cat || cat === insightsCategoryFilter) return;
            insightsCategoryFilter = cat;
            insightsCategoryTabs.querySelectorAll('.insights-cat-tab').forEach(b => {
                const isSelected = b.dataset.cat === cat;
                b.classList.toggle('selected', isSelected);
                b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            recomputeAndRender();
        });
    }
    // 오프닝 행 인라인 확장 — 클릭/Enter/Space 토글. innerHTML로 매번 다시 그려지므로 위임 방식.
    if (insightsBody) {
        const toggleRow = (row) => {
            const variants = row.querySelector('.insight-row-variants');
            if (!variants) return;
            const isExpanded = row.getAttribute('aria-expanded') === 'true';
            row.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
            variants.classList.toggle('hidden', isExpanded);
        };
        insightsBody.addEventListener('click', (e) => {
            // 변종 행 자체 클릭은 부모로 버블링되므로 가드.
            if (e.target.closest('.insight-row--variant')) return;
            const row = e.target.closest('.insight-row--expandable');
            if (row) toggleRow(row);
        });
        insightsBody.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const row = e.target.closest('.insight-row--expandable');
            if (!row) return;
            e.preventDefault();
            toggleRow(row);
        });
    }
}
