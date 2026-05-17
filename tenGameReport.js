import { fetchRecentGames } from './chessApi.js';
import {
    getMyPlatform,
    getMyUserId,
    getRecentAnalyzedGames,
    getTenReportCursor,
    getTenReportProgressCount,
    getTenReports,
    markTenReportCursorAt,
    saveTenReport,
} from './storage.js';
import { getLocale, t } from './strings.js';

const SHORT_REPORT_TARGET = 10;
const LONG_BASELINE_LIMIT = 500;
const LIGHT_BASELINE_MIN = 100;
const TEN_REPORT_AUTO_CREATE_ENABLED = false;
const CRITICAL_CLASSES = new Set(['Blunder', 'Mistake']);
const PHASES = ['opening', 'middlegame', 'endgame'];
const LOSS_CODES = new Set(['checkmated', 'timeout', 'resigned', 'abandoned', 'bughousepartnerlose', 'lose']);

const CLASS_KEYS = {
    Brilliant: 'class_brilliant',
    Great: 'class_great',
    Best: 'class_best',
    Excellent: 'class_excellent',
    Good: 'class_good',
    Inaccuracy: 'class_inaccuracy',
    Mistake: 'class_mistake',
    Blunder: 'class_blunder',
    Forced: 'class_forced',
};

let lastBaselineKey = null;
let lastBaselinePromise = null;
let selectedReportId = null;
let reportState = null;

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setHtml(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function setTopBarTitle(value) {
    const el = document.querySelector?.('#tenGameReportView .top-bar-title');
    if (!el) return;
    el.textContent = value;
}

function formatText(key, vars = {}) {
    return Object.entries(vars).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        t(key),
    );
}

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function resultLetter(resultClass) {
    const isKo = getLocale() === 'ko';
    if (resultClass === 'win') return isKo ? '승' : 'W';
    if (resultClass === 'loss') return isKo ? '패' : 'L';
    return isKo ? '무' : 'D';
}

function getDateStrings() {
    return {
        dateToday: t('dateToday'),
        dateYesterday: t('dateYesterday'),
        dateDaysAgo: t('dateDaysAgo'),
    };
}

