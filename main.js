import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { fetchRecentGames } from './chessApi.js';
import { StockfishEngine } from './engine.js';
import { parseEvalData, getDests, convertPvToSan, classifyMove } from './utils.js';
import { renderGamesList, renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderVaultList, renderSavedGamesList } from './ui.js';
import { getVaultItems, addVaultItem, removeVaultItem, getSavedGames, addSavedGame, removeSavedGame } from './storage.js';
import { createGeminiHandler } from './gemini.js';

// ==========================================
// 1. DOM Elements
// ==========================================
// Manual inputs
const pgnInput = document.getElementById('pgnInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const toggleManualBtn = document.getElementById('toggleManualBtn');
const openBoardInputBtn = document.getElementById('openBoardInputBtn');
const manualInputWrapper = document.getElementById('manualInputWrapper');
const manualInputContainer = document.getElementById('manualInputContainer');
const myLibrarySection = document.getElementById('myLibrarySection');
const openVaultBtn = document.getElementById('openVaultBtn');
const openSavedGamesBtn = document.getElementById('openSavedGamesBtn');

// API inputs
const usernameInput = document.getElementById('usernameInput');
const fetchBtn = document.getElementById('fetchBtn');
const gamesList = document.getElementById('gamesList');

// Analysis Board UI
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
const panelTabs = document.getElementById('panelTabs');
const movesOverlay = document.getElementById('movesOverlay');
const movesOverlayBtn = document.getElementById('movesOverlayBtn');
const movesOverlayCloseBtn = document.getElementById('movesOverlayCloseBtn');

// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');

// Board Input Elements
const boardInputModal = document.getElementById('boardInputModal');
const inputBoardContainer = document.getElementById('inputBoardContainer');
const inputBoardPgn = document.getElementById('inputBoardPgn');
const undoInputMoveBtn = document.getElementById('undoInputMoveBtn');
const cancelInputBtn = document.getElementById('cancelInputBtn');
const analyzeInputBtn = document.getElementById('analyzeInputBtn');

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

// FAB & Settings Elements (정적 HTML에서 참조)
const fabToggleMoves = document.getElementById('fabToggleMoves');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const coordsToggle = document.getElementById('coordsToggle');
const geminiToggle = document.getElementById('geminiToggle');

// ==========================================
// 2. Application State
// ==========================================
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
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
let inputChess = new window.Chess(); // 수동 보드 입력용 체스 인스턴스
let inputCg; // 수동 보드 입력용 체스그라운드 인스턴스
let lastEvalRenderTime = 0; // 엔진 UI 렌더링 스로틀링용 타임스탬프
const EVAL_RENDER_THROTTLE = 100; // UI 업데이트 제한 시간(ms)
let isGeminiLoading = false; // Gemini API 중복 호출 방지용 플래그
let geminiAbortController = null; // Gemini API 요청 취소용 컨트롤러
let isCoordsEnabled = localStorage.getItem('coordsEnabled') === 'true'; // 보드 좌표 표시 여부
let isGeminiEnabled = localStorage.getItem('geminiEnabled') === 'true'; // Gemini AI 토글 상태

// ==========================================
// 3. Initialization
// ==========================================
cg = Chessground(boardContainer, {
    fen: 'start',
    animation: { enabled: true, duration: 250 },
    coordinates: isCoordsEnabled,
    drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true
    },
    events: {
        move: (orig, dest) => handleExplorationMove(orig, dest)
    }
});

// (FAB toggle removed — element is hidden and no longer functional)

// ==========================================
// 3-2. Settings UI
// ==========================================
geminiToggle.checked = isGeminiEnabled;
geminiToggle.addEventListener('change', (e) => {
    isGeminiEnabled = e.target.checked;
    localStorage.setItem('geminiEnabled', isGeminiEnabled);
});

coordsToggle.checked = isCoordsEnabled;
coordsToggle.addEventListener('change', (e) => {
    isCoordsEnabled = e.target.checked;
    localStorage.setItem('coordsEnabled', isCoordsEnabled);
    if (cg) cg.set({ coordinates: isCoordsEnabled });
    if (inputCg) inputCg.set({ coordinates: isCoordsEnabled });
    if (practiceCg) practiceCg.set({ coordinates: isCoordsEnabled });
});

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});
document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

