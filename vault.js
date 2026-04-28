import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { parseAndLoadPgn, escapeHtml, getDests } from './utils.js';
import { getVaultItems, removeVaultItem, getAnalyzedGameById, COORDS_KEY } from './storage.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';
import { EnginePool } from './engine.js';

// ==========================================
// DOM Elements
// ==========================================
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
const vaultDetailDeleteBtn = document.getElementById('vaultDetailDeleteBtn');
const movesBody = document.getElementById('movesBody');

// Mode tabs / blunder list / puzzle pane
const vaultModeTabs = document.getElementById('vaultModeTabs');
const vaultListPane = document.getElementById('vaultListPane');
const vaultPuzzlePane = document.getElementById('vaultPuzzlePane');
const vaultBlunderListLink = document.getElementById('vaultBlunderListLink');
const vaultBlunderListView = document.getElementById('vaultBlunderListView');
const vaultBlunderList = document.getElementById('vaultBlunderList');
const vaultBlunderListBackBtn = document.getElementById('vaultBlunderListBackBtn');
const vaultPuzzleFilterTabs = document.getElementById('vaultPuzzleFilterTabs');
const vaultBlunderFilterTabs = document.getElementById('vaultBlunderFilterTabs');
const vaultPuzzleIndicator = document.getElementById('vaultPuzzleIndicator');
const vaultPuzzleTapZones = document.getElementById('vaultPuzzleTapZones');

// Puzzle DOM
const vaultPuzzleStage = document.getElementById('vaultPuzzleStage');
const vaultPuzzleEmpty = document.getElementById('vaultPuzzleEmpty');
const vaultPuzzleHeader = document.getElementById('vaultPuzzleHeader');
const vaultPuzzleSubhead = document.getElementById('vaultPuzzleSubhead');
const vaultPuzzleBoard = document.getElementById('vaultPuzzleBoard');
const vaultPuzzleFeedback = document.getElementById('vaultPuzzleFeedback');
const vaultPuzzleNextBtn = document.getElementById('vaultPuzzleNextBtn');

// ==========================================
// State
// ==========================================
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let vaultDetailCg = null;
let vaultDetailChess = null;
let vaultDetailFens = [];
let vaultDetailSans = [];
let vaultDetailStartFen = START_FEN;
let vaultDetailIndex = -1;
let vaultDetailItem = null;

// 모드: 'list' | 'puzzle'
let vaultMode = 'list';

// 퍼즐 상태
let puzzleCg = null;
let puzzleChess = null;
let puzzleItem = null;       // 현재 출제된 vault_item (source='auto')
let puzzlePool = [];         // 현재 필터로 추려진 출제 풀
let puzzleSolved = false;    // 종료 상태 (정답/오답 확정, 더 입력 안 받음)
let puzzleProcessing = false; // 엔진 검증 중 — 추가 입력 차단
let puzzlePrevFen = null;    // 직전 포지션 FEN (사용자가 둘 자리)

// 자동 풀 카테고리 필터: 'mistake' (mistake+blunder) | 'mate' (missed_mate)
// 보기 모드와 블런더 목록 뷰가 독립적으로 보유 — 한쪽 전환이 다른쪽에 영향 안 줌.
let puzzleFilter = 'mistake';
let blunderListFilter = 'mistake';
// source='auto' 항목 전체 캐시 — 두 뷰가 공유, 탭 전환 시 재 fetch 안 함.
let _autoItemsCache = [];

// 메이트 퍼즐 라이브 검증용 엔진 — 첫 mate 퍼즐 로드 시 lazy init.
// 분석 화면의 풀과 분리 (한 워커, 독립 라이프사이클).
const PUZZLE_ENGINE_PATH = './engine/stockfish-18-lite-single.js';
const PUZZLE_VALIDATION_DEPTH = 14;
let _puzzleEngine = null;
let _puzzleEngineReady = null;
// 현재 mate 퍼즐 컨텍스트
let puzzleIsMate = false;
let puzzleMoverIsWhite = false;

// Deck별 진행 history — 인스타 stories처럼 실수/메이트 deck이 각자 위치 유지.
// history: 본 puzzle id 순서. position: 그 안에서 현재 보고 있는 인덱스 (0-indexed).
// 끝에 있으면 다음=새 random pick. 중간이면 다음=history[++pos], 이전=history[--pos].
const deckState = {
    mistake: { history: [], position: -1 },
    mate: { history: [], position: -1 },
};

