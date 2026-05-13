import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { initHome, refreshHomeCounts, showOnboarding, homeProfileRatings } from './home.js';
import { initDialogs, showAlert, showConfirm, showToast, showOptionSheet } from './dialogs.js';
import {
    initAnalysis, getEngine, getDepth,
    analysisQueue, setQueue,
    isRunning, isAwaitingRestart, scheduleRestart,
    runBatch, stopAndClear,
    buildQueueFromPgn, buildSinglePositionQueue,
} from './analysis.js';
import {
    initBoard, chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes,
    resetMainGame, setCurrentlyViewedIndex, setIsUserWhite,
    pushPersistentShape, clearPersistentShapes, flipOrientation,
} from './board.js';
import {
    APP_MODES,
    appMode, branchChess, branchEngineLines, exploreRedoStack, simulationQueue, simulationIndex, simExtendState, isPreviewMode, isReviewMode,
    setAppMode, setIsPreviewMode, setIsReviewMode, clearBranchEngineLines, setBranchLineAt,
    clearExploreRedoStack, pushExploreRedo, popExploreRedo,
    setSimulationQueue, pushSimulationQueueItem, setSimulationIndex, setSimExtendState,
} from './modes.js';
import { parseEvalData, getDests, convertPvToSan, parseAndLoadPgn, isValidFen, escapeHtml, parseOpeningFromPgn, getTier, TIERS, classifyMove, injectNags, formatTimeControlLabel, formatRelativeDate, getDateStrings } from './utils.js';
import { renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderReviewReport, buildPreviewCardHtml, placePieceBadge } from './ui.js';
import { computePgnHash, upsertAnalyzedGame, loadAnalysisCache, saveAnalysisCache, isCacheCompatible, ANALYSIS_CACHE_VERSION, getIsCoordsEnabled, lsGet, lsSet } from './storage.js';
import { collectAutoBlunders } from './autoBlunders.js';
import { initVault, isVaultDetailActive, isVaultPuzzleActive, getVaultDetailIndex, setVaultDetailIndex, flipVaultBoard, setVaultCoords, redrawVaultBoard, loadVaultData, loadBlunderListData, redrawVaultPuzzleBoard } from './vault.js';
import { initSavedGames, loadSavedGamesData, openSaveGameModal } from './savedGames.js';
import { initInsights, loadInsightsData } from './insights.js';
import { initForum, openForumView, hideForumView, tryActivateFromLocation as tryActivateForum } from './forum.js';
import { initSettings, onSettingsViewEnter, onFeedbackViewEnter } from './settings.js';
import { initImportGames, onImportGamesViewEnter } from './importGames.js';
import {
    initGemini, handleGeminiExplanation, renderAiTabContent,
    abortPendingGemini,
} from './gemini.js';
import { t } from './strings.js';
import { pickQuote, quotesReady } from './quotes.js';

// 다이얼로그 헬퍼 (showToast/showAlert/showConfirm)는 dialogs.js로 이전.
// initDialogs()를 한 번 호출해 모달 close 핸들러를 와이어링.

