# OPERATIONS

Production and growth notes for Blundermate. Code rules live in [AGENTS.md](AGENTS.md); current priorities live in [CURRENT.md](CURRENT.md).

## Production

- Public URL: `https://blundermate.app`
- Hosting: Vercel
- Data: Supabase REST through Vercel Edge Functions plus localStorage fallback
- AI: Gemini through [api/analyze.js](api/analyze.js)
- Cost guard: Gemini monthly budget is capped externally at about KRW 10,000

## Environment Variables

Current code expects:

- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Older docs may mention `GOOGLE_API_KEY`; the code currently reads `GEMINI_API_KEY`.

## Tables Used Operationally

- `analyzed_games`: analyzed PGN rows and analysis cache
- `vault_items`: auto-collected blunder/mate review items
- `saved_games`: explicit user saves
- `username_logs`: fire-and-forget nickname attempts; RLS insert-only
- `feedbacks`: freeform feedback form; almost unused
- `opening_comments`: forum comments; currently unseeded

See [supabase-schema.md](supabase-schema.md) for full schema.

## Current Usage Snapshot

Checked via Supabase REST aggregate reads on 2026-05-14:

| Metric | Value |
|---|---:|
| analyzed_games | 1,437 |
| analyzed_games with analysis_json | 1,303 |
| distinct analyzed users | 206 |
| last 7d analyzed games | 573 |
| last 7d analyzed users | 96 |
| vault_items | 2,324 |
| auto vault_items | 2,301 |
| saved_games | 51 |
| feedbacks | 13 |
| opening_comments | 0 |

Observed behavior: users analyze games; very few use explicit save, feedback, or forum. Treat analysis -> Vault as the real core loop.

## Useful Supabase Queries

Recent feedback:

```sql
select created_at, content
from public.feedbacks
order by created_at desc
limit 50;
```

Recent nickname attempts:

```sql
select username, source, platform, created_at
from public.username_logs
order by created_at desc
limit 100;
```

Distinct nickname activity:

```sql
select username, source, platform, count(*) as hits, max(created_at) as last_seen
from public.username_logs
group by username, source, platform
order by last_seen desc;
```

Daily analyzed games:

```sql
select date_trunc('day', created_at) as day,
       count(*) as games,
       count(distinct user_id) as users
from public.analyzed_games
group by 1
order by 1 desc
limit 30;
```

Vault creation mix:

```sql
select classification, source, count(*) as items
from public.vault_items
group by classification, source
order by items desc;
```

Analysis cache size:

```sql
select count(*) as games,
       sum(octet_length(analysis_json::text)) / 1024 / 1024.0 as analysis_mb
from public.analyzed_games
where analysis_json is not null;
```

## Risks

- Rate limit is 0 for anonymous POST endpoints. Gemini cost is capped, but DB/API abuse still needs a guard.
- Core app data tables currently rely on Edge Function guards rather than RLS. If anon key exposure happens, PGN/user data may be readable.
- Gemini response markdown uses `marked` without DOMPurify.
- Automated tests are absent; use [TESTING.md](TESTING.md) for manual regression.
- Feedback form is not a meaningful signal. Use behavior logs and lightweight in-flow prompts instead.

## Launch Checklist

Before another domestic community post:

- Confirm analysis flow works on mobile: recent game selection, cached game entry, fresh analysis, review navigation.
- Use one screenshot of the analysis-complete screen.
- Ask for mobile analysis UX feedback, not broad feature requests.
- Mention Vault only as "mistakes are collected automatically" unless specifically asking about it.

Before Reddit:

- Vault first run must be self-explanatory.
- Analysis-complete screen should clearly say what was saved to Vault.
- English UI/copy should feel natural.
- Lichess and PGN paste should pass manual smoke tests.
- Privacy/cost/failure states should not look broken if Gemini is unavailable.
