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
const openSavedGamesBtn = document.getElementById('openSavedGamesBtn');

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
const returnMainLineBtn = document.getElementById('returnMainLineBtn');
const explainMoveBtn = document.getElementById('explainMoveBtn');
const geminiExplanation = document.getElementById('geminiExplanation');

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

const saveChoiceModal = document.getElementById('saveChoiceModal');
const choiceSaveMoveBtn = document.getElementById('choiceSaveMoveBtn');
const choiceSaveGameBtn = document.getElementById('choiceSaveGameBtn');
const cancelChoiceBtn = document.getElementById('cancelChoiceBtn');

const saveGameModal = document.getElementById('saveGameModal');
const saveGameTitle = document.getElementById('saveGameTitle');
const saveGameNotes = document.getElementById('saveGameNotes');
const cancelSaveGameBtn = document.getElementById('cancelSaveGameBtn');
const confirmSaveGameBtn = document.getElementById('confirmSaveGameBtn');

// Vault & Practice Elements
const vaultView = document.getElementById('vaultView');
const vaultList = document.getElementById('vaultList');
const vaultBackBtn = document.getElementById('vaultBackBtn');
const practiceView = document.getElementById('practiceView');
const practiceBoardContainer = document.getElementById('practiceBoardContainer');
const practiceFeedback = document.getElementById('practiceFeedback');
const practiceBackBtn = document.getElementById('practiceBackBtn');

// Saved Games Elements
const savedGamesView = document.getElementById('savedGamesView');
const savedGamesList = document.getElementById('savedGamesList');
const savedGamesBackBtn = document.getElementById('savedGamesBackBtn');

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
let isExplorationMode = false; // 엔진 라인 탐색 모드 여부
let explorationChess = new Chess();
let explorationEngineLines = [];
let isSimulationMode = false; // 엔진 추천 라인 시뮬레이션 모드 여부
let simulationQueue = [];
let simulationIndex = -1;

// ==========================================
// 3. Initialization
// ==========================================
cg = Chessground(boardContainer, {
    fen: 'start',
    animation: { enabled: true, duration: 250 },
    drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true
    },
    events: {
        move: (orig, dest) => handleExplorationMove(orig, dest)
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
    
    // Stop engine to save resources when returning to home view
    stockfish.stop();
    isAnalyzing = false;
    isWaitingForStop = false;
    pendingQueue = null;
});

vaultBackBtn.addEventListener('click', () => {
    vaultView.classList.add('hidden');
    homeView.classList.remove('hidden');
});

practiceBackBtn.addEventListener('click', () => {
    practiceView.classList.add('hidden');
    vaultView.classList.remove('hidden');
});

savedGamesBackBtn.addEventListener('click', () => {
    savedGamesView.classList.add('hidden');
    homeView.classList.remove('hidden');
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
    
    if (isSimulationMode) {
        if (e.key === 'ArrowLeft') {
            simulationIndex = Math.max(0, simulationIndex - 1);
            updateBoardForSimulation(simulationIndex);
        } else if (e.key === 'ArrowRight') {
            simulationIndex = Math.min(simulationQueue.length - 1, simulationIndex + 1);
            updateBoardForSimulation(simulationIndex);
        }
        return;
    }

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
    if (isSimulationMode) {
        simulationIndex = Math.max(0, simulationIndex - 1);
        updateBoardForSimulation(simulationIndex);
        return;
    }
    if (analysisQueue.length === 0) return;
    const newIndex = Math.max(0, currentlyViewedIndex - 1);
    if (newIndex !== currentlyViewedIndex) {
        updateBoardPosition(newIndex, analysisQueue[newIndex].fen);
    }
});

nextMoveBtn.addEventListener('click', () => {
    if (isSimulationMode) {
        simulationIndex = Math.min(simulationQueue.length - 1, simulationIndex + 1);
        updateBoardForSimulation(simulationIndex);
        return;
    }
    if (analysisQueue.length === 0) return;
    const newIndex = Math.min(analysisQueue.length - 1, currentlyViewedIndex + 1);
    if (newIndex !== currentlyViewedIndex) {
        updateBoardPosition(newIndex, analysisQueue[newIndex].fen);
    }
});

