export const VAULT_KEY = 'blundermate_vault';
export const SAVED_GAMES_KEY = 'blundermate_saved_games';
export const ANALYZED_GAMES_KEY = 'blundermate_analyzed_games';
const USER_ID_KEY = 'blundermate_user_id';
const PLATFORM_KEY = 'blundermate_platform';
export const ONBOARDING_KEY = 'blundermate_onboarding_done';
export const COORDS_KEY = 'coordsEnabled';
export const GEMINI_KEY = 'geminiEnabled';
export const EVAL_MODE_KEY = 'evalDisplayMode';

export const PLATFORM_CHESSCOM = 'chesscom';
export const PLATFORM_LICHESS = 'lichess';
const VALID_PLATFORMS = new Set([PLATFORM_CHESSCOM, PLATFORM_LICHESS]);

// ── User ID ────────────────────────────────────────────────────────
// 주의: 여기서 관리하는 값은 "내 계정"(myUserId)이다.
// 다른 유저 검색(viewing) 상태는 이 파일과 무관하며 localStorage에 저장되면 안 된다.
// 모든 vault/saved_games 저장·조회는 getMyUserId() + getMyPlatform()만 사용한다.

export function getMyUserId() {
    const raw = localStorage.getItem(USER_ID_KEY);
    return raw ? raw.toLowerCase() : null;
}

export function setMyUserId(id) {
    if (id) localStorage.setItem(USER_ID_KEY, id.toLowerCase());
}

// 미설정(legacy chesscom-only 사용자)은 chesscom 폴백 — DB DEFAULT 'chesscom'과 일치.
export function getMyPlatform() {
    const raw = localStorage.getItem(PLATFORM_KEY);
    return VALID_PLATFORMS.has(raw) ? raw : PLATFORM_CHESSCOM;
}

export function setMyPlatform(platform) {
    if (VALID_PLATFORMS.has(platform)) localStorage.setItem(PLATFORM_KEY, platform);
}

// ── Supabase proxy helper ──────────────────────────────────────────
// callDB가 platform을 자동 주입 — 호출자는 신경 안 써도 (user_id, platform) 격리됨.
// insert는 data row에도 platform을 박아 서버측 spoofing 검증을 통과시킨다.

async function callDB(action, table, params = {}) {
    const platform = getMyPlatform();
    const body = { action, table, platform, ...params };
    if (action === 'insert' && body.data && typeof body.data === 'object') {
        body.data = { ...body.data, platform };
    }
    const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        mateIn: row.mate_in ?? null,
        playedDate: row.played_date || null,
    };
    if (typeof row.move_index === 'number') item.moveIndex = row.move_index;
    if (typeof row.move_number === 'number') {
        item.moveNumber = row.move_number;
        item.isWhite = !!row.is_white_move;
    }
    return item;
}

// 로컬 저장 vault_items 정규화: 구버전 항목엔 source 필드가 없으므로 'manual' 디폴트.
// platform 미설정 row(Phase 1 이전)는 'chesscom'으로 간주 — 마이그레이션 없이 호환.
function normalizeLocalVaultItem(it) {
    return {
        ...it,
        source: it.source || 'manual',
        platform: it.platform || 'chesscom',
        analyzedGameId: it.analyzedGameId || null,
        cpLoss: it.cpLoss ?? null,
        mateIn: it.mateIn ?? null,
        playedDate: it.playedDate || null,
    };
}

// source 옵션: 'manual' | 'auto' | undefined(전체).
export async function getVaultItems(options = {}) {
    const { source } = options;
    const platform = getMyPlatform();
    // localStorage 폴백도 platform 격리 — Supabase 실패 시에도 다른 플랫폼 데이터가 새지 않음.
    const filterLocal = (arr) => arr
        .filter(it => it.platform === platform)
        .filter(it => !source || (it.source || 'manual') === source);

    const userId = getMyUserId();
    if (!userId) return filterLocal(_getVaultItemsSync().map(normalizeLocalVaultItem));
    try {
        const params = { user_id: userId };
        if (source) params.filter = { source };
        const data = await callDB('select', 'vault_items', params);
        if (Array.isArray(data)) return data.map(normalizeVaultItem);
        throw new Error('Invalid response');
    } catch (e) {
        console.warn('Supabase vault load failed, using localStorage', e);
        return filterLocal(_getVaultItemsSync().map(normalizeLocalVaultItem));
    }
}

// vault_items row 페이로드 빌더 — addVaultItem과 addVaultItemsBatch가 공유.
function _vaultRowFromItem(item, userId) {
    return {
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
        mate_in: item.mateIn ?? null,
        played_date: item.playedDate || null,
    };
}

