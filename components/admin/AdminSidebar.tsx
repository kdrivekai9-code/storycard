"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/supabase/auth-actions";

const NAV_ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/members", label: "회원관리" },
  { href: "/admin/applications", label: "신청관리" },
  { href: "/admin/qna", label: "Q&A 관리" },
  { href: "/admin/samples", label: "샘플등록관리" },
  { href: "/admin/reviews", label: "리뷰관리" },
  { href: "/admin/account", label: "계정설정" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="admin-sidebar">
      <Link href="/admin" className="admin-logo">
        STORY<em>CARD</em> ADMIN
      </Link>
      <nav className="admin-nav">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-nav-link${active ? " active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <form action={signOut} style={{ marginTop: "auto" }}>
        <button
          type="submit"
          className="admin-nav-link"
          style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer" }}
        >
          로그아웃
        </button>
      </form>
      <Link href="/" className="admin-nav-link">
        ← 사이트로 돌아가기
      </Link>
    </aside>
  );
}
