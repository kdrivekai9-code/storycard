"use client";

import { useEffect, useRef, useState } from "react";
import { useInvitationStore } from "@/store/invitationStore";
import { createClient } from "@/lib/supabase/client";
import { uploadInvitationPhotos, invitationPhotoPublicUrl, resizeImageToBlob, isVideoUrl } from "@/lib/invitation/photoUpload";
import {
  getBgmTracks,
  requestPremiumVideo,
  pollPremiumVideo,
  cancelPremiumVideo,
  getLatestPremiumVideo,
  getPremiumOutputs,
  registerPremiumOutputsToPhotos,
  deletePremiumOutputs,
  type PremiumMediaOutput,
  type PremiumVideoStatus,
} from "@/lib/invitation/premiumActions";

const MAX_PHOTOS = 10;
const MAX_PREMIUM_ATTACH = 2;
const POLL_INTERVAL_MS = 4000;
// fal.ai는 정확한 남은 시간을 제공하지 않아, 평균 소요시간을 기준으로 진행률/남은시간을 추정합니다.
const ESTIMATE_VIDEO_SEC = 90;
const ESTIMATE_IMAGE_STYLE_SEC = 30;
const ESTIMATE_MUX_SEC = 20;

function formatMmSs(totalSec: number) {
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatCreatedAt(createdAt: string) {
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function getGenerationModeBadge(mode: string | null) {
  if (mode === "controlnet+lora") return "ControlNet+LoRA";
  if (mode === "base") return "Base";
  if (mode === "video-effect") return "Video Effect";
  return "Mode Unknown";
}

const PROMPT_OPTIONS = [
  {
    id: "gentle-move",
    label: "가. 다정한 움직임",
    desc: "최대한 얼굴사진 변형 없이 최소한의 신랑·신부의 다정한 움직임을 연출합니다.",
  },
  {
    id: "smile-facing",
    label: "나. 마주보며 미소",
    desc: "최대한 얼굴사진 변형 없이, 신랑·신부가 마주보며 미소짓는 효과입니다.",
  },
];

const WATERCOLOR_ILLUSTRATION_DEFAULT_PROMPT = "A beautiful wedding illustration, watercolor painting style, soft wet-on-wet technique, vibrant bleeding colors, delicate artistic brushstrokes on textured paper, dreamy atmosphere, soft pastel palette, masterpiece, painterly aesthetic, no photographic texture";
const WEBTOON_DEFAULT_PROMPT = "해당 이미지를 만화속 주인공처럼 웹툰형식으로 변경";

const SERVICE_TYPES = [
  { id: "video-effect", label: "프리미엄서비스1", title: "이미지 → 영상효과" },
  { id: "watercolor-illustration", label: "프리미엄서비스2", title: "이미지 → 수채화풍 일러스트" },
  { id: "webtoon", label: "프리미엄서비스3", title: "이미지 → 웹툰풍" },
];

// 사진 1장 → 이미지(영상이 아님) 결과를 만드는 서비스들 — Flux Pro 1.1 기반, 배경음악 합성 불필요
const IMAGE_STYLE_SERVICE_IDS = new Set(["watercolor-illustration", "webtoon"]);

function getDefaultPromptForService(serviceId: string): string {
  if (serviceId === "webtoon") return WEBTOON_DEFAULT_PROMPT;
  return WATERCOLOR_ILLUSTRATION_DEFAULT_PROMPT;
}

const STATUS_LABEL: Record<PremiumVideoStatus, string> = {
  pending: "요청하신 사항으로 영상을 제작하고 있습니다.",
  submitted: "요청하신 사항으로 영상을 제작하고 있습니다.",
  video_done: "영상작업이 완료되었습니다.",
  muxing: "배경음악과 합성중입니다.",
  done: "최종완료되었습니다.",
  failed: "생성에 실패했습니다.",
};

type BgmTrack = { id: string; title: string; url: string };

export function PcPremium() {
  const photos = useInvitationStore((s) => s.photos);
  const setPhotos = useInvitationStore((s) => s.setPhotos);
  const savedInvitationId = useInvitationStore((s) => s.savedInvitationId);
  const isSaved = !!savedInvitationId;

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [bgmTracks, setBgmTracks] = useState<BgmTrack[]>([]);
  const [selectedBgm, setSelectedBgm] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [selectedServiceType, setSelectedServiceType] = useState<string>("video-effect");
  const [customPrompt, setCustomPrompt] = useState<string>(WATERCOLOR_ILLUSTRATION_DEFAULT_PROMPT);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobPromptId, setJobPromptId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<PremiumVideoStatus | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [premiumOutputs, setPremiumOutputs] = useState<PremiumMediaOutput[]>([]);
  const [selectedPremiumOutputIds, setSelectedPremiumOutputIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const [muxStartedAt, setMuxStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [actualElapsedSec, setActualElapsedSec] = useState<number | null>(null);
  const [jobCreatedAt, setJobCreatedAt] = useState<string | null>(null);

  const lastFalStatusRef = useRef<string | null>(null);  // 반복 로그 차단용

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isSaved) return;
    getBgmTracks().then(setBgmTracks);
  }, [isSaved]);

  useEffect(() => {
    if (!savedInvitationId) return;
    getPremiumOutputs(savedInvitationId).then(setPremiumOutputs);
  }, [savedInvitationId, jobStatus]);

  // 기존(또는 진행중인) 프리미엄 영상 작업 복원 — 새로고침/재방문 시에도 이어서 표시
  useEffect(() => {
    if (!savedInvitationId) return;
    getLatestPremiumVideo(savedInvitationId).then((job) => {
      if (!job) return;

      // 마지막 작업이 실패 상태라면 진입 즉시 에러를 노출하지 않습니다.
      // 사용자가 새로 "제작하기"를 눌렀을 때의 에러만 보여주기 위함입니다.
      if (job.status === "failed") {
        setJobId(null);
        setJobPromptId(null);
        setJobStatus(null);
        setJobError(null);
        return;
      }

      setJobId(job.id);
      setJobPromptId(job.prompt_id);
      setJobStatus(job.status);
      setJobCreatedAt(job.created_at);
      if (job.video_url) setVideoUrl(job.video_url);
      if (job.error) setJobError(job.error);

      if (job.status === "done" && job.video_url) {
        setActualElapsedSec(
          Math.max(1, Math.floor((new Date(job.updated_at).getTime() - new Date(job.created_at).getTime()) / 1000)),
        );
      } else if (job.status === "submitted" || job.status === "pending") {
        setGenStartedAt(new Date(job.created_at).getTime());
        setNow(Date.now());
      } else if (job.status === "video_done") {
        setNow(Date.now());
      } else if (job.status === "muxing") {
        setGenStartedAt(new Date(job.created_at).getTime());
        setMuxStartedAt(Date.now());
        setNow(Date.now());
      }
    });
  }, [savedInvitationId]);

  useEffect(() => {
    if (!jobId || jobStatus === "done" || jobStatus === "failed") return;
    const id = setInterval(async () => {
      const job = await pollPremiumVideo(jobId);
      if (!job) return;
      if (job.fnLogs?.length) {
        job.fnLogs.forEach((m: string) => {
          // fal status 로그는 상태가 바뀔 때만 출력 (IN_QUEUE 반복 스팸 차단)
          const falStatusMatch = m.match(/\[poll\] fal status: (\S+)/);
          if (falStatusMatch) {
            if (falStatusMatch[1] !== lastFalStatusRef.current) {
              lastFalStatusRef.current = falStatusMatch[1];
              console.log("[EdgeFn:poll]", m);
            }
          } else {
            console.log("[EdgeFn:poll]", m);
          }
        });
      }
      setJobPromptId(job.prompt_id);
      setJobStatus(job.status);
      setJobCreatedAt(job.created_at);
      if (job.video_url) setVideoUrl(job.video_url);
      if (job.error) setJobError(job.error);
      if (job.status === "done") {
        setActualElapsedSec(
          Math.max(1, Math.floor((new Date(job.updated_at).getTime() - new Date(job.created_at).getTime()) / 1000)),
        );
      }
      if (job.status === "muxing") setMuxStartedAt((prev) => prev ?? Date.now());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [jobId, jobStatus]);

  // 진행률 표시용 1초 틱
  useEffect(() => {
    if (!jobStatus || jobStatus === "done" || jobStatus === "failed") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [jobStatus]);

  const handlePhotoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const urls = files.slice(0, remaining).map((file) => URL.createObjectURL(file));
    if (urls.length > 0) setPhotos([...photos, ...urls]);
    e.target.value = "";
  };

  const removePhoto = (i: number) => {
    setPhotos(photos.filter((_, idx) => idx !== i));
    setSelectedPhoto((prev) => (prev === null ? prev : prev === i ? null : prev > i ? prev - 1 : prev));
  };

  const togglePreview = (track: BgmTrack) => {
    const audioEl = previewAudioRef.current;
    if (!audioEl) return;
    if (playingId === track.id) {
      audioEl.pause();
      setPlayingId(null);
      return;
    }
    audioEl.src = track.url;
    audioEl.play();
    setPlayingId(track.id);
  };

  const previewPremiumOutput = (output: PremiumMediaOutput) => {
    setJobId(null);
    setJobStatus("done");
    setJobPromptId(output.prompt_id);
    setVideoUrl(output.video_url);
    setJobCreatedAt(output.created_at);
    setActualElapsedSec(null);
    setJobError(null);
  };

  const togglePremiumOutput = (outputId: string) => {
    const output = premiumOutputs.find((item) => item.id === outputId);
    const isChecking = !selectedPremiumOutputIds.includes(outputId);

    // 업데이터 함수 밖에서 side effect(setPhotos, setSelectedPhoto) 처리
    // — 업데이터 함수 안에서 다른 store를 업데이트하면 렌더 중 setState 경고 발생
    const next = isChecking
      ? [...selectedPremiumOutputIds, outputId]
      : selectedPremiumOutputIds.filter((id) => id !== outputId);

    setSelectedPremiumOutputIds(next);

    if (output && isChecking) {
      const nextPhotos = [output.video_url, ...photos.filter((src) => src !== output.video_url)].slice(0, MAX_PHOTOS);
      setPhotos(nextPhotos);

      if (!isVideoUrl(output.video_url)) {
        setSelectedPhoto(0);
      }
    }
  };

  const handleDeletePremiumOutputs = async () => {
    if (selectedPremiumOutputIds.length === 0 || isDeleting) return;
    if (!confirm(`${selectedPremiumOutputIds.length}개의 프리미엄 영상/사진을 삭제하시겠습니까?`)) return;

    // 비동기 시작 전에 선택·상태 즉시 초기화해 중복 호출 방지
    const deletingIds = [...selectedPremiumOutputIds];
    const deletingUrls = premiumOutputs
      .filter((o) => deletingIds.includes(o.id))
      .map((o) => o.video_url);

    setSelectedPremiumOutputIds([]);
    setIsDeleting(true);

    try {
      const result = await deletePremiumOutputs(deletingIds);
      if (!result.ok) {
        alert(`삭제 실패: ${result.error ?? "알 수 없는 오류"}`);
        return;
      }
      // 서버 재조회 없이 로컬 상태만 즉시 반영 — 별도 useEffect가 필요 시 재동기화
      setPremiumOutputs((prev) => prev.filter((o) => !deletingIds.includes(o.id)));
      setPhotos(useInvitationStore.getState().photos.filter((src) => !deletingUrls.includes(src)));
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRegisterPremiumOutputs = async () => {
    if (selectedPremiumOutputIds.length === 0) {
      alert("등록할 프리미엄 영상/사진을 선택해주세요.");
      return;
    }

    if (!savedInvitationId) return;

    const selectedOutputs = premiumOutputs.filter((output) => selectedPremiumOutputIds.includes(output.id));
    const selectedUrls = selectedOutputs.map((output) => output.video_url);
    const selectedUniqueUrls = Array.from(new Set(selectedUrls));
    const existingPremiumUrls = new Set(premiumOutputs.map((output) => output.video_url));
    const alreadyAttachedPremiumCount = photos.filter((src) => existingPremiumUrls.has(src)).length;
    const newAttachUrls = selectedUniqueUrls.filter((url) => !photos.includes(url));

    if (alreadyAttachedPremiumCount + newAttachUrls.length > MAX_PREMIUM_ATTACH) {
      alert(`프리미엄 사진은 최대 ${MAX_PREMIUM_ATTACH}개까지만 등록 가능합니다.`);
      return;
    }

    // Q7 사진첨부(invitation_photos)에 영구 등록 — 영상 생성 완료만으로는 절대 반영되지 않고
    // 이 "등록" 버튼을 눌러야만 반영됩니다.
    const result = await registerPremiumOutputsToPhotos(savedInvitationId, newAttachUrls);
    if (!result.ok) {
      alert(`등록 실패: ${result.error ?? "알 수 없는 오류"}`);
      return;
    }

    const nextPhotos = [
      ...selectedUniqueUrls,
      ...photos.filter((src) => !selectedUniqueUrls.includes(src)),
    ].slice(0, MAX_PHOTOS);
    setPhotos(nextPhotos);

    const firstImageUrl = newAttachUrls.find((url) => !isVideoUrl(url));
    if (firstImageUrl) {
      const nextSelectedIndex = nextPhotos.findIndex((src) => src === firstImageUrl);
      if (nextSelectedIndex >= 0) setSelectedPhoto(nextSelectedIndex);
    }

    setSelectedPremiumOutputIds([]);
    alert("사진첨부(Q7)에 등록되었습니다.");
  };

  const isRunning = !!jobStatus && jobStatus !== "done" && jobStatus !== "failed";

  const canGenerate =
    isSaved &&
    selectedPhoto !== null &&
    !isVideoUrl(photos[selectedPhoto] ?? "") &&
    (selectedServiceType === "video-effect" ? !!prompt : true) &&
    !submitting &&
    !isRunning;

  const handleCancel = async () => {
    if (!jobId) return;
    await cancelPremiumVideo(jobId);
    setJobStatus("failed");
    setJobError("사용자가 작업을 중지했습니다.");
    setJobId(null);
    setNow(null);
    setGenStartedAt(null);
    setMuxStartedAt(null);
  };

  useEffect(() => {
    console.log("[PcPremium] render-state", {
      isSaved,
      selectedServiceType,
      selectedPhoto,
      canGenerate,
      submitting,
      uploading,
      jobId,
      jobStatus,
      jobError,
    });
  }, [
    isSaved,
    selectedServiceType,
    selectedPhoto,
    canGenerate,
    submitting,
    uploading,
    jobId,
    jobStatus,
    jobError,
  ]);

  const handleGenerate = async () => {
    console.log("[PcPremium] handleGenerate:clicked", {
      isSaved,
      selectedServiceType,
      selectedPhoto,
      prompt,
      customPromptLength: customPrompt.trim().length,
      canGenerate,
      savedInvitationId,
    });

    if (!isSaved || !savedInvitationId) {
      alert("기본 청첩장을 먼저 저장해주세요.");
      return;
    }

    if (selectedPhoto === null) {
      alert("프리미엄 서비스를 이용할 사진 선택을 해주세요.");
      return;
    }

    if (isVideoUrl(photos[selectedPhoto] ?? "")) {
      alert("프리미엄 서비스를 이용할 사진(이미지)을 선택해주세요.");
      return;
    }

    if (selectedServiceType === "video-effect" && !prompt) {
      alert("프리미엄서비스1 옵션을 선택하세요.");
      return;
    }

    if (submitting) return;

    const finalPromptText = IMAGE_STYLE_SERVICE_IDS.has(selectedServiceType)
      ? (customPrompt.trim() !== "" ? customPrompt : getDefaultPromptForService(selectedServiceType))
      : (PROMPT_OPTIONS.find((p) => p.id === prompt)?.desc || "");

    if (!finalPromptText) return;

    console.log("[PcPremium] handleGenerate:start", {
      selectedServiceType,
      finalPromptLength: finalPromptText.length,
    });

    setSubmitting(true);
    setJobError(null);
    setVideoUrl(null);
    setActualElapsedSec(null);
    setJobCreatedAt(null);
    // 이전 작업의 jobId를 먼저 비워서, 업로드 중(수 초 소요) 이전 작업의 폴링이
    // 다시 돌면서 "완료 결과"에 이전 이미지가 잠깐 덮어써지는 것을 방지합니다.
    setJobId(null);
    // 클릭 즉시 진행 상태를 보여주기 위해 선반영합니다.
    setJobStatus("pending");
    setJobPromptId(selectedServiceType);
    setGenStartedAt(null);
    setMuxStartedAt(null);
    setGenStartedAt(Date.now());
    setNow(Date.now());

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요합니다.");

      setUploading(true);
      const [photoPath] = await uploadInvitationPhotos(savedInvitationId, user.id, [photos[selectedPhoto]]);
      const publicPhotoUrl = invitationPhotoPublicUrl(photoPath);

      // fal.ai 이미지 크기 제한(최대 약 8,947만 픽셀²) 대응 — 영상 생성 요청에는
      // 원본 대신 축소한 사본을 별도로 업로드해서 사용 (원본 화질은 그대로 유지)
      const resizedBlob = await resizeImageToBlob(publicPhotoUrl, 1024);
      const resizedBlobUrl = URL.createObjectURL(resizedBlob);
      const [resizedPath] = await uploadInvitationPhotos(savedInvitationId, user.id, [resizedBlobUrl]);
      URL.revokeObjectURL(resizedBlobUrl);
      setUploading(false);

      // 업로드된 원본 사진을 store에도 반영 (blob: → 영구 URL)
      setPhotos(photos.map((p, i) => (i === selectedPhoto ? publicPhotoUrl : p)));

      const result = await requestPremiumVideo({
        invitationId: savedInvitationId,
        photoPath: resizedPath,
        sourcePhotoPath: photoPath,
        bgmTrackId: selectedBgm,
        promptId: selectedServiceType,
        promptText: finalPromptText,
      });

      console.log("[PcPremium] requestPremiumVideo:result", result);

      if (result.ok && result.startLogs?.length) result.startLogs.forEach((m: string) => console.log("[EdgeFn:start]", m));
      if (!result.ok) throw new Error(result.error);

      const now = new Date().toISOString();
      setJobId(result.id);
      setJobPromptId(selectedServiceType);
      setJobStatus("pending");
      setJobCreatedAt(now);
      setGenStartedAt(Date.now());
      setNow(Date.now());
    } catch (err) {
      console.error("[PcPremium] handleGenerate:error", err);
      setJobStatus("failed");
      setJobError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      console.log("[PcPremium] handleGenerate:finally", {
        submitting: false,
        uploading: false,
      });
      setSubmitting(false);
      setUploading(false);
    }
  };

  let progressPercent = 0;
  let remainingSec = 0;
  let overtimeSec = 0;
  const activePromptId = jobPromptId ?? selectedServiceType;
  const baseEstimateSec = IMAGE_STYLE_SERVICE_IDS.has(activePromptId) ? ESTIMATE_IMAGE_STYLE_SEC : ESTIMATE_VIDEO_SEC;
  
  if (jobStatus === "done") {
    progressPercent = 100;
  } else if (jobStatus === "video_done") {
    progressPercent = 98;
    remainingSec = ESTIMATE_MUX_SEC;
  } else if (jobStatus === "muxing" && muxStartedAt && now) {
    const elapsed = Math.floor((now - muxStartedAt) / 1000);
    progressPercent = Math.min(97, Math.round((elapsed / ESTIMATE_MUX_SEC) * 100));
    remainingSec = Math.max(0, ESTIMATE_MUX_SEC - elapsed);
    overtimeSec = Math.max(0, elapsed - ESTIMATE_MUX_SEC);
  } else if (genStartedAt && now) {
    const elapsed = Math.floor((now - genStartedAt) / 1000);
    progressPercent = Math.min(95, Math.round((elapsed / baseEstimateSec) * 100));
    remainingSec = Math.max(0, baseEstimateSec - elapsed);
    overtimeSec = Math.max(0, elapsed - baseEstimateSec);
  }

  return (
    <section className="pc-section" id="sec-premium">
      <span className="step-num">PREMIUM UPGRADE</span>
      <h2 className="h">
        한 번뿐인 하루를 <em>더 닮게.</em>
      </h2>
      <p className="desc">사진을 영상으로, 디자이너의 손길로, 한정 폰트로. 프리미엄에서만 가능한 것들입니다.</p>

      <div className="pc-upgrade">
        <span className="badge">PREMIUM</span>
        <h3>
          <em>Bloom</em> Premium 으로 업그레이드
        </h3>
        <p style={{ color: "rgba(246,242,234,0.66)", fontSize: "13px", lineHeight: 1.7, maxWidth: "480px", margin: "8px 0 0" }}>
          위에서 기본청첩장을 만들어서 저장하시면 프리미엄 영상으로 제작할 수 있습니다.
          <br />
          첨부된 사진에서 영상으로 제작할 사진을 선택하시거나 첨부해주시고, 프리미엄 영상 프롬프트를 선택해주세요.
        </p>

        {!isSaved ? (
          <div className="premium-steps">
            <div className="premium-step">
              <div className="premium-step-num">1</div>
              <div className="premium-step-title">기본 청첩장 등록</div>
              <ul className="premium-step-list">
                <li>기본정보 등록</li>
                <li>효과 등록</li>
                <li>사진 첨부</li>
              </ul>
            </div>
            <span className="premium-step-arrow">→</span>
            <div className="premium-step">
              <div className="premium-step-num">2</div>
              <div className="premium-step-title">프리미엄 제작</div>
              <ul className="premium-step-list">
                <li>프리미엄 영상 사진 선택</li>
              </ul>
            </div>
            <span className="premium-step-arrow">→</span>
            <div className="premium-step">
              <div className="premium-step-num">3</div>
              <div className="premium-step-title">프리미엄 효과 선택</div>
              <ul className="premium-step-list">
                <li>모션효과 선택</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="premium-flow">
            <audio ref={previewAudioRef} onEnded={() => setPlayingId(null)} style={{ display: "none" }} />

            <div className="premium-flow-step">
              <div className="premium-flow-title">
                1. 프리미엄 영상 사진 선택해주세요(동영상으로 변경할 이미지 1개만 선택 가능)
              </div>
              <p className="premium-flow-hint">
                신랑, 신부가 함께 정면을 보고 있는 사진이면 더욱 좋습니다.
              </p>
              <div className="premium-photo-grid">
                {photos.map((src, i) =>
                  isVideoUrl(src) ? null : (
                    <label key={i} className="premium-photo-item">
                      <div className="premium-photo-thumb" style={{ backgroundImage: `url('${src}')` }}>
                        <button
                          type="button"
                          className="remove-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removePhoto(i);
                          }}
                          aria-label="사진 삭제"
                        >
                          ×
                        </button>
                      </div>
                      <span className="premium-photo-check">
                        <input
                          type="radio"
                          name="premium-photo"
                          checked={selectedPhoto === i}
                          onChange={() => setSelectedPhoto(i)}
                        />
                        선택
                      </span>
                    </label>
                  ),
                )}
                <label
                  className={`premium-photo-add${photos.length >= MAX_PHOTOS ? " disabled" : ""}`}
                  title="사진 추가"
                >
                  +
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={handlePhotoFiles}
                    disabled={photos.length >= MAX_PHOTOS}
                  />
                </label>
              </div>
            </div>

            <div className="premium-flow-step">
              <div className="premium-flow-title">2. 배경음악 선택 (선택사항)</div>
              <div className="premium-prompt-list">
                <label className={`premium-prompt-item${selectedBgm === null ? " active" : ""}`}>
                  <input
                    type="radio"
                    name="premium-bgm"
                    checked={selectedBgm === null}
                    onChange={() => setSelectedBgm(null)}
                  />
                  <div className="premium-prompt-label">선택 안함</div>
                </label>
                {bgmTracks.map((track) => (
                  <label key={track.id} className={`premium-prompt-item${selectedBgm === track.id ? " active" : ""}`}>
                    <input
                      type="radio"
                      name="premium-bgm"
                      checked={selectedBgm === track.id}
                      onChange={() => setSelectedBgm(track.id)}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div className="premium-prompt-label" style={{ flex: 1 }}>{track.title}</div>
                      <button
                        type="button"
                        className="premium-bgm-preview-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          togglePreview(track);
                        }}
                      >
                        {playingId === track.id ? "정지" : "미리듣기"}
                      </button>
                    </div>
                  </label>
                ))}
                {bgmTracks.length === 0 && (
                  <p className="premium-flow-empty">등록된 배경음악이 없습니다.</p>
                )}
              </div>
            </div>

            <div className="premium-flow-step">
              <div className="premium-flow-title">3. 서비스 선택</div>
              <div className="premium-prompt-list">
                {SERVICE_TYPES.map((service) => (
                  <label
                    key={service.id}
                    className={`premium-prompt-item${selectedServiceType === service.id ? " active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="service-type"
                      checked={selectedServiceType === service.id}
                      onChange={() => {
                        setSelectedServiceType(service.id);
                        setPrompt(null);
                      }}
                    />
                    <div>
                      <div className="premium-prompt-label">{service.label}</div>
                      <div className="premium-prompt-desc">{service.title}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {selectedServiceType === "video-effect" && (
              <div className="premium-flow-step">
                <div className="premium-flow-title">4. 프리미엄서비스1 이미지 → 영상효과 (필수)</div>
                <div className="premium-prompt-list">
                  {PROMPT_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className={`premium-prompt-item${prompt === opt.id ? " active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="premium-prompt"
                        checked={prompt === opt.id}
                        onChange={() => setPrompt(opt.id)}
                      />
                      <div>
                        <div className="premium-prompt-label">{opt.label}</div>
                        <div className="premium-prompt-desc">{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {IMAGE_STYLE_SERVICE_IDS.has(selectedServiceType) && (
              <div className="premium-flow-step">
                <div className="premium-flow-title">
                  4. {SERVICE_TYPES.find((s) => s.id === selectedServiceType)?.label}{" "}
                  {SERVICE_TYPES.find((s) => s.id === selectedServiceType)?.title} (선택)
                </div>
                <p className="premium-flow-hint">
                  프롬프트를 입력하지 않으면 기본 프롬프트가 사용됩니다.
                </p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={getDefaultPromptForService(selectedServiceType)}
                  className="premium-prompt-textarea"
                  rows={4}
                />
              </div>
            )}

            {isRunning ? (
              <button className="upbtn upbtn-cancel" type="button" onClick={handleCancel}>
                중지하기
              </button>
            ) : (
              <button className="upbtn" type="button" onClick={handleGenerate} disabled={!canGenerate}>
                {submitting ? "요청 중…" : "제작하기"}
              </button>
            )}

            {uploading && (
              <div className="premium-job-status">
                <p>사진을 업로드 하고 있습니다…</p>
              </div>
            )}

            {!uploading && jobStatus && (
              <div className="premium-job-status">
                <p>
                  {(() => {
                    const retryMatch = jobError?.match(/^retry:(\d+):/);
                    if (retryMatch && jobStatus === "submitted")
                      return `fal.ai 대기열 무응답 — 재제출 중 (${retryMatch[1]}/3)…`;
                    return STATUS_LABEL[jobStatus];
                  })()}
                </p>

                {jobStatus !== "done" && jobStatus !== "failed" && (
                  <div className="premium-progress">
                    <div className="premium-progress-bar">
                      <div className="premium-progress-fill" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <span className="premium-progress-time">
                      {remainingSec > 0
                        ? `남은 시간 ${formatMmSs(remainingSec)}`
                        : overtimeSec > 0
                          ? `예상 시간 초과 ${overtimeSec}초`
                          : "곧 완료됩니다…"}
                    </span>
                  </div>
                )}

                {jobStatus === "done" && actualElapsedSec !== null && (
                  <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "rgba(246,242,234,0.1)", borderRadius: "4px" }}>
                    {jobCreatedAt && (
                      <p className="premium-progress-time" style={{ marginBottom: "8px" }}>
                        생성일시: {formatCreatedAt(jobCreatedAt)}
                      </p>
                    )}
                    <p className="premium-progress-time">총 소요시간: 약 {actualElapsedSec}초</p>
                  </div>
                )}

                {jobStatus === "done" && videoUrl && IMAGE_STYLE_SERVICE_IDS.has(activePromptId) && (
                  <img src={videoUrl} alt="프리미엄 이미지 결과" className="premium-job-video" />
                )}
                {jobStatus === "done" && videoUrl && !IMAGE_STYLE_SERVICE_IDS.has(activePromptId) && (
                  <video controls src={videoUrl} className="premium-job-video" />
                )}
                {jobError && jobStatus === "failed" && (
                  <p className="premium-job-error">{jobError}</p>
                )}
              </div>
            )}

            <div className="premium-flow-step">
              <div className="premium-flow-title">5. 프리미엄 등록영상/사진</div>
              <p className="premium-flow-hint">
                완료된 프리미엄 결과를 선택할 수 있습니다. 복수 선택이 가능합니다.
              </p>
              {premiumOutputs.length > 0 ? (
                <>
                  <div className="premium-photo-grid">
                    {premiumOutputs.map((output) => {
                      const checked = selectedPremiumOutputIds.includes(output.id);
                      const isImage = IMAGE_STYLE_SERVICE_IDS.has(output.prompt_id);

                      return (
                        <div key={output.id} className="premium-photo-item" style={{ position: "relative" }}>
                          <div className="premium-photo-thumb premium-output-thumb">
                            {isImage ? (
                              <img
                                src={output.video_url}
                                alt="프리미엄 등록 이미지"
                                className="premium-output-media"
                                style={{ cursor: "pointer" }}
                                onClick={() => previewPremiumOutput(output)}
                              />
                            ) : (
                              <video
                                src={output.video_url}
                                className="premium-output-media"
                                style={{ cursor: "pointer" }}
                                muted
                                playsInline
                                onClick={() => previewPremiumOutput(output)}
                              />
                            )}
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePremiumOutput(output.id)}
                              style={{
                                position: "absolute",
                                top: "8px",
                                right: "8px",
                                width: "18px",
                                height: "18px",
                                cursor: "pointer",
                              }}
                            />
                          </div>
                          <div className="premium-photo-created-at" style={{
                            fontSize: "11px",
                            color: "rgba(246,242,234,0.66)",
                            marginTop: "4px",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {formatCreatedAt(output.created_at)}
                          </div>
                          <div style={{
                            marginTop: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "100%",
                          }}>
                            <span style={{
                              fontSize: "10px",
                              lineHeight: 1,
                              padding: "5px 8px",
                              borderRadius: "999px",
                              border: "1px solid rgba(246,242,234,0.32)",
                              color: "rgba(246,242,234,0.92)",
                              background: "rgba(246,242,234,0.12)",
                              letterSpacing: "0.02em",
                            }}>
                              {getGenerationModeBadge(output.generation_mode)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedPremiumOutputIds.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <button
                        type="button"
                        className="premium-register-btn"
                        onClick={handleRegisterPremiumOutputs}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#2e7d32",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "14px",
                        }}
                      >
                        {selectedPremiumOutputIds.length}개 등록
                      </button>
                      <button
                        type="button"
                        className="premium-delete-btn"
                        onClick={handleDeletePremiumOutputs}
                        disabled={isDeleting}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: "#e74c3c",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: isDeleting ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          opacity: isDeleting ? 0.6 : 1,
                        }}
                      >
                        {isDeleting ? "삭제 중…" : `${selectedPremiumOutputIds.length}개 삭제`}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="premium-flow-empty">등록된 프리미엄 영상/사진이 없습니다.</p>
              )}
            </div>
          </div>
        )}

        {!isSaved && (
          <button className="upbtn" type="button">
            프리미엄 자세히 보기 →
          </button>
        )}
      </div>
    </section>
  );
}