// 자동 다음 타이머 — 풀이 종료 후 일정 시간 뒤 자동 진행.
let _autoNextTimer = null;
const AUTO_NEXT_DELAY = {
    correctMate: 1200,    // 메이트 완성 — 약간 즐길 시간
    correctSimple: 900,   // mistake/blunder 정답
    incorrect: 1600,      // 오답 — best move 학습 시간
};

// Dependencies injected via initVault()
let _showMovesOverlay = null;
let _closeMovesOverlay = null;
let _navigateTo = null;

// ==========================================
// Rendering (moved from ui.js)
// ==========================================
// 분류 라벨과 좌측 세로바 색상을 결정. 색상은 CSS 변수만 사용.
function categoryVisual(rawCategory) {
    const c = (rawCategory || '').toLowerCase();
    const upper = (rawCategory || '').toUpperCase();
    if (c === 'blunder')                    return { label: upper, color: 'var(--blunder)' };
    if (c === 'mistake' || c === 'missed')  return { label: upper, color: 'var(--mistake)' };
    if (c === 'missed_mate')                return { label: 'MISSED MATE', color: 'var(--blunder)' };
    if (c === 'inaccuracy')                 return { label: upper, color: 'var(--inaccuracy)' };
    if (c === 'best' || c === 'excellent')  return { label: upper, color: 'var(--best)' };
    // positional(사용자 지정) 및 그 외는 중립 톤
    return { label: upper, color: 'var(--tx2)' };
}

function renderVaultList(container, vaultItems, onOpen, opts = {}) {
    const { emptyText } = opts;
    container.innerHTML = '';
    if (vaultItems.length === 0) {
        container.innerHTML = `<div class="empty-state">${emptyText || t('vault_empty')}</div>`;
        return;
    }

    vaultItems.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        const { label: catLabel, color: catColor } = categoryVisual(item.category);
        // source='auto'는 PGN을 analyzed_games에서 늦게 가져옴 — legacy 회색 처리는 'manual인데 PGN 없음'에 한해
        const isLegacy = item.source !== 'auto' && !item.pgn;

        // 상단 줄: "내수 → 최선수" (bestMove 없으면 내수만)
        const sanHtml = escapeHtml(item.san || '');
        const movesHtml = item.bestMove
            ? `${sanHtml} <span class="vault-card-arrow">→</span> ${escapeHtml(item.bestMove)}`
            : sanHtml;

        // 하단 메타: "{gameTitle} · {moveNumber}수". game_title 없으면 수 번호만.
        const movesPart = typeof item.moveNumber === 'number' ? `${item.moveNumber}${t('moves_suffix')}` : '';
        const metaText = [item.gameTitle || '', movesPart].filter(Boolean).join(' · ');

        const el = document.createElement('div');
        el.className = 'vault-card';
        if (isLegacy) el.classList.add('vault-card--legacy');
        el.style.setProperty('--vault-card-accent', catColor);

        el.innerHTML = `
            <div class="vault-card-info">
                <div class="vault-card-top">
                    <div class="vault-card-moves">${movesHtml}</div>
                    <div class="vault-card-cat" style="color: ${catColor};">${escapeHtml(catLabel)}</div>
                </div>
                ${metaText ? `<div class="vault-card-meta">${escapeHtml(metaText)}</div>` : ''}
                ${item.notes ? `<div class="vault-card-notes">${escapeHtml(item.notes)}</div>` : ''}
            </div>
        `;

        el.addEventListener('click', () => onOpen(item));
        container.appendChild(el);
    });
}

// ==========================================
// Helpers
// ==========================================
function forceRedraw(instance) {
    if (!instance) return;
    setTimeout(() => instance.redrawAll(), 50);
}

function findMoveIndexByFen(fens, targetFen) {
    if (!targetFen) return -1;
    const exact = fens.indexOf(targetFen);
    if (exact !== -1) return exact;
    // 완전 일치 없으면 기물 배치(FEN 첫 필드)만 비교
    const targetBoard = targetFen.split(' ')[0];
    for (let i = 0; i < fens.length; i++) {
        if (fens[i].split(' ')[0] === targetBoard) return i;
    }
    return -1;
}

// ==========================================
// Core Functions
// ==========================================
export async function initHomeVaultBadge() {
}

// 데이터 로드만 담당. 뷰 가시성은 main.js의 renderScreen이 단독 관리.
// 모드 진입 시 항상 list로 리셋 (puzzle 진입 후 다시 vault_list 들어왔을 때 자연스러움).
// 자동 풀 캐시는 진입 1회만 fetch — 보기 탭 클릭 시엔 in-memory 필터만 재적용.
export async function loadVaultData() {
    setVaultMode('list');
    await updateVaultView();
    await refreshAutoItemsCache();
    applyPuzzleFilter();
}

