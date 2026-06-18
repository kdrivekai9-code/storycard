alter table profiles
  add column if not exists receiver_name text,
  add column if not exists shipping_detail text;
