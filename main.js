import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { initHome, refreshHomeCounts, showOnboarding } from './home.js';
import { initDialogs, showAlert, showConfirm, showToast } from './dialogs.js';
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
    APP_MODES,
    appMode, explorationChess, explorationEngineLines, simulationQueue, simulationIndex, isPreviewMode, isReviewMode,
    setAppMode, setIsPreviewMode, setIsReviewMode, clearExplorationEngineLines, setExplorationLineAt,
    setSimulationQueue, pushSimulationQueueItem, setSimulationIndex,
} from './modes.js';
import { parseEvalData, getDests, convertPvToSan, parseAndLoadPgn, isValidFen, escapeHtml, parseOpeningFromPgn, getTier, TIERS, classifyMove } from './utils.js';
import { renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderReviewReport, buildPreviewCardHtml } from './ui.js';
import { addVaultItem, getMyUserId, ONBOARDING_KEY, COORDS_KEY, EVAL_MODE_KEY, computePgnHash, upsertAnalyzedGame, loadAnalysisCache, saveAnalysisCache, isCacheCompatible, ANALYSIS_CACHE_VERSION } from './storage.js';
import { collectAutoBlunders } from './autoBlunders.js';
import { initVault, isVaultDetailActive, isVaultPuzzleActive, getVaultDetailIndex, setVaultDetailIndex, flipVaultBoard, setVaultCoords, redrawVaultBoard, loadVaultData, loadBlunderListData, redrawVaultPuzzleBoard } from './vault.js';
import { initSavedGames, loadSavedGamesData } from './savedGames.js';
import { initInsights, loadInsightsData } from './insights.js';
import {
    initGemini, handleGeminiExplanation, renderAiTabContent,
    getIsGeminiEnabled, setIsGeminiEnabled, abortPendingGemini,
} from './gemini.js';
import { t, setLocale, getLocale } from './strings.js';
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
// USERNAME_LOG_DEDUP_KEY / logUsernameToServer / homeRecentLabel은 home.js로 이전.

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
// View Navigation Elements
const homeView = document.getElementById('homeView');
const analysisView = document.getElementById('analysisView');
const backBtn = document.getElementById('backBtn');

// Live Input Action Bar + Paste Modal
const liveActionBar = document.getElementById('liveActionBar');
const liveUndoBtn = document.getElementById('liveUndoBtn');
const liveResetBtn = document.getElementById('liveResetBtn');
const livePastePgnBtn = document.getElementById('livePastePgnBtn');
const livePasteModal = document.getElementById('livePasteModal');
const livePasteTextarea = document.getElementById('livePasteTextarea');
const cancelLivePasteBtn = document.getElementById('cancelLivePasteBtn');
const confirmLivePasteBtn = document.getElementById('confirmLivePasteBtn');

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
const LIVE_INPUT_DEPTH = 12; // 라이브 입력 모드 엔진 depth 락 — 렉 방지용 고정값
let lastEvalRenderTime = 0; // 엔진 UI 렌더링 스로틀링용 타임스탬프
const EVAL_RENDER_THROTTLE = 100; // UI 업데이트 제한 시간(ms)
// isGeminiLoading, geminiAbortController, isGeminiEnabled 는 gemini.js로 이전.
let isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
// home/onboarding 상태 (cachedHomeGames, homeTimeClassFilter, homeProfileRatings 등)는 home.js로 이전.

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
}

