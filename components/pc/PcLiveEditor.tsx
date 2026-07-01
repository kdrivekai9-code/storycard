"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useInvitationStore } from "@/store/invitationStore";
import { DEFAULT_SECTIONS } from "@/lib/invitation/mergeConfig";
import { saveInvitation, updateInvitation, syncInvitationPhotos } from "@/lib/invitation/actions";
import { uploadInvitationPhotos, isVideoUrl } from "@/lib/invitation/photoUpload";
import { searchKakaoPlaces, type KakaoPlace } from "@/lib/kakao/places";
import type { Mood, MotionId, SectionId, ToneId, CoverType, UserData } from "@/lib/invitation/types";
import { WeddingDatePicker, WeddingTimePicker } from "@/components/invitation/WeddingDateTimeFields";

const MOOD_OPTIONS: { id: Mood; label: string; swatch: string }[] = [
  { id: "romantic", label: "로맨틱", swatch: "linear-gradient(135deg,#f5e0d4,#dcb4a5)" },
  { id: "modern", label: "모던 미니멀", swatch: "linear-gradient(135deg,#f5f4f0,#d8d4cc)" },
  { id: "classic", label: "클래식", swatch: "linear-gradient(135deg,#f6f2ea,#d4c3a1)" },
  { id: "vintage", label: "빈티지", swatch: "linear-gradient(135deg,#e8e2d4,#b4a484)" },
  { id: "vivid", label: "컬러풀", swatch: "linear-gradient(135deg,#f5d0c4,#a8c4b4)" },
  { id: "korean", label: "한국적", swatch: "linear-gradient(135deg,#f7edd8,#c43828)" },
];

const COVER_OPTIONS: { id: CoverType; label: string }[] = [
  { id: "full", label: "풀블리드" },
  { id: "frame", label: "액자형" },
  { id: "split", label: "상하분할" },
  { id: "mosaic", label: "모자이크" },
  { id: "overlay", label: "초대장" },
];

const CTC_PRESETS = [
  { hex: "#ffffff", label: "화이트" },
  { hex: "#f5ede0", label: "크림" },
  { hex: "#1a1a1a", label: "차콜" },
  { hex: "#d4a860", label: "골드" },
];

const TONE_OPTIONS: { id: ToneId; label: string }[] = [
  { id: "warm", label: "다정하게" },
  { id: "formal", label: "정중하게" },
  { id: "witty", label: "위트 있게" },
];

const MOTION_OPTIONS: { id: MotionId; label: string }[] = [
  { id: "vivid", label: "화려하게" },
  { id: "soft", label: "잔잔하게" },
  { id: "lovely", label: "러블리" },
  { id: "bubble", label: "버블버블" },
  { id: "snow", label: "눈송이" },
  { id: "autumn", label: "가을에서" },
  { id: "summer", label: "파도" },
  { id: "lettering", label: "레터링" },
];

const SECTION_OPTIONS: { id: SectionId; label: string }[] = [
  { id: "greeting", label: "인사말" },
  { id: "gallery", label: "갤러리" },
  { id: "map", label: "오시는 길" },
  { id: "rsvp", label: "참석 의사" },
  { id: "account", label: "마음 전하실 곳" },
  { id: "guestbook", label: "방명록" },
];

const MAX_PHOTOS = 10;

/** 신랑·신부 ~ 양가 혼주: 저장 시 필수로 입력해야 하는 항목 */
const REQUIRED_FIELDS: { key: keyof UserData; label: string }[] = [
  { key: "groom", label: "신랑" },
  { key: "bride", label: "신부" },
  { key: "dateInput", label: "날짜" },
  { key: "timeInput", label: "시각" },
  { key: "venue", label: "예식장 이름" },
  { key: "address", label: "주소" },
  { key: "groomFather", label: "신랑 부" },
  { key: "groomMother", label: "신랑 모" },
  { key: "brideFather", label: "신부 부" },
  { key: "brideMother", label: "신부 모" },
];

/** "2026.10.18 (토)" 형식 */
const DATE_RE = /^\d{4}[.\-\s]+\d{1,2}[.\-\s]+\d{1,2}\s*\([일월화수목금토]\)$/;
/** "오후 1:30" 형식 */
const TIME_RE = /^(오전|오후)\s*\d{1,2}:\d{2}$/;

function RingsIcon() {
  return (
    <svg className="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="14" r="5" />
      <circle cx="15" cy="14" r="5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg className="group-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M2 20c0-3 2.5-5 6-5s6 2 6 5" />
      <path d="M11 20c0-2.5 2-4.5 5-4.5s5 2 5 4.5" />
    </svg>
  );
}

