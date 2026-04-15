import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { fetchRecentGames } from './chessApi.js';
import { StockfishEngine } from './engine.js';
import { parseEvalData, getDests, convertPvToSan, classifyMove, parseAndLoadPgn } from './utils.js';
import { renderGamesList, renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderVaultList, renderSavedGamesList } from './ui.js';
import { getVaultItems, addVaultItem, removeVaultItem, getSavedGames, addSavedGame, removeSavedGame } from './storage.js';
import { createGeminiHandler } from './gemini.js';
import { t, setLocale, getLocale } from './strings.js';

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
const tabToggleBtn = document.getElementById('tabToggleBtn');
const geminiExplanation = document.getElementById('geminiExplanation');
const panelTabs = document.getElementById('panelTabs');
const movesOverlay = document.getElementById('movesOverlay');
const movesOverlayBtn = document.getElementById('movesOverlayBtn');
const movesOverlayCloseBtn = document.getElementById('movesOverlayCloseBtn');
const downloadPgnBtn = document.getElementById('downloadPgnBtn');
const inputViewMovesBtn = document.getElementById('inputViewMovesBtn');

// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');

// Board Input Elements
const inputView = document.getElementById('inputView');
const inputViewBackBtn = document.getElementById('inputViewBackBtn');
const inputViewUndoBtn = document.getElementById('inputViewUndoBtn');
const inputViewUndoBtnBottom = document.getElementById('inputViewUndoBtnBottom');
const inputViewAnalyzeBtn = document.getElementById('inputViewAnalyzeBtn');
const inputBoardContainer = document.getElementById('inputBoardContainer');
const inputBoardPgn = document.getElementById('inputBoardPgn');

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

// Home State Elements
const vaultCountBadge = document.getElementById('vaultCountBadge');

// Vault Elements
const vaultView = document.getElementById('vaultView');
const vaultList = document.getElementById('vaultList');
const vaultBackBtn = document.getElementById('vaultBackBtn');
const vaultDetailView = document.getElementById('vaultDetailView');
const vaultDetailBackBtn = document.getElementById('vaultDetailBackBtn');
const vaultDetailTitle = document.getElementById('vaultDetailTitle');
const vaultDetailMovesBtn = document.getElementById('vaultDetailMovesBtn');
const vaultDetailBoard = document.getElementById('vaultDetailBoard');
const vaultDetailPrevBtn = document.getElementById('vaultDetailPrevBtn');
const vaultDetailNextBtn = document.getElementById('vaultDetailNextBtn');
const vaultDetailMoveLabel = document.getElementById('vaultDetailMoveLabel');
const vaultDetailCounter = document.getElementById('vaultDetailCounter');
const vaultInfoCategory = document.getElementById('vaultInfoCategory');
const vaultInfoPlayed = document.getElementById('vaultInfoPlayed');
const vaultInfoBest = document.getElementById('vaultInfoBest');
const vaultInfoNotes = document.getElementById('vaultInfoNotes');

// Saved Games Elements
const savedGamesView = document.getElementById('savedGamesView');
const savedGamesList = document.getElementById('savedGamesList');
const savedGamesBackBtn = document.getElementById('savedGamesBackBtn');

// Color Choice Modal Elements
const colorChoiceModal = document.getElementById('colorChoiceModal');
const chooseWhiteBtn = document.getElementById('chooseWhiteBtn');
const chooseBlackBtn = document.getElementById('chooseBlackBtn');
let pendingAnalysisCallback = null;

// Settings Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const coordsToggle = document.getElementById('coordsToggle');
const geminiToggle = document.getElementById('geminiToggle');

// Feedback Elements
const feedbackBtn = document.getElementById('feedbackBtn');
const feedbackModal = document.getElementById('feedbackModal');
const feedbackInput = document.getElementById('feedbackInput');
const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
const feedbackStatusText = document.getElementById('feedbackStatusText');

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
let pendingTargetIndex = null;
let persistentShapes = []; // 블런더/실수 시 보드에 고정될 화살표를 저장하는 배열
let isUserWhite = true; // 분석 기준이 되는 사용자 색상 (기본: 백)
let currentBestMoveForVault = ''; // 저장 시 함께 보관할 최선의 수
let appMode = 'main'; // 'main', 'explore', 'simulate'
let explorationChess = new Chess();
let explorationEngineLines = [];
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

// ==========================================
// 3-2. Home State Initialization
// ==========================================
function initHomeState() {
    const vaultItems = getVaultItems();
    const count = vaultItems.length;
    if (count > 0) {
        vaultCountBadge.textContent = count;
        vaultCountBadge.classList.remove('hidden');
    } else {
        vaultCountBadge.classList.add('hidden');
    }
}

