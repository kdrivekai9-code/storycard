import type { BoundInvitationData } from "@/lib/invitation/types";

export function FamilySection({ bound }: { bound: BoundInvitationData }) {
  return (
    <section className="inv-section inv-family">
      <div className="eyebrow">Family</div>
      <h2 className="heading">양가 혼주</h2>

      <div className="family-line">
        <span className="parent">{bound.groomParents}</span>
        <span className="relation"> 의</span>
        <span className="child">
          아들 &nbsp; <span>{bound.groomShort}</span>
        </span>
      </div>
      <div className="family-divider" />
      <div className="family-line">
        <span className="parent">{bound.brideParents}</span>
        <span className="relation"> 의</span>
        <span className="child">
          딸 &nbsp; <span>{bound.brideShort}</span>
        </span>
      </div>
    </section>
  );
}
