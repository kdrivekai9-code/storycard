-- profiles: 본인인증 CI 및 배송지 추가

alter table profiles
  add column if not exists ci text,          -- 본인인증 연계정보 (CI)
  add column if not exists shipping_address text; -- 배송지 (우편번호+주소+상세주소 통합 텍스트)
