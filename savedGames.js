import { getSavedGames, addSavedGame, removeSavedGame, updateSavedGame } from './storage.js';
import { escapeHtml, formatRelativeDate, getDateStrings } from './utils.js';
import { t } from './strings.js';
import { showConfirm, showToast } from './dialogs.js';
import { withScreenLoading, renderEmptyState } from './ui.js';

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

function buildCard(item, onLoad, onEdit, ctx) {
    const cat = VALID_CATEGORIES.includes(item.category) ? item.category : 'my_game';
    const catLabel = t(`saved_games_cat_${cat}`);
    const dateText = item.date ? formatRelativeDate(item.date, ctx.dateStrings) : '';
    const metaParts = [catLabel, dateText].filter(Boolean);

    const notes = (item.notes || '').trim();

    // 외곽은 div role=button — 내부의 ⋯ 액션 버튼이 nested button 위반을 일으키지 않도록.
    const el = document.createElement('div');
    el.className = 'list-row saved-game-row';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.dataset.category = cat;
    el.innerHTML = `
        <div class="list-row-body">
            <div class="list-row-title">${escapeHtml(item.title)}</div>
            ${notes ? `<div class="list-row-notes">${escapeHtml(notes)}</div>` : ''}
            ${metaParts.length ? `<div class="list-row-meta">${escapeHtml(metaParts.join(' · '))}</div>` : ''}
        </div>
        <button type="button" class="list-row-action" aria-label="${ctx.editLabel}" title="${ctx.editLabel}">⋯</button>
        <span class="list-row-chevron" aria-hidden="true">›</span>
    `;

    el.querySelector('.list-row-action').addEventListener('click', (e) => {
        e.stopPropagation();
        onEdit(item);
    });
    el.addEventListener('click', () => onLoad(item.pgn));
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLoad(item.pgn); }
    });
    return el;
}

function renderSavedGamesList(container, savedGames, onLoad, onEdit) {
    container.innerHTML = '';
    container.className = 'games-list view-list saved-games-list';

    const filtered = _activeFilter === 'all'
        ? savedGames
        : savedGames.filter(g => g.category === _activeFilter);

    if (filtered.length === 0) {
        container.classList.add('saved-games-list--empty');
        renderEmptyState(container, {
            icon: 'bookmark',
            title: t('saved_games_empty_title'),
            desc: t('saved_games_empty_desc'),
            ctaLabel: t('saved_games_empty_cta'),
            onCta: _onEmptyCta || (() => {}),
        });
        return;
    }
    container.classList.remove('saved-games-list--empty');

    const group = document.createElement('div');
    group.className = 'list-group';
    const ctx = { dateStrings: getDateStrings(), editLabel: escapeHtml(t('saved_games_edit')) };
    [...filtered]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(item => group.appendChild(buildCard(item, onLoad, onEdit, ctx)));
    container.appendChild(group);
}

// ==========================================
// Core Functions
// ==========================================
// 데이터 로드만 담당. 뷰 가시성은 main.js의 renderScreen이 단독 관리.
const _savedLoadingOverlay = document.getElementById('savedGamesLoadingOverlay');

export async function loadSavedGamesData() {
    _activeFilter = 'all';
    syncFilterBar();
    return withScreenLoading(_savedLoadingOverlay, () => updateSavedGamesView());
}

// 분석/라이브 화면의 저장 버튼 진입점. _getChess()가 모드별로 메인/exploration chess를 반환.
export function openSaveGameModal() {
    if (!_getChess) return;
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
    saveGameCategoryPicker.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('selected'));
    saveGameCategoryPicker.querySelector('[data-value="my_game"]').classList.add('selected');
    saveGameModal.classList.remove('hidden');
}

// Dependencies injected via initSavedGames()
let _onLoadGame = null;
let _getChess = null;
let _onEmptyCta = null;

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
let _savedGamesInitialized = false;
export function initSavedGames({ onLoadGame, getChess, onEmptyCta }) {
    if (_savedGamesInitialized) return;
    _savedGamesInitialized = true;
    _onLoadGame = onLoadGame;
    _getChess = getChess;
    _onEmptyCta = onEmptyCta || null;

    if (cancelSaveGameBtn) {
        cancelSaveGameBtn.addEventListener('click', () => {
            _editingGameId = null;
            deleteSavedGameBtn?.classList.add('hidden');
            saveGameModal.classList.add('hidden');
        });
    }

    if (deleteSavedGameBtn) {
        deleteSavedGameBtn.addEventListener('click', async () => {
            if (!_editingGameId) return;
            const ok = await showConfirm(t('saved_games_delete_confirm'), {
                okLabel: t('confirm_delete'),
                destructive: true,
            });
            if (!ok) return;
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
        showToast(t('saved_games_saved'));
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

    deleteSavedGameBtn?.classList.remove('hidden');
    saveGameModal.classList.remove('hidden');
}
