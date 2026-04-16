import { Chessground } from 'https://cdnjs.cloudflare.com/ajax/libs/chessground/9.0.0/chessground.min.js';
import { parseAndLoadPgn, escapeHtml } from './utils.js';
import { getVaultItems, removeVaultItem } from './storage.js';
import { renderMovesTable } from './ui.js';
import { t } from './strings.js';

// ==========================================
// DOM Elements
// ==========================================
const homeView = document.getElementById('homeView');
const openVaultBtn = document.getElementById('openVaultBtn');
const vaultCountText = document.getElementById('vaultCountText');
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
const movesBody = document.getElementById('movesBody');

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

// Dependencies injected via initVault()
let _showMovesOverlay = null;
let _closeMovesOverlay = null;

// ==========================================
// Rendering (moved from ui.js)
// ==========================================
function renderVaultList(container, vaultItems, onDelete, onOpen) {
    container.innerHTML = '';
    if (vaultItems.length === 0) {
        container.innerHTML = `<div class="empty-state">${t('vault_empty')}</div>`;
        return;
    }

    vaultItems.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        let borderCol = 'var(--border-color)';
        if(item.category === 'blunder') borderCol = 'var(--accent-danger)';
        else if(item.category === 'mistake' || item.category === 'missed') borderCol = 'var(--accent-warning)';

        const isLegacy = !item.pgn;
        const moveLabel = item.moveNumber ? `${item.moveNumber}${item.isWhite ? '.' : '...'} ` : '';

        const el = document.createElement('div');
        el.className = 'game-item';
        el.style.borderLeft = `4px solid ${borderCol}`;
        if (isLegacy) el.style.opacity = '0.6';

        el.innerHTML = `
            <div class="game-item-content">
                <div class="game-category" style="color: ${borderCol};">${escapeHtml(item.category)}${isLegacy ? ' · legacy' : ''}</div>
                ${item.gameTitle ? `<div class="game-title">${escapeHtml(item.gameTitle)}</div>` : ''}
                <div class="game-san">Played: <strong>${escapeHtml(moveLabel + item.san)}</strong></div>
                <div class="game-best">Best: ${escapeHtml(item.bestMove) || 'Unknown'}</div>
                ${item.notes ? `<div class="game-notes">${escapeHtml(item.notes)}</div>` : ''}
            </div>
            <button class="delete-btn" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
        `;

        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(item.id);
        });

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

// ==========================================
// Core Functions
// ==========================================
export async function initHomeVaultBadge() {
    const vaultItems = await getVaultItems();
    const count = vaultItems.length;
    if (count > 0) {
        vaultCountText.textContent = t('vault_count').replace('{count}', count);
        vaultCountText.classList.remove('hidden');
    } else {
        vaultCountText.classList.add('hidden');
    }
}

async function openVaultFromHome() {
    homeView.classList.add('hidden');
    vaultView.classList.remove('hidden');
    await updateVaultView();
}

async function updateVaultView() {
    const items = await getVaultItems();
    renderVaultList(vaultList, items, async (id) => {
        if (confirm('Delete this saved move from your Vault?')) {
            removeVaultItem(id);
            await updateVaultView();
        }
    }, openVaultItem);
}

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
    const isCoordsEnabled = localStorage.getItem('coordsEnabled') === 'true';
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
        vaultDetailMoveLabel.textContent = 'Start';
        vaultDetailCounter.textContent = `0 / ${vaultDetailFens.length}`;
    } else {
        const moveNumber = Math.floor(vaultDetailIndex / 2) + 1;
        const isWhite = vaultDetailIndex % 2 === 0;
        vaultDetailMoveLabel.textContent = `${moveNumber}${isWhite ? '.' : '...'} ${vaultDetailSans[vaultDetailIndex]}`;
        vaultDetailCounter.textContent = `${vaultDetailIndex + 1} / ${vaultDetailFens.length}`;
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
export function initVault({ showMovesOverlay, closeMovesOverlay }) {
    _showMovesOverlay = showMovesOverlay;
    _closeMovesOverlay = closeMovesOverlay;

    openVaultBtn.addEventListener('click', openVaultFromHome);

    vaultBackBtn.addEventListener('click', () => {
        vaultView.classList.add('hidden');
        homeView.classList.remove('hidden');
        initHomeVaultBadge();
    });

    vaultDetailBackBtn.addEventListener('click', () => {
        vaultDetailView.classList.add('hidden');
        vaultView.classList.remove('hidden');
    });

    vaultDetailPrevBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex - 1));
    vaultDetailNextBtn.addEventListener('click', () => setVaultDetailIndex(vaultDetailIndex + 1));

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
