export const VAULT_KEY = 'blundermate_vault';
export const SAVED_GAMES_KEY = 'blundermate_saved_games';

export function getVaultItems() {
    return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
}

export function addVaultItem(item) {
    const vault = getVaultItems();
    vault.push(item);
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function removeVaultItem(id) {
    const vault = getVaultItems().filter(v => v.id !== id);
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
}

export function getSavedGames() {
    return JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) || '[]');
}

export function addSavedGame(item) {
    const games = getSavedGames();
    games.push(item);
    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
}

export function removeSavedGame(id) {
    const games = getSavedGames().filter(g => g.id !== id);
    localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
}