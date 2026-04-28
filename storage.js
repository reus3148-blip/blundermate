export const VAULT_KEY = 'blundermate_vault';
export const SAVED_GAMES_KEY = 'blundermate_saved_games';
export const ANALYZED_GAMES_KEY = 'blundermate_analyzed_games';
const USER_ID_KEY = 'blundermate_user_id';
export const ONBOARDING_KEY = 'blundermate_onboarding_done';
export const COORDS_KEY = 'coordsEnabled';
export const GEMINI_KEY = 'geminiEnabled';
export const EVAL_MODE_KEY = 'evalDisplayMode';

// ── User ID ────────────────────────────────────────────────────────
// 주의: 여기서 관리하는 값은 "내 계정"(myUserId)이다.
// 다른 유저 검색(viewing) 상태는 이 파일과 무관하며 localStorage에 저장되면 안 된다.
// 모든 vault/saved_games 저장·조회는 getMyUserId()만 사용한다.

// Chess.com 닉네임은 대소문자 구분 X. 경계에서 소문자로 정규화해 dedup/비교 안정화.
export function getMyUserId() {
    const raw = localStorage.getItem(USER_ID_KEY);
    return raw ? raw.toLowerCase() : null;
}

export function setMyUserId(id) {
    if (id) localStorage.setItem(USER_ID_KEY, id.toLowerCase());
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
    const item = {
        id: row.id,
        date: row.created_at,
        san: row.move,
        category: row.classification,
        notes: row.notes || '',
        fen: row.position_fen,
        pgn: row.pgn || null,
        gameTitle: row.game_title || '',
        bestMove: row.best_move || '',
        isUserWhite: row.is_user_white ?? true,
        source: row.source || 'manual',
        analyzedGameId: row.analyzed_game_id || null,
        cpLoss: row.cp_loss ?? null,
    };
    if (typeof row.move_index === 'number') item.moveIndex = row.move_index;
    if (typeof row.move_number === 'number') {
        item.moveNumber = row.move_number;
        item.isWhite = !!row.is_white_move;
    }
    return item;
}

// 로컬 저장 vault_items 정규화: 구버전 항목엔 source 필드가 없으므로 'manual' 디폴트.
function normalizeLocalVaultItem(it) {
    return {
        ...it,
        source: it.source || 'manual',
        analyzedGameId: it.analyzedGameId || null,
        cpLoss: it.cpLoss ?? null,
    };
}

// source 옵션: 'manual' | 'auto' | undefined(전체).
export async function getVaultItems(options = {}) {
    const { source } = options;
    const filterLocal = (arr) => source ? arr.filter(it => (it.source || 'manual') === source) : arr;

    const userId = getMyUserId();
    if (!userId) return filterLocal(_getVaultItemsSync().map(normalizeLocalVaultItem));
    try {
        const params = { user_id: userId };
        if (source) params.filter = { source };
        const data = await callDB('select', 'vault_items', params);
        if (Array.isArray(data)) return data.map(normalizeVaultItem);
        throw new Error('Invalid response');
    } catch (e) {
        console.log('Supabase vault load failed, using localStorage', e);
        return filterLocal(_getVaultItemsSync().map(normalizeLocalVaultItem));
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
    }

    // Then try Supabase in background
    const userId = getMyUserId();
    if (!userId) return;
    callDB('insert', 'vault_items', {
        user_id: userId,
        data: {
            id: item.id,
            user_id: userId,
            move: item.san,
            classification: item.category,
            notes: item.notes || null,
            position_fen: item.fen,
            pgn: item.pgn || null,
            move_index: item.moveIndex ?? null,
            move_number: item.moveNumber ?? null,
            is_white_move: item.isWhite ?? null,
            best_move: item.bestMove || null,
            game_title: item.gameTitle || null,
            is_user_white: item.isUserWhite ?? null,
            source: item.source || 'manual',
            analyzed_game_id: item.analyzedGameId || null,
            cp_loss: item.cpLoss ?? null,
        }
    }).catch(e => console.log('Supabase vault save failed, using localStorage', e));
}