function formatRelativeDate(dateStr, strings) {
    const d = typeof dateStr === 'number' ? new Date(dateStr * 1000) : new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((todayStart - dStart) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return strings.dateToday;
    if (diffDays === 1) return strings.dateYesterday;
    if (diffDays < 8) return strings.dateDaysAgo.replace('{n}', diffDays);
    const localeTag = getLocale() === 'en' ? 'en-US' : 'ko-KR';
    return d.toLocaleDateString(localeTag, { month: 'numeric', day: 'numeric' });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function rowTime(row) {
    const raw = row?.created_at || row?.played_date;
    if (!raw) return 0;
    const value = String(raw);
    let time = Date.parse(value);
    if (!Number.isFinite(time)) time = Date.parse(value.replace(/\./g, '-'));
    return Number.isFinite(time) ? time : 0;
}

function resetReportShell() {
    setText('tenReportProgressValue', `0/${SHORT_REPORT_TARGET}`);
    setText('tenReportBiasValue', t('ten_report_bias_short'));
    setText('tenReportLongValue', `0/${LONG_BASELINE_LIMIT}`);
    setText('tenReportEngineValue', t('ten_report_engine_short'));
    setText('tenReportBaselineValue', t('ten_report_placeholder'));
    setText('tenReportRecordValue', t('ten_report_placeholder'));
    setText('tenReportCoverageValue', t('ten_report_placeholder'));
    setText('tenReportMistakeValue', t('ten_report_placeholder'));
    setText('tenReportFocusValue', t('ten_report_placeholder'));
    setHtml('tenReportFullBody', '');
}

function baselineStatusFor(count) {
    if (count >= LIGHT_BASELINE_MIN) return t('ten_report_baseline_ready');
    return t('ten_report_baseline_light');
}

async function loadLongBaseline(username) {
    const key = `${getMyPlatform()}:${username.toLowerCase()}`;
    if (lastBaselineKey === key && lastBaselinePromise) return lastBaselinePromise;

    lastBaselineKey = key;
    lastBaselinePromise = fetchRecentGames(username, LONG_BASELINE_LIMIT)
        .catch((err) => {
            if (lastBaselineKey === key) lastBaselinePromise = null;
            throw err;
        });
    return lastBaselinePromise;
}

function getHeaders(row) {
    const raw = row?.headers_json;
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof raw === 'object' ? raw : {};
}

function headerValue(headers, key) {
    return headers[key] ?? headers[key.toLowerCase()] ?? '';
}

function userResultFor(row, username) {
    const headers = getHeaders(row);
    const result = String(headerValue(headers, 'Result') || '');
    if (result === '1/2-1/2') return 'draw';

    const user = username.toLowerCase();
    const white = String(headerValue(headers, 'White') || '').toLowerCase();
    const black = String(headerValue(headers, 'Black') || '').toLowerCase();
    const isWhite = white === user;
    const isBlack = black === user;
    if (!isWhite && !isBlack) return null;
    if (result === '1-0') return isWhite ? 'win' : 'loss';
    if (result === '0-1') return isBlack ? 'win' : 'loss';
    return null;
}

function apiGameResultFor(game, username) {
    const user = username.toLowerCase();
    const isWhite = String(game?.white?.username || '').toLowerCase() === user;
    const isBlack = String(game?.black?.username || '').toLowerCase() === user;
    if (!isWhite && !isBlack) return null;
    const result = String((isWhite ? game.white : game.black)?.result || '');
    if (result === 'win') return 'win';
    if (LOSS_CODES.has(result)) return 'loss';
    return 'draw';
}

function emptyRecord() {
    return { w: 0, d: 0, l: 0, unknown: 0 };
}

function addResult(record, result) {
    if (result === 'win') record.w += 1;
    else if (result === 'loss') record.l += 1;
    else if (result === 'draw') record.d += 1;
    else record.unknown += 1;
}

function reportRecord(rows, username) {
    return rows.reduce((record, row) => {
        addResult(record, userResultFor(row, username));
        return record;
    }, emptyRecord());
}

function recordTotal(record) {
    return record.w + record.d + record.l;
}

function scoreRate(record) {
    const total = recordTotal(record);
    if (!total) return null;
    return (record.w + (record.d * 0.5)) / total;
}

function recordText(record) {
    return formatText('ten_report_record_line', record);
}

function phaseKeyForPly(index) {
    const fullMove = Math.floor(index / 2) + 1;
    if (fullMove <= 10) return 'opening';
    if (fullMove <= 30) return 'middlegame';
    return 'endgame';
}

function emptyClassCounts() {
    return Object.keys(CLASS_KEYS).reduce((acc, key) => {
        acc[key] = 0;
        return acc;
    }, {});
}

function emptyPhaseCounts() {
    return { opening: 0, middlegame: 0, endgame: 0 };
}

function mergeCounts(target, source) {
    Object.keys(source).forEach((key) => {
        target[key] = (target[key] || 0) + source[key];
    });
}

function gameStats(row, index) {
    const moves = row.analysis_json?.moves || [];
    const stats = {
        index,
        row,
        totalMoves: moves.length,
        classCounts: emptyClassCounts(),
        phases: emptyPhaseCounts(),
        blunders: 0,
        mistakes: 0,
        inaccuracies: 0,
        critical: 0,
    };

    moves.forEach((move, plyIndex) => {
        const classification = move?.classification || 'Best';
        if (stats.classCounts[classification] === undefined) stats.classCounts[classification] = 0;
        stats.classCounts[classification] += 1;
        if (classification === 'Blunder') stats.blunders += 1;
        if (classification === 'Mistake') stats.mistakes += 1;
        if (classification === 'Inaccuracy') stats.inaccuracies += 1;
        if (!CRITICAL_CLASSES.has(classification)) return;
        stats.critical += 1;
        stats.phases[phaseKeyForPly(plyIndex)] += 1;
    });

    return stats;
}

function analyzedStats(rows) {
    const stats = {
        gameCount: rows.length,
        totalMoves: 0,
        classCounts: emptyClassCounts(),
        phases: emptyPhaseCounts(),
        blunders: 0,
        mistakes: 0,
        inaccuracies: 0,
        critical: 0,
        cleanGames: 0,
        games: [],
    };

    rows.forEach((row, index) => {
        const perGame = gameStats(row, index);
        stats.games.push(perGame);
        stats.totalMoves += perGame.totalMoves;
        stats.blunders += perGame.blunders;
        stats.mistakes += perGame.mistakes;
        stats.inaccuracies += perGame.inaccuracies;
        stats.critical += perGame.critical;
        if (perGame.critical === 0) stats.cleanGames += 1;
        mergeCounts(stats.classCounts, perGame.classCounts);
        mergeCounts(stats.phases, perGame.phases);
    });

    return stats;
}

function dominantPhaseFromCounts(phases) {
    const [phase] = Object.entries(phases)
        .sort((a, b) => b[1] - a[1])[0] || ['middlegame'];
    return phase;
}

function phaseLabel(phase) {
    if (phase === 'opening') return t('ten_report_phase_opening');
    if (phase === 'endgame') return t('ten_report_phase_endgame');
    return t('ten_report_phase_middlegame');
}

function focusText(stats, phase) {
    if (!stats.critical) return t('ten_report_focus_keep');
    if (phase === 'opening') return t('ten_report_focus_opening');
    if (phase === 'endgame') return t('ten_report_focus_endgame');
    return t('ten_report_focus_middlegame');
}

function biasText(rows, username) {
    const record = reportRecord(rows, username);
    const known = recordTotal(record);
    if (!known) return t('ten_report_bias_unknown');

    const text = recordText(record);
    const decisive = record.w + record.l;
    if (rows.length >= SHORT_REPORT_TARGET && decisive >= 5 && record.w / decisive >= 0.75) {
        return formatText('ten_report_bias_win_heavy', { record: text });
    }
    if (rows.length >= SHORT_REPORT_TARGET && decisive >= 5 && record.l / decisive >= 0.75) {
        return formatText('ten_report_bias_loss_heavy', { record: text });
    }
    return formatText('ten_report_bias_balanced', { record: text });
}

function formScore(stats) {
    if (!stats.gameCount) return 0;
    const penalty = (stats.blunders * 10) + (stats.mistakes * 6) + (stats.inaccuracies * 2);
    return clamp(Math.round(100 - (penalty / stats.gameCount)), 35, 99);
}

function gradeForScore(score) {
    if (score >= 90) return { letter: 'A', label: t('ten_report_grade_a') };
    if (score >= 78) return { letter: 'B', label: t('ten_report_grade_b') };
    if (score >= 65) return { letter: 'C', label: t('ten_report_grade_c') };
    return { letter: 'D', label: t('ten_report_grade_d') };
}

function safePct(value, total) {
    if (!total) return 0;
    return clamp(Math.round((value / total) * 100), 0, 100);
}

function classGroups(stats) {
    const strong = ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Forced']
        .reduce((sum, key) => sum + (stats.classCounts[key] || 0), 0);
    return [
        { key: 'strong', label: t('ten_report_group_strong'), value: strong },
        { key: 'inaccuracy', label: t('class_inaccuracy'), value: stats.inaccuracies },
        { key: 'mistake', label: t('class_mistake'), value: stats.mistakes },
        { key: 'blunder', label: t('class_blunder'), value: stats.blunders },
    ];
}

function tagFromPgn(pgn, tag) {
    const match = String(pgn || '').match(new RegExp(`\\[${tag} "([^"]+)"\\]`));
    return match?.[1] || '';
}

function parseOpeningFromPgn(pgn) {
    const openingTag = tagFromPgn(pgn, 'Opening');
    if (openingTag) return { name: openingTag, eco: tagFromPgn(pgn, 'ECO') };
    const ecoUrl = tagFromPgn(pgn, 'ECOUrl');
    if (!ecoUrl) return { name: '', eco: tagFromPgn(pgn, 'ECO') };
    const rawSlug = ecoUrl.split('/openings/')[1] || '';
    let slug = rawSlug;
    try { slug = decodeURIComponent(rawSlug); } catch {}
    const name = slug
        .replace(/(?:\.\.\.|-)\d+\..*$/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(':', ': ');
    return { name, eco: tagFromPgn(pgn, 'ECO') };
}

function rootOpeningName(fullName) {
    if (!fullName) return '';
    const match = fullName.match(/^((?:\S+\s+){1,2}?(?:Gambit|Defense|Defence|Game|Opening|System|Attack))\b/);
    if (match) return match[1];
    return fullName.split(/\s+/).slice(0, 2).join(' ');
}

function openingNameFromPgn(pgn) {
    const parsed = parseOpeningFromPgn(pgn || '');
    return rootOpeningName(parsed.name) || t('ten_report_unknown_opening');
}

function openingNameForRow(row) {
    return openingNameFromPgn(row?.pgn || '');
}

function groupReportOpenings(rows, username) {
    const map = new Map();
    for (const row of rows) {
        const name = openingNameForRow(row);
        if (!map.has(name)) map.set(name, { name, record: emptyRecord(), count: 0 });
        const entry = map.get(name);
        entry.count += 1;
        addResult(entry.record, userResultFor(row, username));
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);
}

function buildBaselineStats(games, username) {
    const baseline = { count: 0, byOpening: new Map() };
    for (const game of games || []) {
        const result = apiGameResultFor(game, username);
        if (!result) continue;
        const name = openingNameFromPgn(game.pgn || '');
        if (!baseline.byOpening.has(name)) baseline.byOpening.set(name, { name, record: emptyRecord(), count: 0 });
        const entry = baseline.byOpening.get(name);
        entry.count += 1;
        baseline.count += 1;
        addResult(entry.record, result);
    }
    return baseline;
}

function formatDelta(reportRecordValue, baselineRecordValue) {
    const reportRate = scoreRate(reportRecordValue);
    const baselineRate = scoreRate(baselineRecordValue);
    if (reportRate === null || baselineRate === null) return { tone: 'even', text: t('ten_report_opening_baseline_missing') };
    const delta = Math.round((reportRate - baselineRate) * 100);
    if (Math.abs(delta) <= 2) return { tone: 'even', text: t('ten_report_opening_delta_even') };
    const key = delta > 0 ? 'ten_report_opening_delta_up' : 'ten_report_opening_delta_down';
    return { tone: delta > 0 ? 'up' : 'down', text: formatText(key, { d: Math.abs(delta) }) };
}

function reportDate(report) {
    const d = new Date(report?.created_at || Date.now());
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
}

function reportTitle(report) {
    return formatText('ten_report_history_item_title', {
        n: report?.number || 1,
        date: reportDate(report),
    });
}

function createReportId(number) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `ten-report-${Date.now()}-${number}`;
}

function nextReportNumber(reports) {
    return reports.reduce((max, item) => Math.max(max, Number(item.number) || 0), 0) + 1;
}

function makeReport(rows, number) {
    const newest = rows[0];
    const time = rowTime(newest) || Date.now();
    return {
        id: createReportId(number),
        number,
        created_at: new Date(time).toISOString(),
        cursor: time,
        game_ids: rows.map(row => row.id).filter(Boolean),
    };
}

function ensureReportHistory() {
    const allRows = getRecentAnalyzedGames(1000);
    let reports = getTenReports();

    if (!TEN_REPORT_AUTO_CREATE_ENABLED) {
        return { reports, allRows };
    }

    if (reports.length === 0 && allRows.length >= SHORT_REPORT_TARGET) {
        const rows = allRows.slice(0, SHORT_REPORT_TARGET);
        const report = makeReport(rows, 1);
        saveTenReport(report);
        markTenReportCursorAt(rows[0]);
        reports = getTenReports();
    }

    let cursor = getTenReportCursor();
    if (reports.length > 0 && !cursor) {
        const latestReport = reports[0];
        const latestRow = allRows.find(row => row.id === latestReport.game_ids?.[0]);
        if (latestRow) {
            markTenReportCursorAt(latestRow);
            cursor = getTenReportCursor();
        }
    }

    if (cursor) {
        const pendingAsc = allRows
            .filter(row => rowTime(row) > cursor)
            .sort((a, b) => rowTime(a) - rowTime(b));
        let nextNumber = nextReportNumber(reports);
        while (pendingAsc.length >= SHORT_REPORT_TARGET) {
            const batchAsc = pendingAsc.splice(0, SHORT_REPORT_TARGET);
            const batchDesc = batchAsc.slice().reverse();
            const report = makeReport(batchDesc, nextNumber);
            saveTenReport(report);
            markTenReportCursorAt(batchDesc[0]);
            nextNumber += 1;
        }
        reports = getTenReports();
    }

    return { reports, allRows };
}

function rowsForReport(report, rowsById) {
    return (report?.game_ids || [])
        .map(id => rowsById.get(id))
        .filter(Boolean)
        .sort((a, b) => rowTime(b) - rowTime(a));
}

function renderBarRow({ label, value, total, tone }) {
    const pct = safePct(value, total);
    return `
        <div class="ten-report-bar-row ten-report-bar-row--${escapeHtml(tone)}">
            <div class="ten-report-bar-meta">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(String(value))}</strong>
            </div>
            <div class="ten-report-bar-track" aria-hidden="true">
                <span style="width:${pct}%"></span>
            </div>
        </div>
    `;
}

function buildFindings(stats, record, phase) {
    const findings = [];
    if (stats.blunders > 0) findings.push(formatText('ten_report_finding_blunders', { b: stats.blunders }));
    else findings.push(t('ten_report_finding_no_blunders'));
    if (stats.critical > 0) findings.push(formatText('ten_report_finding_phase', { phase: phaseLabel(phase) }));
    else findings.push(t('ten_report_finding_phase_clean'));
    findings.push(formatText('ten_report_finding_record', { record: recordText(record) }));
    return findings;
}

function opponentName(row, username) {
    const headers = getHeaders(row);
    const user = username.toLowerCase();
    const white = String(headerValue(headers, 'White') || '');
    const black = String(headerValue(headers, 'Black') || '');
    if (white.toLowerCase() === user) return black || t('ten_report_unknown_opponent');
    if (black.toLowerCase() === user) return white || t('ten_report_unknown_opponent');
    return white && black ? `${white} / ${black}` : t('ten_report_unknown_opponent');
}

function playedDateLabel(row, dateStrings) {
    const headers = getHeaders(row);
    const raw = row.played_date
        || headerValue(headers, 'UTCDate')
        || headerValue(headers, 'Date')
        || row.created_at;
    if (!raw) return '';
    return formatRelativeDate(String(raw).replace(/\./g, '-'), dateStrings);
}

function renderGameRow(perGame, username, dateStrings) {
    const result = userResultFor(perGame.row, username) || 'unknown';
    const resultText = result === 'unknown' ? t('ten_report_result_unknown') : resultLetter(result);
    const phase = dominantPhaseFromCounts(perGame.phases);
    const badText = perGame.critical > 0
        ? formatText('ten_report_game_bad_line', { n: perGame.critical, phase: phaseLabel(phase) })
        : t('ten_report_game_bad_zero');
    const date = playedDateLabel(perGame.row, dateStrings);
    const opening = openingNameForRow(perGame.row);
    const meta = [opening, badText, date].filter(Boolean).join(' · ');

    return `
        <div class="ten-report-game-row">
            <span class="ten-report-game-result ten-report-game-result--${escapeHtml(result)}">${escapeHtml(resultText)}</span>
            <div class="ten-report-game-main">
                <strong>${escapeHtml(opponentName(perGame.row, username))}</strong>
                <span>${escapeHtml(meta)}</span>
            </div>
        </div>
    `;
}

function renderOpeningPanel(rows, username, baselineStats, baselineStatus) {
    const entries = groupReportOpenings(rows, username);
    if (!entries.length) {
        return `
            <div class="ten-report-panel">
                <div class="ten-report-panel-title">${escapeHtml(t('ten_report_openings_title'))}</div>
                <p class="ten-report-muted">${escapeHtml(t('ten_report_opening_empty'))}</p>
            </div>
        `;
    }

    const body = entries.map((entry) => {
        const baseline = baselineStats?.byOpening?.get(entry.name);
        const delta = baseline
            ? formatDelta(entry.record, baseline.record)
            : { tone: 'even', text: baselineStatus === 'loading' ? t('ten_report_opening_baseline_loading') : t('ten_report_opening_baseline_missing') };
        const baselineText = baseline
            ? formatText('ten_report_opening_baseline_record', { record: recordText(baseline.record), n: baseline.count })
            : t('ten_report_opening_baseline_missing');
        return `
            <div class="ten-report-opening-row">
                <div>
                    <strong>${escapeHtml(entry.name)}</strong>
                    <span>${escapeHtml(formatText('ten_report_opening_report_record', { record: recordText(entry.record) }))}</span>
                    <span>${escapeHtml(baselineText)}</span>
                </div>
                <em class="ten-report-opening-delta ten-report-opening-delta--${escapeHtml(delta.tone)}">${escapeHtml(delta.text)}</em>
            </div>
        `;
    }).join('');

    return `
        <div class="ten-report-panel">
            <div class="ten-report-panel-title">${escapeHtml(t('ten_report_openings_title'))}</div>
            <div class="ten-report-opening-list">${body}</div>
        </div>
    `;
}

function renderFullReport(rows, username, stats, record, baselineStats, baselineStatus) {
    const score = formScore(stats);
    const grade = gradeForScore(score);
    const phase = dominantPhaseFromCounts(stats.phases);
    const avgCritical = (stats.critical / Math.max(stats.gameCount, 1)).toFixed(1);
    const classBars = classGroups(stats)
        .map(group => renderBarRow({
            label: group.label,
            value: group.value,
            total: Math.max(stats.totalMoves, 1),
            tone: group.key,
        }))
        .join('');
    const phaseBars = PHASES
        .map(key => renderBarRow({
            label: phaseLabel(key),
            value: stats.phases[key],
            total: Math.max(stats.critical, 1),
            tone: key,
        }))
        .join('');
    const findings = buildFindings(stats, record, phase)
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('');
    const gameRows = stats.games
        .map(game => renderGameRow(game, username, getDateStrings()))
        .join('');

    return `
        <div class="ten-report-score-panel">
            <div>
                <span class="ten-report-score-label">${escapeHtml(t('ten_report_score_label'))}</span>
                <strong class="ten-report-score-value">${score}</strong>
                <p>${escapeHtml(formatText('ten_report_score_sub', { grade: grade.letter, label: grade.label }))}</p>
            </div>
            <div class="ten-report-grade-badge" aria-label="${escapeHtml(grade.label)}">${escapeHtml(grade.letter)}</div>
        </div>

        <div class="ten-report-stat-grid">
            <div>
                <span>${escapeHtml(t('ten_report_stat_record'))}</span>
                <strong>${escapeHtml(recordText(record))}</strong>
            </div>
            <div>
                <span>${escapeHtml(t('ten_report_stat_clean'))}</span>
                <strong>${stats.cleanGames}/${stats.gameCount}</strong>
            </div>
            <div>
                <span>${escapeHtml(t('ten_report_stat_critical'))}</span>
                <strong>${escapeHtml(avgCritical)}</strong>
            </div>
            <div>
                <span>${escapeHtml(t('ten_report_stat_phase'))}</span>
                <strong>${escapeHtml(phaseLabel(phase))}</strong>
            </div>
        </div>

        ${renderOpeningPanel(rows, username, baselineStats, baselineStatus)}

        <div class="ten-report-panel">
            <div class="ten-report-panel-title">${escapeHtml(t('ten_report_distribution'))}</div>
            ${classBars}
        </div>

        <div class="ten-report-panel">
            <div class="ten-report-panel-title">${escapeHtml(t('ten_report_phase_profile'))}</div>
            ${phaseBars}
        </div>

        <div class="ten-report-panel">
            <div class="ten-report-panel-title">${escapeHtml(t('ten_report_findings_title'))}</div>
            <ul class="ten-report-finding-list">${findings}</ul>
        </div>

        <div class="ten-report-panel">
            <div class="ten-report-panel-title">${escapeHtml(t('ten_report_games_title'))}</div>
            <div class="ten-report-game-list">${gameRows}</div>
        </div>
    `;
}

function renderPendingReport(rows, username) {
    setTopBarTitle(t('ten_report_title'));
    const available = rows.length;
    setHtml('tenReportFullBody', `
        <div class="ten-report-panel ten-report-panel--empty">
            <div class="ten-report-panel-title">${escapeHtml(formatText('ten_report_pending_title', { n: available }))}</div>
            <p>${escapeHtml(username ? t('ten_report_pending_desc') : t('ten_report_pending_no_user'))}</p>
        </div>
    `);
}

function reportSummaryLine(report, rows, username) {
    if (rows.length < SHORT_REPORT_TARGET) return t('ten_report_history_missing_rows');
    const stats = analyzedStats(rows);
    const record = reportRecord(rows, username);
    const phase = dominantPhaseFromCounts(stats.phases);
    return formatText('ten_report_history_summary', {
        record: recordText(record),
        b: stats.blunders,
        phase: phaseLabel(phase),
    });
}

function renderHistoryList(reports, rowsById, username) {
    const items = reports.map((report) => {
        const rows = rowsForReport(report, rowsById);
        return `
            <button type="button" class="ten-report-history-item" data-ten-report-open-id="${escapeHtml(report.id)}">
                <span class="ten-report-history-main">
                    <strong>${escapeHtml(reportTitle(report))}</strong>
                    <span>${escapeHtml(reportSummaryLine(report, rows, username))}</span>
                </span>
                <span class="ten-report-history-chevron" aria-hidden="true">›</span>
            </button>
        `;
    }).join('');

    return `
        <div class="ten-report-list-page">
            <div class="ten-report-history-list">${items}</div>
        </div>
    `;
}

function attachHistoryHandlers() {
    if (!document.querySelectorAll || !reportState) return;
    document.querySelectorAll('[data-ten-report-open-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedReportId = btn.getAttribute('data-ten-report-open-id');
            renderReportSurface();
        });
    });
    document.querySelectorAll('[data-ten-report-list-back]').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedReportId = null;
            renderReportSurface();
        });
    });
}

