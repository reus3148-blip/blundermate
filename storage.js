const VAULT_KEY = 'blundermate_vault';
const SAVED_GAMES_KEY = 'blundermate_saved_games';
const ANALYZED_GAMES_KEY = 'blundermate_analyzed_games';
const TEN_REPORT_CURSOR_KEY = 'blundermate_ten_report_cursor';
const TEN_REPORTS_KEY = 'blundermate_ten_reports';
const USER_ID_KEY = 'blundermate_user_id';
const PLATFORM_KEY = 'blundermate_platform';
export const ONBOARDING_KEY = 'blundermate_onboarding_done';
const COORDS_KEY = 'coordsEnabled';
const THEME_KEY = 'theme';
export const GEMINI_KEY = 'geminiEnabled';
export const DEFAULT_TC_KEY = 'defaultTcFilter';

export const PLATFORM_CHESSCOM = 'chesscom';
export const PLATFORM_LICHESS = 'lichess';
const VALID_PLATFORMS = new Set([PLATFORM_CHESSCOM, PLATFORM_LICHESS]);

// ── localStorage 안전 래퍼 ────────────────────────────────────────
// Safari private mode / 디스크 풀 / disabled storage에서 throw 가능 — 모든 접근은 이 두 함수를 통과해야 한다.
export function lsGet(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (_) { return fallback; }
}
export function lsSet(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { return false; }
}

// ── User ID ────────────────────────────────────────────────────────
// 주의: 여기서 관리하는 값은 "내 계정"(myUserId)이다.
// 다른 유저 검색(viewing) 상태는 이 파일과 무관하며 localStorage에 저장되면 안 된다.
// 모든 vault/saved_games 저장·조회는 getMyUserId() + getMyPlatform()만 사용한다.

export function getMyUserId() {
    return lsGet(USER_ID_KEY)?.toLowerCase() ?? null;
}

export function setMyUserId(id) {
    if (id) lsSet(USER_ID_KEY, id.toLowerCase());
}

// 미설정(legacy chesscom-only 사용자)은 chesscom 폴백 — DB DEFAULT 'chesscom'과 일치.
export function getMyPlatform() {
    const raw = lsGet(PLATFORM_KEY);
    return VALID_PLATFORMS.has(raw) ? raw : PLATFORM_CHESSCOM;
}

export function setMyPlatform(platform) {
    if (VALID_PLATFORMS.has(platform)) lsSet(PLATFORM_KEY, platform);
}

// 보드 좌표 표시 토글 — Gemini Coach 토글과 동일한 패턴(getter/setter + storage 캡슐화).
export function getIsCoordsEnabled() {
    return lsGet(COORDS_KEY) !== 'false';
}
export function setIsCoordsEnabled(on) {
    lsSet(COORDS_KEY, on ? 'true' : 'false');
}

