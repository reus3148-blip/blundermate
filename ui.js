import { escapeHtml } from './utils.js';

/**
 * Renders the list of fetched games into the provided container.
 */
export function renderGamesList(container, games, searchedUsername, onGameClick) {
    container.innerHTML = '';
    const searchLower = searchedUsername.toLowerCase();

    games.forEach(game => {
        const isWhite = game.white.username.toLowerCase() === searchLower;
        const opponent = escapeHtml(isWhite ? game.black.username : game.white.username);
        
        // Determine Visual Status
        const resultCode = isWhite ? game.white.result : game.black.result;
        let resultClass = 'draw';
        let resultText = 'Draw';
        if (resultCode === 'win') {
            resultClass = 'win';
            resultText = 'Win';
        } else if (['checkmated', 'timeout', 'resigned', 'abandoned'].includes(resultCode)) {
            resultClass = 'loss';
            resultText = 'Loss';
        }

        const item = document.createElement('div');
        item.className = `game-item ${resultClass}`;
        item.innerHTML = `
            <div style="font-weight: 600; font-size: 1rem;">
                ${resultText} 
                <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: normal; margin-left: 0.5rem;">
                    vs ${opponent}
                </span>
            </div>
            <div class="eval-badge" style="background:var(--bg-dark);">Review</div>
        `;

        item.addEventListener('click', () => {
            if (!game.pgn) {
                alert('This game has no PGN available.');
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
            numTd.style.color = 'var(--text-secondary)';
            
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

    if (classification) {
        const moveCell = cell.querySelector('.move-cell');
        if (moveCell) {
            if (classification === 'Brilliant') moveCell.classList.add('bg-brilliant');
            else if (classification === 'Blunder') moveCell.classList.add('bg-blunder');
            else if (classification === 'Mistake') moveCell.classList.add('bg-mistake');
            else if (classification === 'Missed Win') moveCell.classList.add('bg-missed-win');
            else if (classification === 'Inaccuracy') moveCell.classList.add('bg-inaccuracy');
            else if (classification === 'Excellent') moveCell.classList.add('bg-excellent');
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

    container.innerHTML = linesHtml + `<p class="engine-hint">hover to preview &nbsp;·&nbsp; click to simulate</p>`;
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
 * Converts a numeric eval score to a percentage for the eval bar (0–100).
 * 50% = equal. White advantage pushes toward 100%, black toward 0%.
 */
function evalToBarPercent(scoreStr) {
    if (!scoreStr) return 50;
    if (scoreStr.startsWith('+M')) return 95;
    if (scoreStr.startsWith('-M')) return 5;
    const n = parseFloat(scoreStr);
    if (isNaN(n)) return 50;
    return Math.max(5, Math.min(95, 50 + n * 9));
}

/**
 * Updates the eval bar, score display, and move classification label.
 */
export function updateTopEvalDisplay(scoreStr, classification = '') {
    const evalScore = document.getElementById('evalScore');
    const evalLabel = document.getElementById('evalLabel');
    const evalBarFill = document.getElementById('evalBarFill');

    if (!evalScore) return;

    evalScore.textContent = scoreStr || '—';

    const numVal = parseFloat(scoreStr);
    let scoreColor;
    if (!isNaN(numVal)) {
        if (numVal < -0.3) scoreColor = '#C84040';
        else if (numVal > 0.1) scoreColor = '#5A9E60';
        else scoreColor = '#8A8070';
    } else if (scoreStr && scoreStr.startsWith('+M')) {
        scoreColor = '#5A9E60';
    } else if (scoreStr && scoreStr.startsWith('-M')) {
        scoreColor = '#C84040';
    } else {
        scoreColor = '#8A8070';
    }
    evalScore.style.color = scoreColor;

    if (evalBarFill) {
        evalBarFill.classList.remove('loading');
        evalBarFill.style.background = '';
        evalBarFill.style.width = `${evalToBarPercent(scoreStr)}%`;
    }

    if (evalLabel) {
        if (classification) {
            const colorMap = {
                'Brilliant':  '#22d3ee',
                'Best':       '#5A9E60',
                'Excellent':  '#5A9E60',
                'Good':       '#5A9E60',
                'Inaccuracy': '#fbbf24',
                'Missed Win': '#f59e0b',
                'Mistake':    '#f59e0b',
                'Blunder':    '#C84040',
                'Exploring':  '#f59e0b'
            };
            evalLabel.textContent = classification.toUpperCase();
            evalLabel.style.color = colorMap[classification] || '#8A8070';
        } else {
            evalLabel.textContent = '';
            evalLabel.style.color = '';
        }
    }
}

/**
 * 오답노트(Vault) 리스트를 화면에 렌더링합니다.
 */
export function renderVaultList(container, vaultItems, onDelete, onPractice) {
    container.innerHTML = '';
    if (vaultItems.length === 0) {
        container.innerHTML = '<div class="empty-state">Your Vault is empty. Analyze some games and save your mistakes!</div>';
        return;
    }
    
    vaultItems.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        let borderCol = 'var(--border-color)';
        if(item.category === 'blunder') borderCol = 'var(--accent-danger)';
        else if(item.category === 'mistake' || item.category === 'missed') borderCol = 'var(--accent-warning)';

        const el = document.createElement('div');
        el.className = 'game-item';
        el.style.borderLeft = `4px solid ${borderCol}`;
        
        el.innerHTML = `
            <div class="game-item-content">
                <div class="game-category" style="color: ${borderCol};">${item.category}</div>
                <div class="game-san">Played: <strong>${escapeHtml(item.san)}</strong></div>
                <div class="game-best">Best: ${escapeHtml(item.bestMove) || 'Unknown'}</div>
                ${item.notes ? `<div class="game-notes">${escapeHtml(item.notes)}</div>` : ''}
            </div>
            <button class="delete-btn" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
        `;
        
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(item.id);
        });
        
        el.addEventListener('click', () => onPractice(item));
        container.appendChild(el);
    });
}

/**
 * 저장된 전체 게임 리스트를 렌더링합니다.
 */
export function renderSavedGamesList(container, savedGames, onDelete, onLoad) {
    container.innerHTML = '';
    if (savedGames.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved games yet. Analyze a game and save it!</div>';
        return;
    }
    
    savedGames.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        const el = document.createElement('div');
        el.className = 'game-item';
        el.style.borderLeft = `4px solid var(--accent-success)`;
        
        el.innerHTML = `
            <div class="game-item-content">
                <div class="game-title">${escapeHtml(item.title)}</div>
                <div class="game-date">Saved: ${new Date(item.date).toLocaleDateString()}</div>
                ${item.notes ? `<div class="game-notes">${escapeHtml(item.notes)}</div>` : ''}
            </div>
            <button class="delete-btn" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
        `;
        
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(item.id);
        });
        
        el.addEventListener('click', () => onLoad(item.pgn));
        container.appendChild(el);
    });
}