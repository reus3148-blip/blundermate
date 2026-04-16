# Supabase Schema Reference

## Connection
VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are in .env
Use the existing Supabase client instance already set up in this project.

---

## Tables

### vault_items
Stores individual move/position saves (복기).

| column | type | description |
|--------|------|-------------|
| id | uuid | primary key, auto-generated |
| user_id | text | user's chess.com ID or custom ID |
| move | text | move notation e.g. "Nd4" |
| classification | text | blunder / mistake / inaccuracy / excellent / best |
| notes | text | user's memo (nullable) |
| position_fen | text | FEN string of the position |
| pgn | text | full game PGN for context (nullable) |
| created_at | timestamp | auto-generated |

### saved_games
Stores full game saves (저장된 게임).

| column | type | description |
|--------|------|-------------|
| id | uuid | primary key, auto-generated |
| user_id | text | user's chess.com ID or custom ID |
| title | text | user-defined game title |
| category | text | "my_game" / "otb" / "opening" / "pro" |
| pgn | text | full PGN of the game |
| notes | text | user's memo (nullable) |
| created_at | timestamp | auto-generated |

---

## user_id
- Stored in localStorage key: "blundermate_user_id"
- Set when user enters their Chess.com ID on home screen
- All queries filter by this user_id
- No authentication — user_id is just a text identifier

---

## Critical rules for Claude Code
- NEVER delete or modify table structure
- ALWAYS filter queries by user_id
- ALWAYS use try/catch for every Supabase operation
- On error: fail silently, fall back to localStorage, log to console only
- NEVER show Supabase errors to the user
- Test read before write — if Supabase unreachable, use localStorage
- All operations are async/await