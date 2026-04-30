import { getSavedGames, addSavedGame, removeSavedGame, updateSavedGame } from './storage.js';
import { escapeHtml } from './utils.js';
import { t } from './strings.js';

// ==========================================
// DOM Elements
// ==========================================
const savedGamesView = document.getElementById('savedGamesView');
const savedGamesList = document.getElementById('savedGamesList');
const savedGamesFilterBar = document.getElementById('savedGamesFilterBar');

const saveGameModal = document.getElementById('saveGameModal');
const saveGameTitle = document.getElementById('saveGameTitle');
const saveGameNotes = document.getElementById('saveGameNotes');
const saveGameCategoryPicker = document.getElementById('saveGameCategoryPicker');
const cancelSaveGameBtn = document.getElementById('cancelSaveGameBtn');
const confirmSaveGameBtn = document.getElementById('confirmSaveGameBtn');
const deleteSavedGameBtn = document.getElementById('deleteSavedGameBtn');

const saveChoiceModal = document.getElementById('saveChoiceModal');
const choiceSaveGameBtn = document.getElementById('choiceSaveGameBtn');

// ==========================================
// Category helpers
// ==========================================
const VALID_CATEGORIES = ['my_game', 'otb', 'opening', 'pro'];

function getSelectedCategory() {
    const sel = saveGameCategoryPicker.querySelector('.pill-btn.selected');
    return sel ? sel.dataset.value : 'my_game';
}

let _activeFilter = 'all';
let _editingGameId = null;

// ==========================================
// Rendering
// ==========================================

function buildCard(item, onLoad, onEdit) {
    const el = document.createElement('div');
    el.className = 'saved-game-card';
    el.dataset.category = VALID_CATEGORIES.includes(item.category) ? item.category : 'my_game';

    const notes = (item.notes || '').trim();
    // 카테고리는 섹션 헤더(전체) · 필터 핀(필터) · 색바(상시) 세 채널로 이미 전달 — 카드 라벨 중복 제거
    el.innerHTML = `
        <div class="saved-game-card-info">
            <span class="saved-game-card-title">${escapeHtml(item.title)}</span>
            ${notes ? `<span class="saved-game-card-notes">${escapeHtml(notes)}</span>` : ''}
        </div>
        <div class="saved-game-card-actions">
            <button class="edit-btn" title="${t('saved_games_edit')}" aria-label="${t('saved_games_edit')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
        </div>
    `;

    el.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        onEdit(item);
    });
    el.addEventListener('click', () => onLoad(item.pgn));
    return el;
}

function renderSavedGamesList(container, savedGames, onLoad, onEdit) {
    container.innerHTML = '';
    container.className = 'games-list view-list saved-games-list';

    const filtered = _activeFilter === 'all'
        ? savedGames
        : savedGames.filter(g => g.category === _activeFilter);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="saved-games-empty">
                <div class="saved-games-empty-icon" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h3 class="saved-games-empty-title">${t('saved_games_empty_title')}</h3>
                <p class="saved-games-empty-desc">${t('saved_games_empty_desc')}</p>
            </div>
        `;
        container.classList.add('saved-games-list--empty');
        return;
    }
    container.classList.remove('saved-games-list--empty');

    // 평면 chronological — 카테고리 네비게이션은 필터 핀이 담당, 섹션 그룹은 노이즈
    [...filtered]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(item => container.appendChild(buildCard(item, onLoad, onEdit)));
}

// ==========================================
// Core Functions
// ==========================================
// 데이터 로드만 담당. 뷰 가시성은 main.js의 renderScreen이 단독 관리.
export async function loadSavedGamesData() {
    _activeFilter = 'all';
    syncFilterBar();
    await updateSavedGamesView();
}

// Dependencies injected via initSavedGames()
let _onLoadGame = null;
let _getChess = null;
let _showButtonSuccess = null;
let _saveMoveBtn = null;

async function updateSavedGamesView() {
    const games = await getSavedGames();
    renderSavedGamesList(savedGamesList, games, (pgn) => {
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
export function initSavedGames({ onLoadGame, getChess, showButtonSuccess, saveMoveBtn, initHomeVaultBadge }) {
    _onLoadGame = onLoadGame;
    _getChess = getChess;
    _showButtonSuccess = showButtonSuccess;
    _saveMoveBtn = saveMoveBtn;

    if (cancelSaveGameBtn) {
        cancelSaveGameBtn.addEventListener('click', () => {
            _editingGameId = null;
            deleteSavedGameBtn?.classList.add('hidden');
            saveGameModal.classList.add('hidden');
        });
    }

    // 편집 모달 내 destructive 삭제 — 카드 외부 휴지통 아이콘 대신 management context에 통합
    if (deleteSavedGameBtn) {
        deleteSavedGameBtn.addEventListener('click', async () => {
            if (!_editingGameId) return;
            if (!confirm(t('saved_games_delete_confirm'))) return;
            removeSavedGame(_editingGameId);
            _editingGameId = null;
            deleteSavedGameBtn.classList.add('hidden');
            saveGameModal.classList.add('hidden');
            await updateSavedGamesView();
        });
    }

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
        deleteSavedGameBtn?.classList.add('hidden');
        setSaveGameModalTitle(false);

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
            deleteSavedGameBtn?.classList.add('hidden');
            saveGameModal.classList.add('hidden');
            await updateSavedGamesView();
            return;
        }

        const savedGameItem = {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            title: title,
            notes: notes,
            category: category,
            pgn: _getChess().pgn()
        };

        addSavedGame(savedGameItem);
        saveGameModal.classList.add('hidden');
        if (savedGamesView && !savedGamesView.classList.contains('hidden')) {
            await updateSavedGamesView();
        }
        _showButtonSuccess(_saveMoveBtn, t('saved_games_saved'));
    });
}

function setSaveGameModalTitle(isEdit) {
    const h2 = saveGameModal.querySelector('h2');
    if (!h2) return;
    const key = isEdit ? 'editGame' : 'saveEntireGame';
    h2.dataset.i18n = key;
    h2.textContent = t(key);
}

function openEditModal(item) {
    _editingGameId = item.id;
    setSaveGameModalTitle(true);
    saveGameTitle.value = item.title || '';
    saveGameNotes.value = item.notes || '';

    // Set category picker
    saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
    const target = saveGameCategoryPicker.querySelector(`[data-value="${item.category || 'my_game'}"]`);
    if (target) target.classList.add('selected');

    // 편집 모드에선 destructive 삭제 노출
    deleteSavedGameBtn?.classList.remove('hidden');
    saveGameModal.classList.remove('hidden');
}