// ==========================================
// 3-2b. i18n
// ==========================================
function applyLocale() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    // Sync lang button active state
    const locale = getLocale();
    document.getElementById('langKoBtn')?.classList.toggle('active', locale === 'ko');
    document.getElementById('langEnBtn')?.classList.toggle('active', locale === 'en');
}

initHomeState();
applyLocale();

// ==========================================
// 3-3. Settings UI
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
    if (vaultDetailCg) vaultDetailCg.set({ coordinates: isCoordsEnabled });
});

chooseWhiteBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(true); pendingAnalysisCallback = null; }
});
chooseBlackBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(false); pendingAnalysisCallback = null; }
});

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
}

const modalConfigs = [
    { modal: settingsModal, closeBtn: document.getElementById('closeSettingsBtn') },
    { modal: feedbackModal, closeBtn: cancelFeedbackBtn },
    { modal: saveChoiceModal, closeBtn: cancelChoiceBtn, noBg: true },
    { modal: saveModal, closeBtn: cancelSaveBtn, noBg: true },
    { modal: saveGameModal, closeBtn: cancelSaveGameBtn, noBg: true }
];

modalConfigs.forEach(({ modal, closeBtn, noBg }) => {
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (!noBg) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// Feedback Logic
if (feedbackBtn) {
    feedbackBtn.addEventListener('click', () => {
        feedbackInput.value = '';
        feedbackStatusText.textContent = '';
        feedbackModal.classList.remove('hidden');
    });
}
if (submitFeedbackBtn) {
    submitFeedbackBtn.addEventListener('click', async () => {
        const content = feedbackInput.value.trim();
        if (!content) {
            feedbackStatusText.textContent = '내용을 입력해주세요.';
            feedbackStatusText.style.color = 'var(--accent-danger, red)';
            return;
        }

        submitFeedbackBtn.disabled = true;
        submitFeedbackBtn.textContent = '전송 중...';
        feedbackStatusText.textContent = '';

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                feedbackStatusText.textContent = '소중한 피드백 감사합니다!';
                feedbackStatusText.style.color = 'var(--accent-success, green)';
                setTimeout(() => {
                    feedbackModal.classList.add('hidden');
                }, 1500);
            } else {
                let errText = '전송 실패';
                try {
                    const errJson = await res.json();
                    if (errJson.error) errText = errJson.error;
                } catch(e) {}
                feedbackStatusText.textContent = errText;
                feedbackStatusText.style.color = 'var(--accent-danger, red)';
            }
        } catch (error) {
            feedbackStatusText.textContent = '네트워크 오류가 발생했습니다.';
            feedbackStatusText.style.color = 'var(--accent-danger, red)';
        } finally {
            submitFeedbackBtn.disabled = false;
            submitFeedbackBtn.textContent = '전송';
        }
    });
}

document.getElementById('langKoBtn').addEventListener('click', () => {
    setLocale('ko');
    applyLocale();
    if (!analysisView.classList.contains('hidden')) renderAiTabContent();
});
document.getElementById('langEnBtn').addEventListener('click', () => {
    setLocale('en');
    applyLocale();
    if (!analysisView.classList.contains('hidden')) renderAiTabContent();
});

// ==========================================
// 4. Event Listeners
// ==========================================
function openInputView() {
    homeView.classList.add('hidden');
    inputView.classList.remove('hidden');
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
}

toggleManualBtn.addEventListener('click', openInputView);
openBoardInputBtn.addEventListener('click', openInputView);

inputViewBackBtn.addEventListener('click', () => {
    inputView.classList.add('hidden');
    homeView.classList.remove('hidden');
    initHomeState();
});

function doUndoInput() {
    inputChess.undo();
    updateInputBoard();
}
inputViewUndoBtn.addEventListener('click', doUndoInput);
inputViewUndoBtnBottom.addEventListener('click', doUndoInput);

inputBoardPgn.addEventListener('input', () => {
    const text = inputBoardPgn.value.trim();
    if (!text) {
        inputChess.reset();
        if (inputCg) updateInputBoard();
        return;
    }
    const tempChess = new window.Chess();
    const result = parseAndLoadPgn(tempChess, text);
    if (result.success) {
        inputChess = tempChess;
        if (inputCg) {
            const turnColor = inputChess.turn() === 'w' ? 'white' : 'black';
            inputCg.set({
                fen: inputChess.fen(),
                turnColor: turnColor,
                movable: { color: turnColor, dests: getDests(inputChess) }
            });
        }
    }
});

