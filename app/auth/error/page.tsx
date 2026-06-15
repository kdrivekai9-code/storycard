import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        textAlign: "center",
        padding: "40px",
      }}
    >
      <h1 style={{ fontSize: "20px", fontWeight: 700 }}>로그인에 문제가 발생했습니다</h1>
      <p style={{ color: "var(--ink-soft)" }}>잠시 후 다시 시도해 주세요.</p>
      <Link href="/" style={{ color: "var(--accent-deep)", textDecoration: "underline" }}>
        홈으로 돌아가기
      </Link>
    </main>
  );
}
