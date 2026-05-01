import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { fetchRecentGames, fetchPlayerProfile } from './chessApi.js';
import {
    initAnalysis, getEngine, getDepth, setDepth,
    analysisQueue, setQueue,
    isRunning, isAwaitingRestart, scheduleRestart,
    runBatch, stopAndClear,
    buildQueueFromPgn, buildSinglePositionQueue,
} from './analysis.js';
import {
    initBoard, chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes,
    setMainGame, resetMainGame, setCurrentlyViewedIndex, setIsUserWhite,
    setPersistentShapes, pushPersistentShape, clearPersistentShapes,
} from './board.js';
import {
    appMode, explorationChess, explorationEngineLines, simulationQueue, simulationIndex, isPreviewMode, isReviewMode,
    setAppMode, setIsPreviewMode, setIsReviewMode, clearExplorationEngineLines, setExplorationLineAt,
    setSimulationQueue, pushSimulationQueueItem, setSimulationIndex,
} from './modes.js';
import { parseEvalData, getDests, convertPvToSan, parseAndLoadPgn, isValidFen, escapeHtml, parseOpeningFromPgn, formatTimeControl, formatRelativeDate, getTier, TIERS, isWhitePlayer, classifyGameResult, countMovesFromPgn } from './utils.js';
import { renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderReviewReport, buildPreviewCardHtml } from './ui.js';
import { addVaultItem, getSavedGames, setMyUserId, getMyUserId, ONBOARDING_KEY, COORDS_KEY, EVAL_MODE_KEY, computePgnHash, loadAnalysisCache, saveAnalysisCache, isCacheCompatible, ANALYSIS_CACHE_VERSION } from './storage.js';
import { collectAutoBlunders } from './autoBlunders.js';
import { initVault, initHomeVaultBadge, isVaultDetailActive, isVaultPuzzleActive, getVaultDetailIndex, setVaultDetailIndex, flipVaultBoard, setVaultCoords, redrawVaultBoard, loadVaultData, loadBlunderListData, redrawVaultPuzzleBoard } from './vault.js';
import { initSavedGames, loadSavedGamesData } from './savedGames.js';
import { initInsights, loadInsightsData } from './insights.js';
import {
    initGemini, handleGeminiExplanation, renderAiTabContent,
    getIsGeminiEnabled, setIsGeminiEnabled, abortPendingGemini,
} from './gemini.js';
import { t, setLocale, getLocale } from './strings.js';
import { pickQuote, quotesReady } from './quotes.js';

// ==========================================
// 1. DOM Elements
// ==========================================
// Manual inputs
const pgnInput = document.getElementById('pgnInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const openBoardInputBtn = document.getElementById('homeBoardInputBtn');
const manualInputWrapper = document.getElementById('manualInputWrapper');
// API inputs
const usernameInput = document.getElementById('usernameInput');
const clearUsernameBtn = document.getElementById('clearUsernameBtn');
const fetchBtn = document.getElementById('fetchBtn');
const homeRecentLabel = document.getElementById('homeRecentLabel');
const backToMyGamesBtn = document.getElementById('backToMyGamesBtn');

// ── Viewing User State ─────────────────────────────────────────────
// viewingUserId: 메모리 전용 상태. null이면 내 계정(myUserId)을 보고 있는 것.
// 문자열이면 다른 유저 검색 상태. **localStorage에 절대 쓰지 말 것.**
// vault/saved_games 저장·조회는 반드시 getMyUserId()만 사용한다(storage.js).
let viewingUserId = null;
function getViewingUserId() {
    return viewingUserId || getMyUserId();
}
function isViewingOtherUser() {
    const my = getMyUserId();
    return !!viewingUserId && viewingUserId !== my;
}

const USERNAME_LOG_DEDUP_KEY = 'blundermate_username_log_last';
function logUsernameToServer(username, source) {
    try {
        const normalized = (username || '').trim().toLowerCase();
        if (!normalized) return;
        const dedupKey = `${source}:${normalized}`;
        if (localStorage.getItem(USERNAME_LOG_DEDUP_KEY) === dedupKey) return;
        try { localStorage.setItem(USERNAME_LOG_DEDUP_KEY, dedupKey); } catch (_) {}
        fetch('/api/log-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: normalized, source })
        }).catch(() => {});
    } catch (_) {}
}

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
const movesOverlayReviewBtn = document.getElementById('movesOverlayReviewBtn');
const copyPgnBtn = document.getElementById('copyPgnBtn');
const inputViewMovesBtn = document.getElementById('inputViewMovesBtn');

// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');

// Board Input Elements
const inputView = document.getElementById('inputView');
const inputViewBackBtn = document.getElementById('inputViewBackBtn');
const inputViewUndoBtnBottom = document.getElementById('inputViewUndoBtnBottom');
const inputViewResetBtn = document.getElementById('inputViewResetBtn');
const inputViewAnalyzeBtn = document.getElementById('inputViewAnalyzeBtn');
const inputBoardContainer = document.getElementById('inputBoardContainer');
const inputBoardPgn = document.getElementById('inputBoardPgn');
const inputPrevMoveBtn = document.getElementById('inputPrevMoveBtn');
const inputNextMoveBtn = document.getElementById('inputNextMoveBtn');
const previewStartBtn = document.getElementById('previewStartBtn');
const ctrlCenter = document.querySelector('.ctrl-center');
const analysisLoadingText = document.getElementById('analysisLoadingText');
const analysisLoadingCard = document.getElementById('analysisLoadingCard');
const loadingQuoteText = document.getElementById('loadingQuoteText');
const loadingQuoteAuthor = document.getElementById('loadingQuoteAuthor');
const loadingQuoteWrap = loadingQuoteText ? loadingQuoteText.parentElement : null;
const loadingProgressFill = document.getElementById('loadingProgressFill');
const loadingProgressText = document.getElementById('loadingProgressText');

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
const cancelChoiceBtn = document.getElementById('cancelChoiceBtn');

// Color Choice Modal Elements
const colorChoiceModal = document.getElementById('colorChoiceModal');
const chooseWhiteBtn = document.getElementById('chooseWhiteBtn');
const chooseBlackBtn = document.getElementById('chooseBlackBtn');
let pendingAnalysisCallback = null;

// Tier Info Modal
const tierModal = document.getElementById('tierModal');
const tierList = document.getElementById('tierList');
const closeTierModalBtn = document.getElementById('closeTierModalBtn');

