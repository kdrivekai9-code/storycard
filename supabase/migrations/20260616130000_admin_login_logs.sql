-- profiles에 last_seen_at 추가 (온라인 감지용)
alter table profiles add column if not exists last_seen_at timestamptz;

-- 관리자 세션 로그 테이블
create table admin_login_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  ip_address  text,
  logged_in_at  timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  logged_out_at timestamptz,
  created_at    timestamptz not null default now()
);

create index admin_login_logs_user_id_idx on admin_login_logs (user_id);
create index admin_login_logs_logged_in_at_idx on admin_login_logs (logged_in_at desc);

-- RLS: 관리자만 접근
alter table admin_login_logs enable row level security;

create policy "admin_login_logs_admin_all"
  on admin_login_logs for all
  using (is_admin()) with check (is_admin());
