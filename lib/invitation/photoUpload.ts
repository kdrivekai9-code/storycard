import { createClient } from "@/lib/supabase/client";

const BUCKET = "invitation-photos";

/** 프리미엄 영상(fal.ai 등 외부 CDN URL)인지 판별 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/**
 * 이미 업로드된 사진의 storage 경로를 추출.
 * 우리 버킷 소속이 아닌 절대 URL(예: 프리미엄 영상의 fal.ai CDN URL)은
 * 그대로 보존 — invitation_photos.storage_path에 외부 URL을 직접 저장해도 되도록 함.
 */
function publicUrlToPath(url: string): string {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return url.slice(idx + marker.length);
}

/**
 * 에디터의 photos 배열(blob: URL · 기존 public URL · 외부 영상 URL 혼재)을 받아
 * 새 사진은 Storage에 업로드하고, 기존 사진/영상은 경로(또는 URL)만 추출해 순서대로 반환.
 */
export async function uploadInvitationPhotos(
  invitationId: string,
  ownerId: string,
  photoUrls: string[],
): Promise<string[]> {
  const supabase = createClient();
  const paths: string[] = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];

    if (url.startsWith("blob:")) {
      const blob = await fetch(url).then((r) => r.blob());
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const path = `${ownerId}/${invitationId}/${Date.now()}-${i}.${ext}`;

      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw new Error(error.message);

      paths.push(path);
    } else {
      paths.push(publicUrlToPath(url));
    }
  }

  return paths;
}

/** storage 경로(또는 이미 완전한 외부 URL) → 표시용 URL */
export function invitationPhotoPublicUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const supabase = createClient();
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * 이미지 URL을 최대 maxDim 픽셀(긴 변 기준)로 축소한 새 Blob 생성.
 * fal.ai 등 외부 API의 이미지 크기 제한(예: 최대 8,947만 픽셀²) 대응용 —
 * 원본 청첩장 사진은 그대로 두고, 영상 생성 요청 시에만 축소된 사본을 따로 업로드합니다.
 */
export async function resizeImageToBlob(
  srcUrl: string,
  maxDim = 2048,
  quality = 0.9,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    el.src = srcUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 생성할 수 없습니다.");
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/jpeg",
      quality,
    );
  });
}
