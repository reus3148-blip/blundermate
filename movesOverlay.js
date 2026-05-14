import { showToast } from './dialogs.js';
import { t } from './strings.js';

const movesOverlay = document.getElementById('movesOverlay');
const movesOverlaySheet = movesOverlay?.querySelector('.moves-overlay-sheet');
const movesOverlayCloseBtn = document.getElementById('movesOverlayCloseBtn');
const movesOverlayReviewBtn = document.getElementById('movesOverlayReviewBtn');
const copyPgnBtn = document.getElementById('copyPgnBtn');

let initialized = false;
let appContainer = null;
let overlayGetPgn = null;
let fallbackGetPgn = () => '';
let reviewHandler = null;

function placeMovesSheetUnderBoard() {
    if (!movesOverlaySheet || !appContainer) return;
    const board = document.querySelector('.view-container:not(.hidden) .board-wrapper');
    if (!board) return;
    const top = board.getBoundingClientRect().bottom - appContainer.getBoundingClientRect().top;
    movesOverlaySheet.style.top = top + 'px';
}

function onMovesOverlayKey(e) {
    if (e.key === 'Escape') closeMovesOverlay();
}

async function copyCurrentPgn() {
    const pgn = overlayGetPgn ? overlayGetPgn() : fallbackGetPgn();
    if (!pgn) return;
    try {
        await navigator.clipboard.writeText(pgn);
        showToast(t('copied'));
    } catch (_) {
        showToast(t('feedback_error_network'));
    }
}

export function initMovesOverlay({ appContainer: container, getFallbackPgn, onReview }) {
    appContainer = container;
    fallbackGetPgn = getFallbackPgn || fallbackGetPgn;
    reviewHandler = onReview || null;
    if (initialized) return;
    initialized = true;

    movesOverlayReviewBtn?.addEventListener('click', () => {
        closeMovesOverlay();
        reviewHandler?.();
    });
    movesOverlayCloseBtn?.addEventListener('click', closeMovesOverlay);
    copyPgnBtn?.addEventListener('click', copyCurrentPgn);
}

export function showMovesOverlay({ getPgn, renderBody, reviewable = false } = {}) {
    if (!movesOverlay) return;
    overlayGetPgn = getPgn || null;
    if (renderBody) renderBody();
    movesOverlayReviewBtn?.classList.toggle('hidden', !reviewable);
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    placeMovesSheetUnderBoard();
    void movesOverlay.offsetWidth;
    movesOverlay.classList.add('open');
    document.body.classList.add('moves-overlay-open');
    document.addEventListener('keydown', onMovesOverlayKey);
}

export function closeMovesOverlay() {
    if (!movesOverlay) return;
    movesOverlay.classList.remove('open');
    overlayGetPgn = null;
    document.body.classList.remove('moves-overlay-open');
    document.removeEventListener('keydown', onMovesOverlayKey);
}
