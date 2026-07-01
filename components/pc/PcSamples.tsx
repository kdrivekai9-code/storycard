"use client";

import { useInvitationStore } from "@/store/invitationStore";
import { SampleCoverPreview } from "./SampleCoverPreview";
import type { StyleAnswers } from "@/lib/invitation/types";

// 샘플 데모용 실제 사진 4장 — 클릭 시 우측 시뮬레이터에 그대로 로드됩니다.
const DEMO_PHOTOS = [
  "/samples/photo-1.jpg",
  "/samples/photo-2.jpg",
  "/samples/photo-3.jpg",
  "/samples/photo-4.jpg",
];

const SAMPLES: {
  id: string;
  name: string;
  sub: string;
  answers: StyleAnswers;
  photos: string[];
}[] = [
  {
    id: "full",
    name: "풀블리드",
    sub: "사진 가득 채운 표지 · 잔잔한 연출",
    answers: { cover: "full", motion: "soft" },
    photos: DEMO_PHOTOS,
  },
  {
    id: "frame",
    name: "액자형",
    sub: "정갈한 프레임 표지 · 러블리 연출",
    answers: { cover: "frame", motion: "lovely" },
    photos: DEMO_PHOTOS,
  },
  {
    id: "split",
    name: "상하분할",
    sub: "사진+글 분할 표지 · 잔잔한 연출",
    answers: { cover: "split", motion: "soft" },
    // frame과 동일한 타이밍에 같은 사진이 겹쳐 보이지 않도록 순서를 다르게 섞음
    photos: [DEMO_PHOTOS[2], DEMO_PHOTOS[0], DEMO_PHOTOS[3], DEMO_PHOTOS[1]],
  },
  {
    id: "mosaic",
    name: "모자이크",
    sub: "여러 컷 조합 표지 · 버블버블 연출",
    answers: { cover: "mosaic", motion: "bubble" },
    photos: DEMO_PHOTOS,
  },
  {
    id: "overlay",
    name: "초대장",
    sub: "봉투 오프닝 표지 · 잔잔한 연출",
    answers: { cover: "overlay", motion: "soft" },
    photos: DEMO_PHOTOS,
  },
  {
    id: "romantic-full",
    name: "Romantic Bloom",
    sub: "로맨틱 무드 · 풀블리드 · 화려한 연출",
    answers: { mood: "romantic", cover: "full", motion: "vivid" },
    photos: [DEMO_PHOTOS[3]],
  },
];

export function PcSamples() {
  const handleSelect = (answers: StyleAnswers) => {
    // answers 전체 교체(지정 외 항목은 기본값) + 데모 사진을 우측 시뮬레이터에 즉시 반영
    useInvitationStore.setState({ answers: { ...answers }, photos: DEMO_PHOTOS });
  };

  return (
    <section className="pc-live" id="sec-samples">
      <p className="lead">SAMPLES</p>
      <h2 className="title">
        먼저 <em>샘플</em>로 분위기를 정하세요.
      </h2>
      <p className="desc">
        썸네일을 누르면 그 레이아웃·연출로 위쪽 제작옵션과 오른쪽 청첩장이 즉시 바뀝니다. 마음에 드는 스타일을 정한 뒤
        아래에서 두 분의 정보를 입력하세요.
      </p>
      <div className="pc-cards cols-3">
        {SAMPLES.map((sample) => (
          <div key={sample.id} className="pc-card" onClick={() => handleSelect(sample.answers)}>
            <div className="visual" style={{ aspectRatio: "auto", padding: 0 }}>
              <SampleCoverPreview answers={sample.answers} photos={sample.photos} />
            </div>
            <div className="meta">
              <div className="name">{sample.name}</div>
              <div className="sub">{sample.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
