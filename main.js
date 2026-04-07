import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';

import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';

// ==========================================
// 1. DOM Elements
// ==========================================
// Manual inputs
const pgnInput = document.getElementById('pgnInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const toggleManualBtn = document.getElementById('toggleManualBtn');
const manualInputWrapper = document.getElementById('manualInputWrapper');

// API inputs
const usernameInput = document.getElementById('usernameInput');
const fetchBtn = document.getElementById('fetchBtn');
const gamesList = document.getElementById('gamesList');

// Analysis Board UI
const engineStatus = document.getElementById('engineStatus');
const analysisStatus = document.getElementById('analysisStatus');
const movesBody = document.getElementById('movesBody');
const boardContainer = document.getElementById('boardContainer');

// ==========================================
// 2. Application State
// ==========================================
let stockfish;
let isEngineReady = false;
let chess = new Chess();
let analysisQueue = [];
let currentAnalysisIndex = 0;
let currentEval = '';
let isAnalyzing = false;
let currentlyViewedIndex = -1;
let cg;

// ==========================================
// 3. Initialization
// ==========================================
cg = Chessground(boardContainer, {
    fen: 'start',
    viewOnly: true,
    animation: { enabled: true, duration: 250 }
});

// ==========================================
// 4. Event Listeners
// ==========================================
toggleManualBtn.addEventListener('click', () => {
    manualInputWrapper.classList.toggle('hidden');
});

fetchBtn.addEventListener('click', handleApiFetch);
analyzeBtn.addEventListener('click', handlePgnReviewStart);

// Keyboard Navigation
document.addEventListener('keydown', (e) => {
    if (analysisQueue.length === 0) return;
    
    // Ignore keyboard shortcuts if user is typing
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    let newIndex = currentlyViewedIndex;
    
    if (e.key === 'ArrowLeft') {
        newIndex = Math.max(0, currentlyViewedIndex - 1);
    } else if (e.key === 'ArrowRight') {
        newIndex = Math.min(analysisQueue.length - 1, currentlyViewedIndex + 1);
    } else {
        return;
    }

    if (newIndex !== currentlyViewedIndex) {
        e.preventDefault();
        updateBoardPosition(newIndex, analysisQueue[newIndex].fen);
    }
});

// ==========================================
// 5. API Logic
// ==========================================
async function handleApiFetch() {
    const username = usernameInput.value.trim();
    if (!username) return;

    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';
    gamesList.innerHTML = '<div style="text-align:center; padding: 1rem;">Loading archives...</div>';

    try {
        const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
        if (!archivesRes.ok) throw new Error('Player not found or API error.');
        
        const archivesData = await archivesRes.json();
        if (!archivesData?.archives?.length) {
            gamesList.innerHTML = '<div style="color:var(--accent-warning); padding:1rem;">No game archives found.</div>';
            return;
        }

        gamesList.innerHTML = '<div style="text-align:center; padding: 1rem;">Loading games...</div>';
        
        const latestArchiveUrl = archivesData.archives[archivesData.archives.length - 1];
        const gamesRes = await fetch(latestArchiveUrl);
        const gamesData = await gamesRes.json();

        if (!gamesData?.games?.length) {
            gamesList.innerHTML = '<div style="color:var(--accent-warning); padding:1rem;">No recent games found.</div>';
            return;
        }

        const recentGames = gamesData.games.slice(-10).reverse();
        renderGamesList(recentGames, username);

    } catch (e) {
        console.error(e);
        gamesList.innerHTML = `<div style="color:var(--accent-danger); padding:1rem;">Failed to fetch games: ${e.message}</div>`;
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Games';
    }
}

function renderGamesList(games, searchedUsername) {
    gamesList.innerHTML = '';
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
            pgnInput.value = game.pgn;
            analyzeBtn.click();
        });

        gamesList.appendChild(item);
    });
}

// ==========================================
// 6. Engine Initialization
// ==========================================
try {
    stockfish = new Worker('./engine/stockfish-18-lite-single.js');
    stockfish.onmessage = handleEngineMessage;
    stockfish.postMessage('uci');
} catch (e) {
    console.error("Failed to load Stockfish worker:", e);
    engineStatus.textContent = 'Engine Error';
    engineStatus.className = 'tag';
    engineStatus.style.color = 'var(--accent-danger)';
}

