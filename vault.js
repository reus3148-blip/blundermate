import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { parseAndLoadPgn, escapeHtml, getDests } from './utils.js';
import { getVaultItems, removeVaultItem, getAnalyzedGameById, COORDS_KEY } from './storage.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';
import { EnginePool } from './engine.js';
import { showAlert, showConfirm } from './dialogs.js';

// ==========================================
// DOM Elements
// ==========================================
const vaultView = document.getElementById('vaultView');
const vaultListLink = document.getElementById('vaultListLink');
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

// 보조 리스트 뷰 (게임 날짜순)
const vaultBlunderListView = document.getElementById('vaultBlunderListView');
const vaultBlunderList = document.getElementById('vaultBlunderList');
const vaultBlunderListBackBtn = document.getElementById('vaultBlunderListBackBtn');
const vaultBlunderFilterTabs = document.getElementById('vaultBlunderFilterTabs');

// Stories puzzle pane
const vaultPuzzlePane = document.getElementById('vaultPuzzlePane');
const vaultPuzzleFilterTabs = document.getElementById('vaultPuzzleFilterTabs');
const vaultPuzzleIndicator = document.getElementById('vaultPuzzleIndicator');
const vaultPuzzleTapZones = document.getElementById('vaultPuzzleTapZones');
const vaultPuzzleStage = document.getElementById('vaultPuzzleStage');
const vaultPuzzleEmpty = document.getElementById('vaultPuzzleEmpty');
const vaultPuzzleHeader = document.getElementById('vaultPuzzleHeader');
const vaultPuzzleSubhead = document.getElementById('vaultPuzzleSubhead');
const vaultPuzzleBoard = document.getElementById('vaultPuzzleBoard');
const vaultPuzzleFeedback = document.getElementById('vaultPuzzleFeedback');
const vaultPuzzleNextBtn = document.getElementById('vaultPuzzleNextBtn');

// 두 vault 필터 탭 컨테이너에 동일한 옵션(블런더/메이트/기타)을 #vaultFilterTabsTemplate에서 clone.
// HTML 중복 제거 — 옵션 변경 시 template 한 곳만 수정.
{
    const tpl = document.getElementById('vaultFilterTabsTemplate');
    if (tpl) {
        for (const target of [vaultPuzzleFilterTabs, vaultBlunderFilterTabs]) {
            if (target && !target.children.length) {
                target.appendChild(tpl.content.cloneNode(true));
            }
        }
    }
}

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

// Puzzle 상태
let puzzleCg = null;
let puzzleChess = null;
let puzzleItem = null;
let puzzlePool = [];
let puzzleSolved = false;
let puzzleProcessing = false;
let puzzlePrevFen = null;

// 1차 카테고리 필터: 'mistake' | 'mate' | 'other'.
// stories와 보조 리스트가 독립적으로 보유 — 한쪽 전환이 다른쪽에 영향 안 줌.
let puzzleFilter = 'mistake';
let blunderListFilter = 'mistake';
// vault_items 전체 캐시 (manual+auto 통합) — 두 뷰 공유.
let _itemsCache = [];

// 메이트 퍼즐 검증 엔진 — lazy init.
const PUZZLE_ENGINE_PATH = './engine/stockfish-18-lite-single.js';
const PUZZLE_VALIDATION_DEPTH = 14;
let _puzzleEngine = null;
let _puzzleEngineReady = null;

let puzzleIsMate = false;
let puzzleIsOther = false;
let puzzleMoverIsWhite = false;
let puzzleUserMoves = 0;
let puzzleMateBudget = null;

// Deck별 진행 history — 카테고리별로 stories 위치 유지.
const deckState = {
    mistake: { history: [], position: -1 },
    mate: { history: [], position: -1 },
    other: { history: [], position: -1 },
};

// Dependencies injected via initVault()
let _showMovesOverlay = null;
let _closeMovesOverlay = null;
let _navigateTo = null;

// ==========================================
// Categorization
// ==========================================
// 1차 분류: 풀이 모드 기준. 'mistake'/'blunder'(cp 실수) → mistake, 'missed_mate' → mate,
// 그 외('positional' 직접저장 + 미상) → other (감상 전용, 정답 없음).
function categorize(item) {
    const c = (item?.category || '').toLowerCase();
    if (c === 'mistake' || c === 'blunder') return 'mistake';
    if (c === 'missed_mate') return 'mate';
    return 'other';
}

