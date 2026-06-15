"use client";

import { useRef, useState } from "react";
import { useInvitationStore } from "@/store/invitationStore";
import { DEFAULT_SECTIONS } from "@/lib/invitation/mergeConfig";
import type { Mood, MotionId, SectionId, ToneId, CoverType, UserData } from "@/lib/invitation/types";

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
  { id: "overlay", label: "중앙텍스트" },
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
];

const SECTION_OPTIONS: { id: SectionId; label: string }[] = [
  { id: "greeting", label: "인사말" },
  { id: "timeline", label: "러브스토리" },
  { id: "gallery", label: "갤러리" },
  { id: "video", label: "영상" },
  { id: "map", label: "오시는 길" },
  { id: "rsvp", label: "참석 의사" },
  { id: "account", label: "마음 전하실 곳" },
  { id: "guestbook", label: "방명록" },
];

const MAX_PHOTOS = 10;

function CoverPreview({ id }: { id: CoverType }) {
  switch (id) {
    case "full":
      return (
        <div className="cc-preview cc-full">
          <div className="cc-photo" />
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
            <div className="cc-photo" />
          </div>
          <div className="cc-bar w55" style={{ marginTop: "5px" }} />
          <div className="cc-bar w35" style={{ marginTop: "3px" }} />
        </div>
      );
    case "split":
      return (
        <div className="cc-preview cc-split">
          <div className="cc-photo" />
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
            <div className="cc-photo cc-g-main" />
            <div className="cc-photo cc-g-sm" />
            <div className="cc-photo cc-g-sm" />
          </div>
        </div>
      );
    case "overlay":
      return (
        <div className="cc-preview cc-overlay">
          <div className="cc-photo" />
          <div className="cc-dim" />
          <div className="cc-center-box">
            <div className="cc-bar w65" />
            <div className="cc-bar w45" style={{ marginTop: "3px" }} />
          </div>
        </div>
      );
  }
}

export function PcLiveEditor() {
  const userData = useInvitationStore((s) => s.userData);
  const answers = useInvitationStore((s) => s.answers);
  const setUserData = useInvitationStore((s) => s.setUserData);
  const setAnswer = useInvitationStore((s) => s.setAnswer);

  const [photos, setPhotos] = useState<string[]>([]);
  const [gradientDot, setGradientDot] = useState<{ left: string; color: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeMood = answers.mood ?? "modern";
  const activeCover = answers.cover ?? "full";
  const activeTone = answers.tone ?? "warm";
  const activeMotion = answers.motion ?? "soft";
  const activeSections = answers.sections ?? DEFAULT_SECTIONS;
  const activeCtc = answers.coverTextColor ?? "#ffffff";

  const field = (key: keyof UserData) => ({
    value: userData[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setUserData({ [key]: e.target.value }),
  });

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
    if (urls.length > 0) setPhotos((prev) => [...prev, ...urls]);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
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
          <div className="group-label">신랑 · 신부</div>
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
          <div className="group-label">예식 일시</div>
          <div className="live-row">
            <div className="live-field">
              <label>날짜</label>
              <input type="text" {...field("dateInput")} />
            </div>
            <div className="live-field">
              <label>시각</label>
              <input type="text" {...field("timeInput")} />
            </div>
          </div>
        </div>

        {/* 예식장 */}
        <div className="group">
          <div className="group-label">예식장</div>
          <div className="live-row single">
            <div className="live-field">
              <label>예식장 이름</label>
              <input type="text" {...field("venue")} />
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
          <div className="group-label">양가 혼주</div>
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
          <div className="group-label">Q3 · 표지 레이아웃 — 사진을 올리면 실제 미리보기로 확인됩니다</div>
          <div className="cover-card-grid">
            {COVER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`cover-card${activeCover === opt.id ? " active" : ""}`}
                onClick={() => setAnswer("cover", opt.id)}
              >
                <CoverPreview id={opt.id} />
                <span className="cc-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Q4 표지 텍스트 컬러 */}
        <div className="group">
          <div className="group-label">Q4 · 표지 텍스트 컬러</div>
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
          <div className="group-label">Q7 · 인사말 말투</div>
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
          <div className="group-label">Q6 · 움직임(연출)</div>
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
          </div>
        </div>

        {/* Q5 담을 내용 */}
        <div className="group">
          <div className="group-label">Q5 · 담을 내용 (복수 선택 — 끄면 청첩장에서 사라집니다)</div>
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
          <div className="group-label">사진 첨부</div>
          <div className="photo-upload-grid">
            {photos.map((src, idx) => (
              <div key={src} className={`photo-thumb${idx === 0 ? " is-cover" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`첨부 사진 ${idx + 1}`} />
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

        <div className="live-hint">오른쪽 청첩장이 실시간으로 갱신됩니다.</div>
      </div>
    </section>
  );
}
