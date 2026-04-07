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
const openVaultBtn = document.getElementById('openVaultBtn');

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
const prevMoveBtn = document.getElementById('prevMoveBtn');
const saveMoveBtn = document.getElementById('saveMoveBtn');
const nextMoveBtn = document.getElementById('nextMoveBtn');

// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');
const topEvalDisplay = document.getElementById('topEvalDisplay');

// Modal Elements
const saveModal = document.getElementById('saveModal');
const saveMoveText = document.getElementById('saveMoveText');
const saveBestMoveText = document.getElementById('saveBestMoveText');
const saveCategory = document.getElementById('saveCategory');
const saveNotes = document.getElementById('saveNotes');
const cancelSaveBtn = document.getElementById('cancelSaveBtn');
const confirmSaveBtn = document.getElementById('confirmSaveBtn');

// Vault & Practice Elements
const vaultView = document.getElementById('vaultView');
const vaultList = document.getElementById('vaultList');
const vaultBackBtn = document.getElementById('vaultBackBtn');
const practiceView = document.getElementById('practiceView');
const practiceBoardContainer = document.getElementById('practiceBoardContainer');
const practiceFeedback = document.getElementById('practiceFeedback');
const practiceBackBtn = document.getElementById('practiceBackBtn');

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
let persistentShapes = []; // 블런더/실수 시 보드에 고정될 화살표를 저장하는 배열
let isUserWhite = true; // 분석 기준이 되는 사용자 색상 (기본: 백)
let currentBestMoveForVault = ''; // 저장 시 함께 보관할 최선의 수
let practiceCg; // 연습 모드용 체스 보드

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

vaultBackBtn.addEventListener('click', () => {
    vaultView.classList.add('hidden');
    homeView.classList.remove('hidden');
});

practiceBackBtn.addEventListener('click', () => {
    practiceView.classList.add('hidden');
    vaultView.classList.remove('hidden');
});

fetchBtn.addEventListener('click', handleApiFetch);
usernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        handleApiFetch();
    }
});
analyzeBtn.addEventListener('click', () => handlePgnReviewStart());

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

prevMoveBtn.addEventListener('click', () => {
    if (analysisQueue.length === 0) return;
    const newIndex = Math.max(0, currentlyViewedIndex - 1);
    if (newIndex !== currentlyViewedIndex) {
        updateBoardPosition(newIndex, analysisQueue[newIndex].fen);
    }
});

nextMoveBtn.addEventListener('click', () => {
    if (analysisQueue.length === 0) return;
    const newIndex = Math.min(analysisQueue.length - 1, currentlyViewedIndex + 1);
    if (newIndex !== currentlyViewedIndex) {
        updateBoardPosition(newIndex, analysisQueue[newIndex].fen);
    }
});

// --- Save Move to Vault Logic ---
saveMoveBtn.addEventListener('click', () => {
    if (currentlyViewedIndex < 0 || !analysisQueue[currentlyViewedIndex]) {
        alert('Cannot save the starting position.');
        return;
    }
    
    const move = analysisQueue[currentlyViewedIndex];
    const moveNumberStr = move.moveNumber + (move.isWhite ? '. ' : '... ');
    saveMoveText.textContent = moveNumberStr + move.san;
    
    // Calculate Best Move from the previous position's engine lines
    currentBestMoveForVault = '';
    if (currentlyViewedIndex > 0) {
        const prevMove = analysisQueue[currentlyViewedIndex - 1];
        if (prevMove && prevMove.engineLines && prevMove.engineLines[0] && prevMove.engineLines[0].pv) {
            currentBestMoveForVault = prevMove.engineLines[0].pv.split(' ')[0];
        }
    }
    if (currentBestMoveForVault) saveBestMoveText.textContent = `Engine suggested: ${currentBestMoveForVault}`;
    else saveBestMoveText.textContent = '';

    // Auto-select category based on engine classification
    if (move.classification && ['blunder', 'mistake', 'missed'].includes(move.classification)) {
        saveCategory.value = move.classification;
    } else {
        saveCategory.value = 'positional'; // Default fallback
    }
    
    saveNotes.value = '';
    saveModal.classList.remove('hidden');
});

cancelSaveBtn.addEventListener('click', () => {
    saveModal.classList.add('hidden');
});

