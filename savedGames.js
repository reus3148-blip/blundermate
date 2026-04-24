import { getSavedGames, addSavedGame, removeSavedGame, updateSavedGame } from './storage.js';
import { escapeHtml } from './utils.js';
import { t } from './strings.js';

const BOOKMARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

// ==========================================
// DOM Elements
// ==========================================
const homeView = document.getElementById('homeView');
const savedGamesView = document.getElementById('savedGamesView');
const savedGamesList = document.getElementById('savedGamesList');
const savedGamesBackBtn = document.getElementById('savedGamesBackBtn');
const savedGamesFilterBar = document.getElementById('savedGamesFilterBar');

const saveGameModal = document.getElementById('saveGameModal');
const saveGameTitle = document.getElementById('saveGameTitle');
const saveGameNotes = document.getElementById('saveGameNotes');
const saveGameCategoryPicker = document.getElementById('saveGameCategoryPicker');
const cancelSaveGameBtn = document.getElementById('cancelSaveGameBtn');
const confirmSaveGameBtn = document.getElementById('confirmSaveGameBtn');

const saveChoiceModal = document.getElementById('saveChoiceModal');
const choiceSaveGameBtn = document.getElementById('choiceSaveGameBtn');

// ==========================================
// Category helpers
// ==========================================
const CATEGORY_I18N = {
    my_game: 'saved_games_cat_my_game',
    otb: 'saved_games_cat_otb',
    opening: 'saved_games_cat_opening',
    pro: 'saved_games_cat_pro',
};

function getSelectedCategory() {
    const sel = saveGameCategoryPicker.querySelector('.pill-btn.selected');
    return sel ? sel.dataset.value : 'my_game';
}

let _activeFilter = 'all';
let _editingGameId = null;
let _pendingSavePgn = null; // 카드의 저장 버튼에서 모달을 열 때 사용할 PGN (분석 화면의 chess 인스턴스 대신)
let _navigateTo = null;

