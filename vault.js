import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { Chess } from 'https://cdn.jsdelivr.net/npm/chess.js@1.4.0/+esm';
import { parseAndLoadPgn, escapeHtml, getDests, formatRelativeDate, getDateStrings } from './utils.js';
import { renderEngineLines, placePieceBadge, withScreenLoading, renderEmptyState } from './ui.js';
import { getVaultItems, getVaultItemsCached, removeVaultItem, getAnalyzedGameById, getIsCoordsEnabled, getMyUserId, incrementVaultItemSolved, updateVaultItemNotes } from './storage.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';
import { EnginePool } from './engine.js';
import { showAlert, showConfirm } from './dialogs.js';

// ==========================================
// DOM Elements
// ==========================================
const vaultView = document.getElementById('vaultView');
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
const vaultNotesInput = document.getElementById('vaultNotesInput');
const vaultDetailDeleteBtn = document.getElementById('vaultDetailDeleteBtn');
const movesBody = document.getElementById('movesBody');

// 실수로부터 배우기 — drawer 진입. 퍼즐/노트 sub-tab.
const vaultBlunderListView = document.getElementById('vaultBlunderListView');
const vaultBlunderList = document.getElementById('vaultBlunderList');
const vaultBlunderListBackBtn = document.getElementById('vaultBlunderListBackBtn');
const vaultBlunderFilterTabs = document.getElementById('vaultBlunderFilterTabs');
const learnNotesProgress = document.getElementById('learnNotesProgress');

// Stories puzzle pane
const vaultPuzzlePane = document.getElementById('vaultPuzzlePane');
const vaultPuzzleFilterTabs = document.getElementById('vaultPuzzleFilterTabs');
const vaultPuzzleIndicator = document.getElementById('vaultPuzzleIndicator');
const vaultPuzzleStage = document.getElementById('vaultPuzzleStage');
const vaultPuzzleEmpty = document.getElementById('vaultPuzzleEmpty');
const vaultPuzzleHeader = document.getElementById('vaultPuzzleHeader');
const vaultPuzzleSubhead = document.getElementById('vaultPuzzleSubhead');
const vaultPuzzleBoard = document.getElementById('vaultPuzzleBoard');
const vaultPuzzleFeedback = document.getElementById('vaultPuzzleFeedback');
const vaultPuzzleNextBtn = document.getElementById('vaultPuzzleNextBtn');
// 분석 chrome 채택 — < >는 gameContext ply scrub, 하단 액션바는 이전/다시/다음 퍼즐.
const vaultPrevPlyBtn = document.getElementById('vaultPrevPlyBtn');
const vaultNextPlyBtn = document.getElementById('vaultNextPlyBtn');
const vaultPlyIndicator = document.getElementById('vaultPlyIndicator');
const vaultPrevPuzzleBtn = document.getElementById('vaultPrevPuzzleBtn');
const vaultResetPuzzleBtn = document.getElementById('vaultResetPuzzleBtn');
const vaultEngineLinesContainer = document.getElementById('vaultEngineLinesContainer');

