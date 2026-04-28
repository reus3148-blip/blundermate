import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { parseAndLoadPgn, escapeHtml, getDests } from './utils.js';
import { getVaultItems, removeVaultItem, getAnalyzedGameById, COORDS_KEY } from './storage.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';

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
let puzzlePool = [];         // 캐시된 자동 풀
let puzzleSolved = false;    // 사용자가 한 수를 입력했는가
let puzzlePrevFen = null;    // 직전 포지션 FEN (사용자가 둘 자리)

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
export async function loadVaultData() {
    setVaultMode('list');
    await updateVaultView();
    // 보기 모드 풀은 미리 캐시 (탭 전환 시 즉시 렌더)
    await refreshPuzzlePool();
}

async function updateVaultView() {
    const items = await getVaultItems({ source: 'manual' });
    renderVaultList(vaultList, items, openVaultItem);
}

// 자동 풀 (블런더 목록 / 보기 모드 공통). 별도 화면 진입 시 호출.
export async function loadBlunderListData() {
    const items = await getVaultItems({ source: 'auto' });
    renderVaultList(vaultBlunderList, items, openVaultItem, {
        emptyText: t('vault_blunder_list_empty'),
    });
}

async function refreshPuzzlePool() {
    try {
        puzzlePool = await getVaultItems({ source: 'auto' });
    } catch (e) {
        puzzlePool = [];
    }
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

    console.log('[Vault Load]', {
        itemFen: item.fen, itemMoveIndex: item.moveIndex,
        matchedIndex: targetIdx, totalMoves: vaultDetailFens.length,
        boardFen: vaultDetailFens[targetIdx]
    });

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
function pickRandomPuzzle() {
    if (!puzzlePool || puzzlePool.length === 0) return null;
    const idx = Math.floor(Math.random() * puzzlePool.length);
    return puzzlePool[idx];
}

async function startPuzzleSession() {
    await refreshPuzzlePool();
    if (!puzzlePool || puzzlePool.length === 0) {
        showPuzzleEmpty(true);
        return;
    }
    showPuzzleEmpty(false);
    loadNextPuzzle();
}

function showPuzzleEmpty(empty) {
    if (vaultPuzzleEmpty) vaultPuzzleEmpty.classList.toggle('hidden', !empty);
    if (vaultPuzzleStage) vaultPuzzleStage.classList.toggle('hidden', empty);
}

async function loadNextPuzzle() {
    const item = pickRandomPuzzle();
    if (!item) {
        showPuzzleEmpty(true);
        return;
    }
    puzzleItem = item;
    puzzleSolved = false;

    // 직전 포지션을 얻기 위해 PGN을 로드해서 move_index까지 replay
    const game = await getAnalyzedGameById(item.analyzedGameId);
    if (!game?.pgn) {
        // 풀에서 제외하고 다음 출제
        puzzlePool = puzzlePool.filter(p => p.id !== item.id);
        return loadNextPuzzle();
    }

    const tempChess = new Chess();
    const result = parseAndLoadPgn(tempChess, game.pgn);
    if (!result.success) {
        puzzlePool = puzzlePool.filter(p => p.id !== item.id);
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

function onPuzzleUserMove(orig, dest, meta) {
    if (puzzleSolved) return;
    puzzleSolved = true;

    // promotion 기본 q (퍼즐에서 자동 승격)
    let played;
    try {
        played = puzzleChess.move({ from: orig, to: dest, promotion: 'q' });
    } catch {
        played = null;
    }
    if (!played) return;

    const expectedSan = (puzzleItem.bestMove || '').replace(/[+#]$/, '');
    const playedSan = played.san.replace(/[+#]$/, '');
    const correct = expectedSan && playedSan === expectedSan;

    // 보드 상태 잠금
    puzzleCg.set({
        fen: puzzleChess.fen(),
        turnColor: puzzleChess.turn() === 'w' ? 'white' : 'black',
        movable: { color: undefined, dests: new Map() },
    });

    renderPuzzleFeedback({ correct, played });
}

function renderPuzzleFeedback({ correct, played }) {
    if (!vaultPuzzleFeedback || !puzzleItem) return;
    const cls = (puzzleItem.category || '').toLowerCase();
    const isMate = cls === 'missed_mate';

    const headLabel = correct ? t('vault_puzzle_correct') : t('vault_puzzle_incorrect');
    const headColor = correct ? 'var(--best)' : 'var(--blunder)';

    const lines = [];
    if (!correct) {
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_you_played')}</span> <strong>${escapeHtml(played.san)}</strong></div>`);
        lines.push(`<div class="puzzle-fb-line"><span class="puzzle-fb-label">${t('vault_puzzle_best')}</span> <strong>${escapeHtml(puzzleItem.bestMove || '')}</strong></div>`);
    } else {
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

    // 퍼즐 다음 버튼
    if (vaultPuzzleNextBtn) {
        vaultPuzzleNextBtn.addEventListener('click', () => {
            loadNextPuzzle();
        });
    }

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