// ==========================================
// 4. Event Listeners
// ==========================================
toggleManualBtn.addEventListener('click', () => {
    manualInputWrapper.classList.toggle('hidden');
});

openBoardInputBtn.addEventListener('click', () => {
    boardInputModal.classList.remove('hidden');
    inputChess.reset();
    inputBoardPgn.value = '';
    
    if (!inputCg) {
        inputCg = Chessground(inputBoardContainer, {
            animation: { enabled: true, duration: 250 },
            movable: { free: false },
            coordinates: isCoordsEnabled,
            events: {
                move: (orig, dest) => {
                    inputChess.move({ from: orig, to: dest, promotion: 'q' });
                    updateInputBoard();
                }
            }
        });
    }
    updateInputBoard();
    forceRedraw(inputCg);
});

cancelInputBtn.addEventListener('click', () => {
    boardInputModal.classList.add('hidden');
});

undoInputMoveBtn.addEventListener('click', () => {
    inputChess.undo();
    updateInputBoard();
});

analyzeInputBtn.addEventListener('click', () => {
    if (inputChess.history().length === 0) {
        alert('Please play at least one move to analyze.');
        return;
    }
    // 완성된 PGN을 메인 입력창에 복사하고 분석 실행
    pgnInput.value = inputChess.pgn();
    boardInputModal.classList.add('hidden');
    handlePgnReviewStart();
});

backBtn.addEventListener('click', () => {
    analysisView.classList.add('hidden');
    homeView.classList.remove('hidden');
    
    // Stop engine to save resources when returning to home view
    stockfish.stop();
    isAnalyzing = false;
    isWaitingForStop = false;
    pendingQueue = null;
    analysisQueue = []; // 큐도 초기화하여 백그라운드 엔진 메시지로 인한 충돌 방지
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

function updateInputBoard() {
    const turnColor = inputChess.turn() === 'w' ? 'white' : 'black';
    inputCg.set({
        fen: inputChess.fen(),
        turnColor: turnColor,
        movable: {
            color: turnColor,
            dests: getDests(inputChess)
        }
    });
    inputBoardPgn.value = inputChess.pgn();
    inputBoardPgn.scrollTop = inputBoardPgn.scrollHeight;
}

fetchBtn.addEventListener('click', handleApiFetch);
usernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        handleApiFetch();
    }
});

// 검색창이 비워지면 원래 메뉴들을 다시 보여줍니다.
usernameInput.addEventListener('input', (e) => {
    if (e.target.value.trim() === '') {
        gamesList.innerHTML = '';
        myLibrarySection.classList.remove('hidden');
        manualInputContainer.classList.remove('hidden');
        manualInputWrapper.classList.add('hidden');
    }
});
analyzeBtn.addEventListener('click', () => handlePgnReviewStart());

// --- Move Navigation Helpers ---
function handlePrevMove() {
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
}

function handleNextMove() {
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
}

// Keyboard Navigation
document.addEventListener('keydown', (e) => {
    if (analysisQueue.length === 0) return;
    
    // Ignore keyboard shortcuts if user is typing
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevMove();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextMove();
    } else if (e.key.toLowerCase() === 'f') {
        // 'F' 키를 누르면 보드 시점(White/Black)을 수동으로 뒤집습니다.
        e.preventDefault();
        if (cg) {
            const currentOrientation = cg.state.orientation;
            cg.set({ orientation: currentOrientation === 'white' ? 'black' : 'white' });
        }
        if (practiceCg) {
            const currentOrientation = practiceCg.state.orientation;
            practiceCg.set({ orientation: currentOrientation === 'white' ? 'black' : 'white' });
        }
    }
});

prevMoveBtn.addEventListener('click', handlePrevMove);
nextMoveBtn.addEventListener('click', handleNextMove);

returnMainLineBtn.addEventListener('click', () => {
    exitExplorationMode();
    if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) {
        updateBoardPosition(currentlyViewedIndex, analysisQueue[currentlyViewedIndex].fen);
    } else {
        const startFen = chess.header().FEN || START_FEN;
        updateBoardPosition(-1, startFen);
    }
});