async function updateVaultView() {
    const items = await getVaultItems({ source: 'manual' });
    renderVaultList(vaultList, items, openVaultItem);
}

// 자동 풀 (블런더 목록 / 보기 모드 공통). 별도 화면 진입 시 호출.
export async function loadBlunderListData() {
    await refreshAutoItemsCache();
    renderBlunderListPane();
}

function renderBlunderListPane() {
    const items = filterAutoItems(blunderListFilter);
    renderVaultList(vaultBlunderList, items, openVaultItem, {
        emptyText: getBlunderListEmptyText(),
    });
    if (vaultBlunderFilterTabs) {
        vaultBlunderFilterTabs.querySelectorAll('.vault-filter-tab').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.filter === blunderListFilter);
        });
    }
}

async function refreshAutoItemsCache() {
    try {
        _autoItemsCache = await getVaultItems({ source: 'auto' });
    } catch (e) {
        _autoItemsCache = [];
    }
}

function filterAutoItems(filter) {
    if (filter === 'mate') {
        return _autoItemsCache.filter(it => (it.category || '').toLowerCase() === 'missed_mate');
    }
    // 'mistake' = mistake + blunder (cp 기반 실수)
    return _autoItemsCache.filter(it => {
        const c = (it.category || '').toLowerCase();
        return c === 'mistake' || c === 'blunder';
    });
}

// 빈 상태 메시지: 풀 자체가 비었으면 일반 안내, 풀은 있는데 필터 매칭이 0이면 필터 전용 메시지.
function getPuzzleEmptyText() {
    if (_autoItemsCache.length === 0) return t('vault_puzzle_empty');
    return t(puzzleFilter === 'mate' ? 'vault_puzzle_empty_mate' : 'vault_puzzle_empty_mistake');
}

function getBlunderListEmptyText() {
    if (_autoItemsCache.length === 0) return t('vault_blunder_list_empty');
    return t(blunderListFilter === 'mate' ? 'vault_blunder_list_empty_mate' : 'vault_blunder_list_empty_mistake');
}

// 캐시는 vault 진입 시 1회만 채워짐 — 여기선 fetch 없이 현재 필터만 재적용.
function applyPuzzleFilter() {
    puzzlePool = filterAutoItems(puzzleFilter);
}

// 메이트 퍼즐 검증 엔진 — 1워커 풀 lazy. 한 번 init되면 페이지 수명 동안 유지.
async function ensurePuzzleEngine() {
    if (!_puzzleEngine) {
        _puzzleEngine = new EnginePool(PUZZLE_ENGINE_PATH, 1);
        _puzzleEngineReady = _puzzleEngine.ready();
    }
    await _puzzleEngineReady;
    return _puzzleEngine;
}

// 주어진 fen을 분석해 top line 반환. STM 시점의 cp/mate 값 + UCI PV.
async function analyzeForMate(fen) {
    try {
        const engine = await ensurePuzzleEngine();
        const result = await engine.analyze(fen, PUZZLE_VALIDATION_DEPTH);
        return result?.lines?.[0] || null;
    } catch (e) {
        console.warn('Puzzle engine analyze failed:', e);
        return null;
    }
}

// 라인이 mover에게 mate인지 판정. line.value는 STM 시점 (양수=STM이 mate).
// stmIsMover면 양수가 mover-mate, 아니면 음수가 mover-mate.
function lineSaysMoverMates(line, stmIsMover) {
    if (!line || line.type !== 'mate') return false;
    return stmIsMover ? line.value > 0 : line.value < 0;
}

async function deleteCurrentVaultItem() {
    if (!vaultDetailItem) return;
    if (!confirm(t('vault_delete_confirm'))) return;
    removeVaultItem(vaultDetailItem.id);
    vaultDetailItem = null;
    history.back();
    await updateVaultView();
    await initHomeVaultBadge();
}

