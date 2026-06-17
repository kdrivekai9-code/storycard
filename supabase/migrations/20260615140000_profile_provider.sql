-- profiles: 가입 채널(카카오/네이버/이메일) 구분 컬럼 추가

alter table profiles
  add column provider text not null default 'email'
    check (provider in ('email', 'kakao', 'naver'));

-- 기존 사용자의 채널을 auth.users 메타데이터로부터 백필
-- 네이버: raw_user_meta_data.provider = 'naver' (콜백에서 직접 기록)
-- 카카오: raw_app_meta_data.provider = 'kakao' (Supabase OAuth가 자동 기록)
update profiles p
set provider = backfill.provider
from (
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'provider', u.raw_app_meta_data->>'provider', 'email') as provider
  from auth.users u
) backfill
where backfill.id = p.id
  and backfill.provider in ('kakao', 'naver');

-- handle_new_user 트리거 갱신: 신규 가입 시 채널 자동 기록
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname, provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname', new.email),
    case
      when coalesce(new.raw_user_meta_data->>'provider', new.raw_app_meta_data->>'provider') in ('kakao', 'naver')
        then coalesce(new.raw_user_meta_data->>'provider', new.raw_app_meta_data->>'provider')
      else 'email'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