// Settings Elements
const settingsBtn = document.getElementById('homeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const coordsToggle = document.getElementById('coordsToggle');
const geminiToggle = document.getElementById('geminiToggle');

// About Modal Elements
const aboutModal = document.getElementById('aboutModal');
const settingsAboutBtn = document.getElementById('settingsAboutBtn');

// Feedback Elements
const feedbackBtn = document.getElementById('settingsFeedbackBtn');
const feedbackModal = document.getElementById('feedbackModal');
const feedbackInput = document.getElementById('feedbackInput');
const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');
const closeFeedbackBtn = document.getElementById('closeFeedbackBtn');
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
const feedbackStatusText = document.getElementById('feedbackStatusText');

// User Search Modal
const openUserSearchBtn = document.getElementById('homeSearchBtn');
const userSearchModal = document.getElementById('userSearchModal');
const closeUserSearchBtn = document.getElementById('closeUserSearchBtn');

// ==========================================
// 2. Application State
// ==========================================
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// 엔진/풀 상태(stockfish, _pool, analysisQueue, 배치 라이프사이클)는 analysis.js 모듈에서 관리.
// chess, cg, currentlyViewedIndex, isUserWhite, persistentShapes 는 board.js로 이전.
// appMode, explorationChess, explorationEngineLines, simulationQueue, simulationIndex, isPreviewMode 는 modes.js로 이전.
let currentEval = '';
let isAnalysisLoading = false;
let currentBestMoveForVault = ''; // 저장 시 함께 보관할 최선의 수
let vaultSnapshot = null; // 🔖 탭 시점의 수 데이터 스냅샷 (모달 열린 동안 고정)
let inputChess = new window.Chess(); // 수동 보드 입력용 체스 인스턴스 (전체 수 히스토리 보유)
let inputCg; // 수동 보드 입력용 체스그라운드 인스턴스
// 입력 뷰 네비게이션 상태: 현재 보고 있는 수 인덱스(0 = 시작, N = N번째 수 이후).
// 중간 어딘가에서 새 수를 두면 그 지점까지 truncate 후 새 수를 append (fork).
let inputViewIndex = 0;
// FEN으로 로드된 커스텀 시작 포지션. null이면 표준 시작.
let inputStartFen = null;
let lastEvalRenderTime = 0; // 엔진 UI 렌더링 스로틀링용 타임스탬프
const EVAL_RENDER_THROTTLE = 100; // UI 업데이트 제한 시간(ms)
// isGeminiLoading, geminiAbortController, isGeminiEnabled 는 gemini.js로 이전.
let isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
let cachedHomeGames = [];
// 홈 게임 목록의 time_class 필터: 'all' | 'rapid' | 'blitz' | 'bullet'
// 기본값은 래피드 — 일반 사용자가 가장 자주 보는 시간대.
let homeTimeClassFilter = 'rapid';
// 현재 표시 중인 유저의 chess.com 레이팅 (rapid/blitz/bullet). 필터 변경 시 프로필 카드 갱신용.
let homeProfileRatings = null;

// ==========================================
// 2-2. History-based Navigation
// ==========================================
const SCREENS = {
    HOME: 'home',
    ANALYSIS: 'analysis',
    INPUT: 'input',
    VAULT_LIST: 'vault_list',
    VAULT_BLUNDER_LIST: 'vault_blunder_list',
    VAULT_DETAIL: 'vault_detail',
    SAVED_GAMES: 'saved_games',
    INSIGHTS: 'insights',
};

let _currentScreen = SCREENS.HOME;

const vaultViewNav = document.getElementById('vaultView');
const vaultBlunderListViewNav = document.getElementById('vaultBlunderListView');
const vaultDetailViewNav = document.getElementById('vaultDetailView');
const savedGamesViewNav = document.getElementById('savedGamesView');
const insightsViewNav = document.getElementById('insightsView');

// push + render 일원화. 호출자는 navigateTo만 호출하면 history와 화면 갱신이 함께 일어남 —
// renderScreen이 hideAllViews + 해당 view 노출 + syncBottomNav를 모두 처리하므로
// 부분 호출(예: history만 push)로 화면이 일관성을 잃을 일 없음.
function navigateTo(screen, state = {}) {
    history.pushState({ screen, ...state }, '', `#${screen}`);
    renderScreen(screen);
}

function hideAllViews() {
    homeView.classList.add('hidden');
    analysisView.classList.add('hidden');
    analysisView.classList.remove('view-review');
    inputView.classList.add('hidden');
    vaultViewNav.classList.add('hidden');
    if (vaultBlunderListViewNav) vaultBlunderListViewNav.classList.add('hidden');
    vaultDetailViewNav.classList.add('hidden');
    savedGamesViewNav.classList.add('hidden');
    if (insightsViewNav) insightsViewNav.classList.add('hidden');
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
        case SCREENS.INPUT:
            inputView.classList.remove('hidden');
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
const NAV_VISIBLE_SCREENS = new Set([SCREENS.HOME, SCREENS.VAULT_LIST, SCREENS.VAULT_BLUNDER_LIST, SCREENS.SAVED_GAMES, SCREENS.INSIGHTS]);
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

window.addEventListener('popstate', (event) => {
    const state = event.state;
    if (state && state.screen) {
        renderScreen(state.screen);
    } else {
        renderScreen(SCREENS.HOME);
    }
});

history.replaceState({ screen: SCREENS.HOME }, '', '#home');
syncBottomNav(SCREENS.HOME);

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
        move: (orig, dest) => handleExplorationMove(orig, dest)
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
    // Sync lang button active state
    const locale = getLocale();
    document.getElementById('langKoBtn')?.classList.toggle('active', locale === 'ko');
    document.getElementById('langEnBtn')?.classList.toggle('active', locale === 'en');
}

async function updateSavedGamesCount() {
}

async function refreshHomeCounts() {
    await initHomeVaultBadge();
    await updateSavedGamesCount();
    updateHomeHeader();
    loadHomeRecentGames();
}

function updateHomeRecentHeader(overrideUsername) {
    if (!homeRecentLabel || !backToMyGamesBtn) return;
    if (overrideUsername) {
        homeRecentLabel.textContent = t('home_other_user_games').replace('{username}', overrideUsername);
        homeRecentLabel.removeAttribute('data-i18n');
        homeRecentLabel.classList.remove('hidden');
        backToMyGamesBtn.classList.remove('hidden');
    } else {
        homeRecentLabel.textContent = t('home_recent_games');
        homeRecentLabel.removeAttribute('data-i18n');
        homeRecentLabel.classList.remove('hidden');
        backToMyGamesBtn.classList.add('hidden');
    }
}

function renderHomeGamesList(games, displayUser) {
    const list = document.getElementById('homeRecentList');
    const section = document.getElementById('homeRecentSection');
    if (!list) return;

    // time_class 필터 적용. 'all'이면 전체, 그 외엔 일치하는 것만.
    const filtered = homeTimeClassFilter === 'all'
        ? games
        : games.filter(g => (g.time_class || '') === homeTimeClassFilter);

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = `<div class="container-message">${t('filter_no_games')}</div>`;
        return;
    }

    const userLower = displayUser.toLowerCase();
    const container = document.createElement('div');
    container.className = 'home-recent-list';
    const dateStrings = { dateToday: t('dateToday'), dateYesterday: t('dateYesterday'), dateDaysAgo: t('dateDaysAgo') };

    filtered.slice(0, 15).forEach(game => {
        const isWhite = isWhitePlayer(game, userLower);
        const mySide = isWhite ? game.white : game.black;
        const oppSide = isWhite ? game.black : game.white;
        const resultClass = classifyGameResult(game, userLower);
        const resultKey = `game_result_${resultClass}`;

        const myColor = isWhite ? 'white' : 'black';
        const oppColor = isWhite ? 'black' : 'white';
        const myName = escapeHtml(mySide.username);
        const myRatingStr = mySide.rating ? ` (${mySide.rating})` : '';
        const oppRatingStr = oppSide.rating ? ` (${oppSide.rating})` : '';

        const date = game.end_time ? formatRelativeDate(game.end_time, dateStrings) : '';
        const moveCount = countMovesFromPgn(game.pgn);
        const tc = game.time_control ? formatTimeControl(game.time_control) : '';
        const metaBottom = [moveCount ? `${moveCount}${t('moves_suffix')}` : '', tc].filter(Boolean).join(' · ');

        const pawnPath = 'M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z';
        const buildPawn = (color) => `<svg class="home-recent-pawn home-recent-pawn--${color}" viewBox="0 0 45 45" width="14" height="14" aria-hidden="true"><path d="${pawnPath}"/></svg>`;

        const card = document.createElement('div');
        card.className = `home-recent-card result-${resultClass}`;
        card.setAttribute('aria-label', `${t(resultKey)} · ${isWhite ? 'White' : 'Black'}`);
        card.innerHTML = `
            <div class="home-recent-rows">
                <div class="home-recent-row home-recent-row--me">
                    ${buildPawn(myColor)}
                    <span class="home-recent-name">${myName}</span><span class="home-recent-rating">${escapeHtml(myRatingStr)}</span>
                </div>
                <div class="home-recent-row home-recent-row--opp">
                    ${buildPawn(oppColor)}
                    <span class="home-recent-name">${escapeHtml(oppSide.username)}</span><span class="home-recent-rating">${escapeHtml(oppRatingStr)}</span>
                </div>
            </div>
            <div class="home-recent-meta">
                <div class="home-recent-meta-line">${escapeHtml(date)}</div>
                <div class="home-recent-meta-line">${escapeHtml(metaBottom)}</div>
            </div>
        `;

        card.addEventListener('click', () => {
            if (!game.pgn) return;
            pgnInput.value = game.pgn;
            handlePgnReviewStart(null, isWhite, null, true);
        });

        container.appendChild(card);
    });

    list.appendChild(container);
    updateScrollFade(list);
}