async function openVaultItem(item) {
    // source='auto'면 PGN이 별도 테이블(analyzed_games)에 있음 — 늦게 로드.
    let pgn = item.pgn;
    if (!pgn && item.source === 'auto' && item.analyzedGameId) {
        const game = await getAnalyzedGameById(item.analyzedGameId);
        pgn = game?.pgn || null;
    }
    if (!pgn) {
        alert(t('vault_legacy_error'));
        return;
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, pgn);
    if (!result.success) {
        alert(t('vault_pgn_error'));
        return;
    }

    vaultDetailItem = { ...item, pgn };
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
    const isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
    if (!vaultDetailCg) {
        vaultDetailCg = Chessground(vaultDetailBoard, {
            fen: vaultDetailStartFen,
            animation: { enabled: true, duration: 250 },
            coordinates: isCoordsEnabled,
            movable: { free: false, color: undefined },
            draggable: { enabled: false },
        });
    }

    vaultDetailTitle.textContent = item.gameTitle || t('vault_title');
    vaultInfoCategory.textContent = item.category || '';
    vaultInfoPlayed.textContent = (item.moveNumber ? `${item.moveNumber}${item.isWhite ? '. ' : '... '}` : '') + (item.san || '');
    vaultInfoBest.textContent = item.bestMove || t('vault_unknown');
    vaultInfoNotes.textContent = item.notes || '';

    if (_navigateTo) _navigateTo('vault_detail');
    vaultView.classList.add('hidden');
    vaultDetailView.classList.remove('hidden');

    let targetIdx = -1;
    // 1) moveIndex가 있으면 우선 사용 (localStorage 경로)
    if (typeof item.moveIndex === 'number' && item.moveIndex >= 0 && item.moveIndex < vaultDetailFens.length) {
        targetIdx = item.moveIndex;
    }
    // 2) position_fen 기반 매칭 (Supabase 경로 — moveIndex 없음)
    if (targetIdx < 0 && item.fen) {
        targetIdx = findMoveIndexByFen(vaultDetailFens, item.fen);
    }
    // 3) 최종 폴백
    if (targetIdx < 0) targetIdx = vaultDetailFens.length - 1;

    setVaultDetailIndex(targetIdx);
    forceRedraw(vaultDetailCg);
}

export function setVaultDetailIndex(index) {
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
        vaultDetailMoveLabel.textContent = t('vault_start');
        vaultDetailCounter.textContent = `0 / ${vaultDetailFens.length}`;
    } else {
        const moveNumber = Math.floor(vaultDetailIndex / 2) + 1;
        const isWhite = vaultDetailIndex % 2 === 0;
        vaultDetailMoveLabel.textContent = `${moveNumber}${isWhite ? '.' : '...'} ${vaultDetailSans[vaultDetailIndex]}`;
        vaultDetailCounter.textContent = `${vaultDetailIndex + 1} / ${vaultDetailFens.length}`;
    }
}

// ==========================================
// Mode switching (목록/보기)
// ==========================================
function setVaultMode(mode) {
    vaultMode = mode;
    if (vaultModeTabs) {
        vaultModeTabs.querySelectorAll('.vault-mode-tab').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.mode === mode);
        });
    }
    if (vaultListPane) vaultListPane.classList.toggle('hidden', mode !== 'list');
    if (vaultPuzzlePane) vaultPuzzlePane.classList.toggle('hidden', mode !== 'puzzle');
    if (mode === 'puzzle') {
        startPuzzleSession();
    }
}

// ==========================================
// Puzzle (보기 모드) controller
// ==========================================
function getActiveDeck() {
    return deckState[puzzleFilter] || deckState.mistake;
}

function findItemById(id) {
    return _autoItemsCache.find(it => it.id === id) || null;
}

// 같은 puzzle 연속 출제 회피: deck history에 없는 항목 우선.
function pickRandomFromPool() {
    if (!puzzlePool || puzzlePool.length === 0) return null;
    const seen = new Set(getActiveDeck().history);
    const unseen = puzzlePool.filter(p => !seen.has(p.id));
    if (unseen.length > 0) return unseen[Math.floor(Math.random() * unseen.length)];
    return puzzlePool[Math.floor(Math.random() * puzzlePool.length)];
}

// 풀이 깨졌거나 PGN 없는 항목을 풀과 양쪽 deck history에서 한 번에 제거.
function removeItemEverywhere(id) {
    puzzlePool = puzzlePool.filter(p => p.id !== id);
    _autoItemsCache = _autoItemsCache.filter(it => it.id !== id);
    for (const key of Object.keys(deckState)) {
        const d = deckState[key];
        const before = d.history.length;
        d.history = d.history.filter(hid => hid !== id);
        if (d.position >= d.history.length) d.position = d.history.length - 1;
        else if (d.history.length < before) {
            // 제거된 항목이 현재 위치 이전이면 위치 조정 — 단순화: position 재계산은 안 하고 boundary만 보정
        }
    }
}

function cancelAutoNext() {
    if (_autoNextTimer) {
        clearTimeout(_autoNextTimer);
        _autoNextTimer = null;
    }
}

function scheduleAutoNext(delayMs) {
    cancelAutoNext();
    _autoNextTimer = setTimeout(() => {
        _autoNextTimer = null;
        loadNextPuzzle();
    }, delayMs);
}