// ==========================================
// 1. DOM Elements
// ==========================================
// Manual inputs
const pgnInput = document.getElementById('pgnInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const openBoardInputBtn = document.getElementById('homeBoardInputBtn');
const manualInputWrapper = document.getElementById('manualInputWrapper');

// Input View — PGN/FEN 진입 화면 (보드 ↔ textarea 양방향 동기)
const inputView = document.getElementById('inputView');
const inputViewBackBtn = document.getElementById('inputViewBackBtn');
const inputViewMovesBtn = document.getElementById('inputViewMovesBtn');
const inputBoardContainer = document.getElementById('inputBoardContainer');
const inputBoardPgn = document.getElementById('inputBoardPgn');
const inputViewUndoBtnBottom = document.getElementById('inputViewUndoBtnBottom');
const inputViewResetBtn = document.getElementById('inputViewResetBtn');
const inputViewAnalyzeBtn = document.getElementById('inputViewAnalyzeBtn');
const inputPrevMoveBtn = document.getElementById('inputPrevMoveBtn');
const inputNextMoveBtn = document.getElementById('inputNextMoveBtn');
let inputChess = new Chess();
let inputStartFen = null;
let inputViewIndex = 0;
let inputCg = null;
// USERNAME_LOG_DEDUP_KEY / logUsernameToServer / homeRecentLabel은 home.js로 이전.

// Analysis Board UI
const movesBody = document.getElementById('movesBody');
const boardContainer = document.getElementById('boardContainer');
const engineLinesContainer = document.getElementById('engineLines');
const prevMoveBtn = document.getElementById('prevMoveBtn');
const returnMainLineBtn = document.getElementById('returnMainLineBtn');
const saveMoveBtn = document.getElementById('saveMoveBtn');
const nextMoveBtn = document.getElementById('nextMoveBtn');
const analysisBackBtn = document.getElementById('analysisBackBtn');
const tabToggleBtn = document.getElementById('tabToggleBtn');
const geminiExplanation = document.getElementById('geminiExplanation');
const panelTabs = document.getElementById('panelTabs');
const movesOverlay = document.getElementById('movesOverlay');
const movesOverlayBtn = document.getElementById('movesOverlayBtn');
const movesOverlayCloseBtn = document.getElementById('movesOverlayCloseBtn');
const movesOverlayReviewBtn = document.getElementById('movesOverlayReviewBtn');
const copyPgnBtn = document.getElementById('copyPgnBtn');
// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');

// Live Input — analysisBottomBar 안에 실행취소/회전/처음부터 3 버튼 인라인 노출. 저장/AI/이전/다음은 리뷰 화면과 공유.
const analysisBottomBar = document.getElementById('analysisBottomBar');
const liveUndoBtn = document.getElementById('liveUndoBtn');
const liveFlipBtn = document.getElementById('liveFlipBtn');
const liveResetBtn = document.getElementById('liveResetBtn');

const previewStartBtn = document.getElementById('previewStartBtn');
const loadingQuoteText = document.getElementById('loadingQuoteText');
const loadingQuoteAuthor = document.getElementById('loadingQuoteAuthor');
const loadingQuoteWrap = loadingQuoteText ? loadingQuoteText.parentElement : null;
const loadingProgressFill = document.getElementById('loadingProgressFill');
const loadingProgressText = document.getElementById('loadingProgressText');

// Color Choice Modal Elements
const colorChoiceModal = document.getElementById('colorChoiceModal');
const chooseWhiteBtn = document.getElementById('chooseWhiteBtn');
const chooseBlackBtn = document.getElementById('chooseBlackBtn');
let pendingAnalysisCallback = null;

// Tier Info Modal
const tierModal = document.getElementById('tierModal');
const tierList = document.getElementById('tierList');
const closeTierModalBtn = document.getElementById('closeTierModalBtn');

// Settings/About/Feedback are now pages — settings.js handles wiring.
// Only the home top-bar entry point lives here.
const settingsBtn = document.getElementById('homeSettingsBtn');

// ==========================================
// 2. Application State
// ==========================================
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let isAnalysisLoading = false;
const LIVE_INPUT_DEPTH = 12; // 라이브 입력 모드 엔진 depth 락 — 렉 방지용 고정값
let lastEvalRenderTime = 0; // 엔진 UI 렌더링 스로틀링용 타임스탬프
const EVAL_RENDER_THROTTLE = 100; // UI 업데이트 제한 시간(ms)
const SIM_EXTEND_DEPTH = 12;
const ENGINE_DEFAULT_MULTIPV = 3; // engine.js 의 DEFAULT_MULTIPV 와 일치 — extend 후 복원 값.
let isCoordsEnabled = getIsCoordsEnabled();

// ==========================================
// 2-2. History-based Navigation
// ==========================================
const SCREENS = {
    HOME: 'home',
    ANALYSIS: 'analysis',
    VAULT_LIST: 'vault_list',
    VAULT_BLUNDER_LIST: 'vault_blunder_list',
    VAULT_DETAIL: 'vault_detail',
    SAVED_GAMES: 'saved_games',
    INSIGHTS: 'insights',
    SETTINGS: 'settings',
    ABOUT: 'about',
    FEEDBACK: 'feedback',
    IMPORT_GAMES: 'import_games',
    INPUT: 'input',
    FORUM: 'forum',
};

let _currentScreen = SCREENS.HOME;

const vaultViewNav = document.getElementById('vaultView');
const vaultBlunderListViewNav = document.getElementById('vaultBlunderListView');
const vaultDetailViewNav = document.getElementById('vaultDetailView');
const savedGamesViewNav = document.getElementById('savedGamesView');
const insightsViewNav = document.getElementById('insightsView');

// bottom-nav 진입 가능한 루트 탭. 비-HOME 루트 탭에서는 history 스택을 [home, current] 2-deep로
// 유지해 어느 탭에서도 뒤로가기 한 번에 home으로 복귀.
const ROOT_TABS = new Set([SCREENS.HOME, SCREENS.VAULT_LIST, SCREENS.SAVED_GAMES, SCREENS.INSIGHTS]);

// push + render 일원화. 호출자는 navigateTo만 호출하면 history와 화면 갱신이 함께 일어남 —
// renderScreen이 hideAllViews + 해당 view 노출 + syncBottomNav를 모두 처리하므로
// 부분 호출(예: history만 push)로 화면이 일관성을 잃을 일 없음.
function navigateTo(screen, state = {}) {
    const tabSwap = _currentScreen !== SCREENS.HOME
        && ROOT_TABS.has(_currentScreen)
        && ROOT_TABS.has(screen);
    if (tabSwap && screen === SCREENS.HOME) {
        // popstate가 renderScreen(HOME) 호출 — 여기서 render 호출하면 중복.
        history.back();
        return;
    }
    if (tabSwap) {
        history.replaceState({ screen, ...state }, '', `#${screen}`);
        renderScreen(screen);
        return;
    }
    history.pushState({ screen, ...state }, '', `#${screen}`);
    renderScreen(screen);
}

function hideAllViews() {
    homeView.classList.add('hidden');
    analysisView.classList.add('hidden');
    analysisView.classList.remove('view-review');
    vaultViewNav.classList.add('hidden');
    if (vaultBlunderListViewNav) vaultBlunderListViewNav.classList.add('hidden');
    vaultDetailViewNav.classList.add('hidden');
    savedGamesViewNav.classList.add('hidden');
    if (insightsViewNav) insightsViewNav.classList.add('hidden');
    document.getElementById('settingsView')?.classList.add('hidden');
    document.getElementById('aboutView')?.classList.add('hidden');
    document.getElementById('feedbackView')?.classList.add('hidden');
    document.getElementById('importGamesView')?.classList.add('hidden');
    inputView?.classList.add('hidden');
    hideForumView();
    // onboardingView 가리기 — 임의 화면(특히 /forum deep-link) 진입 시 first-time 사용자의
    // 온보딩 카드가 위에 떠있는 중첩 회피. initHome이 노출하는 home 분기는 renderScreen이
    // 아니라 syncBottomNav만 호출하므로 영향 없음.
    document.getElementById('onboardingView')?.classList.add('hidden');
}

// 단일 엔진(stockfish)을 쓰는 모드들 — 분석 화면이 보드 자유 입력으로 동작.
// SIMULATE는 엔진 PV를 따라가는 별개 모드라 제외.
function isBranchMode() {
    return appMode === APP_MODES.EXPLORE || appMode === APP_MODES.LIVE_INPUT;
}

function cleanupAnalysis() {
    if (isPreviewMode) {
        setIsPreviewMode(false);
        removePreviewControls();
    }
    if (isReviewMode) {
        setIsReviewMode(false);
        applyReviewView();
    }
    if (appMode === APP_MODES.LIVE_INPUT) {
        liveUndoBtn?.classList.add('hidden');
        liveFlipBtn?.classList.add('hidden');
        liveResetBtn?.classList.add('hidden');
        getEngine().stop();
    }
    if (isAnalysisLoading) exitAnalysisLoading();
    stopAndClear();
    // 분석 중 화면을 떠난 경우 onComplete가 fire되지 않으므로 버튼 상태를 직접 복구.
    analyzeBtn.disabled = false;
}

function renderScreen(screen) {
    if (_currentScreen === SCREENS.ANALYSIS && screen !== SCREENS.ANALYSIS) {
        cleanupAnalysis();
    }
    _currentScreen = screen;
    hideAllViews();
    switch (screen) {
        case SCREENS.HOME:
            homeView.classList.remove('hidden');
            refreshHomeCounts();
            break;
        case SCREENS.ANALYSIS:
            analysisView.classList.remove('hidden');
            break;
        case SCREENS.VAULT_LIST:
            vaultViewNav.classList.remove('hidden');
            loadVaultData();
            break;
        case SCREENS.VAULT_BLUNDER_LIST:
            if (vaultBlunderListViewNav) vaultBlunderListViewNav.classList.remove('hidden');
            loadBlunderListData();
            break;
        case SCREENS.VAULT_DETAIL:
            vaultDetailViewNav.classList.remove('hidden');
            break;
        case SCREENS.SAVED_GAMES:
            savedGamesViewNav.classList.remove('hidden');
            loadSavedGamesData();
            break;
        case SCREENS.INSIGHTS:
            if (insightsViewNav) insightsViewNav.classList.remove('hidden');
            loadInsightsData();
            break;
        case SCREENS.SETTINGS:
            document.getElementById('settingsView')?.classList.remove('hidden');
            onSettingsViewEnter();
            break;
        case SCREENS.ABOUT:
            document.getElementById('aboutView')?.classList.remove('hidden');
            break;
        case SCREENS.FEEDBACK:
            document.getElementById('feedbackView')?.classList.remove('hidden');
            onFeedbackViewEnter();
            break;
        case SCREENS.IMPORT_GAMES:
            document.getElementById('importGamesView')?.classList.remove('hidden');
            onImportGamesViewEnter();
            break;
        case SCREENS.INPUT:
            inputView?.classList.remove('hidden');
            onInputViewEnter();
            break;
        case SCREENS.FORUM:
            openForumView({ openingKey: history.state?.openingKey });
            break;
        default:
            homeView.classList.remove('hidden');
            break;
    }
    syncBottomNav(screen);
}

const bottomNav = document.getElementById('bottomNav');
const navHomeBtn = document.getElementById('navHomeBtn');
const navVaultBtn = document.getElementById('navVaultBtn');
const navSavedBtn = document.getElementById('navSavedBtn');
const navInsightsBtn = document.getElementById('navInsightsBtn');
const navAnalysisBtn = document.getElementById('navAnalysisBtn');
// VAULT_BLUNDER_LIST는 vault drill-in이지만 bottom-nav는 그대로 노출 — 탭 컨텍스트 유지용.
const NAV_VISIBLE_SCREENS = new Set([...ROOT_TABS, SCREENS.VAULT_BLUNDER_LIST]);
const appContainer = document.querySelector('.app-container');

function syncBottomNav(screen) {
    const visible = NAV_VISIBLE_SCREENS.has(screen);
    bottomNav.classList.toggle('hidden', !visible);
    appContainer.classList.toggle('bottom-nav-hidden', !visible);
    navHomeBtn.classList.toggle('active', screen === SCREENS.HOME);
    navVaultBtn.classList.toggle('active', screen === SCREENS.VAULT_LIST || screen === SCREENS.VAULT_BLUNDER_LIST);
    navSavedBtn.classList.toggle('active', screen === SCREENS.SAVED_GAMES);
    if (navInsightsBtn) navInsightsBtn.classList.toggle('active', screen === SCREENS.INSIGHTS);
}

navHomeBtn.addEventListener('click', () => {
    if (_currentScreen === SCREENS.HOME) return;
    navigateTo(SCREENS.HOME);
});
navVaultBtn.addEventListener('click', () => {
    if (_currentScreen === SCREENS.VAULT_LIST) return;
    navigateTo(SCREENS.VAULT_LIST);
});
navSavedBtn.addEventListener('click', () => {
    if (_currentScreen === SCREENS.SAVED_GAMES) return;
    navigateTo(SCREENS.SAVED_GAMES);
});
if (navInsightsBtn) {
    navInsightsBtn.addEventListener('click', () => {
        if (_currentScreen === SCREENS.INSIGHTS) return;
        navigateTo(SCREENS.INSIGHTS);
    });
}
if (navAnalysisBtn) {
    navAnalysisBtn.addEventListener('click', () => {
        if (_currentScreen === SCREENS.ANALYSIS && appMode === APP_MODES.LIVE_INPUT) return;
        openLiveInput();
    });
}

window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state && state.screen) {
        renderScreen(state.screen);
    } else {
        renderScreen(SCREENS.HOME);
    }
});

// deep-link 라우팅 — forum.js가 path 인식 + state 박기까지 자체 처리, 매칭 안 되면 home 디폴트.
if (!tryActivateForum(renderScreen)) {
    history.replaceState({ screen: SCREENS.HOME }, '', '#home');
    syncBottomNav(SCREENS.HOME);
}

// ==========================================
// 3. Initialization
// ==========================================
initBoard(boardContainer, {
    fen: 'start',
    animation: { enabled: true, duration: 250 },
    coordinates: isCoordsEnabled,
    drawable: {
        enabled: true,
        visible: true,
        eraseOnClick: true
    },
    events: {
        move: (orig, dest) => handleBranchMove(orig, dest)
    }
});

// ==========================================
// 3-2. Home State Initialization
// ==========================================
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
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
}

// 홈/온보딩 — home.js로 이전. handlePgnReviewStart는 hoisted function declaration이라 안전.
initHome({ syncBottomNav, SCREENS, handlePgnReviewStart });
initDialogs();

applyLocale();

// ==========================================
// 3-2c. Vault Module Init (deferred — depends on overlay helpers defined later)
// ==========================================
// initVault() is called after showMovesOverlay/closeMovesOverlay are defined (see below)

// ==========================================
// 3-3. Settings entry point + color choice modal
// ==========================================
// 설정/About/피드백은 settings.js가 페이지로 관리. 홈 ⚙ 클릭 → SETTINGS 페이지.
settingsBtn.addEventListener('click', () => navigateTo(SCREENS.SETTINGS));

initSettings({
    navigateTo,
    SCREENS,
    applyLocale,
    renderAiTabContentIfActive: () => {
        if (!analysisView.classList.contains('hidden')) renderAiTabContent();
    },
    applyCoords: (enabled) => {
        if (cg) cg.set({ coordinates: enabled });
        setVaultCoords(enabled);
    },
    showOnboarding,
});

chooseWhiteBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(true); pendingAnalysisCallback = null; }
});
chooseBlackBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(false); pendingAnalysisCallback = null; }
});

function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
}

// 티어 모달: TIERS를 순회하며 각 행의 범위를 동적으로 계산. 현재 rapid 레이팅이 속한 행은 강조.
function populateTierList(currentRapid) {
    if (!tierList) return;
    const rapid = Number(currentRapid);
    const userTier = getTier(rapid);
    const html = TIERS.map((tier, i) => {
        const next = TIERS[i + 1];
        const range = next
            ? t('tier_range_closed').replace('{min}', tier.min).replace('{max}', next.min - 1)
            : t('tier_range_open').replace('{min}', tier.min);
        const isCurrent = userTier && userTier.key === tier.key;
        const emperorCls = tier.key === 'emperor' ? ' tier-row--emperor' : '';
        const currentCls = isCurrent ? ' is-current' : '';
        return `
            <li class="tier-row${emperorCls}${currentCls}">
                <span class="tier-row-glyph">${tier.glyph}</span>
                <span class="tier-row-name">${escapeHtml(t('tier_' + tier.key))}</span>
                <span class="tier-row-range">${range}</span>
            </li>`;
    }).join('');
    tierList.innerHTML = html;
}

