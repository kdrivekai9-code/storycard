"use client";

import { useMemo } from "react";
import { InvitationRenderer } from "@/components/invitation/InvitationRenderer";
import { useInvitationStore } from "@/store/invitationStore";
import { deriveInvitationData } from "@/lib/invitation/derive";
import { mergeConfig } from "@/lib/invitation/mergeConfig";

export function PcEmulator() {
  const userData = useInvitationStore((s) => s.userData);
  const answers = useInvitationStore((s) => s.answers);
  const config = useMemo(() => mergeConfig(answers), [answers]);
  const bound = useMemo(() => deriveInvitationData(userData, answers.tone), [userData, answers.tone]);

  return (
    <aside className="pc-emulator">
      <div className="emu-bar">
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
        <div className="label">LIVE PREVIEW · 청첩장</div>
        <div style={{ width: "28px" }} />
      </div>

      <div className="device">
        <div className="device-inner">
          <InvitationRenderer config={config} userData={userData} bound={bound} />
        </div>
      </div>
    </aside>
  );
}