// 인스타 stories 상단 bar — 풀 크기만큼 segment, 현재 deck 위치까지 채움.
function renderIndicator() {
    if (!vaultPuzzleIndicator) return;
    const total = puzzlePool.length;
    if (total === 0) {
        vaultPuzzleIndicator.innerHTML = '';
        return;
    }
    const deck = getActiveDeck();
    const filled = Math.min(deck.position + 1, total);
    let html = '';
    for (let i = 0; i < total; i++) {
        html += `<div class="puzzle-seg${i < filled ? ' filled' : ''}"></div>`;
    }
    vaultPuzzleIndicator.innerHTML = html;
}

// terminal 상태일 때만 좌/우 탭존 활성 — 풀이 중엔 보드 드래그 보장.
function setTapZonesActive(active) {
    if (!vaultPuzzleTapZones) return;
    vaultPuzzleTapZones.classList.toggle('active', !!active);
}

async function startPuzzleSession() {
    applyPuzzleFilter();
    if (!puzzlePool || puzzlePool.length === 0) {
        showPuzzleEmpty(true);
        return;
    }
    showPuzzleEmpty(false);
    cancelAutoNext();

    // deck 진행 위치가 유효하면 그 자리 복원, 아니면 새 random pick.
    const deck = getActiveDeck();
    if (deck.position >= 0 && deck.position < deck.history.length) {
        const item = findItemById(deck.history[deck.position]);
        if (item) {
            await renderPuzzle(item);
            return;
        }
        deck.history = [];
        deck.position = -1;
    }
    await loadNextPuzzle();
}

function showPuzzleEmpty(empty) {
    if (vaultPuzzleEmpty) {
        vaultPuzzleEmpty.classList.toggle('hidden', !empty);
        if (empty) {
            const txt = vaultPuzzleEmpty.querySelector('.vault-puzzle-empty-text');
            if (txt) txt.textContent = getPuzzleEmptyText();
        }
    }
    if (vaultPuzzleStage) vaultPuzzleStage.classList.toggle('hidden', empty);
}

function updatePuzzleFilterTabsUI() {
    if (!vaultPuzzleFilterTabs) return;
    vaultPuzzleFilterTabs.querySelectorAll('.vault-filter-tab').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.filter === puzzleFilter);
    });
}

// 진행: deck history 끝이면 새 random pick + push, 중간이면 한 칸 앞으로.
async function loadNextPuzzle() {
    cancelAutoNext();
    const deck = getActiveDeck();

    let item = null;
    if (deck.position < deck.history.length - 1) {
        deck.position++;
        item = findItemById(deck.history[deck.position]);
        // 캐시에서 사라진 항목이면 제거하고 같은 위치 재시도
        while (!item && deck.position < deck.history.length) {
            deck.history.splice(deck.position, 1);
            item = deck.position < deck.history.length ? findItemById(deck.history[deck.position]) : null;
        }
    }

    if (!item) {
        item = pickRandomFromPool();
        if (!item) {
            showPuzzleEmpty(true);
            return;
        }
        deck.history.push(item.id);
        deck.position = deck.history.length - 1;
    }

    await renderPuzzle(item);
}

// 후퇴: history 시작이면 무시.
async function loadPrevPuzzle() {
    cancelAutoNext();
    const deck = getActiveDeck();
    if (deck.position <= 0) return;
    deck.position--;
    let item = findItemById(deck.history[deck.position]);
    while (!item && deck.position >= 0) {
        deck.history.splice(deck.position, 1);
        deck.position--;
        item = deck.position >= 0 ? findItemById(deck.history[deck.position]) : null;
    }
    if (!item) return;
    await renderPuzzle(item);
}

