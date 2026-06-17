-- STORYCARD — 어드민 대시보드 지원
-- profiles(권한) + invitations 분류(card_type/tier) + qna/samples/reviews + is_admin() + 관리자 RLS

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  email      text,
  nickname   text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- 새 사용자가 가입(auth.users insert)하면 자동으로 profiles 행 생성
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────
-- is_admin() — RLS 헬퍼 (security definer로 재귀 문제 방지)
-- ─────────────────────────────────────────────
create function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────
-- invitations: 신청 분류 컬럼 추가 (card_type / tier)
-- ─────────────────────────────────────────────
alter table invitations
  add column card_type text not null default 'wedding'
    check (card_type in ('wedding', 'obituary', 'first_birthday', 'general')),
  -- wedding=청첩장 / obituary=부고장 / first_birthday=돌잔치초대장 / general=일반초대장
  add column tier text not null default 'standard'
    check (tier in ('standard', 'premium'));
  -- standard=일반 / premium=프리미엄

-- ─────────────────────────────────────────────
-- qna (Q&A 관리)
-- ─────────────────────────────────────────────
create table qna (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  answer       text not null,
  category     text,
  is_published boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index qna_sort_order_idx on qna (sort_order);

-- ─────────────────────────────────────────────
-- samples (샘플등록관리)
-- ─────────────────────────────────────────────
create table samples (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  card_type     text not null default 'wedding'
    check (card_type in ('wedding', 'obituary', 'first_birthday', 'general')),
  tier          text not null default 'standard'
    check (tier in ('standard', 'premium')),
  thumbnail_url text,
  description   text,
  sort_order    int not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index samples_sort_order_idx on samples (sort_order);

-- ─────────────────────────────────────────────
-- reviews (리뷰관리 — 신청자(소유자)만 작성 가능)
-- ─────────────────────────────────────────────
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations on delete cascade,
  author_id     uuid not null references profiles (id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  content       text not null,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now()
);

create index reviews_invitation_id_idx on reviews (invitation_id);
create index reviews_author_id_idx on reviews (author_id);
-- 한 신청(invitation)당 리뷰는 1개만
create unique index reviews_invitation_id_unique on reviews (invitation_id);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table profiles enable row level security;
alter table qna       enable row level security;
alter table samples   enable row level security;
alter table reviews   enable row level security;

-- profiles: 본인 행 읽기, 관리자는 전체 읽기/수정
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles_update_own" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_all" on profiles
  for all using (is_admin()) with check (is_admin());

-- qna: 공개된 항목은 누구나, 관리자는 전체
create policy "qna_select_published" on qna
  for select using (is_published = true or is_admin());

create policy "qna_admin_all" on qna
  for all using (is_admin()) with check (is_admin());

-- samples: 공개된 항목은 누구나, 관리자는 전체
create policy "samples_select_published" on samples
  for select using (is_published = true or is_admin());

create policy "samples_admin_all" on samples
  for all using (is_admin()) with check (is_admin());

-- reviews
-- 공개 리뷰는 누구나 조회, 작성자 본인/관리자는 비공개 포함 전체 조회
create policy "reviews_select_published" on reviews
  for select using (is_published = true or is_admin() or author_id = auth.uid());

-- 신청자(해당 invitation의 owner)만 본인 명의로 리뷰 작성 가능
create policy "reviews_insert_owner" on reviews
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from invitations i
      where i.id = invitation_id and i.owner_id = auth.uid()
    )
  );

-- 관리자: 게시/숨김/삭제 전체 관리
create policy "reviews_admin_all" on reviews
  for all using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────
-- 기존 테이블에 관리자 우회(bypass) 정책 추가
-- ─────────────────────────────────────────────
create policy "invitations_admin_all" on invitations
  for all using (is_admin()) with check (is_admin());

create policy "invitation_photos_admin_all" on invitation_photos
  for all using (is_admin()) with check (is_admin());

create policy "rsvp_responses_admin_all" on rsvp_responses
  for all using (is_admin()) with check (is_admin());

create policy "guestbook_entries_admin_all" on guestbook_entries
  for all using (is_admin()) with check (is_admin());