function updateScrollFade(el) {
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    el.classList.toggle('fade-top', top && !bottom);
    el.classList.toggle('fade-bottom', bottom && !top);
    el.classList.toggle('fade-both', top && bottom);
}

document.getElementById('homeRecentList')?.addEventListener('scroll', function () {
    updateScrollFade(this);
});

// 홈 시간대 필터(전체/래피드/블리츠/불렛). 캐시된 게임에서 클라이언트 사이드 필터 후 다시 렌더.
document.getElementById('homeTimeFilterBar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    const tc = btn.dataset.tc;
    if (!tc || tc === homeTimeClassFilter) return;
    homeTimeClassFilter = tc;
    document.querySelectorAll('#homeTimeFilterBar .pill-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.tc === tc);
    });
    // 프로필 카드 레이팅/티어를 현재 시간대 기준으로 즉시 갱신
    applyProfileRatingForFilter();
    const displayUser = isViewingOtherUser() ? viewingUserId : getMyUserId();
    if (cachedHomeGames.length > 0 && displayUser) {
        renderHomeGamesList(cachedHomeGames, displayUser);
        updateProfileRecord(cachedHomeGames, displayUser);
    }
});

function loadHomeRecentGames(overrideUsername = null) {
    const normalizedOverride = overrideUsername ? overrideUsername.toLowerCase() : null;
    const displayUser = normalizedOverride || getMyUserId();
    const section = document.getElementById('homeRecentSection');
    const list = document.getElementById('homeRecentList');
    if (!displayUser || !section || !list) return;

    viewingUserId = normalizedOverride;
    updateHomeRecentHeader(isViewingOtherUser() ? viewingUserId : null);
    section.classList.remove('hidden');

    list.innerHTML = `<div class="home-recent-skeleton">${'<div class="home-recent-skeleton-card"></div>'.repeat(3)}</div>`;

    fetchRecentGames(displayUser).then(games => {
        if (!games || games.length === 0) {
            if (overrideUsername) {
                list.innerHTML = `<div class="container-message">${t('games_fetch_error')}</div>`;
            } else {
                section.classList.add('hidden');
            }
            cachedHomeGames = [];
            resetProfileRecord();
            return;
        }
        cachedHomeGames = games;
        renderHomeGamesList(games, displayUser);
        updateProfileRecord(games, displayUser);
    }).catch(() => {
        cachedHomeGames = [];
        resetProfileRecord();
        if (overrideUsername) {
            list.innerHTML = `<div class="container-message container-message--error">${t('games_fetch_error')}</div>`;
        } else {
            section.classList.add('hidden');
        }
    });
}

function resetProfileRecord() {
    const recordEl = document.getElementById('profileRecord');
    if (recordEl) recordEl.innerHTML = '<span class="profile-record-dash">—</span>';
}

function updateProfileRecord(games, displayUser) {
    const recordEl = document.getElementById('profileRecord');
    if (!recordEl || !displayUser) return;
    const userLower = displayUser.toLowerCase();
    // 게임 목록과 동일한 time_class 필터 적용 — 사용자가 본 15개 기준 W/L/D
    const filtered = homeTimeClassFilter === 'all'
        ? games
        : games.filter(g => (g.time_class || '') === homeTimeClassFilter);
    let w = 0, l = 0, d = 0;
    filtered.slice(0, 15).forEach(game => {
        const r = classifyGameResult(game, userLower);
        if (r === 'win') w++;
        else if (r === 'loss') l++;
        else d++;
    });
    recordEl.innerHTML = `
        <span class="profile-record-win">${w}${t('profile_record_win_short')}</span>
        <span class="profile-record-loss">${l}${t('profile_record_loss_short')}</span>
        <span class="profile-record-draw">${d}${t('profile_record_draw_short')}</span>
    `;
}

function renderProfileTier(rapid) {
    const tierEl = document.getElementById('profileTier');
    const avatarEl = document.getElementById('profileAvatar');
    const tier = getTier(rapid);
    avatarEl.classList.remove('tier-emperor');
    tierEl.classList.remove('tier-emperor');
    if (!tier) {
        tierEl.innerHTML = `<span>${t('tier_unranked')}</span>`;
        if (!avatarEl.querySelector('img')) {
            avatarEl.textContent = '\u265F';
        }
        return;
    }
    tierEl.innerHTML = `<span class="home-profile-tier-glyph">${tier.glyph}</span><span>${t('tier_' + tier.key)}</span>`;
    if (tier.isEmperor) tierEl.classList.add('tier-emperor');
    if (!avatarEl.querySelector('img')) {
        avatarEl.textContent = tier.glyph;
        if (tier.isEmperor) avatarEl.classList.add('tier-emperor');
    }
}

// 현재 시간대 필터 기준으로 프로필 카드의 레이팅 + 티어 갱신.
// 'all' 필터일 땐 단일 값 표시가 어려워 rapid를 기본 fallback으로 사용.
function applyProfileRatingForFilter() {
    const profileRapidEl = document.getElementById('profileRapid');
    if (!profileRapidEl || !homeProfileRatings) return;
    const tc = homeTimeClassFilter === 'all' ? 'rapid' : homeTimeClassFilter;
    const rating = homeProfileRatings[tc];
    profileRapidEl.textContent = rating || '—';
    updateProfileRatingLabel(tc);
    renderProfileTier(rating);
}

