import type { BoundInvitationData, CoverType } from "@/lib/invitation/types";

export function CoverSection({
  bound,
  cover,
  coverTextColor,
}: {
  bound: BoundInvitationData;
  cover: CoverType;
  coverTextColor?: string;
}) {
  return (
    <div
      className={`inv-cover cover-${cover}`}
      style={coverTextColor ? ({ "--ctc": coverTextColor } as React.CSSProperties) : undefined}
    >
      <div className="cover-photo-img" />
      <div className="cover-frame-box">
        <div className="cover-frame-inner" />
      </div>
      <div className="cover-split-strip">
        <div className="cover-split-img" />
      </div>
      <div className="cover-mosaic-wrap">
        <div className="mosaic-main" />
        <div className="mosaic-row">
          <div className="mosaic-sm" />
          <div className="mosaic-sm" />
        </div>
      </div>
      <div className="cover-inner">
        <div className="ornament" />
        <div className="micro">THE WEDDING OF</div>
        <div className="names">
          <span>{bound.groomEn}</span>
          <span className="amp">&amp;</span>
          <span>{bound.brideEn}</span>
        </div>
        <div className="ko">{bound.namesKo}</div>
        <div className="date">{bound.dateLong}</div>
        <div className="venue">{bound.venueShort}</div>
        <div className="scroll-hint">SCROLL</div>
        <div className="scroll-arrow" />
      </div>
    </div>
  );
}
