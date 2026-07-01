"use server";

import { createClient } from "@/lib/supabase/server";

const PHOTO_BUCKET = "invitation-photos";

export type PremiumVideoStatus = "pending" | "submitted" | "video_done" | "muxing" | "done" | "failed";

export interface PremiumVideoJob {
  id: string;
  status: PremiumVideoStatus;
  video_url: string | null;
  bgm_applied: boolean;
  error: string | null;
  prompt_id: string;
  prompt_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface PremiumMediaOutput {
  id: string;
  prompt_id: string;
  video_url: string;
  created_at: string;
  generation_mode: string | null;
}

/** 배경음악 카탈로그 + 공개 URL 조회 */
export async function getBgmTracks() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bgm_tracks")
    .select("id, title, storage_path")
    .order("sort_order", { ascending: true });

  return (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    url: supabase.storage.from("bgm-tracks").getPublicUrl(t.storage_path).data.publicUrl,
  }));
}

/** pending/submitted 상태로 10분 이상 방치된 좀비 작업을 자동 실패 처리 */
async function cleanupStaleJobs(supabase: Awaited<ReturnType<typeof createClient>>, invitationId: string) {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from("premium_videos")
    .update({ status: "failed", error: "좀비 작업 자동 정리 (10분 이상 미처리)", updated_at: new Date().toISOString() })
    .eq("invitation_id", invitationId)
    .in("status", ["pending", "submitted"])
    .lt("created_at", cutoff);
}