// ==========================================
// 3-3. Panel Tab Navigation
// ==========================================
function switchTab(tabName) {
    document.querySelectorAll('.panel-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

panelTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.panel-tab');
    if (tab && tab.dataset.tab) {
        switchTab(tab.dataset.tab);
        if (tab.dataset.tab === 'ai') renderAiTabContent();
    }
});

function openMovesOverlay() { movesOverlay.classList.add('open'); }
function closeMovesOverlay() { movesOverlay.classList.remove('open'); }

movesOverlayBtn.addEventListener('click', openMovesOverlay);
movesOverlayCloseBtn.addEventListener('click', closeMovesOverlay);
movesOverlay.addEventListener('click', (e) => {
    if (e.target === movesOverlay) closeMovesOverlay();
});

// --- Gemini AI Coach Logic ---
function renderAiTabContent() {
    if (!geminiExplanation) return;
    const move = analysisQueue[currentlyViewedIndex];
    if (move?.cachedExplanation) {
        geminiExplanation.innerHTML = `<div id="geminiText" class="gemini-text-panel">${move.cachedExplanation}</div>`;
    } else {
        geminiExplanation.innerHTML = `<button id="aiAnalyzeBtn" class="ai-analyze-btn">✦ 이 포지션 분석하기</button>`;
    }
}

const handleGeminiExplanation = createGeminiHandler({
    getState: () => ({
        isGeminiLoading,
        geminiAbortController,
        isGeminiEnabled,
        isExplorationMode,
        isSimulationMode,
        currentlyViewedIndex,
        analysisQueue,
    }),
    setState: (patch) => {
        if ('isGeminiLoading' in patch) isGeminiLoading = patch.isGeminiLoading;
        if ('geminiAbortController' in patch) geminiAbortController = patch.geminiAbortController;
    },
    geminiEl: geminiExplanation,
    onOpen: () => switchTab('ai'),
});

geminiExplanation.addEventListener('click', (e) => {
    if (e.target.closest('#aiAnalyzeBtn')) handleGeminiExplanation();
});


// --- UI Helpers ---
function showButtonSuccess(button, text) {
    const originalHTML = button.innerHTML;
    button.innerHTML = text;
    button.style.color = 'var(--accent-success)';
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.color = '';
    }, 1500);
}

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
    const initialMoveFen = chess?.header?.()?.FEN || START_FEN;

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
    
    addVaultItem(vaultItem);
    
    saveModal.classList.add('hidden');
    
    // UX Feedback
    showButtonSuccess(saveMoveBtn, 'Saved!');
});

// --- Save Entire Game Logic ---
choiceSaveGameBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');
    
    // PGN 헤더에서 플레이어 이름 추출 시도
    let defaultTitle = "Saved Game";
    const h = chess?.header?.();
    if (h && h.White && h.Black && h.White !== '?' && h.Black !== '?') {
        defaultTitle = `${h.White} vs ${h.Black}`;
    }

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
    
    addSavedGame(savedGameItem);
    
    saveGameModal.classList.add('hidden');
    
    showButtonSuccess(saveMoveBtn, 'Saved!');
});

// --- My Vault & Practice Logic ---
openVaultBtn.addEventListener('click', () => {
    homeView.classList.add('hidden');
    vaultView.classList.remove('hidden');
    updateVaultView();
});

function updateVaultView() {
    const items = getVaultItems();
    renderVaultList(vaultList, items, (id) => {
        if (confirm('Delete this saved move from your Vault?')) {
            removeVaultItem(id);
            updateVaultView();
        }
    }, startPractice);
}

// --- Saved Games View Logic ---
openSavedGamesBtn.addEventListener('click', () => {
    homeView.classList.add('hidden');
    savedGamesView.classList.remove('hidden');
    updateSavedGamesView();
});

function updateSavedGamesView() {
    const games = getSavedGames();
    renderSavedGamesList(savedGamesList, games, (id) => {
        if (confirm('Delete this saved game?')) {
            removeSavedGame(id);
            updateSavedGamesView();
        }
    }, (pgn) => {
        savedGamesView.classList.add('hidden');
        pgnInput.value = pgn;
        handlePgnReviewStart();
    });
}