// 단일 엔진(stockfish)을 쓰는 모드들 — 분석 화면이 보드 자유 입력으로 동작.
// SIMULATE는 엔진 PV를 따라가는 별개 모드라 제외.
function isExploreLikeMode() {
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
        setLiveInputControls(false);
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

// 홈/온보딩 — home.js로 이전. handlePgnReviewStart는 hoisted function declaration이라 안전.
initHome({ syncBottomNav, SCREENS, handlePgnReviewStart });
initDialogs();

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
    el.textContent = '—';
    try {
        // /api/version은 Vercel env(VERCEL_GIT_COMMIT_AUTHOR_DATE)를 그대로 노출.
        // GitHub API rate limit / 외부 의존 / "Failed to fetch" 메시지 폭주 회피.
        const res = await fetch('/api/version');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data?.commitDate) {
            // 로컬 dev나 미배포 환경 — 빈 값. 사용자에게 알 필요 없음.
            _lastPushFetched = true;
            return;
        }
        const d = new Date(data.commitDate);
        el.textContent = d.toLocaleString();
        _lastPushFetched = true;
    } catch (e) {
        // Edge Function 미배포 / 네트워크 단절. 조용히 폴백.
        el.textContent = '—';
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
    logoutBtn.addEventListener('click', async () => {
        const ok = await showConfirm(t('settings_logout_confirm'), {
            okLabel: t('settings_logout'),
            destructive: true,
        });
        if (!ok) return;
        // 내 계정 식별자 + 온보딩 완료 플래그만 초기화.
        // VAULT_KEY / SAVED_GAMES_KEY는 유지 — 같은 ID로 재로그인 시 복구 가능해야 함.
        try {
            localStorage.removeItem('blundermate_user_id');
            localStorage.removeItem('blundermate_platform');
            localStorage.removeItem(ONBOARDING_KEY);
        } catch (e) {
            console.error('Logout cleanup failed:', e);
        }
        settingsModal.classList.add('hidden');
        showOnboarding();
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
    { modal: tierModal, closeBtn: closeTierModalBtn },
    { modal: saveChoiceModal, closeBtn: cancelChoiceBtn, noBg: true },
    { modal: saveModal, closeBtn: cancelSaveBtn, noBg: true },
    { modal: livePasteModal, closeBtn: cancelLivePasteBtn },
];

modalConfigs.forEach(({ modal, closeBtn, noBg }) => {
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', () => closeModal(modal));
    if (!noBg) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
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
// 피드백 진입점은 설정 모달 안의 #settingsFeedbackBtn으로 통일 (홈 FAB는 리디자인 v2에서 제거됨).
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
// 단일 엔진을 새 fen 위에서 재시작 + UI 표지를 'Exploring' 상태로 초기화.
// stop() 먼저 — 직전 검색이 진행 중이라도 새 검색이 깔끔히 시작되게.
// depth는 라이브 입력 모드면 12 고정(렉 방지), 그 외 explore는 사용자 설정 depth.
function kickExploreEngine(fen) {
    getEngine().stop();
    clearExplorationEngineLines();
    updateTopEvalDisplay('...', 'Exploring', isUserWhite);
    engineLinesContainer.innerHTML = `<div class="container-message">${t('analysis_variation')}</div>`;
    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = t('analysis_exploring');
    const depth = appMode === APP_MODES.LIVE_INPUT ? LIVE_INPUT_DEPTH : getDepth();
    getEngine().analyzeFen(fen, depth);
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
    explorationChess.load(START_FEN);

    cg.set({
        fen: START_FEN,
        orientation: 'white',
        turnColor: 'white',
        lastMove: [],
        movable: { color: 'white', free: false, dests: getDests(explorationChess) },
        drawable: { autoShapes: [] }
    });
    forceRedraw(cg);

    setLiveInputControls(true);
    kickExploreEngine(START_FEN);
}

// 라이브 모드의 보드를 explorationChess의 현 상태로 동기.
function syncLiveBoard() {
    const turnColor = explorationChess.turn() === 'w' ? 'white' : 'black';
    const hist = explorationChess.history({ verbose: true });
    const lastMove = hist.length > 0 ? [hist[hist.length - 1].from, hist[hist.length - 1].to] : [];
    cg.set({
        fen: explorationChess.fen(),
        turnColor,
        lastMove,
        movable: { color: turnColor, free: false, dests: getDests(explorationChess) },
        drawable: { autoShapes: [] }
    });
}

// 라이브 상태를 idx 위치로 통일 (explorationChess replay + 보드 갱신 + 엔진 라인 캐시 또는 재시작).
// idx=-1=시작, 0..N-1=각 수 직후. navigate/undo/reset 공통 로직.
function syncLiveStateToIndex(idx) {
    setCurrentlyViewedIndex(idx);
    explorationChess.reset();
    for (let i = 0; i <= idx; i++) {
        const m = analysisQueue[i];
        explorationChess.move({ from: m.from, to: m.to, promotion: m.promotion });
    }
    syncLiveBoard();
    showPieceBadge(idx);

    const cached = idx >= 0 ? analysisQueue[idx]?.engineLines : null;
    if (cached && cached[0]) {
        // 캐시된 라인 재사용 — 엔진 재시작 없이 즉시 표시.
        getEngine().stop();
        clearExplorationEngineLines();
        for (let i = 0; i < cached.length; i++) setExplorationLineAt(i, cached[i]);
        renderEngineLines(engineLinesContainer, cached.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
        const cls = analysisQueue[idx].classification || 'Exploring';
        updateTopEvalDisplay(cached[0].scoreStr, cls, isUserWhite);
        analysisStatus.className = 'tag engine-ready hidden';
        analysisStatus.textContent = '';
    } else {
        // 캐시 없음 (시작 포지션 또는 분석 미완료) → 엔진 재시작.
        kickExploreEngine(explorationChess.fen());
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

openBoardInputBtn.addEventListener('click', openLiveInput);
backBtn.addEventListener('click', () => { history.back(); });

// 분석 화면 UI를 그대로 유지 — Save/AI 토글/분류 라벨/구분선 모두 노출.
// 라이브 전용 액션바(Undo/Reset/Paste)는 LIVE_INPUT일 때만 노출.
function setLiveInputControls(active) {
    liveActionBar?.classList.toggle('hidden', !active);
}

function openLivePasteModal() {
    if (!livePasteModal) return;
    livePasteTextarea.value = '';
    livePasteModal.classList.remove('hidden');
    setTimeout(() => livePasteTextarea.focus(), 50);
}

if (livePastePgnBtn) livePastePgnBtn.addEventListener('click', openLivePasteModal);
if (liveUndoBtn) liveUndoBtn.addEventListener('click', liveInputUndo);
if (liveResetBtn) liveResetBtn.addEventListener('click', liveInputReset);

if (confirmLivePasteBtn) confirmLivePasteBtn.addEventListener('click', () => {
    const text = (livePasteTextarea.value || '').trim();
    if (!text) return;

    closeModal(livePasteModal);

    if (isValidFen(text)) {
        pendingAnalysisCallback = (isWhite) => handleFenReviewStart(text, isWhite);
        colorChoiceModal.classList.remove('hidden');
        return;
    }
    pgnInput.value = text;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

analyzeBtn.addEventListener('click', () => {
    if (!pgnInput.value.trim()) return;
    pendingAnalysisCallback = (isWhite) => handlePgnReviewStart(null, isWhite);
    colorChoiceModal.classList.remove('hidden');
});

// --- Move Navigation Helpers ---
function handlePrevMove() {
    if (appMode === APP_MODES.SIMULATE) {
        setSimulationIndex(Math.max(0, simulationIndex - 1));
        updateBoardForSimulation(simulationIndex);
        return;
    }
    // 라이브 입력 모드: prev = 직전 수 위치로 navigate (history 보존).
    // 중간에서 다른 수를 두면 그 시점에서 fork(handleExplorationMove의 truncate 분기).
    if (appMode === APP_MODES.LIVE_INPUT) {
        liveInputNavigate(-1);
        return;
    }
    if (appMode === APP_MODES.EXPLORE) {
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
    if (appMode === APP_MODES.SIMULATE) {
        setSimulationIndex(Math.min(simulationQueue.length - 1, simulationIndex + 1));
        updateBoardForSimulation(simulationIndex);
        return;
    }
    // 라이브 입력 모드: next = 다음 수 위치로 navigate (history 끝까지).
    if (appMode === APP_MODES.LIVE_INPUT) {
        liveInputNavigate(1);
        return;
    }
    if (appMode === APP_MODES.EXPLORE) {
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
    // 라이브 입력 모드는 메인 chess가 비어 있고 explorationChess만 의미 있음.
    getChess: () => appMode === APP_MODES.LIVE_INPUT ? explorationChess : chess,
});
initInsights();

function buildExplorationMovesQueue() {
    const history = explorationChess.history({ verbose: true });
    return history.map((m, i) => ({
        san: m.san,
        moveNumber: Math.floor(i / 2) + 1,
        isWhite: i % 2 === 0,
    }));
}

movesOverlayBtn.addEventListener('click', () => {
    // 라이브 입력 모드: 사용자가 둔 수만 explorationChess에서 추출 (분석 큐 없음).
    if (appMode === APP_MODES.LIVE_INPUT) {
        showMovesOverlay({
            getPgn: () => explorationChess.pgn(),
            renderBody: () => renderMovesTable(movesBody, buildExplorationMovesQueue(), () => closeMovesOverlay()),
        });
        return;
    }
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
movesOverlayCloseBtn.addEventListener('click', closeMovesOverlay);
movesOverlay.addEventListener('click', (e) => {
    if (e.target === movesOverlay) closeMovesOverlay();
});

copyPgnBtn.addEventListener('click', () => {
    const pgn = _overlayGetPgn ? _overlayGetPgn() : chess.pgn();
    if (!pgn) return;
    navigator.clipboard.writeText(pgn).catch(() => prompt('PGN', pgn));
    showToast(t('copied'));
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


// --- Save Move to Vault Logic ---
saveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.remove('hidden');
});

choiceSaveMoveBtn.addEventListener('click', () => {
    saveChoiceModal.classList.add('hidden');

    // 라이브 입력 모드: explorationChess의 마지막 수를 저장 (분류 없음, bestMove는 현재 위치의 top PV).
    if (appMode === APP_MODES.LIVE_INPUT) {
        const hist = explorationChess.history({ verbose: true });
        if (hist.length === 0) {
            showAlert(t('analysis_no_save_start'));
            return;
        }
        const last = hist[hist.length - 1];
        const moveIdx = hist.length - 1;
        const isWhiteMove = moveIdx % 2 === 0;
        const moveNumber = Math.floor(moveIdx / 2) + 1;
        const moveNumberStr = moveNumber + (isWhiteMove ? '. ' : '... ');
        saveMoveText.textContent = moveNumberStr + last.san;

        // bestMove는 "이 수 다음에 둘 만한 수" — 현재 explorationEngineLines[0]의 첫 수.
        // 메인 분석 모드의 "직전 포지션 best"와 의미가 다름(여기선 직전 캐시가 없음).
        const liveBest = explorationEngineLines[0]?.pv?.split(' ')[0] || '';
        currentBestMoveForVault = liveBest;
        saveBestMoveText.textContent = liveBest ? t('vault_engine_suggested').replace('{move}', liveBest) : '';

        // prevFen 복원 — 마지막 수만 빼고 나머지 history replay.
        const tempChess = new Chess();
        for (let i = 0; i < moveIdx; i++) {
            tempChess.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
        }
        vaultSnapshot = {
            moveIndex: moveIdx,
            move: { san: last.san, fen: explorationChess.fen() },
            fen: explorationChess.fen(),
            prevFen: tempChess.fen(),
            san: last.san,
            bestMove: liveBest,
            moveNumber,
            isWhite: isWhiteMove,
            classification: null,
            engineLines: explorationEngineLines.slice(),
        };
        saveCategory.value = 'positional';
        saveNotes.value = '';
        saveModal.classList.remove('hidden');
        return;
    }

    if (currentlyViewedIndex < 0 || !analysisQueue[currentlyViewedIndex]) {
        showAlert(t('analysis_no_save_start'));
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

    // 라이브 입력 모드는 chess(메인 게임)이 비어있고 explorationChess만 의미 있음.
    const sourcePgn = appMode === APP_MODES.LIVE_INPUT ? explorationChess.pgn() : chess.pgn();

    const vaultItem = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        pgn: sourcePgn,
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

    showToast(t('saved_games_saved'));
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

function handleExplorationMove(orig, dest) {
    if (isPreviewMode) return;
    if (appMode === APP_MODES.SIMULATE) {
        setAppMode(APP_MODES.EXPLORE);
        explorationChess.load(simulationQueue[simulationIndex].fen);
    } else if (!isExploreLikeMode()) {
        // MAIN → EXPLORE 첫 진입: 메인 라인의 현재 위치를 base로 잡고 returnMainLine 버튼 표시.
        // LIVE_INPUT은 진입 시 이미 explorationChess에 START_FEN이 로드돼 있으므로 이 블록 건너뜀.
        setAppMode(APP_MODES.EXPLORE);
        showReturnBtn();

        let baseFen = START_FEN;
        if (currentlyViewedIndex >= 0 && analysisQueue[currentlyViewedIndex]) baseFen = analysisQueue[currentlyViewedIndex].fen;
        else if (chess.header().FEN) baseFen = chess.header().FEN;

        explorationChess.load(baseFen);
    }
    // 엔진 정지 + 라인 클리어는 kickExploreEngine이 처리.

    // 라이브 모드 fork 처리: 사용자가 중간 위치를 보다가 새 수를 두면 그 시점에서 history 분기.
    // currentlyViewedIndex 이후의 큐 항목 모두 버리고 explorationChess는 이미 navigate 시 그 위치로 replay 되어 있음.
    if (appMode === APP_MODES.LIVE_INPUT && currentlyViewedIndex < analysisQueue.length - 1) {
        analysisQueue.length = currentlyViewedIndex + 1;
    }

    const moveRes = explorationChess.move({ from: orig, to: dest, promotion: 'q' });
    if (!moveRes) {
        cg.set({ fen: explorationChess.fen() });
        return;
    }

    // 라이브 입력 모드: 둔 수를 analysisQueue에 push해서 classifyMove가 직전 포지션 평가를 참조 가능하게.
    // engineLines는 새 분석이 끝나면 onBestMove에서 채워짐.
    if (appMode === APP_MODES.LIVE_INPUT) {
        const moveIdx = analysisQueue.length;
        analysisQueue.push({
            fen: explorationChess.fen(),
            san: moveRes.san,
            from: moveRes.from,
            to: moveRes.to,
            promotion: moveRes.promotion,
            turn: explorationChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(moveIdx / 2) + 1,
            isWhite: moveIdx % 2 === 0,
            engineLines: [],
        });
        setCurrentlyViewedIndex(moveIdx);
    }

    const turnColor = explorationChess.turn() === 'w' ? 'white' : 'black';
    cg.set({
        fen: explorationChess.fen(),
        turnColor,
        movable: { color: turnColor, free: false, dests: getDests(explorationChess) }
    });

    kickExploreEngine(explorationChess.fen());
}

function exitExplorationMode() {
    setAppMode(APP_MODES.MAIN);
    hideReturnBtn();
    clearExplorationEngineLines();
    setSimulationQueue([]);

    // 풀 기반 배치는 단일 엔진과 독립적으로 진행되므로 별도 재개 불필요.
    analysisStatus.className = 'tag engine-ready hidden';
    analysisStatus.textContent = '';
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
        if (!isExploreLikeMode()) return;

        // Stale-info 필터: stop() 직후 워커가 OLD 포지션의 잔여 info를 emit하는 경우가 있음.
        // PV 첫 수가 현재 explorationChess에서 합법이 아니면(놓인 칸에 자기 차례 기물 없음) 버린다.
        const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
        if (firstUci && firstUci.length >= 4) {
            const fromSq = firstUci.slice(0, 2);
            const piece = explorationChess.get(fromSq);
            const turn = explorationChess.turn();
            if (!piece || piece.color !== turn) return;
        }

        const isBlackToMove = explorationChess.turn() === 'b';
        const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove);

        const lineIndex = evalData.multipv - 1;
        const sanPv = convertPvToSan(evalData.pv, explorationChess.fen());
        setExplorationLineAt(lineIndex, { scoreStr, scoreNum, pv: sanPv, uci: firstUci });

        const now = Date.now();
        if (explorationEngineLines[0] && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
            lastEvalRenderTime = now;
            requestAnimationFrame(() => {
                renderEngineLines(engineLinesContainer, explorationEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                // 라이브 모드에서 분류 산출 전엔 Exploring 메타 라벨로 라벨 영역 비움.
                // 분류는 onBestMove에서 fix됨.
                const cls = (appMode === APP_MODES.LIVE_INPUT && analysisQueue.length > 0)
                    ? (analysisQueue[analysisQueue.length - 1].classification || 'Exploring')
                    : 'Exploring';
                updateTopEvalDisplay(explorationEngineLines[0].scoreStr, cls, isUserWhite);
            });
        }
    },
    onBestMove: () => {
        if (!isExploreLikeMode()) return;
        analysisStatus.className = 'tag engine-ready hidden';
        analysisStatus.textContent = '';

        // 라이브 모드: 새 분석 완료 → 마지막 수 분류. 단, lines가 stale 필터 통과해 채워졌을 때만.
        if (appMode === APP_MODES.LIVE_INPUT && analysisQueue.length > 0 && explorationEngineLines[0]) {
            const idx = analysisQueue.length - 1;
            analysisQueue[idx].engineLines = explorationEngineLines.slice();
            const cls = classifyMove(idx, analysisQueue);
            analysisQueue[idx].classification = cls;
            updateTopEvalDisplay(explorationEngineLines[0].scoreStr, cls, isUserWhite);
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
    if (!chess.load(fenText)) {
        showAlert(t('analysis_invalid_pgn'));
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
    analysisView.classList.remove('hidden');

    // 이전 탐색(Exploration) / 라이브 입력 / 시뮬레이션 모드 상태 완전 초기화.
    // startNewAnalysis는 ANALYSIS 화면 안에서 호출되어 cleanupAnalysis(renderScreen 분기)를 통과 안 함 →
    // 라이브 입력 모드의 UI 토글은 여기서 직접 해제 (paste→PGN 분석 경로의 핵심 cleanup 지점).
    if (appMode === APP_MODES.LIVE_INPUT) setLiveInputControls(false);
    setAppMode(APP_MODES.MAIN);
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
    if (appMode === APP_MODES.EXPLORE) {
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
// 8. Helpers
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
    if (isExploreLikeMode()) {
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

    setAppMode(APP_MODES.SIMULATE);
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
