const RECENT_GAMES_LIMIT = 100;
let cachedProfile = null;
let cachedProfileUser = null;
// 게임 목록 캐시. 홈(필터별)과 insights(통계)가 같은 데이터 공유.
let cachedGames = null;
let cachedGamesUser = null;

const FETCH_OPTS = { method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' } };

export async function fetchPlayerProfile(username) {
    if (!username) return null;
    const lower = username.toLowerCase();
    if (cachedProfileUser === lower && cachedProfile) return cachedProfile;

    const safe = encodeURIComponent(username.trim());
    try {
        const [statsRes, playerRes] = await Promise.all([
            fetch(`https://api.chess.com/pub/player/${safe}/stats`, FETCH_OPTS),
            fetch(`https://api.chess.com/pub/player/${safe}`, FETCH_OPTS),
        ]);
        const ratings = { rapid: null, blitz: null, bullet: null };
        if (statsRes.ok) {
            const data = await statsRes.json();
            const map = { chess_rapid: 'rapid', chess_blitz: 'blitz', chess_bullet: 'bullet' };
            for (const [key, field] of Object.entries(map)) {
                if (data[key]?.last?.rating) ratings[field] = data[key].last.rating;
            }
        }
        let avatar = null;
        if (playerRes.ok) {
            const player = await playerRes.json();
            if (player?.avatar) avatar = player.avatar;
        }
        cachedProfile = { ratings, avatar };
        cachedProfileUser = lower;
        return cachedProfile;
    } catch {
        return null;
    }
}

/**
 * Fetches recent games for a given Chess.com username.
 * @param {string} username
 * @returns {Promise<Array>} Array of recent games
 */
export async function fetchRecentGames(username, limit = RECENT_GAMES_LIMIT) {
    if (!username) throw new Error('Username is required.');

    // 캐시 hit: 같은 유저 + 충분한 양 보유 시 재사용 (홈 필터링과 insights 양쪽 활용).
    const lowerUser = username.trim().toLowerCase();
    if (cachedGamesUser === lowerUser && cachedGames && cachedGames.length >= limit) {
        return cachedGames.slice(0, limit);
    }

    // 공백 및 특수문자로 인한 URL 파싱 오류(Load failed) 방지
    const safeUsername = encodeURIComponent(username.trim());

    // iOS Safari 등 엄격한 모바일 브라우저 호환성을 위한 fetch 옵션 명시
    const options = {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Accept': 'application/json'
        }
    };

    try {
        const archivesRes = await fetch(`https://api.chess.com/pub/player/${safeUsername}/games/archives`, options);
        if (!archivesRes.ok) {
            if (archivesRes.status === 404) throw new Error('Player not found.');
            throw new Error(`API error: ${archivesRes.status}`);
        }
        
        const archivesData = await archivesRes.json();

        const archives = archivesData.archives;
        if (!archives || archives.length === 0) {
            throw new Error('No archives found for this user.');
        }

        let games = [];
        let archiveIndex = archives.length - 1;

        while (games.length < limit && archiveIndex >= 0) {
            try {
                const archiveUrl = archives[archiveIndex];
                const gamesRes = await fetch(archiveUrl, options);
                const gamesData = await gamesRes.json();
                const monthGames = gamesData.games || [];
                games = monthGames.concat(games);
            } catch (e) {
                console.error('Archive fetch error:', e);
            }
            archiveIndex--;
        }

        if (games.length === 0) {
            throw new Error('No games found for this user.');
        }

        games.sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
        const sliced = games.slice(0, limit);
        cachedGames = sliced;
        cachedGamesUser = lowerUser;
        return sliced;
    } catch (error) {
        console.error("Chess.com API Fetch Error:", error);
        // 네트워크 에러(Load failed)인지 API 에러인지 명확히 구분하여 사용자 친화적으로 반환
        if (error.name === 'TypeError') {
            throw new Error('Network error. Please check your internet connection or try again later.');
        }
        throw error;
    }
}