// stories 필터 탭(블런더/메이트/복습 완료)을 #vaultFilterTabsTemplate에서 clone.
// vaultBlunderFilterTabs는 Phase A에서 퍼즐/노트 sub-tab으로 분리 — index.html에 직접 마크업, clone 대상 아님.
{
    const tpl = document.getElementById('vaultFilterTabsTemplate');
    if (tpl && vaultPuzzleFilterTabs && !vaultPuzzleFilterTabs.children.length) {
        vaultPuzzleFilterTabs.appendChild(tpl.content.cloneNode(true));
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

// stories 1차 필터: 'mistake' | 'mate' | 'done'.
// Phase 58: 'done' = solvedCount >= 2 카드만 (카테고리 무관). mistake/mate 풀은 done 자동 제외.
let puzzleFilter = 'mistake';
const SOLVED_RETIRE_THRESHOLD = 2;
// 실수로부터 배우기 sub-tab: 'puzzle'(메이트 등 풀이 가치 카드) | 'notes'(일반 실수 — 메모 대상).
// Phase A: 분류는 기존 categorize() 재사용. only-move 신규 분류는 Phase C.
let learnTab = 'puzzle';
// vault_items 전체 캐시 (manual+auto 통합) — 두 뷰 공유.
let _itemsCache = [];

// 메이트 퍼즐 검증 엔진 — lazy init.
const PUZZLE_ENGINE_PATH = './engine/stockfish-18-lite-single.js';
const PUZZLE_VALIDATION_DEPTH = 14;
let _puzzleEngine = null;
let _puzzleEngineReady = null;

let puzzleIsMate = false;
let puzzleMoverIsWhite = false;
let puzzleUserMoves = 0;
let puzzleMateBudget = null;

// gameContext ±3수 scrub — 보드 표시만 변경, puzzleChess 상태는 미변경.
// puzzleStartPlyIdx = blunderIndex - 1 (실수 직전 ply 위치, scrub 출발점).
let puzzlePlyCursor = null;
let puzzleStartPlyIdx = -1;

// 비동기 replay/응수 자동재생이 진행 중에 사용자가 다음/이전 퍼즐로 이동하면 generation 증가 →
// stale loop이 깨우자마자 자기 generation이 무효임을 보고 종료. puzzleChess 오염 방지.
let _replayGen = 0;

// Deck별 진행 history — 카테고리별로 stories 위치 유지.
const deckState = {
    mistake: { history: [], position: -1 },
    mate: { history: [], position: -1 },
    done: { history: [], position: -1 },
};

// Dependencies injected via initVault()
let _showMovesOverlay = null;
let _closeMovesOverlay = null;
let _navigateTo = null;
let _onEmptyCta = null;

// ==========================================
// Categorization
// ==========================================
// 1차 분류: 'mistake'/'blunder'(cp 실수) → mistake, 'missed_mate' → mate, 'only_move' → only_move.
// 그 외(옛 'positional' 수동 저장 row 등)는 null 반환 — deck/list에서 자연 제외.
// 주의: stories(bottom-nav 퍼즐)의 filterItems는 'mistake'/'mate'만 매칭 — only_move는 stories에
// 안 뜨고 '실수로부터 배우기 > 퍼즐' 탭(filterLearnItems)에서만 노출 (Phase C 결정).
function categorize(item) {
    const c = (item?.category || '').toLowerCase();
    if (c === 'mistake' || c === 'blunder') return 'mistake';
    if (c === 'missed_mate') return 'mate';
    if (c === 'only_move') return 'only_move';
    return null;
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
// detail view의 vaultInfoCategory 색 라벨용 — chess 도메인 의미 보존을 위해 chip과 별도 유지.
function categoryColor(rawCategory) {
    const c = (rawCategory || '').toLowerCase();
    if (c === 'blunder' || c === 'missed_mate') return 'var(--blunder)';
    if (c === 'mistake' || c === 'missed')      return 'var(--mistake)';
    if (c === 'only_move')                      return 'var(--great)';
    if (c === 'inaccuracy')                     return 'var(--inaccuracy)';
    if (c === 'best' || c === 'excellent')      return 'var(--best)';
    return 'var(--tx2)';
}

function categoryLabel(rawCategory) {
    const c = (rawCategory || '').toLowerCase();
    if (c === 'blunder')                    return t('vault_filter_mistake');
    if (c === 'mistake' || c === 'missed')  return t('class_mistake');
    if (c === 'missed_mate')                return t('vault_puzzle_mate_label');
    if (c === 'only_move')                  return t('vault_category_only_move');
    if (c === 'inaccuracy')                 return t('class_inaccuracy');
    return (rawCategory || '').toUpperCase();
}

// 자신의 ID는 사용자가 이미 알고 있으므로 "vs 상대"만 노출. gameTitle은 보통 "{white} vs {black}".
function opponentLabel(item, myUserId) {
    const title = item.gameTitle || '';
    if (!title) return '';
    if (typeof item.isUserWhite === 'boolean') {
        const parts = title.split(' vs ');
        if (parts.length === 2) return `vs ${parts[item.isUserWhite ? 1 : 0]}`;
    }
    if (myUserId) {
        const re = new RegExp(`(?:^${myUserId}\\s+vs\\s+|\\s+vs\\s+${myUserId}$)`, 'i');
        if (re.test(title)) return `vs ${title.replace(re, '').trim()}`;
    }
    return title;
}

function renderVaultList(container, vaultItems, onOpen, opts = {}) {
    const { emptyText, emptyDesc, onEmptyCta } = opts;
    container.innerHTML = '';
    if (vaultItems.length === 0) {
        renderEmptyState(container, {
            icon: 'puzzle',
            title: emptyText || t('vault_empty'),
            desc: emptyDesc || t('vault_blunder_list_empty_desc'),
            ctaLabel: onEmptyCta ? t('vault_empty_cta') : undefined,
            onCta: onEmptyCta,
        });
        return;
    }

    const group = document.createElement('div');
    group.className = 'list-group';
    const myUserId = getMyUserId();
    const dateStrings = getDateStrings();

    sortByPlayedDate(vaultItems).forEach(item => {
        const isLegacy = item.source !== 'auto' && !item.pgn;

        const sanHtml = escapeHtml(item.san || '');
        const titleHtml = item.bestMove
            ? `${sanHtml} <span class="vault-row-arrow" aria-hidden="true">→</span> ${escapeHtml(item.bestMove)}`
            : sanHtml;

        const opp = opponentLabel(item, myUserId);
        const dateText = item.playedDate || item.date
            ? formatRelativeDate(item.playedDate || item.date, dateStrings)
            : '';
        const metaText = [opp, dateText].filter(Boolean).join(' · ');

        const el = document.createElement('div');
        el.className = 'list-row vault-row';
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        if (isLegacy) el.classList.add('list-row--legacy');

        el.innerHTML = `
            <div class="list-row-body">
                <div class="list-row-title">${titleHtml}</div>
                ${metaText ? `<div class="list-row-meta">${escapeHtml(metaText)}</div>` : ''}
                ${item.notes ? `<div class="list-row-notes">${escapeHtml(item.notes)}</div>` : ''}
            </div>
            <span class="list-row-chevron" aria-hidden="true">›</span>
        `;

        el.addEventListener('click', () => onOpen(item));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); }
        });
        group.appendChild(el);
    });

    container.appendChild(group);
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

const _vaultLoadingOverlay = document.getElementById('vaultLoadingOverlay');

// SWR — 캐시가 있으면 즉시 렌더(오버레이 없음) + 백그라운드 DB 갱신, cold 캐시면 오버레이 + DB await.
// _itemsCache는 로그인 시 write-through로 동기화된 캐시(정본은 Supabase), 익명 시 정본 그 자체.
async function loadVaultData() {
    const cached = getVaultItemsCached();
    if (cached.length > 0) {
        _itemsCache = cached;
        applyPuzzleFilter();
        startPuzzleSession();
        refreshItemsCache().then(reconcilePuzzleAfterRefresh);
        return;
    }
    return withScreenLoading(_vaultLoadingOverlay, async () => {
        await refreshItemsCache();
        applyPuzzleFilter();
        startPuzzleSession();
    });
}