// 게임 날짜(playedDate) desc, null이면 created_at(date) desc로 폴백.
function sortByPlayedDate(items) {
    return items.slice().sort((a, b) => {
        const ka = a.playedDate || '';
        const kb = b.playedDate || '';
        if (ka && kb) return kb.localeCompare(ka);
        if (ka) return -1;
        if (kb) return 1;
        return new Date(b.date || 0) - new Date(a.date || 0);
    });
}

// ==========================================
// Rendering
// ==========================================
function categoryVisual(rawCategory) {
    const c = (rawCategory || '').toLowerCase();
    const upper = (rawCategory || '').toUpperCase();
    // 사이트 정체성 (블런더+메이트) 우선. 그 외 8-tier 분류는 영어 그대로.
    if (c === 'blunder')                    return { label: t('vault_filter_mistake'), color: 'var(--blunder)' };
    if (c === 'mistake' || c === 'missed')  return { label: t('class_mistake'), color: 'var(--mistake)' };
    if (c === 'missed_mate')                return { label: t('vault_puzzle_mate_label'), color: 'var(--blunder)' };
    if (c === 'inaccuracy')                 return { label: t('class_inaccuracy'), color: 'var(--inaccuracy)' };
    if (c === 'best' || c === 'excellent')  return { label: upper, color: 'var(--best)' };
    return { label: upper, color: 'var(--tx2)' };
}

function renderVaultList(container, vaultItems, onOpen, opts = {}) {
    const { emptyText } = opts;
    container.innerHTML = '';
    if (vaultItems.length === 0) {
        container.innerHTML = `<div class="empty-state">${emptyText || t('vault_empty')}</div>`;
        return;
    }

    sortByPlayedDate(vaultItems).forEach(item => {
        const { label: catLabel, color: catColor } = categoryVisual(item.category);
        const isLegacy = item.source !== 'auto' && !item.pgn;

        const sanHtml = escapeHtml(item.san || '');
        const movesHtml = item.bestMove
            ? `${sanHtml} <span class="vault-card-arrow">→</span> ${escapeHtml(item.bestMove)}`
            : sanHtml;

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
    const targetBoard = targetFen.split(' ')[0];
    for (let i = 0; i < fens.length; i++) {
        if (fens[i].split(' ')[0] === targetBoard) return i;
    }
    return -1;
}

// ==========================================
// Core Functions
// ==========================================

// vault 진입 — 캐시 갱신 후 stories 시작.
export async function loadVaultData() {
    await refreshItemsCache();
    applyPuzzleFilter();
    startPuzzleSession();
}

// 보조 리스트 뷰 진입.
export async function loadBlunderListData() {
    await refreshItemsCache();
    renderBlunderListPane();
}

function renderBlunderListPane() {
    const items = filterItems(blunderListFilter);
    renderVaultList(vaultBlunderList, items, openVaultItem, {
        emptyText: getBlunderListEmptyText(),
    });
    if (vaultBlunderFilterTabs) {
        vaultBlunderFilterTabs.querySelectorAll('.vault-filter-tab').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.filter === blunderListFilter);
        });
    }
}

async function refreshItemsCache() {
    try {
        _itemsCache = await getVaultItems();
    } catch (e) {
        _itemsCache = [];
    }
}

function filterItems(filter) {
    return _itemsCache.filter(it => categorize(it) === filter);
}

function getPuzzleEmptyText() {
    if (_itemsCache.length === 0) return t('vault_puzzle_empty');
    if (puzzleFilter === 'mate')  return t('vault_puzzle_empty_mate');
    if (puzzleFilter === 'other') return t('vault_puzzle_empty_other');
    return t('vault_puzzle_empty_mistake');
}

function getBlunderListEmptyText() {
    if (_itemsCache.length === 0) return t('vault_blunder_list_empty');
    if (blunderListFilter === 'mate')  return t('vault_blunder_list_empty_mate');
    if (blunderListFilter === 'other') return t('vault_blunder_list_empty_other');
    return t('vault_blunder_list_empty_mistake');
}

function applyPuzzleFilter() {
    puzzlePool = filterItems(puzzleFilter);
}

async function ensurePuzzleEngine() {
    if (!_puzzleEngine) {
        _puzzleEngine = new EnginePool(PUZZLE_ENGINE_PATH, 1);
        _puzzleEngineReady = _puzzleEngine.ready();
    }
    await _puzzleEngineReady;
    return _puzzleEngine;
}

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

function lineSaysMoverMates(line, stmIsMover) {
    if (!line || line.type !== 'mate') return false;
    return stmIsMover ? line.value > 0 : line.value < 0;
}

