"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const STORY = "STORY".split("");
const CARD = "CARD".split("");

function getDisplayName(user: User) {
  const meta = user.user_metadata ?? {};
  return (meta.full_name as string) || (meta.name as string) || (meta.nickname as string) || user.email || "사용자";
}

function getAvatarUrl(user: User) {
  const meta = user.user_metadata ?? {};
  return (meta.avatar_url as string) || (meta.picture as string) || null;
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#c4c0b8" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7 14h6" />
    </svg>
  );
}

export function PcHeader() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navUserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (navUserRef.current && !navUserRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setMenuOpen(false);
    router.refresh();
  };

  return (
    <header className="pc-header">
      <div className="pc-brand">
        <span className="pc-logo">
          {STORY.map((ch, i) => (
            <span key={`s-${i}`} className="pc-logo-char" style={{ animationDelay: `${i * 0.16}s` }}>
              {ch}
            </span>
          ))}
          <em>
            {CARD.map((ch, i) => (
              <span
                key={`c-${i}`}
                className="pc-logo-char"
                style={{ animationDelay: `${(STORY.length + i) * 0.16}s` }}
              >
                {ch}
              </span>
            ))}
          </em>
        </span>
        <span className="pc-tagline">FOR YOUR SPECIAL DAY · 모바일 청첩장</span>
      </div>
      <nav className="pc-nav">
        <a href="#sec-hero">INTRODUCE</a>
        <a href="#sec-edit">MAKE</a>
        <a href="#sec-samples">SAMPLE</a>
        <a href="#sec-premium">Q&amp;A</a>
        {user ? (
          <div className="pc-nav-user" ref={navUserRef}>
            <button type="button" className="pc-nav-profile" onClick={() => setMenuOpen((o) => !o)}>
              <span className="pc-nav-avatar">
                {getAvatarUrl(user) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getAvatarUrl(user)!} alt="" />
                ) : (
                  <PersonIcon />
                )}
              </span>
              <span className="pc-nav-username">{getDisplayName(user)}</span>
            </button>
            {menuOpen && (
              <div className="pc-nav-dropdown">
                <div className="pc-nav-dropdown-avatar">
                  {getAvatarUrl(user) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getAvatarUrl(user)!} alt="" />
                  ) : (
                    <PersonIcon />
                  )}
                </div>
                <div className="pc-nav-dropdown-name">{getDisplayName(user)}</div>
                {user.email && <div className="pc-nav-dropdown-email">{user.email}</div>}
                <Link href="/my" className="pc-nav-dropdown-link" onClick={() => setMenuOpen(false)}>
                  <CardIcon />
                  MY청첩장
                </Link>
                <button type="button" className="pc-nav-dropdown-logout" onClick={handleLogout}>
                  로그아웃
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link href="/login">LOGIN</Link>
        )}
      </nav>
    </header>
  );
}