function CoverPreview({ id, photos }: { id: CoverType; photos: string[] }) {
  const p1 = photos[0];
  const p2 = photos[1] ?? p1;
  const p3 = photos[2] ?? p2;
  const bg = (src?: string): React.CSSProperties =>
    src && !isVideoUrl(src) ? { backgroundImage: `url('${src}')` } : {};

  // 사진 자리가 프리미엄 영상으로 교체된 경우 background-image로는 렌더링할 수 없어 <video>로 표시
  const media = (className: string, src?: string) =>
    src && isVideoUrl(src) ? (
      <video className={className} src={src} style={{ objectFit: "cover" }} muted loop autoPlay playsInline />
    ) : (
      <div className={className} style={bg(src)} />
    );

  switch (id) {
    case "full":
      return (
        <div className="cc-preview cc-full">
          {media("cc-photo", p1)}
          <div className="cc-gradient" />
          <div className="cc-bottom-text">
            <div className="cc-bar w60" />
            <div className="cc-bar w40" />
          </div>
        </div>
      );
    case "frame":
      return (
        <div className="cc-preview cc-frame">
          <div className="cc-frame-outer">
            {media("cc-photo", p1)}
          </div>
          <div className="cc-bar w55" style={{ marginTop: "5px" }} />
          <div className="cc-bar w35" style={{ marginTop: "3px" }} />
        </div>
      );
    case "split":
      return (
        <div className="cc-preview cc-split">
          {media("cc-photo", p1)}
          <div className="cc-split-fade" />
          <div className="cc-split-bottom">
            <div className="cc-bar w60" />
            <div className="cc-bar w40" style={{ marginTop: "3px" }} />
          </div>
        </div>
      );
    case "mosaic":
      return (
        <div className="cc-preview cc-mosaic">
          <div className="cc-top-text">
            <div className="cc-bar w50" />
            <div className="cc-bar w35" style={{ marginTop: "3px" }} />
          </div>
          <div className="cc-grid">
            {media("cc-photo cc-g-main", p1)}
            {media("cc-photo cc-g-sm", p2)}
            {media("cc-photo cc-g-sm", p3)}
          </div>
        </div>
      );
    case "overlay":
      return (
        <div className="cc-preview cc-overlay">
          {media("cc-photo", p1)}
          <div className="cc-dim" />
          <div className="cc-center-box">
            <div className="cc-bar w65" />
            <div className="cc-bar w45" style={{ marginTop: "3px" }} />
          </div>
        </div>
      );
  }
}