function renderSelectedSummary(rows, username) {
    if (!rows.length) {
        setText('tenReportRecordValue', t('ten_report_no_analyzed'));
        setText('tenReportCoverageValue', t('ten_report_bias_unknown'));
        setText('tenReportMistakeValue', t('ten_report_need_more'));
        setText('tenReportFocusValue', t('ten_report_need_more'));
        return;
    }

    if (rows.length < SHORT_REPORT_TARGET) {
        const sampleText = formatText('ten_report_sample_progress', { n: rows.length });
        setText('tenReportRecordValue', sampleText);
        setText('tenReportCoverageValue', biasText(rows, username));
        setText('tenReportMistakeValue', t('ten_report_need_more'));
        setText('tenReportFocusValue', t('ten_report_need_more'));
        return;
    }

    const stats = analyzedStats(rows);
    const phase = dominantPhaseFromCounts(stats.phases);
    const summary = stats.critical
        ? formatText('ten_report_summary_counts', { b: stats.blunders, m: stats.mistakes })
        : t('ten_report_summary_clean');
    const phaseSummary = stats.critical
        ? formatText('ten_report_phase_focus', { phase: phaseLabel(phase) })
        : t('ten_report_phase_clean');

    setText('tenReportBiasValue', stats.critical ? t('ten_report_bias_short') : t('ten_report_bias_clean'));
    setText('tenReportRecordValue', summary);
    setText('tenReportCoverageValue', biasText(rows, username));
    setText('tenReportMistakeValue', phaseSummary);
    setText('tenReportFocusValue', focusText(stats, phase));
}