const profileTierBtn = document.getElementById('profileTier');
if (profileTierBtn && tierModal) {
    profileTierBtn.addEventListener('click', () => {
        const rapid = homeProfileRatings ? homeProfileRatings.rapid : null;
        populateTierList(rapid);
        tierModal.classList.remove('hidden');
    });
}

const modalConfigs = [
    { modal: tierModal, closeBtn: closeTierModalBtn },
];

modalConfigs.forEach(({ modal, closeBtn, noBg }) => {
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (!noBg) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// ==========================================
// 4. Event Listeners
// ==========================================
// 단일 엔진을 새 fen 위에서 재시작 + UI 표지 초기화. LIVE_INPUT hot path.
// stop() 먼저 — 직전 검색이 진행 중이라도 새 검색이 깔끔히 시작되게.
// depth는 LIVE_INPUT에서 12로 락(렉 방지), 그 외 호출자(simulate extend 등)는 사용자 설정 depth.
function kickBranchEngine(fen) {
    getEngine().stop();
    clearBranchEngineLines();
    updateTopEvalDisplay('...', '', isUserWhite);
    engineLinesContainer.innerHTML = `<div class="container-message">${t('analysis_thinking')}</div>`;
    const depth = appMode === APP_MODES.LIVE_INPUT ? LIVE_INPUT_DEPTH : getDepth();
    getEngine().analyzeFen(fen, depth);
}

function clearSimExtend() {
    if (!simExtendState) return;
    setSimExtendState(null);
    getEngine().stop();
    getEngine().setMultiPV(ENGINE_DEFAULT_MULTIPV);
}

function finalizeSimExtend() {
    const state = simExtendState;
    clearSimExtend();
    if (!state || !state.latestEval || !state.latestEval.pv) return;

    const firstUci = state.latestEval.pv.split(' ')[0];
    if (!firstUci || firstUci.length < 4) return;

    const tmp = new Chess(state.fen);
    const moveRes = tmp.move({
        from: firstUci.slice(0, 2),
        to: firstUci.slice(2, 4),
        promotion: firstUci[4] || undefined,
    });
    if (!moveRes) return;

    const { scoreStr } = parseEvalData(state.latestEval, state.fen.includes(' b '));
    pushSimulationQueueItem({ fen: tmp.fen(), san: moveRes.san, scoreStr });
    setSimulationIndex(simulationQueue.length - 1);
    updateBoardForSimulation(simulationIndex);
}

function openLiveInput() {
    navigateTo(SCREENS.ANALYSIS);

    setQueue([]);
    resetMainGame();
    setCurrentlyViewedIndex(-1);
    setIsUserWhite(true);
    setIsReviewMode(false);
    analysisView.classList.remove('view-review');
    setIsPreviewMode(false);
    clearPersistentShapes();

    setAppMode(APP_MODES.LIVE_INPUT);
    branchChess.load(START_FEN);

    cg.set({
        fen: START_FEN,
        orientation: 'white',
        turnColor: 'white',
        lastMove: [],
        movable: { color: 'white', free: false, dests: getDests(branchChess) },
        drawable: { autoShapes: [] }
    });
    forceRedraw(cg);

    syncBottomBar();
    kickBranchEngine(START_FEN);
}

// EXPLORE / LIVE_INPUT 보드를 branchChess의 현 상태로 동기.
function syncBranchBoard() {
    const turnColor = branchChess.turn() === 'w' ? 'white' : 'black';
    const hist = branchChess.history({ verbose: true });
    const lastMove = hist.length > 0 ? [hist[hist.length - 1].from, hist[hist.length - 1].to] : [];
    cg.set({
        fen: branchChess.fen(),
        turnColor,
        lastMove,
        movable: { color: turnColor, free: false, dests: getDests(branchChess) },
        drawable: { autoShapes: [] }
    });
}

// 라이브 상태를 idx 위치로 통일 (branchChess replay + 보드 갱신 + 엔진 라인 캐시 또는 재시작).
// idx=-1=시작, 0..N-1=각 수 직후. navigate/undo/reset 공통 로직.
function syncLiveStateToIndex(idx) {
    setCurrentlyViewedIndex(idx);
    branchChess.reset();
    for (let i = 0; i <= idx; i++) {
        const m = analysisQueue[i];
        branchChess.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
    syncBranchBoard();
    showPieceBadge(idx);

    const cached = idx >= 0 ? analysisQueue[idx]?.engineLines : null;
    if (cached && cached[0]) {
        // 캐시된 라인 재사용 — 엔진 재시작 없이 즉시 표시.
        getEngine().stop();
        clearBranchEngineLines();
        for (let i = 0; i < cached.length; i++) setBranchLineAt(i, cached[i]);
        renderEngineLines(engineLinesContainer, cached.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
        const cls = analysisQueue[idx].classification || '';
        updateTopEvalDisplay(cached[0].scoreStr, cls, isUserWhite);
    } else {
        // 캐시 없음 (시작 포지션 또는 분석 미완료) → 엔진 재시작.
        kickBranchEngine(branchChess.fen());
    }
}

// prev/next nav — viewedIndex만 ±1, queue 보존.
function liveInputNavigate(delta) {
    const newIdx = Math.max(-1, Math.min(analysisQueue.length - 1, currentlyViewedIndex + delta));
    if (newIdx === currentlyViewedIndex) return;
    syncLiveStateToIndex(newIdx);
}

// Undo — 마지막 수 pop, 새 tail로 이동.
function liveInputUndo() {
    if (analysisQueue.length === 0) return;
    analysisQueue.pop();
    syncLiveStateToIndex(analysisQueue.length - 1);
}

// Reset — 모든 수 제거, 시작 포지션 복귀.
function liveInputReset() {
    setQueue([]);
    clearPersistentShapes();
    syncLiveStateToIndex(-1);
}

openBoardInputBtn.addEventListener('click', async () => {
    const choice = await showOptionSheet({
        title: t('load_game_title'),
        options: [
            { value: 'paste', label: t('load_game_paste') },
            { value: 'search', label: t('load_game_search') },
        ],
    });
    if (choice === 'paste') {
        navigateTo(SCREENS.INPUT);
    } else if (choice === 'search') {
        navigateTo(SCREENS.IMPORT_GAMES);
    }
});

// 하단 바 가시성은 appMode에서 단일 도출 — setAppMode 직후 syncBottomBar() 호출이 invariant.
//   LIVE_INPUT       → 실행취소·회전·처음부터 노출 / AI 노출 / 메인복귀 숨김
//   EXPLORE/SIMULATE → 메인복귀 노출 / AI 숨김 / 라이브 3-btn 숨김
//   MAIN(review)     → AI 노출 / 라이브 3-btn·메인복귀 숨김
// 좌측 그룹은 [저장·AI·메인복귀·실행취소·회전·처음부터], 우측은 [이전·다음]. 우측은 모드 무관 항상 노출.
function syncBottomBar() {
    const isLive = appMode === APP_MODES.LIVE_INPUT;
    const isBranch = appMode === APP_MODES.EXPLORE || appMode === APP_MODES.SIMULATE;
    liveUndoBtn?.classList.toggle('hidden', !isLive);
    liveFlipBtn?.classList.toggle('hidden', !isLive);
    liveResetBtn?.classList.toggle('hidden', !isLive);
    returnMainLineBtn.classList.toggle('hidden', !isBranch);
    tabToggleBtn.classList.toggle('hidden', isBranch);
}

liveUndoBtn?.addEventListener('click', () => liveInputUndo());
liveFlipBtn?.addEventListener('click', () => flipOrientation(cg));
liveResetBtn?.addEventListener('click', () => liveInputReset());

// =====================================================
// Input View — PGN/FEN 진입 화면.
// 보드 ↔ textarea 양방향 동기, 분석 시작은 풀 리뷰 분석으로 진입.
// =====================================================

// 현재 inputViewIndex까지 replay한 체스 인스턴스 — 보드/dests 산출용.
function getInputViewChess() {
    const c = new Chess();
    if (inputStartFen) c.load(inputStartFen);
    const hist = inputChess.history({ verbose: true });
    const limit = Math.min(inputViewIndex, hist.length);
    for (let i = 0; i < limit; i++) {
        c.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    return c;
}

// 보드에서 사용자가 수를 두면 호출. 끝이 아닌 중간에서 두면 그 지점까지 truncate + fork.
function handleInputBoardMove(orig, dest) {
    const hist = inputChess.history({ verbose: true });
    if (inputViewIndex < hist.length) {
        const newChess = new Chess();
        if (inputStartFen) newChess.load(inputStartFen);
        for (let i = 0; i < inputViewIndex; i++) {
            newChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
        }
        const result = newChess.move({ from: orig, to: dest, promotion: 'q' });
        if (!result) return;
        inputChess = newChess;
    } else {
        const result = inputChess.move({ from: orig, to: dest, promotion: 'q' });
        if (!result) return;
    }
    inputViewIndex++;
    updateInputBoard();
}

function handleInputPrev() {
    if (inputViewIndex <= 0) return;
    inputViewIndex--;
    updateInputBoard();
}

function handleInputNext() {
    if (inputViewIndex >= inputChess.history().length) return;
    inputViewIndex++;
    updateInputBoard();
}

function updateInputNavButtons() {
    const historyLen = inputChess.history().length;
    inputPrevMoveBtn.disabled = inputViewIndex === 0;
    inputNextMoveBtn.disabled = inputViewIndex >= historyLen;
    inputViewUndoBtnBottom.disabled = inputViewIndex === 0;
}

// 보드는 inputViewIndex까지만 replay한 상태로, dests도 그 포지션 기준.
// textarea는 항상 inputChess 전체 PGN.
function updateInputBoard() {
    if (!inputCg) return;
    const viewChess = getInputViewChess();
    const turnColor = viewChess.turn() === 'w' ? 'white' : 'black';

    let lastMove = [];
    if (inputViewIndex > 0) {
        const hist = inputChess.history({ verbose: true });
        const m = hist[inputViewIndex - 1];
        if (m) lastMove = [m.from, m.to];
    }

    inputCg.set({
        fen: viewChess.fen(),
        turnColor,
        lastMove,
        movable: { color: turnColor, free: false, dests: getDests(viewChess) },
        drawable: { autoShapes: [] }
    });
    inputBoardPgn.value = inputChess.pgn();
    inputBoardPgn.scrollTop = inputBoardPgn.scrollHeight;
    updateInputNavButtons();
}

// Undo: 현재 보고 있는 수 + 이후 전부 truncate.
function doUndoInput() {
    if (inputViewIndex === 0) return;
    const hist = inputChess.history({ verbose: true });
    const newChess = new Chess();
    if (inputStartFen) newChess.load(inputStartFen);
    for (let i = 0; i < inputViewIndex - 1; i++) {
        newChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    inputChess = newChess;
    inputViewIndex--;
    updateInputBoard();
}

function buildInputMovesQueue() {
    const history = inputChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

// 진입 시 매번 — 상태 reset + Chessground lazy-init. 화면 노출은 renderScreen이 담당.
function onInputViewEnter() {
    inputChess = new Chess();
    inputStartFen = null;
    inputViewIndex = 0;
    inputBoardPgn.value = '';

    if (!inputCg) {
        inputCg = Chessground(inputBoardContainer, {
            animation: { enabled: true, duration: 250 },
            movable: { free: false },
            coordinates: getIsCoordsEnabled(),
            events: { move: handleInputBoardMove },
        });
    }
    updateInputBoard();
    forceRedraw(inputCg);
}

inputViewBackBtn?.addEventListener('click', () => history.back());
inputViewUndoBtnBottom?.addEventListener('click', doUndoInput);
inputViewResetBtn?.addEventListener('click', () => {
    inputChess = new Chess();
    inputStartFen = null;
    inputViewIndex = 0;
    inputBoardPgn.value = '';
    updateInputBoard();
});
inputPrevMoveBtn?.addEventListener('click', handleInputPrev);
inputNextMoveBtn?.addEventListener('click', handleInputNext);

inputBoardPgn?.addEventListener('input', () => {
    const text = inputBoardPgn.value.trim();
    if (!text) {
        inputChess = new Chess();
        inputStartFen = null;
        inputViewIndex = 0;
        if (inputCg) updateInputBoard();
        return;
    }
    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, text);
    if (result.success) {
        inputChess = tempChess;
        inputStartFen = null;
        inputViewIndex = inputChess.history().length;
        if (inputCg) updateInputBoard();
        return;
    }
    // PGN 파싱 실패 → FEN 시도. 보드만 갱신, 수 0.
    if (isValidFen(text)) {
        const fenChess = new Chess();
        fenChess.load(text);
        inputChess = fenChess;
        inputStartFen = text;
        inputViewIndex = 0;
        if (inputCg) updateInputBoard();
    }
});

inputViewAnalyzeBtn?.addEventListener('click', () => {
    const text = inputBoardPgn.value.trim();
    // FEN 단독이면 단일 포지션 분석 분기.
    if (text && isValidFen(text)) {
        pendingAnalysisCallback = (isWhite) => handleFenReviewStart(text, isWhite);
        colorChoiceModal.classList.remove('hidden');
        return;
    }
    const pgn = text || inputChess.pgn();
    if (!pgn) {
        showAlert(t('analysis_no_moves'));
        return;
    }
    pgnInput.value = pgn;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

inputViewMovesBtn?.addEventListener('click', () => showMovesOverlay({
    getPgn: () => inputBoardPgn.value.trim() || inputChess.pgn(),
    renderBody: () => renderMovesTable(movesBody, buildInputMovesQueue(), () => closeMovesOverlay()),
}));


analyzeBtn.addEventListener('click', () => {
    if (!pgnInput.value.trim()) return;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

// --- Move Navigation Helpers ---
function handlePrevMove() {
    if (appMode === APP_MODES.SIMULATE) {
        clearSimExtend();
        setSimulationIndex(Math.max(0, simulationIndex - 1));
        updateBoardForSimulation(simulationIndex);
        return;
    }
    // 라이브 입력 모드: prev = 직전 수 위치로 navigate (history 보존).
    // 중간에서 다른 수를 두면 그 시점에서 fork(handleBranchMove의 truncate 분기).
    if (appMode === APP_MODES.LIVE_INPUT) {
        liveInputNavigate(-1);
        return;
    }
    if (appMode === APP_MODES.EXPLORE) {
        // < = 변형 한 수 undo (redo 스택에 보관). 메인라인 복귀는 returnMainLineBtn 전담.
        if (branchChess.history().length > 0) {
            pushExploreRedo(branchChess.undo());
            syncBranchBoard();
            kickBranchEngine(branchChess.fen());
            return;
        }
        // 변형 소진(=deviation 지점) → 메인라인으로 빠지면서 한 칸 더 뒤로.
        exitBranchMode();
        const newIndex = Math.max(-1, currentlyViewedIndex - 1);
        const fen = newIndex === -1 ? (chess.header().FEN || START_FEN) : analysisQueue[newIndex].fen;
        updateBoardPosition(newIndex, fen);
        return;
    }
    if (analysisQueue.length === 0) return;

    // 0수(시작 포지션, index === -1)에서 prev 한 번 더 → 리뷰 화면 진입.
    // 보드 위치는 그대로 두고 리뷰 모드만 켠다 (← 화살표 / 중간바 prev 버튼 / 키보드 ← 모두 동일).
    if (currentlyViewedIndex === -1 && !isReviewMode && canShowReview()) {
        setIsReviewMode(true);
        applyReviewView();
        return;
    }

    const newIndex = Math.max(-1, currentlyViewedIndex - 1);
    if (newIndex !== currentlyViewedIndex) {
        const fen = newIndex === -1
            ? (chess.header().FEN || START_FEN)
            : analysisQueue[newIndex].fen;
        updateBoardPosition(newIndex, fen);
    }
}

function handleNextMove() {
    if (appMode === APP_MODES.SIMULATE) {
        if (simulationIndex >= simulationQueue.length - 1) {
            if (simExtendState) return; // 이미 분석 중. 무시.
            const lastFen = simulationQueue[simulationIndex].fen;
            const tmp = new Chess(lastFen);
            if (tmp.isGameOver()) return; // 메이트/스테일메이트 → 더 진행 불가.
            setSimExtendState({ fen: lastFen, latestEval: null });
            getEngine().stop();
            getEngine().setMultiPV(1);
            getEngine().analyzeFen(lastFen, SIM_EXTEND_DEPTH);
            return;
        }
        setSimulationIndex(simulationIndex + 1);
        updateBoardForSimulation(simulationIndex);
        return;
    }
    // 라이브 입력 모드: next = 다음 수 위치로 navigate (history 끝까지).
    if (appMode === APP_MODES.LIVE_INPUT) {
        liveInputNavigate(1);
        return;
    }
    if (appMode === APP_MODES.EXPLORE) {
        // > = 따라가본 변형 수 redo. 끝나면 no-op — 메인라인 진행은 returnMainLineBtn 이후 처리.
        if (exploreRedoStack.length > 0) {
            const m = popExploreRedo();
            const res = branchChess.move({ from: m.from, to: m.to, promotion: m.promotion });
            if (res) {
                syncBranchBoard();
                kickBranchEngine(branchChess.fen());
            }
        }
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

    // 보기 모드(puzzle)는 vault.js가 자체 핸들러로 처리 — 여기선 스킵
    if (isVaultPuzzleActive()) return;

    const inVaultDetail = isVaultDetailActive();

    if (!inVaultDetail && analysisQueue.length === 0) return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (inVaultDetail) setVaultDetailIndex(getVaultDetailIndex() - 1);
        else handlePrevMove();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (inVaultDetail) setVaultDetailIndex(getVaultDetailIndex() + 1);
        else handleNextMove();
    } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (inVaultDetail) flipVaultBoard();
        else flipOrientation(cg);
    }
});

prevMoveBtn.addEventListener('click', handlePrevMove);
nextMoveBtn.addEventListener('click', handleNextMove);

// ==========================================
// 3-3. Panel Tab Navigation
// ==========================================
let currentTab = 'engine';

function switchTab(tabName) {
    currentTab = tabName;
    // 버튼은 현재 상태가 아닌 "누르면 이동할 곳"을 표시한다
    if (tabToggleBtn) tabToggleBtn.textContent = tabName === 'engine' ? t('tab_ai') : t('tab_engine');
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

tabToggleBtn.addEventListener('click', () => {
    const next = currentTab === 'engine' ? 'ai' : 'engine';
    switchTab(next);
    if (next === 'ai') renderAiTabContent();
});

previewStartBtn.addEventListener('click', () => {
    if (isPreviewMode) {
        startAnalysisFromPreview();
    } else if (isReviewMode) {
        // 리뷰 화면에서 "분석 시작" → 0수(시작 포지션)으로 이동.
        // updateBoardPosition이 isReviewMode를 자동 OFF.
        updateBoardPosition(-1, chess.header().FEN || 'start');
    }
});


let _overlayGetPgn = null;

function showMovesOverlay({ getPgn, renderBody, reviewable = false } = {}) {
    _overlayGetPgn = getPgn || null;
    if (renderBody) renderBody();
    // 리뷰 가능 컨텍스트(분석 화면)에서만 "리뷰 보기" 버튼 노출
    movesOverlayReviewBtn.classList.toggle('hidden', !reviewable);
    // 가상 키보드/포커스가 PGN textarea에 남아있으면 내려보낸다
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    movesOverlay.classList.add('open');
    document.body.classList.add('moves-overlay-open');
}
function closeMovesOverlay() {
    movesOverlay.classList.remove('open');
    _overlayGetPgn = null;
    document.body.classList.remove('moves-overlay-open');
}

initVault({ showMovesOverlay, closeMovesOverlay, navigateTo, onEmptyCta: () => navigateTo('home') });
initSavedGames({
    onLoadGame: (pgn) => {
        pgnInput.value = pgn;
        handlePgnReviewStart(null, null, null, true);
    },
    // 라이브 입력 모드는 메인 chess가 비어 있고 branchChess만 의미 있음.
    getChess: () => appMode === APP_MODES.LIVE_INPUT ? branchChess : chess,
    getPgn: () => {
        const src = appMode === APP_MODES.LIVE_INPUT ? branchChess : chess;
        return injectNags(src.pgn(), analysisQueue);
    },
    // Empty state CTA → 홈 화면으로 이동 (사용자가 게임 카드를 골라 분석 시작 가능).
    onEmptyCta: () => navigateTo('home'),
});

initInsights();
initForum();
initImportGames({ pgnInput, handlePgnReviewStart });

function buildExplorationMovesQueue() {
    const history = branchChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

analysisBackBtn.addEventListener('click', () => {
    history.back();
});

movesOverlayBtn.addEventListener('click', () => {
    // 라이브 입력 모드: 사용자가 둔 수만 branchChess에서 추출 (분석 큐 없음).
    if (appMode === APP_MODES.LIVE_INPUT) {
        showMovesOverlay({
            getPgn: () => branchChess.pgn(),
            renderBody: () => renderMovesTable(movesBody, buildExplorationMovesQueue(), () => closeMovesOverlay()),
        });
        return;
    }
    // 분석 데이터가 있고 FEN 단독이 아닐 때만 리뷰 버튼 노출. 미리보기 모드일 때는 분석 전이라 숨김.
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    const canReview = !isPreviewMode && !isAnalysisLoading && analysisQueue.length > 0 && !isFenOnly;
    showMovesOverlay({
        getPgn: () => injectNags(chess.pgn(), analysisQueue),
        reviewable: canReview,
        renderBody: () => {
            renderMovesTable(movesBody, analysisQueue, (index) => {
                updateBoardPosition(index, analysisQueue[index].fen);
                closeMovesOverlay();
            });
            // 이미 분석 완료된 수들의 평가치와 분류를 복원
            for (let i = 0; i < analysisQueue.length; i++) {
                const move = analysisQueue[i];
                if (move.engineLines && move.engineLines[0] && move.engineLines[0].scoreStr) {
                    updateUIWithEval(i, move.engineLines[0].scoreStr, move.classification || '');
                }
            }
        },
    });
});

movesOverlayReviewBtn.addEventListener('click', () => {
    closeMovesOverlay();
    // 보드 위치는 -1(시작 포지션)으로 가져가고 리뷰 모드를 켠다.
    // updateBoardPosition이 isReviewMode를 OFF로 만드므로 그 후에 ON.
    if (currentlyViewedIndex !== -1) {
        updateBoardPosition(-1, chess.header().FEN || 'start');
    }
    setIsReviewMode(true);
    applyReviewView();
});
movesOverlayCloseBtn.addEventListener('click', closeMovesOverlay);
movesOverlay.addEventListener('click', (e) => {
    if (e.target === movesOverlay) closeMovesOverlay();
});

copyPgnBtn.addEventListener('click', async () => {
    const pgn = _overlayGetPgn ? _overlayGetPgn() : chess.pgn();
    if (!pgn) return;
    try {
        await navigator.clipboard.writeText(pgn);
        showToast(t('copied'));
    } catch (_) {
        // 클립보드 권한 거부 / HTTP origin 등 실패 시 토스트로 알림.
        showToast(t('feedback_error_network'));
    }
});

// --- Gemini AI Coach Logic ---
initGemini({
    geminiEl: geminiExplanation,
    onOpen: () => switchTab('ai'),
});

geminiExplanation.addEventListener('click', (e) => {
    if (e.target.closest('#aiAnalyzeBtn')) handleGeminiExplanation();
});


// --- UI Helpers ---
const evalBar = document.getElementById('evalBar');

// EXPLORE / SIMULATE 모드 정리 — 변형/시뮬 상태 해제 + 단일 엔진 idle. 하단 바는 syncBottomBar로 동기.
function exitBranchMode() {
    clearSimExtend();
    setAppMode(APP_MODES.MAIN);
    clearBranchEngineLines();
    setSimulationQueue([]);
    clearExploreRedoStack();
    syncBottomBar();
}

returnMainLineBtn.addEventListener('click', () => {
    exitBranchMode();
    if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) {
        updateBoardPosition(currentlyViewedIndex, analysisQueue[currentlyViewedIndex].fen);
    } else {
        const startFen = chess.header().FEN || START_FEN;
        updateBoardPosition(-1, startFen);
    }
});

// 분석/라이브 화면 저장 버튼 → saved_games로 직접. vault 수동 저장은 폐지(자동 수집만).
saveMoveBtn.addEventListener('click', () => {
    if (appMode === APP_MODES.LIVE_INPUT) {
        if (branchChess.history().length === 0) {
            showAlert(t('analysis_no_save_start'));
            return;
        }
    } else if (currentlyViewedIndex < 0 || !analysisQueue[currentlyViewedIndex]) {
        showAlert(t('analysis_no_save_start'));
        return;
    }
    openSaveGameModal();
});

// Redraw board on window resize or device rotation for better responsive behavior
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (cg && !analysisView.classList.contains('hidden')) {
            cg.redrawAll();
        }
        redrawVaultBoard();
        redrawVaultPuzzleBoard();
    }, 100); // 100ms 디바운스 적용
});

function handleBranchMove(orig, dest) {
    if (isPreviewMode) return;
    // 새 변형 수를 두면 fork — redo 스택 무효화. (프로그램적 redo는 이 경로를 안 탄다.)
    clearExploreRedoStack();
    clearSimExtend();
    if (appMode === APP_MODES.SIMULATE) {
        setAppMode(APP_MODES.EXPLORE);
        // sim 베이스부터 현재 simulationIndex까지의 PV 수를 branchChess history에 replay.
        // 안 하면 사용자가 둔 1수만 undo 가능하고 그 직후 history 소진 분기로 메인라인까지 튐.
        branchChess.load(simulationQueue[0].fen);
        for (let i = 1; i <= simulationIndex; i++) {
            branchChess.move(simulationQueue[i].san);
        }
        syncBottomBar();
    } else if (!isBranchMode()) {
        // MAIN → EXPLORE 첫 진입: 메인 라인의 현재 위치를 base로 잡고 returnMainLine 버튼 표시.
        // LIVE_INPUT은 진입 시 이미 branchChess에 START_FEN이 로드돼 있으므로 이 블록 건너뜀.
        setAppMode(APP_MODES.EXPLORE);
        syncBottomBar();

        let baseFen = START_FEN;
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) baseFen = analysisQueue[currentlyViewedIndex].fen;
        else if (chess.header().FEN) baseFen = chess.header().FEN;

        branchChess.load(baseFen);
    }
    // 엔진 정지 + 라인 클리어는 kickBranchEngine이 처리.

    // 라이브 모드 fork 처리: 사용자가 중간 위치를 보다가 새 수를 두면 그 시점에서 history 분기.
    // currentlyViewedIndex 이후의 큐 항목 모두 버리고 branchChess는 이미 navigate 시 그 위치로 replay 되어 있음.
    if (appMode === APP_MODES.LIVE_INPUT && currentlyViewedIndex < analysisQueue.length - 1) {
        analysisQueue.length = currentlyViewedIndex + 1;
    }

    const moveRes = branchChess.move({ from: orig, to: dest, promotion: 'q' });
    if (!moveRes) {
        cg.set({ fen: branchChess.fen() });
        return;
    }

    // 라이브 입력 모드: 둔 수를 analysisQueue에 push해서 classifyMove가 직전 포지션 평가를 참조 가능하게.
    // engineLines는 새 분석이 끝나면 onBestMove에서 채워짐.
    if (appMode === APP_MODES.LIVE_INPUT) {
        const moveIdx = analysisQueue.length;
        analysisQueue.push({
            fen: branchChess.fen(),
            san: moveRes.san,
            from: moveRes.from,
            to: moveRes.to,
            promotion: moveRes.promotion,
            turn: branchChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(moveIdx / 2) + 1,
            isWhite: moveIdx % 2 === 0,
            engineLines: [],
        });
        setCurrentlyViewedIndex(moveIdx);
    }

    const turnColor = branchChess.turn() === 'w' ? 'white' : 'black';
    cg.set({
        fen: branchChess.fen(),
        turnColor,
        movable: { color: turnColor, free: false, dests: getDests(branchChess) }
    });

    kickBranchEngine(branchChess.fen());
}

// ==========================================
// 5. Engine Initialization
// ==========================================
// 단일 엔진 콜백 — 탐색/라이브 입력 모드 전용. 배치 분석은 풀(promise 기반)이 별도 처리.
const engineCallbacks = {
    onError: (e) => {
        console.error("Failed to load Stockfish worker:", e);
    },
    onEval: (evalData) => {
        // SIMULATE 라인 확장 중: multipv=1 라인만 누적, bestmove에서 finalize.
        if (appMode === APP_MODES.SIMULATE && simExtendState && evalData.multipv === 1) {
            simExtendState.latestEval = evalData;
            return;
        }
        if (!isBranchMode()) return;

        // Stale-info 필터: stop() 직후 워커가 OLD 포지션의 잔여 info를 emit하는 경우가 있음.
        // PV 첫 수가 현재 branchChess에서 합법이 아니면(놓인 칸에 자기 차례 기물 없음) 버린다.
        const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
        if (firstUci && firstUci.length >= 4) {
            const fromSq = firstUci.slice(0, 2);
            const piece = branchChess.get(fromSq);
            const turn = branchChess.turn();
            if (!piece || piece.color !== turn) return;
        }

        const isBlackToMove = branchChess.turn() === 'b';
        const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove);

        const lineIndex = evalData.multipv - 1;
        const sanPv = convertPvToSan(evalData.pv, branchChess.fen());
        setBranchLineAt(lineIndex, { scoreStr, scoreNum, pv: sanPv, uci: firstUci });

        const now = Date.now();
        if (branchEngineLines[0] && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
            lastEvalRenderTime = now;
            requestAnimationFrame(() => {
                renderEngineLines(engineLinesContainer, branchEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                // 라이브 모드: 마지막 큐 항목 분류(onBestMove가 set)를 우선, 미산출이면 빈 라벨.
                // EXPLORE 모드: 변형 중이라 메인라인 분류와 무관 → 항상 빈 라벨.
                const cls = (appMode === APP_MODES.LIVE_INPUT && analysisQueue.length > 0)
                    ? (analysisQueue[analysisQueue.length - 1].classification || '')
                    : '';
                updateTopEvalDisplay(branchEngineLines[0].scoreStr, cls, isUserWhite);
            });
        }
    },
    onBestMove: () => {
        if (appMode === APP_MODES.SIMULATE && simExtendState) {
            finalizeSimExtend();
            return;
        }
        if (!isBranchMode()) return;

        // 라이브 모드: 새 분석 완료 → 마지막 수 분류. 단, lines가 stale 필터 통과해 채워졌을 때만.
        if (appMode === APP_MODES.LIVE_INPUT && analysisQueue.length > 0 && branchEngineLines[0]) {
            const idx = analysisQueue.length - 1;
            analysisQueue[idx].engineLines = branchEngineLines.slice();
            const cls = classifyMove(idx, analysisQueue);
            analysisQueue[idx].classification = cls;
            updateTopEvalDisplay(branchEngineLines[0].scoreStr, cls, isUserWhite);
            showPieceBadge(idx);
        }
    }
};

initAnalysis({ enginePath: './engine/stockfish-18-lite-single.js', callbacks: engineCallbacks });

// ==========================================
// 6. Analysis Workflow
// ==========================================
function handlePgnReviewStart(e = null, isWhiteGame = null, targetIndex = null, previewOnly = false) {
    setIsUserWhite(isWhiteGame !== null ? isWhiteGame : true);

    const pgnText = pgnInput.value.trim();
    if (!pgnText) return;

    resetMainGame();
    const result = parseAndLoadPgn(chess, pgnText);

    if (!result.success) {
        showAlert(t('analysis_invalid_pgn'));
        return;
    }

    if (result.pgn) {
        pgnInput.value = result.pgn;
    }

    const newQueue = buildQueueFromPgn(chess);

    // Preview mode: show analysis view without starting engine
    if (previewOnly) {
        if (isRunning() || isAwaitingRestart()) stopAndClear();
        startNewAnalysis(newQueue, targetIndex, true);
        return;
    }

    // 안전 재시작: 진행 중 배치를 abort하고, 정리 끝나면 새 배치 시작.
    if (isRunning() || isAwaitingRestart()) {
        scheduleRestart(() => startNewAnalysis(newQueue, targetIndex));
        return;
    }

    startNewAnalysis(newQueue, targetIndex);
}

// FEN 단일 포지션 분석: 기보 없이 해당 포지션만 엔진으로 평가한다.
// 한 개의 isFenOnly 엔트리 큐를 구성해 기존 분석 파이프라인을 그대로 재사용한다.
function handleFenReviewStart(fenText, isWhiteGame) {
    setIsUserWhite(isWhiteGame !== null ? isWhiteGame : true);

    resetMainGame();
    if (!isValidFen(fenText)) {
        showAlert(t('analysis_invalid_pgn'));
        return;
    }
    chess.load(fenText);
    pgnInput.value = chess.pgn();

    const newQueue = buildSinglePositionQueue(fenText);

    if (isRunning() || isAwaitingRestart()) {
        scheduleRestart(() => startNewAnalysis(newQueue, 0));
        return;
    }
    startNewAnalysis(newQueue, 0);
}

function startNewAnalysis(newQueue, targetIndex = null, previewOnly = false) {
    // Switch to Analysis View
    if (_currentScreen !== SCREENS.ANALYSIS) {
        navigateTo(SCREENS.ANALYSIS);
    }
    homeView.classList.add('hidden');
    vaultViewNav.classList.add('hidden');
    vaultDetailViewNav.classList.add('hidden');
    savedGamesViewNav.classList.add('hidden');
    analysisView.classList.remove('hidden');

    // EXPLORE/SIMULATE/LIVE_INPUT 상태에서 paste→PGN 분석 진입 시 잔류 UI 차단.
    // exitBranchMode가 setAppMode(MAIN) + syncBottomBar() 까지 처리하므로 분기별 핸들링 불필요.
    exitBranchMode();
    analysisView.classList.remove('view-review');
    setIsReviewMode(false);
    exitAnalysisLoading();

    // Force Chessground to recalculate board size for mobile
    forceRedraw(cg);

    setQueue(newQueue);
    analyzeBtn.disabled = true;

    renderMovesTable(movesBody, analysisQueue, (index) => {
        updateBoardPosition(index, analysisQueue[index].fen);
        closeMovesOverlay();
    });

    if (analysisQueue.length > 0) {
        clearPersistentShapes();
        const initialFen = chess.header().FEN || 'start';
        cg.set({
            fen: initialFen,
            orientation: isUserWhite ? 'white' : 'black',
            drawable: { autoShapes: [] }
        });
        setCurrentlyViewedIndex(-1);
        updateTopEvalDisplay('-', '', isUserWhite);
    }

    if (previewOnly) {
        setIsPreviewMode(true);
        renderPreviewCard();
        applyPreviewControls();
        return;
    }

    if (analysisQueue.length > 0 && targetIndex != null && targetIndex >= 0 && targetIndex < analysisQueue.length) {
        updateBoardPosition(targetIndex, analysisQueue[targetIndex].fen);
    }

    // 로딩 카드 진입은 processNextInQueue 내부에서 cache miss 분기에만 실행.
    // cache hit이면 로딩 카드 깜빡임 없이 바로 리뷰 화면으로 전환.
    processNextInQueue();
}

// ==========================================
// 7-2. Analysis Preview Mode
// ==========================================
// \ubd84\uc11d \ud654\uba74 \ud5e4\ub354 \uce74\ub4dc\uc6a9 \uc815\ubcf4(\uac8c\uc784 \uc81c\ubaa9/\ub0a0\uc9dc\u00b7\uc218/\uc624\ud504\ub2dd)\ub97c chess \uc778\uc2a4\ud134\uc2a4\uc5d0\uc11c \ucd94\ucd9c.
// \ubbf8\ub9ac\ubcf4\uae30 \ud654\uba74\uacfc \ubd84\uc11d \ud6c4 \ub9ac\ud3ec\ud2b8 \ud654\uba74\uc774 \uacf5\uc720\ud55c\ub2e4.
function buildGameHeaderInfo() {
    const h = chess.header() || {};
    const white = h.White || '?';
    const black = h.Black || '?';
    const title = (white !== '?' && black !== '?') ? `${white} vs ${black}` : '';

    const metaParts = [];
    const datePart = h.Date;
    if (datePart && datePart !== '????.??.??') metaParts.push(datePart);
    // ply \u2192 full move number \ubcc0\ud658 (\ubc31+\ud751 \ud55c \uc30d = 1\uc218). \uac8c\uc784 \ubaa9\ub85d \uce74\uc6b4\ud2b8\uc640 \ub2e8\uc704 \uc77c\uce58.
    const fullMoves = Math.ceil(analysisQueue.length / 2);
    metaParts.push(t('preview_moves').replace('{n}', fullMoves));
    const metaLine = metaParts.join(' \u00b7 ');

    const { name: openingName } = parseOpeningFromPgn(chess.pgn());

    // PGN [Result] + \ubcf8\uc778 \uc9c4\uc601\uc73c\ub85c win/loss/draw \ud310\uc815 (\ub9ac\ubdf0 \uce74\ub4dc\uc6a9)
    const r = h.Result;
    let result = null;
    if (r === '1-0') result = isUserWhite ? 'win' : 'loss';
    else if (r === '0-1') result = isUserWhite ? 'loss' : 'win';
    else if (r === '1/2-1/2') result = 'draw';

    return { title, metaLine, openingName, result };
}

function renderPreviewCard() {
    engineLinesContainer.innerHTML = buildPreviewCardHtml(buildGameHeaderInfo());
}

// preview 모드: eval-bar + 하단 abb-group 둘 다 hide + previewStartBtn(가운데 floating)만 show.
function applyPreviewControls() {
    evalBar?.classList.add('hidden');
    analysisBottomBar?.querySelectorAll('.abb-group').forEach(g => g.classList.add('hidden'));
    previewStartBtn.classList.remove('hidden');
    previewStartBtn.textContent = t('analysis_start_btn');
}

function removePreviewControls() {
    evalBar?.classList.remove('hidden');
    analysisBottomBar?.querySelectorAll('.abb-group').forEach(g => g.classList.remove('hidden'));
    previewStartBtn.classList.add('hidden');
}

// 분석 로딩 상태: 보드 자리에 명언 카드 + 진행 바, 패널/네비/상태바 숨김.
// view-review와 공존하지 않음 — 완료 시점에 리뷰 뷰가 켜진다.
const QUOTE_ROTATION_MS = 4500;
let _quoteRotationTimer = null;
let _completedCount = 0;
let _totalCount = 0;

function showCurrentQuote() {
    const q = pickQuote();
    if (!q || !loadingQuoteText) return;
    if (loadingQuoteWrap) loadingQuoteWrap.classList.remove('fading');
    loadingQuoteText.textContent = q.quote;
    loadingQuoteAuthor.textContent = q.author;
}

function rotateQuoteWithFade() {
    if (!loadingQuoteWrap) return;
    loadingQuoteWrap.classList.add('fading');
    setTimeout(() => {
        showCurrentQuote();
    }, 380); // CSS transition duration(400ms)와 거의 일치
}

function setLoadingProgress(completed, total) {
    if (!loadingProgressFill || !loadingProgressText) return;
    const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    loadingProgressFill.style.width = pct + '%';
    loadingProgressText.textContent = `${pct}%`;
}

function enterAnalysisLoading() {
    isAnalysisLoading = true;
    analysisView.classList.remove('view-review');
    analysisView.classList.add('analyzing-loading');

    // preview와 동일한 컨트롤 상태 — eval-bar + 하단 액션 그룹 숨김. 패널은 게임 헤더 카드로 채움.
    evalBar?.classList.add('hidden');
    analysisBottomBar?.querySelectorAll('.abb-group').forEach(g => g.classList.add('hidden'));

    // 패널 영역에 게임 헤더(오프닝/이름/날짜) 카드 — preview와 동일한 정보 카드.
    renderPreviewCard();

    // 카드 진행률 초기화 — 진짜 총 수는 startNewAnalysis가 setQueue 직후 결정.
    _completedCount = 0;
    _totalCount = analysisQueue.length;
    setLoadingProgress(0, _totalCount);

    // 명언 — 데이터 로드가 늦으면 첫 표시는 비어있고 곧 채워짐.
    if (loadingQuoteWrap) loadingQuoteWrap.classList.remove('fading');
    quotesReady().then(() => {
        if (!isAnalysisLoading) return;
        showCurrentQuote();
    });

    if (_quoteRotationTimer) clearInterval(_quoteRotationTimer);
    _quoteRotationTimer = setInterval(rotateQuoteWithFade, QUOTE_ROTATION_MS);
}

function exitAnalysisLoading() {
    if (!isAnalysisLoading) return;
    isAnalysisLoading = false;
    analysisView.classList.remove('analyzing-loading');
    evalBar?.classList.remove('hidden');
    analysisBottomBar?.querySelectorAll('.abb-group').forEach(g => g.classList.remove('hidden'));

    if (_quoteRotationTimer) {
        clearInterval(_quoteRotationTimer);
        _quoteRotationTimer = null;
    }
}

function startAnalysisFromPreview() {
    setIsPreviewMode(false);
    removePreviewControls();
    // enterAnalysisLoading은 processNextInQueue가 cache miss 분기에서 호출.
    processNextInQueue();
}

// 풀 기반 배치 분석 실행. 진행률은 로딩 카드의 진행 바로 표시.
// onProgress는 인덱스 순서가 아닌 완료 순서로 호출되므로 단순 카운트만 사용.
//
// 진입 시 (user_id, pgn_hash) 캐시 조회 — hit이면 로딩 카드 없이 즉시 hydrate + finalize.
// miss일 때만 enterAnalysisLoading 호출하여 Stockfish 진행. 캐시 hit은 로딩 깜빡임 없이 직진.
async function processNextInQueue() {
    // 풀게임 PGN인 경우만 캐시 시도. FEN 단독은 휘발성 분석으로 캐시 안 함.
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    if (!isFenOnly && analysisQueue.length > 0) {
        const pgn = chess.pgn();
        if (pgn) {
            try {
                const pgnHash = await computePgnHash(pgn);
                const cache = await loadAnalysisCache(pgnHash);
                if (cache && isCacheCompatible(cache, getDepth()) && cache.moves.length === analysisQueue.length) {
                    // 캐시 히트 — engineLines/classification 즉시 hydrate. 로딩 카드 미진입.
                    for (let i = 0; i < analysisQueue.length; i++) {
                        const cached = cache.moves[i];
                        if (!cached) continue;
                        analysisQueue[i].engineLines = cached.engineLines || [];
                        analysisQueue[i].classification = cached.classification;
                    }
                    _finalizeAnalysisRun({ fromCache: true });
                    return;
                }
            } catch (e) {
                console.warn('Analysis cache lookup failed:', e);
                // fallthrough: 엔진 분석 정상 진행
            }
        }
    }

    // Cache miss (또는 FEN 단독) → 이제부터 Stockfish 분석. 로딩 카드 진입.
    enterAnalysisLoading();

    runBatch({
        onProgress: () => {
            _completedCount++;
            setLoadingProgress(_completedCount, _totalCount);
        },
        onError: (err) => {
            console.error('Engine pool init failed:', err);
            analyzeBtn.disabled = false;
            exitAnalysisLoading();
        },
        onComplete: () => _finalizeAnalysisRun({ fromCache: false }),
    });
}

// 분석 결과를 화면에 일괄 반영. runBatch 정상 완료 / 캐시 히트 양쪽에서 호출됨.
// fromCache=false일 때만 캐시 저장 시도(중복 저장 방지).
function _finalizeAnalysisRun({ fromCache }) {
    analyzeBtn.disabled = false;
    // 모든 포지션 engineLines/classification이 채워진 상태 — 분석 화면 행/UI 일괄 갱신
    for (let i = 0; i < analysisQueue.length; i++) {
        const move = analysisQueue[i];
        if (!move.classification) continue;
        const topScore = move.engineLines && move.engineLines[0] ? move.engineLines[0].scoreStr : '';
        updateUIWithEval(i, topScore, move.classification);
    }
    exitAnalysisLoading();
    // FEN 단일 포지션 분석은 리뷰 화면이 없으므로 그 자리에 머문다
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    if (!isFenOnly) {
        // 자동 블런더 수집 — 풀게임 분석에 한해. 토스트 없이 백그라운드.
        // 내부에서 upsertAnalyzedGame이 Supabase INSERT까지 await하므로 완료 시점에 행 존재 보장.
        // 새 분석이면 그 후 캐시 PATCH chain — 행이 있으니 PATCH가 의미 있게 동작.
        const autoPromise = collectAutoBlunders({
            pgn: chess.pgn(),
            queue: analysisQueue,
            isUserWhite,
            headers: chess.header() || {},
        });
        if (!fromCache) {
            autoPromise
                .then(() => _persistAnalysisCache())
                .catch(e => console.warn('Save analysis cache failed:', e));
        }
        // 분석 완료 시 보드는 시작 포지션, 리뷰 화면 자동 진입.
        // updateBoardPosition이 isReviewMode를 끄므로 그 후에 켠다.
        updateBoardPosition(-1, chess.header().FEN || 'start');
        setIsReviewMode(true);
        applyReviewView();
    } else if (analysisQueue[0]) {
        // FEN 단일: 보드는 그 포지션에 고정, 평가/라인을 패널에 즉시 반영
        const move = analysisQueue[0];
        const topLine = move.engineLines && move.engineLines[0] ? move.engineLines[0] : null;
        updateTopEvalDisplay(topLine?.scoreStr || '', move.classification, isUserWhite);
        if (move.engineLines && move.engineLines.length > 0) {
            renderEngineLines(engineLinesContainer, move.engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
        }
    }
}

// analyzed_games(user_id, pgn_hash)에 분석 결과 캐시 PATCH. 페이로드는 포지션별 engineLines + classification.
// fen/san 등 메타는 PGN 재replay로 복원 가능하므로 미포함 — 페이로드 크기 절감.
//
// 행 보장: collectAutoBlunders는 candidate(블런더/놓친메이트)가 0이면 early return하므로
// upsertAnalyzedGame을 직접 호출. 깨끗하게 플레이한 게임도 캐시에 들어가야 홈 카드 정확도% 표시됨.
async function _persistAnalysisCache() {
    const pgn = chess.pgn();
    if (!pgn) return;
    const pgnHash = await computePgnHash(pgn);

    const headers = chess.header() || {};
    await upsertAnalyzedGame({
        pgn,
        pgnHash,
        headersJson: headers,
        playedDate: headers.UTCDate || headers.Date || null,
    });

    const payload = {
        version: ANALYSIS_CACHE_VERSION,
        depth: getDepth(),
        moves: analysisQueue.map(m => ({
            engineLines: m.engineLines || [],
            classification: m.classification || null,
        })),
    };
    await saveAnalysisCache({ pgnHash, payload });
}

// ==========================================
// 7. UI Rendering
// ==========================================
// 0수(시작 포지션) 상태에서 체스보드 자리를 그래프 + 통계 표로 교체한다.
// 분석 큐가 비어있거나 preview/explore/simulate 모드에서는 진입하지 않는다.
const summaryGraphEl = document.getElementById('summaryGraph');

// 분석 결과를 전체 화면 리뷰(승률 그래프 + 통계 표)로 보여주는 모드.
// 보드 자리 = 그래프, 패널 자리 = 통계 카드. 1:1 박스 제약을 풀고 보드/패널 영역을 합쳐 사용한다.
// - 분석 직후 자동 ON (processNextInQueue.onQueueDone)
// - ☰ 오버레이의 "리뷰 보기" 버튼으로 다시 ON
// - 보드 위치를 옮기면(updateBoardPosition) 자동 OFF
// 진입 자격: main 모드 + 분석 데이터 존재 + isFenOnly 아님 + 로딩 중 아님 + preview 아님.
function canShowReview() {
    if (isAnalysisLoading) return false;
    if (isPreviewMode) return false;
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    return appMode === APP_MODES.MAIN && analysisQueue.length > 0 && !isFenOnly;
}

// PGN headers + analysisQueue → 리포트 상단 strap에 쓰일 결과 메타.
// reason은 마지막 SAN '#' 검사로 mate만 식별 — chess.com [Termination]은 자연어라 신뢰 낮음.
// score는 PGN [Result] 그대로지만 표시용 글리프(en-dash, ½)로 정규화.
function buildReviewResultMeta() {
    const h = chess.header() || {};
    const r = h.Result;
    let result = null;
    if (r === '1-0') result = isUserWhite ? 'win' : 'loss';
    else if (r === '0-1') result = isUserWhite ? 'loss' : 'win';
    else if (r === '1/2-1/2') result = 'draw';

    const lastMove = analysisQueue.length ? analysisQueue[analysisQueue.length - 1] : null;
    const reason = lastMove && String(lastMove.san || '').includes('#')
        ? t('report_result_mate')
        : null;

    const opponent = isUserWhite ? h.Black : h.White;
    const dateRaw = h.UTCDate || h.Date;
    const dateLabel = (dateRaw && dateRaw !== '????.??.??')
        ? formatRelativeDate(dateRaw.replace(/\./g, '-'), getDateStrings())
        : '';

    return {
        result,
        reason,
        opponent: opponent && opponent !== '?' ? opponent : '',
        tcLabel: formatTimeControlLabel(h.TimeControl),
        dateLabel,
        score: r && r !== '*' ? r.replace(/-/g, '–').replace('1/2', '½') : '',
        isUserWhite,
    };
}

function applyReviewView() {
    const on = isReviewMode && canShowReview();
    analysisView.classList.toggle('view-review', on);
    if (on) {
        summaryGraphEl.innerHTML = renderReviewReport({
            analysisQueue,
            isUserWhite,
            resultMeta: buildReviewResultMeta(),
        });

        // CTA 핸들러 와이어링: "분석 시작" → 0수(시작 포지션) 이동.
        // updateBoardPosition이 isReviewMode를 OFF로 만든다.
        const cta = document.getElementById('reviewStartBtn');
        if (cta) {
            cta.addEventListener('click', () => {
                updateBoardPosition(-1, chess.header().FEN || 'start');
            });
        }
    }
}

function updateBoardPosition(index, fen) {
    if (appMode === APP_MODES.EXPLORE) {
        exitBranchMode();
    }

    // 다른 수로 이동 시 기존에 진행 중이던 AI 해설이 있다면 즉시 취소하여 리소스 및 서버 연결 확보
    abortPendingGemini();

    const validFen = fen === 'start' ? START_FEN : fen;
    const tempChess = new Chess(validFen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';

    // 현재 포지션으로 이끈 수를 두 칸 하이라이트 (Lichess/Chess.com 관례).
    let lastMove = [];
    if (index >= 0 && analysisQueue[index] && analysisQueue[index].from && analysisQueue[index].to) {
        lastMove = [analysisQueue[index].from, analysisQueue[index].to];
    }

    cg.set({
        fen: fen,
        turnColor: turnColor,
        lastMove,
        movable: { color: turnColor, free: false, dests: getDests(tempChess) }
    });

    // 보드 위치를 옮길 때마다 리뷰 모드는 자동 해제 (사용자가 명시적으로 ☰→리뷰 보기로 다시 켤 수 있음).
    if (isReviewMode) setIsReviewMode(false);
    setCurrentlyViewedIndex(index);
    applyReviewView();
    highlightActiveMove(index);

    // 미리보기 모드에서는 하이라이트까지만 반영하고 나머지(엔진/AI 패널)는 건드리지 않음.
    // 이전 세션의 화살표가 남아있을 수 있으므로 autoShapes도 비워둔다.
    clearPersistentShapes();
    if (isPreviewMode) {
        cg.set({ drawable: { autoShapes: [] } });
        return;
    }

    // 리뷰 모드: applyReviewView가 패널에 통계 카드를 채웠으니 덮어쓰지 않음.
    if (analysisView.classList.contains('view-review')) {
        cg.set({ drawable: { autoShapes: [] } });
        return;
    }

    // 수 이동 시 엔진 탭으로 복귀하고 AI 패널은 현재 포지션에 맞게 갱신
    renderAiTabContent();
    switchTab('engine');

    // 블런더/실수일 때 엔진 추천 최선 수를 파란색 화살표로 표시 (실제 둔 수는 칸 하이라이트로 이미 표시됨)
    if (index > 0 && analysisQueue[index]) {
        const cls = analysisQueue[index].classification;
        if (cls === 'Blunder' || cls === 'Mistake') {
            const prevMove = analysisQueue[index - 1];
            if (prevMove && prevMove.engineLines && prevMove.engineLines[0] && prevMove.engineLines[0].uci) {
                const bestUci = prevMove.engineLines[0].uci;
                if (bestUci.length >= 4) {
                    const orig = bestUci.slice(0, 2);
                    const dest = bestUci.slice(2, 4);
                    if (/^[a-h][1-8]$/.test(orig) && /^[a-h][1-8]$/.test(dest)) {
                        pushPersistentShape({ orig, dest, brush: 'blue' });
                    }
                }
            }
        }
    }
    cg.set({ drawable: { autoShapes: persistentShapes } });

    // 화면이 바뀔 때, 해당 수에 저장된 엔진 추천 라인이 있다면 화면에 다시 렌더링
    if (analysisQueue[index] && analysisQueue[index].engineLines && analysisQueue[index].engineLines.length > 0) {
        const topLine = analysisQueue[index].engineLines[0];
        renderEngineLines(engineLinesContainer, analysisQueue[index].engineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
        updateTopEvalDisplay(topLine.scoreStr, analysisQueue[index].classification, isUserWhite);
    } else if (index === -1 && analysisQueue.length > 0) {
        // 분석 후 0수(시작 포지션) — 게임 목록에서 누른 직후 모습과 동일하게 미리보기 카드 표시
        engineLinesContainer.innerHTML = buildPreviewCardHtml(buildGameHeaderInfo());
        updateTopEvalDisplay('-', '', isUserWhite);
    } else {
        engineLinesContainer.innerHTML = '';
        updateTopEvalDisplay('-', '', isUserWhite);
    }

    showPieceBadge(index);
}

// ==========================================
// 8. Helpers
// ==========================================

function showPieceBadge(index) {
    if (index < 0 || !analysisQueue[index]) {
        placePieceBadge(boardContainer, null, null, null); // clear
        return;
    }
    const move = analysisQueue[index];
    placePieceBadge(boardContainer, move.to, cg.state.orientation, move.classification);
}

function forceRedraw(instance) {
    if (!instance) return;
    setTimeout(() => instance.redrawAll(), 50);
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
    if (isBranchMode()) {
        baseFen = branchChess.fen();
        lines = branchEngineLines;
    } else {
        if (currentlyViewedIndex < 0) return;
        baseFen = analysisQueue[currentlyViewedIndex].fen;
        lines = analysisQueue[currentlyViewedIndex].engineLines;
    }

    if (!lines || !lines[lineIndex]) return;
    
    const pv = lines[lineIndex].pv;
    if (!pv) return;

    // PV의 평가치를 모든 단계에서 동일하게 표시한다.
    // 엔진의 평가치 의미상 양쪽이 PV대로 둔다는 가정이므로 라인을 따라가도 값은 유지된다.
    const scoreStr = lines[lineIndex].scoreStr || '';

    const tempChess = new Chess(baseFen);
    setSimulationQueue([{ fen: baseFen, san: t('sim_start'), scoreStr }]);

    const moves = pv.split(' ');
    for (const move of moves) {
        const moveRes = tempChess.move(move);
        if (moveRes) pushSimulationQueueItem({ fen: tempChess.fen(), san: moveRes.san, scoreStr });
        else break;
    }

    setAppMode(APP_MODES.SIMULATE);
    setSimulationIndex(1);

    getEngine().stop();
    syncBottomBar();
    updateBoardForSimulation(simulationIndex);
}

function updateBoardForSimulation(index) {
    const item = simulationQueue[index];
    const tempChess = new Chess(item.fen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ fen: item.fen, turnColor: turnColor, movable: { color: turnColor, free: false, dests: getDests(tempChess) }, drawable: { autoShapes: [] } });
    updateTopEvalDisplay(item.scoreStr || '—', 'Simulating', isUserWhite);
    switchTab('engine');

    const movesHtml = simulationQueue.map((m, i) => {
        let state = i < index ? 'done' : i === index ? 'active' : 'upcoming';
        return `<span class="sim-move sim-move--${state}" data-sim-index="${i}">${i === 0 ? t('sim_start') : m.san}</span>`;
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
            clearSimExtend();
            setSimulationIndex(parseInt(el.dataset.simIndex, 10));
            updateBoardForSimulation(simulationIndex);
        });
    });
}

// SW 영구 비활성화 정책 — Phase 37 결정.
// SW를 재도입하지 않기로 했지만, Phase 8 PWA 시기에 sw.js를 등록한 적이 있는 사용자 브라우저에는
// 옛 SW가 cache-first로 살아있어 영영 stale 버전을 보여줄 수 있다. 매 로드 시점에 unregister + 캐시 삭제로
// 그런 사용자도 깨끗한 fresh fetch 경로로 자동 마이그레이션. 이 블록은 죽은 코드가 아니라
// 자동 업데이트가 매끄럽게 동작하는 핵심 메커니즘이라 영구 보존.
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
    });

    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }
}
