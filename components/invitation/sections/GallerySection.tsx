"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import type { PhotoDensity } from "@/lib/invitation/types";

const SLIDE_COUNT: Record<PhotoDensity, number> = { many: 8, some: 4, none: 2 };

export function GallerySection({ photoDensity }: { photoDensity: PhotoDensity }) {
  const count = SLIDE_COUNT[photoDensity];

  return (
    <section className="inv-section" data-section="gallery">
      <div className="eyebrow">Gallery</div>
      <h2 className="heading">함께한 시간</h2>
      <Swiper spaceBetween={8} slidesPerView={2.3} className="!-mx-4 !px-4">
        {Array.from({ length: count }).map((_, i) => (
          <SwiperSlide key={i}>
            <div
              className="aspect-[4/5] rounded-lg"
              style={{ background: "var(--cover-bg)", filter: `brightness(${1 - i * 0.05})` }}
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