function renderReportSurface() {
    if (!reportState) return;
    const { reports, rowsById, allRows, username, baselineStats, baselineStatus } = reportState;
    setText('tenReportProgressValue', `${getTenReportProgressCount(SHORT_REPORT_TARGET)}/${SHORT_REPORT_TARGET}`);

    if (!reports.length) {
        renderSelectedSummary([], username);
        renderPendingReport(allRows.slice(0, SHORT_REPORT_TARGET), username);
        return;
    }

    if (!selectedReportId) {
        setTopBarTitle(t('ten_report_title'));
        setHtml('tenReportFullBody', renderHistoryList(reports, rowsById, username));
        attachHistoryHandlers();
        return;
    }

    if (!reports.some(report => report.id === selectedReportId)) {
        selectedReportId = null;
        setTopBarTitle(t('ten_report_title'));
        setHtml('tenReportFullBody', renderHistoryList(reports, rowsById, username));
        attachHistoryHandlers();
        return;
    }

    const selectedReport = reports.find(report => report.id === selectedReportId);
    const rows = rowsForReport(selectedReport, rowsById);
    setTopBarTitle(reportTitle(selectedReport));
    renderSelectedSummary(rows, username);

    const detail = rows.length >= SHORT_REPORT_TARGET
        ? renderFullReport(rows, username, analyzedStats(rows), reportRecord(rows, username), baselineStats, baselineStatus)
        : `<div class="ten-report-panel ten-report-panel--empty"><p>${escapeHtml(t('ten_report_history_missing_rows'))}</p></div>`;

    setHtml('tenReportFullBody', `
        <div class="ten-report-detail-head">
            <p>${escapeHtml(reportSummaryLine(selectedReport, rows, username))}</p>
        </div>
        ${detail}
    `);
    attachHistoryHandlers();
}