// 백그라운드 DB 갱신 후 stories 동기화. 표시 중인 퍼즐은 그대로 둔다(풀이 도중 reset 방지) —
// 풀 크기·인디케이터만 갱신. 단, 빈 상태였다가 카드가 들어온 경우엔 세션을 새로 시작한다.
function reconcilePuzzleAfterRefresh() {
    applyPuzzleFilter();
    const showingEmpty = vaultPuzzleEmpty && !vaultPuzzleEmpty.classList.contains('hidden');
    if (puzzlePool.length === 0) showPuzzleEmpty(true);
    else if (showingEmpty) startPuzzleSession();
    else renderIndicator();
}

// skipFetch: detail view에서 back으로 복귀한 경우 true. 이때 _itemsCache는 detail 진입 직전
// 상태 + blur 시 메모 mirror가 이미 반영돼 있어 fetch가 불필요할 뿐 아니라, Supabase
// read-after-write lag으로 직전 메모 편집을 stale하게 덮을 위험이 있다 → fetch 스킵.
async function loadBlunderListData(skipFetch = false) {
    if (skipFetch) {
        renderBlunderListPane();
        return;
    }
    // SWR — 캐시로 즉시 렌더 후 백그라운드 갱신. 내용이 바뀌었을 때만 재렌더 — 안 바뀌었는데
    // 다시 그리면 리스트 DOM이 통째로 재구축돼 사용자 스크롤 위치가 튄다.
    const cached = getVaultItemsCached();
    if (cached.length > 0) {
        _itemsCache = cached;
        renderBlunderListPane();
        refreshItemsCache().then(changed => { if (changed) renderBlunderListPane(); });
        return;
    }
    return withScreenLoading(_vaultLoadingOverlay, async () => {
        await refreshItemsCache();
        renderBlunderListPane();
    });
}

function renderBlunderListPane() {
    const items = filterLearnItems(learnTab);
    renderVaultList(vaultBlunderList, items, openVaultItem, {
        emptyText: getLearnEmptyText(),
        emptyDesc: t('vault_blunder_list_empty_desc'),
        onEmptyCta: _onEmptyCta || null,
    });
    if (vaultBlunderFilterTabs) {
        vaultBlunderFilterTabs.querySelectorAll('.vault-filter-tab').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.filter === learnTab);
        });
    }
    // 노트 탭에서만 진척감 한 줄 — "20개 · 메모 5개". 빈 탭이면 empty state가 메시지를 주므로 숨김.
    if (learnNotesProgress) {
        if (learnTab === 'notes' && items.length > 0) {
            const written = items.filter(it => (it.notes || '').trim()).length;
            learnNotesProgress.textContent = t('learn_notes_progress')
                .replace('{total}', items.length)
                .replace('{written}', written);
            learnNotesProgress.classList.remove('hidden');
        } else {
            learnNotesProgress.classList.add('hidden');
        }
    }
}

// 리스트 렌더에 영향을 주는 필드만 뽑은 시그니처. SWR 백그라운드 갱신 후 내용이 그대로면
// 재렌더를 건너뛰는 데 쓴다 — renderVaultList가 innerHTML을 통째로 재구축해 스크롤이 튄다.
function itemsRenderSignature(items) {
    return items
        .map(it => `${it.id}|${it.category}|${it.san || ''}|${it.gameTitle || ''}|${it.solvedCount ?? 0}|${it.notes || ''}`)
        .join('\n');
}

// 반환: 캐시 내용이 직전 렌더 대비 바뀌었는지 — SWR 호출자가 재렌더 여부 판단에 쓴다.
async function refreshItemsCache() {
    // 교체 전 캐시의 메모를 보존 — Supabase PATCH 후 즉시 SELECT 시 read-after-write lag으로
    // 직전 메모 편집이 fetch 결과에 누락될 수 있다. 직전 캐시에 메모가 있는데 fetch가 빈 값을
    // 주면 직전 값을 신뢰("메모 적고 바로 나가면 진척감이 한 박자 늦는" 현상 방지).
    const prevNotesById = new Map(_itemsCache.map(it => [it.id, it.notes || '']));
    const prevSig = itemsRenderSignature(_itemsCache);
    let fresh;
    try {
        fresh = await getVaultItems();
    } catch (e) {
        fresh = [];
    }
    for (const it of fresh) {
        const prev = prevNotesById.get(it.id);
        if (prev && !(it.notes || '').trim()) it.notes = prev;
    }
    _itemsCache = fresh;
    return itemsRenderSignature(fresh) !== prevSig;
}

function isRetired(item) {
    return (item?.solvedCount ?? 0) >= SOLVED_RETIRE_THRESHOLD;
}

// 'mistake'/'mate'은 retire 카드 제외, 'done'은 retire 카드만 (카테고리 무관).
function filterItems(filter) {
    if (filter === 'done') {
        return _itemsCache.filter(it => categorize(it) && isRetired(it));
    }
    return _itemsCache.filter(it => categorize(it) === filter && !isRetired(it));
}

function getPuzzleEmptyText() {
    if (_itemsCache.length === 0) return t('vault_puzzle_empty');
    if (puzzleFilter === 'mate') return t('vault_puzzle_empty_mate');
    if (puzzleFilter === 'done') return t('vault_puzzle_empty_done');
    return t('vault_puzzle_empty_mistake');
}

