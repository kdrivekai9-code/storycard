-- invitations.owner_id FK에 ON DELETE CASCADE 추가
-- (기존 FK 제약을 삭제하고 CASCADE 옵션으로 재생성)

alter table invitations
  drop constraint if exists invitations_owner_id_fkey;

alter table invitations
  add constraint invitations_owner_id_fkey
    foreign key (owner_id)
    references auth.users (id)
    on delete cascade;
