import { escapeHtml, getWhiteWinPct, cpToWhiteWinPct } from './utils.js';
import { t } from './strings.js';

// ==========================================
// Empty state — icon + 헤드라인 + body + 선택적 CTA.
// 화면별 empty state 마크업 일원화 (1-line italic / 평문 / 풀스택 3종이 한 컴포넌트로).
// ==========================================
const EMPTY_STATE_ICONS = {
    bookmark: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    puzzle:   `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z"/></svg>`,
    inbox:    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
};

// title/desc/cta는 미리 t() 통과한 문자열 (호출자 책임). icon은 EMPTY_STATE_ICONS 키.
// onCta가 있으면 CTA 버튼 노출 + 클릭 핸들러 바인딩.
export function renderEmptyState(container, { icon = 'inbox', title, desc, ctaLabel, onCta } = {}) {
    if (!container) return;
    const iconSvg = EMPTY_STATE_ICONS[icon] || EMPTY_STATE_ICONS.inbox;
    const ctaHtml = (ctaLabel && onCta)
        ? `<button type="button" class="empty-state-cta">${escapeHtml(ctaLabel)}</button>`
        : '';
    container.innerHTML = `
        <div class="empty-state-v2">
            <div class="empty-state-icon" aria-hidden="true">${iconSvg}</div>
            ${title ? `<h3 class="empty-state-title">${escapeHtml(title)}</h3>` : ''}
            ${desc ? `<p class="empty-state-desc">${escapeHtml(desc)}</p>` : ''}
            ${ctaHtml}
        </div>
    `;
    if (ctaLabel && onCta) {
        const btn = container.querySelector('.empty-state-cta');
        if (btn) btn.addEventListener('click', onCta);
    }
}

// Screen-loading 오버레이 show/hide 래퍼. 캐시 hit으로 fetch가 매우 빠를 때 깜빡임 방지를 위해
// 노출 시점부터 minDuration ms 지나기 전엔 숨기지 않음. 에러 발생해도 finally로 반드시 숨김.
export async function withScreenLoading(overlayEl, asyncFn, { minDuration = 200 } = {}) {
    if (!overlayEl) return asyncFn();
    overlayEl.classList.remove('is-hidden');
    const showAt = performance.now();
    try {
        return await asyncFn();
    } finally {
        const elapsed = performance.now() - showAt;
        const remaining = Math.max(0, minDuration - elapsed);
        if (remaining > 0) {
            setTimeout(() => overlayEl.classList.add('is-hidden'), remaining);
        } else {
            overlayEl.classList.add('is-hidden');
        }
    }
}

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
            wTd.innerHTML = `<div class="move-cell"><span class="san">${escapeHtml(move.san || '')}</span><span class="eval-badge"></span></div>`;
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
                    bTd.innerHTML = `<div class="move-cell"><span class="san">${escapeHtml(move.san || '')}</span><span class="eval-badge"></span></div>`;
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
            <div class="engine-line${index === 0 ? ' engine-line--best' : ''}" data-uci="${escapeHtml(line.uci || '')}" data-index="${index}">
                <span class="el-rank">${index + 1}</span>
                <span class="el-score ${scoreClass}">${escapeHtml(line.scoreStr || '')}</span>
                <span class="el-moves">${escapeHtml(moves)}</span>
            </div>
        `;
    }).join('');

    // MultiPV=3 기준 빈 행 패딩 — 메이트/소수 합법수로 라인이 1~2개만 와도 항상 3행 유지.
    const TARGET_ROWS = 3;
    let placeholderHtml = '';
    for (let i = lines.length; i < TARGET_ROWS; i++) {
        placeholderHtml += `
            <div class="engine-line engine-line--empty" aria-hidden="true">
                <span class="el-rank">${i + 1}</span>
                <span class="el-score">—</span>
                <span class="el-moves"></span>
            </div>
        `;
    }

    container.innerHTML = linesHtml + placeholderHtml;
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

/**
 * 승률 그래프 SVG 문자열. midline(50%) 기준 위=백 우세 / 아래=흑 우세 두 색으로 분리.
 * 본인 진영 무관 절대 평가 — chess.com 그래프 톤. 분석 데이터 부족 시 null.
 *
 * clipPath ID는 review 화면이 단일 인스턴스라 fixed 사용 (다른 SVG와 충돌 위험 없음).
 */
function buildSummaryGraphSvgHtml(analysisQueue) {
    const total = analysisQueue.length;
    if (total === 0) return null;

    const W = 340, H = 108, pad = 4;
    const plotW = W - pad * 2;
    const plotH = H - pad * 2;

    const points = [];
    for (let i = 0; i < total; i++) {
        const move = analysisQueue[i];
        if (!move.engineLines || !move.engineLines[0]) continue;
        const whitePct = getWhiteWinPct(move.engineLines[0]);
        if (whitePct === null) continue;
        points.push({ moveNum: i + 1, pct: whitePct });
    }

    if (points.length === 0) return null;

    const xFor = (n) => pad + ((n - 1) / Math.max(1, total - 1)) * plotW;
    const yFor = (pct) => pad + (1 - pct / 100) * plotH;
    const midY = yFor(50);
    const baseY = pad + plotH;
    const topY = pad;

    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.moveNum).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ');
    // 면적은 anchor만 다른 동일 경로 — 각각 클립으로 미드라인 한쪽만 노출.
    const buildArea = (anchorY) =>
        `M${xFor(points[0].moveNum).toFixed(1)},${anchorY.toFixed(1)} `
        + points.map(p => `L${xFor(p.moveNum).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(' ')
        + ` L${xFor(points[points.length - 1].moveNum).toFixed(1)},${anchorY.toFixed(1)} Z`;

    return `
        <svg viewBox="0 0 ${W} ${H}" class="summary-graph-svg" role="img" aria-label="${escapeHtml(t('report_win_chance'))}" preserveAspectRatio="none">
            <defs>
                <clipPath id="review-cw"><rect x="0" y="0" width="${W}" height="${midY.toFixed(2)}"/></clipPath>
                <clipPath id="review-cb"><rect x="0" y="${midY.toFixed(2)}" width="${W}" height="${(H - midY).toFixed(2)}"/></clipPath>
            </defs>
            <rect x="0" y="0" width="${W}" height="${H}" fill="var(--review-graph-bg)"/>
            <path d="${buildArea(baseY)}" fill="var(--review-white-area)" clip-path="url(#review-cw)"/>
            <path d="${buildArea(topY)}" fill="var(--review-black-area)" clip-path="url(#review-cb)"/>
            <line x1="${pad}" y1="${midY.toFixed(1)}" x2="${W - pad}" y2="${midY.toFixed(1)}"
                  stroke="var(--review-mid-line)" stroke-width="1" stroke-dasharray="3 3"/>
            <path d="${lineD}" fill="none" stroke="var(--review-white-line)" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round" clip-path="url(#review-cw)"/>
            <path d="${lineD}" fill="none" stroke="var(--review-black-line)" stroke-width="1.6"
                  stroke-linecap="round" stroke-linejoin="round" clip-path="url(#review-cb)"/>
        </svg>
    `;
}

