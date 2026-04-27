import { escapeHtml, getWhiteWinPct, cpToWhiteWinPct } from './utils.js';
import { EVAL_MODE_KEY } from './storage.js';
import { t } from './strings.js';

/**
 * Renders the empty moves table for analysis.
 */
export function renderMovesTable(container, queue, onMoveClick) {
    container.innerHTML = '';
    if (queue.length === 0) return;

    const fragment = document.createDocumentFragment();
    let tr = null;
    for (let i = 0; i < queue.length; i++) {
        const move = queue[i];
        // FEN 단일 포지션 엔트리는 기보 테이블에 표시하지 않는다
        if (move.isFenOnly) continue;

        // 블런더(??) 및 실수(?) 마크는 상단 점수판에만 띄우기 위해 이곳에는 순수 기보 텍스트만 삽입합니다.
        
        if (move.isWhite) {
            tr = document.createElement('tr');
            tr.id = `row-${move.moveNumber}`;
            
            const numTd = document.createElement('td');
            numTd.textContent = `${move.moveNumber}.`;
            numTd.style.color = 'var(--tx2)';
            
            const wTd = document.createElement('td');
            wTd.id = `move-${i}`;
            wTd.className = 'interactive-move';
            wTd.style.cursor = 'pointer';
            wTd.innerHTML = `<div class="move-cell"><span class="san">${move.san}</span><span class="eval-badge"></span></div>`;
            wTd.onclick = () => onMoveClick(i);
            
            const bTd = document.createElement('td');
            bTd.id = `move-${i+1}`;
            bTd.className = 'interactive-move';
            
            tr.appendChild(numTd);
            tr.appendChild(wTd);
            tr.appendChild(bTd);
            fragment.appendChild(tr);
        } else {
            if (tr) {
                const bTd = tr.querySelector(`#move-${i}`);
                if (bTd) {
                    bTd.style.cursor = 'pointer';
                    bTd.innerHTML = `<div class="move-cell"><span class="san">${move.san}</span><span class="eval-badge"></span></div>`;
                    bTd.onclick = () => onMoveClick(i);
                }
            }
        }
    }
    container.appendChild(fragment);
}

/**
 * Updates a specific move's evaluation badge.
 */
export function updateUIWithEval(index, scoreStr, classification = '') {
    const cell = document.getElementById(`move-${index}`);
    if (!cell) return;

    // 기보 테이블 내부에서는 오직 평가 점수(eval-badge) 숫자만 업데이트합니다.

    const badge = cell.querySelector('.eval-badge');
    if (badge && scoreStr) { // scoreStr이 undefined일 경우 예외 발생(TypeError) 방어
        badge.textContent = scoreStr;

        badge.classList.remove('positive', 'negative');
        const numVal = parseFloat(scoreStr);
        if (!isNaN(numVal)) {
            if (numVal > 0.5) badge.classList.add('positive');
            else if (numVal < -0.5) badge.classList.add('negative');
        } else if (scoreStr.startsWith('+M')) {
            badge.classList.add('positive');
        } else if (scoreStr.startsWith('-M')) {
            badge.classList.add('negative');
        }
    }

}

/**
 * Highlights the current active move in the table.
 */