confirmSaveBtn.addEventListener('click', () => {
    const move = analysisQueue[currentlyViewedIndex];
    const vaultItem = {
        id: Date.now(),
        date: new Date().toISOString(),
        fen: move.fen,
        prevFen: currentlyViewedIndex > 0 ? analysisQueue[currentlyViewedIndex - 1].fen : 'start',
        san: move.san,
        bestMove: currentBestMoveForVault,
        moveNumber: move.moveNumber,
        isWhite: move.isWhite,
        category: saveCategory.value,
        notes: saveNotes.value.trim(),
        engineLines: move.engineLines
    };
    
    const vault = JSON.parse(localStorage.getItem('blundermate_vault') || '[]');
    vault.push(vaultItem);
    localStorage.setItem('blundermate_vault', JSON.stringify(vault));
    
    saveModal.classList.add('hidden');
    
    // UX Feedback
    const originalText = saveMoveBtn.textContent;
    saveMoveBtn.textContent = '✔ Saved!';
    saveMoveBtn.style.color = 'var(--accent-success)';
    setTimeout(() => {
        saveMoveBtn.textContent = originalText;
        saveMoveBtn.style.color = '';
    }, 1500);
});

// --- My Vault & Practice Logic ---
openVaultBtn.addEventListener('click', () => {
    homeView.classList.add('hidden');
    vaultView.classList.remove('hidden');
    renderVaultList();
});

