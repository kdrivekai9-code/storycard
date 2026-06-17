import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvitationRenderer } from "@/components/invitation/InvitationRenderer";
import { mergeConfig } from "@/lib/invitation/mergeConfig";
import { deriveInvitationData } from "@/lib/invitation/derive";
import { isoToDateInput, isoToTimeInput } from "@/lib/invitation/utils";
import type { StyleAnswers, UserData } from "@/lib/invitation/types";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: inv } = await supabase
    .from("invitations")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!inv) return notFound();

  const family = (inv.family ?? {}) as Record<string, string>;
  const userData: UserData = {
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
  };

  const answers = (inv.style_answers ?? {}) as StyleAnswers;
  const config = mergeConfig(answers);
  const bound = deriveInvitationData(userData, answers.tone);

  return (
    <div className="inv-page-wrap">
      <InvitationRenderer config={config} userData={userData} bound={bound} />
    </div>
  );
}
