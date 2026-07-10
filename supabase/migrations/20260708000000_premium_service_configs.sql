-- 프리미엄 서비스 어드민 관리 테이블

-- 서비스별 기본 설정 (모델, 옵션, 프롬프트)
create table public.premium_service_configs (
  service_id   text primary key,         -- 'video-effect' | 'watercolor-illustration' | 'webtoon' | 'bg-change'
  label        text not null,            -- '프리미엄서비스1'
  title        text not null,            -- '이미지 → 영상효과'
  is_active    boolean not null default true,
  model        text not null,            -- fal.ai 모델 ID
  model_options jsonb not null default '{}',
  default_prompt text not null default '',
  estimate_sec integer not null default 60,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- 서비스별 프리셋 옵션 (서비스1 스타일 프리셋, 서비스3 말풍선 텍스트 등)
create table public.premium_service_presets (
  id         uuid primary key default gen_random_uuid(),
  service_id text not null references public.premium_service_configs(service_id) on delete cascade,
  label      text not null,
  value      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 서비스4 배경 스타일
create table public.premium_bg_styles (
  id              text primary key,
  label           text not null,
  seed            integer,
  prompt          text not null default '',
  image_url       text not null default '',   -- UI 미리보기용
  model_image_url text not null default '',   -- 모델 전송용 (배경만)
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- RLS
alter table public.premium_service_configs  enable row level security;
alter table public.premium_service_presets  enable row level security;
alter table public.premium_bg_styles        enable row level security;

create policy "premium_configs_admin"  on public.premium_service_configs  for all using (public.is_admin()) with check (public.is_admin());
create policy "premium_presets_admin"  on public.premium_service_presets  for all using (public.is_admin()) with check (public.is_admin());
create policy "premium_bg_admin"       on public.premium_bg_styles        for all using (public.is_admin()) with check (public.is_admin());
create policy "premium_configs_public" on public.premium_service_configs  for select using (is_active = true);
create policy "premium_presets_public" on public.premium_service_presets  for select using (is_active = true);
create policy "premium_bg_public"      on public.premium_bg_styles        for select using (is_active = true);

-- ── 초기 데이터 ──────────────────────────────────────────────────────────────

insert into public.premium_service_configs
  (service_id, label, title, model, model_options, default_prompt, estimate_sec, sort_order)
values
  (
    'video-effect',
    '프리미엄서비스1',
    '이미지 → 영상효과',
    'fal-ai/veo3.1/lite/image-to-video',
    '{"duration":"5","aspect_ratio":"9:16"}',
    '',
    90, 1
  ),
  (
    'watercolor-illustration',
    '프리미엄서비스2',
    '이미지 → 수채화풍 일러스트',
    'fal-ai/bytedance/seedream/v5/lite/edit',
    '{"seed":831391799,"resolution":"2K","output_format":"png","aspect_ratio":"9:16"}',
    'A beautiful wedding illustration, watercolor painting style, soft wet-on-wet technique, vibrant bleeding colors, delicate artistic brushstrokes on textured paper, dreamy atmosphere, soft pastel palette, masterpiece, painterly aesthetic, no photographic texture',
    30, 2
  ),
  (
    'webtoon',
    '프리미엄서비스3',
    '이미지 → 웹툰풍',
    'fal-ai/bytedance/seedream/v5/lite/edit',
    '{"seed":1321871221,"resolution":"2K","output_format":"png","aspect_ratio":"9:16"}',
    'A professional webtoon-style digital illustration based on the provided image. Maintain the exact likeness, facial features, poses, and detailed attire of the couple,
Art style should feature clean, sharp line art, vibrant digital cel-shading, and flat coloring to achieve a modern manhwa aesthetic with clear outlines. Use a dreamy, romantic palette of saturated yet soft pastel tones
The final image must be generated in the exact same aspect ratio as the original source image. Do not add any speech bubbles or text overlays.',
    30, 3
  ),
  (
    'bg-change',
    '프리미엄서비스4',
    '배경이미지 변경',
    'fal-ai/nano-banana-2/edit',
    '{"resolution":"2K","output_format":"png","aspect_ratio":"9:16"}',
    '',
    60, 4
  );

-- 서비스3 말풍선 텍스트 프리셋
insert into public.premium_service_presets (service_id, label, value, sort_order) values
  ('webtoon', 'We''re Getting Married',       'We''re Getting Married',       1),
  ('webtoon', 'All of my love, all for you',  'All of my love, all for you',  2),
  ('webtoon', 'Forever, I''ll love you',      'Forever, I''ll love you',      3),
  ('webtoon', 'Please Bless Us',              'Please Bless Us',              4),
  ('webtoon', 'You''re Invited',              'You''re Invited',              5);

-- 서비스4 배경 스타일
insert into public.premium_bg_styles (id, label, seed, prompt, image_url, model_image_url, sort_order) values
  (
    'california-coast',
    '가. 해안선도로',
    6222409,
    'A cinematic, full-body photograph capturing the same bride and groom from the source image, whose facial features, identities, and specific expressions must be strictly preserved and completely identical to the source photo — do not alter, enhance, or modify the face or expression in any way. The exact smile, eye shape, lip position, and overall facial structure must remain unchanged. They are standing naturally and comfortably beside a classic red vintage convertible, their poses relaxed and harmonious with the car — the groom''s hand resting gently on the car door or the bride''s hand lightly touching the vehicle, as if they belong in this scene. The car is richly decorated with lush floral arrangements of white roses and greenery for a wedding, parked on a dramatic steep cliffside turnout of the scenic California coastline highway, offering breathtaking views of the winding road and Pacific Ocean below. The warm golden-hour sunset light (golden-orange, pink, and purple hues) falls naturally on the couple, casting soft directional rim lighting along their shoulders and hair that seamlessly matches the surrounding environment. The couple''s skin tones, clothing colors, and shadows are all adjusted to reflect the warm amber and rose-tinted glow of the setting sun, ensuring they feel fully immersed in the scene rather than composited. Gentle lens flare and atmospheric haze add depth and cinematic realism. In the far distance along the highway, an 18-wheeler truck is seen as a very small object far behind the car. High-end photography, sharp focus on faces, vibrant colors, photorealistic.',
    '/samples/bg-california-coast.jpg',
    '/samples/bg-california-coast-bg.jpg',
    1
  ),
  (
    'mediterranean',
    '나. 지중해',
    6222409,
    'A cinematic photograph of the same bride and groom from the source image, seated naturally and comfortably side by side on a low Mediterranean stone wall. Their hands rest naturally and relaxed on the wall surface beside them. Their facial features, identities, and specific expressions must be strictly preserved and completely identical to the source photo — do not alter, enhance, or modify the face or expression in any way. The exact smile, eye shape, lip position, and overall facial structure must remain unchanged. Change the couple''s clothing to naturally suit the Mediterranean summer atmosphere: the bride wears a flowy, lightweight white or pastel linen dress with delicate details appropriate for a romantic Mediterranean setting, and the groom wears a relaxed linen shirt in white or light beige with casual linen trousers — both outfits feel effortless, elegant, and perfectly matched to the warm coastal environment. The background is a stunning Mediterranean scene with iconic whitewashed buildings, cascading bougainvillea flowers in soft pink and magenta, and a deep blue Aegean Sea stretching to the horizon. The bright Mediterranean sunlight falls naturally on the couple, with soft warm shadows that seamlessly match the direction and quality of light in the background scene. The couple''s skin tones, clothing colors, and overall color grading are naturally harmonized with the warm, luminous, sun-drenched Mediterranean atmosphere — they feel fully present in the scene, not composited. Crystal-clear turquoise water, terracotta rooftops, and a vivid blue sky with soft white clouds frame the scene. High-end photography, sharp focus on faces, vibrant colors, photorealistic.',
    '/samples/bg-mediterranean.jpg',
    '/samples/bg-mediterranean-bg.jpg',
    2
  ),
  (
    'european-garden',
    '다. 유럽정원',
    6222409,
    'A cinematic, full-body photograph of the same bride and groom from the source image, walking hand in hand toward the camera along a grand stone pathway in a breathtaking European formal garden. The groom is dressed in a sharp navy blue suit. The bride holds a beautiful bridal bouquet of white roses and soft blooms in her free hand. Their facial features and identities must be strictly preserved and completely identical to the source photo — do not alter, enhance, or modify the face in any way. Both the bride and groom wear a gentle, soft smile — warm and natural, conveying happiness and love. The couple walks naturally and confidently, their posture elegant and relaxed as if strolling through the garden together. Warm golden sunlight falls directly on the couple — illuminating their faces with soft sunlit highlights, casting a gentle warm glow across their clothing, and creating realistic elongated shadows stretching behind them on the stone pathway. The interplay of sunlight and shadow gives the couple a strong sense of physical presence grounded in the scene. The pathway is flanked by perfectly manicured hedgerows, classical fountains, and symmetrical flower beds bursting with roses, lavender, and seasonal blooms in soft pinks, whites, and purples. Ornate stone balustrades and ivy-draped archways frame the background, with a stately European palace or manor house visible in the distance. The light source direction is consistent between the couple and the background — the shadows on the ground and the highlights on the faces all follow the same angle of afternoon sunlight. The couple''s skin tones, clothing colors, and overall color grading are harmonized with the lush, romantic, refined atmosphere of the garden — they feel fully immersed in the scene. High-end photography, sharp focus on faces, vibrant colors, photorealistic.',
    '/samples/bg-european-garden.jpg',
    '/samples/bg-european-garden-bg.jpg',
    3
  ),
  (
    'sunset-beach',
    '라. Sunset',
    5610233,
    'A cinematic, full-body photograph of the same bride and groom from the source image, walking hand in hand barefoot through shallow water along the beach shown in the background image. Their facial features and identities must be strictly preserved and completely identical to the source photo — do not alter, enhance, or modify the face in any way. The groom wears a relaxed beige linen suit — the jacket is unbuttoned and open, with clearly visible linen fabric texture on both the jacket and trousers, giving a casual yet elegant beach look, with his trousers slightly rolled up. The bride wears a white lace wedding dress, gathering the very bottom of her dress skirt with one hand to lift it slightly above the water while holding the groom''s hand with the other, both walking forward facing the camera. The bride''s hair is gently swept by the sea breeze, with soft strands delicately floating in the wind. The sky, sea, and sunset atmosphere must be preserved exactly as shown in the background image — do not alter or regenerate the sky or horizon colors. The warm sunset glow must visibly tint the couple''s faces and clothing — casting a rich amber and rose-golden hue across their skin tones, hair, and fabric, with soft warm highlights along their cheekbones, shoulders, and the edges of the bride''s dress, fully consistent with the light direction and color temperature of the background sunset. The wet sand and shallow water beneath their feet reflect the existing sunset colors from the background. The couple''s skin tones and overall color grading are harmonized with the background''s warm, romantic sunset atmosphere — they feel fully present and immersed in the scene. High-end photography, sharp focus on faces, vibrant colors, photorealistic.',
    '/samples/bg-sunset-beach.jpg',
    '/samples/bg-sunset-beach-bg.jpg',
    4
  );
