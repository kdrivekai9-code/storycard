import type { BoundInvitationData, InvitationConfig, UserData } from "@/lib/invitation/types";
import { CoverSection } from "./sections/CoverSection";
import { GreetingSection } from "./sections/GreetingSection";
import { FamilySection } from "./sections/FamilySection";
import { WhenSection } from "./sections/WhenSection";
import { GallerySection } from "./sections/GallerySection";
import { MapSection } from "./sections/MapSection";
import { RsvpSection } from "./sections/RsvpSection";
import { AccountSection } from "./sections/AccountSection";
import { GuestbookSection } from "./sections/GuestbookSection";
import { MotionController } from "./MotionController";

export function InvitationRenderer({
  config,
  userData,
  bound,
}: {
  config: InvitationConfig;
  userData: UserData;
  bound: BoundInvitationData;
}) {
  const { theme, sections, motion } = config;

  return (
    <div
      data-mood={config.mood}
      data-motion={motion}
      style={
        {
          "--bg": theme.bg,
          "--ink": theme.ink,
          "--ink-soft": theme.inkSoft,
          "--ink-faint": theme.inkFaint,
          "--accent": theme.accent,
          "--accent-deep": theme.accentDeep,
          "--line": theme.line,
          "--line-soft": theme.lineSoft,
          "--cover-bg": theme.coverBg,
          background: "var(--bg)",
          position: "relative",
        } as React.CSSProperties
      }
    >
      <MotionController motion={motion} />
      <CoverSection bound={bound} cover={config.cover} coverTextColor={config.coverTextColor} />

      {sections.includes("greeting") && <GreetingSection bound={bound} />}
      <FamilySection bound={bound} />
      <WhenSection userData={userData} />
      {sections.includes("gallery") && <GallerySection photoDensity={config.photoDensity} />}
      {sections.includes("map") && <MapSection userData={userData} />}
      {sections.includes("rsvp") && <RsvpSection />}
      {sections.includes("account") && <AccountSection userData={userData} />}
      {sections.includes("guestbook") && <GuestbookSection />}

      <div className="inv-footer">
        <div className="thanks">THANK YOU</div>
        <div className="by">CRAFTED WITH CARDSTORY</div>
      </div>

      <div className="share-bar">
        <button type="button">링크 복사</button>
        <button type="button" className="primary">
          카카오톡 공유
        </button>
      </div>
    </div>
  );
}