export function handleTenGameReportBack() {
    if (!selectedReportId || !reportState) return false;
    selectedReportId = null;
    renderReportSurface();
    return true;
}

export async function loadTenGameReportData() {
    const username = getMyUserId();
    selectedReportId = null;
    resetReportShell();
    if (!username) {
        renderPendingReport([], '');
        return;
    }

    const prepared = ensureReportHistory();
    reportState = {
        username,
        reports: prepared.reports,
        allRows: prepared.allRows,
        rowsById: new Map(prepared.allRows.map(row => [row.id, row])),
        baselineStats: null,
        baselineStatus: 'loading',
    };

    renderReportSurface();
    setText('tenReportLongValue', `.../${LONG_BASELINE_LIMIT}`);
    setText('tenReportBaselineValue', t('ten_report_baseline_loading'));

    try {
        const games = await loadLongBaseline(username);
        const count = Array.isArray(games) ? games.length : 0;
        reportState.baselineStats = buildBaselineStats(games, username);
        reportState.baselineStatus = 'ready';
        setText('tenReportLongValue', `${count}/${LONG_BASELINE_LIMIT}`);
        setText('tenReportBaselineValue', baselineStatusFor(count));
        renderReportSurface();
    } catch {
        reportState.baselineStatus = 'error';
        setText('tenReportLongValue', `0/${LONG_BASELINE_LIMIT}`);
        setText('tenReportBaselineValue', t('ten_report_baseline_error'));
        renderReportSurface();
    }
}
