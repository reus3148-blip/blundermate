import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { fetchRecentGames } from './api.js';
import { StockfishEngine } from './engine.js';
import { renderGamesList, renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines } from './ui.js';

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
const engineLinesContainer = document.getElementById('engineLines');

// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');

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
let isWaitingForStop = false;
let pendingQueue = null;

// ==========================================
// 3. Initialization
// ==========================================
cg = Chessground(boardContainer, {
    fen: 'start',
    viewOnly: true,
    animation: { enabled: true, duration: 250 },
    drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true
    }
});

// ==========================================
// 4. Event Listeners
// ==========================================
toggleManualBtn.addEventListener('click', () => {
    manualInputWrapper.classList.toggle('hidden');
});

backBtn.addEventListener('click', () => {
    analysisView.classList.add('hidden');
    homeView.classList.remove('hidden');
});

fetchBtn.addEventListener('click', handleApiFetch);
usernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        handleApiFetch();
    }
});
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
        gamesList.innerHTML = '<div style="text-align:center; padding: 1rem;">Fetching latest games...</div>';
        const recentGames = await fetchRecentGames(username);
        renderGamesList(gamesList, recentGames, username, (pgn) => {
            pgnInput.value = pgn;
            analyzeBtn.click();
        });

    } catch (e) {
        console.error(e);
        gamesList.innerHTML = `<div style="color:var(--accent-danger); padding:1rem;">Failed to fetch games: ${e.message}</div>`;
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch Games';
    }
}

// ==========================================
// 6. Engine Initialization
// ==========================================
const engineCallbacks = {
    onError: (e) => {
        console.error("Failed to load Stockfish worker:", e);
        engineStatus.textContent = 'Engine Error';
        engineStatus.className = 'tag';
        engineStatus.style.color = 'var(--accent-danger)';
    },
    onUciOk: () => {
        isEngineReady = true;
        engineStatus.textContent = 'Engine Ready';
        engineStatus.className = 'tag engine-ready';
    },
    onReady: () => {
        if (analysisQueue.length > 0 && !isAnalyzing) {
            processNextInQueue();
        }
    },
    onEval: (evalData) => {
        const isBlackToMove = analysisQueue[currentAnalysisIndex].fen.includes(' b ');
        let scoreStr = '';
        let scoreNum = 0;
        
        if (evalData.type === 'cp') {
            let score = evalData.value;
            if (isBlackToMove) score = -score;
            scoreNum = score;
            scoreStr = score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
        } else if (evalData.type === 'mate') {
            let mateIn = evalData.value;
            if (isBlackToMove) mateIn = -mateIn;
            scoreNum = mateIn > 0 ? 999 : -999;
            scoreStr = `M${Math.abs(mateIn)}`;
            scoreStr = mateIn > 0 ? `+${scoreStr}` : `-${scoreStr}`;
        }
        
        const lineIndex = evalData.multipv - 1;
        const currentMove = analysisQueue[currentAnalysisIndex];
        const sanPv = convertPvToSan(evalData.pv, currentMove.fen);
        const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
        currentMove.engineLines[lineIndex] = { scoreStr, scoreNum, pv: sanPv, uci: firstUci };
        
        // Update Main Evaluation from Top Line (MultiPV 1)
        if (currentMove.engineLines[0]) {
            currentEval = currentMove.engineLines[0].scoreStr;
            // 현재 보고 있는 화면이 엔진이 분석 중인 수와 같을 때만 UI 실시간 업데이트
            if (currentlyViewedIndex === currentAnalysisIndex) {
                renderEngineLines(engineLinesContainer, currentMove.engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow);
            }
        }
    },
    onBestMove: () => {
        // 대기 상태인 경우: 이전 분석이 완전히 종료되었음을 확인하고 새 분석 시작
        if (isWaitingForStop) {
            isWaitingForStop = false;
            if (pendingQueue) {
                startNewAnalysis(pendingQueue);
                pendingQueue = null;
            }
            return;
        }
        
        // Only show the score in the badge as requested
        updateUIWithEval(currentAnalysisIndex, currentEval);
        currentAnalysisIndex++;
        isAnalyzing = false;
        processNextInQueue();
    }
};

stockfish = new StockfishEngine('./engine/stockfish-18-lite-single.js', engineCallbacks);

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

    // Build processing queue
    const newQueue = [];
    let tempChess = new Chess();
    
    chess.history({ verbose: true }).forEach((move, index) => {
        tempChess.move(move);
        newQueue.push({
            fen: tempChess.fen(),
            san: move.san,
            turn: tempChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(index / 2) + 1,
            isWhite: index % 2 === 0,
            engineLines: [] // 각 수마다 엔진 추천 라인을 저장할 배열 추가
        });
    });

    // Safe Engine Restart Logic
    if (isAnalyzing || isWaitingForStop) {
        analysisStatus.className = 'tag engine-loading';
        analysisStatus.textContent = 'Stopping previous analysis...';
        pendingQueue = newQueue;
        isWaitingForStop = true;
        isAnalyzing = false;
        stockfish.stop();
        return;
    }

    startNewAnalysis(newQueue);
}

function startNewAnalysis(newQueue) {
    // Switch to Analysis View
    homeView.classList.add('hidden');
    analysisView.classList.remove('hidden');
    
    // Force Chessground to recalculate board size for mobile
    setTimeout(() => { if (cg) cg.redrawAll(); }, 50);

    analysisQueue = newQueue;
    analyzeBtn.disabled = true;
    analysisStatus.className = 'tag engine-loading';

    renderMovesTable(movesBody, analysisQueue, (index) => {
        updateBoardPosition(index, analysisQueue[index].fen);
    });
    
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
    
    // Ensure engine is fully ready before sending position
    // If not ready, we skip sending 'go' and rely on onReady callback
    if (!isEngineReady) {
        analysisStatus.textContent = 'Waiting for Engine...';
        return;
    }

    // Depth 12 is fast enough for browser-based simple reviews
    stockfish.analyzeFen(pos.fen, 12);
}

// ==========================================
// 8. UI Rendering
// ==========================================
function updateBoardPosition(index, fen) {
    cg.set({ fen: fen });
    currentlyViewedIndex = index;
    highlightActiveMove(index);
    
    // 화면이 바뀔 때, 해당 수에 저장된 엔진 추천 라인이 있다면 화면에 다시 렌더링
    if (analysisQueue[index] && analysisQueue[index].engineLines) {
        renderEngineLines(engineLinesContainer, analysisQueue[index].engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow);
    } else {
        engineLinesContainer.innerHTML = '';
    }
}

// ==========================================
// 9. Helpers
// ==========================================
function drawEngineArrow(orig, dest) {
    cg.set({
        drawable: {
            autoShapes: [{ orig, dest, brush: 'paleGreen' }]
        }
    });
}

function clearEngineArrow() {
    cg.set({
        drawable: {
            autoShapes: []
        }
    });
}

function convertPvToSan(pv, fen) {
    if (!pv) return '';
    const temp = new Chess(fen);
    const moves = pv.split(' ');
    const sanMoves = [];
    
    // UI에서 최대 5수만 보여주므로, 성능을 위해 앞의 5수만 변환합니다.
    const limit = Math.min(moves.length, 5); 
    
    for (let i = 0; i < limit; i++) {
        const uci = moves[i];
        if (!uci) continue;
        
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
        
        const moveRes = temp.move({ from, to, promotion });
        if (moveRes) sanMoves.push(moveRes.san);
        else break; // 엔진이 보내준 수가 체스 규칙에 어긋나는 경우(드묾) 중단
    }
    return sanMoves.join(' ');
}
