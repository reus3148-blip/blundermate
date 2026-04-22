import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { fetchRecentGames, fetchPlayerProfile } from './chessApi.js';
import { StockfishEngine } from './engine.js';
import { parseEvalData, getDests, convertPvToSan, classifyMove, parseAndLoadPgn, isValidFen, escapeHtml, parseOpeningFromPgn, formatTimeControl, formatRelativeDate } from './utils.js';
import { renderMovesTable, updateUIWithEval, highlightActiveMove, renderEngineLines, updateTopEvalDisplay, renderSummaryGraph, renderSummaryReport } from './ui.js';
import { addVaultItem, getSavedGames, setMyUserId, getMyUserId, ONBOARDING_KEY, COORDS_KEY, GEMINI_KEY, EVAL_MODE_KEY } from './storage.js';
import { initVault, initHomeVaultBadge, isVaultDetailActive, getVaultDetailIndex, setVaultDetailIndex, flipVaultBoard, setVaultCoords, redrawVaultBoard } from './vault.js';
import { initSavedGames, openSaveGameModalForPgn } from './savedGames.js';
import { createGeminiHandler } from './gemini.js';
import { t, setLocale, getLocale } from './strings.js';

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
const previewStartBtn = document.getElementById('previewStartBtn');
const ctrlCenter = document.querySelector('.ctrl-center');

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

// Settings Elements
const settingsBtn = document.getElementById('homeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');
const coordsToggle = document.getElementById('coordsToggle');
const geminiToggle = document.getElementById('geminiToggle');

// Feedback Elements
const feedbackBtn = document.getElementById('feedbackBtn');
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
const ANALYSIS_DEPTH = 12;
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
let vaultSnapshot = null; // 🔖 탭 시점의 수 데이터 스냅샷 (모달 열린 동안 고정)
let appMode = 'main'; // 'main', 'explore', 'simulate'
let explorationChess = new Chess();
let explorationEngineLines = [];
let simulationQueue = [];
let simulationIndex = -1;
let inputChess = new window.Chess(); // 수동 보드 입력용 체스 인스턴스
let inputCg; // 수동 보드 입력용 체스그라운드 인스턴스
let lastEvalRenderTime = 0; // 엔진 UI 렌더링 스로틀링용 타임스탬프
const EVAL_RENDER_THROTTLE = 100; // UI 업데이트 제한 시간(ms)
let isPreviewMode = false; // 분석 미리보기 상태 (엔진 미시작)
let isGeminiLoading = false; // Gemini API 중복 호출 방지용 플래그
let geminiAbortController = null; // Gemini API 요청 취소용 컨트롤러
let isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
let isGeminiEnabled = localStorage.getItem(GEMINI_KEY) !== 'false';
let cachedHomeGames = [];
let activeTimeClassFilter = null;

// ==========================================
// 2-2. History-based Navigation
// ==========================================
const SCREENS = {
    HOME: 'home',
    ANALYSIS: 'analysis',
    INPUT: 'input',
    VAULT_LIST: 'vault_list',
    VAULT_DETAIL: 'vault_detail',
    SAVED_GAMES: 'saved_games',
};

let _currentScreen = SCREENS.HOME;

const vaultViewNav = document.getElementById('vaultView');
const vaultDetailViewNav = document.getElementById('vaultDetailView');
const savedGamesViewNav = document.getElementById('savedGamesView');

function navigateTo(screen, state = {}) {
    console.log('[Nav] push:', screen, state);
    _currentScreen = screen;
    history.pushState({ screen, ...state }, '', `#${screen}`);
}

function hideAllViews() {
    homeView.classList.add('hidden');
    analysisView.classList.add('hidden');
    analysisView.classList.remove('view-summary');
    inputView.classList.add('hidden');
    vaultViewNav.classList.add('hidden');
    vaultDetailViewNav.classList.add('hidden');
    savedGamesViewNav.classList.add('hidden');
}

function cleanupAnalysis() {
    if (isPreviewMode) {
        isPreviewMode = false;
        removePreviewControls();
    }
    if (stockfish) stockfish.stop();
    isAnalyzing = false;
    isWaitingForStop = false;
    pendingQueue = null;
    analysisQueue = [];
}

