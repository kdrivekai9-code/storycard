import type { BoundInvitationData } from "@/lib/invitation/types";

export function GreetingSection({ bound }: { bound: BoundInvitationData }) {
  return (
    <section className="inv-section inv-greeting" data-section="greeting">
      <div className="eyebrow">Invitation</div>
      <h2 className="heading">초대합니다</h2>
      <p>
        {bound.greeting.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </p>
      <p className="sig">{bound.signature}</p>
    </section>
  );
}