export function PcLiveEditor({
  invitationId,
  invitationSlug,
}: {
  invitationId?: string;
  invitationSlug?: string;
} = {}) {
  const userData = useInvitationStore((s) => s.userData);
  const answers = useInvitationStore((s) => s.answers);
  const photos = useInvitationStore((s) => s.photos);
  const setUserData = useInvitationStore((s) => s.setUserData);
  const setAnswer = useInvitationStore((s) => s.setAnswer);
  const setPhotos = useInvitationStore((s) => s.setPhotos);
  const setSaved = useInvitationStore((s) => s.setSaved);
  const [gradientDot, setGradientDot] = useState<{ left: string; color: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 수정모드: 기존에 저장된 값이므로 "샘플 placeholder 미입력" 검증을 건너뛰도록
  // 필수 항목을 모두 touched 처리 (수정페이지가 store에 직접 setUserData 하기 때문에
  // 이 컴포넌트의 touched state는 알지 못함)
  const [touched, setTouched] = useState<Set<keyof UserData>>(() =>
    invitationId ? new Set(REQUIRED_FIELDS.map((f) => f.key)) : new Set(),
  );
  const [venueResults, setVenueResults] = useState<KakaoPlace[]>([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [venueOpen, setVenueOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<keyof UserData>>(new Set());
  const [savedSlug, setSavedSlug] = useState<string | null>(invitationSlug ?? null);
  const isEditMode = !!invitationId;

  // 수정모드 진입 시 store에 저장 상태를 동기화 (PcPremium 등 다른 컴포넌트가 참조)
  useEffect(() => {
    if (invitationId) {
      setSaved(invitationId, invitationSlug ?? "");
    }
  }, [invitationId, invitationSlug, setSaved]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const activeMood = answers.mood ?? "modern";
  const activeCover = answers.cover ?? "full";
  const activeTone = answers.tone ?? "warm";
  const activeMotion = answers.motion ?? "soft";
  const activeSections = answers.sections ?? DEFAULT_SECTIONS;
  const LIGHT_BG_COVERS: CoverType[] = ["frame", "split", "overlay", "full", "mosaic"];
  const activeCtc = answers.coverTextColor ?? (LIGHT_BG_COVERS.includes(activeCover) ? "#333333" : "#ffffff");

  const setField = (key: keyof UserData, value: string) => {
    setUserData({ [key]: value });
    setTouched((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    setInvalidFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const field = (key: keyof UserData) => ({
    value: userData[key],
    className: [touched.has(key) ? null : "is-sample", invalidFields.has(key) ? "is-invalid" : null]
      .filter(Boolean)
      .join(" ") || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setField(key, e.target.value),
  });

  const validateRequiredFields = () => {
    const invalid = new Set<keyof UserData>();
    const missing: string[] = [];
    const badFormat: string[] = [];

    for (const { key, label } of REQUIRED_FIELDS) {
      const value = (userData[key] ?? "").trim();
      if (!touched.has(key) || !value) {
        invalid.add(key);
        missing.push(label);
        continue;
      }
      if (key === "dateInput" && !DATE_RE.test(value)) {
        invalid.add(key);
        badFormat.push("날짜(예: 2026.10.18 (토))");
      }
      if (key === "timeInput" && !TIME_RE.test(value)) {
        invalid.add(key);
        badFormat.push("시각(예: 오후 1:30)");
      }
    }

    const messages: string[] = [];
    if (missing.length > 0) messages.push(`${missing.join(", ")} 항목을 입력해주세요.`);
    if (badFormat.length > 0) messages.push(`${badFormat.join(", ")} 형식을 확인해주세요.`);

    return { invalid, message: messages.join(" ") };
  };

  const handleVenueSearch = async () => {
    const query = userData.venue.trim();
    if (!query) return;
    setVenueSearching(true);
    setVenueError(null);
    try {
      const results = await searchKakaoPlaces(query);
      setVenueResults(results);
      setVenueOpen(true);
    } catch (err) {
      setVenueError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
      setVenueOpen(true);
    } finally {
      setVenueSearching(false);
    }
  };

  const handleSelectVenue = (place: KakaoPlace) => {
    setUserData({
      venue: place.place_name,
      address: place.road_address_name || place.address_name,
    });
    setTouched((prev) => new Set(prev).add("venue").add("address"));
    setVenueOpen(false);
  };

  const toggleSection = (id: SectionId) => {
    const next = activeSections.includes(id)
      ? activeSections.filter((s) => s !== id)
      : [...activeSections, id];
    setAnswer("sections", next);
  };

  const handlePresetCtc = (hex: string) => {
    setGradientDot(null);
    setAnswer("coverTextColor", hex);
  };

  const handleGradientClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const pct = x / rect.width;
    const hue = Math.round(pct * 360);
    const color = `hsl(${hue}, 75%, 87%)`;
    setGradientDot({ left: `${pct * 100}%`, color });
    setAnswer("coverTextColor", color);
  };

  const handlePhotoFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const urls = files.slice(0, remaining).map((file) => URL.createObjectURL(file));
    if (urls.length > 0) setPhotos([...photos, ...urls]);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos(photos.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!user) {
      setShowLoginPopup(true);
      return;
    }

    const { invalid, message } = validateRequiredFields();
    if (invalid.size > 0) {
      setInvalidFields(invalid);
      setSaveMsg({ type: "error", text: message });
      return;
    }
    setInvalidFields(new Set());

    setSaving(true);
    setSaveMsg(null);

    if (isEditMode && invitationId) {
      const result = await updateInvitation(invitationId, userData, answers);
      if (!result.ok) {
        setSaving(false);
        setSaveMsg({ type: "error", text: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." });
        return;
      }
      try {
        const paths = await uploadInvitationPhotos(invitationId, user.id, photos);
        await syncInvitationPhotos(invitationId, paths);
      } catch {
        // 사진 업로드 실패해도 본문 저장은 유지
      }
      setSaving(false);
      setSaveMsg({ type: "success", text: "수정 내용이 저장되었습니다." });
      return;
    }

    const result = await saveInvitation(userData, answers);
    if (result.ok) {
      try {
        const paths = await uploadInvitationPhotos(result.id, user.id, photos);
        await syncInvitationPhotos(result.id, paths);
      } catch {
        // 사진 업로드 실패해도 본문 저장은 유지
      }
      setSavedSlug(result.slug);
      setSaved(result.id, result.slug);
      setSaveMsg({ type: "success", text: "저장되었습니다!" });
    } else {
      setSaveMsg({ type: "error", text: "저장에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
    setSaving(false);
  };

  return (
    <section className="pc-live" id="sec-edit" style={{ paddingTop: "8px" }}>
      <p className="lead">LIVE EDITOR</p>
      <h2 className="title">
        두 분의 이야기를 <em>입력하세요.</em>
      </h2>
      <p className="desc">입력하시면 옆 청첩장에 즉시 반영됩니다. 사실 정보만 입력하시면 디자인은 알아서 조립됩니다.</p>

      <div className="live-card">
        {/* 신랑·신부 */}
        <div className="group">
          <div className="group-label-fact">
            <RingsIcon />
            신랑 · 신부
          </div>
          <div className="live-row">
            <div className="live-field">
              <label>신랑</label>
              <input type="text" {...field("groom")} />
            </div>
            <div className="live-field">
              <label>신부</label>
              <input type="text" {...field("bride")} />
            </div>
          </div>
        </div>

        {/* 예식 일시 */}
        <div className="group">
          <div className="group-label-fact">
            <CalendarIcon />
            예식 일시
          </div>
          <div className="live-row">
            <div className="live-field">
              <label>날짜</label>
              <WeddingDatePicker
                value={userData.dateInput}
                onChange={(v) => setField("dateInput", v)}
                sample={!touched.has("dateInput")}
                invalid={invalidFields.has("dateInput")}
              />
            </div>
            <div className="live-field">
              <label>시각</label>
              <WeddingTimePicker
                value={userData.timeInput}
                onChange={(v) => setField("timeInput", v)}
                sample={!touched.has("timeInput")}
                invalid={invalidFields.has("timeInput")}
              />
            </div>
          </div>
        </div>

        {/* 예식장 */}
        <div className="group">
          <div className="live-row single">
            <div className="live-field">
              <label>예식장 이름</label>
              <div className="venue-search-row">
                <input type="text" {...field("venue")} />
                <button
                  type="button"
                  className="venue-search-btn"
                  onClick={handleVenueSearch}
                  disabled={venueSearching}
                >
                  {venueSearching ? "검색 중…" : "검색"}
                </button>
              </div>
              {venueOpen && (
                <div className="venue-results">
                  {venueError ? (
                    <div className="venue-error">{venueError}</div>
                  ) : venueResults.length === 0 ? (
                    <div className="venue-empty">검색 결과가 없습니다.</div>
                  ) : (
                    venueResults.map((place) => (
                      <button
                        key={`${place.place_name}-${place.address_name}`}
                        type="button"
                        className="venue-result-item"
                        onClick={() => handleSelectVenue(place)}
                      >
                        {place.place_name}
                        <span className="venue-result-addr">
                          {place.road_address_name || place.address_name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="live-row single" style={{ marginTop: "12px" }}>
            <div className="live-field">
              <label>주소 (카카오 주소검색 자동 연동)</label>
              <input type="text" {...field("address")} />
            </div>
          </div>
        </div>

        {/* 양가 혼주 */}
        <div className="group">
          <div className="group-label-fact">
            <FamilyIcon />
            양가 혼주
          </div>
          <div className="live-row">
            <div className="live-field">
              <label>신랑 부</label>
              <input type="text" {...field("groomFather")} />
            </div>
            <div className="live-field">
              <label>신랑 모</label>
              <input type="text" {...field("groomMother")} />
            </div>
          </div>
          <div className="live-row" style={{ marginTop: "12px" }}>
            <div className="live-field">
              <label>신부 부</label>
              <input type="text" {...field("brideFather")} />
            </div>
            <div className="live-field">
              <label>신부 모</label>
              <input type="text" {...field("brideMother")} />
            </div>
          </div>
        </div>

        {/* Q1 분위기 */}
        <div className="group">
          <div className="group-label">Q1 · 분위기</div>
          <div className="chips">
            {MOOD_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip-btn${activeMood === opt.id ? " active" : ""}`}
                onClick={() => setAnswer("mood", opt.id)}
              >
                <span className="swatch" style={{ background: opt.swatch }} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Q3 표지 */}
        <div className="group">
          <div className="group-label">Q2 · 표지 레이아웃 — 사진을 올리면 실제 미리보기로 확인됩니다</div>
          <div className="cover-card-grid">
            {COVER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`cover-card${activeCover === opt.id ? " active" : ""}`}
                onClick={() => {
                  setAnswer("cover", opt.id);
                  const defaultCtc = (["frame", "split", "overlay", "full", "mosaic"] as CoverType[]).includes(opt.id as CoverType) ? "#333333" : "#ffffff";
                  setAnswer("coverTextColor", defaultCtc);
                }}
              >
                <CoverPreview id={opt.id} photos={photos} />
                <span className="cc-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Q4 표지 텍스트 컬러 */}
        <div className="group">
          <div className="group-label">Q3 · 표지 텍스트 컬러</div>
          <div className="ccp-wrap">
            {CTC_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                className={`ccp-btn${activeCtc === preset.hex ? " active" : ""}`}
                onClick={() => handlePresetCtc(preset.hex)}
                title={preset.label}
              >
                <span className="ccp-swatch" style={{ background: preset.hex }} />
                <span className="ccp-name">{preset.label}</span>
              </button>
            ))}
            <div className="ccp-gradient-wrap" onClick={handleGradientClick}>
              <div className="ccp-gradient-bar" />
              <span className="ccp-dropper">✛</span>
              {gradientDot && (
                <span
                  className="ccp-preview-dot"
                  style={{ left: gradientDot.left, background: gradientDot.color }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Q7 말투 */}
        <div className="group">
          <div className="group-label">Q4 · 인사말 말투</div>
          <div className="chips">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip-btn${activeTone === opt.id ? " active" : ""}`}
                onClick={() => setAnswer("tone", opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Q6 움직임 */}
        <div className="group">
          <div className="group-label">Q5 · 움직임(연출)</div>
          <div className="chips">
            {MOTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip-btn${activeMotion === opt.id ? " active" : ""}`}
                onClick={() => setAnswer("motion", opt.id)}
              >
                {opt.label}
              </button>
            ))}
            {activeMotion === "lettering" && (
              <input
                type="text"
                className="lettering-input"
                value={answers.letteringText ?? "Our wedding day"}
                onChange={(e) => setAnswer("letteringText", e.target.value)}
                placeholder="Our wedding day"
                maxLength={40}
              />
            )}
          </div>
        </div>

        {/* Q5 담을 내용 */}
        <div className="group">
          <div className="group-label">Q6 · 담을 내용 (복수 선택 — 끄면 청첩장에서 사라집니다)</div>
          <div className="chips">
            {SECTION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`chip-btn${activeSections.includes(opt.id) ? " active" : ""}`}
                onClick={() => toggleSection(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 사진 첨부 */}
        <div className="group">
          <div className="group-label">Q7 · 사진 첨부</div>
          <div className="photo-upload-grid">
            {photos.map((src, idx) => (
              <div key={src} className={`photo-thumb${idx === 0 ? " is-cover" : ""}`}>
                {isVideoUrl(src) ? (
                  <video src={src} muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`첨부 사진 ${idx + 1}`} />
                )}
                <button type="button" className="remove-btn" onClick={() => removePhoto(idx)} aria-label="사진 삭제">
                  ×
                </button>
              </div>
            ))}
            <label
              className={`photo-add-btn${photos.length >= MAX_PHOTOS ? " disabled" : ""}`}
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
          <div className="photo-count-hint">
            첫 번째 사진이 커버로 사용됩니다 · 최대 <span>{photos.length}</span>/{MAX_PHOTOS}장
          </div>
        </div>

        {/* 저장 */}
        <div className="group">
          <button type="button" className="live-save-btn" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : isEditMode ? "수정 저장" : "저장하기"}
          </button>
          {saveMsg && <p className={`live-save-msg ${saveMsg.type}`}>{saveMsg.text}</p>}
          {savedSlug && saveMsg?.type === "success" && (
            <div className="live-save-url">
              <a href={`/i/${savedSlug}`} target="_blank" rel="noreferrer" className="live-save-url-link">
                /i/{savedSlug}
              </a>
              <a href="/my" className="live-save-my-link">MY청첩장 &rarr;</a>
            </div>
          )}
          {showLoginPopup && (
            <div className="login-popup-overlay" onClick={() => setShowLoginPopup(false)}>
              <div className="login-popup" onClick={(e) => e.stopPropagation()}>
                <p className="login-popup-text">로그인 후 저장할 수 있어요.</p>
                <Link href="/login" className="login-popup-btn">
                  로그인
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="live-hint">오른쪽 청첩장이 실시간으로 갱신됩니다.</div>
      </div>
    </section>
  );
}
