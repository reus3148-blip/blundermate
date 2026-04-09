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
        if (!archivesData?.archives?.length) {
            throw new Error('No game archives found.');
        }

        const latestArchiveUrl = archivesData.archives[archivesData.archives.length - 1];
        const gamesRes = await fetch(latestArchiveUrl, options);
        if (!gamesRes.ok) throw new Error(`Failed to fetch games: ${gamesRes.status}`);
        
        const gamesData = await gamesRes.json();
        if (!gamesData?.games?.length) {
            throw new Error('No recent games found in the latest archive.');
        }

        return gamesData.games.slice(-10).reverse();
    } catch (error) {
        console.error("Chess.com API Fetch Error:", error);
        // 네트워크 에러(Load failed)인지 API 에러인지 명확히 구분하여 사용자 친화적으로 반환
        if (error.name === 'TypeError') {
            throw new Error('Network error. Please check your internet connection or try again later.');
        }
        throw error;
    }
}