export function addVaultItem(item) {
    const platform = getMyPlatform();
    try {
        const vault = _getVaultItemsSync();
        vault.push({ ...item, platform });
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to save to Vault:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    callDB('insert', 'vault_items', { user_id: userId, data: _vaultRowFromItem(item, userId) })
        .catch(e => console.warn('Supabase vault save failed, using localStorage', e));
}

// 자동 수집 일괄 추가 — N회 read/write 대신 단일 read+write로 localStorage thrashing 방지.
// Supabase INSERT는 항목별로 나가지만 fire-and-forget이라 OK.
export function addVaultItemsBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const platform = getMyPlatform();
    try {
        const vault = _getVaultItemsSync();
        for (const it of items) vault.push({ ...it, platform });
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to save batch to Vault:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    for (const it of items) {
        callDB('insert', 'vault_items', { user_id: userId, data: _vaultRowFromItem(it, userId) })
            .catch(e => console.warn('Supabase vault save failed, using localStorage', e));
    }
}

export function removeVaultItem(id) {
    try {
        const vault = _getVaultItemsSync().filter(v => v.id !== id);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to remove item from Vault:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'vault_items', { id, user_id: userId })
        .catch(e => console.warn('Supabase vault delete failed', e));
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
    const platform = getMyPlatform();
    // platform 미설정 row(legacy)는 'chesscom' fallback — 마이그레이션 없이 호환.
    const filterLocal = (arr) => arr.filter(g => (g.platform || 'chesscom') === platform);

    const userId = getMyUserId();
    if (!userId) return filterLocal(_getSavedGamesSync());
    try {
        const data = await callDB('select', 'saved_games', { user_id: userId });
        if (Array.isArray(data)) return data.map(normalizeSavedGame);
        throw new Error('Invalid response');
    } catch (e) {
        console.warn('Supabase saved_games load failed, using localStorage', e);
        return filterLocal(_getSavedGamesSync());
    }
}

export function addSavedGame(item) {
    // platform 태깅은 Supabase 실패 시에도 폴백에서 격리 유지하기 위함.
    try {
        const games = _getSavedGamesSync();
        games.push({ ...item, platform: getMyPlatform() });
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error('Failed to save game:', e);
    }

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
    }).catch(e => console.warn('Supabase saved_games save failed', e));
}