inputViewAnalyzeBtn.addEventListener('click', () => {
    const pgn = inputBoardPgn.value.trim() || inputChess.pgn();
    if (!pgn) {
        alert('Please play at least one move or paste a PGN to analyze.');
        return;
    }
    pgnInput.value = pgn;
    inputView.classList.add('hidden');
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

backBtn.addEventListener('click', () => {
    analysisView.classList.add('hidden');
    homeView.classList.remove('hidden');
    initHomeState();

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
    initHomeState();
});

savedGamesBackBtn.addEventListener('click', () => {
    savedGamesView.classList.add('hidden');
    homeView.classList.remove('hidden');
    initHomeState();
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
analyzeBtn.addEventListener('click', () => {
    if (!pgnInput.value.trim()) return;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

// --- Move Navigation Helpers ---
function handlePrevMove() {
    if (appMode === 'simulate') {
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
    if (appMode === 'simulate') {
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
    // Ignore keyboard shortcuts if user is typing
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

    const inVaultDetail = vaultDetailView && !vaultDetailView.classList.contains('hidden');

    if (!inVaultDetail && analysisQueue.length === 0) return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (inVaultDetail) setVaultDetailIndex(vaultDetailIndex - 1);
        else handlePrevMove();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (inVaultDetail) setVaultDetailIndex(vaultDetailIndex + 1);
        else handleNextMove();
    } else if (e.key.toLowerCase() === 'f') {
        // 'F' 키를 누르면 보드 시점(White/Black)을 수동으로 뒤집습니다.
        e.preventDefault();
        if (inVaultDetail && vaultDetailCg) {
            const o = vaultDetailCg.state.orientation;
            vaultDetailCg.set({ orientation: o === 'white' ? 'black' : 'white' });
        } else if (cg) {
            const currentOrientation = cg.state.orientation;
            cg.set({ orientation: currentOrientation === 'white' ? 'black' : 'white' });
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
let currentTab = 'engine';

function switchTab(tabName) {
    currentTab = tabName;
    if (tabToggleBtn) tabToggleBtn.textContent = tabName === 'engine' ? 'Engine ⇄' : 'AI ⇄';
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

tabToggleBtn.addEventListener('click', () => {
    const next = currentTab === 'engine' ? 'ai' : 'engine';
    switchTab(next);
    if (next === 'ai') renderAiTabContent();
});

// Win% / eval score toggle
document.getElementById('winChanceDisplay').addEventListener('click', () => {
    const el = document.getElementById('winChanceDisplay');
    const current = localStorage.getItem('evalDisplayMode') || 'percent';
    const next = current === 'percent' ? 'score' : 'percent';
    localStorage.setItem('evalDisplayMode', next);
    el.style.opacity = '0';
    setTimeout(() => {
        updateTopEvalDisplay(el.dataset.scoreStr || '', el.dataset.classification || '');
        el.style.opacity = '1';
    }, 150);
});

let _overlayGetPgn = null;

function showMovesOverlay({ getPgn, renderBody } = {}) {
    _overlayGetPgn = getPgn || null;
    if (renderBody) renderBody();
    movesOverlay.classList.add('open');
}
function closeMovesOverlay() {
    movesOverlay.classList.remove('open');
    _overlayGetPgn = null;
}

function buildInputMovesQueue() {
    const history = inputChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

movesOverlayBtn.addEventListener('click', () => showMovesOverlay({
    getPgn: () => chess.pgn(),
    renderBody: () => renderMovesTable(movesBody, analysisQueue, (index) => {
        updateBoardPosition(index, analysisQueue[index].fen);
        closeMovesOverlay();
    }),
}));
inputViewMovesBtn.addEventListener('click', () => showMovesOverlay({
    getPgn: () => inputBoardPgn.value.trim() || inputChess.pgn(),
    renderBody: () => renderMovesTable(movesBody, buildInputMovesQueue(), () => closeMovesOverlay()),
}));
movesOverlayCloseBtn.addEventListener('click', closeMovesOverlay);
movesOverlay.addEventListener('click', (e) => {
    if (e.target === movesOverlay) closeMovesOverlay();
});

downloadPgnBtn.addEventListener('click', () => {
    const pgn = _overlayGetPgn ? _overlayGetPgn() : chess.pgn();
    if (!pgn) return;
    const blob = new Blob([pgn], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blundermate.pgn';
    a.click();
    URL.revokeObjectURL(url);
});

// --- Gemini AI Coach Logic ---
function renderAiTabContent() {
    if (!geminiExplanation) return;
    const move = analysisQueue[currentlyViewedIndex];
    if (move?.cachedExplanation) {
        geminiExplanation.innerHTML = `<div id="geminiText" class="gemini-text-panel">${move.cachedExplanation}</div>`;
    } else {
        geminiExplanation.innerHTML = `<button id="aiAnalyzeBtn" class="ai-analyze-btn">${t('analyzePosition')}</button>`;
    }
}

const handleGeminiExplanation = createGeminiHandler({
    getState: () => ({
        isGeminiLoading,
        geminiAbortController,
        isGeminiEnabled,
        appMode,
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

// removed cancelChoiceBtn event listener

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

// removed cancelSaveBtn event listener

confirmSaveBtn.addEventListener('click', () => {
    const move = analysisQueue[currentlyViewedIndex];
    const initialMoveFen = chess?.header?.()?.FEN || START_FEN;

    let gameTitle = '';
    const h = chess?.header?.();
    if (h && h.White && h.Black && h.White !== '?' && h.Black !== '?') {
        gameTitle = `${h.White} vs ${h.Black}`;
    }

    const vaultItem = {
        id: Date.now(),
        date: new Date().toISOString(),
        pgn: chess.pgn(),
        moveIndex: currentlyViewedIndex,
        gameTitle,
        isUserWhite,
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

// removed cancelSaveGameBtn event listener

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
function openVaultFromHome() {
    homeView.classList.add('hidden');
    vaultView.classList.remove('hidden');
    updateVaultView();
}

openVaultBtn.addEventListener('click', openVaultFromHome);

function updateVaultView() {
    const items = getVaultItems();
    renderVaultList(vaultList, items, (id) => {
        if (confirm('Delete this saved move from your Vault?')) {
            removeVaultItem(id);
            updateVaultView();
        }
    }, openVaultItem);
}

// --- Vault Detail View ---
let vaultDetailCg = null;
let vaultDetailChess = null;
let vaultDetailFens = []; // fens[i] = position AFTER move i; fens[-1] handled via startFen
let vaultDetailSans = []; // san strings per move
let vaultDetailStartFen = START_FEN;
let vaultDetailIndex = -1;
let vaultDetailItem = null;

function openVaultItem(item) {
    if (!item.pgn) {
        alert('This saved move is from an older version and cannot be opened. Please delete it.');
        return;
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, item.pgn);
    if (!result.success) {
        alert('Saved PGN could not be parsed.');
        return;
    }

    vaultDetailItem = item;
    vaultDetailStartFen = tempChess.header().FEN || START_FEN;

    const replay = new Chess();
    if (tempChess.header().FEN) replay.load(tempChess.header().FEN);
    vaultDetailFens = [];
    vaultDetailSans = [];
    tempChess.history({ verbose: true }).forEach(m => {
        const r = replay.move(m);
        vaultDetailFens.push(replay.fen());
        vaultDetailSans.push(r.san);
    });

    vaultDetailChess = new Chess();
    if (!vaultDetailCg) {
        vaultDetailCg = Chessground(vaultDetailBoard, {
            fen: vaultDetailStartFen,
            animation: { enabled: true, duration: 250 },
            coordinates: isCoordsEnabled,
            movable: { free: false, color: undefined },
            draggable: { enabled: false },
        });
    }

    vaultDetailTitle.textContent = item.gameTitle || '복기';
    vaultInfoCategory.textContent = item.category || '';
    vaultInfoPlayed.textContent = (item.moveNumber ? `${item.moveNumber}${item.isWhite ? '. ' : '... '}` : '') + (item.san || '');
    vaultInfoBest.textContent = item.bestMove || 'Unknown';
    vaultInfoNotes.textContent = item.notes || '';

    vaultView.classList.add('hidden');
    vaultDetailView.classList.remove('hidden');

    const targetIdx = (typeof item.moveIndex === 'number' && item.moveIndex >= 0 && item.moveIndex < vaultDetailFens.length)
        ? item.moveIndex
        : vaultDetailFens.length - 1;
    setVaultDetailIndex(targetIdx);
    forceRedraw(vaultDetailCg);
}

function setVaultDetailIndex(index) {
    if (vaultDetailFens.length === 0) return;
    vaultDetailIndex = Math.max(-1, Math.min(vaultDetailFens.length - 1, index));
    const fen = vaultDetailIndex < 0 ? vaultDetailStartFen : vaultDetailFens[vaultDetailIndex];

    vaultDetailChess.load(fen);
    const orientation = vaultDetailItem && (vaultDetailItem.isUserWhite !== undefined ? vaultDetailItem.isUserWhite : vaultDetailItem.isWhite) ? 'white' : 'black';
    vaultDetailCg.set({
        fen,
        orientation,
        turnColor: vaultDetailChess.turn() === 'w' ? 'white' : 'black',
        movable: { free: false, color: undefined },
    });

    if (vaultDetailIndex < 0) {
        vaultDetailMoveLabel.textContent = 'Start';
        vaultDetailCounter.textContent = `0 / ${vaultDetailFens.length}`;
    } else {
        const moveNumber = Math.floor(vaultDetailIndex / 2) + 1;
        const isWhite = vaultDetailIndex % 2 === 0;
        vaultDetailMoveLabel.textContent = `${moveNumber}${isWhite ? '.' : '...'} ${vaultDetailSans[vaultDetailIndex]}`;
        vaultDetailCounter.textContent = `${vaultDetailIndex + 1} / ${vaultDetailFens.length}`;
    }
}

vaultDetailBackBtn.addEventListener('click', () => {
    vaultDetailView.classList.add('hidden');
    vaultView.classList.remove('hidden');
});
vaultDetailPrevBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex - 1));
vaultDetailNextBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex + 1));
vaultDetailMovesBtn.addEventListener('click', () => showMovesOverlay({
    getPgn: () => vaultDetailItem ? vaultDetailItem.pgn : '',
    renderBody: () => {
        const queue = vaultDetailSans.map((san, i) => ({
            san,
            moveNumber: Math.floor(i / 2) + 1,
            isWhite: i % 2 === 0,
        }));
        renderMovesTable(movesBody, queue, (i) => {
            setVaultDetailIndex(i);
            closeMovesOverlay();
        });
    },
}));

// --- Saved Games View Logic ---
function openSavedGamesFromHome() {
    homeView.classList.add('hidden');
    savedGamesView.classList.remove('hidden');
    updateSavedGamesView();
}

openSavedGamesBtn.addEventListener('click', openSavedGamesFromHome);

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

// Redraw board on window resize or device rotation for better responsive behavior
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (cg && !analysisView.classList.contains('hidden')) {
            cg.redrawAll();
        }
        if (inputCg && !inputView.classList.contains('hidden')) {
            inputCg.redrawAll();
        }
        if (vaultDetailCg && !vaultDetailView.classList.contains('hidden')) {
            vaultDetailCg.redrawAll();
        }
    }, 100); // 100ms 디바운스 적용
});

function handleExplorationMove(orig, dest) {
    if (appMode === 'simulate') {
        appMode = 'explore';
        explorationChess.load(simulationQueue[simulationIndex].fen);
        explorationEngineLines = [];
        stockfish.stop();
    } else if (appMode !== 'explore') {
        appMode = 'explore';
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
    appMode = 'main';
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
    },
    onUciOk: () => {
        isEngineReady = true;
    },
    onReady: () => {
        if (analysisQueue.length > 0 && !isAnalyzing) {
            processNextInQueue();
        }
    },
    onEval: (evalData) => {
        if (appMode === 'explore') {
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
                const q = pendingQueue;
                const idx = pendingTargetIndex;
                pendingQueue = null;
                pendingTargetIndex = null;
                startNewAnalysis(q, idx);
            }
            return;
        }
        
        if (appMode === 'explore') {
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
function handlePgnReviewStart(e = null, isWhiteGame = null, targetIndex = null) {
    isUserWhite = isWhiteGame !== null ? isWhiteGame : true;

    const pgnText = pgnInput.value.trim();
    if (!pgnText) return;

    chess = new Chess();
    const result = parseAndLoadPgn(chess, pgnText);

    if (!result.success) {
        alert('Invalid PGN or move format. Please check your text.');
        return;
    }
    
    if (result.pgn) {
        pgnInput.value = result.pgn;
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
        pendingTargetIndex = targetIndex;
        isWaitingForStop = true;
        isAnalyzing = false;
        stockfish.stop();
        return;
    }

    startNewAnalysis(newQueue, targetIndex);
}

function startNewAnalysis(newQueue, targetIndex = null) {
    // Switch to Analysis View
    homeView.classList.add('hidden');
    analysisView.classList.remove('hidden');

    // 이전 탐색(Exploration) 및 시뮬레이션 모드 상태 완전 초기화
    appMode = 'main';
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

        if (targetIndex != null && targetIndex >= 0 && targetIndex < analysisQueue.length) {
            updateBoardPosition(targetIndex, analysisQueue[targetIndex].fen);
        }
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
    if (appMode === 'explore') {
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

// parseAndLoadPgn moved to utils.js

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
    if (appMode === 'explore') {
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

    appMode = 'simulate';
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
