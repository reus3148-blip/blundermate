// Lichess 어댑터. 출력 shape은 chesscom.js의 normalized game shape에 맞춤 —
// utils.js의 isWhitePlayer/classifyGameResult, main.js의 렌더링 코드가 platform-agnostic하게 동작하도록.

const RECENT_GAMES_LIMIT = 100;
let cachedProfile = null;
let cachedProfileUser = null;
let cachedGames = null;
let cachedGamesUser = null;

const FETCH_OPTS = { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } };

// chess.com 결과 코드 호환. classifyGameResult가 'win' 또는 LOSS_CODES만 따져 win/loss/draw로 분류.
const STATUS_TO_LOSS = {
    mate: 'checkmated',
    resign: 'resigned',
    timeout: 'timeout',
    outoftime: 'timeout',
    cheat: 'lose',
    noStart: 'abandoned',
};

// lichess speed → chess.com time_class. 홈 필터(rapid/blitz/bullet)와 호환되도록 매핑.
function mapTimeClass(speed) {
    if (speed === 'ultraBullet') return 'bullet';
    if (speed === 'classical') return 'rapid';
    if (speed === 'correspondence') return 'daily';
    return speed || 'rapid';
}

// chess.com time_control format 호환: increment 0이면 "{초}", 있으면 "{초}+{증분}".
function buildTimeControl(clock) {
    if (!clock) return '';
    const initial = clock.initial ?? 0;
    const inc = clock.increment ?? 0;
    return inc > 0 ? `${initial}+${inc}` : `${initial}`;
}

function buildSidePair(game) {
    const winner = game.winner; // 'white' | 'black' | undefined(=draw)
    const status = game.status;
    const lossCode = STATUS_TO_LOSS[status] || 'lose';
    // 무승부면 양쪽 모두 'agreed'로 설정 — classifyGameResult에서 'win'/LOSS_CODES 어디에도 안 잡혀 draw로 분류됨.
    const drawCode = 'agreed';

    const buildSide = (color) => {
        const p = game.players?.[color] || {};
        const username = p.user?.name || (p.aiLevel ? `Stockfish lvl ${p.aiLevel}` : 'Anonymous');
        const rating = p.rating ?? null;
        let result;
        if (!winner) result = drawCode;
        else if (winner === color) result = 'win';
        else result = lossCode;
        return { username, rating, result };
    };

    return { white: buildSide('white'), black: buildSide('black') };
}

function normalizeGame(game) {
    const sides = buildSidePair(game);
    return {
        url: `https://lichess.org/${game.id}`,
        pgn: game.pgn || '',
        time_control: buildTimeControl(game.clock),
        // chess.com end_time은 초 단위. lichess lastMoveAt은 ms.
        end_time: game.lastMoveAt ? Math.floor(game.lastMoveAt / 1000) : (game.createdAt ? Math.floor(game.createdAt / 1000) : 0),
        rated: !!game.rated,
        time_class: mapTimeClass(game.speed),
        rules: game.variant === 'standard' ? 'chess' : (game.variant || 'chess'),
        white: sides.white,
        black: sides.black,
    };
}

export async function fetchPlayerProfile(username) {
    if (!username) return null;
    const lower = username.toLowerCase();
    if (cachedProfileUser === lower && cachedProfile) return cachedProfile;

    const safe = encodeURIComponent(username.trim());
    try {
        const res = await fetch(`https://lichess.org/api/user/${safe}`, FETCH_OPTS);
        if (!res.ok) {
            cachedProfile = null;
            cachedProfileUser = lower;
            return null;
        }
        const data = await res.json();
        const perfs = data.perfs || {};
        const ratings = {
            rapid: perfs.rapid?.rating ?? null,
            blitz: perfs.blitz?.rating ?? null,
            bullet: perfs.bullet?.rating ?? null,
        };
        // lichess는 user-uploaded 아바타 API를 노출하지 않음 — null로 두고 티어 글리프 폴백.
        const profile = {
            ratings,
            avatar: null,
            displayName: data.username || data.id || username,
        };
        cachedProfile = profile;
        cachedProfileUser = lower;
        return profile;
    } catch {
        return null;
    }
}

// lichess는 NDJSON으로 한 번에 여러 게임 반환. chess.com의 월별 archive iteration보다 단순.
export async function fetchRecentGames(username, limit = RECENT_GAMES_LIMIT) {
    if (!username) throw new Error('Username is required.');

    const lowerUser = username.trim().toLowerCase();
    if (cachedGamesUser === lowerUser && cachedGames && cachedGames.length >= limit) {
        return cachedGames.slice(0, limit);
    }

    const safeUsername = encodeURIComponent(username.trim());
    const url = `https://lichess.org/api/games/user/${safeUsername}?max=${limit}&pgnInJson=true&clocks=false&opening=false&moves=true`;

    try {
        const res = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            // x-ndjson Accept를 명시해야 lichess가 application/json 단일 객체가 아닌 ndjson을 보냄.
            headers: { 'Accept': 'application/x-ndjson' },
        });
        if (!res.ok) {
            if (res.status === 404) throw new Error('Player not found.');
            throw new Error(`API error: ${res.status}`);
        }
        const text = await res.text();
        const games = text
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => {
                try { return JSON.parse(line); } catch { return null; }
            })
            .filter(Boolean)
            .map(normalizeGame);

        if (games.length === 0) throw new Error('No games found for this user.');

        // lichess가 보통 최신순으로 주지만 안전하게 한 번 더 정렬.
        games.sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
        const sliced = games.slice(0, limit);
        cachedGames = sliced;
        cachedGamesUser = lowerUser;
        return sliced;
    } catch (error) {
        console.error('Lichess API Fetch Error:', error);
        if (error.name === 'TypeError') {
            throw new Error('Network error. Please check your internet connection or try again later.');
        }
        throw error;
    }
}