// 'light' | 'dark' | 'system' — system은 prefers-color-scheme 따름.
export function getTheme() {
    const v = lsGet(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
}
export function setTheme(theme) {
    lsSet(THEME_KEY, theme);
}

// 로그아웃: 계정 식별자 + 온보딩 플래그만 초기화. VAULT/SAVED는 유지 — 같은 ID로 재로그인 시 복구.
export function clearIdentity() {
    try {
        localStorage.removeItem(USER_ID_KEY);
        localStorage.removeItem(PLATFORM_KEY);
        localStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {
        console.error('clearIdentity failed:', e);
    }
}

// ── Supabase proxy helper ──────────────────────────────────────────
// callDB가 platform을 자동 주입 — 호출자는 신경 안 써도 (user_id, platform) 격리됨.
// insert는 data row에도 platform을 박아 서버측 spoofing 검증을 통과시킨다.
//
// Circuit breaker + pilot coalescing: /api/db가 죽은 환경(static dev server, Vercel
// Functions 미배포 등)에서 콜드 로드 시 ~10개 카드 + vault + saved가 거의 동시에 callDB를
// 부르는데, 첫 응답이 도착해야 브레이커가 trip되므로 그 사이 in-flight 100+개가 모두 5xx를
//받음. pilot 패턴: 첫 호출은 fetch를 시작하고, 같은 시점의 다른 호출들은 pilot의 결과를
// await. pilot이 5xx면 _dbBreakerUntil이 setting되어 waiter들은 깨어나서 entry check로
// 즉시 silent throw. pilot이 성공하면 waiter들은 자기 fetch 진행. 결과: 콜드 로드 fetch가
// 200+ → 1로 압축. err.silent=true면 호출자가 console.warn을 swallow하라는 신호.
const DB_BREAKER_COOLDOWN_MS = 60_000;
let _dbBreakerUntil = 0;
let _dbPilot = null;

function _silentDbError(message = 'DB unavailable (circuit open)') {
    const err = new Error(message);
    err.silent = true;
    return err;
}

async function callDB(action, table, params = {}) {
    if (Date.now() < _dbBreakerUntil) throw _silentDbError();

    if (_dbPilot) {
        try { await _dbPilot; } catch {}
        // pilot 결과 반영 후 브레이커 재확인 — 실패했으면 여기서 silent throw로 빠짐.
        if (Date.now() < _dbBreakerUntil) throw _silentDbError();
    }

    // platform을 함수 진입 시점에 스냅샷 — fetch 도중 setMyPlatform이 호출돼도 이 호출은 진입 시점 platform을 유지.
    const platform = getMyPlatform();
    const promise = _doCallDB(action, table, params, platform);
    if (!_dbPilot) {
        _dbPilot = promise.finally(() => { _dbPilot = null; });
    }
    return promise;
}

async function _doCallDB(action, table, params, platform) {
    const body = { action, table, platform, ...params };
    if (action === 'insert' && body.data && typeof body.data === 'object') {
        body.data = { ...body.data, platform };
    }
    const startedAt = Date.now();
    let res;
    try {
        res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (e) {
        // 네트워크 단절(fetch 자체가 실패). 60초 차단.
        // breakerWasOpen: 이전 호출이 이미 breaker를 trip시킨 상태였는가. 첫 실패는 로그(진단성),
        // 나머지는 silent. 별도 _dbBreakerLogged 상태 없이 _dbBreakerUntil로 derive.
        const breakerWasOpen = _dbBreakerUntil > Date.now();
        _dbBreakerUntil = Date.now() + DB_BREAKER_COOLDOWN_MS;
        if (breakerWasOpen) e.silent = true;
        throw e;
    }
    if (!res.ok) {
        // 5xx는 서버/엔드포인트 문제 — 차단. 4xx는 일시적/요청 문제일 수 있어 차단 안 함.
        const err = new Error(`DB call failed: ${res.status}`);
        if (res.status >= 500) {
            const breakerWasOpen = _dbBreakerUntil > Date.now();
            _dbBreakerUntil = Date.now() + DB_BREAKER_COOLDOWN_MS;
            if (breakerWasOpen) err.silent = true;
        }
        throw err;
    }
    // 이 호출이 시작된 이후로 다른 동시 호출이 breaker를 trip시켰을 수 있음 — 그 trip을 덮어쓰지 않도록
    // startedAt 이전에 설정된 cooldown만 reset. 이렇게 하면 "성공 응답이 5xx 동시 trip을 무력화"하는 race 방지.
    if (_dbBreakerUntil <= startedAt) _dbBreakerUntil = 0;
    return res.json();
}

// err.silent가 단 후속 에러는 콘솔에 안 찍는다 — 매 카드/매 진입마다 같은 5xx가 도배되는 걸
// 막기 위함. 첫 에러는 그대로 통과해 진단성 유지.
function _warnDb(prefix, e) {
    if (e?.silent) return;
    console.warn(prefix, e);
}

// ── Vault ──────────────────────────────────────────────────────────
//
// 정본(source of truth) 계약 — 이 섹션의 read/write는 모두 이 계약을 따른다.
//
//   로그인(user_id 있음): Supabase = 정본, localStorage(VAULT_KEY) = 캐시.
//     캐시는 "틀려도 됨, 다음 전체 fetch가 정정한다"가 계약. 캐시 write 실패는 무해.
//   익명(user_id 없음): localStorage = 정본. DB는 관여 안 함.
//
//   read : getVaultItems 전체 fetch(source 미지정)가 DB 성공 시 _syncVaultCache로
//          캐시를 DB 결과로 동기화(write-through read) — 캐시가 점점 정확해진다.
//          getVaultItemsCached는 DB 없이 캐시만 동기 read — SWR의 "stale" 절반.
//   write: remove/updateNotes/incrementSolved 3종은 localStorage 캐시를 best-effort로
//          갱신(_removeLocalVaultRow / _patchLocalVaultRow / 인라인) 후 DB write를 보낸다.
//          로그인 사용자에겐 DB write가 정본 갱신, ls는 다음 fetch까지의 임시 미러.

function _getVaultItemsSync() {
    try {
        return JSON.parse(lsGet(VAULT_KEY, '[]') || '[]');
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
        // 퍼즐 시작 fen + 정답 시퀀스 (jsonb). 옛 row는 null → vault.js 단일 best_move 폴백.
        prevFen: row.prev_fen || null,
        solution: row.solution_json || null,
        winChanceDrop: row.win_chance_drop ?? null,
        // Phase 58: 정답 풀이 횟수. 2 도달 시 stories 기본 풀에서 제외, '복습 완료' 필터에서만.
        solvedCount: row.solved_count ?? 0,
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
        platform: it.platform || PLATFORM_CHESSCOM,
        analyzedGameId: it.analyzedGameId || null,
        cpLoss: it.cpLoss ?? null,
        mateIn: it.mateIn ?? null,
        playedDate: it.playedDate || null,
        prevFen: it.prevFen || null,
        solution: it.solution || null,
        winChanceDrop: it.winChanceDrop ?? null,
        solvedCount: it.solvedCount ?? 0,
    };
}

// write-through read: 전체 fetch가 받아온 DB 결과를 localStorage 캐시에 반영한다.
// 현재 platform 슬라이스만 교체하고 다른 platform 항목은 보존 — VAULT_KEY는 전 platform
// 공용이라 통째로 덮으면 다른 platform 캐시가 날아간다. 캐시 write 실패는 무해(다음 fetch가 정정).
function _syncVaultCache(items, platform) {
    const others = _getVaultItemsSync()
        .filter(it => (it.platform || PLATFORM_CHESSCOM) !== platform);
    const tagged = items.map(it => ({ ...it, platform }));
    lsSet(VAULT_KEY, JSON.stringify([...others, ...tagged]));
}

// 동기 캐시 read — SWR의 "stale" 절반, DB는 건드리지 않는다. 로그인 사용자에겐 write-through로
// 동기화된 캐시(정본은 Supabase), 익명에겐 정본 그 자체. cold 캐시면 빈 배열.
// platform 격리 — Supabase 실패 폴백에서도 다른 플랫폼 데이터가 새지 않게 한다.
// source 옵션: 'manual' | 'auto' | undefined(전체).
export function getVaultItemsCached(options = {}) {
    const { source } = options;
    const platform = getMyPlatform();
    return _getVaultItemsSync()
        .map(normalizeLocalVaultItem)
        .filter(it => it.platform === platform)
        .filter(it => !source || (it.source || 'manual') === source);
}

// source 옵션: 'manual' | 'auto' | undefined(전체).
export async function getVaultItems(options = {}) {
    const { source } = options;
    const userId = getMyUserId();
    if (!userId) return getVaultItemsCached(options);
    try {
        const params = { user_id: userId };
        if (source) params.filter = { source };
        const data = await callDB('select', 'vault_items', params);
        if (!Array.isArray(data)) throw new Error('Invalid response');
        const items = data.map(normalizeVaultItem);
        // source 필터 fetch는 부분집합이라 캐시 동기화 스킵 — 다른 source 항목을 캐시에서 지운다.
        if (!source) _syncVaultCache(items, getMyPlatform());
        return items;
    } catch (e) {
        _warnDb('Supabase vault load failed, using localStorage', e);
        return getVaultItemsCached(options);
    }
}

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
        source: item.source || 'auto',
        analyzed_game_id: item.analyzedGameId || null,
        cp_loss: item.cpLoss ?? null,
        mate_in: item.mateIn ?? null,
        played_date: item.playedDate || null,
        // 미마이그레이션 환경에선 PostgREST가 unknown column으로 INSERT 실패 → localStorage만 저장됨
        // (데이터 손실 없음). 마이그레이션 SQL은 supabase-schema.md 참조.
        prev_fen: item.prevFen || null,
        solution_json: item.solution || null,
        win_chance_drop: item.winChanceDrop ?? null,
    };
}

// 자동 수집 일괄 추가 — N회 read/write 대신 단일 read+write로 localStorage thrashing 방지.
// Supabase INSERT는 항목별로 나가지만 fire-and-forget이라 OK.
export function addVaultItemsBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    const platform = getMyPlatform();
    try {
        const vault = _getVaultItemsSync();
        for (const it of items) vault.push({ ...it, platform });
        if (!lsSet(VAULT_KEY, JSON.stringify(vault))) throw new Error('localStorage write failed');
    } catch (e) {
        console.error('Failed to save batch to Vault:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    for (const it of items) {
        callDB('insert', 'vault_items', { user_id: userId, data: _vaultRowFromItem(it, userId) })
            .catch(e => _warnDb('Supabase vault save failed, using localStorage', e));
    }
}

// localStorage vault row를 삭제 (있을 때만) — _patchLocalVaultRow와 같은 캐시 계약.
// ls에 없는 id는 정상(Supabase 정본 + ls 미러 없음). 삭제 실패도 무해(다음 fetch가 정정).
function _removeLocalVaultRow(id) {
    try {
        const vault = _getVaultItemsSync();
        const next = vault.filter(v => v.id !== id);
        if (next.length !== vault.length) lsSet(VAULT_KEY, JSON.stringify(next));
    } catch (e) {
        console.error('Failed to remove Vault row from localStorage:', e);
    }
}

export function removeVaultItem(id) {
    _removeLocalVaultRow(id);

    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'vault_items', { id, user_id: userId })
        .catch(e => _warnDb('Supabase vault delete failed', e));
}

