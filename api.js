/**
 * Fetches recent games for a given Chess.com username.
 * @param {string} username 
 * @returns {Promise<Array>} Array of recent games
 */
export async function fetchRecentGames(username) {
    // Chess.com API 가이드라인 준수를 위한 User-Agent 헤더
    // 주의: 실제 서비스 시 이메일 주소를 본인의 연락처로 변경하세요.
    const headers = {
        'User-Agent': 'Blundermate - Chess Review App / Contact: your_email@example.com'
    };

    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`, { headers });
    if (!archivesRes.ok) throw new Error('Player not found or API error.');
    
    const archivesData = await archivesRes.json();
    if (!archivesData?.archives?.length) {
        throw new Error('No game archives found.');
    }

    const latestArchiveUrl = archivesData.archives[archivesData.archives.length - 1];
    const gamesRes = await fetch(latestArchiveUrl, { headers });
    const gamesData = await gamesRes.json();

    if (!gamesData?.games?.length) {
        throw new Error('No recent games found in the latest archive.');
    }

    return gamesData.games.slice(-10).reverse();
}