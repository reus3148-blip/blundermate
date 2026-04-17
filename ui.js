import { escapeHtml } from './utils.js';
import { t } from './strings.js';

/**
 * Renders the list of fetched games into the provided container.
 */
export function renderGamesList(container, games, searchedUsername, onGameClick, onGameSave) {
    container.innerHTML = '';
    if (!searchedUsername) return [];
    const searchLower = searchedUsername.toLowerCase();

    games.forEach(game => {
        const isWhite = game.white.username.toLowerCase() === searchLower;
        const opponent = escapeHtml(isWhite ? game.black.username : game.white.username);

        // Determine Visual Status
        const resultCode = isWhite ? game.white.result : game.black.result;
        let resultClass = 'draw';
        let resultText = t('game_result_draw');
        if (resultCode === 'win') {
            resultClass = 'win';
            resultText = t('game_result_win');
        } else if (['checkmated', 'timeout', 'resigned', 'abandoned'].includes(resultCode)) {
            resultClass = 'loss';
            resultText = t('game_result_loss');
        }

        const item = document.createElement('div');
        item.className = `game-item ${resultClass}`;
        item.innerHTML = `
            <div style="font-weight: 600; font-size: 1rem; flex:1; min-width:0;">
                ${resultText}
                <span style="font-size: 0.85rem; color: var(--tx2); font-weight: normal; margin-left: 0.5rem;">
                    vs ${opponent}
                </span>
            </div>
            <button class="card-save-btn" title="Save" aria-label="Save">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
            <div class="eval-badge" style="background:var(--bg-elevated);">${t('ui_review')}</div>
        `;

        const saveBtn = item.querySelector('.card-save-btn');
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!game.pgn) {
                alert(t('game_no_pgn'));
                return;
            }
            if (typeof onGameSave === 'function') {
                onGameSave(game.pgn, `${game.white.username} vs ${game.black.username}`);
            }
        });

        item.addEventListener('click', () => {
            if (!game.pgn) {
                alert(t('game_no_pgn'));
                return;
            }
            onGameClick(game.pgn, isWhite);
        });

        container.appendChild(item);
    });
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
            wTd.innerHTML = `<div class="move-cell"><span class="san">${move.san}</span><span class="eval-badge">...</span></div>`;
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
                    bTd.innerHTML = `<div class="move-cell"><span class="san">${move.san}</span><span class="eval-badge">...</span></div>`;
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
 * Converts a user-perspective eval score (in pawns) to win chance % using Lichess formula.
 * scoreStr is already from the user's POV (positive = user winning).
 */
function evalToWinChance(scoreStr) {
    if (!scoreStr || scoreStr === '-' || scoreStr === '—') return null;
    if (scoreStr.startsWith('+M')) return 99;
    if (scoreStr.startsWith('-M')) return 1;
    const n = parseFloat(scoreStr);
    if (isNaN(n)) return null;
    return Math.round(50 + 50 * (2 / (1 + Math.exp(-0.00368 * n * 100)) - 1));
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
    'Best':       'var(--best)',
    'Excellent':  'var(--best)',
    'Good':       'var(--tx2)',
    'Inaccuracy': 'var(--inaccuracy)',
    'Mistake':    'var(--mistake)',
    'Blunder':    'var(--blunder)',
};

/**
 * Updates win chance and move classification label in the bottom bar.
 */
export function updateTopEvalDisplay(scoreStr, classification = '') {
    const el = document.getElementById('winChanceDisplay');
    const labelEl = document.getElementById('moveClassLabel');
    if (!el) return;

    // Cache scoreStr and classification on the element for use by the toggle handler
    el.dataset.scoreStr = scoreStr || '';
    el.dataset.classification = classification || '';

    const mode = localStorage.getItem('evalDisplayMode') || 'percent';
    const pct = evalToWinChance(scoreStr);
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