export function highlightActiveMove(index) {
    const prevActiveCell = document.querySelector('.active-move');
    if (prevActiveCell) prevActiveCell.classList.remove('active-move');
    
    const prevActiveRow = document.querySelector('.active-move-row');
    if (prevActiveRow) prevActiveRow.classList.remove('active-move-row');
    
    const cell = document.getElementById(`move-${index}`);
    if (cell) {
        cell.classList.add('active-move');
        const tr = cell.closest('tr');
        if (tr) {
            tr.classList.add('active-move-row');
            
            // 화면 전체가 당겨지는 현상을 방지하기 위해 컨테이너 내부 스크롤만 조작합니다.
            const container = tr.closest('.moves-container');
            // 기보 컨테이너가 화면에 보일 때(display: none이 아닐 때)만 스크롤 위치를 계산 (Edge Case 방어)
            if (container && container.offsetParent !== null) {
                const rect = tr.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const relativeTop = rect.top - containerRect.top + container.scrollTop;
                const scrollTarget = relativeTop - (container.clientHeight / 2) + (rect.height / 2);
                container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        }
    }
}

/**
 * Renders the top engine recommended lines (MultiPV).
 */
export function renderEngineLines(container, lines, onHover, onLeave, onClick) {
    // 항상 최신 콜백 함수를 참조하도록 컨테이너의 속성으로 저장합니다 (클로저 버그 해결)
    container._onHover = onHover;
    container._onLeave = onLeave;
    container._onClick = onClick;

    // 한 번만 이벤트 위임(Event Delegation)을 설정하여 메모리 누수 및 재할당 방지
    if (!container.dataset.delegated) {
        setupEngineLinesDelegation(container);
        container.dataset.delegated = "true";
    }

    if (!lines || lines.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const linesHtml = lines.map((line, index) => {
        const scoreClass = line.scoreNum > 0.3 ? 'positive' : line.scoreNum < -0.3 ? 'negative' : '';
        const moves = line.pv ? line.pv.split(' ').slice(0, 5).join('  ') : '';
        return `
            <div class="engine-line${index === 0 ? ' engine-line--best' : ''}" data-uci="${line.uci || ''}" data-index="${index}">
                <span class="el-rank">${index + 1}</span>
                <span class="el-score ${scoreClass}">${line.scoreStr}</span>
                <span class="el-moves">${moves}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = linesHtml + `<p class="engine-hint">${t('ui_engine_hint')}</p>`;
}

function setupEngineLinesDelegation(container) {
    container.addEventListener('mouseover', (e) => {
        const lineEl = e.target.closest('.engine-line');
        if (lineEl && typeof container._onHover === 'function') {
            const uci = lineEl.getAttribute('data-uci');
            if (uci && uci.length >= 4) {
                const orig = uci.slice(0, 2);
                const dest = uci.slice(2, 4);
                if (/^[a-h][1-8]$/.test(orig) && /^[a-h][1-8]$/.test(dest)) {
                    container._onHover(orig, dest);
                }
            }
        }
    });
    container.addEventListener('mouseout', (e) => {
        const lineEl = e.target.closest('.engine-line');
        if (lineEl && typeof container._onLeave === 'function') {
            if (e.relatedTarget && lineEl.contains(e.relatedTarget)) return;
            container._onLeave();
        }
    });
    container.addEventListener('click', (e) => {
        const lineEl = e.target.closest('.engine-line');
        if (lineEl) {
            if (typeof container._onClick === 'function') {
                const idx = parseInt(lineEl.getAttribute('data-index'), 10);
                if (!isNaN(idx)) container._onClick(idx);
            } else if (typeof container._onHover === 'function') {
                const uci = lineEl.getAttribute('data-uci');
                if (uci && uci.length >= 4) {
                    const orig = uci.slice(0, 2);
                    const dest = uci.slice(2, 4);
                    if (/^[a-h][1-8]$/.test(orig) && /^[a-h][1-8]$/.test(dest)) {
                        container._onHover(orig, dest);
                    }
                }
            }
        }
    });
}

/**
 * scoreStr(백 기준, "+1.50" / "+M5" / "-M3" / "-" 등) → 백 win% (0~100, 정수).
 * cp는 cpToWhiteWinPct에 위임, mate는 ±99로 클램프.
 */
function evalToWinChance(scoreStr) {
    if (!scoreStr || scoreStr === '-' || scoreStr === '—') return null;
    if (scoreStr.startsWith('+M')) return 99;
    if (scoreStr.startsWith('-M')) return 1;
    const n = parseFloat(scoreStr);
    if (isNaN(n)) return null;
    const pct = cpToWhiteWinPct(n);
    return pct === null ? null : Math.round(pct);
}

/**
 * Formats a scoreStr for score display mode.
 * e.g. "+1.23" → "+1.2", "-3.20" → "−3.2", "+M5" → "+M5", "-M3" → "−M3"
 */
function formatScoreMode(scoreStr) {
    if (!scoreStr || scoreStr === '-' || scoreStr === '—') return '—';
    if (scoreStr.startsWith('+M')) return scoreStr;
    if (scoreStr.startsWith('-M')) return '\u2212' + scoreStr.slice(1);
    const n = parseFloat(scoreStr);
    if (isNaN(n)) return '—';
    if (n > 0) return '+' + n.toFixed(1);
    if (n < 0) return '\u2212' + Math.abs(n).toFixed(1);
    return '0.0';
}

const CLASS_COLOR = {
    'Brilliant':  'var(--brilliant)',
    'Great':      'var(--great)',
    'Best':       'var(--best)',
    'Excellent':  'var(--excellent)',
    'Good':       'var(--tx2)',
    'Inaccuracy': 'var(--inaccuracy)',
    'Mistake':    'var(--mistake)',
    'Blunder':    'var(--blunder)',
    'Forced':     'var(--tx2)',
};

/**
 * Lichess Accuracy per move: 103.1668 * exp(-0.04354 * winPctLoss) - 3.1669
 * forWhitePlayer가 true면 백의 평균 정확도, false면 흑의 평균 정확도.
 * 같은 win% source(getWhiteWinPct → cpToWhiteWinPct)를 써서 표시 일관성 유지.
 */
function computePlayerAccuracy(analysisQueue, forWhitePlayer) {
    const accuracies = [];
    for (let i = 0; i < analysisQueue.length; i++) {
        const move = analysisQueue[i];
        if (move.isWhite !== forWhitePlayer) continue;
        if (!move.engineLines || !move.engineLines[0]) continue;

        const currWhiteWinPct = getWhiteWinPct(move.engineLines[0]);
        if (currWhiteWinPct === null) continue;

        let prevWhiteWinPct;
        if (i === 0) {
            prevWhiteWinPct = 50;
        } else {
            const prev = analysisQueue[i - 1];
            if (!prev.engineLines || !prev.engineLines[0]) continue;
            prevWhiteWinPct = getWhiteWinPct(prev.engineLines[0]);
            if (prevWhiteWinPct === null) continue;
        }

        // 움직인 쪽 기준의 승률 손실
        const prevOwnPct = forWhitePlayer ? prevWhiteWinPct : 100 - prevWhiteWinPct;
        const currOwnPct = forWhitePlayer ? currWhiteWinPct : 100 - currWhiteWinPct;
        const loss = Math.max(0, prevOwnPct - currOwnPct);

        const a = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
        accuracies.push(Math.max(0, Math.min(100, a)));
    }

    if (accuracies.length === 0) return null;
    const sum = accuracies.reduce((s, v) => s + v, 0);
    return sum / accuracies.length;
}

const MARKER_COLOR = {
    'Brilliant':  'var(--brilliant)',
    'Great':      'var(--great)',
    'Excellent':  'var(--excellent)',
    'Blunder':    'var(--blunder)',
    'Mistake':    'var(--mistake)',
    'Inaccuracy': 'var(--inaccuracy)',
};

/**
 * 승률 그래프를 SVG 문자열로만 빌드한다 (DOM 삽입은 호출자 책임).
 * 외부 차트 라이브러리를 쓰지 않고 viewBox 기반으로 순수 구현.
 * 분석 데이터가 부족해 그릴 수 없으면 null 반환.
 */
export function buildSummaryGraphSvgHtml(analysisQueue, isUserWhite) {
    const total = analysisQueue.length;
    if (total === 0) return null;

    // 체스닷컴 모바일 리뷰 그래프처럼 납작. viewBox는 16:4 비율.
    const W = 320;
    const H = 80;
    const padL = 8;
    const padR = 8;
    const padT = 6;
    const padB = 16;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const points = [];
    for (let i = 0; i < total; i++) {
        const move = analysisQueue[i];
        if (!move.engineLines || !move.engineLines[0]) continue;
        const whitePct = getWhiteWinPct(move.engineLines[0]);
        if (whitePct === null) continue;
        const pct = isUserWhite ? whitePct : 100 - whitePct;
        points.push({ moveNum: i + 1, pct, classification: move.classification });
    }

    if (points.length === 0) return null;

    const xFor = (n) => padL + ((n - 1) / Math.max(1, total - 1)) * plotW;
    const yFor = (pct) => padT + (1 - pct / 100) * plotH;
    const midY = yFor(50);
    const baseY = padT + plotH;

    const linePts = points.map(p => `${xFor(p.moveNum).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
    const areaD = `M ${xFor(points[0].moveNum).toFixed(1)} ${baseY.toFixed(1)} `
        + points.map(p => `L ${xFor(p.moveNum).toFixed(1)} ${yFor(p.pct).toFixed(1)}`).join(' ')
        + ` L ${xFor(points[points.length - 1].moveNum).toFixed(1)} ${baseY.toFixed(1)} Z`;

    const markers = points
        .filter(p => MARKER_COLOR[p.classification])
        .map(p => {
            const x = xFor(p.moveNum).toFixed(1);
            const y = yFor(p.pct).toFixed(1);
            return `<circle cx="${x}" cy="${y}" r="2.6" fill="${MARKER_COLOR[p.classification]}" stroke="var(--bg-surface)" stroke-width="1"/>`;
        }).join('');

    const ticks = [];
    for (let k = 10; k < total; k += 10) ticks.push(k);
    const tickLabels = ticks.map(k => {
        const x = xFor(k).toFixed(1);
        return `<text x="${x}" y="${(H - 4).toFixed(1)}" class="summary-graph-tick" text-anchor="middle">${k}</text>`;
    }).join('');

    return `
        <svg viewBox="0 0 ${W} ${H}" class="summary-graph-svg" role="img" aria-label="${escapeHtml(t('report_win_chance'))}" preserveAspectRatio="none">
            <line x1="${padL}" y1="${midY.toFixed(1)}" x2="${W - padR}" y2="${midY.toFixed(1)}"
                  stroke="var(--tx3)" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.6"/>
            <path d="${areaD}" fill="var(--ac-lo)"/>
            <polyline points="${linePts}" fill="none" stroke="var(--ac)" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
            ${markers}
            ${tickLabels}
        </svg>
    `;
}

/**
 * 승률 그래프를 컨테이너에 직접 렌더 (구버전 유지 — 다른 곳에서 호출 가능).
 */
export function renderSummaryGraph(container, analysisQueue, isUserWhite) {
    if (!container) return;
    const svg = buildSummaryGraphSvgHtml(analysisQueue, isUserWhite);
    if (!svg) {
        container.innerHTML = `<div class="summary-empty">${escapeHtml(t('report_empty'))}</div>`;
        return;
    }
    container.innerHTML = svg;
}

const CLASS_ORDER = ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder', 'Forced'];
const CLASS_I18N = {
    'Brilliant':  'class_brilliant',
    'Great':      'class_great',
    'Best':       'class_best',
    'Excellent':  'class_excellent',
    'Good':       'class_good',
    'Inaccuracy': 'class_inaccuracy',
    'Mistake':    'class_mistake',
    'Blunder':    'class_blunder',
    'Forced':     'class_forced',
};
const CLASS_DOT_COLOR = {
    'Brilliant':  'var(--brilliant)',
    'Great':      'var(--great)',
    'Best':       'var(--best)',
    'Excellent':  'var(--excellent)',
    'Good':       'var(--tx)',
    'Inaccuracy': 'var(--inaccuracy)',
    'Mistake':    'var(--mistake)',
    'Blunder':    'var(--blunder)',
    'Forced':     'var(--tx2)',
};

/**
 * 미리보기 카드 HTML (제목 / 날짜·수 / 오프닝). 분석 시작 화면과 분석 후 리포트 화면이 공유한다.
 * @param {object} info - { title, metaLine, openingName, eco }
 */
export function buildPreviewCardHtml({ title, metaLine, openingName, eco }) {
    let openingBlock = '';
    if (openingName) {
        openingBlock = `
            <div class="preview-card-opening">
                <div class="preview-card-opening-name">${escapeHtml(openingName)}</div>
                ${eco ? `<div class="preview-card-eco">ECO ${escapeHtml(eco)}</div>` : ''}
            </div>
        `;
    } else if (eco) {
        openingBlock = `
            <div class="preview-card-opening">
                <div class="preview-card-eco">ECO ${escapeHtml(eco)}</div>
            </div>
        `;
    }
    return `
        <div class="preview-card">
            ${title ? `<div class="preview-card-title">${escapeHtml(title)}</div>` : ''}
            ${metaLine ? `<div class="preview-card-meta">${escapeHtml(metaLine)}</div>` : ''}
            ${openingBlock}
        </div>
    `;
}

/**
 * 통계 카드 HTML만 반환 (정확도 + 수 분류 통합 표). 버튼/카드 컨테이너 없음.
 * 리포트 화면이 보드 자리(summaryGraph 안)에 그래프와 함께 stat 카드를 넣을 때 사용.
 * isUserWhite: 본인 진영 컬럼을 앰버로 강조하고 헤더에 "(나)" 배지를 표시한다.
 */
export function renderStatsCardHtml(analysisQueue, isUserWhite = true) {
    const counts = { white: {}, black: {} };
    for (const c of CLASS_ORDER) { counts.white[c] = 0; counts.black[c] = 0; }

    for (const m of analysisQueue) {
        if (!m.classification) continue;
        const side = m.isWhite ? 'white' : 'black';
        if (counts[side][m.classification] !== undefined) counts[side][m.classification]++;
    }

    const accW = computePlayerAccuracy(analysisQueue, true);
    const accB = computePlayerAccuracy(analysisQueue, false);
    const fmtAcc = (a) => a === null ? '—' : a.toFixed(1) + '%';

    const youBadge = `<span class="review-stats-you">${escapeHtml(t('report_you'))}</span>`;
    const wColCls = isUserWhite ? ' is-you' : '';
    const bColCls = isUserWhite ? '' : ' is-you';

    const classRows = CLASS_ORDER.map((c, idx) => `
        <tr${idx === 0 ? ' class="review-stats-class-first"' : ''}>
            <td class="review-stats-label">
                <span class="review-stats-dot" style="background:${CLASS_DOT_COLOR[c]};"></span>
                <span>${escapeHtml(t(CLASS_I18N[c]))}</span>
            </td>
            <td class="review-stats-num${wColCls}">${counts.white[c]}</td>
            <td class="review-stats-num${bColCls}">${counts.black[c]}</td>
        </tr>
    `).join('');

    return `
        <div class="review-card review-stats-card">
            <div class="review-card-title">${escapeHtml(t('review_move_quality'))}</div>
            <table class="review-stats-table">
                <thead>
                    <tr>
                        <th></th>
                        <th class="review-stats-side${wColCls}">
                            <span class="review-stats-side-name">${escapeHtml(t('report_white'))}</span>
                            ${isUserWhite ? youBadge : ''}
                        </th>
                        <th class="review-stats-side${bColCls}">
                            <span class="review-stats-side-name">${escapeHtml(t('report_black'))}</span>
                            ${!isUserWhite ? youBadge : ''}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="review-stats-accuracy">
                        <td class="review-stats-label">${escapeHtml(t('report_accuracy'))}</td>
                        <td class="review-stats-num-strong${wColCls}">${fmtAcc(accW)}</td>
                        <td class="review-stats-num-strong${bColCls}">${fmtAcc(accB)}</td>
                    </tr>
                    ${classRows}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * 리포트 화면(분석 완료 후 리뷰)의 5단계 카드 HTML을 한 번에 빌드한다.
 * gameInfo: { title, metaLine, openingName, eco, result } — main.js의 buildGameHeaderInfo 결과
 * 결과(result): 'win' | 'loss' | 'draw' | null
 *
 * 구조 (위→아래):
 *   1. 게임 헤더 카드 (오프닝 / vs / 메타+결과)
 *   2. 차트 카드 (수별 평가 그래프)
 *   3. 통계 표 카드 (정확도 + 수 분류 — renderStatsCardHtml 활용)
 *   4. CTA 버튼 (#reviewStartBtn — 핸들러는 호출자가 와이어링)
 */
export function renderReviewReport({ analysisQueue, isUserWhite, gameInfo }) {
    const graphSvg = buildSummaryGraphSvgHtml(analysisQueue, isUserWhite)
        || `<div class="summary-empty">${escapeHtml(t('report_empty'))}</div>`;

    // 헤더 메타 라인에 결과 단어 추가 (이미 main.js에서 만든 metaLine 뒤에 결과 붙임)
    let metaWithResult = gameInfo.metaLine || '';
    let resultClass = '';
    if (gameInfo.result) {
        const resultWord = t(`game_result_${gameInfo.result}`);
        metaWithResult = metaWithResult ? `${metaWithResult} · ${resultWord}` : resultWord;
        resultClass = `is-${gameInfo.result}`;
    }

    const openingLine = gameInfo.openingName
        ? `<div class="review-header-opening">${escapeHtml(gameInfo.openingName)}${gameInfo.eco ? ` · <span class="review-header-eco">${escapeHtml(gameInfo.eco)}</span>` : ''}</div>`
        : (gameInfo.eco ? `<div class="review-header-opening"><span class="review-header-eco">ECO ${escapeHtml(gameInfo.eco)}</span></div>` : '');

    return `
        <div class="review-report">
            <div class="review-card review-header-card">
                ${openingLine}
                ${gameInfo.title ? `<div class="review-header-title">${escapeHtml(gameInfo.title)}</div>` : ''}
                ${metaWithResult ? `<div class="review-header-meta ${resultClass}">${escapeHtml(metaWithResult)}</div>` : ''}
            </div>

            <div class="review-card review-chart-card">
                <div class="review-card-title">${escapeHtml(t('review_eval_over_time'))}</div>
                <div class="review-chart-svg-wrap">${graphSvg}</div>
            </div>

            ${renderStatsCardHtml(analysisQueue, isUserWhite)}

            <button id="reviewStartBtn" class="review-cta-btn">${escapeHtml(t('start_review_from_first'))}</button>
        </div>
    `;
}

/**
 * 분석 화면 하단 바의 win%/score + 분류 라벨 갱신.
 * scoreStr → win% (cpToWhiteWinPct) — 표시 cp ↔ 표시 win% 같은 함수에서 파생.
 */
export function updateTopEvalDisplay(scoreStr, classification = '', isUserWhite = true) {
    const el = document.getElementById('winChanceDisplay');
    const labelEl = document.getElementById('moveClassLabel');
    if (!el) return;

    el.dataset.scoreStr = scoreStr || '';
    el.dataset.classification = classification || '';

    const mode = localStorage.getItem(EVAL_MODE_KEY) || 'percent';
    const whitePct = evalToWinChance(scoreStr);
    const rawPct = whitePct === null ? null : isUserWhite ? whitePct : 100 - whitePct;
    const pct = rawPct === null ? null : Math.round(rawPct);
    const color = pct === null ? 'var(--tx2)' : pct >= 50 ? 'var(--best)' : pct < 40 ? 'var(--blunder)' : 'var(--tx2)';

    if (mode === 'score') {
        el.textContent = formatScoreMode(scoreStr);
    } else {
        el.textContent = pct === null ? '—' : pct + '%';
    }
    el.style.color = color;

    // Classification label
    if (labelEl) {
        const META = ['Exploring', 'Simulating'];
        if (classification && !META.includes(classification)) {
            labelEl.textContent = classification.toUpperCase();
            labelEl.style.color = CLASS_COLOR[classification] || 'var(--tx2)';
        } else {
            labelEl.textContent = '';
        }
    }
}