// 한 puzzle item을 화면에 그리는 본체 — nav가 부르는 공통 진입점.
async function renderPuzzle(item) {
    if (!item) {
        showPuzzleEmpty(true);
        return;
    }
    puzzleItem = item;
    puzzleSolved = false;
    puzzleProcessing = false;
    setTapZonesActive(false);
    renderIndicator();

    // 직전 포지션을 얻기 위해 PGN을 로드해서 move_index까지 replay
    const game = await getAnalyzedGameById(item.analyzedGameId);
    if (!game?.pgn) {
        // 풀과 deck history에서 제외하고 다음 출제
        removeItemEverywhere(item.id);
        return loadNextPuzzle();
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, game.pgn);
    if (!result.success) {
        removeItemEverywhere(item.id);
        return loadNextPuzzle();
    }

    // moveIndex - 1까지의 포지션 = 직전 포지션 (사용자가 둘 자리)
    const moveIndex = item.moveIndex ?? 0;
    const replay = new Chess();
    if (tempChess.header().FEN) replay.load(tempChess.header().FEN);
    const verbose = tempChess.history({ verbose: true });
    for (let i = 0; i < moveIndex; i++) replay.move(verbose[i]);
    puzzlePrevFen = replay.fen();
    puzzleChess = replay; // 인터랙티브 chess.js 인스턴스

    // 헤더 카피
    const isMate = (item.category || '').toLowerCase() === 'missed_mate';
    const moverIsWhite = !!item.isWhite;
    // 모듈 상태 동기화 — onPuzzleUserMove가 mate 분기 결정에 사용
    puzzleIsMate = isMate;
    puzzleMoverIsWhite = moverIsWhite;
    // mate 퍼즐이면 엔진을 미리 워밍업 (사용자 첫 수 두기 전에 ready)
    if (isMate) ensurePuzzleEngine().catch(() => {});
    if (vaultPuzzleHeader) {
        vaultPuzzleHeader.textContent = isMate
            ? t('vault_puzzle_find_mate')
            : t('vault_puzzle_find_best');
    }
    if (vaultPuzzleSubhead) {
        const parts = [];
        if (item.gameTitle) parts.push(item.gameTitle);
        if (typeof item.moveNumber === 'number') {
            parts.push(`${item.moveNumber}${moverIsWhite ? '.' : '...'}`);
        }
        vaultPuzzleSubhead.textContent = parts.join(' · ');
    }

    if (vaultPuzzleFeedback) vaultPuzzleFeedback.innerHTML = '';

    // 보드 초기화 — 사용자(=mover) 색으로 orientation, 인터랙티브
    const isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
    const orientation = moverIsWhite ? 'white' : 'black';
    const movableColor = moverIsWhite ? 'white' : 'black';
    const dests = getDests(replay);

    if (!puzzleCg) {
        puzzleCg = Chessground(vaultPuzzleBoard, {
            fen: puzzlePrevFen,
            orientation,
            turnColor: replay.turn() === 'w' ? 'white' : 'black',
            coordinates: isCoordsEnabled,
            movable: {
                free: false,
                color: movableColor,
                dests,
                events: { after: onPuzzleUserMove },
            },
            draggable: { enabled: true },
            animation: { enabled: true, duration: 200 },
        });
    } else {
        puzzleCg.set({
            fen: puzzlePrevFen,
            orientation,
            turnColor: replay.turn() === 'w' ? 'white' : 'black',
            lastMove: undefined,
            movable: {
                free: false,
                color: movableColor,
                dests,
                events: { after: onPuzzleUserMove },
            },
        });
    }
    setTimeout(() => puzzleCg && puzzleCg.redrawAll(), 30);
}

