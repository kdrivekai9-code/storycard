"use client";

import { useMemo } from "react";
import { useInvitationStore } from "@/store/invitationStore";
import { deriveInvitationData } from "@/lib/invitation/derive";

export function PcPublish() {
  const userData = useInvitationStore((s) => s.userData);
  const answers = useInvitationStore((s) => s.answers);
  const bound = useMemo(() => deriveInvitationData(userData, answers.tone), [userData, answers.tone]);

  return (
    <section className="pc-section" id="sec-publish">
      <span className="step-num">PUBLISH</span>
      <h2 className="h">
        완성되었다면 <em>발급하세요.</em>
      </h2>
      <p className="desc">짧은 URL과 QR이 즉시 발급됩니다. 카카오톡으로 바로 공유할 수 있어요.</p>

      <div className="pc-publish">
        <div className="url-card">
          <div className="l">SHARE URL</div>
          <div className="url">
            cardstory.app/i/<em>{bound.slug}</em>
          </div>
          <div className="qr">
            <div className="qr-square">QR</div>
            <div className="qr-meta">
              QR을 인쇄해 청첩장에 동봉하거나,
              <br />
              포토부스 · 식권에 활용할 수 있어요.
            </div>
          </div>
        </div>
        <div className="actions">
          <div className="l">READY TO SHARE</div>
          <div className="big">{bound.namesKo}</div>
          <button className="kakao" type="button">
            카카오톡 공유
          </button>
          <button type="button">링크 복사</button>
          <button type="button">QR 다운로드</button>
        </div>
      </div>
    </section>
  );
}
