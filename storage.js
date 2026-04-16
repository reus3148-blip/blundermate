export const VAULT_KEY = 'blundermate_vault';
export const SAVED_GAMES_KEY = 'blundermate_saved_games';

export function getVaultItems() {
    try {
        return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
    } catch (e) {
        console.error("Failed to read Vault from localStorage:", e);
        return [];
    }
}

export function addVaultItem(item) {
    try {
        const vault = getVaultItems();
        vault.push(item);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error("Failed to save to Vault:", e);
        alert("Could not save data. Storage might be full or blocked.");
    }
}

export function removeVaultItem(id) {
    try {
        const vault = getVaultItems().filter(v => v.id !== id);
        localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
    } catch (e) {
        console.error("Failed to remove item from Vault:", e);
    }
}

export function getSavedGames() {
    try {
        return JSON.parse(localStorage.getItem(SAVED_GAMES_KEY) || '[]');
    } catch (e) {
        console.error("Failed to read Saved Games from localStorage:", e);
        return [];
    }
}

export function addSavedGame(item) {
    try {
        const games = getSavedGames();
        games.push(item);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error("Failed to save game:", e);
        alert("Could not save game. Storage might be full or blocked.");
    }
}

export function removeSavedGame(id) {
    try {
        const games = getSavedGames().filter(g => g.id !== id);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error("Failed to remove saved game:", e);
    }
}

export function updateSavedGame(id, updates) {
    try {
        const games = getSavedGames().map(g => g.id === id ? { ...g, ...updates } : g);
        localStorage.setItem(SAVED_GAMES_KEY, JSON.stringify(games));
    } catch (e) {
        console.error("Failed to update saved game:", e);
    }
}