// 자동 수집용 일괄 추가. 게임 한 판당 0~수 개 호출. addVaultItem을 그대로 재사용.
export function addVaultItemsBatch(items) {
    if (!Array.isArray(items)) return;
    for (const it of items) addVaultItem(it);
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
    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'vault_items', { id, user_id: userId })
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
    const userId = getMyUserId();
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
    }

    // Then try Supabase in background
    const userId = getMyUserId();
    if (!userId) return;
    callDB('insert', 'saved_games', {
        user_id: userId,
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
    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'saved_games', { id, user_id: userId })
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

// ── Analyzed Games (자동 수집된 블런더의 PGN 보관소) ─────────────────
// vault_items(source='auto')와 분리: 한 게임당 1행, 다수 블런더가 analyzed_game_id로 참조.
// 같은 PGN(pgn_hash) 재분석 시 dedup — UNIQUE(user_id, pgn_hash).

function _getAnalyzedGamesSync() {
    try {
        return JSON.parse(localStorage.getItem(ANALYZED_GAMES_KEY) || '[]');
    } catch (e) {
        console.error('Failed to read analyzed_games from localStorage:', e);
        return [];
    }
}

// PGN moves-only 영역만 해싱 (헤더의 시간/사이트는 같은 게임이라도 다를 수 있어 제외).
export async function computePgnHash(pgn) {
    if (!pgn) return '';
    const moves = pgn
        .split('\n')
        .filter(l => !l.startsWith('['))
        .join(' ')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const buf = new TextEncoder().encode(moves);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// 같은 pgn_hash가 이미 있으면 그 id 재사용. 없으면 새로 생성.
// localStorage 우선 저장 → Supabase 시도 (실패 시 local 단독). 항상 string id 반환.
export async function upsertAnalyzedGame({ pgn, pgnHash, headersJson, playedDate }) {
    const userId = getMyUserId();

    // localStorage 우선 — 비로그인 사용자도 동작
    const local = _getAnalyzedGamesSync();
    const existingLocal = local.find(g => g.pgn_hash === pgnHash);
    if (existingLocal) {
        // 로그인 상태에서도 local cache hit이면 그 id를 그대로 사용 (Supabase에도 동일 id가 있다고 가정)
        return existingLocal.id;
    }

    if (userId) {
        // Supabase에 이미 있는지 먼저 확인 (다른 디바이스에서 만든 행이 있을 수 있음)
        try {
            const existing = await callDB('select', 'analyzed_games', {
                user_id: userId,
                filter: { pgn_hash: pgnHash },
            });
            if (Array.isArray(existing) && existing.length > 0) {
                const row = existing[0];
                local.push(row);
                try { localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(local)); } catch {}
                return row.id;
            }
        } catch (e) {
            console.log('Supabase analyzed_games lookup failed', e);
        }
    }

    // 신규 행 생성
    const id = crypto.randomUUID();
    const row = {
        id,
        pgn,
        pgn_hash: pgnHash,
        headers_json: headersJson || null,
        played_date: playedDate || null,
        created_at: new Date().toISOString(),
    };
    local.push(row);
    try { localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(local)); } catch {}

    if (userId) {
        callDB('insert', 'analyzed_games', {
            user_id: userId,
            data: { ...row, user_id: userId },
        }).catch(e => console.log('Supabase analyzed_games insert failed', e));
    }
    return id;
}

export async function getAnalyzedGameById(id) {
    if (!id) return null;
    const local = _getAnalyzedGamesSync().find(g => g.id === id);
    const userId = getMyUserId();
    if (!userId) return local || null;

    // 로컬 캐시가 있으면 우선. 없으면 원격 조회.
    if (local) return local;
    try {
        const data = await callDB('select', 'analyzed_games', {
            user_id: userId,
            filter: { id },
        });
        if (Array.isArray(data) && data.length > 0) {
            // 캐시 갱신
            const cache = _getAnalyzedGamesSync();
            cache.push(data[0]);
            try { localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(cache)); } catch {}
            return data[0];
        }
    } catch (e) {
        console.log('Supabase analyzed_games fetch failed', e);
    }
    return null;
}
