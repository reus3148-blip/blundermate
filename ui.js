/**
 * Renders the list of fetched games into the provided container.
 */
export function renderGamesList(container, games, searchedUsername, onGameClick) {
    container.innerHTML = '';
    const searchLower = searchedUsername.toLowerCase();

    games.forEach(game => {
        const isWhite = game.white.username.toLowerCase() === searchLower;
        const myColor = isWhite ? 'White' : 'Black';
        const opponent = isWhite ? game.black.username : game.white.username;
        const myRating = isWhite ? game.white.rating : game.black.rating;
        
        // Determine Visual Status
        const resultCode = isWhite ? game.white.result : game.black.result;
        let resultClass = 'draw';
        if (resultCode === 'win') resultClass = 'win';
        else if (['checkmated', 'timeout', 'resigned', 'abandoned'].includes(resultCode)) resultClass = 'loss';

        const timeClass = game.time_class.charAt(0).toUpperCase() + game.time_class.slice(1);

        const item = document.createElement('div');
        item.className = `game-item ${resultClass}`;
        item.innerHTML = `
            <div>
                <div style="font-weight: 600;">vs ${opponent}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">
                    Played as ${myColor} (${myRating} ELO) • ${timeClass}
                </div>
            </div>
            <div class="eval-badge" style="background:var(--bg-dark);">Review</div>
        `;

        item.addEventListener('click', () => {
            if (!game.pgn) {
                alert('This game has no PGN available.');
                return;
            }
            onGameClick(game.pgn);
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

    let tr = null;
    for (let i = 0; i < queue.length; i++) {
        const move = queue[i];
        
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
            container.appendChild(tr);
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
}

/**
 * Updates a specific move's evaluation badge.
 */
export function updateUIWithEval(index, scoreStr) {
    const cell = document.getElementById(`move-${index}`);
    if (!cell) return;
    
    const badge = cell.querySelector('.eval-badge');
    if (badge) {
        badge.textContent = scoreStr;
        
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
    document.querySelectorAll('.active-move').forEach(el => el.classList.remove('active-move'));
    document.querySelectorAll('.active-move-row').forEach(el => el.classList.remove('active-move-row'));
    
    const cell = document.getElementById(`move-${index}`);
    if (cell) {
        cell.classList.add('active-move');
        const tr = cell.closest('tr');
        if (tr) {
            tr.classList.add('active-move-row');
            
            // 화면 전체가 당겨지는 현상을 방지하기 위해 컨테이너 내부 스크롤만 조작합니다.
            const container = tr.closest('.moves-container');
            if (container) {
                const scrollTarget = tr.offsetTop - (container.clientHeight / 2) + (tr.clientHeight / 2);
                container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
            }
        }
    }
}

/**
 * Renders the top engine recommended lines (MultiPV).
 */
export function renderEngineLines(container, lines, onHover, onLeave) {
    if (!lines || lines.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `<div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 0.5rem;">Top Engine Lines</div>` + 
        lines.map((line, index) => `
        <div class="engine-line" data-uci="${line.uci || ''}" style="display: flex; gap: 1rem; margin-bottom: 0.3rem; font-family: monospace; font-size: 0.95rem; padding: 0.3rem 0.5rem; background: rgba(0,0,0,0.1); border-radius: 4px; cursor: pointer; transition: background 0.2s;">
            <span style="color: var(--text-secondary);">#${index + 1}</span>
            <span style="min-width: 50px; font-weight: 600; color: ${line.scoreNum > 0.5 ? '#4ade80' : (line.scoreNum < -0.5 ? '#f87171' : 'inherit')};">${line.scoreStr}</span>
            <span style="color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${line.pv.split(' ').slice(0, 5).join(' ')} ...</span>
        </div>
    `).join('');
    
    if (typeof onHover === 'function') {
        container.querySelectorAll('.engine-line').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const uci = el.getAttribute('data-uci');
                if (uci && uci.length >= 4) onHover(uci.slice(0, 2), uci.slice(2, 4));
            });
            el.addEventListener('mouseleave', () => {
                if (typeof onLeave === 'function') onLeave();
            });
            // 모바일 터치(클릭) 지원
            el.addEventListener('click', () => {
                const uci = el.getAttribute('data-uci');
                if (uci && uci.length >= 4) onHover(uci.slice(0, 2), uci.slice(2, 4));
            });
        });
    }
}