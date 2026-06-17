"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useInvitationStore } from "@/store/invitationStore";
import { PcHeader } from "@/components/pc/PcHeader";
import { PcFooter } from "@/components/pc/PcFooter";
import { PcLiveEditor } from "@/components/pc/PcLiveEditor";
import { PcEmulator } from "@/components/pc/PcEmulator";
import { isoToDateInput, isoToTimeInput } from "@/lib/invitation/utils";
import type { StyleAnswers } from "@/lib/invitation/types";

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const setUserData = useInvitationStore((s) => s.setUserData);
  const setAnswer = useInvitationStore((s) => s.setAnswer);
  const [ready, setReady] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }

      const { data: inv, error: err } = await supabase
        .from("invitations")
        .select("*")
        .eq("id", id)
        .eq("owner_id", data.user.id)
        .single();

      if (err || !inv) { setError("청첩장을 찾을 수 없습니다."); return; }

      const family = (inv.family ?? {}) as Record<string, string>;
      setUserData({
        groom: inv.groom_name,
        bride: inv.bride_name,
        dateInput: isoToDateInput(inv.event_at),
        timeInput: isoToTimeInput(inv.event_at),
        venue: inv.venue_name,
        address: inv.venue_address ?? "",
        groomFather: family.groomFather ?? "",
        groomMother: family.groomMother ?? "",
        brideFather: family.brideFather ?? "",
        brideMother: family.brideMother ?? "",
      });

      const answers = (inv.style_answers ?? {}) as StyleAnswers;
      (Object.keys(answers) as (keyof StyleAnswers)[]).forEach((k) => {
        setAnswer(k, answers[k] as never);
      });

      setSlug(inv.slug);
      setReady(true);
    });
  }, [id, setUserData, setAnswer, router]);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)" }}>
        {error}
      </div>
    );
  }

  if (!ready) {
    return (
      <>
        <PcHeader />
        <div style={{ padding: 80, textAlign: "center", color: "var(--ink-soft)", fontSize: 14 }}>
          불러오는 중…
        </div>
      </>
    );
  }

  return (
    <>
      <PcHeader />
      <div className="pc-grid" style={{ padding: "0 48px", maxWidth: 1400, margin: "0 auto" }}>
        <main className="pc-main">
          <PcLiveEditor invitationId={id} invitationSlug={slug ?? undefined} />
        </main>
        <PcEmulator />
      </div>
      <PcFooter />
    </>
  );
}