// ==========================================
// Rendering
// ==========================================
function renderSavedGamesList(container, savedGames, onDelete, onLoad, onEdit) {
    container.innerHTML = '';
    container.className = 'games-list view-list saved-games-list';

    const filtered = _activeFilter === 'all'
        ? savedGames
        : savedGames.filter(g => g.category === _activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state">${t('saved_games_empty')}</div>`;
        return;
    }

    filtered.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(item => {
        const el = document.createElement('div');
        el.className = 'saved-game-card';

        const catKey = CATEGORY_I18N[item.category] || CATEGORY_I18N['my_game'];
        const catLabel = t(catKey);

        el.innerHTML = `
            <div class="saved-game-card-top">
                <span class="saved-game-card-title">${escapeHtml(item.title)}</span>
                <span class="saved-game-card-pill">${escapeHtml(catLabel)}</span>
            </div>
            <div class="saved-game-card-bottom">
                <span class="saved-game-card-date">${new Date(item.date).toLocaleDateString()}</span>
                <div class="saved-game-card-actions">
                    <button class="card-save-btn" title="Save" aria-label="Save">${BOOKMARK_SVG}</button>
                    <button class="edit-btn" title="${t('saved_games_edit')}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="delete-btn" title="${t('saved_games_delete')}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;

        el.querySelector('.card-save-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openSaveGameModalForPgn(item.pgn, item.title);
        });

        el.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onEdit(item);
        });

        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(item.id);
        });

        el.addEventListener('click', () => onLoad(item.pgn));
        container.appendChild(el);
    });
}

// ==========================================
// Core Functions
// ==========================================
export async function openSavedGamesFromHome() {
    _activeFilter = 'all';
    syncFilterBar();
    if (_navigateTo) _navigateTo('saved_games');
    homeView.classList.add('hidden');
    const vaultViewEl = document.getElementById('vaultView');
    const vaultDetailViewEl = document.getElementById('vaultDetailView');
    if (vaultViewEl) vaultViewEl.classList.add('hidden');
    if (vaultDetailViewEl) vaultDetailViewEl.classList.add('hidden');
    savedGamesView.classList.remove('hidden');
    await updateSavedGamesView();
}

// Dependencies injected via initSavedGames()
let _onLoadGame = null;
let _getChess = null;
let _showButtonSuccess = null;
let _saveMoveBtn = null;

async function updateSavedGamesView() {
    const games = await getSavedGames();
    renderSavedGamesList(savedGamesList, games, async (id) => {
        if (confirm(t('saved_games_delete_confirm'))) {
            removeSavedGame(id);
            await updateSavedGamesView();
        }
    }, (pgn) => {
        savedGamesView.classList.add('hidden');
        if (_onLoadGame) _onLoadGame(pgn);
    }, (item) => {
        openEditModal(item);
    });
}

function syncFilterBar() {
    savedGamesFilterBar.querySelectorAll('.pill-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.filter === _activeFilter);
    });
}

// ==========================================
// Public API
// ==========================================
export function initSavedGames({ onLoadGame, getChess, showButtonSuccess, saveMoveBtn, initHomeVaultBadge, navigateTo }) {
    _onLoadGame = onLoadGame;
    _getChess = getChess;
    _showButtonSuccess = showButtonSuccess;
    _saveMoveBtn = saveMoveBtn;
    _navigateTo = navigateTo || null;

    if (cancelSaveGameBtn) {
        cancelSaveGameBtn.addEventListener('click', () => {
            _editingGameId = null;
            _pendingSavePgn = null;
            saveGameModal.classList.add('hidden');
        });
    }

    savedGamesBackBtn.addEventListener('click', () => {
        history.back();
    });

    // Category picker (Save Game modal)
    saveGameCategoryPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill-btn');
        if (!btn) return;
        saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });

    // Filter bar (Saved Games list)
    savedGamesFilterBar.addEventListener('click', async (e) => {
        const btn = e.target.closest('.pill-btn');
        if (!btn) return;
        _activeFilter = btn.dataset.filter;
        syncFilterBar();
        await updateSavedGamesView();
    });

    choiceSaveGameBtn.addEventListener('click', () => {
        saveChoiceModal.classList.add('hidden');
        _editingGameId = null;

        let defaultTitle = t('saved_games_default_title');
        const chess = _getChess();
        const h = chess?.header?.();
        if (h && h.White && h.Black && h.White !== '?' && h.Black !== '?') {
            defaultTitle = `${h.White} vs ${h.Black}`;
        }

        saveGameTitle.value = defaultTitle;
        saveGameNotes.value = '';
        // Reset category picker to default
        saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
        saveGameCategoryPicker.querySelector('[data-value="my_game"]').classList.add('selected');
        saveGameModal.classList.remove('hidden');
    });

    confirmSaveGameBtn.addEventListener('click', async () => {
        const title = saveGameTitle.value.trim() || t('saved_games_untitled');
        const notes = saveGameNotes.value.trim();
        const category = getSelectedCategory();

        if (_editingGameId) {
            updateSavedGame(_editingGameId, { title, notes, category });
            _editingGameId = null;
            saveGameModal.classList.add('hidden');
            await updateSavedGamesView();
            return;
        }

        let pgn = _pendingSavePgn;
        if (!pgn) {
            const chess = _getChess();
            pgn = chess.pgn();
        }

        const savedGameItem = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            title: title,
            notes: notes,
            category: category,
            pgn: pgn
        };

        addSavedGame(savedGameItem);
        _pendingSavePgn = null;
        saveGameModal.classList.add('hidden');
        if (savedGamesView && !savedGamesView.classList.contains('hidden')) {
            await updateSavedGamesView();
        }
        _showButtonSuccess(_saveMoveBtn, t('saved_games_saved'));
    });
}

export function openSaveGameModalForPgn(pgn, defaultTitle) {
    _editingGameId = null;
    _pendingSavePgn = pgn;

    saveGameTitle.value = defaultTitle || t('saved_games_default_title');
    saveGameNotes.value = '';

    saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
    saveGameCategoryPicker.querySelector('[data-value="my_game"]').classList.add('selected');

    saveGameModal.classList.remove('hidden');
}

function openEditModal(item) {
    _editingGameId = item.id;
    saveGameTitle.value = item.title || '';
    saveGameNotes.value = item.notes || '';

    // Set category picker
    saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
    const target = saveGameCategoryPicker.querySelector(`[data-value="${item.category || 'my_game'}"]`);
    if (target) target.classList.add('selected');

    saveGameModal.classList.remove('hidden');
}