function renderScreen(screen) {
    console.log('[Nav] render:', screen);
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
            break;
        case SCREENS.VAULT_DETAIL:
            vaultDetailViewNav.classList.remove('hidden');
            break;
        case SCREENS.SAVED_GAMES:
            savedGamesViewNav.classList.remove('hidden');
            break;
        default:
            homeView.classList.remove('hidden');
            break;
    }
}

window.addEventListener('popstate', (event) => {
    console.log('[Nav] pop:', event.state);
    const state = event.state;
    if (state && state.screen) {
        renderScreen(state.screen);
    } else {
        renderScreen(SCREENS.HOME);
    }
});

history.replaceState({ screen: SCREENS.HOME }, '', '#home');

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
        homeRecentLabel.textContent = '';
        homeRecentLabel.classList.add('hidden');
        backToMyGamesBtn.classList.add('hidden');
    }
}

function renderHomeGamesList(games, displayUser) {
    const list = document.getElementById('homeRecentList');
    const section = document.getElementById('homeRecentSection');
    if (!list) return;

    const filtered = activeTimeClassFilter
        ? games.filter(g => g.time_class === activeTimeClassFilter)
        : games;

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
        const isWhite = game.white.username.toLowerCase() === userLower;
        const mySide = isWhite ? game.white : game.black;
        const oppSide = isWhite ? game.black : game.white;
        const opponent = escapeHtml(oppSide.username);
        const resultCode = mySide.result;

        let resultKey, resultClass;
        if (resultCode === 'win') {
            resultKey = 'game_result_win'; resultClass = 'win';
        } else if (['checkmated', 'timeout', 'resigned', 'abandoned'].includes(resultCode)) {
            resultKey = 'game_result_loss'; resultClass = 'loss';
        } else {
            resultKey = 'game_result_draw'; resultClass = 'draw';
        }

        const sideClass = isWhite ? 'white' : 'black';
        const oppRating = oppSide.rating ? ` (${oppSide.rating})` : '';

        const date = game.end_time ? formatRelativeDate(game.end_time, dateStrings) : '';
        const moveCount = game.pgn ? (game.pgn.match(/\d+\./g) || []).length : 0;
        const tc = game.time_control ? formatTimeControl(game.time_control) : '';
        const meta = [date, moveCount ? `${moveCount}${t('moves_suffix')}` : '', tc].filter(Boolean).join(' · ');

        const card = document.createElement('div');
        card.className = `home-recent-card ${sideClass}`;
        card.innerHTML = `
            <div class="home-recent-info">
                <div class="home-recent-opponent">vs ${opponent}<span class="home-recent-rating">${escapeHtml(oppRating)}</span></div>
                <div class="home-recent-meta">${escapeHtml(meta)}</div>
            </div>
            <div class="home-recent-result home-recent-result--${resultClass}">${t(resultKey)}</div>
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

function loadHomeRecentGames(overrideUsername = null) {
    const displayUser = overrideUsername || getMyUserId();
    const section = document.getElementById('homeRecentSection');
    const list = document.getElementById('homeRecentList');
    if (!displayUser || !section || !list) return;

    viewingUserId = overrideUsername || null;
    activeTimeClassFilter = null;
    document.querySelectorAll('.profile-rating-col[data-time-class]').forEach(c => c.classList.remove('active'));
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
            return;
        }
        cachedHomeGames = games;
        renderHomeGamesList(games, displayUser);
    }).catch(() => {
        cachedHomeGames = [];
        if (overrideUsername) {
            list.innerHTML = `<div class="container-message container-message--error">${t('games_fetch_error')}</div>`;
        } else {
            section.classList.add('hidden');
        }
    });
}

function updateHomeHeader() {
    const userId = getViewingUserId();
    const heroSection = document.querySelector('.home-hero');
    const inputWrap = document.querySelector('.username-input-wrap');
    const heroTitle = document.querySelector('.hero-title');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const profileName = document.getElementById('profileName');
    const profileRatings = document.getElementById('profileRatings');

    if (userId) {
        heroSection.classList.add('home-hero--user');
        profileName.classList.remove('hidden');
        profileName.textContent = userId;
        profileName.classList.remove('username-md', 'username-sm');
        if (userId.length > 15) profileName.classList.add('username-sm');
        else if (userId.length > 10) profileName.classList.add('username-md');
        profileRatings.classList.remove('hidden');
        document.getElementById('profileRapid').textContent = '—';
        document.getElementById('profileBlitz').textContent = '—';
        document.getElementById('profileBullet').textContent = '—';
        inputWrap.classList.add('username-input-wrap--small');
        usernameInput.placeholder = t('home_search_other');

        fetchPlayerProfile(userId).then(profile => {
            if (!profile) return;
            const { ratings } = profile;
            document.getElementById('profileRapid').textContent = ratings.rapid || '—';
            document.getElementById('profileBlitz').textContent = ratings.blitz || '—';
            document.getElementById('profileBullet').textContent = ratings.bullet || '—';
            document.querySelectorAll('.profile-rating-col[data-time-class]').forEach(col => {
                const tc = col.dataset.timeClass;
                col.classList.toggle('disabled', !ratings[tc]);
                col.classList.remove('active');
            });
        });
    } else {
        heroSection.classList.remove('home-hero--user');
        profileName.classList.add('hidden');
        profileRatings.classList.add('hidden');
        heroTitle.setAttribute('data-i18n', 'heroTitle');
        heroTitle.textContent = t('heroTitle');
        heroSubtitle.classList.remove('hidden');
        heroSubtitle.setAttribute('data-i18n', 'heroSubtitle');
        heroSubtitle.textContent = t('heroSubtitle');
        inputWrap.classList.remove('username-input-wrap--small');
        usernameInput.placeholder = t('usernamePlaceholder');
    }
}

// ── Time Class Filter Tabs ────────────────────────────────────────
document.querySelectorAll('.profile-rating-col[data-time-class]').forEach(col => {
    col.addEventListener('click', () => {
        if (col.classList.contains('disabled')) return;
        const tc = col.dataset.timeClass;
        if (activeTimeClassFilter === tc) {
            activeTimeClassFilter = null;
            col.classList.remove('active');
        } else {
            activeTimeClassFilter = tc;
            document.querySelectorAll('.profile-rating-col[data-time-class]').forEach(c => c.classList.remove('active'));
            col.classList.add('active');
        }
        const displayUser = viewingUserId || getMyUserId();
        if (cachedHomeGames.length > 0 && displayUser) {
            renderHomeGamesList(cachedHomeGames, displayUser);
        }
    });
});

// ── Onboarding ─────────────────────────────────────────────────────
const onboardingView = document.getElementById('onboardingView');
const onboardingUsernameInput = document.getElementById('onboardingUsernameInput');
const onboardingSubmitBtn = document.getElementById('onboardingSubmitBtn');
const onboardingSkipBtn = document.getElementById('onboardingSkipBtn');

function finishOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    onboardingView.classList.add('hidden');
    homeView.classList.remove('hidden');
    refreshHomeCounts();
}

onboardingSubmitBtn.addEventListener('click', () => {
    const username = onboardingUsernameInput.value.trim();
    if (username) setMyUserId(username);
    finishOnboarding();
});

onboardingUsernameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') onboardingSubmitBtn.click();
});

onboardingSkipBtn.addEventListener('click', finishOnboarding);

if (!localStorage.getItem(ONBOARDING_KEY)) {
    homeView.classList.add('hidden');
    onboardingView.classList.remove('hidden');
} else {
    refreshHomeCounts();
}

applyLocale();

// ==========================================
// 3-2c. Vault Module Init (deferred — depends on overlay helpers defined later)
// ==========================================
// initVault() is called after showMovesOverlay/closeMovesOverlay are defined (see below)

// ==========================================
// 3-3. Settings UI
// ==========================================
geminiToggle.checked = isGeminiEnabled;

geminiToggle.addEventListener('change', (e) => {
    isGeminiEnabled = e.target.checked;
    localStorage.setItem(GEMINI_KEY, isGeminiEnabled);
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
    });
}

function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
    if (modal === saveModal) vaultSnapshot = null;
}

const modalConfigs = [
    { modal: settingsModal, closeBtn: document.getElementById('closeSettingsBtn') },
    { modal: feedbackModal, closeBtn: cancelFeedbackBtn },
    { modal: feedbackModal, closeBtn: closeFeedbackBtn },
    { modal: userSearchModal, closeBtn: closeUserSearchBtn },
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

openBoardInputBtn.addEventListener('click', openInputView);

inputViewBackBtn.addEventListener('click', () => {
    history.back();
});

function doUndoInput() {
    inputChess.undo();
    updateInputBoard();
}
inputViewUndoBtnBottom.addEventListener('click', doUndoInput);
inputViewResetBtn.addEventListener('click', () => {
    inputChess.reset();
    inputBoardPgn.value = '';
    updateInputBoard();
});

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
        return;
    }
    // PGN 파싱 실패 시 FEN으로 시도 — 보드만 갱신, 수는 비어있음
    if (isValidFen(text)) {
        const fenChess = new window.Chess();
        fenChess.load(text);
        inputChess = fenChess;
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
        simulationIndex = Math.max(0, simulationIndex - 1);
        updateBoardForSimulation(simulationIndex);
        return;
    }
    if (analysisQueue.length === 0) return;
    // -1 = 시작 포지션(0수). 여기서는 승률 그래프 + 리포트로 교체됨.
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
    if (isPreviewMode) startAnalysisFromPreview();
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

function showMovesOverlay({ getPgn, renderBody } = {}) {
    _overlayGetPgn = getPgn || null;
    if (renderBody) renderBody();
    movesOverlay.classList.add('open');
}
function closeMovesOverlay() {
    movesOverlay.classList.remove('open');
    _overlayGetPgn = null;
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
    navigateTo,
});

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
}));
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
const moveClassLabel = document.getElementById('moveClassLabel');
const winChanceDisplay = document.getElementById('winChanceDisplay');
const ctrlCenterSeparator = document.querySelector('.ctrl-center .bar-separator');

function showReturnBtn() {
    returnMainLineBtn.classList.remove('hidden');
    moveClassLabel.classList.add('hidden');
    winChanceDisplay.classList.add('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.add('hidden');
}

function hideReturnBtn() {
    returnMainLineBtn.classList.add('hidden');
    moveClassLabel.classList.remove('hidden');
    winChanceDisplay.classList.remove('hidden');
    if (ctrlCenterSeparator) ctrlCenterSeparator.classList.remove('hidden');
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
    console.log('[Vault snapshot]', { snapIndex, fen: vaultSnapshot.fen, san: vaultSnapshot.san });

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
    console.log('[Vault save]', { moveIndex: snap.moveIndex, fen: snap.fen, san: snap.san });

    let gameTitle = '';
    const h = chess?.header?.();
    if (h && h.White && h.Black && h.White !== '?' && h.Black !== '?') {
        gameTitle = `${h.White} vs ${h.Black}`;
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
        engineLines: snap.engineLines
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
    }, 100); // 100ms 디바운스 적용
});

function handleExplorationMove(orig, dest) {
    if (isPreviewMode) return;
    if (appMode === 'simulate') {
        appMode = 'explore';
        explorationChess.load(simulationQueue[simulationIndex].fen);
        explorationEngineLines = [];
        stockfish.stop();
    } else if (appMode !== 'explore') {
        appMode = 'explore';
        showReturnBtn();
        
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
    updateTopEvalDisplay('...', 'Exploring', isUserWhite);
    engineLinesContainer.innerHTML = `<div class="container-message">${t('analysis_variation')}</div>`;
    
    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = t('analysis_exploring');
    stockfish.analyzeFen(explorationChess.fen(), ANALYSIS_DEPTH);
}

function exitExplorationMode() {
    appMode = 'main';
    hideReturnBtn();
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
            const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove);

            const lineIndex = evalData.multipv - 1;
            const sanPv = convertPvToSan(evalData.pv, explorationChess.fen());
            const firstUci = evalData.pv ? evalData.pv.split(' ')[0] : '';
            explorationEngineLines[lineIndex] = { scoreStr, scoreNum, pv: sanPv, uci: firstUci };

            const now = Date.now();
            if (explorationEngineLines[0] && now - lastEvalRenderTime > EVAL_RENDER_THROTTLE) {
                lastEvalRenderTime = now;
                requestAnimationFrame(() => {
                    renderEngineLines(engineLinesContainer, explorationEngineLines.filter(Boolean), drawEngineArrow, clearEngineArrow, handleEngineLineClick);
                    updateTopEvalDisplay(explorationEngineLines[0].scoreStr, 'Exploring', isUserWhite);
                });
            }
            return;
        }

        const isBlackToMove = analysisQueue[currentAnalysisIndex].fen.includes(' b ');
        const currentMove = analysisQueue[currentAnalysisIndex];
        if (!currentMove) return; // 비동기 콜백 안전장치

        const { scoreStr, scoreNum } = parseEvalData(evalData, isBlackToMove);
        
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
                    updateTopEvalDisplay(currentEval, currentMove.classification, isUserWhite);
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
            updateTopEvalDisplay(currentEval, classification, isUserWhite);
            showPieceBadge(currentlyViewedIndex);
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
function handlePgnReviewStart(e = null, isWhiteGame = null, targetIndex = null, previewOnly = false) {
    isUserWhite = isWhiteGame !== null ? isWhiteGame : true;

    const pgnText = pgnInput.value.trim();
    if (!pgnText) return;

    console.log('PGN headers:', pgnText.split('\n')
        .filter(line => line.startsWith('['))
        .join('\n'));

    chess = new Chess();
    const result = parseAndLoadPgn(chess, pgnText);

    if (!result.success) {
        alert(t('analysis_invalid_pgn'));
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

    chess.history({ verbose: true }).forEach((move, index) => {
        tempChess.move(move);

        newQueue.push({
            fen: tempChess.fen(),
            san: move.san,
            from: move.from,
            to: move.to,
            turn: tempChess.turn() === 'w' ? 'b' : 'w',
            moveNumber: Math.floor(index / 2) + 1,
            isWhite: index % 2 === 0,
            engineLines: [],
        });
    });

    // Preview mode: show analysis view without starting engine
    if (previewOnly) {
        if (isAnalyzing || isWaitingForStop) {
            stockfish.stop();
            isAnalyzing = false;
            isWaitingForStop = false;
            pendingQueue = null;
            pendingTargetIndex = null;
        }
        startNewAnalysis(newQueue, targetIndex, true);
        return;
    }

    // Safe Engine Restart Logic
    if (isAnalyzing || isWaitingForStop) {
        analysisStatus.className = 'tag engine-loading';
        analysisStatus.textContent = t('analysis_stopping');
        pendingQueue = newQueue;
        pendingTargetIndex = targetIndex;
        isWaitingForStop = true;
        isAnalyzing = false;
        stockfish.stop();
        return;
    }

    startNewAnalysis(newQueue, targetIndex);
}

// FEN 단일 포지션 분석: 기보 없이 해당 포지션만 엔진으로 평가한다.
// 한 개의 isFenOnly 엔트리 큐를 구성해 기존 분석 파이프라인을 그대로 재사용한다.
function handleFenReviewStart(fenText, isWhiteGame) {
    isUserWhite = isWhiteGame !== null ? isWhiteGame : true;

    chess = new Chess();
    if (!chess.load(fenText)) {
        alert(t('analysis_invalid_pgn'));
        return;
    }
    pgnInput.value = chess.pgn();

    const parts = fenText.trim().split(/\s+/);
    const sideToMove = parts[1] || 'w';
    const fullMoveNumber = parseInt(parts[5]) || 1;

    const newQueue = [{
        fen: fenText,
        san: '',
        from: null,
        to: null,
        turn: sideToMove === 'w' ? 'b' : 'w',
        moveNumber: fullMoveNumber,
        isWhite: sideToMove === 'w',
        engineLines: [],
        isFenOnly: true,
    }];

    if (isAnalyzing || isWaitingForStop) {
        analysisStatus.className = 'tag engine-loading';
        analysisStatus.textContent = t('analysis_stopping');
        pendingQueue = newQueue;
        pendingTargetIndex = 0;
        isWaitingForStop = true;
        isAnalyzing = false;
        stockfish.stop();
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
    analysisView.classList.remove('hidden');

    // 이전 탐색(Exploration) 및 시뮬레이션 모드 상태 완전 초기화
    appMode = 'main';
    hideReturnBtn();
    analysisView.classList.remove('view-summary');

    // Force Chessground to recalculate board size for mobile
    forceRedraw(cg);

    analysisQueue = newQueue;
    analyzeBtn.disabled = true;

    renderMovesTable(movesBody, analysisQueue, (index) => {
        updateBoardPosition(index, analysisQueue[index].fen);
        closeMovesOverlay();
    });

    currentAnalysisIndex = 0;

    if (analysisQueue.length > 0) {
        persistentShapes = [];
        const initialFen = chess.header().FEN || 'start';
        cg.set({
            fen: initialFen,
            orientation: isUserWhite ? 'white' : 'black',
            drawable: { autoShapes: [] }
        });
        currentlyViewedIndex = -1;
        updateTopEvalDisplay('-', '', isUserWhite);
    }

    if (previewOnly) {
        isPreviewMode = true;
        renderPreviewCard();
        applyPreviewControls();
        return;
    }

    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = t('analysis_progress_start').replace('{total}', analysisQueue.length);

    if (analysisQueue.length > 0 && targetIndex != null && targetIndex >= 0 && targetIndex < analysisQueue.length) {
        updateBoardPosition(targetIndex, analysisQueue[targetIndex].fen);
    }

    if (isEngineReady) {
        processNextInQueue();
    }
}

// ==========================================
// 7-2. Analysis Preview Mode
// ==========================================
function renderPreviewCard() {
    const h = chess.header() || {};
    const white = h.White || '?';
    const black = h.Black || '?';
    const title = (white !== '?' && black !== '?') ? `${white} vs ${black}` : '';

    const metaParts = [];
    const datePart = h.Date;
    if (datePart && datePart !== '????.??.??') metaParts.push(datePart);
    metaParts.push(t('preview_moves').replace('{n}', analysisQueue.length));
    const metaLine = metaParts.join(' \u00b7 ');

    const { name: openingName, eco } = parseOpeningFromPgn(chess.pgn());
    let openingBlock = '';
    if (openingName) {
        openingBlock = `
            <div class="preview-card-opening">
                <div class="preview-card-opening-name">${escapeHtml(openingName)}</div>
                ${eco ? `<div class="preview-card-eco">ECO ${escapeHtml(eco)}</div>` : ''}
            </div>
        `;
    } else if (eco) {
        openingBlock = `
            <div class="preview-card-opening">
                <div class="preview-card-eco">ECO ${escapeHtml(eco)}</div>
            </div>
        `;
    }

    engineLinesContainer.innerHTML = `
        <div class="preview-card">
            ${title ? `<div class="preview-card-title">${escapeHtml(title)}</div>` : ''}
            <div class="preview-card-meta">${escapeHtml(metaLine)}</div>
            ${openingBlock}
        </div>
    `;
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

function startAnalysisFromPreview() {
    isPreviewMode = false;
    removePreviewControls();

    analysisStatus.className = 'tag engine-loading';
    analysisStatus.textContent = t('analysis_progress_start').replace('{total}', analysisQueue.length);

    if (isEngineReady) {
        processNextInQueue();
    }
}

function processNextInQueue() {
    if (currentAnalysisIndex >= analysisQueue.length) {
        analysisStatus.textContent = '';
        analysisStatus.className = 'tag hidden';
        analyzeBtn.disabled = false;

        // FEN 단일 포지션 분석은 요약 화면이 없으므로 그 자리에 머문다
        const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
        if (!isFenOnly) {
            // 분석 완료 시 체스판을 제일 첫 화면(시작 위치)으로 되돌리기
            updateBoardPosition(-1, chess.header().FEN || 'start');
        }
        return;
    }

    isAnalyzing = true;
    const pos = analysisQueue[currentAnalysisIndex];
    currentEval = '';
    
    analysisStatus.textContent = t('analysis_progress').replace('{current}', currentAnalysisIndex + 1).replace('{total}', analysisQueue.length);
    
    updateBoardPosition(currentAnalysisIndex, pos.fen);
    
    // Ensure engine is fully ready before sending position
    // If not ready, we skip sending 'go' and rely on onReady callback
    if (!isEngineReady) {
        analysisStatus.textContent = t('analysis_waiting_engine');
        isAnalyzing = false; // 엔진 준비 콜백(onReady)에서 큐를 정상적으로 재개할 수 있도록 상태 해제 (교착 상태 방지)
        return;
    }

    // 일관된 분석을 위해 엔진 깊이(Depth)를 12로 고정
    stockfish.analyzeFen(pos.fen, ANALYSIS_DEPTH);
}

// ==========================================
// 8. UI Rendering
// ==========================================
// 0수(시작 포지션) 상태에서 체스보드 자리를 승률 그래프로, 하단 패널을 리포트로 교체한다.
// 분석 큐가 비어있거나 preview/explore/simulate 모드에서는 진입하지 않는다.
const summaryGraphEl = document.getElementById('summaryGraph');
const summaryReportEl = document.getElementById('summaryReport');

function shouldShowSummary(index) {
    // preview 모드(저장 게임/복기 초기 진입)에서도 0수 진입을 허용한다.
    // 엔진 데이터가 비어있으면 renderSummaryGraph가 "분석 데이터 없음" 빈 상태를 그린다.
    // FEN 단일 포지션 분석은 요약 화면 대상이 아니다.
    const isFenOnly = analysisQueue.length === 1 && analysisQueue[0]?.isFenOnly;
    return appMode === 'main'
        && analysisQueue.length > 0
        && !isFenOnly
        && index === -1;
}

function applySummaryView(index) {
    const on = shouldShowSummary(index);
    analysisView.classList.toggle('view-summary', on);
    if (on) {
        renderSummaryGraph(summaryGraphEl, analysisQueue, isUserWhite);
        renderSummaryReport(summaryReportEl, analysisQueue, isUserWhite, handleNextMove);
    }
}

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
    applySummaryView(index);
    highlightActiveMove(index);

    // 미리보기 모드에서는 보드 위치와 하이라이트만 업데이트하고, 엔진/AI 패널은 건드리지 않음
    if (isPreviewMode) return;

    // 수 이동 시 엔진 탭으로 복귀하고 AI 패널은 현재 포지션에 맞게 갱신
    renderAiTabContent();
    switchTab('engine');

    // 블런더나 실수인 경우, 이전 턴(index - 1)에서 엔진이 추천했던 최선의 수를 파란색 화살표로 표시
    persistentShapes = [];
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
        updateTopEvalDisplay(analysisQueue[index].engineLines[0].scoreStr, analysisQueue[index].classification, isUserWhite);
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
    'Best':       { symbol: '✦', fontSize: '10px', fontWeight: '700', color: '#100E0B', bg: '#EDE8DF', borderColor: '#C8B898' },
    'Excellent':  { symbol: '!',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: '#5A9E60', borderColor: '#3A7E40' },
    'Inaccuracy': { symbol: '?!', fontSize: '8px',  fontWeight: '700', color: '#fff',    bg: '#C49A3C', borderColor: '#A07A1C' },
    'Mistake':    { symbol: '?',  fontSize: '13px', fontWeight: '900', color: '#fff',    bg: '#C87840', borderColor: '#A05820' },
    'Blunder':    { symbol: '??', fontSize: '9px',  fontWeight: '700', color: '#fff',    bg: '#C84040', borderColor: '#A02020' },
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

    // 원형 배지
    const badge = document.createElement('div');
    badge.className = 'piece-badge';
    badge.textContent = config.symbol;
    badge.style.fontSize = config.fontSize;
    badge.style.fontWeight = config.fontWeight;
    badge.style.color = config.color;
    badge.style.background = config.bg;
    badge.style.border = `1.5px solid ${config.borderColor}`;

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

    const tempChess = new Chess(baseFen);
    simulationQueue = [{ fen: baseFen, san: t('sim_start') }];
    
    const moves = pv.split(' ');
    for (const move of moves) {
        const moveRes = tempChess.move(move);
        if (moveRes) simulationQueue.push({ fen: tempChess.fen(), san: moveRes.san });
        else break;
    }

    appMode = 'simulate';
    simulationIndex = 1;
    
    stockfish.stop();
    showReturnBtn();
    updateBoardForSimulation(simulationIndex);
}

function updateBoardForSimulation(index) {
    const item = simulationQueue[index];
    const tempChess = new Chess(item.fen);
    const turnColor = tempChess.turn() === 'w' ? 'white' : 'black';
    cg.set({ fen: item.fen, turnColor: turnColor, movable: { color: turnColor, free: false, dests: getDests(tempChess) }, drawable: { autoShapes: [] } });
    updateTopEvalDisplay('—', 'Simulating', isUserWhite);
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
            simulationIndex = parseInt(el.dataset.simIndex, 10);
            updateBoardForSimulation(simulationIndex);
        });
    });
}

// PWA Service Worker — 일시 비활성화 (베타 기간)
// 재활성화 시점은 Phase 3 이후 검토
if ('serviceWorker' in navigator) {
    // 기존 유저의 브라우저에 설치된 SW 전부 제거
    navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => {
            reg.unregister().then(success => {
                if (success) console.log('[SW] Unregistered existing service worker');
            });
        });
    });

    // 기존 캐시 전부 삭제
    if ('caches' in window) {
        caches.keys().then(keys => {
            keys.forEach(key => {
                caches.delete(key).then(success => {
                    if (success) console.log('[SW] Deleted cache:', key);
                });
            });
        });
    }
}