function updateProfileRatingLabel(tc) {
    const labelEl = document.getElementById('profileRatingLabel');
    if (!labelEl) return;
    const key = `home_filter_${tc}`;
    labelEl.setAttribute('data-i18n', key);
    labelEl.textContent = t(key);
}

function setProfileAvatar(url, fallbackRapid) {
    const avatarEl = document.getElementById('profileAvatar');
    avatarEl.innerHTML = '';
    avatarEl.classList.remove('tier-emperor');
    if (url) {
        const img = new Image();
        img.alt = '';
        img.src = url;
        img.onerror = () => {
            avatarEl.innerHTML = '';
            renderProfileTier(fallbackRapid);
        };
        avatarEl.appendChild(img);
    } else {
        renderProfileTier(fallbackRapid);
    }
}

function updateHomeHeader() {
    const userId = getViewingUserId();
    const heroSection = document.querySelector('.home-hero');
    const inputWrap = document.querySelector('.username-input-wrap');
    const heroTitle = document.querySelector('.hero-title');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const profileCard = document.getElementById('homeProfileCard');
    const profileName = document.getElementById('profileName');
    const profileRapid = document.getElementById('profileRapid');
    const profileAvatar = document.getElementById('profileAvatar');

    if (userId) {
        heroSection.classList.add('home-hero--user');
        profileCard.classList.remove('hidden');
        profileName.textContent = userId;
        profileName.classList.remove('username-md', 'username-sm');
        if (userId.length > 16) profileName.classList.add('username-sm');
        else if (userId.length > 10) profileName.classList.add('username-md');
        profileRapid.textContent = '—';
        updateProfileRatingLabel(homeTimeClassFilter === 'all' ? 'rapid' : homeTimeClassFilter);
        profileAvatar.innerHTML = '';
        profileAvatar.classList.remove('tier-emperor');
        renderProfileTier(null);
        resetProfileRecord();
        homeProfileRatings = null;
        inputWrap.classList.add('username-input-wrap--small');
        usernameInput.placeholder = t('home_search_other');

        fetchPlayerProfile(userId).then(profile => {
            if (!profile) return;
            const { ratings, avatar, displayName } = profile;
            homeProfileRatings = ratings;
            // chess.com 캐노니컬 케이스로 표시명 갱신 ("bywxx" → "Bywxx" 등)
            if (displayName) {
                profileName.textContent = displayName;
                profileName.classList.remove('username-md', 'username-sm');
                if (displayName.length > 16) profileName.classList.add('username-sm');
                else if (displayName.length > 10) profileName.classList.add('username-md');
            }
            // 현재 필터 기준으로 레이팅 + 티어 표시
            applyProfileRatingForFilter();
            // 아바타는 한 번만 세팅 (URL 동일하면 그대로)
            const tc = homeTimeClassFilter === 'all' ? 'rapid' : homeTimeClassFilter;
            setProfileAvatar(avatar, ratings[tc] || ratings.rapid);
        });
    } else {
        heroSection.classList.remove('home-hero--user');
        profileCard.classList.add('hidden');
        heroTitle.setAttribute('data-i18n', 'heroTitle');
        heroTitle.textContent = t('heroTitle');
        heroSubtitle.classList.remove('hidden');
        heroSubtitle.setAttribute('data-i18n', 'heroSubtitle');
        heroSubtitle.textContent = t('heroSubtitle');
        inputWrap.classList.remove('username-input-wrap--small');
        usernameInput.placeholder = t('usernamePlaceholder');
    }
}

// ── Onboarding ─────────────────────────────────────────────────────
const onboardingView = document.getElementById('onboardingView');
const onboardingUsernameInput = document.getElementById('onboardingUsernameInput');
const onboardingSubmitBtn = document.getElementById('onboardingSubmitBtn');
const onboardingSkipBtn = document.getElementById('onboardingSkipBtn');

function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onboardingView.classList.add('hidden');
    homeView.classList.remove('hidden');
    syncBottomNav(SCREENS.HOME);
    refreshHomeCounts();
}

onboardingSubmitBtn.addEventListener('click', () => {
    const username = onboardingUsernameInput.value.trim();
    if (username) {
        setMyUserId(username);
        logUsernameToServer(username, 'onboarding');
    }
    finishOnboarding();
});

onboardingUsernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') onboardingSubmitBtn.click();
});

onboardingSkipBtn.addEventListener('click', finishOnboarding);

if (!localStorage.getItem(ONBOARDING_KEY)) {
    homeView.classList.add('hidden');
    onboardingView.classList.remove('hidden');
    bottomNav.classList.add('hidden');
    appContainer.classList.add('bottom-nav-hidden');
} else {
    refreshHomeCounts();
    const cachedUser = getMyUserId();
    if (cachedUser) logUsernameToServer(cachedUser, 'cached');
}

applyLocale();

// ==========================================
// 3-2c. Vault Module Init (deferred — depends on overlay helpers defined later)
// ==========================================
// initVault() is called after showMovesOverlay/closeMovesOverlay are defined (see below)

// ==========================================
// 3-3. Settings UI
// ==========================================
geminiToggle.checked = getIsGeminiEnabled();

geminiToggle.addEventListener('change', (e) => {
    setIsGeminiEnabled(e.target.checked);
});

coordsToggle.checked = isCoordsEnabled;
coordsToggle.addEventListener('change', (e) => {
    isCoordsEnabled = e.target.checked;
    localStorage.setItem(COORDS_KEY, isCoordsEnabled);
    if (cg) cg.set({ coordinates: isCoordsEnabled });
    if (inputCg) inputCg.set({ coordinates: isCoordsEnabled });
    setVaultCoords(isCoordsEnabled);
});

chooseWhiteBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(true); pendingAnalysisCallback = null; }
});
chooseBlackBtn.addEventListener('click', () => {
    colorChoiceModal.classList.add('hidden');
    if (pendingAnalysisCallback) { pendingAnalysisCallback(false); pendingAnalysisCallback = null; }
});

let _lastPushFetched = false;
async function fetchLastPushTime() {
    const el = document.getElementById('lastPushTime');
    if (!el) return;
    if (_lastPushFetched) return;
    el.textContent = 'Loading...';
    try {
        const res = await fetch('https://api.github.com/repos/reus3148-blip/blundermate/commits/main');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const iso = data?.commit?.committer?.date;
        if (!iso) throw new Error('no date');
        const d = new Date(iso);
        el.textContent = d.toLocaleString();
        _lastPushFetched = true;
    } catch (e) {
        el.textContent = 'Failed to fetch';
    }
}

settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    fetchLastPushTime();
    const depthSelect = document.getElementById('depthSelect');
    if (depthSelect) depthSelect.value = String(getDepth());
});

