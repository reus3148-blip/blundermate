Read SUPABASE.md before starting. Follow all critical rules exactly.

Connect vault_items and saved_games to Supabase.
Keep localStorage as fallback — if Supabase fails, app must still work.

## user_id setup
- On app load, read localStorage key "blundermate_user_id"
- If exists: use it as user_id for all queries
- If not exists: user_id is null, skip Supabase, use localStorage only
- When user enters Chess.com ID on home screen: save to localStorage "blundermate_user_id"

## vault_items — migrate existing functions

Replace current save logic:
async function saveToVault(item) {
  // always save to localStorage first (backup)
  saveToLocalStorage('vault', item)
  
  // then try Supabase
  if (!getUserId()) return
  try {
    await supabase.from('vault_items').insert({
      user_id: getUserId(),
      move: item.move,
      classification: item.classification,
      notes: item.notes,
      position_fen: item.fen,
      pgn: item.pgn
    })
  } catch (e) {
    console.log('Supabase vault save failed, using localStorage', e)
  }
}

Replace current load logic:
async function loadVault() {
  if (!getUserId()) return loadFromLocalStorage('vault')
  try {
    const { data, error } = await supabase
      .from('vault_items')
      .select('*')
      .eq('user_id', getUserId())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  } catch (e) {
    console.log('Supabase vault load failed, using localStorage', e)
    return loadFromLocalStorage('vault')
  }
}

Replace current delete logic:
async function deleteFromVault(id) {
  deleteFromLocalStorage('vault', id)
  if (!getUserId()) return
  try {
    await supabase.from('vault_items').delete().eq('id', id)
  } catch (e) {
    console.log('Supabase vault delete failed', e)
  }
}

## saved_games — same pattern

async function saveGame(game) {
  saveToLocalStorage('saved_games', game)
  if (!getUserId()) return
  try {
    await supabase.from('saved_games').insert({
      user_id: getUserId(),
      title: game.title,
      category: game.category,
      pgn: game.pgn,
      notes: game.notes
    })
  } catch (e) {
    console.log('Supabase saved_games save failed', e)
  }
}

async function loadSavedGames() {
  if (!getUserId()) return loadFromLocalStorage('saved_games')
  try {
    const { data, error } = await supabase
      .from('saved_games')
      .select('*')
      .eq('user_id', getUserId())
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  } catch (e) {
    console.log('Supabase saved_games load failed, using localStorage', e)
    return loadFromLocalStorage('saved_games')
  }
}

async function deleteSavedGame(id) {
  deleteFromLocalStorage('saved_games', id)
  if (!getUserId()) return
  try {
    await supabase.from('saved_games').delete().eq('id', id)
  } catch (e) {
    console.log('Supabase delete failed', e)
  }
}

## Rules
- Adapt function names and localStorage keys to match existing code
- Never show any error to the user
- Never break existing functionality
- If user_id is null, everything works via localStorage as before
- No loading spinners for Supabase operations — do it silently in background