function handleEngineMessage(event) {
    const line = event.data;
    
    if (line === 'uciok') {
        isEngineReady = true;
        engineStatus.textContent = 'Engine Ready';
        engineStatus.className = 'tag engine-ready';
        stockfish.postMessage('isready');
    } else if (line === 'readyok') {
        if (analysisQueue.length > 0 && !isAnalyzing) {
            processNextInQueue();
        }
    } else if (line.startsWith('info depth')) {
        parseEngineEval(line);
    } else if (line.startsWith('bestmove')) {
        updateUIWithEval(currentAnalysisIndex, currentEval);
        currentAnalysisIndex++;
        isAnalyzing = false;
        processNextInQueue();
    }
}

function parseEngineEval(line) {
    const matchCp = line.match(/score cp (-?\d+)/);
    const matchMate = line.match(/score mate (-?\d+)/);
    const isBlackToMove = analysisQueue[currentAnalysisIndex].fen.includes(' b ');
    
    if (matchCp) {
        let score = parseInt(matchCp[1], 10) / 100;
        if (isBlackToMove) score = -score;
        currentEval = score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    } else if (matchMate) {
        let mateIn = parseInt(matchMate[1], 10);
        if (isBlackToMove) mateIn = -mateIn;
        currentEval = `M${Math.abs(mateIn)}`;
        currentEval = mateIn > 0 ? `+${currentEval}` : `-${currentEval}`;
    }
}

// ==========================================
// 7. Analysis Workflow
// ==========================================
function handlePgnReviewStart() {
    const pgnText = pgnInput.value.trim();
    if (!pgnText) return;

    chess = new Chess();
    const loaded = chess.load_pgn(pgnText);
    
    if (!loaded) {
        alert('Invalid PGN format. Please check your data.');
        return;
    }

    // Reset UI state
    analyzeBtn.disabled = true;
    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = 'Parsing moves...';

    // Build processing queue
    analysisQueue = [];
    let tempChess = new Chess();
    
    chess.history({ verbose: true }).forEach((move, index) => {
        tempChess.move(move);
        analysisQueue.push({
            fen: tempChess.fen(),
            san: move.san,
            turn: tempChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(index / 2) + 1,
            isWhite: index % 2 === 0
        });
    });

    renderMovesTable(analysisQueue);
    
    currentAnalysisIndex = 0;
    analysisStatus.textContent = `Analyzing 0 / ${analysisQueue.length} moves...`;
    
    if (analysisQueue.length > 0) {
        cg.set({ fen: 'start' });
        currentlyViewedIndex = -1;
    }

    if (isEngineReady) {
        processNextInQueue();
    }
}

function processNextInQueue() {
    if (currentAnalysisIndex >= analysisQueue.length) {
        analysisStatus.textContent = 'Analysis Complete';
        analysisStatus.className = 'tag engine-ready';
        analyzeBtn.disabled = false;
        return;
    }

    isAnalyzing = true;
    const pos = analysisQueue[currentAnalysisIndex];
    currentEval = '';
    
    analysisStatus.textContent = `Analyzing move ${currentAnalysisIndex + 1} / ${analysisQueue.length}`;
    
    updateBoardPosition(currentAnalysisIndex, pos.fen);
    
    // Depth 12 is fast enough for browser-based simple reviews
    stockfish.postMessage(`position fen ${pos.fen}`);
    stockfish.postMessage('go depth 12'); 
}

// ==========================================
// 8. UI Rendering
// ==========================================
function renderMovesTable(queue) {
    movesBody.innerHTML = '';
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
            wTd.onclick = () => updateBoardPosition(i, analysisQueue[i].fen);
            
            const bTd = document.createElement('td');
            bTd.id = `move-${i+1}`;
            bTd.className = 'interactive-move';
            
            tr.appendChild(numTd);
            tr.appendChild(wTd);
            tr.appendChild(bTd);
            movesBody.appendChild(tr);
        } else {
            if (tr) {
                const bTd = tr.querySelector(`#move-${i}`);
                if (bTd) {
                    bTd.style.cursor = 'pointer';
                    bTd.innerHTML = `<div class="move-cell"><span class="san">${move.san}</span><span class="eval-badge">...</span></div>`;
                    bTd.onclick = () => updateBoardPosition(i, analysisQueue[i].fen);
                }
            }
        }
    }
}

function updateUIWithEval(index, scoreStr) {
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

function updateBoardPosition(index, fen) {
    cg.set({ fen: fen });
    currentlyViewedIndex = index;
    
    // Clear active highlights
    document.querySelectorAll('.active-move').forEach(el => el.classList.remove('active-move'));
    document.querySelectorAll('.active-move-row').forEach(el => el.classList.remove('active-move-row'));
    
    const cell = document.getElementById(`move-${index}`);
    if (cell) {
        cell.classList.add('active-move');
        const tr = cell.closest('tr');
        if (tr) {
            tr.classList.add('active-move-row');
            tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}
