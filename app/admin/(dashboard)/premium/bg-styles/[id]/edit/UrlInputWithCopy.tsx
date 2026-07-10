"use client";

export function UrlInputWithCopy({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  const inputId = `url-input-${name}`;

  function handleCopy() {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (el?.value) navigator.clipboard.writeText(el.value);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        id={inputId}
        name={name}
        type="text"
        defaultValue={defaultValue}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        className="admin-btn admin-btn--ghost"
        style={{ whiteSpace: "nowrap", fontSize: 12 }}
        onClick={handleCopy}
      >
        링크복사
      </button>
    </div>
  );
}