const CLASS_ORDER = ['Brilliant', 'Great', 'Best', 'Excellent', 'Good', 'Inaccuracy', 'Mistake', 'Blunder'];
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
 * @param {object} info - { title, metaLine, openingName }
 */
export function buildPreviewCardHtml({ title, metaLine, openingName }) {
    const openingBlock = openingName
        ? `<div class="preview-card-opening"><div class="preview-card-opening-name">${escapeHtml(openingName)}</div></div>`
        : '';
    return `
        <div class="preview-card">
            ${title ? `<div class="preview-card-title">${escapeHtml(title)}</div>` : ''}
            ${metaLine ? `<div class="preview-card-meta">${escapeHtml(metaLine)}</div>` : ''}
            ${openingBlock}
        </div>
    `;
}

/**
 * 정확도 + 수 분류 통합 표 HTML. grid 1fr 60px 60px (라벨 / 백 / 흑).
 * 본인 진영 헤더에 "·나" inline. 클래스 칩은 BADGE_MAP, 숫자 색은 CLASS_DOT_COLOR.
 */
function renderStatsCardHtml(analysisQueue, isUserWhite = true) {
    const counts = { white: {}, black: {} };
    for (const c of CLASS_ORDER) { counts.white[c] = 0; counts.black[c] = 0; }

    for (const m of analysisQueue) {
        if (!m.classification) continue;
        const side = m.isWhite ? 'white' : 'black';
        if (counts[side][m.classification] !== undefined) counts[side][m.classification]++;
    }

    const accW = computePlayerAccuracy(analysisQueue, true);
    const accB = computePlayerAccuracy(analysisQueue, false);
    const fmtAcc = (a) => a === null ? '—' : `${a.toFixed(1)}<i>%</i>`;

    const youLabel = escapeHtml(t('report_you'));
    const whiteLabel = isUserWhite
        ? `${escapeHtml(t('report_white'))}·${youLabel}`
        : escapeHtml(t('report_white'));
    const blackLabel = isUserWhite
        ? escapeHtml(t('report_black'))
        : `${escapeHtml(t('report_black'))}·${youLabel}`;

    const buildBadge = (c) => {
        const b = BADGE_MAP[c];
        if (!b) return `<span class="review-stats-badge review-stats-badge--good"></span>`;
        return `<span class="review-stats-badge" style="background:${b.bg};color:${b.color};font-size:${b.fontSize};font-weight:${b.fontWeight};">${escapeHtml(b.symbol)}</span>`;
    };
    const numCell = (n, color) => n === 0
        ? `<div class="tRow__num is-zero">0</div>`
        : `<div class="tRow__num" style="color:${color};">${n}</div>`;
    const classRows = CLASS_ORDER.map(c => `
        <div class="tRow">
            <div class="tRow__label">${buildBadge(c)}<span>${escapeHtml(t(CLASS_I18N[c]))}</span></div>
            ${numCell(counts.white[c], CLASS_DOT_COLOR[c])}
            ${numCell(counts.black[c], CLASS_DOT_COLOR[c])}
        </div>
    `).join('');

    return `
        <div class="review-card review-stats-card">
            <div class="tRow tRow--head">
                <div class="tRow__label"></div>
                <div class="tRow__num"><span class="tag-side white"><span class="dot"></span>${whiteLabel}</span></div>
                <div class="tRow__num"><span class="tag-side black"><span class="dot"></span>${blackLabel}</span></div>
            </div>
            <div class="tRow tRow--accuracy">
                <div class="tRow__label">${escapeHtml(t('report_accuracy'))}</div>
                <div class="tRow__num tRow__acc tRow__acc--white">${fmtAcc(accW)}</div>
                <div class="tRow__num tRow__acc tRow__acc--black">${fmtAcc(accB)}</div>
            </div>
            ${classRows}
        </div>
    `;
}