returnMainLineBtn.addEventListener('click', () => {
    exitExplorationMode();
    if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) {
        updateBoardPosition(currentlyViewedIndex, analysisQueue[currentlyViewedIndex].fen);
    } else {
        const startFen = chess.header().FEN || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        updateBoardPosition(-1, startFen);
    }
});

// --- Gemini Explanation Logic ---
explainMoveBtn.addEventListener('click', async () => {
    let apiKey = localStorage.getItem('blundermate_gemini_key');
    if (!apiKey) {
        apiKey = prompt("Please enter your Gemini API Key (It will be saved locally):");
        if (!apiKey) return;
        localStorage.setItem('blundermate_gemini_key', apiKey);
    }

    let promptText = '';
    geminiExplanation.classList.remove('hidden');
    geminiExplanation.innerHTML = '<div style="color: #a855f7;"><em>✨ Gemini is analyzing the position...</em></div>';

    if (isExplorationMode) {
        if (!explorationEngineLines[0]) return;
        const fen = explorationChess.fen();
        const bestMoveSan = explorationEngineLines[0].pv.split(' ')[0];
        promptText = `Act as a chess grandmaster. The current position FEN is "${fen}". Stockfish recommends "${bestMoveSan}" as the best move. Briefly explain the positional or tactical idea behind "${bestMoveSan}" in 2-3 sentences.`;
    } else {
        if (currentlyViewedIndex < 0) return;
        const move = analysisQueue[currentlyViewedIndex];
        if (!move || !move.engineLines || !move.engineLines[0]) return;
        
        const fen = move.fen;
        const playedMove = move.san;
        const classification = move.classification || 'Move';
        const bestMoveSan = move.engineLines[0].pv.split(' ')[0];

        promptText = `Act as a chess grandmaster. The current position FEN is "${fen}". `;
        if (['Blunder', 'Mistake', 'Missed Win', 'Inaccuracy'].includes(classification)) {
            promptText += `The player played "${playedMove}", which is a ${classification}. `;
        } else {
            promptText += `The player played "${playedMove}". `;
        }
        promptText += `Stockfish recommends "${bestMoveSan}" as the best move. Briefly explain why "${bestMoveSan}" is good, and if "${playedMove}" was a mistake, explain the tactical or positional reason why in 2 to 3 sentences. Be clear and concise.`;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });
        if (!response.ok) {
            if (response.status === 400) throw new Error('Invalid API Key.');
            throw new Error('API request failed.');
        }
        const data = await response.json();
        let explanation = data.candidates[0].content.parts[0].text;
        explanation = explanation.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #fff;">$1</strong>');
        geminiExplanation.innerHTML = `<div style="margin-bottom: 0.5rem; font-weight: bold; color: #a855f7;">✨ Gemini 1.5 Flash</div>${explanation.replace(/\n/g, '<br>')}`;
    } catch (err) {
        geminiExplanation.innerHTML = `<span style="color: var(--accent-danger);">Error: ${err.message} <button id="resetGeminiKey" class="text-btn" style="margin-left: 10px;">Reset Key</button></span>`;
        document.getElementById('resetGeminiKey').addEventListener('click', () => { localStorage.removeItem('blundermate_gemini_key'); geminiExplanation.classList.add('hidden'); });
    }
});

// --- Save Move to Vault Logic ---
saveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.remove('hidden');
});

cancelChoiceBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');
});

choiceSaveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');
    
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
    if (move.classification) {
        const cls = move.classification.toLowerCase();
        if (cls === 'blunder') saveCategory.value = 'blunder';
        else if (cls === 'mistake') saveCategory.value = 'mistake';
        else if (cls === 'missed win') saveCategory.value = 'missed';
        else saveCategory.value = 'positional';
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
    let initialMoveFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    try {
        if (chess && chess.header() && chess.header().FEN) {
            initialMoveFen = chess.header().FEN;
        }
    } catch(e) {}

    const vaultItem = {
        id: Date.now(),
        date: new Date().toISOString(),
        fen: move.fen,
        prevFen: currentlyViewedIndex > 0 ? analysisQueue[currentlyViewedIndex - 1].fen : initialMoveFen,
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

// --- Save Entire Game Logic ---
choiceSaveGameBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');
    
    // PGN 헤더에서 플레이어 이름 추출 시도
    let defaultTitle = "Saved Game";
    try {
        const h = chess.header();
        if (h && h.White && h.Black && h.White !== '?' && h.Black !== '?') {
            defaultTitle = `${h.White} vs ${h.Black}`;
        }
    } catch(e) {}

    saveGameTitle.value = defaultTitle;
    saveGameNotes.value = '';
    saveGameModal.classList.remove('hidden');
});