document.getElementById('depthSelect')?.addEventListener('change', (e) => {
    setDepth(e.target.value);
});

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        if (!confirm(t('settings_logout_confirm'))) return;
        // 내 계정 식별자 + 온보딩 완료 플래그만 초기화.
        // VAULT_KEY / SAVED_GAMES_KEY는 유지 — 같은 ID로 재로그인 시 복구 가능해야 함.
        try {
            localStorage.removeItem('blundermate_user_id');
            localStorage.removeItem(ONBOARDING_KEY);
        } catch (e) {
            console.error('Logout cleanup failed:', e);
        }
        viewingUserId = null;
        settingsModal.classList.add('hidden');
        homeView.classList.add('hidden');
        if (onboardingUsernameInput) onboardingUsernameInput.value = '';
        onboardingView.classList.remove('hidden');
        bottomNav.classList.add('hidden');
        appContainer.classList.add('bottom-nav-hidden');
    });
}

function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
    if (modal === saveModal) vaultSnapshot = null;
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
    { modal: settingsModal, closeBtn: document.getElementById('closeSettingsBtn') },
    { modal: aboutModal, closeBtn: document.getElementById('closeAboutBtn') },
    { modal: feedbackModal, closeBtn: cancelFeedbackBtn },
    { modal: feedbackModal, closeBtn: closeFeedbackBtn },
    { modal: userSearchModal, closeBtn: closeUserSearchBtn },
    { modal: tierModal, closeBtn: closeTierModalBtn },
    { modal: saveChoiceModal, closeBtn: cancelChoiceBtn, noBg: true },
    { modal: saveModal, closeBtn: cancelSaveBtn, noBg: true },
];

modalConfigs.forEach(({ modal, closeBtn, noBg }) => {
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (!noBg) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// User Search Modal: open + ESC close
if (openUserSearchBtn) {
    openUserSearchBtn.addEventListener('click', () => {
        userSearchModal.classList.remove('hidden');
        setTimeout(() => usernameInput.focus(), 0);
    });
}

// 검색 모드 → 본인 모드 복귀
if (backToMyGamesBtn) {
    backToMyGamesBtn.addEventListener('click', () => {
        usernameInput.value = '';
        clearUsernameBtn.classList.remove('visible');
        loadHomeRecentGames();
    });
}
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && userSearchModal && !userSearchModal.classList.contains('hidden')) {
        closeModal(userSearchModal);
    }
});

// Feedback Logic — 설정 모달 안의 피드백 버튼. 클릭 시 설정 모달 닫고 피드백 모달 오픈.
if (feedbackBtn) {
    feedbackBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
        feedbackInput.value = '';
        feedbackStatusText.textContent = '';
        feedbackModal.classList.remove('hidden');
    });
}