function renderVaultList() {
    const vault = JSON.parse(localStorage.getItem('blundermate_vault') || '[]');
    vaultList.innerHTML = '';
    if (vault.length === 0) {
        vaultList.innerHTML = '<div class="empty-state">Your Vault is empty. Analyze some games and save your mistakes!</div>';
        return;
    }
    
    // 최신 저장순으로 정렬
    vault.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        let borderCol = 'var(--border-color)';
        if(item.category === 'blunder') borderCol = 'var(--accent-danger)';
        else if(item.category === 'mistake' || item.category === 'missed') borderCol = 'var(--accent-warning)';

        const el = document.createElement('div');
        el.className = 'game-item';
        el.style.borderLeft = `4px solid ${borderCol}`;
        
        el.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: 600; color: ${borderCol}; text-transform: uppercase; font-size: 0.85rem;">${item.category}</div>
                <div style="font-size: 1rem; margin-top: 4px;">Played: <strong>${item.san}</strong></div>
                <div style="font-size: 0.85rem; color: var(--accent-success); margin-top: 2px;">Best: ${item.bestMove || 'Unknown'}</div>
                ${item.notes ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 6px;">📝 ${item.notes}</div>` : ''}
            </div>
            <button class="delete-vault-btn">❌</button>
        `;
        
        // 삭제 버튼 이벤트
        el.querySelector('.delete-vault-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm('Delete this saved move from your Vault?')) {
                const newVault = vault.filter(v => v.id !== item.id);
                localStorage.setItem('blundermate_vault', JSON.stringify(newVault));
                renderVaultList();
            }
        });
        
        // 연습 모드 실행 이벤트
        el.addEventListener('click', () => startPractice(item));
        vaultList.appendChild(el);
    });
}

function startPractice(item) {
    vaultView.classList.add('hidden');
    practiceView.classList.remove('hidden');
    practiceFeedback.className = 'top-eval-display';
    practiceFeedback.textContent = 'Find Best Move';

    const practiceChess = new Chess(item.prevFen);
    const turnColor = practiceChess.turn() === 'w' ? 'white' : 'black';

    if (!practiceCg) {
        practiceCg = Chessground(practiceBoardContainer, { animation: { enabled: true, duration: 250 } });
    }

    practiceCg.set({
        fen: item.prevFen,
        orientation: item.isWhite ? 'white' : 'black',
        turnColor: turnColor,
        movable: {
            color: turnColor,
            free: false,
            dests: getDests(practiceChess)
        },
        drawable: { autoShapes: [] }
    });

    practiceCg.set({
        events: {
            move: (orig, dest) => {
                const moveRes = practiceChess.move({ from: orig, to: dest, promotion: 'q' });
                if (!moveRes) return;
                
                let isCorrect = (item.bestMove === moveRes.san || item.bestMove === (moveRes.from + moveRes.to));
                
                if (isCorrect) {
                    practiceFeedback.textContent = 'Correct! ' + moveRes.san;
                    practiceFeedback.className = 'top-eval-display positive';
                    practiceCg.set({ fen: practiceChess.fen(), movable: { color: undefined } }); // Lock board
                } else {
                    const isBlunder = (moveRes.san === item.san);
                    practiceFeedback.textContent = (isBlunder ? 'Blunder played! ' : 'Incorrect: ') + moveRes.san;
                    practiceFeedback.className = 'top-eval-display negative';
                    setTimeout(() => {
                        practiceChess.undo();
                        practiceCg.set({ fen: practiceChess.fen(), turnColor: turnColor });
                        practiceFeedback.textContent = 'Try again';
                        practiceFeedback.className = 'top-eval-display';
                    }, 800);
                }
            }
        }
    });
    setTimeout(() => practiceCg.redrawAll(), 50);
}

// Redraw board on window resize or device rotation for better responsive behavior
window.addEventListener('resize', () => {
    if (cg && !analysisView.classList.contains('hidden')) {
        cg.redrawAll();
    }
    if (practiceCg && !practiceView.classList.contains('hidden')) {
        practiceCg.redrawAll();
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
        renderGamesList(gamesList, recentGames, username, (pgn, isWhiteGame) => {
            pgnInput.value = pgn;
            handlePgnReviewStart(null, isWhiteGame);
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
                updateTopEvalDisplay(currentEval, currentMove.classification);
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
        
        // 기보 분석 판별 로직 호출
        const classification = classifyMove(currentAnalysisIndex);
        analysisQueue[currentAnalysisIndex].classification = classification;
        
        updateUIWithEval(currentAnalysisIndex, currentEval);
        if (currentlyViewedIndex === currentAnalysisIndex) {
            updateTopEvalDisplay(currentEval, classification);
        }
        currentAnalysisIndex++;
        isAnalyzing = false;
        processNextInQueue();
    }
};

stockfish = new StockfishEngine('./engine/stockfish-18-lite-single.js', engineCallbacks);

// ==========================================
// 7. Analysis Workflow
// ==========================================
function handlePgnReviewStart(e = null, isWhiteGame = null) {
    if (isWhiteGame !== null) {
        isUserWhite = isWhiteGame;
    } else {
        isUserWhite = true; // 수동 입력 시 기본값
        // 수동으로 붙여넣은 PGN 텍스트에 검색된 사용자 이름(Black)이 있는지 감지합니다.
        const username = usernameInput.value.trim().toLowerCase();
        if (username && pgnInput.value) {
            const blackPlayerMatch = pgnInput.value.match(/\[Black\s+"([^"]+)"\]/i);
            if (blackPlayerMatch && blackPlayerMatch[1].toLowerCase() === username) {
                isUserWhite = false;
            }
        }
    }

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
    const startFen = chess.header().FEN;
    if (startFen) {
        tempChess.load(startFen);
    }
    
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
        persistentShapes = [];
        const initialFen = chess.header().FEN || 'start';
        cg.set({ 
            fen: initialFen, 
            orientation: isUserWhite ? 'white' : 'black',
            drawable: { autoShapes: [] } 
        });
        currentlyViewedIndex = -1;
        updateTopEvalDisplay('-');
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
        
        // 분석 완료 시 체스판을 제일 첫 화면(시작 위치)으로 되돌리기
        updateBoardPosition(-1, chess.header().FEN || 'start');
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
    
    // 블런더나 실수인 경우, 이전 턴(index - 1)에서 엔진이 추천했던 최선의 수를 파란색 화살표로 표시
    persistentShapes = [];
    if (index > 0 && analysisQueue[index]) {
        const cls = analysisQueue[index].classification;
        if (cls === 'blunder' || cls === 'mistake' || cls === 'missed') {
            const prevMove = analysisQueue[index - 1];
            if (prevMove && prevMove.engineLines && prevMove.engineLines[0] && prevMove.engineLines[0].uci) {
                const bestUci = prevMove.engineLines[0].uci;
                if (bestUci.length >= 4) {
                    const orig = bestUci.slice(0, 2);
                    const dest = bestUci.slice(2, 4);
                    persistentShapes.push({ orig, dest, brush: 'blue' });
                }
            }
        }
    }
    cg.set({ drawable: { autoShapes: persistentShapes } });
    
    // 화면이 바뀔 때, 해당 수에 저장된 엔진 추천 라인이 있다면 화면에 다시 렌더링
    if (analysisQueue[index] && analysisQueue[index].engineLines && analysisQueue[index].engineLines.length > 0) {
        renderEngineLines(engineLinesContainer, analysisQueue[index].engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow);
        updateTopEvalDisplay(analysisQueue[index].engineLines[0].scoreStr, analysisQueue[index].classification);
    } else {
        engineLinesContainer.innerHTML = '';
        updateTopEvalDisplay('-');
    }
}

// ==========================================
// 9. Helpers
// ==========================================
function getDests(tempChess) {
    const dests = new Map();
    tempChess.SQUARES.forEach(s => {
        const ms = tempChess.moves({ square: s, verbose: true });
        if (ms.length) dests.set(s, ms.map(m => m.to));
    });
    return dests;
}

function updateTopEvalDisplay(scoreStr, classification = '') {
    if (!topEvalDisplay) return;
    
    let iconHtml = '';
    if (classification === 'blunder') iconHtml = '<span style="color: var(--accent-danger); margin-left: 4px;">??</span>';
    else if (classification === 'mistake') iconHtml = '<span style="color: var(--accent-warning); margin-left: 4px;">?</span>';
    else if (classification === 'missed') iconHtml = '<span style="color: var(--accent-warning); margin-left: 4px;">?!</span>';
    
    topEvalDisplay.innerHTML = (scoreStr || '-') + iconHtml;
    topEvalDisplay.className = 'top-eval-display'; // 색상 초기화
    
    const numVal = parseFloat(scoreStr);
    if (!isNaN(numVal)) {
        if (numVal > 0.5) topEvalDisplay.classList.add('positive');
        else if (numVal < -0.5) topEvalDisplay.classList.add('negative');
    } else if (scoreStr && scoreStr.startsWith('+M')) {
        topEvalDisplay.classList.add('positive');
    } else if (scoreStr && scoreStr.startsWith('-M')) {
        topEvalDisplay.classList.add('negative');
    }
}

function drawEngineArrow(orig, dest) {
    cg.set({
        drawable: {
            autoShapes: [...persistentShapes, { orig, dest, brush: 'paleGreen' }]
        }
    });
}

function clearEngineArrow() {
    cg.set({
        drawable: {
            autoShapes: persistentShapes
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

function classifyMove(index) {
    if (index < 0) return '';
    const move = analysisQueue[index];
    if (!move.engineLines || !move.engineLines[0]) return '';
    
    const isWhite = move.isWhite;
    const currEval = move.engineLines[0];
    
    let prevEval = { scoreNum: 0.2, scoreStr: '+0.20' }; // 기본 오프닝 점수
    let prevLines = [];
    if (index > 0) {
        const prevMove = analysisQueue[index - 1];
        if (!prevMove.engineLines || !prevMove.engineLines[0]) return '';
        prevEval = prevMove.engineLines[0];
        prevLines = prevMove.engineLines;
    }

    const getMate = (str) => {
        if (!str) return null;
        if (str.startsWith('+M')) return parseInt(str.substring(2));
        if (str.startsWith('-M')) return -parseInt(str.substring(2));
        return null;
    };

    const prevMate = getMate(prevEval.scoreStr);
    const currMate = getMate(currEval.scoreStr);

    // 수를 직접 둔 플레이어(백/흑) 관점에서의 점수와 메이트 (> 0 이면 유리함)
    const isUserTurn = (isWhite === isUserWhite);
    const prevPlayerMate = prevMate !== null ? (isUserTurn ? prevMate : -prevMate) : null;
    const currPlayerMate = currMate !== null ? (isUserTurn ? currMate : -currMate) : null;
    const prevPlayerScore = isUserTurn ? prevEval.scoreNum : -prevEval.scoreNum;
    const currPlayerScore = isUserTurn ? currEval.scoreNum : -currEval.scoreNum;
    const advantageChange = currPlayerScore - prevPlayerScore; // 음수면 불리해짐

    // 1. Blunder (블런더): 유리한 상황에서 불리해짐 or 3수 이내 메이트 놓침 or 3점 이상 폭락
    const missedMate = (prevPlayerMate !== null && prevPlayerMate > 0 && prevPlayerMate <= 3) && 
                       (currPlayerMate === null || currPlayerMate > prevPlayerMate);
    const lostAdvantage = prevPlayerScore > 0 && currPlayerScore < 0 && advantageChange <= -1.0;
    const massiveDrop = advantageChange <= -3.0; 
    if (missedMate || lostAdvantage || massiveDrop) return 'blunder';

    // 2. Missed Win (놓친 수): 좋은 수가 유일수 인 상황 놓침 (1순위와 2순위 차이 1.5 이상)
    if (prevLines && prevLines.length > 1 && prevLines[1]) {
        const bestMoveScore = isUserTurn ? prevLines[0].scoreNum : -prevLines[0].scoreNum;
        const secondBestScore = isUserTurn ? prevLines[1].scoreNum : -prevLines[1].scoreNum;
        if (bestMoveScore > 0 && (bestMoveScore - secondBestScore >= 1.5) && advantageChange <= -1.0) return 'missed';
    }

    // 3. Mistake (실수): 불리한 상황에서 1점 이상 더 불리해짐 or 단순 1.5점 이상 하락
    if ((prevPlayerScore < 0 && advantageChange <= -1.0) || advantageChange <= -1.5) return 'mistake';

    return '';
}