async function deleteCurrentVaultItem() {
    if (!vaultDetailItem) return;
    const ok = await showConfirm(t('vault_delete_confirm'), {
        okLabel: t('confirm_delete'),
        destructive: true,
    });
    if (!ok) return;
    removeVaultItem(vaultDetailItem.id);
    vaultDetailItem = null;
    history.back();
}

async function openVaultItem(item) {
    let pgn = item.pgn;
    if (!pgn && item.source === 'auto' && item.analyzedGameId) {
        const game = await getAnalyzedGameById(item.analyzedGameId);
        pgn = game?.pgn || null;
    }
    if (!pgn) {
        showAlert(t('vault_legacy_error'));
        return;
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, pgn);
    if (!result.success) {
        showAlert(t('vault_pgn_error'));
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
    const { label: catLabel, color: catColor } = categoryVisual(item.category);
    vaultInfoCategory.textContent = catLabel;
    vaultInfoCategory.style.color = catColor;
    vaultInfoPlayed.textContent = (item.moveNumber ? `${item.moveNumber}${item.isWhite ? '. ' : '... '}` : '') + (item.san || '');
    // bestMove 없으면 빈 string으로 — CSS가 row 통째로 숨김 (.vault-info-row:has(:empty))
    vaultInfoBest.textContent = item.bestMove || '';
    vaultInfoNotes.textContent = item.notes || '';

    if (_navigateTo) _navigateTo('vault_detail');
    vaultView.classList.add('hidden');
    vaultDetailView.classList.remove('hidden');

    let targetIdx = -1;
    if (typeof item.moveIndex === 'number' && item.moveIndex >= 0 && item.moveIndex < vaultDetailFens.length) {
        targetIdx = item.moveIndex;
    }
    if (targetIdx < 0 && item.fen) {
        targetIdx = findMoveIndexByFen(vaultDetailFens, item.fen);
    }
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
// Stories controller
// ==========================================
function getActiveDeck() {
    return deckState[puzzleFilter] || deckState.mistake;
}

function findItemById(id) {
    return _itemsCache.find(it => it.id === id) || null;
}

function pickRandomFromPool() {
    if (!puzzlePool || puzzlePool.length === 0) return null;
    const seen = new Set(getActiveDeck().history);
    const unseen = puzzlePool.filter(p => !seen.has(p.id));
    if (unseen.length > 0) return unseen[Math.floor(Math.random() * unseen.length)];
    return puzzlePool[Math.floor(Math.random() * puzzlePool.length)];
}

function removeItemEverywhere(id) {
    puzzlePool = puzzlePool.filter(p => p.id !== id);
    _itemsCache = _itemsCache.filter(it => it.id !== id);
    for (const key of Object.keys(deckState)) {
        const d = deckState[key];
        d.history = d.history.filter(hid => hid !== id);
        if (d.position >= d.history.length) d.position = d.history.length - 1;
    }
}

// Stories indicator는 풀 사이즈에 비례해 segment를 그리지만, 큰 풀(50+)에선 1px 미만으로 압축돼
// 가독성이 망가짐. MAX_INDICATOR_SEGS로 cap하고 초과 시 우측에 "현재/total" 카운터로 보강.
const MAX_INDICATOR_SEGS = 12;

function renderIndicator() {
    if (!vaultPuzzleIndicator) return;
    const total = puzzlePool.length;
    if (total === 0) {
        vaultPuzzleIndicator.innerHTML = '';
        return;
    }
    const deck = getActiveDeck();
    const filled = Math.min(deck.position + 1, total);
    const segs = Math.min(total, MAX_INDICATOR_SEGS);
    const filledSegs = total <= MAX_INDICATOR_SEGS
        ? filled
        : Math.ceil((filled / total) * segs);

    let html = '';
    for (let i = 0; i < segs; i++) {
        html += `<div class="puzzle-seg${i < filledSegs ? ' filled' : ''}"></div>`;
    }
    if (total > MAX_INDICATOR_SEGS) {
        html += `<span class="puzzle-seg-count">${filled} / ${total}</span>`;
    }
    vaultPuzzleIndicator.innerHTML = html;
    updatePuzzleNextLabel();
}

// 다음 버튼 라벨 — 풀 상태에 따라 의미 명확화.
// 풀 1개: "다시 풀기" — 누르면 같은 문제 재출제
// 풀 소진(seen >= total): "처음부터" — 다시 사이클 시작
// 그 외: "다음"
function updatePuzzleNextLabel() {
    if (!vaultPuzzleNextBtn) return;
    const total = puzzlePool.length;
    if (total === 0) return;
    const deck = getActiveDeck();
    const seenCount = new Set(deck.history).size;
    const allSeen = seenCount >= total;

    let key = 'vault_puzzle_next';
    if (total === 1) key = 'vault_puzzle_retry';
    else if (allSeen) key = 'vault_puzzle_restart';
    vaultPuzzleNextBtn.textContent = t(key);
}

// 풀이 deck은 풀이 완료 후 활성, 'other' deck은 진입 즉시 활성.
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

async function loadNextPuzzle() {
    const deck = getActiveDeck();

    let item = null;
    if (deck.position < deck.history.length - 1) {
        deck.position++;
        item = findItemById(deck.history[deck.position]);
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

async function loadPrevPuzzle() {
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

// 풀이 가능한 항목(mistake/mate)과 감상 항목(other)으로 분기.
async function renderPuzzle(item) {
    if (!item) {
        showPuzzleEmpty(true);
        return;
    }
    puzzleItem = item;
    const cat = categorize(item);

    if (cat === 'other') {
        await renderOtherItem(item);
        return;
    }
    await renderSolvableItem(item, cat === 'mate');
}

async function renderSolvableItem(item, isMate) {
    puzzleSolved = false;
    puzzleProcessing = false;
    puzzleIsOther = false;
    setTapZonesActive(false);
    renderIndicator();

    // PGN — auto는 analyzed_games, manual은 item.pgn
    let pgn = item.pgn;
    if (!pgn && item.analyzedGameId) {
        const game = await getAnalyzedGameById(item.analyzedGameId);
        pgn = game?.pgn || null;
    }
    if (!pgn) {
        removeItemEverywhere(item.id);
        return loadNextPuzzle();
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, pgn);
    if (!result.success) {
        removeItemEverywhere(item.id);
        return loadNextPuzzle();
    }

    const moveIndex = item.moveIndex ?? 0;
    const replay = new Chess();
    if (tempChess.header().FEN) replay.load(tempChess.header().FEN);
    const verbose = tempChess.history({ verbose: true });
    for (let i = 0; i < moveIndex; i++) replay.move(verbose[i]);
    puzzlePrevFen = replay.fen();
    puzzleChess = replay;

    const moverIsWhite = !!item.isWhite;
    puzzleIsMate = isMate;
    puzzleMoverIsWhite = moverIsWhite;
    puzzleUserMoves = 0;
    puzzleMateBudget = (isMate && typeof item.mateIn === 'number' && item.mateIn > 0) ? item.mateIn : null;
    if (isMate) ensurePuzzleEngine().catch(() => {});

    if (vaultPuzzleHeader) {
        let txt = isMate ? t('vault_puzzle_find_mate') : t('vault_puzzle_find_best');
        if (puzzleMateBudget != null) txt += ` · M${puzzleMateBudget}`;
        vaultPuzzleHeader.textContent = txt;
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

// 'other' deck — 풀이 없이 감상. 보드 인터랙션 잠금, 노트 표시, 진입 즉시 좌/우 활성.
async function renderOtherItem(item) {
    puzzleSolved = true; // terminal 상태로 진입
    puzzleProcessing = false;
    puzzleIsMate = false;
    puzzleIsOther = true;
    setTapZonesActive(true);
    renderIndicator();

    if (vaultPuzzleHeader) {
        vaultPuzzleHeader.textContent = t('vault_puzzle_other_header');
    }
    if (vaultPuzzleSubhead) {
        const parts = [];
        if (item.gameTitle) parts.push(item.gameTitle);
        if (typeof item.moveNumber === 'number') {
            parts.push(`${item.moveNumber}${item.isWhite ? '.' : '...'}`);
        }
        if (parts.length === 0) parts.push(t('vault_puzzle_other_subhead'));
        vaultPuzzleSubhead.textContent = parts.join(' · ');
    }

    const isCoordsEnabled = localStorage.getItem(COORDS_KEY) !== 'false';
    const orientation = (item.isUserWhite !== undefined ? item.isUserWhite : item.isWhite) ? 'white' : 'black';
    const fen = item.fen || START_FEN;

    if (!puzzleCg) {
        puzzleCg = Chessground(vaultPuzzleBoard, {
            fen,
            orientation,
            coordinates: isCoordsEnabled,
            movable: { free: false, color: undefined, dests: new Map() },
            draggable: { enabled: false },
            animation: { enabled: true, duration: 200 },
        });
    } else {
        puzzleCg.set({
            fen,
            orientation,
            lastMove: undefined,
            movable: { free: false, color: undefined, dests: new Map() },
        });
    }
    setTimeout(() => puzzleCg && puzzleCg.redrawAll(), 30);

    // 노트 + 수 메타
    const lines = [];
    if (item.notes) {
        lines.push(`<div class="puzzle-fb-line puzzle-fb-notes">${escapeHtml(item.notes)}</div>`);
    }
    const movesPart = [];
    if (item.san) movesPart.push(`<strong>${escapeHtml(item.san)}</strong>`);
    if (item.bestMove) movesPart.push(`<span class="vault-card-arrow">→</span> <strong>${escapeHtml(item.bestMove)}</strong>`);
    if (movesPart.length > 0) {
        lines.push(`<div class="puzzle-fb-line">${movesPart.join(' ')}</div>`);
    }
    if (vaultPuzzleFeedback) {
        vaultPuzzleFeedback.innerHTML = lines.join('');
    }
}

async function onPuzzleUserMove(orig, dest, meta) {
    if (puzzleSolved || puzzleProcessing || puzzleIsOther) return;

    let played;
    try {
        played = puzzleChess.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
        played = null;
    }
    if (!played) return;

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
            const expectedSan = (puzzleItem.bestMove || '').replace(/[+#]$/, '');
            const playedSan = played.san.replace(/[+#]$/, '');
            const correct = !!(expectedSan && playedSan === expectedSan);
            puzzleSolved = true;
            renderPuzzleFeedback({ correct, played });
        }
    } catch (e) {
        console.warn('Puzzle handler error:', e);
    } finally {
        puzzleProcessing = false;
    }
}

async function handleMateMove(played) {
    puzzleUserMoves++;

    if (puzzleChess.in_checkmate()) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }

    if (puzzleMateBudget != null && puzzleUserMoves >= puzzleMateBudget) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: false, played });
        return;
    }

    const line = await analyzeForMate(puzzleChess.fen());
    const stmIsMover = (puzzleChess.turn() === 'w') === puzzleMoverIsWhite;
    if (!lineSaysMoverMates(line, stmIsMover)) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: false, played });
        return;
    }

    const oppUci = (line.pv || '').split(' ')[0] || '';
    if (!oppUci || oppUci.length < 4) {
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
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }

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
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_best')}</span> <strong>${escapeHtml(puzzleItem.bestMove || played.san)}</strong></div>`);
    }
    let meta = '';
    if (isMate) meta = t('vault_puzzle_mate_label');
    else if (cls === 'blunder') meta = `${t('class_blunder')}${puzzleItem.cpLoss != null ? ` · +${puzzleItem.cpLoss} CPL` : ''}`;
    else if (cls === 'mistake') meta = `${t('class_mistake')}${puzzleItem.cpLoss != null ? ` · +${puzzleItem.cpLoss} CPL` : ''}`;

    vaultPuzzleFeedback.innerHTML = `
        <div class="puzzle-fb-head" style="color:${headColor};">${headLabel}</div>
        ${lines.join('')}
        ${meta ? `<div class="puzzle-fb-meta">${escapeHtml(meta)}</div>` : ''}
    `;

    // terminal — 좌/우 탭존 활성, 사용자가 직접 넘김 (자동 다음 없음).
    setTapZonesActive(true);
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

    vaultDetailBackBtn.addEventListener('click', () => {
        history.back();
    });

    // 우상단 리스트 보조 진입
    if (vaultListLink) {
        vaultListLink.addEventListener('click', () => {
            if (_navigateTo) _navigateTo('vault_blunder_list');
        });
    }

    if (vaultBlunderListBackBtn) {
        vaultBlunderListBackBtn.addEventListener('click', () => {
            history.back();
        });
    }

    // Stories 카테고리 탭 (실수/메이트/기타)
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

    // 리스트 카테고리 탭
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

    if (vaultPuzzleNextBtn) {
        vaultPuzzleNextBtn.addEventListener('click', () => {
            loadNextPuzzle();
        });
    }

    // 좌/우 탭존 — terminal/other 상태일 때만 active.
    if (vaultPuzzleTapZones) {
        vaultPuzzleTapZones.addEventListener('click', (e) => {
            const zone = e.target.closest('.puzzle-tap-zone');
            if (!zone) return;
            if (zone.dataset.action === 'prev') loadPrevPuzzle();
            else loadNextPuzzle();
        });
    }

    // 키보드 화살표 — stories 활성 상태에서만. 풀이 deck은 풀이 완료 후, other deck은 항상.
    document.addEventListener('keydown', (e) => {
        if (!vaultPuzzlePane || vaultPuzzlePane.classList.contains('hidden')) return;
        if (!vaultView || vaultView.classList.contains('hidden')) return;
        if (!puzzleIsOther && !puzzleSolved) return;
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
