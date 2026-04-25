# Supabase 셋업: `username_logs` 테이블

이 SQL을 Supabase 대시보드 → **SQL Editor**에 그대로 붙여넣고 실행하세요. 실행 후에는 이 md 파일은 삭제해도 됩니다.

```sql
-- 1. 테이블 생성
create table public.username_logs (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  source text not null check (source in ('onboarding', 'search', 'cached')),
  created_at timestamptz not null default now()
);

-- 2. 조회용 인덱스
create index username_logs_username_idx on public.username_logs (username);
create index username_logs_created_at_idx on public.username_logs (created_at desc);

-- 3. RLS 활성화
alter table public.username_logs enable row level security;

-- 4. anon 키로 INSERT만 허용 (Edge Function이 anon 키 사용)
create policy "anon can insert"
  on public.username_logs
  for insert
  to anon
  with check (true);

-- (조회는 RLS로 막힘 → Supabase 대시보드 Table Editor / SQL Editor에서만 service_role로 조회 가능)
```

## 기존 데이터 lowercase 정규화 (필수, 1회 실행)

vault_items / saved_games / username_logs에 이미 mixed-case로 들어간 행들을 일괄 정규화. 안 돌리면 기존 사용자가 본인의 vault/저장 게임을 못 봅니다.

```sql
update public.vault_items   set user_id  = lower(user_id)  where user_id  <> lower(user_id);
update public.saved_games   set user_id  = lower(user_id)  where user_id  <> lower(user_id);
update public.username_logs set username = lower(username) where username <> lower(username);
```

## 이미 위 SQL을 `cached` 없이 실행했다면

CHECK 제약만 갈아끼우면 됩니다.

```sql
alter table public.username_logs drop constraint username_logs_source_check;
alter table public.username_logs add constraint username_logs_source_check
  check (source in ('onboarding', 'search', 'cached'));
```

## 누가 닉네임 쳐 봤는지 보고 싶을 때

Supabase SQL Editor에서:

```sql
-- 최근 100건
select username, source, created_at
from public.username_logs
order by created_at desc
limit 100;

-- distinct 닉네임만
select username, source, count(*) as hits, max(created_at) as last_seen
from public.username_logs
group by username, source
order by last_seen desc;
```

## 환경변수

이미 `feedback.js`가 쓰는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`를 그대로 재사용. 별도 추가 작업 없음.