function startPractice(item) {
    vaultView.classList.add('hidden');
    practiceView.classList.remove('hidden');
    practiceFeedback.className = 'practice-feedback';
    practiceFeedback.textContent = 'Find Best Move';

    const practiceChess = new Chess(item.prevFen);
    const turnColor = practiceChess.turn() === 'w' ? 'white' : 'black';

    if (!practiceCg) {
        practiceCg = Chessground(practiceBoardContainer, { animation: { enabled: true, duration: 250 }, coordinates: isCoordsEnabled });
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
                    practiceFeedback.className = 'practice-feedback positive';
                    practiceCg.set({ fen: practiceChess.fen(), movable: { color: undefined } }); // Lock board
                } else {
                    const isBlunder = (moveRes.san === item.san);
                    practiceFeedback.textContent = (isBlunder ? 'Blunder played! ' : 'Incorrect: ') + moveRes.san;
                    practiceFeedback.className = 'practice-feedback negative';
                    setTimeout(() => {
                        practiceChess.undo();
                        practiceCg.set({ fen: practiceChess.fen(), turnColor: turnColor });
                        practiceFeedback.textContent = 'Try again';
                        practiceFeedback.className = 'practice-feedback';
                    }, 800);
                }
            }
        }
    });
    forceRedraw(practiceCg);
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
        if (inputCg && !boardInputModal.classList.contains('hidden')) {
            inputCg.redrawAll();
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
        
        let baseFen = START_FEN;
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
    engineLinesContainer.innerHTML = '<div class="container-message">Analyzing variation...</div>';
    
    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = 'Exploring position...';
    stockfish.analyzeFen(explorationChess.fen(), 12);
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
    } else {
        analysisStatus.className = 'tag engine-ready hidden';
        analysisStatus.textContent = '';
    }
}

// ==========================================
// 5. API Logic
// ==========================================
async function handleApiFetch() {
    const username = usernameInput.value.trim();
    if (!username) return;

    fetchBtn.disabled = true;
    gamesList.innerHTML = '<div class="container-message">Loading archives...</div>';

    try {
        gamesList.innerHTML = '<div class="container-message">Fetching latest games...</div>';
        const recentGames = await fetchRecentGames(username);
        renderGamesList(gamesList, recentGames, username, (pgn, isWhiteGame) => {
            pgnInput.value = pgn;
            handlePgnReviewStart(null, isWhiteGame);
        });

        // 검색 성공 시 화면을 넓게 쓰기 위해 다른 메뉴 숨김
        myLibrarySection.classList.add('hidden');
        manualInputContainer.classList.add('hidden');
        manualInputWrapper.classList.add('hidden');

    } catch (e) {
        console.error(e);
        const errEl = document.createElement('div');
        errEl.className = 'container-message container-message--error';
        errEl.textContent = `Failed to fetch games: ${e.message}`;
        gamesList.innerHTML = '';
        gamesList.appendChild(errEl);
    } finally {
        fetchBtn.disabled = false;
    }
}

