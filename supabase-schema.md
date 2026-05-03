# Supabase 스키마 reference

현재 운영 중인 5개 테이블의 전체 스키마. 새 환경 셋업 시 이 문서의 SQL을 SQL Editor에 순서대로 붙여넣으면 됨.

코드에서 실제 사용하는 컬럼만 정의 (PostgREST 화이트리스트는 [`api/db.js`](api/db.js) 참조).

---

## 1. `vault_items` — 복기 풀

자동(분석 완료 후 워스트 2 + missed_mate)과 수동(분석 화면에서 직접 저장) 두 출처를 한 테이블에 보관. `source` 컬럼으로 구분.

```sql
create table public.vault_items (
  id uuid primary key,
  user_id text not null,
  platform text not null default 'chesscom',
  move text not null,
  classification text not null,
  notes text,
  position_fen text not null,
  pgn text,                          -- source='manual'에만 있음, 'auto'는 NULL (analyzed_games 참조)
  source text not null default 'manual' check (source in ('manual', 'auto')),
  analyzed_game_id uuid references public.analyzed_games(id) on delete set null,
  move_index integer,
  move_number integer,
  best_move text,
  game_title text,
  cp_loss numeric,
  mate_in integer,                   -- missed_mate 항목에만 있음 (M{N} 표시·budget 검증용)
  played_date text,                  -- 자동/수동 공통 정렬 키 (PGN UTCDate||Date)
  created_at timestamptz not null default now()
);

create index vault_items_user_platform_idx on public.vault_items (user_id, platform);
create index vault_items_played_date_idx on public.vault_items (user_id, platform, played_date desc);
```

---

## 2. `analyzed_games` — 분석된 게임 + 결과 캐시

한 게임당 1행. `vault_items(source='auto')`가 `analyzed_game_id`로 참조해 PGN 중복 보관 방지. 같은 게임을 다시 열 때 `analysis_json` 캐시로 Stockfish/Gemini 재실행 스킵.

```sql
create table public.analyzed_games (
  id uuid primary key,
  user_id text not null,
  platform text not null default 'chesscom',
  pgn_hash text not null,            -- SHA-256 hex of normalized PGN
  pgn text not null,
  headers_json jsonb,
  played_date text,
  analysis_json jsonb,               -- { version, depth, moves: [{ engineLines, classification }, ...] }
  analysis_depth smallint,           -- 캐시 생성 시 depth. 사용자 현재 depth가 더 깊으면 재분석.
  analysis_version smallint,         -- 캐시 포맷 버전. classifyMove/스키마 변경 시 bump해서 자동 무효화.
  created_at timestamptz not null default now(),

  unique (user_id, platform, pgn_hash)
);
```

캐시 페이로드 크기: 80수 게임 기준 평균 20–40KB JSONB. 한 사용자 1만 게임 ≈ 200–400MB (무료 티어 500MB 안에서 큰 풀 사용자도 수용).

---

## 3. `saved_games` — 사용자가 직접 저장한 게임

```sql
create table public.saved_games (
  id uuid primary key,
  user_id text not null,
  platform text not null default 'chesscom',
  title text not null,
  category text not null check (category in ('my_game', 'otb', 'opening', 'pro')),
  pgn text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index saved_games_user_platform_idx on public.saved_games (user_id, platform);
```

---

## 4. `username_logs` — 닉네임 입력 로그

누가 어떤 닉네임을 어떤 진입점으로 쳐봤는지 fire-and-forget INSERT. 조회는 service_role로만.

```sql
create table public.username_logs (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  source text not null check (source in ('onboarding', 'search', 'cached')),
  platform text not null default 'chesscom',
  created_at timestamptz not null default now()
);

create index username_logs_username_idx on public.username_logs (username);
create index username_logs_created_at_idx on public.username_logs (created_at desc);

alter table public.username_logs enable row level security;

create policy "anon can insert"
  on public.username_logs
  for insert
  to anon
  with check (true);
```

조회는 RLS로 막힘 → Supabase 대시보드에서 service_role로만 가능.

---

## 5. `feedbacks` — 사용자 피드백

`api/feedback.js`가 anon 키로 INSERT. 컬럼은 `content` 하나만 사용.

```sql
create table public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.feedbacks enable row level security;

create policy "anon can insert feedback"
  on public.feedbacks
  for insert
  to anon
  with check (true);
```

---

## RLS 정책 요약

| 테이블 | RLS | 정책 |
|---|---|---|
| `vault_items` / `saved_games` / `analyzed_games` | RLS 미사용 (Edge Function이 service_role 키로 접근, `user_id` 검증은 [`api/db.js`](api/db.js)에서 수동) |
| `username_logs` | enabled | anon INSERT only |
| `feedbacks` | enabled | anon INSERT only |

---

## user_id / platform 격리 원칙

- `user_id`는 항상 lowercase로 저장·쿼리. 클라이언트([`storage.js`](storage.js)) + 서버([`api/db.js`](api/db.js)) 양쪽 진입 시점에서 정규화 (Chess.com이 케이스 무시하는 데 따름).
- 모든 영속 테이블은 `(user_id, platform)` 쌍으로 격리. `platform`은 `'chesscom'` 또는 `'lichess'` (Phase 34).
- `analyzed_games`만 UNIQUE 키에도 포함 — 같은 PGN을 두 플랫폼에서 분석해도 충돌 없음.

---

## 환경변수

```
SUPABASE_URL
SUPABASE_ANON_KEY
```

`api/feedback.js` / `api/log-username.js` / `api/db.js`가 모두 같은 두 변수를 공유.

---

## 운영 쿼리

**최근 입력된 닉네임:**
```sql
select username, source, platform, created_at
from public.username_logs
order by created_at desc
limit 100;
```

**distinct 닉네임 + 최종 사용 시각:**
```sql
select username, source, platform, count(*) as hits, max(created_at) as last_seen
from public.username_logs
group by username, source, platform
order by last_seen desc;
```

**분석 캐시 사용량 (한 사용자 기준):**
```sql
select count(*) as games,
       sum(octet_length(analysis_json::text)) / 1024 / 1024.0 as analysis_mb
from public.analyzed_games
where user_id = lower('your_username')
  and analysis_json is not null;
```

**최근 피드백:**
```sql
select content, created_at
from public.feedbacks
order by created_at desc
limit 50;
```
