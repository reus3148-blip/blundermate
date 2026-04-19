const RECENT_GAMES_LIMIT = 10;
let cachedStats = null;
let cachedStatsUser = null;

export async function fetchPlayerStats(username) {
    if (!username) return null;
    const lower = username.toLowerCase();
    if (cachedStatsUser === lower && cachedStats !== undefined) return cachedStats;

    const safeUsername = encodeURIComponent(username.trim());
    try {
        const res = await fetch(`https://api.chess.com/pub/player/${safeUsername}/stats`, {
            method: 'GET', mode: 'cors', headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        // 가장 많이 둔 카테고리 1개만 노출. 동률이면 Rapid > Blitz > Bullet 순 우선(리스트 순서).
        const categories = [['chess_rapid','Rapid'],['chess_blitz','Blitz'],['chess_bullet','Bullet']];
        let best = null;
        for (const [key, label] of categories) {
            const node = data[key];
            if (!node?.last?.rating) continue;
            const r = node.record || {};
            const games = (r.win || 0) + (r.loss || 0) + (r.draw || 0);
            if (!best || games > best.games) {
                best = { label, rating: node.last.rating, games };
            }
        }
        cachedStats = best ? { label: best.label, rating: best.rating } : null;
        cachedStatsUser = lower;
        return cachedStats;
    } catch {
        return null;
    }
}

/**
 * Fetches recent games for a given Chess.com username.
 * @param {string} username
 * @returns {Promise<Array>} Array of recent games
 */
export async function fetchRecentGames(username) {
    if (!username) throw new Error('Username is required.');

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

        while (games.length === 0 && archiveIndex >= 0) {
            const archiveUrl = archives[archiveIndex];
            const gamesRes = await fetch(archiveUrl, options);
            const gamesData = await gamesRes.json();
            games = gamesData.games || [];
            archiveIndex--;
        }

        if (games.length === 0) {
            throw new Error('No games found for this user.');
        }

        return games.slice(-RECENT_GAMES_LIMIT).reverse();
    } catch (error) {
        console.error("Chess.com API Fetch Error:", error);
        // 네트워크 에러(Load failed)인지 API 에러인지 명확히 구분하여 사용자 친화적으로 반환
        if (error.name === 'TypeError') {
            throw new Error('Network error. Please check your internet connection or try again later.');
        }
        throw error;
    }
}