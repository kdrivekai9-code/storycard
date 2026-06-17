"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import type { PhotoDensity } from "@/lib/invitation/types";
import { useInvitationStore } from "@/store/invitationStore";

const SLIDE_COUNT: Record<PhotoDensity, number> = { many: 8, some: 4, none: 2 };

export function GallerySection({ photoDensity }: { photoDensity: PhotoDensity }) {
  const photos = useInvitationStore((s) => s.photos);
  const count = SLIDE_COUNT[photoDensity];
  const slides = Array.from({ length: count }, (_, i) => photos[i] ?? null);

  return (
    <section className="inv-section" data-section="gallery">
      <div className="eyebrow">Gallery</div>
      <h2 className="heading">함께한 시간</h2>
      <Swiper spaceBetween={8} slidesPerView={2.3} className="!-mx-4 !px-4">
        {slides.map((src, i) => (
          <SwiperSlide key={i}>
            <div
              className="aspect-[4/5] rounded-lg overflow-hidden"
              style={{
                background: src ? undefined : "var(--cover-bg)",
                filter: src ? undefined : `brightness(${1 - i * 0.05})`,
                backgroundImage: src ? `url('${src}')` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