async function onPuzzleUserMove(orig, dest, meta) {
    if (puzzleSolved || puzzleProcessing) return;

    // promotion 기본 q (퍼즐에서 자동 승격)
    let played;
    try {
        played = puzzleChess.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
        played = null;
    }
    if (!played) return;

    // 입력 차단 — 엔진 분석/응수 동안 추가 입력 막음
    puzzleProcessing = true;
    puzzleCg.set({
        fen: puzzleChess.fen(),
        turnColor: puzzleChess.turn() === 'w' ? 'white' : 'black',
        movable: { color: undefined, dests: new Map() },
    });

    try {
        if (puzzleIsMate) {
            await handleMateMove(played);
        } else {
            // Mistake/Blunder: 단발 SAN 비교 (기존 동작 유지)
            const expectedSan = (puzzleItem.bestMove || '').replace(/[+#]$/, '');
            const playedSan = played.san.replace(/[+#]$/, '');
            const correct = !!(expectedSan && playedSan === expectedSan);
            puzzleSolved = true;
            renderPuzzleFeedback({ correct, played });
        }
    } catch (e) {
        // 예상치 못한 에러로 핸들러가 reject되면 플래그가 영구 잠금되는 회귀 방지
        console.warn('Puzzle handler error:', e);
    } finally {
        puzzleProcessing = false;
    }
}

// 메이트 퍼즐 다단계 처리: 사용자 수 → 엔진 검증 → 통과 시 엔진 최선 응수 자동 → 다음 사용자 입력 대기.
// 사용자 수가 mate를 끝내면(체크메이트) 즉시 정답 종료.
async function handleMateMove(played) {
    // 1) 사용자가 직접 체크메이트를 줬다 → 풀이 완료
    // chess.js 0.10.3은 snake_case API (in_checkmate). camelCase 호출 시 TypeError로 핸들러 reject되며
    // puzzleProcessing 플래그가 안 풀려 보드 영구 잠금됨.
    if (puzzleChess.in_checkmate()) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }

    // 2) 결과 포지션을 엔진에 검증: mover에게 여전히 mate가 있는가
    const line = await analyzeForMate(puzzleChess.fen());
    const stmIsMover = (puzzleChess.turn() === 'w') === puzzleMoverIsWhite;
    if (!lineSaysMoverMates(line, stmIsMover)) {
        // mate 라인을 떨어뜨림 → 오답
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: false, played });
        return;
    }

    // 3) mate 유지 — 엔진의 최선 응수(상대)를 자동으로 둠
    const oppUci = (line.pv || '').split(' ')[0] || '';
    if (!oppUci || oppUci.length < 4) {
        // PV 비어있음(이상치) — mate 도달로 간주
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }
    const oppFrom = oppUci.slice(0, 2);
    const oppTo = oppUci.slice(2, 4);
    const oppPromo = oppUci.length > 4 ? oppUci[4] : 'q';
    let oppPlayed;
    try {
        oppPlayed = puzzleChess.move({ from: oppFrom, to: oppTo, promotion: oppPromo });
    } catch {
        oppPlayed = null;
    }
    if (!oppPlayed) {
        // 엔진이 unreachable 수를 내놓는 케이스(거의 불가) — 안전하게 종료
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }

    // 4) 사용자 다음 입력 대기 — 보드 재활성
    const userColor = puzzleMoverIsWhite ? 'white' : 'black';
    const dests = getDests(puzzleChess);
    puzzleCg.set({
        fen: puzzleChess.fen(),
        turnColor: puzzleChess.turn() === 'w' ? 'white' : 'black',
        lastMove: [oppFrom, oppTo],
        movable: {
            free: false,
            color: userColor,
            dests,
            events: { after: onPuzzleUserMove },
        },
    });
}

function renderPuzzleFeedback({ correct, played, mateDelivered }) {
    if (!vaultPuzzleFeedback || !puzzleItem) return;
    const cls = (puzzleItem.category || '').toLowerCase();
    const isMate = cls === 'missed_mate';

    let headLabel, headColor;
    if (mateDelivered) {
        headLabel = t('vault_puzzle_mate_solved');
        headColor = 'var(--best)';
    } else {
        headLabel = correct ? t('vault_puzzle_correct') : t('vault_puzzle_incorrect');
        headColor = correct ? 'var(--best)' : 'var(--blunder)';
    }

    const lines = [];
    if (!correct) {
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_you_played')}</span> <strong>${escapeHtml(played.san)}</strong></div>`);
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_best')}</span> <strong>${escapeHtml(puzzleItem.bestMove || '')}</strong></div>`);
    } else if (!mateDelivered) {
        // 메이트 도달은 head만으로 충분 — 별도 정답수 라인은 노이즈
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_best')}</span> <strong>${escapeHtml(puzzleItem.bestMove || played.san)}</strong></div>`);
    }
    // 메타: 분류 + cpLoss/mateIn
    let meta = '';
    if (isMate) meta = t('vault_puzzle_mate_label');
    else if (cls === 'blunder') meta = `${t('class_blunder')}${puzzleItem.cpLoss != null ? ` · +${puzzleItem.cpLoss} CPL` : ''}`;
    else if (cls === 'mistake') meta = `${t('class_mistake')}${puzzleItem.cpLoss != null ? ` · +${puzzleItem.cpLoss} CPL` : ''}`;

    vaultPuzzleFeedback.innerHTML = `
        <div class="puzzle-fb-head" style="color:${headColor};">${headLabel}</div>
        ${lines.join('')}
        ${meta ? `<div class="puzzle-fb-meta">${escapeHtml(meta)}</div>` : ''}
    `;

    // terminal 상태 — 좌/우 탭존 활성, 자동 다음 예약
    setTapZonesActive(true);
    const delay = mateDelivered
        ? AUTO_NEXT_DELAY.correctMate
        : (correct ? AUTO_NEXT_DELAY.correctSimple : AUTO_NEXT_DELAY.incorrect);
    scheduleAutoNext(delay);
}

export function redrawVaultPuzzleBoard() {
    if (puzzleCg && vaultPuzzlePane && !vaultPuzzlePane.classList.contains('hidden')) {
        puzzleCg.redrawAll();
    }
}

// ==========================================
// Public API for main.js integration
// ==========================================
export function isVaultDetailActive() {
    return vaultDetailView && !vaultDetailView.classList.contains('hidden');
}

export function isVaultPuzzleActive() {
    return vaultPuzzlePane && !vaultPuzzlePane.classList.contains('hidden')
        && vaultView && !vaultView.classList.contains('hidden');
}

export function getVaultDetailIndex() {
    return vaultDetailIndex;
}

export function flipVaultBoard() {
    if (!vaultDetailCg) return;
    const o = vaultDetailCg.state.orientation;
    vaultDetailCg.set({ orientation: o === 'white' ? 'black' : 'white' });
}

export function setVaultCoords(enabled) {
    if (vaultDetailCg) vaultDetailCg.set({ coordinates: enabled });
}

export function redrawVaultBoard() {
    if (vaultDetailCg && !vaultDetailView.classList.contains('hidden')) {
        vaultDetailCg.redrawAll();
    }
}

// ==========================================
// Initialization
// ==========================================
export function initVault({ showMovesOverlay, closeMovesOverlay, navigateTo }) {
    _showMovesOverlay = showMovesOverlay;
    _closeMovesOverlay = closeMovesOverlay;
    _navigateTo = navigateTo || null;

    vaultBackBtn.addEventListener('click', () => {
        history.back();
    });

    vaultDetailBackBtn.addEventListener('click', () => {
        history.back();
    });

    // 모드 텍스트 탭
    if (vaultModeTabs) {
        vaultModeTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.vault-mode-tab');
            if (!btn) return;
            const mode = btn.dataset.mode;
            if (!mode || mode === vaultMode) return;
            setVaultMode(mode);
        });
    }

    // 블런더 목록 진입로
    if (vaultBlunderListLink) {
        vaultBlunderListLink.addEventListener('click', () => {
            if (_navigateTo) _navigateTo('vault_blunder_list');
        });
    }

    // 블런더 목록 뒤로 가기
    if (vaultBlunderListBackBtn) {
        vaultBlunderListBackBtn.addEventListener('click', () => {
            history.back();
        });
    }

    // 보기 모드 sub-filter (실수 / 메이트 놓침)
    if (vaultPuzzleFilterTabs) {
        vaultPuzzleFilterTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.vault-filter-tab');
            if (!btn) return;
            const f = btn.dataset.filter;
            if (!f || f === puzzleFilter) return;
            puzzleFilter = f;
            updatePuzzleFilterTabsUI();
            startPuzzleSession();
        });
    }

    // 블런더 목록 sub-filter
    if (vaultBlunderFilterTabs) {
        vaultBlunderFilterTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.vault-filter-tab');
            if (!btn) return;
            const f = btn.dataset.filter;
            if (!f || f === blunderListFilter) return;
            blunderListFilter = f;
            renderBlunderListPane();
        });
    }

    // 퍼즐 다음 버튼
    if (vaultPuzzleNextBtn) {
        vaultPuzzleNextBtn.addEventListener('click', () => {
            loadNextPuzzle();
        });
    }

    // 좌/우 탭존 — terminal 상태일 때만 active. 좌=이전, 우=다음.
    if (vaultPuzzleTapZones) {
        vaultPuzzleTapZones.addEventListener('click', (e) => {
            const zone = e.target.closest('.puzzle-tap-zone');
            if (!zone) return;
            if (zone.dataset.action === 'prev') loadPrevPuzzle();
            else loadNextPuzzle();
        });
    }

    // 키보드 화살표 — 보기 모드 활성 + terminal 상태일 때만 동작.
    document.addEventListener('keydown', (e) => {
        if (!vaultPuzzlePane || vaultPuzzlePane.classList.contains('hidden')) return;
        if (!puzzleSolved) return; // 풀이 중에는 무시
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            loadNextPuzzle();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            loadPrevPuzzle();
        }
    });

    vaultDetailPrevBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex - 1));
    vaultDetailNextBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex + 1));

    if (vaultDetailDeleteBtn) {
        vaultDetailDeleteBtn.addEventListener('click', deleteCurrentVaultItem);
    }

    vaultDetailMovesBtn.addEventListener('click', () => _showMovesOverlay({
        getPgn: () => vaultDetailItem ? vaultDetailItem.pgn : '',
        renderBody: () => {
            const queue = vaultDetailSans.map((san, i) => ({
                san,
                moveNumber: Math.floor(i / 2) + 1,
                isWhite: i % 2 === 0,
            }));
            renderMovesTable(movesBody, queue, (i) => {
                setVaultDetailIndex(i);
                _closeMovesOverlay();
            });
        },
    }));
}
