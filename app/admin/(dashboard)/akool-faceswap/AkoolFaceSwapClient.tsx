"use client";

import { useRef, useState, useCallback } from "react";
import { submitAkoolFaceSwap, pollAkoolFaceSwap, type ModelStyle } from "./actions";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

export function AkoolFaceSwapClient() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [sourcePrev, setSourcePrev] = useState("");
  const [targetPrev, setTargetPrev] = useState("");
  const [modelStyle, setModelStyle] = useState<ModelStyle>("realistic");
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const pollingRef = useRef(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>, slot: "source" | "target") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const prev = URL.createObjectURL(file);
    if (slot === "source") { setSourceFile(file); setSourcePrev(prev); }
    else                   { setTargetFile(file); setTargetPrev(prev); }
    setPhase("idle");
    setResultUrl("");
    setErrorMsg("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!sourceFile || !targetFile) return;
    setPhase("uploading");
    setResultUrl("");
    setErrorMsg("");

    try {
      const fd = new FormData();
      fd.set("source_image", sourceFile);
      fd.set("target_image", targetFile);
      fd.set("model_style", modelStyle);
      fd.set("face_enhance", faceEnhance ? "1" : "0");

      const submitRes = await submitAkoolFaceSwap(fd);
      if (!submitRes.ok) {
        setErrorMsg(submitRes.error);
        setPhase("error");
        return;
      }

      setPhase("processing");
      pollingRef.current = true;

      while (pollingRef.current) {
        const pollRes = await pollAkoolFaceSwap(submitRes.jobId);
        if (pollRes.status === "success") {
          setResultUrl(pollRes.resultUrl);
          setHistory(h => [pollRes.resultUrl, ...h].slice(0, 20));
          setPhase("done");
          pollingRef.current = false;
          return;
        }
        if (pollRes.status === "error") {
          setErrorMsg(pollRes.error);
          setPhase("error");
          pollingRef.current = false;
          return;
        }
        // processing → 서버가 90초 long-poll 후 돌아옴, 즉시 재호출
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
      pollingRef.current = false;
    }
  }, [sourceFile, targetFile, modelStyle, faceEnhance]);

  const busy = phase === "uploading" || phase === "processing";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* 이미지 슬롯 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ImageSlot
          label="소스 이미지 (이식할 얼굴)"
          preview={sourcePrev}
          file={sourceFile}
          accentColor="#00c875"
          onChange={e => handleFile(e, "source")}
          disabled={busy}
        />
        <ImageSlot
          label="타겟 이미지 (얼굴을 합성할 사진)"
          preview={targetPrev}
          file={targetFile}
          accentColor="#ff6644"
          onChange={e => handleFile(e, "target")}
          disabled={busy}
        />
      </div>

      {/* 옵션 */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--ink-soft)" }}>모델 스타일</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["realistic", "beautify", "lossless"] as const).map(s => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => setModelStyle(s)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 8,
                  border: "2px solid",
                  fontSize: 12,
                  cursor: busy ? "default" : "pointer",
                  borderColor: modelStyle === s ? "var(--accent)" : "var(--line)",
                  background: modelStyle === s ? "var(--accent)" : "transparent",
                  color: modelStyle === s ? "#fff" : "var(--ink)",
                  fontWeight: modelStyle === s ? 700 : 400,
                }}
              >{s}</button>
            ))}
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: busy ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={faceEnhance}
            onChange={e => setFaceEnhance(e.target.checked)}
            disabled={busy}
          />
          <span>Face Enhance (얼굴 품질 향상)</span>
        </label>
      </div>

      {/* 제출 버튼 */}
      <div>
        <button
          className="admin-btn"
          onClick={handleSubmit}
          disabled={busy || !sourceFile || !targetFile}
          style={{ minWidth: 160 }}
        >
          {phase === "uploading"  ? "업로드 중…" :
           phase === "processing" ? "처리 중…"   :
           "Face Swap 실행"}
        </button>
      </div>

      {/* 진행 상태 */}
      {phase === "processing" && (
        <div style={{ padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 8, fontSize: 13, color: "var(--ink-soft)" }}>
          Akool 서버에서 처리 중입니다… (이미지 기준 보통 10~30초 소요)
        </div>
      )}

      {/* 에러 */}
      {phase === "error" && (
        <div style={{ padding: "12px 16px", background: "#3d0a0a", borderRadius: 8, color: "#ff8f8f", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          오류: {errorMsg}
        </div>
      )}

      {/* 결과 */}
      {phase === "done" && resultUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>결과</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
            {targetPrev && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 6 }}>타겟 (원본)</div>
                <img src={targetPrev} alt="타겟" style={imgStyle} />
              </div>
            )}
            {sourcePrev && (
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 6 }}>소스 얼굴</div>
                <img src={sourcePrev} alt="소스" style={imgStyle} />
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 6 }}>결과</div>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer">
                <img src={resultUrl} alt="결과" style={imgStyle} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 히스토리 */}
      {history.length > 1 && (
        <details style={{ fontSize: 13 }}>
          <summary style={{ cursor: "pointer", color: "var(--ink-soft)", marginBottom: 8 }}>
            이전 결과 ({history.length - 1}개)
          </summary>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {history.slice(1).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`이전 결과 ${i + 1}`} style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const imgStyle: React.CSSProperties = {
  width: "100%",
  maxHeight: 480,
  objectFit: "contain",
  display: "block",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--bg-soft)",
};

function ImageSlot({
  label,
  preview,
  file,
  accentColor,
  onChange,
  disabled,
}: {
  label: string;
  preview: string;
  file: File | null;
  accentColor: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 2 }}>{label}</p>
      <label
        style={{
          display: "block",
          cursor: disabled ? "default" : "pointer",
          border: `2px dashed ${accentColor}55`,
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          minHeight: 200,
          background: "var(--bg)",
        }}
      >
        <input type="file" accept="image/*" onChange={onChange} disabled={disabled} style={{ display: "none" }} />
        {preview ? (
          <img
            src={preview}
            alt=""
            style={{ width: "100%", maxHeight: 400, objectFit: "contain", display: "block" }}
          />
        ) : (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "var(--ink-faint)", fontSize: 13,
          }}>
            클릭하여 이미지 선택
          </div>
        )}
      </label>
      {file && (
        <p style={{ fontSize: 11, color: "var(--ink-faint)" }}>
          {file.name} ({(file.size / 1024).toFixed(0)} KB)
        </p>
      )}
    </div>
  );
}
