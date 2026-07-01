"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "bgm-tracks";

/** 배경음악 등록 — mp3 파일 업로드 + bgm_tracks row 생성 */
export async function uploadBgmTrack(formData: FormData) {
  await requireAdmin();

  const title = (formData.get("title") as string)?.trim();
  const file = formData.get("file") as File | null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!title || !file || file.size === 0) throw new Error("INVALID_INPUT");

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "mp3";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "audio/mpeg",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: insertError } = await admin.from("bgm_tracks").insert({
    title,
    storage_path: path,
    sort_order: sortOrder,
  });
  if (insertError) throw new Error(insertError.message);

  revalidatePath("/admin/bgm");
}

/** 배경음악 삭제 — storage 파일 + row 함께 제거 */
export async function deleteBgmTrack(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id") as string;
  const storagePath = formData.get("storage_path") as string;

  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([storagePath]);
  const { error } = await admin.from("bgm_tracks").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/bgm");
}