// 실수로부터 배우기 sub-tab 분류.
// 'puzzle' = 풀이 가치 카드 — missed_mate + only_move (객관적 단일 정답).
// 'notes'  = 일반 실수 — 메모 대상. retire 여부 무관하게 전부 노출 (보관소 성격).
function filterLearnItems(tab) {
    if (tab === 'puzzle') {
        return _itemsCache.filter(it => {
            const cat = categorize(it);
            return cat === 'mate' || cat === 'only_move';
        });
    }
    return _itemsCache.filter(it => categorize(it) === 'mistake');
}

function getLearnEmptyText() {
    return learnTab === 'puzzle' ? t('learn_puzzle_empty') : t('learn_notes_empty');
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
    // back 복귀 시 loadBlunderListData가 fetch를 스킵하므로 _itemsCache도 직접 정리.
    removeItemEverywhere(vaultDetailItem.id);
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
    const isCoordsEnabled = getIsCoordsEnabled();
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
    vaultInfoCategory.textContent = categoryLabel(item.category);
    vaultInfoCategory.style.color = categoryColor(item.category);
    vaultInfoPlayed.textContent = (item.moveNumber ? `${item.moveNumber}${item.isWhite ? '. ' : '... '}` : '') + (item.san || '');
    // bestMove 없으면 빈 string으로 — CSS가 row 통째로 숨김 (.vault-info-row:has(:empty))
    vaultInfoBest.textContent = item.bestMove || '';
    if (vaultNotesInput) vaultNotesInput.value = item.notes || '';

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
    // Phase 58: puzzlePool은 session 시작 snapshot이라 직전 정답으로 retire된 카드가 stale로 남을 수 있음.
    // random pick 시점에 _itemsCache 기준으로 재필터링 → retire 즉시 반영. deck.history는 그대로 두어
    // 사용자가 prev로 직전 retire 카드를 다시 볼 수 있게 유지.
    const fresh = filterItems(puzzleFilter);
    if (!fresh || fresh.length === 0) return null;
    const seen = new Set(getActiveDeck().history);
    const unseen = fresh.filter(p => !seen.has(p.id));
    if (unseen.length > 0) return unseen[Math.floor(Math.random() * unseen.length)];
    return fresh[Math.floor(Math.random() * fresh.length)];
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
function renderIndicator() {
    if (!vaultPuzzleIndicator) return;
    const total = puzzlePool.length;
    if (total === 0) {
        vaultPuzzleIndicator.innerHTML = '';
        return;
    }
    const deck = getActiveDeck();
    const filled = Math.min(deck.position + 1, total);
    const pct = Math.max(0, Math.min(100, (filled / total) * 100));
    // 첫 렌더만 mount, 이후엔 width/text만 업데이트 — innerHTML 재생성하면 fill 노드가 새로 생겨서
    // CSS transition: width 0.3s가 매번 처음부터 시작되어 애니메이션이 보이지 않는 버그 회피.
    let fill = vaultPuzzleIndicator.querySelector('.puzzle-progress-fill');
    let count = vaultPuzzleIndicator.querySelector('.puzzle-progress-count');
    if (!fill || !count) {
        vaultPuzzleIndicator.innerHTML =
            `<div class="puzzle-progress"><div class="puzzle-progress-fill" style="width:${pct}%"></div></div>` +
            `<span class="puzzle-progress-count">${filled} / ${total}</span>`;
    } else {
        fill.style.width = `${pct}%`;
        count.textContent = `${filled} / ${total}`;
    }
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
    // label span만 갱신 — buttonText 전체를 textContent로 덮으면 SVG 아이콘이 날아간다.
    const labelEl = vaultPuzzleNextBtn.querySelector('.live-action-label');
    if (labelEl) labelEl.textContent = t(key);
    else vaultPuzzleNextBtn.textContent = t(key);
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
            renderEmptyState(vaultPuzzleEmpty, {
                icon: 'puzzle',
                title: getPuzzleEmptyText(),
                desc: t('vault_puzzle_empty_desc'),
                ctaLabel: _onEmptyCta ? t('vault_empty_cta') : undefined,
                onCta: _onEmptyCta || null,
            });
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

async function renderPuzzle(item) {
    // terminal 상태(이전 카드의 puzzleSolved 등)가 next 카드로 새지 않도록 진입 시 reset.
    puzzleSolved = false;
    puzzleProcessing = false;
    if (!item) {
        if (vaultPlyIndicator) {
            vaultPlyIndicator.textContent = '—';
            vaultPlyIndicator.classList.remove('vault-eval-dropped');
        }
        showPuzzleEmpty(true);
        return;
    }
    puzzleItem = item;
    const cat = categorize(item);
    if (!cat) {
        // 분류 불가능한 legacy row는 자동으로 다음 카드로 넘김 (categorize() 스키마 변경 후 잔존 데이터).
        removeItemEverywhere(item.id);
        return loadNextPuzzle();
    }
    await renderSolvableItem(item, cat === 'mate');
}

async function renderSolvableItem(item, isMate) {
    _replayGen++; // 진행 중인 replay/응수 무효화
    puzzleSolved = false;
    puzzleProcessing = false;
    const gc = item?.solution?.gameContext;
    puzzleStartPlyIdx = (gc && typeof gc.blunderIndex === 'number') ? gc.blunderIndex - 1 : -1;
    puzzlePlyCursor = puzzleStartPlyIdx;
    if (vaultEngineLinesContainer) vaultEngineLinesContainer.classList.add('hidden');
    renderIndicator();
    updatePlyIndicator();

    // 신 row는 prevFen 직접 사용. 옛 row는 PGN 로드 + moveIndex까지 replay 폴백.
    if (item.prevFen) {
        puzzlePrevFen = item.prevFen;
        try {
            puzzleChess = new Chess(item.prevFen);
        } catch {
            removeItemEverywhere(item.id);
            return loadNextPuzzle();
        }
    } else {
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
    }

    const moverIsWhite = !!item.isWhite;
    puzzleIsMate = isMate;
    puzzleMoverIsWhite = moverIsWhite;
    puzzleUserMoves = 0;
    puzzleMateBudget = (isMate && typeof item.mateIn === 'number' && item.mateIn > 0) ? item.mateIn : null;
    if (isMate) ensurePuzzleEngine().catch(() => {});

    if (vaultPuzzleHeader) {
        let txt = isMate ? t('vault_puzzle_find_mate') : t('vault_puzzle_find_best');
        if (puzzleMateBudget != null) txt += ` · M${puzzleMateBudget}`;
        // chip 제거 — 헤더 텍스트("최선수를 찾으세요"/"메이트를 찾으세요")가 카테고리 전달.
        vaultPuzzleHeader.textContent = txt;
    }
    if (vaultPuzzleSubhead) {
        const opp = opponentLabel(item, getMyUserId());
        const dateText = item.playedDate || item.date
            ? formatRelativeDate(item.playedDate || item.date, getDateStrings())
            : '';
        vaultPuzzleSubhead.textContent = [opp, dateText].filter(Boolean).join(' · ');
    }
    if (vaultPuzzleFeedback) vaultPuzzleFeedback.innerHTML = '';

    const isCoordsEnabled = getIsCoordsEnabled();
    const orientation = moverIsWhite ? 'white' : 'black';
    const movableColor = moverIsWhite ? 'white' : 'black';
    const dests = getDests(puzzleChess);
    const turnColor = puzzleChess.turn() === 'w' ? 'white' : 'black';

    if (!puzzleCg) {
        puzzleCg = Chessground(vaultPuzzleBoard, {
            fen: puzzlePrevFen,
            orientation,
            turnColor,
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
            turnColor,
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

    // Chessground init/redraw가 board children을 wipe하므로 redrawAll(30ms) 이후 시점에 attach.
    // 사용자 첫 수 시 onPuzzleUserMove에서 clearBlunderVisualization() 호출.
    setTimeout(() => renderBlunderVisualization(item), 80);
}

// missed_mate는 의도적으로 배지 제외 — "실수"라기보단 "메이트 못 봄"이라 같은 시각 마크 안 어울림.
const VAULT_CATEGORY_TO_CLS = { mistake: 'Mistake', blunder: 'Blunder' };

// item.san을 prevFen에서 replay해 from/to 추출.
function deriveBlunderFromTo(item) {
    if (!puzzlePrevFen || !item?.san) return null;
    try {
        const r = new Chess(puzzlePrevFen).move(item.san);
        return r ? { from: r.from, to: r.to } : null;
    } catch { return null; }
}

function renderBlunderVisualization(item) {
    if (!puzzleCg || !vaultPuzzleBoard) return;
    const ft = deriveBlunderFromTo(item);
    if (!ft) {
        puzzleCg.set({ drawable: { autoShapes: [] } });
        placePieceBadge(vaultPuzzleBoard, null, null, null);
        return;
    }
    // 빨간 화살표: 사용자가 둔 잘못된 수. engine 추천(paleGreen/blue)과 톤 구분.
    puzzleCg.set({ drawable: { autoShapes: [{ orig: ft.from, dest: ft.to, brush: 'red' }] } });
    const clsKey = VAULT_CATEGORY_TO_CLS[(item.category || '').toLowerCase()];
    placePieceBadge(vaultPuzzleBoard, ft.to, puzzleCg.state.orientation, clsKey);
}

function clearBlunderVisualization() {
    if (puzzleCg) puzzleCg.set({ drawable: { autoShapes: [] } });
    placePieceBadge(vaultPuzzleBoard, null, null, null);
}

// gameContext.plies 안에서 보드 시각만 이동 — puzzleChess 미변경. scrub 중 드래그 비활성.
// gameContext 없는 옛 row는 [-1: before / 0: after] 가상 toggle로 동작 — eval 값이 변함.
function navigatePly(delta) {
    const ctx = puzzleItem?.solution?.gameContext;
    const hasCtx = ctx && Array.isArray(ctx.plies) && ctx.plies.length > 0;
    const cur = puzzlePlyCursor != null ? puzzlePlyCursor : puzzleStartPlyIdx;
    const max = hasCtx ? ctx.plies.length - 1 : 0;
    const next = Math.max(-1, Math.min(max, cur + delta));
    if (next === cur) return;
    puzzlePlyCursor = next;
    showPlyOnBoard(next);
    updatePlyIndicator();
}

// 특정 ply 인덱스 위치를 보드에 visualize. -1은 prevFen(puzzle 시작).
// gameContext 있으면: idx ∈ [0..plies.length-1], plies[idx].fen
// gameContext 없으면: idx 0 = post-blunder fen (item.fen), 그 외 < 0 = prevFen
function showPlyOnBoard(idx) {
    if (!puzzleCg || !puzzleItem) return;
    const ctx = puzzleItem.solution?.gameContext;
    const hasCtx = ctx && Array.isArray(ctx.plies);
    let fen, lastMove;
    if (idx < 0) {
        fen = puzzlePrevFen || '';
        lastMove = undefined;
    } else if (hasCtx) {
        const ply = ctx.plies[idx];
        fen = ply?.fen || '';
        if (ply?.uci && ply.uci.length >= 4) {
            lastMove = [ply.uci.slice(0, 2), ply.uci.slice(2, 4)];
        }
    } else {
        // 옛 row 폴백 — 블런더 후 fen만 표시. lastMove SAN으로 추론은 비용↑이라 생략.
        fen = puzzleItem.fen || puzzlePrevFen || '';
        lastMove = undefined;
    }
    // scrubbing: 드래그 비활성. puzzle 시작 위치(idx === startPlyIdx)일 때만 드래그 가능.
    const atStart = (idx === puzzleStartPlyIdx) && !puzzleSolved;
    const userColor = puzzleMoverIsWhite ? 'white' : 'black';
    puzzleCg.set({
        fen,
        lastMove,
        movable: atStart ? {
            free: false, color: userColor, dests: getDests(puzzleChess),
            events: { after: onPuzzleUserMove },
        } : { free: false, color: undefined, dests: new Map() },
    });
    // 시작 위치로 돌아왔고 아직 풀지 않았으면 블런더 시각화 재표시 — 그 외엔 클리어
    if (atStart) {
        renderBlunderVisualization(puzzleItem);
    } else {
        clearBlunderVisualization();
    }
}

// 분석 화면 결의 단일 win-chance-display. 커서가 블런더 ply 이상이면 떨어진 값(빨강)으로 자동 전환 →
// 사용자가 < > 누를 때마다 88% → 37% 변화가 시각적으로 일어남. "왜 블런더인지" 숫자로 보임.
function updatePlyIndicator() {
    if (!vaultPlyIndicator || !puzzleItem) return;
    const item = puzzleItem;

    // 메이트 카드는 항상 mate-in 표시
    if (categorize(item) === 'mate' && item.mateIn) {
        vaultPlyIndicator.textContent = `M${item.mateIn}`;
        vaultPlyIndicator.classList.remove('vault-eval-dropped');
        return;
    }

    const wc = item.solution?.acceptable?.[0]?.winChance;
    const drop = item.winChanceDrop;
    const blunderIdx = item.solution?.gameContext?.blunderIndex;
    const cur = puzzlePlyCursor != null ? puzzlePlyCursor : puzzleStartPlyIdx;
    // gameContext 있으면 cursor가 blunderIdx에 도달했을 때, 없으면 cursor ≥ 0 (가상 after)일 때 드롭.
    const dropped = (typeof blunderIdx === 'number')
        ? cur >= blunderIdx
        : cur >= 0;

    if (typeof wc === 'number' && typeof drop === 'number') {
        const value = dropped ? wc - drop : wc;
        vaultPlyIndicator.textContent = `${Math.max(0, Math.round(value * 100))}%`;
        vaultPlyIndicator.classList.toggle('vault-eval-dropped', dropped);
        return;
    }

    // 옛 row 폴백 — cpLoss만 있을 때
    if (typeof item.cpLoss === 'number' && item.cpLoss > 0) {
        vaultPlyIndicator.textContent = `−${item.cpLoss}cp`;
        vaultPlyIndicator.classList.add('vault-eval-dropped');
        return;
    }

    vaultPlyIndicator.textContent = '—';
    vaultPlyIndicator.classList.remove('vault-eval-dropped');
}

// 풀이 종료 후 acceptable 라인들을 분석 화면 engine-line UI로 표시.
// 호버 → 첫 수 화살표 미리보기. 클릭 → 보드에 step-by-step replay.
function renderAcceptableLines(item) {
    if (!vaultEngineLinesContainer) return;
    const acceptable = item?.solution?.acceptable;
    if (!acceptable || acceptable.length === 0) {
        vaultEngineLinesContainer.classList.add('hidden');
        return;
    }
    const lines = acceptable.map((L, i) => ({
        scoreNum: L.winChance != null ? (L.winChance - 0.5) * 2 : 0, // 표시용 — 0~1 winChance를 -1~1 cp 비슷한 신호로
        scoreStr: i === 0 ? '★' : '=',
        pv: (L.moves || []).map(m => m.san).join(' '),
        uci: L.uci || '',
    }));

    // "내가 둔 수" — gameContext.plies[blunderIndex..]가 실제 게임 흐름. 클릭 시 자동 재생.
    const gc = item?.solution?.gameContext;
    if (gc && Array.isArray(gc.plies) && typeof gc.blunderIndex === 'number' && gc.blunderIndex < gc.plies.length) {
        const userMoves = gc.plies.slice(gc.blunderIndex);
        const blunderPly = gc.plies[gc.blunderIndex];
        if (userMoves.length > 0) {
            lines.push({
                scoreNum: 0,
                scoreStr: '◾',
                pv: userMoves.map(m => m.san).join(' '),
                uci: blunderPly?.uci || '',
            });
        }
    }

    renderEngineLines(vaultEngineLinesContainer, lines, onLineHover, onLineLeave, onLineClick);
    vaultEngineLinesContainer.classList.remove('hidden');
}

function onLineHover(uci) {
    if (!puzzleCg || !uci || uci.length < 4) return;
    puzzleCg.set({ drawable: { autoShapes: [{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: 'paleGreen' }] } });
}

function onLineLeave() {
    if (!puzzleCg) return;
    puzzleCg.set({ drawable: { autoShapes: [] } });
}

// 정답 라인 클릭 → prevFen에서 시작해 step-by-step replay.
// index가 acceptable 범위 밖이면 "내가 둔 수" — gameContext.plies[blunderIndex..] replay.
async function onLineClick(index) {
    const item = puzzleItem;
    const acceptable = item?.solution?.acceptable || [];

    let moves;
    if (index < acceptable.length) {
        moves = acceptable[index].moves || [];
    } else {
        // "내가 둔 수" — gameContext.plies[blunderIndex..]
        const gc = item?.solution?.gameContext;
        if (!gc || !Array.isArray(gc.plies)) return;
        moves = gc.plies.slice(gc.blunderIndex);
    }

    if (moves.length === 0 || !puzzlePrevFen) return;
    const myGen = ++_replayGen;
    const tmp = new Chess(puzzlePrevFen);
    puzzleCg.set({ fen: tmp.fen(), drawable: { autoShapes: [] }, movable: { color: undefined, dests: new Map() } });
    placePieceBadge(vaultPuzzleBoard, null, null, null);
    for (const m of moves) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (myGen !== _replayGen) return; // 사용자가 다른 카드로 이동했으면 stale
        const result = tmp.move(m.san);
        if (!result) break;
        puzzleCg.set({ fen: tmp.fen(), lastMove: [result.from, result.to] });
    }
}

async function onPuzzleUserMove(orig, dest, meta) {
    if (puzzleSolved || puzzleProcessing) return;

    let played;
    try {
        played = puzzleChess.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
        played = null;
    }
    if (!played) return;

    // 사용자 첫 수 → 블런더 시각화 제거 (원래 포지션 컨텍스트는 의미 잃음)
    clearBlunderVisualization();

    puzzleProcessing = true;
    puzzleCg.set({
        fen: puzzleChess.fen(),
        turnColor: puzzleChess.turn() === 'w' ? 'white' : 'black',
        movable: { color: undefined, dests: new Map() },
    });

    try {
        // 메이트는 엔진 검증 (대체 라인 인정 + 느려진 mate 거부 via puzzleMateBudget).
        // 그 외 solution 있는 row는 시퀀스 기반 lock-and-follow.
        if (puzzleIsMate) {
            await handleMateMove(played);
        } else if (puzzleItem?.solution?.acceptable?.length > 0) {
            await handleSequenceMove(played);
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

// SAN 비교용 정규화 — chess.js는 체크/메이트(+/#)를 SAN에 포함하지만 비교 시 무시.
function normSan(s) { return (s || '').replace(/[+#]$/, ''); }

// 시퀀스 플레이백 핸들러. acceptable 중 매칭 라인 lock → 응수 자동 → 다음 user 수 대기.
// 블런더는 한 수만 두면 정답 처리. 시퀀스 끝까지 매칭은 너무 어려워 학습 가치 ↓ —
// 첫 수가 acceptable 라인 중 어느 것이든 매칭하면 정답. 이후는 engine-line 패널로 다중 라인 노출.
async function handleSequenceMove(played) {
    const playedSan = normSan(played.san);
    const matched = puzzleItem.solution.acceptable.some(L => {
        const first = L.moves?.[0];
        return first && first.side === 'user' && normSan(first.san) === playedSan;
    });
    puzzleSolved = true;
    renderPuzzleFeedback({ correct: matched, played });
}

async function handleMateMove(played) {
    puzzleUserMoves++;

    if (puzzleChess.isCheckmate()) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: true, played, mateDelivered: true });
        return;
    }

    if (puzzleMateBudget != null && puzzleUserMoves >= puzzleMateBudget) {
        puzzleSolved = true;
        renderPuzzleFeedback({ correct: false, played });
        return;
    }

    // 엔진 호출 전 generation token을 캡처. await 도중 사용자가 "다음 퍼즐"로 넘어가면 stale 응수가 새 보드에 반영되지 않도록 가드.
    const gen = _replayGen;
    const line = await analyzeForMate(puzzleChess.fen());
    if (gen !== _replayGen) return;

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

// 보드 외곽에 정/오답 ring 플래시 (haptic 대안 시각 피드백, ~550ms)
function flashBoard(correct) {
    const wrap = vaultPuzzleBoard?.parentElement;
    if (!wrap) return;
    wrap.classList.remove('vault-flash-correct', 'vault-flash-wrong');
    void wrap.offsetWidth; // 같은 클래스 재트리거 시 애니메이션이 다시 돌도록 reflow
    wrap.classList.add(correct ? 'vault-flash-correct' : 'vault-flash-wrong');
}

function renderPuzzleFeedback({ correct, played, mateDelivered }) {
    if (!vaultPuzzleFeedback || !puzzleItem) return;
    flashBoard(correct || mateDelivered);

    // Phase 58: 정답이면 solvedCount++. _itemsCache의 해당 row도 동기화해 다음 풀 갱신 시 자동 retire.
    // 오답은 카운트 변동 없음 (사용자 결정).
    if (correct || mateDelivered) {
        // Supabase-only 카드(localStorage 미러 없음) 대비 — 메모리의 현재값을 fallback으로 전달.
        const next = incrementVaultItemSolved(puzzleItem.id, puzzleItem.solvedCount ?? 0);
        puzzleItem.solvedCount = next;
        const cached = _itemsCache.find(it => it.id === puzzleItem.id);
        if (cached) cached.solvedCount = next;
    }

    let headLabel, headColor;
    if (mateDelivered) {
        headLabel = t('vault_puzzle_mate_solved');
        headColor = 'var(--best)';
    } else {
        headLabel = correct ? t('vault_puzzle_correct') : t('vault_puzzle_incorrect');
        headColor = correct ? 'var(--best)' : 'var(--blunder)';
    }
    // verdict head + 오답 시 "둔 수"만. 정답 시퀀스는 engine-line panel이 다중 라인으로 보여줌.
    const youPlayed = !correct && played?.san
        ? `<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_you_played')}</span> <strong>${escapeHtml(played.san)}</strong></div>`
        : '';
    vaultPuzzleFeedback.innerHTML =
        `<div class="puzzle-fb-head" style="color:${headColor};">${escapeHtml(headLabel)}</div>` + youPlayed;

    // 정답 라인을 engine-line UI로 표시 (호버=화살표, 클릭=replay).
    renderAcceptableLines(puzzleItem);
}

export function redrawVaultPuzzleBoard() {
    if (puzzleCg && vaultPuzzlePane && !vaultPuzzlePane.classList.contains('hidden')) {
        puzzleCg.redrawAll();
    }
}

// ==========================================
// Public API for main.js integration
// ==========================================

// vault 라우팅 — main.js renderScreen이 3개 vault 화면(vault_list/vault_blunder_list/
// vault_detail)을 이 컨트롤러에 위임한다. 어떤 뷰를 띄우고 무엇을 로드할지는 vault.js가 단독 소유.
export function hideVaultViews() {
    vaultView.classList.add('hidden');
    vaultBlunderListView.classList.add('hidden');
    vaultDetailView.classList.add('hidden');
}

// 활성 vault 화면만 노출하고 해당 로더를 호출. vault_detail은 openVaultItem이 뷰를 이미
// 채워두므로 표시만 토글. prevScreen은 blunder-list의 read-after-write fetch 스킵 판단용 —
// detail에서 back 복귀 시 직전 메모 편집이 stale fetch로 날아가지 않게 한다.
export function renderVaultScreen(screen, prevScreen) {
    vaultView.classList.toggle('hidden', screen !== 'vault_list');
    vaultBlunderListView.classList.toggle('hidden', screen !== 'vault_blunder_list');
    vaultDetailView.classList.toggle('hidden', screen !== 'vault_detail');
    if (screen === 'vault_list') {
        loadVaultData();
    } else if (screen === 'vault_blunder_list') {
        loadBlunderListData(prevScreen === 'vault_detail');
    }
}

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
let _vaultInitialized = false;
export function initVault({ showMovesOverlay, closeMovesOverlay, navigateTo, onEmptyCta }) {
    if (_vaultInitialized) return;
    _vaultInitialized = true;
    _showMovesOverlay = showMovesOverlay;
    _closeMovesOverlay = closeMovesOverlay;
    _navigateTo = navigateTo || null;
    _onEmptyCta = onEmptyCta || null;

    vaultDetailBackBtn.addEventListener('click', () => {
        history.back();
    });

    if (vaultBlunderListBackBtn) {
        vaultBlunderListBackBtn.addEventListener('click', () => {
            history.back();
        });
    }

    // 카테고리 탭 (블런더/메이트)
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

    // 실수로부터 배우기 — 퍼즐/노트 sub-tab
    if (vaultBlunderFilterTabs) {
        vaultBlunderFilterTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.vault-filter-tab');
            if (!btn) return;
            const tab = btn.dataset.filter;
            if (!tab || tab === learnTab) return;
            learnTab = tab;
            renderBlunderListPane();
        });
    }

    // 하단 액션바 (이전 / 다시 / 다음 퍼즐)
    if (vaultPuzzleNextBtn) {
        vaultPuzzleNextBtn.addEventListener('click', () => loadNextPuzzle());
    }
    if (vaultPrevPuzzleBtn) {
        vaultPrevPuzzleBtn.addEventListener('click', () => loadPrevPuzzle());
    }
    if (vaultResetPuzzleBtn) {
        vaultResetPuzzleBtn.addEventListener('click', () => {
            // 같은 카드를 처음부터 다시 — puzzleItem이 set돼 있으면 그걸로 다시 render.
            if (puzzleItem) renderPuzzle(puzzleItem);
        });
    }

    // unified-controls < > — gameContext.plies 안 scrub. 보드만 시각 변경, puzzleChess 상태 미변경.
    if (vaultPrevPlyBtn) {
        vaultPrevPlyBtn.addEventListener('click', () => navigatePly(-1));
    }
    if (vaultNextPlyBtn) {
        vaultNextPlyBtn.addEventListener('click', () => navigatePly(1));
    }

    // 키보드 화살표 — 풀이 완료 후에만 다음/이전 카드로.
    document.addEventListener('keydown', (e) => {
        if (!vaultPuzzlePane || vaultPuzzlePane.classList.contains('hidden')) return;
        if (!vaultView || vaultView.classList.contains('hidden')) return;
        if (!puzzleSolved) return;
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

    // 메모 자동 저장 (Phase 59) — textarea blur 시. detail을 떠나는 back/삭제도 blur를 먼저 발생시킴.
    // 변경 없으면 skip해 불필요한 DB write 차단. _itemsCache mirror로 리스트 복귀 시 진척감 즉시 반영.
    if (vaultNotesInput) {
        vaultNotesInput.addEventListener('blur', () => {
            if (!vaultDetailItem) return;
            const value = vaultNotesInput.value.trim();
            if (value === (vaultDetailItem.notes || '')) return;
            vaultDetailItem.notes = value;
            updateVaultItemNotes(vaultDetailItem.id, value);
            // _itemsCache mirror — refreshItemsCache가 이 값을 prevNotesById로 보존한다.
            const cached = _itemsCache.find(it => it.id === vaultDetailItem.id);
            if (cached) cached.notes = value;
        });
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
