export const VAULT_KEY = 'blundermate_vault';
export const SAVED_GAMES_KEY = 'blundermate_saved_games';

// ── User ID ────────────────────────────────────────────────────────

export function getUserId() {
    return localStorage.getItem('blundermate_user_id') || null;
}

export function setUserId(id) {
    if (id) localStorage.setItem('blundermate_user_id', id);
}

// ── Supabase proxy helper ──────────────────────────────────────────
// Supabase 자격증명은 Vercel 환경변수에 있으므로 /api/db Edge Function을 통해 호출

async function callDB(action, table, params = {}) {
    const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, table, ...params })
    });
    if (!res.ok) throw new Error(`DB call failed: ${res.status}`);
    return res.json();
}

// ── Vault ──────────────────────────────────────────────────────────

function _getVaultItemsSync() {
    try {
        return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
    } catch (e) {
        console.error('Failed to read Vault from localStorage:', e);
        return [];
    }
}

function normalizeVaultItem(row) {
    return {
        id: row.id,
        date: row.created_at,
        san: row.move,
        category: row.classification,
        notes: row.notes || '',
        fen: row.position_fen,
        pgn: row.pgn || null,
    };
}

export async function getVaultItems() {
    const userId = getUserId();
    if (!userId) return _getVaultItemsSync();
    try {
        const data = await callDB('select', 'vault_items', { user_id: userId });
        if (Array.isArray(data)) return data.map(normalizeVaultItem);
        throw new Error('Invalid response');
    } catch (e) {
        console.log('Supabase vault load failed, using localStorage', e);
        return _getVaultItemsSync();
    }
}

export function addVaultItem(item) {
    // Always save to localStorage first
    try {
        const vault = _getVaultItemsSync();
        vault.push(item);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to save to Vault:', e);
        alert('Could not save data. Storage might be full or blocked.');
    }

    // Then try Supabase in background
    const userId = getUserId();
    if (!userId) return;
    callDB('insert', 'vault_items', {
        data: {
            id: item.id,
            user_id: userId,
            move: item.san,
            classification: item.category,
            notes: item.notes || null,
            position_fen: item.fen,
            pgn: item.pgn || null
        }
    }).catch(e => console.log('Supabase vault save failed, using localStorage', e));
}

export function removeVaultItem(id) {
    // Always delete from localStorage first
    try {
        const vault = _getVaultItemsSync().filter(v => v.id !== id);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to remove item from Vault:', e);
    }

    // Then try Supabase in background
    const userId = getUserId();
    if (!userId) return;
    callDB('delete', 'vault_items', { id })
        .catch(e => console.log('Supabase vault delete failed', e));
}

// ── Saved Games ────────────────────────────────────────────────────

function _getSavedGamesSync() {
    try {
        return JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) || '[]');
    } catch (e) {
        console.error('Failed to read Saved Games from localStorage:', e);
        return [];
    }
}

function normalizeSavedGame(row) {
    return {
        id: row.id,
        date: row.created_at,
        title: row.title,
        category: row.category,
        pgn: row.pgn,
        notes: row.notes || '',
    };
}

export async function getSavedGames() {
    const userId = getUserId();
    if (!userId) return _getSavedGamesSync();
    try {
        const data = await callDB('select', 'saved_games', { user_id: userId });
        if (Array.isArray(data)) return data.map(normalizeSavedGame);
        throw new Error('Invalid response');
    } catch (e) {
        console.log('Supabase saved_games load failed, using localStorage', e);
        return _getSavedGamesSync();
    }
}

export function addSavedGame(item) {
    // Always save to localStorage first
    try {
        const games = _getSavedGamesSync();
        games.push(item);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error('Failed to save game:', e);
        alert('Could not save game. Storage might be full or blocked.');
    }

    // Then try Supabase in background
    const userId = getUserId();
    if (!userId) return;
    callDB('insert', 'saved_games', {
        data: {
            id: item.id,
            user_id: userId,
            title: item.title,
            category: item.category,
            pgn: item.pgn,
            notes: item.notes || null
        }
    }).catch(e => console.log('Supabase saved_games save failed', e));
}

export function removeSavedGame(id) {
    // Always delete from localStorage first
    try {
        const games = _getSavedGamesSync().filter(g => g.id !== id);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error('Failed to remove saved game:', e);
    }

    // Then try Supabase in background
    const userId = getUserId();
    if (!userId) return;
    callDB('delete', 'saved_games', { id })
        .catch(e => console.log('Supabase delete failed', e));
}

export function updateSavedGame(id, updates) {
    try {
        const games = _getSavedGamesSync().map(g => g.id === id ? { ...g, ...updates } : g);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error('Failed to update saved game:', e);
    }
}