// ==========================================
// 6. Engine Initialization
// ==========================================
const engineCallbacks = {
    onError: (e) => {
        console.error("Failed to load Stockfish worker:", e);
        const fb = document.getElementById('evalBarFill');
        if (fb) { fb.classList.remove('loading'); fb.style.background = '#C84040'; }
    },
    onUciOk: () => {
        isEngineReady = true;
        const fb = document.getElementById('evalBarFill');
        if (fb) fb.classList.remove('loading');
    },
    onReady: () => {
        if (analysisQueue.length > 0 && !isAnalyzing) {
            processNextInQueue();
        }
    },
    onEval: (evalData) => {
        if (isExplorationMode) {
            const isBlackToMove = explorationChess.turn() === 'b';
            const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove, isUserWhite);
            
            const lineIndex = evalData.multipv - 1;
            const sanPv = convertPvToSan(evalData.pv, explorationChess.fen());
            const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
            explorationEngineLines[lineIndex] = { scoreStr, scoreNum, pv: sanPv, uci: firstUci };
            
            const now = Date.now();
            if (explorationEngineLines[0] && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
                lastEvalRenderTime = now;
                requestAnimationFrame(() => {
                    renderEngineLines(engineLinesContainer, explorationEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                    updateTopEvalDisplay(explorationEngineLines[0].scoreStr, 'Exploring');
                });
            }
            return;
        }

        const isBlackToMove = analysisQueue[currentAnalysisIndex].fen.includes(' b ');
        const currentMove = analysisQueue[currentAnalysisIndex];
        if (!currentMove) return; // 비동기 콜백 안전장치

        const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove, isUserWhite);
        
        const lineIndex = evalData.multipv - 1;
        const sanPv = convertPvToSan(evalData.pv, currentMove.fen);
        const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
        currentMove.engineLines[lineIndex] = { scoreStr, scoreNum, pv: sanPv, uci: firstUci };
        
        // Update Main Evaluation from Top Line (MultiPV 1)
        if (currentMove.engineLines[0]) {
            currentEval = currentMove.engineLines[0].scoreStr;
            // 현재 보고 있는 화면이 엔진이 분석 중인 수와 같을 때만 UI 실시간 스로틀링 업데이트
            const now = Date.now();
            if (currentlyViewedIndex === currentAnalysisIndex && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
                lastEvalRenderTime = now;
                requestAnimationFrame(() => {
                    renderEngineLines(engineLinesContainer, currentMove.engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                    updateTopEvalDisplay(currentEval, currentMove.classification);
                });
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
        
        if (isExplorationMode) {
            analysisStatus.className = 'tag engine-ready hidden';
            analysisStatus.textContent = '';
            return;
        }
        
        if (!analysisQueue || currentAnalysisIndex >= analysisQueue.length) {
            isAnalyzing = false;
            return;
        }

        // 기보 분석 판별 로직 호출
        const classification = classifyMove(currentAnalysisIndex, analysisQueue, isUserWhite);
        analysisQueue[currentAnalysisIndex].classification = classification;
        
        updateUIWithEval(currentAnalysisIndex, currentEval, classification);
        if (currentlyViewedIndex === currentAnalysisIndex) {
            // 스로틀링으로 인해 생략되었을 수 있는 최종 평가 라인을 확실하게 다시 렌더링
            renderEngineLines(engineLinesContainer, analysisQueue[currentAnalysisIndex].engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
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
    let loaded = parseAndLoadPgn(chess, pgnText);

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
    
    // 기물 가치 (Brilliant 희생 감지용)
    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    chess.history({ verbose: true }).forEach((move, index) => {
        tempChess.move(move);

        // ── Brilliant 감지용 희생 여부 사전 계산 ──────────────────────────────
        // Chess.com: 폰 희생은 Brilliant 대상 제외, 기물/교환 희생만 인정
        let isSacrifice = false;
        if (move.piece !== 'p') {
            const movedVal = PIECE_VALUES[move.piece] || 0;

            // Case 1: 더 가치 있는 기물로 덜 가치 있는 기물을 포획 (교환 손실)
            if (move.captured && movedVal > (PIECE_VALUES[move.captured] || 0)) {
                isSacrifice = true;
            }

            // Case 2: 이동한 기물이 상대의 더 싼 기물에게 잡힐 수 있는 칸으로 이동 (기물 희생)
            if (!isSacrifice) {
                try {
                    const opponentMoves = tempChess.moves({ verbose: true });
                    const minAttackerVal = opponentMoves
                        .filter(m => m.to === move.to)
                        .reduce((min, m) => Math.min(min, PIECE_VALUES[m.piece] || 0), Infinity);
                    if (movedVal > minAttackerVal) isSacrifice = true;
                } catch(e) {}
            }
        }
        // ─────────────────────────────────────────────────────────────────────

        newQueue.push({
            fen: tempChess.fen(),
            san: move.san,
            turn: tempChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(index / 2) + 1,
            isWhite: index % 2 === 0,
            engineLines: [],
            isSacrifice,          // Brilliant 감지용
            movedPiece: move.piece, // 폰 희생 제외 판별용
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
    
    // 이전 탐색(Exploration) 및 시뮬레이션 모드 상태 완전 초기화
    isExplorationMode = false;
    isSimulationMode = false;
    returnMainLineBtn.classList.add('hidden');

    // Force Chessground to recalculate board size for mobile
    forceRedraw(cg);

    analysisQueue = newQueue;
    analyzeBtn.disabled = true;
    analysisStatus.className = 'tag engine-loading';

    renderMovesTable(movesBody, analysisQueue, (index) => {
        updateBoardPosition(index, analysisQueue[index].fen);
        closeMovesOverlay();
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
        analysisStatus.textContent = '';
        analysisStatus.className = 'tag hidden';
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
        isAnalyzing = false; // 엔진 준비 콜백(onReady)에서 큐를 정상적으로 재개할 수 있도록 상태 해제 (교착 상태 방지)
        return;
    }

    // 일관된 분석을 위해 엔진 깊이(Depth)를 12로 고정
    stockfish.analyzeFen(pos.fen, 12);
}

// ==========================================
// 8. UI Rendering
// ==========================================
function updateBoardPosition(index, fen) {
    if (isExplorationMode) {
        exitExplorationMode();
    }

    // 다른 수로 이동 시 기존에 진행 중이던 AI 해설이 있다면 즉시 취소하여 리소스 및 서버 연결 확보
    if (geminiAbortController) {
        geminiAbortController.abort();
    }

    const validFen = fen === 'start' ? START_FEN : fen;
    const tempChess = new Chess(validFen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ 
        fen: fen,
        turnColor: turnColor,
        movable: { color: turnColor, free: false, dests: getDests(tempChess) }
    });
    
    currentlyViewedIndex = index;
    highlightActiveMove(index);
    
    // 수 이동 시 엔진 탭으로 복귀하고 AI 패널은 현재 포지션에 맞게 갱신
    renderAiTabContent();
    switchTab('engine');
    
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
                    if (/^[a-h][1-8]$/.test(orig) && /^[a-h][1-8]$/.test(dest)) {
                        persistentShapes.push({ orig, dest, brush: 'blue' });
                    }
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
function forceRedraw(instance) {
    if (!instance) return;
    setTimeout(() => instance.redrawAll(), 50);
}

function parseAndLoadPgn(chessInstance, pgnText) {
    if (chessInstance.load_pgn(pgnText)) return true;

    // PGN 형식이 아니거나 헤더가 없는 단순 기보일 경우, 순서대로 수를 읽어 복구 시도
    chessInstance.reset();
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
            if (chessInstance.move(cleanToken)) validMoves++;
            else break;
        } catch (err) {
            break;
        }
    }
    
    if (validMoves > 0) {
        pgnInput.value = chessInstance.pgn(); // 올바른 기보라면 완성된 정규 PGN 형식으로 텍스트 입력창을 자동으로 변경
        return true;
    }
    return false;
}

function drawEngineArrow(orig, dest) {
    if (!cg) return;
    cg.set({
        drawable: {
            autoShapes: [...persistentShapes, { orig, dest, brush: 'paleGreen' }]
        }
    });
}

function clearEngineArrow() {
    if (!cg) return;
    cg.set({
        drawable: {
            autoShapes: persistentShapes
        }
    });
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
    updateTopEvalDisplay('—', 'Simulating');
    switchTab('engine');

    const movesHtml = simulationQueue.map((m, i) => {
        let state = i < index ? 'done' : i === index ? 'active' : 'upcoming';
        return `<span class="sim-move sim-move--${state}" data-sim-index="${i}">${i === 0 ? 'Start' : m.san}</span>`;
    }).join('');

    engineLinesContainer.innerHTML = `
        <div class="sim-panel">
            <div class="sim-header">
                <span class="sim-label">Engine Line</span>
                <span class="sim-counter">${index} / ${simulationQueue.length - 1}</span>
            </div>
            <div class="sim-moves">${movesHtml}</div>
        </div>
    `;

    engineLinesContainer.querySelectorAll('.sim-move').forEach(el => {
        el.addEventListener('click', () => {
            simulationIndex = parseInt(el.dataset.simIndex, 10);
            updateBoardForSimulation(simulationIndex);
        });
    });
}