export function removeSavedGame(id) {
    try {
        const games = _getSavedGamesSync().filter(g => g.id !== id);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error('Failed to remove saved game:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'saved_games', { id, user_id: userId })
        .catch(e => console.warn('Supabase delete failed', e));
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
//
// platform 격리: 같은 브라우저에서 chesscom과 lichess를 둘 다 쓰면 같은 PGN이라도
// 두 platform 각각 별도 analyzed_games row를 가져야 vault_items.analyzed_game_id의
// 참조 무결성이 깨지지 않음. 그래서 local cache lookup도 (pgn_hash, platform) 짝으로 매칭.
export async function upsertAnalyzedGame({ pgn, pgnHash, headersJson, playedDate }) {
    const userId = getMyUserId();
    const platform = getMyPlatform();

    // localStorage 우선 — 비로그인 사용자도 동작
    const local = _getAnalyzedGamesSync();
    // legacy local row(platform 없음)는 'chesscom'으로 간주 — 마이그레이션 없이 호환.
    const existingLocal = local.find(g => g.pgn_hash === pgnHash && (g.platform || 'chesscom') === platform);
    if (existingLocal) {
        return existingLocal.id;
    }

    if (userId) {
        // Supabase에 이미 있는지 먼저 확인 (다른 디바이스에서 만든 행이 있을 수 있음). callDB가 platform 자동 주입.
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
            console.warn('Supabase analyzed_games lookup failed', e);
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
        platform,
        created_at: new Date().toISOString(),
    };
    local.push(row);
    try { localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(local)); } catch {}

    // Supabase INSERT를 await하여 후속 PATCH(saveAnalysisCache)가 행 존재를 전제할 수 있게 함.
    // 충돌(409)이나 네트워크 실패는 catch에서 흡수 — localStorage row는 이미 보장.
    if (userId) {
        try {
            await callDB('insert', 'analyzed_games', {
                user_id: userId,
                data: { ...row, user_id: userId },
            });
        } catch (e) {
            console.warn('Supabase analyzed_games insert failed', e);
        }
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
        console.warn('Supabase analyzed_games fetch failed', e);
    }
    return null;
}

// ── Analysis Cache ────────────────────────────────────────────────
// 같은 (user_id, pgn_hash)의 게임을 다시 열 때 Stockfish/Gemini 재실행 스킵.
// localStorage 우선(비로그인 사용자 + 빠른 hit) + Supabase 백업(멀티 디바이스).
// 캐시 페이로드 = { version, depth, moves: [{ engineLines, classification }, ...] }

export const ANALYSIS_CACHE_VERSION = 1;

// 캐시가 현재 분석 환경(요청 depth + 스키마 버전)과 호환되는지 판정.
// version 불일치(알고리즘 변경)면 미스. depth가 cache보다 높게 요청되면 미스(더 깊은 분석 필요).
export function isCacheCompatible(cache, requiredDepth) {
    if (!cache || typeof cache !== 'object') return false;
    if (cache.version !== ANALYSIS_CACHE_VERSION) return false;
    if (typeof cache.depth !== 'number') return false;
    if (typeof requiredDepth === 'number' && cache.depth < requiredDepth) return false;
    if (!Array.isArray(cache.moves) || cache.moves.length === 0) return false;
    return true;
}

// 캐시 조회 — pgnHash 기준. localStorage hit 우선, miss면 Supabase 시도.
// platform 격리: upsertAnalyzedGame과 동일 — (pgn_hash, platform) 짝으로 매칭.
export async function loadAnalysisCache(pgnHash) {
    if (!pgnHash) return null;
    const platform = getMyPlatform();

    const local = _getAnalyzedGamesSync().find(g => g.pgn_hash === pgnHash && (g.platform || 'chesscom') === platform);
    if (local && local.analysis_json) return local.analysis_json;

    const userId = getMyUserId();
    if (!userId) return null;
    try {
        const data = await callDB('select', 'analyzed_games', {
            user_id: userId,
            filter: { pgn_hash: pgnHash },
        });
        if (Array.isArray(data) && data.length > 0 && data[0].analysis_json) {
            // 다음 hit을 빠르게 — Supabase에서 받은 row를 local cache에 머지.
            const cache = _getAnalyzedGamesSync();
            const idx = cache.findIndex(g => g.pgn_hash === pgnHash && (g.platform || 'chesscom') === platform);
            if (idx >= 0) cache[idx] = { ...cache[idx], ...data[0] };
            else cache.push(data[0]);
            try { localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(cache)); } catch {}
            return data[0].analysis_json;
        }
    } catch (e) {
        console.warn('Supabase analysis cache fetch failed', e);
    }
    return null;
}

// 캐시 저장 — analyzed_games 행은 collectAutoBlunders.upsertAnalyzedGame가 이미 생성/보장.
// 이 함수는 그 행에 PATCH로 캐시 컬럼만 갱신. main.js에서 collectAutoBlunders 완료 후 호출 필수.
//
// 이전 시도(upsert + merge-duplicates)는 PostgREST가 default로 PK(id) 기준 충돌 판정하는데
// 매번 새 uuid를 보내 PK 충돌이 안 나고 그대로 INSERT → UNIQUE(user_id, pgn_hash) 위반 → 409.
// on_conflict 명시도 가능했지만 충돌 시 id까지 덮어쓰여 vault_items.analyzed_game_id가 dangling되는
// 부작용이 있어 단순 PATCH로 회귀.
export async function saveAnalysisCache({ pgnHash, payload }) {
    if (!pgnHash || !payload) return;

    const cachePatch = {
        analysis_json: payload,
        analysis_depth: payload.depth,
        analysis_version: payload.version,
    };

    // localStorage 즉시 반영 — collectAutoBlunders가 행을 만들었으니 idx >= 0이어야 정상.
    const platform = getMyPlatform();
    try {
        const cache = _getAnalyzedGamesSync();
        const idx = cache.findIndex(g => g.pgn_hash === pgnHash && (g.platform || 'chesscom') === platform);
        if (idx >= 0) {
            cache[idx] = { ...cache[idx], ...cachePatch };
            localStorage.setItem(ANALYZED_GAMES_KEY, JSON.stringify(cache));
        }
    } catch (e) {
        console.error('Failed to save analysis cache to localStorage:', e);
    }

    // Supabase PATCH — 행이 이미 있으니 fire-and-forget. 0 rows affected면 silent skip.
    const userId = getMyUserId();
    if (!userId) return;
    callDB('update', 'analyzed_games', {
        user_id: userId,
        filter: { pgn_hash: pgnHash },
        data: cachePatch,
    }).catch(e => console.warn('Supabase analysis cache update failed', e));
}
