-- profiles: 휴대폰 번호 + 온보딩 완료 여부 추가

alter table profiles
  add column if not exists phone text,
  add column if not exists onboarding_done boolean not null default false;

-- handle_new_user 트리거 갱신: OAuth 신규 가입 시 onboarding_done = false로 시작
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
  v_is_oauth boolean;
begin
  v_provider := coalesce(
    new.raw_user_meta_data->>'provider',
    new.raw_app_meta_data->>'provider',
    'email'
  );
  v_is_oauth := v_provider in ('kakao', 'naver');

  insert into public.profiles (id, email, nickname, provider, onboarding_done)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'nickname', new.email),
    case when v_provider in ('kakao', 'naver') then v_provider else 'email' end,
    -- 이메일 로그인은 온보딩 불필요, OAuth는 프로필 완성 유도
    not v_is_oauth
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
