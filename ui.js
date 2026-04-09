/**
 * Renders the list of fetched games into the provided container.
 */
export function renderGamesList(container, games, searchedUsername, onGameClick) {
    container.innerHTML = '';
    const searchLower = searchedUsername.toLowerCase();

    games.forEach(game => {
        const isWhite = game.white.username.toLowerCase() === searchLower;
        const opponent = isWhite ? game.black.username : game.white.username;
        
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
    if (badge) {
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
            if (classification === 'Blunder') moveCell.classList.add('bg-blunder');
            else if (classification === 'Mistake') moveCell.classList.add('bg-mistake');
            else if (classification === 'Missed Win') moveCell.classList.add('bg-missed-win');
            else if (classification === 'Inaccuracy') moveCell.classList.add('bg-inaccuracy');
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
            if (container) {
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
    
    container.innerHTML = lines.map((line, index) => `
        <div class="engine-line" data-uci="${line.uci || ''}" data-index="${index}" style="display: flex; gap: 1rem; margin-bottom: 0.3rem; font-family: monospace; font-size: 0.95rem; padding: 0.3rem 0.5rem; background: rgba(0,0,0,0.1); border-radius: 4px; cursor: pointer; transition: background 0.2s;">
            <span style="color: var(--text-secondary);">#${index + 1}</span>
            <span style="min-width: 50px; font-weight: 600; color: ${line.scoreNum > 0.5 ? '#4ade80' : (line.scoreNum < -0.5 ? '#f87171' : 'inherit')};">${line.scoreStr}</span>
            <span style="color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${line.pv.split(' ').slice(0, 5).join(' ')} ...</span>
        </div>
    `).join('');
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
 * 상단 평가 점수판과 현재 수의 상태(Blunder, Mistake 등) 텍스트를 업데이트합니다.
 */
export function updateTopEvalDisplay(scoreStr, classification = '') {
    const topEvalDisplay = document.getElementById('topEvalDisplay');
    const moveClassification = document.getElementById('moveClassification');
    
    if (!topEvalDisplay) return;
    
    topEvalDisplay.innerHTML = scoreStr || '-';
    topEvalDisplay.className = 'top-eval-display'; 
    
    const numVal = parseFloat(scoreStr);
    if (!isNaN(numVal)) {
        if (numVal > 0.5) topEvalDisplay.classList.add('positive');
        else if (numVal < -0.5) topEvalDisplay.classList.add('negative');
    } else if (scoreStr && scoreStr.startsWith('+M')) {
        topEvalDisplay.classList.add('positive');
    } else if (scoreStr && scoreStr.startsWith('-M')) {
        topEvalDisplay.classList.add('negative');
    }

    if (moveClassification) {
        if (classification) {
            const colorMap = {
                'Blunder': 'var(--accent-danger)',
                'Mistake': 'var(--accent-warning)',
                'Missed Win': 'var(--accent-warning)',
                'Inaccuracy': '#fbbf24',
                'Good': '#60a5fa',
                'Best': 'var(--accent-success)',
                'Exploring': 'var(--accent-warning)'
            };
            moveClassification.textContent = classification;
            moveClassification.style.color = colorMap[classification] || 'var(--text-secondary)';
        } else {
            moveClassification.textContent = '';
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
                <div class="game-san">Played: <strong>${item.san}</strong></div>
                <div class="game-best">Best: ${item.bestMove || 'Unknown'}</div>
                ${item.notes ? `<div class="game-notes">📝 ${item.notes}</div>` : ''}
            </div>
            <button class="delete-btn">❌</button>
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
                <div class="game-title">${item.title}</div>
                <div class="game-date">Saved: ${new Date(item.date).toLocaleDateString()}</div>
                ${item.notes ? `<div class="game-notes">📝 ${item.notes}</div>` : ''}
            </div>
            <button class="delete-btn">❌</button>
        `;
        
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(item.id);
        });
        
        el.addEventListener('click', () => onLoad(item.pgn));
        container.appendChild(el);
    });
}