// localStorage vault row를 patch (있을 때만). vault_items는 Supabase가 정본일 수 있어
// (cross-device, localStorage 미러 없음) ls에 없는 id가 정상 — 그 경우 ls write만 skip하고
// DB PATCH는 호출자가 계속 진행한다. id 없거나 ls 접근 실패 시에도 throw하지 않음.
function _patchLocalVaultRow(id, patch) {
    try {
        const vault = _getVaultItemsSync();
        const idx = vault.findIndex(v => v.id === id);
        if (idx < 0) return;
        vault[idx] = { ...vault[idx], ...patch };
        lsSet(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error('Failed to patch Vault row in localStorage:', e);
    }
}

// 메모 저장 (Phase 59 — 실수로부터 배우기 노트). vault.js detail view textarea blur 시 호출.
// notes 컬럼은 Phase 1부터 존재 — 마이그레이션 0.
export function updateVaultItemNotes(id, notes) {
    const value = (notes || '').trim();
    _patchLocalVaultRow(id, { notes: value });

    const userId = getMyUserId();
    if (!userId) return;
    callDB('update', 'vault_items', {
        user_id: userId,
        filter: { id },
        data: { notes: value || null },
    }).catch(e => _warnDb('Supabase vault notes update failed', e));
}

// 정답 카운터 +1 (Phase 58). vault.js renderPuzzleFeedback이 correct=true일 때 호출.
// 반환: 갱신된 새 solvedCount. localStorage에 row가 없으면(Supabase-only 카드) currentCount를
// 기준으로 +1 — 호출자가 메모리의 현재값을 넘긴다. DB는 best-effort PATCH.
// 미마이그레이션 환경에선 PostgREST가 unknown column으로 PATCH 거부 → 무해(다음 분석에서 갱신).
export function incrementVaultItemSolved(id, currentCount = 0) {
    let next = (currentCount || 0) + 1;
    try {
        const vault = _getVaultItemsSync();
        const idx = vault.findIndex(v => v.id === id);
        if (idx >= 0) {
            next = (vault[idx].solvedCount ?? 0) + 1;
            vault[idx] = { ...vault[idx], solvedCount: next };
            lsSet(VAULT_KEY, JSON.stringify(vault));
        }
    } catch (e) {
        console.error('Failed to bump solvedCount in Vault:', e);
    }

    const userId = getMyUserId();
    if (!userId) return next;
    callDB('update', 'vault_items', {
        user_id: userId,
        filter: { id },
        data: { solved_count: next },
    }).catch(e => _warnDb('Supabase vault solvedCount update failed', e));
    return next;
}

// ── Saved Games ────────────────────────────────────────────────────

function _getSavedGamesSync() {
    try {
        return JSON.parse(lsGet(SAVED_GAMES_KEY, '[]') || '[]');
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
    const filterLocal = (arr) => arr.filter(g => (g.platform || PLATFORM_CHESSCOM) === platform);

    const userId = getMyUserId();
    if (!userId) return filterLocal(_getSavedGamesSync());
    try {
        const data = await callDB('select', 'saved_games', { user_id: userId });
        if (Array.isArray(data)) return data.map(normalizeSavedGame);
        throw new Error('Invalid response');
    } catch (e) {
        _warnDb('Supabase saved_games load failed, using localStorage', e);
        return filterLocal(_getSavedGamesSync());
    }
}

export function addSavedGame(item) {
    // platform 태깅은 Supabase 실패 시에도 폴백에서 격리 유지하기 위함.
    try {
        const games = _getSavedGamesSync();
        games.push({ ...item, platform: getMyPlatform() });
        if (!lsSet(SAVED_GAMES_KEY, JSON.stringify(games))) throw new Error('localStorage write failed');
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
    }).catch(e => _warnDb('Supabase saved_games save failed', e));
}

export function removeSavedGame(id) {
    try {
        const games = _getSavedGamesSync().filter(g => g.id !== id);
        if (!lsSet(SAVED_GAMES_KEY, JSON.stringify(games))) throw new Error('localStorage write failed');
    } catch (e) {
        console.error('Failed to remove saved game:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    callDB('delete', 'saved_games', { id, user_id: userId })
        .catch(e => _warnDb('Supabase delete failed', e));
}

export function updateSavedGame(id, updates) {
    const platform = getMyPlatform();
    try {
        // platform 격리 — 다른 플랫폼의 동일 id row는 건드리지 않음.
        const games = _getSavedGamesSync().map(g => {
            if (g.id !== id) return g;
            if ((g.platform || PLATFORM_CHESSCOM) !== platform) return g;
            return { ...g, ...updates };
        });
        if (!lsSet(SAVED_GAMES_KEY, JSON.stringify(games))) throw new Error('localStorage write failed');
    } catch (e) {
        console.error('Failed to update saved game:', e);
    }

    const userId = getMyUserId();
    if (!userId) return;
    callDB('update', 'saved_games', {
        user_id: userId,
        filter: { id },
        data: updates,
    }).catch(e => _warnDb('Supabase saved_games update failed', e));
}

// ── Analyzed Games (자동 수집된 블런더의 PGN 보관소) ─────────────────
// vault_items(source='auto')와 분리: 한 게임당 1행, 다수 블런더가 analyzed_game_id로 참조.
// 같은 PGN(pgn_hash) 재분석 시 dedup — UNIQUE(user_id, pgn_hash).

function _getAnalyzedGamesSync() {
    try {
        return JSON.parse(lsGet(ANALYZED_GAMES_KEY, '[]') || '[]');
    } catch (e) {
        console.error('Failed to read analyzed_games from localStorage:', e);
        return [];
    }
}

function _analyzedGameTime(row) {
    const raw = row?.created_at || row?.played_date;
    if (!raw) return 0;
    const value = String(raw);
    let time = Date.parse(value);
    if (!Number.isFinite(time)) time = Date.parse(value.replace(/\./g, '-'));
    return Number.isFinite(time) ? time : 0;
}

function _isCurrentAnalyzedGame(row, userId, platform) {
    if (!row || (row.platform || PLATFORM_CHESSCOM) !== platform) return false;
    if (!userId) return !row.user_id;
    // Older local analyzed rows did not store user_id. Keep them visible for the
    // current browser while new rows store user_id for proper scope isolation.
    return !row.user_id || row.user_id === userId;
}

function _currentReportScopeKey() {
    const userId = getMyUserId();
    if (!userId) return null;
    return `${getMyPlatform()}:${userId}`;
}

function _getTenReportCursorMap() {
    try {
        return JSON.parse(lsGet(TEN_REPORT_CURSOR_KEY, '{}') || '{}');
    } catch (e) {
        console.error('Failed to read ten report cursor:', e);
        return {};
    }
}

function _getTenReportsMap() {
    try {
        return JSON.parse(lsGet(TEN_REPORTS_KEY, '{}') || '{}');
    } catch (e) {
        console.error('Failed to read ten reports:', e);
        return {};
    }
}

export function getRecentAnalyzedGames(limit = 10) {
    const userId = getMyUserId();
    if (!userId) return [];
    const platform = getMyPlatform();
    return _getAnalyzedGamesSync()
        .filter(row => _isCurrentAnalyzedGame(row, userId, platform))
        .filter(row => Array.isArray(row.analysis_json?.moves) && row.analysis_json.moves.length > 0)
        .sort((a, b) => _analyzedGameTime(b) - _analyzedGameTime(a))
        .slice(0, limit);
}

export function getTenReportCursor() {
    const scopeKey = _currentReportScopeKey();
    if (!scopeKey) return null;
    const map = _getTenReportCursorMap();
    const value = Number(map[scopeKey]);
    return Number.isFinite(value) && value > 0 ? value : null;
}

export function markTenReportCursorAt(row) {
    const scopeKey = _currentReportScopeKey();
    const time = _analyzedGameTime(row);
    if (!scopeKey || !time) return false;
    const map = _getTenReportCursorMap();
    map[scopeKey] = time;
    return lsSet(TEN_REPORT_CURSOR_KEY, JSON.stringify(map));
}

export function getTenReportProgressCount(limit = 10) {
    const cursor = getTenReportCursor();
    const rows = getRecentAnalyzedGames(1000);
    if (!cursor) return Math.min(rows.length, limit);
    return Math.min(rows.filter(row => _analyzedGameTime(row) > cursor).length, limit);
}

export function getTenReports() {
    const scopeKey = _currentReportScopeKey();
    if (!scopeKey) return [];
    const map = _getTenReportsMap();
    return (Array.isArray(map[scopeKey]) ? map[scopeKey] : [])
        .slice()
        .sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0));
}

export function saveTenReport(report) {
    const scopeKey = _currentReportScopeKey();
    if (!scopeKey || !report || !Array.isArray(report.game_ids)) return false;
    const map = _getTenReportsMap();
    const reports = Array.isArray(map[scopeKey]) ? map[scopeKey] : [];
    const signature = report.game_ids.join('|');
    if (reports.some(item => Array.isArray(item.game_ids) && item.game_ids.join('|') === signature)) {
        return true;
    }
    map[scopeKey] = reports.concat(report);
    return lsSet(TEN_REPORTS_KEY, JSON.stringify(map));
}

// PGN moves-only 영역만 해싱. SAN 토큰 시퀀스만 추출해 표기 변형(시계 주석, black ellipsis,
// NAG, 변형, annotation, 결과 토큰)에 영향받지 않게 함.
//
// 주의: chess.com API 원본 PGN은 `1. d4 {[%clk ...]} 1... d5 {[%clk ...]}` 형태 (black ellipsis 포함),
// chess.js round-trip 결과는 `1. d4 d5` 형태 (ellipsis 없음). 두 입력이 같은 hash를 내야
// (저장: round-trip / 조회: API 원본) decorateCardWithAnalysisAsync 매칭이 성립.
export async function computePgnHash(pgn) {
    if (!pgn) return '';
    const moves = pgn
        .split('\n')
        .filter(l => !l.startsWith('['))
        .join(' ')
        .replace(/\{[^}]*\}/g, '')                // 주석 (시계, eval 등)
        .replace(/\([^)]*\)/g, '')                // 변형 라인
        .replace(/\$\d+/g, '')                    // NAG ($1, $2, …)
        .replace(/\d+\s*\.{3}/g, '')              // black move ellipsis (1... / 1 ...)
        .replace(/\d+\s*\./g, '')                 // white move number (1. / 1 .)
        .replace(/[!?]+/g, '')                    // SAN annotation (! ? !! ?? !? ?!)
        .replace(/\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/, '')  // 결과 토큰 (게임 끝)
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
    const existingLocal = local.find(g => g.pgn_hash === pgnHash && (g.platform || PLATFORM_CHESSCOM) === platform);
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
                lsSet(ANALYZED_GAMES_KEY, JSON.stringify(local));
                return row.id;
            }
        } catch (e) {
            _warnDb('Supabase analyzed_games lookup failed', e);
        }
    }

    // 신규 행 생성
    const id = crypto.randomUUID();
    const row = {
        id,
        user_id: userId || null,
        pgn,
        pgn_hash: pgnHash,
        headers_json: headersJson || null,
        played_date: playedDate || null,
        platform,
        created_at: new Date().toISOString(),
    };
    local.push(row);
    lsSet(ANALYZED_GAMES_KEY, JSON.stringify(local));

    // Supabase INSERT를 await하여 후속 PATCH(saveAnalysisCache)가 행 존재를 전제할 수 있게 함.
    // 충돌(409)이나 네트워크 실패는 catch에서 흡수 — localStorage row는 이미 보장.
    if (userId) {
        try {
            await callDB('insert', 'analyzed_games', {
                user_id: userId,
                data: { ...row, user_id: userId },
            });
        } catch (e) {
            _warnDb('Supabase analyzed_games insert failed', e);
        }
    }
    return id;
}