// About 모달 — 설정 → About 진입. 설정 닫고 About 열기.
if (settingsAboutBtn && aboutModal) {
    settingsAboutBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
        aboutModal.classList.remove('hidden');
    });
}
// 홈 전용 피드백 FAB — 설정 모달을 거치지 않고 바로 피드백 모달을 연다.
const homeFeedbackFab = document.getElementById('homeFeedbackFab');
if (homeFeedbackFab) {
    homeFeedbackFab.addEventListener('click', () => {
        feedbackInput.value = '';
        feedbackStatusText.textContent = '';
        feedbackModal.classList.remove('hidden');
    });
}
if (submitFeedbackBtn) {
    submitFeedbackBtn.addEventListener('click', async () => {
        const content = feedbackInput.value.trim();
        if (!content) {
            feedbackStatusText.textContent = t('feedback_validation');
            feedbackStatusText.style.color = 'var(--blunder)';
            return;
        }

        submitFeedbackBtn.disabled = true;
        submitFeedbackBtn.textContent = t('feedback_sending');
        feedbackStatusText.textContent = '';

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                feedbackStatusText.textContent = t('feedback_success');
                feedbackStatusText.style.color = 'var(--best)';
                setTimeout(() => {
                    feedbackModal.classList.add('hidden');
                }, 1500);
            } else {
                let errText = t('feedback_error_label');
                try {
                    const errJson = await res.json();
                    if (errJson.error) errText = errJson.error;
                } catch(e) {}
                feedbackStatusText.textContent = errText;
                feedbackStatusText.style.color = 'var(--blunder)';
            }
        } catch (error) {
            feedbackStatusText.textContent = t('feedback_error_network');
            feedbackStatusText.style.color = 'var(--blunder)';
        } finally {
            submitFeedbackBtn.disabled = false;
            submitFeedbackBtn.textContent = t('feedback_send');
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
    navigateTo(SCREENS.INPUT);
    homeView.classList.add('hidden');
    inputView.classList.remove('hidden');
    inputChess = new window.Chess();
    inputStartFen = null;
    inputViewIndex = 0;
    inputBoardPgn.value = '';

    if (!inputCg) {
        inputCg = Chessground(inputBoardContainer, {
            animation: { enabled: true, duration: 250 },
            movable: { free: false },
            coordinates: isCoordsEnabled,
            events: {
                move: handleInputBoardMove,
            }
        });
    }
    updateInputBoard();
    forceRedraw(inputCg);
}

// 현재 inputViewIndex까지 replay한 체스 인스턴스 반환. 보드/토출 용도.
function getInputViewChess() {
    const c = new window.Chess();
    if (inputStartFen) c.load(inputStartFen);
    const hist = inputChess.history({ verbose: true });
    const limit = Math.min(inputViewIndex, hist.length);
    for (let i = 0; i < limit; i++) {
        c.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    return c;
}

// 사용자가 현재 보고 있는 위치에서 보드에 수를 두면 호출된다.
// 끝이 아닌 중간에서 두면 그 지점까지 truncate + fork.
function handleInputBoardMove(orig, dest) {
    const hist = inputChess.history({ verbose: true });
    if (inputViewIndex < hist.length) {
        const newChess = new window.Chess();
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

openBoardInputBtn.addEventListener('click', openInputView);

inputViewBackBtn.addEventListener('click', () => {
    history.back();
});

// Undo: 현재 보고 있는 수 + 그 이후 전부 삭제 (viewIndex - 1 까지 truncate).
// 끝에서 누르면 마지막 수 제거로 기존 동작과 동일하고, 중간에서 누르면 그 분기를 쳐낸다.
function doUndoInput() {
    if (inputViewIndex === 0) return;
    const hist = inputChess.history({ verbose: true });
    const newChess = new window.Chess();
    if (inputStartFen) newChess.load(inputStartFen);
    for (let i = 0; i < inputViewIndex - 1; i++) {
        newChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
    }
    inputChess = newChess;
    inputViewIndex--;
    updateInputBoard();
}
inputViewUndoBtnBottom.addEventListener('click', doUndoInput);
inputViewResetBtn.addEventListener('click', () => {
    inputChess = new window.Chess();
    inputStartFen = null;
    inputViewIndex = 0;
    inputBoardPgn.value = '';
    updateInputBoard();
});
inputPrevMoveBtn.addEventListener('click', handleInputPrev);
inputNextMoveBtn.addEventListener('click', handleInputNext);

inputBoardPgn.addEventListener('input', () => {
    const text = inputBoardPgn.value.trim();
    if (!text) {
        inputChess = new window.Chess();
        inputStartFen = null;
        inputViewIndex = 0;
        if (inputCg) updateInputBoard();
        return;
    }
    const tempChess = new window.Chess();
    const result = parseAndLoadPgn(tempChess, text);
    if (result.success) {
        inputChess = tempChess;
        inputStartFen = null;
        inputViewIndex = inputChess.history().length;
        if (inputCg) updateInputBoard();
        return;
    }
    // PGN 파싱 실패 시 FEN으로 시도 — 보드만 갱신, 수는 비어있음
    if (isValidFen(text)) {
        const fenChess = new window.Chess();
        fenChess.load(text);
        inputChess = fenChess;
        inputStartFen = text;
        inputViewIndex = 0;
        if (inputCg) updateInputBoard();
    }
});

inputViewAnalyzeBtn.addEventListener('click', () => {
    const text = inputBoardPgn.value.trim();
    // FEN이면 단일 포지션 분석 플로우로 분기
    if (text && isValidFen(text)) {
        inputView.classList.add('hidden');
        pendingAnalysisCallback = (isWhite) => handleFenReviewStart(text, isWhite);
        colorChoiceModal.classList.remove('hidden');
        return;
    }
    const pgn = text || inputChess.pgn();
    if (!pgn) {
        alert(t('analysis_no_moves'));
        return;
    }
    pgnInput.value = pgn;
    inputView.classList.add('hidden');
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

backBtn.addEventListener('click', () => {
    history.back();
});

function updateInputBoard() {
    // 보드는 inputViewIndex까지만 replay한 상태를 표시, dests도 그 포지션 기준으로 계산.
    // textarea는 항상 inputChess의 전체 PGN을 보여준다.
    const viewChess = getInputViewChess();
    const turnColor = viewChess.turn() === 'w' ? 'white' : 'black';

    // 현재 포지션으로 이끈 마지막 수를 두 칸 하이라이트로 표시 (Lichess/Chess.com 관례).
    // 시작 포지션(viewIndex === 0)에서는 빈 배열로 명시해 이전 하이라이트를 지운다.
    let lastMove = [];
    if (inputViewIndex > 0) {
        const hist = inputChess.history({ verbose: true });
        const m = hist[inputViewIndex - 1];
        if (m) lastMove = [m.from, m.to];
    }

    inputCg.set({
        fen: viewChess.fen(),
        turnColor: turnColor,
        lastMove,
        movable: {
            color: turnColor,
            dests: getDests(viewChess)
        },
        drawable: { autoShapes: [] }
    });
    inputBoardPgn.value = inputChess.pgn();
    inputBoardPgn.scrollTop = inputBoardPgn.scrollHeight;
    updateInputNavButtons();
}

fetchBtn.addEventListener('click', handleApiFetch);
usernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        handleApiFetch();
    }
});

usernameInput.addEventListener('input', (e) => {
    const hasValue = e.target.value.length > 0;
    clearUsernameBtn.classList.toggle('visible', hasValue);
});

clearUsernameBtn.addEventListener('click', () => {
    usernameInput.value = '';
    clearUsernameBtn.classList.remove('visible');
    usernameInput.focus();
    usernameInput.dispatchEvent(new Event('input'));
});
analyzeBtn.addEventListener('click', () => {
    if (!pgnInput.value.trim()) return;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

// --- Move Navigation Helpers ---
function handlePrevMove() {
    if (appMode === 'simulate') {
        setSimulationIndex(Math.max(0, simulationIndex - 1));
        updateBoardForSimulation(simulationIndex);
        return;
    }
    if (appMode === 'explore') {
        exitExplorationMode();
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) {
            updateBoardPosition(currentlyViewedIndex, analysisQueue[currentlyViewedIndex].fen);
        }
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
    if (appMode === 'simulate') {
        setSimulationIndex(Math.min(simulationQueue.length - 1, simulationIndex + 1));
        updateBoardForSimulation(simulationIndex);
        return;
    }
    if (appMode === 'explore') {
        exitExplorationMode();
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) {
            updateBoardPosition(currentlyViewedIndex, analysisQueue[currentlyViewedIndex].fen);
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
        // 'F' 키를 누르면 보드 시점(White/Black)을 수동으로 뒤집습니다.
        e.preventDefault();
        if (inVaultDetail) {
            flipVaultBoard();
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

// Win% / eval score toggle
document.getElementById('winChanceDisplay').addEventListener('click', () => {
    const el = document.getElementById('winChanceDisplay');
    const current = localStorage.getItem(EVAL_MODE_KEY) || 'percent';
    const next = current === 'percent' ? 'score' : 'percent';
    localStorage.setItem(EVAL_MODE_KEY, next);
    el.style.opacity = '0';
    setTimeout(() => {
        updateTopEvalDisplay(el.dataset.scoreStr || '', el.dataset.classification || '', isUserWhite);
        el.style.opacity = '1';
    }, 150);
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

initVault({ showMovesOverlay, closeMovesOverlay, navigateTo });
initSavedGames({
    onLoadGame: (pgn) => {
        pgnInput.value = pgn;
        handlePgnReviewStart(null, null, null, true);
    },
    getChess: () => chess,
    showButtonSuccess,
    saveMoveBtn,
    initHomeVaultBadge: refreshHomeCounts,
});
initInsights();

function buildInputMovesQueue() {
    const history = inputChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

movesOverlayBtn.addEventListener('click', () => {
    // 분석 데이터가 있고 FEN 단독이 아닐 때만 리뷰 버튼 노출. 미리보기 모드일 때는 분석 전이라 숨김.
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    const canReview = !isPreviewMode && !isAnalysisLoading && analysisQueue.length > 0 && !isFenOnly;
    showMovesOverlay({
        getPgn: () => chess.pgn(),
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
inputViewMovesBtn.addEventListener('click', () => showMovesOverlay({
    getPgn: () => inputBoardPgn.value.trim() || inputChess.pgn(),
    renderBody: () => renderMovesTable(movesBody, buildInputMovesQueue(), () => closeMovesOverlay()),
}));
movesOverlayCloseBtn.addEventListener('click', closeMovesOverlay);
movesOverlay.addEventListener('click', (e) => {
    if (e.target === movesOverlay) closeMovesOverlay();
});

let _copyPgnBusy = false;
copyPgnBtn.addEventListener('click', () => {
    if (_copyPgnBusy) return;
    const pgn = _overlayGetPgn ? _overlayGetPgn() : chess.pgn();
    if (!pgn) return;
    _copyPgnBusy = true;
    const label = copyPgnBtn.querySelector('span');
    const orig = label.textContent;
    navigator.clipboard.writeText(pgn).catch(() => prompt('PGN', pgn));
    label.textContent = t('copied');
    setTimeout(() => { label.textContent = orig; _copyPgnBusy = false; }, 1500);
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
const moveClassLabel = document.getElementById('moveClassLabel');
const winChanceDisplay = document.getElementById('winChanceDisplay');
const ctrlCenterSeparator = document.querySelector('.ctrl-center .bar-separator');

// 탐색/시뮬레이션 모드에서는 AI 분석을 못 돌리므로 AI 토글 버튼을 숨기고
// 같은 슬롯에 메인 라인 복귀 버튼을 노출한다. 둘은 항상 배타적.
function showReturnBtn() {
    tabToggleBtn.classList.add('hidden');
    returnMainLineBtn.classList.remove('hidden');
}

function hideReturnBtn() {
    returnMainLineBtn.classList.add('hidden');
    tabToggleBtn.classList.remove('hidden');
}

function showButtonSuccess(button, text) {
    const originalHTML = button.innerHTML;
    button.innerHTML = text;
    button.style.color = 'var(--best)';
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.color = '';
    }, 1500);
}

// --- Save Move to Vault Logic ---
saveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.remove('hidden');
});

choiceSaveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');

    if (currentlyViewedIndex < 0 || !analysisQueue[currentlyViewedIndex]) {
        alert(t('analysis_no_save_start'));
        return;
    }

    const snapIndex = currentlyViewedIndex;
    const move = analysisQueue[snapIndex];
    const moveNumberStr = move.moveNumber + (move.isWhite ? '. ' : '... ');
    saveMoveText.textContent = moveNumberStr + move.san;

    // Calculate Best Move from the previous position's engine lines
    let bestMove = '';
    if (snapIndex > 0) {
        const prevMove = analysisQueue[snapIndex - 1];
        if (prevMove && prevMove.engineLines && prevMove.engineLines[0] && prevMove.engineLines[0].pv) {
            bestMove = prevMove.engineLines[0].pv.split(' ')[0];
        }
    }
    currentBestMoveForVault = bestMove;
    if (bestMove) saveBestMoveText.textContent = t('vault_engine_suggested').replace('{move}', bestMove);
    else saveBestMoveText.textContent = '';

    const initialMoveFen = chess?.header?.()?.FEN || START_FEN;
    vaultSnapshot = {
        moveIndex: snapIndex,
        move,
        fen: move.fen,
        prevFen: snapIndex > 0 ? analysisQueue[snapIndex - 1].fen : initialMoveFen,
        san: move.san,
        bestMove,
        moveNumber: move.moveNumber,
        isWhite: move.isWhite,
        classification: move.classification,
        engineLines: move.engineLines
    };

    // Auto-select category based on engine classification
    if (move.classification) {
        const cls = move.classification.toLowerCase();
        if (cls === 'blunder') saveCategory.value = 'blunder';
        else if (cls === 'mistake') saveCategory.value = 'mistake';
        else saveCategory.value = 'positional';
    } else {
        saveCategory.value = 'positional'; // Default fallback
    }

    saveNotes.value = '';
    saveModal.classList.remove('hidden');
});

confirmSaveBtn.addEventListener('click', () => {
    if (!vaultSnapshot) return;

    const snap = vaultSnapshot;

    let gameTitle = '';
    let playedDate = null;
    const h = chess?.header?.();
    if (h) {
        if (h.White && h.Black && h.White !== '?' && h.Black !== '?') {
            gameTitle = `${h.White} vs ${h.Black}`;
        }
        playedDate = h.UTCDate || h.Date || null;
    }

    const vaultItem = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        pgn: chess.pgn(),
        moveIndex: snap.moveIndex,
        gameTitle,
        isUserWhite,
        fen: snap.fen,
        prevFen: snap.prevFen,
        san: snap.san,
        bestMove: snap.bestMove,
        moveNumber: snap.moveNumber,
        isWhite: snap.isWhite,
        category: saveCategory.value,
        notes: saveNotes.value.trim(),
        engineLines: snap.engineLines,
        playedDate,
    };

    addVaultItem(vaultItem);

    saveModal.classList.add('hidden');
    vaultSnapshot = null;

    // UX Feedback
    showButtonSuccess(saveMoveBtn, t('saved_games_saved'));
});

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
        redrawVaultBoard();
        redrawVaultPuzzleBoard();
    }, 100); // 100ms 디바운스 적용
});

function handleExplorationMove(orig, dest) {
    if (isPreviewMode) return;
    if (appMode === 'simulate') {
        setAppMode('explore');
        explorationChess.load(simulationQueue[simulationIndex].fen);
        clearExplorationEngineLines();
        getEngine().stop();
    } else if (appMode !== 'explore') {
        setAppMode('explore');
        showReturnBtn();

        let baseFen = START_FEN;
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) baseFen = analysisQueue[currentlyViewedIndex].fen;
        else if (chess.header().FEN) baseFen = chess.header().FEN;

        explorationChess.load(baseFen);
        clearExplorationEngineLines();

        // 메인 기보 분석 중지
        getEngine().stop();
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
    
    clearExplorationEngineLines();
    updateTopEvalDisplay('...', 'Exploring', isUserWhite);
    engineLinesContainer.innerHTML = `<div class="container-message">${t('analysis_variation')}</div>`;

    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = t('analysis_exploring');
    getEngine().analyzeFen(explorationChess.fen(), getDepth());
}

function exitExplorationMode() {
    setAppMode('main');
    hideReturnBtn();
    clearExplorationEngineLines();
    setSimulationQueue([]);

    // 풀 기반 배치는 단일 엔진과 독립적으로 진행되므로 별도 재개 불필요.
    analysisStatus.className = 'tag engine-ready hidden';
    analysisStatus.textContent = '';
}

// ==========================================
// 5. API Logic
// ==========================================
async function handleApiFetch() {
    const username = usernameInput.value.trim();
    if (!username) return;

    logUsernameToServer(username, 'search');

    if (userSearchModal) closeModal(userSearchModal);

    fetchBtn.disabled = true;
    try {
        // 검색된 유저의 게임만 최근 게임 박스에 제자리 교체. 본인 identity(myUserId)는 localStorage에 그대로 유지.
        loadHomeRecentGames(username);
    } finally {
        fetchBtn.disabled = false;
    }
}

// ==========================================
// 6. Engine Initialization
// ==========================================
// 단일 엔진 콜백 — 탐색(explore) 모드 전용. 배치 분석은 풀(promise 기반)이 별도 처리.
const engineCallbacks = {
    onError: (e) => {
        console.error("Failed to load Stockfish worker:", e);
    },
    onEval: (evalData) => {
        if (appMode !== 'explore') return;
        const isBlackToMove = explorationChess.turn() === 'b';
        const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove);

        const lineIndex = evalData.multipv - 1;
        const sanPv = convertPvToSan(evalData.pv, explorationChess.fen());
        const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
        setExplorationLineAt(lineIndex, { scoreStr, scoreNum, pv: sanPv, uci: firstUci });

        const now = Date.now();
        if (explorationEngineLines[0] && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
            lastEvalRenderTime = now;
            requestAnimationFrame(() => {
                renderEngineLines(engineLinesContainer, explorationEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                updateTopEvalDisplay(explorationEngineLines[0].scoreStr, 'Exploring', isUserWhite);
            });
        }
    },
    onBestMove: () => {
        if (appMode === 'explore') {
            analysisStatus.className = 'tag engine-ready hidden';
            analysisStatus.textContent = '';
        }
    }
};

initAnalysis({ enginePath: './engine/stockfish-18-lite-single.js', callbacks: engineCallbacks });

// ==========================================
// 7. Analysis Workflow
// ==========================================
function handlePgnReviewStart(e = null, isWhiteGame = null, targetIndex = null, previewOnly = false) {
    setIsUserWhite(isWhiteGame !== null ? isWhiteGame : true);

    const pgnText = pgnInput.value.trim();
    if (!pgnText) return;

    resetMainGame();
    const result = parseAndLoadPgn(chess, pgnText);

    if (!result.success) {
        alert(t('analysis_invalid_pgn'));
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
    if (!chess.load(fenText)) {
        alert(t('analysis_invalid_pgn'));
        return;
    }
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
    inputView.classList.add('hidden');
    analysisView.classList.remove('hidden');

    // 이전 탐색(Exploration) 및 시뮬레이션 모드 상태 완전 초기화
    setAppMode('main');
    hideReturnBtn();
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

    const { name: openingName, eco } = parseOpeningFromPgn(chess.pgn());

    // PGN [Result] + \ubcf8\uc778 \uc9c4\uc601\uc73c\ub85c win/loss/draw \ud310\uc815 (\ub9ac\ubdf0 \uce74\ub4dc\uc6a9)
    const r = h.Result;
    let result = null;
    if (r === '1-0') result = isUserWhite ? 'win' : 'loss';
    else if (r === '0-1') result = isUserWhite ? 'loss' : 'win';
    else if (r === '1/2-1/2') result = 'draw';

    return { title, metaLine, openingName, eco, result };
}

function renderPreviewCard() {
    engineLinesContainer.innerHTML = buildPreviewCardHtml(buildGameHeaderInfo());
}

function applyPreviewControls() {
    winChanceDisplay.classList.add('hidden');
    moveClassLabel.classList.add('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.add('hidden');
    if (ctrlCenter) ctrlCenter.classList.add('hidden');
    tabToggleBtn.classList.add('hidden');
    previewStartBtn.classList.remove('hidden');
    previewStartBtn.textContent = t('analysis_start_btn');
}

function removePreviewControls() {
    winChanceDisplay.classList.remove('hidden');
    moveClassLabel.classList.remove('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.remove('hidden');
    if (ctrlCenter) ctrlCenter.classList.remove('hidden');
    tabToggleBtn.classList.remove('hidden');
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

    // preview와 동일한 컨트롤 상태 — 중앙 그룹은 숨기되 패널은 게임 헤더 카드로 채움.
    moveClassLabel.classList.add('hidden');
    winChanceDisplay.classList.add('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.add('hidden');
    if (ctrlCenter) ctrlCenter.classList.add('hidden');
    tabToggleBtn.classList.add('hidden');
    analysisStatus.classList.add('hidden');

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
    moveClassLabel.classList.remove('hidden');
    winChanceDisplay.classList.remove('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.remove('hidden');
    if (ctrlCenter) ctrlCenter.classList.remove('hidden');
    tabToggleBtn.classList.remove('hidden');

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
// 호출 시점: collectAutoBlunders 완료 후 (행 존재 보장).
async function _persistAnalysisCache() {
    const pgn = chess.pgn();
    if (!pgn) return;
    const pgnHash = await computePgnHash(pgn);
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
// 8. UI Rendering
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
    return appMode === 'main' && analysisQueue.length > 0 && !isFenOnly;
}

function applyReviewView() {
    const on = isReviewMode && canShowReview();
    analysisView.classList.toggle('view-review', on);
    if (on) {
        // 보드 자리(summaryGraph) = 5단계 카드(헤더/Hero/차트/통계/CTA) 한 묶음.
        // 중간바와 패널은 CSS에서 숨김 처리하므로 여기서 별도로 건드리지 않는다.
        summaryGraphEl.innerHTML = renderReviewReport({
            analysisQueue,
            isUserWhite,
            gameInfo: buildGameHeaderInfo(),
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
    if (appMode === 'explore') {
        exitExplorationMode();
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
// 9. Helpers
// ==========================================

const BADGE_MAP = {
    'Brilliant':  { symbol: '!!', fontSize: '9px',  fontWeight: '900', color: '#fff',    bg: '#3A8560', borderColor: '#26614A' },
    'Great':      { symbol: '!',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: '#2D6E55', borderColor: '#1F5240' },
    'Best':       { symbol: '✦', fontSize: '10px', fontWeight: '700', color: '#1C1D1F', bg: '#FFFFFF', borderColor: '#D8DADE' },
    'Excellent':  { symbol: '✓', fontSize: '11px', fontWeight: '900', color: '#fff',    bg: '#6B8C3A', borderColor: '#4F6A28' },
    'Inaccuracy': { symbol: '?!', fontSize: '8px',  fontWeight: '700', color: '#fff',    bg: '#C99B2D', borderColor: '#9A7621' },
    'Mistake':    { symbol: '?',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: '#D97706', borderColor: '#A85A05' },
    'Blunder':    { symbol: '??', fontSize: '9px',  fontWeight: '700', color: '#fff',    bg: '#D03832', borderColor: '#A02828' },
    'Forced':     { symbol: '□',  fontSize: '11px', fontWeight: '700', color: '#fff',    bg: '#62646A', borderColor: '#43454B' },
};

function showPieceBadge(index) {
    const existing = boardContainer.querySelector('.piece-badge-square');
    if (existing) existing.remove();

    if (index < 0 || !analysisQueue[index]) return;

    const move = analysisQueue[index];
    if (!move.to || !move.classification) return;

    const config = BADGE_MAP[move.classification];
    if (!config) return; // 'Good' → no badge

    const fileIndex = move.to.charCodeAt(0) - 97; // 'a'=0 … 'h'=7
    const rank = parseInt(move.to[1]);             // 1-8

    const orientation = cg.state.orientation;
    let col, row;
    if (orientation === 'white') {
        col = fileIndex;
        row = 8 - rank;
    } else {
        col = 7 - fileIndex;
        row = rank - 1;
    }

    // 정사각형 래퍼: overflow: visible이어야 배지가 클리핑되지 않음
    const square = document.createElement('div');
    square.className = 'piece-badge-square';
    square.style.left = `${col / 8 * 100}%`;
    square.style.top = `${row / 8 * 100}%`;

    // 원형 배지 — border 대신 CSS box-shadow로 경계 표현 (iOS 알림 배지 스타일)
    const badge = document.createElement('div');
    badge.className = 'piece-badge';
    badge.textContent = config.symbol;
    badge.style.fontSize = config.fontSize;
    badge.style.fontWeight = config.fontWeight;
    badge.style.color = config.color;
    badge.style.background = config.bg;

    square.appendChild(badge);
    boardContainer.appendChild(square);
}

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

    setAppMode('simulate');
    setSimulationIndex(1);

    getEngine().stop();
    showReturnBtn();
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
            setSimulationIndex(parseInt(el.dataset.simIndex, 10));
            updateBoardForSimulation(simulationIndex);
        });
    });
}

// PWA Service Worker — 일시 비활성화 (베타 기간)
// 재활성화 시점은 Phase 3 이후 검토
if ('serviceWorker' in navigator) {
    // 기존 유저의 브라우저에 설치된 SW 전부 제거
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister());
    });

    // 기존 캐시 전부 삭제
    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(key => caches.delete(key));
        });
    }
}
