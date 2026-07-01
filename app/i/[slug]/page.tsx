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

  const { data: photoRows } = await supabase
    .from("invitation_photos")
    .select("storage_path")
    .eq("invitation_id", inv.id)
    .order("sort_order", { ascending: true });

  // storage_path는 일반 사진 경로뿐 아니라 프리미엄 영상의 외부 CDN URL(절대 URL)도 담을 수 있음
  const photos = (photoRows ?? []).map((p) =>
    p.storage_path.startsWith("http://") || p.storage_path.startsWith("https://")
      ? p.storage_path
      : supabase.storage.from("invitation-photos").getPublicUrl(p.storage_path).data.publicUrl,
  );

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
      <InvitationRenderer config={config} userData={userData} bound={bound} photos={photos} />
    </div>
  );
}