// resultMeta.result × isUserWhite → dot 색 (이긴 진영 색을 dot으로). draw는 중성.
const RESULT_DOT_SIDE = {
    win:  { true: 'white', false: 'black' },
    loss: { true: 'black', false: 'white' },
    draw: { true: 'draw',  false: 'draw'  },
};
const RESULT_LABEL_KEY = {
    win:  'report_result_win',
    loss: 'report_result_loss',
    draw: 'report_result_draw',
};
const CTA_ARROW_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

/**
 * 결과 스트랩 HTML — 승/패 + 사유 + 메타 + 점수.
 * meta = { result, reason, opponent, tcLabel, dateLabel, score, isUserWhite } — 모두 display-ready.
 */
function renderResultStrapHtml(meta) {
    if (!meta) return '';
    const resultText = meta.result ? escapeHtml(t(RESULT_LABEL_KEY[meta.result])) : '';
    const dotSide = meta.result ? RESULT_DOT_SIDE[meta.result][String(meta.isUserWhite)] : 'draw';

    const subHtml = meta.reason
        ? `<span class="resultStrap__sub">${escapeHtml(meta.reason)}</span>`
        : '';

    const metaParts = [];
    if (meta.opponent) metaParts.push(`${escapeHtml(t('report_vs_prefix'))} ${escapeHtml(meta.opponent)}`);
    if (meta.tcLabel) metaParts.push(escapeHtml(meta.tcLabel));
    if (meta.dateLabel) metaParts.push(escapeHtml(meta.dateLabel));
    const metaLine = metaParts.join(' · ');

    const labelMod = meta.result ? ` resultStrap__label--${meta.result}` : '';
    // 점수(1-0/0-1/½-½)는 Win/Loss 라벨과 중복 정보라 표시 안 함 — meta.score는 무시.
    return `
        <div class="resultStrap">
            <div class="resultStrap__left">
                <div class="resultStrap__title">
                    <span class="resultStrap__dot resultStrap__dot--${dotSide}"></span>
                    <span class="resultStrap__label${labelMod}">${resultText}</span>
                    ${subHtml}
                </div>
                ${metaLine ? `<div class="resultStrap__meta">${metaLine}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * 리포트 화면(분석 완료 후 리뷰) 카드 HTML 빌드.
 * 구조: resultStrap → 그래프 카드 → 통계 표 카드 → CTA 버튼.
 * resultMeta는 호출자(main.js)가 PGN 헤더 + analysisQueue에서 미리 빌드해 넘긴다.
 */
export function renderReviewReport({ analysisQueue, isUserWhite, resultMeta }) {
    const graphSvg = buildSummaryGraphSvgHtml(analysisQueue)
        || `<div class="summary-empty">${escapeHtml(t('report_empty'))}</div>`;

    return `
        <div class="review-report">
            ${renderResultStrapHtml(resultMeta)}

            <div class="review-card review-chart-card">
                <div class="review-chart-svg-wrap">${graphSvg}</div>
            </div>

            ${renderStatsCardHtml(analysisQueue, isUserWhite)}

            <button id="reviewStartBtn" class="review-cta-btn">
                <span>${escapeHtml(t('start_review_from_first'))}</span>
                ${CTA_ARROW_SVG}
            </button>
        </div>
    `;
}

/**
 * 분석 화면 상단 eval-bar 갱신 (chess.com 모바일 패턴).
 * scoreStr → 흰색 fill 비율 + cp/mate 숫자 overlay. 분류(classification)는 보드 piece-badge가 담당.
 * isUserWhite 인자는 backward-compat용 — eval-bar는 항상 흰색 기준으로 표시(왼쪽=흰).
 */
export function updateTopEvalDisplay(scoreStr, classification = '', isUserWhite = true) {
    const bar = document.getElementById('evalBar');
    const fill = document.getElementById('evalBarFill');
    const text = document.getElementById('evalBarText');
    if (!bar || !fill || !text) return;

    const whitePct = evalToWinChance(scoreStr);
    if (whitePct === null) {
        fill.style.width = '50%';
        text.textContent = '';
        text.classList.remove('eval-bar-text--white', 'eval-bar-text--black');
        return;
    }

    fill.style.width = whitePct + '%';
    text.textContent = formatScoreMode(scoreStr);
    // 우세한 쪽에 텍스트 — 흰 영역 ≥ 50%면 좌측 흰 fill 위, 그 외 우측 검은 영역 위.
    text.classList.toggle('eval-bar-text--white', whitePct >= 50);
    text.classList.toggle('eval-bar-text--black', whitePct < 50);
}

// 보드 위 분류 배지 — 분석 화면(showPieceBadge)과 vault 카드(renderBlunderVisualization) 공유.
// CSS는 styles.css의 .piece-badge-square / .piece-badge.
// bg는 var(--{class}) 토큰으로 다크 모드 자동 정합. Best/Forced는 의도된 raw 유지
// (Best: 다이아 칩이라 흰 배경 고정 / Forced: 차분한 회색 — 토큰 매핑 시 다크 contrast 약함).
// color(전경 텍스트)는 컬러 bg 위 대비 보존을 위해 raw 고정.
const BADGE_MAP = {
    'Brilliant':  { symbol: '!!', fontSize: '9px',  fontWeight: '900', color: '#fff',    bg: 'var(--brilliant)' },
    'Great':      { symbol: '!',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: 'var(--great)' },
    'Best':       { symbol: '✦', fontSize: '10px', fontWeight: '700', color: '#1C1D1F', bg: '#FFFFFF' },
    'Excellent':  { symbol: '✓', fontSize: '11px', fontWeight: '900', color: '#fff',    bg: 'var(--excellent)' },
    'Inaccuracy': { symbol: '?!', fontSize: '8px',  fontWeight: '700', color: '#fff',    bg: 'var(--inaccuracy)' },
    'Mistake':    { symbol: '?',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: 'var(--mistake)' },
    'Blunder':    { symbol: '??', fontSize: '9px',  fontWeight: '700', color: '#fff',    bg: 'var(--blunder)' },
    'Forced':     { symbol: '□',  fontSize: '11px', fontWeight: '700', color: '#fff',    bg: '#62646A' },
};

/**
 * 보드 컨테이너의 특정 칸 위에 분류 배지 div를 절대 위치로 띄움. 기존 배지 있으면 제거.
 * @param {HTMLElement} boardEl - 보드 컨테이너 (.board-container, position 기준)
 * @param {string} square - 칸 좌표 ('e4', 'h8' 등)
 * @param {'white'|'black'} orientation - chessground 보드 방향
 * @param {string} classification - BADGE_MAP 키 ('Mistake', 'Blunder' 등). 미스매치 시 배지 안 그림
 */
export function placePieceBadge(boardEl, square, orientation, classification) {
    if (!boardEl) return;
    const existing = boardEl.querySelector('.piece-badge-square');
    if (existing) existing.remove();
    if (!square || !classification) return;
    const config = BADGE_MAP[classification];
    if (!config) return;

    const fileIndex = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]);
    let col, row;
    if (orientation === 'white') { col = fileIndex; row = 8 - rank; }
    else { col = 7 - fileIndex; row = rank - 1; }

    const wrap = document.createElement('div');
    wrap.className = 'piece-badge-square';
    wrap.style.left = `${col / 8 * 100}%`;
    wrap.style.top = `${row / 8 * 100}%`;

    const badge = document.createElement('div');
    badge.className = 'piece-badge';
    badge.textContent = config.symbol;
    badge.style.fontSize = config.fontSize;
    badge.style.fontWeight = config.fontWeight;
    badge.style.color = config.color;
    badge.style.background = config.bg;

    wrap.appendChild(badge);
    boardEl.appendChild(wrap);
}

