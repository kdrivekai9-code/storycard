"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import type { PhotoDensity } from "@/lib/invitation/types";
import { isVideoUrl } from "@/lib/invitation/photoUpload";
import { useInvitationStore } from "@/store/invitationStore";

const SLIDE_COUNT: Record<PhotoDensity, number> = { many: 8, some: 4, none: 2 };

type Slide = { type: "image"; src: string } | { type: "video"; src: string };

export function GallerySection({
  photoDensity,
  photos: photosProp,
}: {
  photoDensity: PhotoDensity;
  photos?: string[];
}) {
  const storePhotos = useInvitationStore((s) => s.photos);
  const photos = photosProp ?? storePhotos;
  const count = SLIDE_COUNT[photoDensity];

  const items: Slide[] = photos.map((src) => ({ type: isVideoUrl(src) ? "video" : "image", src }));
  const slides: (Slide | null)[] = Array.from({ length: count }, (_, i) => items[i] ?? null);

  return (
    <section className="inv-section" data-section="gallery">
      <div className="eyebrow">Gallery</div>
      <h2 className="heading">함께한 시간</h2>
      <Swiper spaceBetween={8} slidesPerView={2.3} className="!-mx-4 !px-4">
        {slides.map((slide, i) => (
          <SwiperSlide key={i}>
            {slide?.type === "video" ? (
              <video
                src={slide.src}
                className="aspect-[4/5] rounded-lg overflow-hidden object-cover w-full h-full"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              <div
                className="aspect-[4/5] rounded-lg overflow-hidden"
                style={{
                  backgroundColor: slide ? undefined : "var(--cover-bg)",
                  filter: slide ? undefined : `brightness(${1 - i * 0.05})`,
                  backgroundImage: slide ? `url('${slide.src}')` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