export async function getAnalyzedGameById(id) {
    if (!id) return null;
    const platform = getMyPlatform();
    // platform 격리 — 다른 플랫폼 row가 같은 id로 캐시에 있어도 현재 플랫폼 게임만 반환.
    const local = _getAnalyzedGamesSync().find(g => g.id === id && (g.platform || PLATFORM_CHESSCOM) === platform);
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
            lsSet(ANALYZED_GAMES_KEY, JSON.stringify(cache));
            return data[0];
        }
    } catch (e) {
        _warnDb('Supabase analyzed_games fetch failed', e);
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

    const local = _getAnalyzedGamesSync().find(g => g.pgn_hash === pgnHash && (g.platform || PLATFORM_CHESSCOM) === platform);
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
            const idx = cache.findIndex(g => g.pgn_hash === pgnHash && (g.platform || PLATFORM_CHESSCOM) === platform);
            if (idx >= 0) cache[idx] = { ...cache[idx], ...data[0] };
            else cache.push(data[0]);
            lsSet(ANALYZED_GAMES_KEY, JSON.stringify(cache));
            return data[0].analysis_json;
        }
    } catch (e) {
        _warnDb('Supabase analysis cache fetch failed', e);
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

    // localStorage 즉시 반영 — _persistAnalysisCache가 upsertAnalyzedGame으로 행을 보장하니
    // idx >= 0이어야 정상. idx < 0이면 호출 측에서 행 생성을 빼먹은 것 → 진단을 위해 warn.
    const platform = getMyPlatform();
    try {
        const cache = _getAnalyzedGamesSync();
        const idx = cache.findIndex(g => g.pgn_hash === pgnHash && (g.platform || PLATFORM_CHESSCOM) === platform);
        if (idx >= 0) {
            cache[idx] = { ...cache[idx], ...cachePatch };
            if (!lsSet(ANALYZED_GAMES_KEY, JSON.stringify(cache))) throw new Error('localStorage write failed');
        } else {
            console.warn('saveAnalysisCache: 매칭 행 없음 — 캐시 PATCH 스킵', { pgnHash, platform, cacheLen: cache.length });
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
    }).catch(e => _warnDb('Supabase analysis cache update failed', e));
}