/** 프리미엄 영상 생성 요청 — 작업 row 생성 후 Edge Function으로 fal.ai 제출 트리거 */
export async function requestPremiumVideo(params: {
  invitationId: string;
  photoPath: string;
  sourcePhotoPath: string;
  bgmTrackId: string | null;
  promptId: string;
  promptText: string;
}): Promise<{ ok: true; id: string; startLogs?: string[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 새 작업 제출 전 좀비 작업 정리
  await cleanupStaleJobs(supabase, params.invitationId);

  const { data, error } = await supabase
    .from("premium_videos")
    .insert({
      invitation_id: params.invitationId,
      photo_path: params.photoPath,
      source_photo_path: params.sourcePhotoPath,
      bgm_track_id: params.bgmTrackId,
      prompt_id: params.promptId,
      prompt_text: params.promptText,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "생성 요청에 실패했습니다." };

  const { data: { session } } = await supabase.auth.getSession();
  const { data: fnData, error: fnError } = await supabase.functions.invoke("generate-premium-video", {
    body: { action: "start", premiumVideoId: data.id },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (fnError) return { ok: false, error: fnError.message };

  return { ok: true, id: data.id as string, startLogs: (fnData as { logs?: string[] })?.logs };
}

/** 진행 중인 프리미엄 작업 중지 — fal.ai 요청 취소 + DB 실패 처리 */
export async function cancelPremiumVideo(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false };

  await supabase.functions.invoke("generate-premium-video", {
    body: { action: "cancel", premiumVideoId: id },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  return { ok: true };
}

/** 진행 상태 1회 폴링 — Edge Function 호출 + 최신 DB 상태 반환 */
export async function pollPremiumVideo(id: string): Promise<(PremiumVideoJob & { fnLogs?: string[] }) | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: fnData } = await supabase.functions.invoke("generate-premium-video", {
    body: { action: "poll", premiumVideoId: id },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const { data } = await supabase
    .from("premium_videos")
    .select("id, status, video_url, bgm_applied, error, prompt_id, prompt_text, created_at, updated_at")
    .eq("id", id)
    .single();

  const job = data as PremiumVideoJob | null;
  if (!job) return null;
  return { ...job, fnLogs: (fnData as { logs?: string[] })?.logs };
}

/** 완성된(또는 진행중인) 가장 최근 프리미엄 영상 작업 — 소스 사진의 경로/public URL 포함 */
export async function getLatestPremiumVideo(invitationId: string): Promise<
  (PremiumVideoJob & { sourcePhotoUrl: string; sourcePhotoPath: string }) | null
> {
  const supabase = await createClient();

  // 페이지 로드 시마다 좀비 작업 자동 정리
  await cleanupStaleJobs(supabase, invitationId);

  const { data } = await supabase
    .from("premium_videos")
    .select("id, status, video_url, bgm_applied, error, prompt_id, prompt_text, created_at, updated_at, photo_path, source_photo_path")
    .eq("invitation_id", invitationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const sourcePhotoPath = data.source_photo_path ?? data.photo_path;

  return {
    id: data.id,
    status: data.status,
    video_url: data.video_url,
    bgm_applied: data.bgm_applied,
    error: data.error,
    prompt_id: data.prompt_id,
    prompt_text: data.prompt_text,
    created_at: data.created_at,
    updated_at: data.updated_at,
    sourcePhotoPath,
    sourcePhotoUrl: supabase.storage.from(PHOTO_BUCKET).getPublicUrl(sourcePhotoPath).data.publicUrl,
  };
}

export async function getPremiumOutputs(invitationId: string): Promise<PremiumMediaOutput[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("premium_videos")
    .select("id, prompt_id, video_url, created_at, generation_mode")
    .eq("invitation_id", invitationId)
    .eq("status", "done")
    .order("created_at", { ascending: false });

  return (data ?? []).filter((row) => !!row.video_url).map((row) => ({
    id: row.id as string,
    prompt_id: row.prompt_id as string,
    video_url: row.video_url as string,
    created_at: row.created_at as string,
    generation_mode: (row.generation_mode as string | null) ?? null,
  }));
}

/** 선택된 프리미엄 등록영상/사진 삭제 */
export async function deletePremiumOutputs(outputIds: string[]): Promise<{ ok: boolean; error?: string }> {
  if (outputIds.length === 0) return { ok: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 먼저 삭제하려는 아이템들이 현재 사용자의 것인지 확인
  const { data: premiumVideos, error: checkError } = await supabase
    .from("premium_videos")
    .select("id, invitation_id")
    .in("id", outputIds);

  if (checkError || !premiumVideos) return { ok: false, error: "아이템 확인 실패" };

  // 각 아이템의 invitation_id 소유자 확인
  for (const pv of premiumVideos) {
    const { data: invitation } = await supabase
      .from("invitations")
      .select("owner_id")
      .eq("id", pv.invitation_id)
      .single();

    if (!invitation || invitation.owner_id !== user.id) {
      return { ok: false, error: "삭제 권한이 없습니다." };
    }
  }

  // 권한 확인 완료 후 삭제
  const { error } = await supabase
    .from("premium_videos")
    .delete()
    .in("id", outputIds);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * "5. 프리미엄 등록영상/사진" 목록에서 사용자가 명시적으로 선택해 "등록" 버튼을 눌렀을 때만
 * Q7 사진첨부(invitation_photos)에 새 항목으로 추가합니다. 영상 생성 완료 시 자동으로는
 * 추가되지 않습니다 — 항상 이 함수를 통해서만 반영됩니다.
 */
export async function registerPremiumOutputsToPhotos(
  invitationId: string,
  videoUrls: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (videoUrls.length === 0) return { ok: true };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { data: existingRows } = await supabase
    .from("invitation_photos")
    .select("storage_path, sort_order")
    .eq("invitation_id", invitationId)
    .order("sort_order", { ascending: false });

  const existingPaths = new Set((existingRows ?? []).map((r) => r.storage_path));
  let nextSortOrder = (existingRows?.[0]?.sort_order ?? -1) + 1;

  const rowsToInsert = videoUrls
    .filter((url) => !existingPaths.has(url))
    .map((url) => ({
      invitation_id: invitationId,
      role: "gallery",
      storage_path: url,
      sort_order: nextSortOrder++,
    }));

  if (rowsToInsert.length === 0) return { ok: true };

  const { error } = await supabase.from("invitation_photos").insert(rowsToInsert);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