cancelSaveGameBtn.addEventListener('click', () => {
    saveGameModal.classList.add('hidden');
});

confirmSaveGameBtn.addEventListener('click', () => {
    const title = saveGameTitle.value.trim() || 'Untitled Game';
    const notes = saveGameNotes.value.trim();
    const pgn = chess.pgn();
    
    const savedGameItem = {
        id: Date.now(),
        date: new Date().toISOString(),
        title: title,
        notes: notes,
        pgn: pgn
    };
    
    const savedGames = JSON.parse(localStorage.getItem('blundermate_saved_games') || '[]');
    savedGames.push(savedGameItem);
    localStorage.setItem('blundermate_saved_games', JSON.stringify(savedGames));
    
    saveGameModal.classList.add('hidden');
    
    const originalText = saveMoveBtn.textContent;
    saveMoveBtn.textContent = '✔ Game Saved!';
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
            <div style="flex: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word;">
                <div style="font-weight: 600; color: ${borderCol}; text-transform: uppercase; font-size: 0.85rem;">${item.category}</div>
                <div style="font-size: 1rem; margin-top: 4px;">Played: <strong>${item.san}</strong></div>
                <div style="font-size: 0.85rem; color: var(--accent-success); margin-top: 2px;">Best: ${item.bestMove || 'Unknown'}</div>
                ${item.notes ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 6px;">📝 ${item.notes}</div>` : ''}
            </div>
            <button class="delete-vault-btn" style="flex-shrink: 0; margin-left: 10px; padding: 0.5rem;">❌</button>
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

// --- Saved Games View Logic ---
openSavedGamesBtn.addEventListener('click', () => {
    homeView.classList.add('hidden');
    savedGamesView.classList.remove('hidden');
    renderSavedGamesList();
});

function renderSavedGamesList() {
    const savedGames = JSON.parse(localStorage.getItem('blundermate_saved_games') || '[]');
    savedGamesList.innerHTML = '';
    if (savedGames.length === 0) {
        savedGamesList.innerHTML = '<div class="empty-state">No saved games yet. Analyze a game and save it!</div>';
        return;
    }
    
    savedGames.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        const el = document.createElement('div');
        el.className = 'game-item';
        el.style.borderLeft = `4px solid var(--accent-success)`;
        
        el.innerHTML = `
            <div style="flex: 1; min-width: 0; overflow-wrap: break-word; word-break: break-word;">
                <div style="font-weight: 600; font-size: 1rem; color: var(--text-primary);">${item.title}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Saved: ${new Date(item.date).toLocaleDateString()}</div>
                ${item.notes ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 6px;">📝 ${item.notes}</div>` : ''}
            </div>
            <button class="delete-saved-game-btn" style="flex-shrink: 0; margin-left: 10px; padding: 0.5rem; background:none; border:none; font-size:1.2rem; cursor:pointer; color:var(--text-secondary);">❌</button>
        `;
        
        // 삭제 이벤트
        el.querySelector('.delete-saved-game-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm('Delete this saved game?')) {
                const newGames = savedGames.filter(g => g.id !== item.id);
                localStorage.setItem('blundermate_saved_games', JSON.stringify(newGames));
                renderSavedGamesList();
            }
        });
        
        // 분석 창에 불러오기
        el.addEventListener('click', () => {
            savedGamesView.classList.add('hidden');
            pgnInput.value = item.pgn;
            handlePgnReviewStart(); // 저장된 PGN 텍스트를 통해 바로 분석 실행
        });
        
        savedGamesList.appendChild(el);
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
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (cg && !analysisView.classList.contains('hidden')) {
            cg.redrawAll();
        }
        if (practiceCg && !practiceView.classList.contains('hidden')) {
            practiceCg.redrawAll();
        }
    }, 100); // 100ms 디바운스 적용
});

function handleExplorationMove(orig, dest) {
    if (isSimulationMode) {
        isSimulationMode = false;
        isExplorationMode = true;
        explorationChess.load(simulationQueue[simulationIndex].fen);
        explorationEngineLines = [];
        stockfish.stop();
    } else if (!isExplorationMode) {
        isExplorationMode = true;
        returnMainLineBtn.classList.remove('hidden');
        
        let baseFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) baseFen = analysisQueue[currentlyViewedIndex].fen;
        else if (chess.header().FEN) baseFen = chess.header().FEN;
        
        explorationChess.load(baseFen);
        explorationEngineLines = [];
        
        // 메인 기보 분석 중지
        stockfish.stop();
    }
    
    const moveRes = explorationChess.move({ from: orig, to: dest, promotion: 'q' });
    if (!moveRes) {
        cg.set({ fen: explorationChess.fen() });
        return;
    }
    
    const turnColor = explorationChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ 
        fen: explorationChess.fen(),
        turnColor: turnColor,
        movable: { color: turnColor, free: false, dests: getDests(explorationChess) }
    });
    
    explorationEngineLines = [];
    updateTopEvalDisplay('...', 'Exploring');
    engineLinesContainer.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">Analyzing variation...</div>';
    stockfish.analyzeFen(explorationChess.fen(), 10);
}

function exitExplorationMode() {
    isExplorationMode = false;
    isSimulationMode = false;
    returnMainLineBtn.classList.add('hidden');
    explorationEngineLines = [];
    simulationQueue = [];
    
    // 메인 라인 전체 기보 분석이 중단된 상태였다면 재개
    if (isEngineReady && currentAnalysisIndex < analysisQueue.length) {
        processNextInQueue();
    }
}

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
        if (isExplorationMode) {
            const isBlackToMove = explorationChess.turn() === 'b';
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
            const sanPv = convertPvToSan(evalData.pv, explorationChess.fen());
            const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
            explorationEngineLines[lineIndex] = { scoreStr, scoreNum, pv: sanPv, uci: firstUci };
            
            if (explorationEngineLines[0]) {
                renderEngineLines(engineLinesContainer, explorationEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                updateTopEvalDisplay(explorationEngineLines[0].scoreStr, 'Exploring');
            }
            return;
        }

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
        
        if (isExplorationMode) return;
        
        // 기보 분석 판별 로직 호출
        const classification = classifyMove(currentAnalysisIndex);
        analysisQueue[currentAnalysisIndex].classification = classification;
        
        updateUIWithEval(currentAnalysisIndex, currentEval, classification);
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
    let loaded = chess.load_pgn(pgnText);
    
    if (!loaded) {
        // PGN 형식이 아니거나 헤더가 없는 단순 기보일 경우, 순서대로 수를 읽어 복구 시도
        chess = new Chess();
        // "1.e4" 와 같이 점 뒤에 공백 없이 영문자가 오는 경우 공백 추가
        const cleanedText = pgnText.replace(/\.(?=[a-zA-Z])/g, '. ');
        const tokens = cleanedText.replace(/\n/g, ' ').split(/\s+/).filter(t => t);
        let validMoves = 0;
        
        for (const token of tokens) {
            // 수 번호(예: 1, 1., 1...) 및 게임 결과 문자열은 건너뜀
            if (/^\d+\.*$/.test(token)) continue;
            if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) continue;
            
            // 숫자 0으로 입력된 캐슬링(0-0)을 영문자(O-O)로 교정
            let cleanToken = token;
            if (cleanToken === '0-0') cleanToken = 'O-O';
            if (cleanToken === '0-0-0') cleanToken = 'O-O-O';
            
            try {
                const moveRes = chess.move(cleanToken);
                if (moveRes) validMoves++;
                else { validMoves = 0; break; }
            } catch (err) {
                validMoves = 0; break;
            }
        }
        
        if (validMoves > 0) {
            loaded = true;
            // 올바른 기보라면 완성된 정규 PGN 형식으로 텍스트 입력창을 자동으로 변경
            pgnInput.value = chess.pgn();
        }
    }

    if (!loaded) {
        alert('Invalid PGN or move format. Please check your text.');
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

    // Depth 10 for faster analysis during development
    stockfish.analyzeFen(pos.fen, 10);
}

// ==========================================
// 8. UI Rendering
// ==========================================
function updateBoardPosition(index, fen) {
    if (isExplorationMode) {
        exitExplorationMode();
    }

    const validFen = fen === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : fen;
    const tempChess = new Chess(validFen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ 
        fen: fen,
        turnColor: turnColor,
        movable: { color: turnColor, free: false, dests: getDests(tempChess) }
    });
    
    currentlyViewedIndex = index;
    highlightActiveMove(index);
    
    if (geminiExplanation) {
        geminiExplanation.classList.add('hidden');
        geminiExplanation.innerHTML = '';
    }
    
    // 블런더나 실수인 경우, 이전 턴(index - 1)에서 엔진이 추천했던 최선의 수를 파란색 화살표로 표시
    persistentShapes = [];
    if (index > 0 && analysisQueue[index]) {
        const cls = analysisQueue[index].classification;
        if (cls === 'Blunder' || cls === 'Mistake' || cls === 'Missed Win') {
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
        renderEngineLines(engineLinesContainer, analysisQueue[index].engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
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
    
    topEvalDisplay.innerHTML = scoreStr || '-';
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

    // 수에 대한 평가 텍스트 업데이트 (별도 영역)
    const moveClassification = document.getElementById('moveClassification');
    if (moveClassification) {
        if (classification) {
            let color = 'var(--text-secondary)';
            if (classification === 'Blunder') color = 'var(--accent-danger)';
            else if (classification === 'Mistake' || classification === 'Missed Win') color = 'var(--accent-warning)';
            else if (classification === 'Inaccuracy') color = '#fbbf24'; // Amber
            else if (classification === 'Good') color = '#60a5fa'; // Blue
            else if (classification === 'Best') color = 'var(--accent-success)'; // Green
            else if (classification === 'Exploring') color = 'var(--accent-warning)'; // Yellow for exploring
            
            moveClassification.textContent = classification;
            moveClassification.style.color = color;
        } else {
            moveClassification.textContent = '';
        }
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

const pvChess = new Chess(); // 매번 생성하지 않고 재사용하여 메모리 최적화

function convertPvToSan(pv, fen) {
    if (!pv) return '';
    pvChess.load(fen);
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
        
        const moveRes = pvChess.move({ from, to, promotion });
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

    const rawPrevMate = getMate(prevEval.scoreStr);
    const rawCurrMate = getMate(currEval.scoreStr);

    // 수를 둔 플레이어(백/흑) 관점에서의 메이트 (양수면 승리, 음수면 패배)
    const prevMate = rawPrevMate !== null ? (isWhite ? rawPrevMate : -rawPrevMate) : null;
    const currMate = rawCurrMate !== null ? (isWhite ? rawCurrMate : -rawCurrMate) : null;
    
    // 수를 둔 플레이어 관점의 CP (Centipawn)
    const prevCp = (isWhite ? prevEval.scoreNum : -prevEval.scoreNum) * 100;
    const currCp = (isWhite ? currEval.scoreNum : -currEval.scoreNum) * 100;

    // ==========================================
    // Edge Case 2: 체크메이트(Mate) 상황 보정
    // ==========================================
    if (prevMate !== null) {
        if (prevMate > 0) {
            if (currMate !== null && currMate > 0) {
                if (currMate <= prevMate) return 'Best';
                else return 'Good'; // 메이트가 길어졌지만 여전히 이김
            } else if (currMate === null) {
                return 'Missed Win'; // 메이트를 놓침
            } else {
                return 'Blunder'; // 메이트 이기던 상황을 지는 메이트로 역전당함
            }
        } else {
            if (currMate !== null && currMate < 0) {
                if (currMate > prevMate) return 'Blunder'; // 상대 메이트 공격을 더 짧게 허용함 (-1 > -2)
                else return 'Best'; // 최선으로 버팀
            } else {
                return 'Best'; // 상대 메이트 공격 회피 성공
            }
        }
    } else {
        if (currMate !== null && currMate < 0) return 'Blunder'; // 새로 지는 메이트 허용
        if (currMate !== null && currMate > 0) return 'Best'; // 멋진 메이트 발견
    }

    // ==========================================
    // Edge Case 1: Sigmoid 승률(Win%) 변환 보정
    // ==========================================
    // 공식: W(cp) = 1 / (1 + exp(-0.00368208 * cp))
    const wp = (cp) => 1 / (1 + Math.exp(-0.00368208 * cp));
    const prevWp = wp(prevCp);
    const currWp = wp(currCp);
    
    const cpl = prevCp - currCp; // Centipawn 손실 (양수면 손해)
    const wpl = prevWp - currWp; // 승률 손실 (0.0 ~ 1.0 범위)

    // 기준 1: CPL 등급
    let gradeCpl = 0; // Best
    if (cpl >= 300) gradeCpl = 4; // Blunder
    else if (cpl >= 100) gradeCpl = 3; // Mistake
    else if (cpl >= 50) gradeCpl = 2; // Inaccuracy
    else if (cpl >= 10) gradeCpl = 1; // Good

    // 기준 2: WPL 등급
    let gradeWpl = 0;
    if (wpl >= 0.20) gradeWpl = 4; // 20% 이상 승률 하락
    else if (wpl >= 0.10) gradeWpl = 3; // 10% 이상 승률 하락
    else if (wpl >= 0.05) gradeWpl = 2; // 5% 이상 승률 하락
    else if (wpl >= 0.02) gradeWpl = 1; // 2% 이상 승률 하락

    // 보조: 놓친 수 (Missed Win) 체크 - 유일수를 놓쳐 크게 불리해진 경우
    if (prevLines && prevLines.length > 1 && prevLines[1]) {
        const bestScore = (isWhite ? prevLines[0].scoreNum : -prevLines[0].scoreNum) * 100;
        const secondScore = (isWhite ? prevLines[1].scoreNum : -prevLines[1].scoreNum) * 100;
        if (bestScore > 150 && (bestScore - secondScore >= 150) && wpl >= 0.10) {
            return 'Missed Win';
        }
    }

    // 최종 등급: 압도적 유리 상황에서 억울한 Blunder가 나오지 않도록 CPL과 WPL 중 '더 관대한(낮은) 등급'을 최종 채택
    const finalGrade = Math.min(gradeCpl, gradeWpl);

    switch (finalGrade) {
        case 4: return 'Blunder';
        case 3: return 'Mistake';
        case 2: return 'Inaccuracy';
        case 1: return 'Good';
        case 0: return 'Best';
        default: return 'Best';
    }
}

function handleEngineLineClick(lineIndex) {
    let baseFen, lines;
    if (isExplorationMode) {
        baseFen = explorationChess.fen();
        lines = explorationEngineLines;
    } else {
        if (currentlyViewedIndex < 0) return;
        baseFen = analysisQueue[currentlyViewedIndex].fen;
        lines = analysisQueue[currentlyViewedIndex].engineLines;
    }

    if (!lines || !lines[lineIndex]) return;
    
    const pv = lines[lineIndex].pv;
    if (!pv) return;

    const tempChess = new Chess(baseFen);
    simulationQueue = [{ fen: baseFen, san: 'Start' }];
    
    const moves = pv.split(' ');
    for (const move of moves) {
        const moveRes = tempChess.move(move);
        if (moveRes) simulationQueue.push({ fen: tempChess.fen(), san: moveRes.san });
        else break;
    }

    isSimulationMode = true;
    isExplorationMode = false;
    simulationIndex = 1;
    
    stockfish.stop();
    returnMainLineBtn.classList.remove('hidden');
    updateBoardForSimulation(simulationIndex);
}

function updateBoardForSimulation(index) {
    const item = simulationQueue[index];
    const tempChess = new Chess(item.fen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ fen: item.fen, turnColor: turnColor, movable: { color: turnColor, free: false, dests: getDests(tempChess) }, drawable: { autoShapes: [] } });
    updateTopEvalDisplay('-', `Simulating`);
    engineLinesContainer.innerHTML = `<div style="padding: 1rem; color: var(--text-secondary); text-align: center;">Simulating Move ${index} / ${simulationQueue.length - 1} <br><strong style="color: var(--text-primary); font-size: 1.1rem; display: inline-block; margin-top: 0.5rem;">${item.san}</strong></div>`;
}
