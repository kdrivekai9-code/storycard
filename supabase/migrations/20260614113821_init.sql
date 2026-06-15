-- BloomCard / CardStory — initial schema
-- Invitations + photos + RSVP responses + guestbook entries

create table invitations (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  owner_id      uuid references auth.users,
  status        text not null default 'draft', -- draft | published

  -- 사실 정보 (STEP 1)
  groom_name    text not null,
  bride_name    text not null,
  event_at      timestamptz not null,
  venue_name    text not null,
  venue_detail  text,
  venue_address text not null,
  venue_lat     double precision,
  venue_lng     double precision,
  family        jsonb not null default '{}'::jsonb,   -- 양가 혼주 정보
  contacts      jsonb,                                 -- 연락처 (선택)

  -- 스타일 (STEP 2~3 결과)
  style_answers jsonb not null default '{}'::jsonb,   -- Q1~Q7 원본 답변
  config        jsonb not null default '{}'::jsonb,   -- 프리셋 머지 결과 (렌더링 입력)
  greeting      text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index invitations_owner_id_idx on invitations (owner_id);

create table invitation_photos (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations on delete cascade,
  role          text not null,        -- main | gallery
  storage_path  text not null,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index invitation_photos_invitation_id_idx on invitation_photos (invitation_id);

create table rsvp_responses (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations on delete cascade,
  side          text,                  -- groom | bride
  guest_name    text not null,
  attend        boolean not null,
  party_size    int not null default 1,
  message       text,
  created_at    timestamptz not null default now()
);

create index rsvp_responses_invitation_id_idx on rsvp_responses (invitation_id);

create table guestbook_entries (
  id            uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references invitations on delete cascade,
  author        text not null,
  message       text not null,
  created_at    timestamptz not null default now()
);

create index guestbook_entries_invitation_id_idx on guestbook_entries (invitation_id);

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table invitations enable row level security;
alter table invitation_photos enable row level security;
alter table rsvp_responses enable row level security;
alter table guestbook_entries enable row level security;

-- invitations: anyone can read published invitations; owners manage their own
create policy "invitations_select_published" on invitations
  for select using (status = 'published' or owner_id = auth.uid());

create policy "invitations_insert_own" on invitations
  for insert with check (owner_id = auth.uid() or owner_id is null);

create policy "invitations_update_own" on invitations
  for update using (owner_id = auth.uid());

create policy "invitations_delete_own" on invitations
  for delete using (owner_id = auth.uid());

-- invitation_photos: follow parent invitation visibility
create policy "invitation_photos_select" on invitation_photos
  for select using (
    exists (
      select 1 from invitations i
      where i.id = invitation_id
        and (i.status = 'published' or i.owner_id = auth.uid())
    )
  );

create policy "invitation_photos_manage_own" on invitation_photos
  for all using (
    exists (
      select 1 from invitations i
      where i.id = invitation_id and i.owner_id = auth.uid()
    )
  );

-- rsvp_responses: anonymous insert allowed; only owner can read
create policy "rsvp_responses_insert_anyone" on rsvp_responses
  for insert with check (true);

create policy "rsvp_responses_select_owner" on rsvp_responses
  for select using (
    exists (
      select 1 from invitations i
      where i.id = invitation_id and i.owner_id = auth.uid()
    )
  );

-- guestbook_entries: anonymous insert allowed; anyone viewing a published
-- invitation (or its owner) can read entries
create policy "guestbook_entries_insert_anyone" on guestbook_entries
  for insert with check (true);

create policy "guestbook_entries_select" on guestbook_entries
  for select using (
    exists (
      select 1 from invitations i
      where i.id = invitation_id
        and (i.status = 'published' or i.owner_id = auth.uid())
    )
  );
