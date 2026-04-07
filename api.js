/**
 * Fetches recent games for a given Chess.com username.
 * @param {string} username 
 * @returns {Promise<Array>} Array of recent games
 */
export async function fetchRecentGames(username) {
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
    if (!archivesRes.ok) throw new Error('Player not found or API error.');
    
    const archivesData = await archivesRes.json();
    if (!archivesData?.archives?.length) {
        throw new Error('No game archives found.');
    }

    const latestArchiveUrl = archivesData.archives[archivesData.archives.length - 1];
    const gamesRes = await fetch(latestArchiveUrl);
    const gamesData = await gamesRes.json();

    if (!gamesData?.games?.length) {
        throw new Error('No recent games found in the latest archive.');
    }

    return gamesData.games.slice(-10).reverse();
}