import { redirect } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { PcHeader } from "@/components/pc/PcHeader";
import { PcFooter } from "@/components/pc/PcFooter";
import { CardTypeBadge, StatusBadge } from "@/components/admin/AdminBadge";
import { createReview } from "./actions";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "http://localhost:3000";

export default async function MyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/my");

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, slug, groom_name, bride_name, card_type, status, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const { data: reviews } = await supabase
    .from("reviews")
    .select("invitation_id, rating, content")
    .eq("author_id", user.id);

  const reviewByInvitation = new Map((reviews ?? []).map((r) => [r.invitation_id, r]));

  return (
    <>
      <PcHeader />
      <main className="my-page">
        <div className="my-container">
          <h1 className="my-title">MY 청첩장</h1>
          <p className="my-subtitle">저장한 청첩장을 확인하고 수정하세요.</p>

          {(invitations ?? []).length === 0 ? (
            <div className="my-empty">
              <p>저장된 청첩장이 없습니다.</p>
              <Link href="/" className="my-empty-btn">청첩장 만들기 →</Link>
            </div>
          ) : (
            <div className="my-inv-list">
              {(invitations ?? []).map(async (inv) => {
                const invUrl = `${SITE_URL}/i/${inv.slug}`;
                const qrDataUrl = await QRCode.toDataURL(invUrl, {
                  width: 128,
                  margin: 1,
                  color: { dark: "#1a1a1a", light: "#ffffff" },
                });
                const review = reviewByInvitation.get(inv.id);

                return (
                  <div key={inv.id} className="my-inv-card">
                    {/* 미리보기 iframe */}
                    <div className="my-inv-preview">
                      <iframe
                        src={`/i/${inv.slug}`}
                        title={`${inv.groom_name} · ${inv.bride_name} 청첩장`}
                        scrolling="no"
                        className="my-inv-iframe"
                      />
                    </div>

                    {/* 정보 + QR */}
                    <div className="my-inv-info">
                      <div className="my-inv-header">
                        <span className="my-inv-names">{inv.groom_name} · {inv.bride_name}</span>
                        <div className="my-inv-badges">
                          <CardTypeBadge value={inv.card_type} />
                          <StatusBadge value={inv.status} />
                        </div>
                      </div>

                      {/* URL */}
                      <div className="my-inv-url-row">
                        <a href={invUrl} target="_blank" rel="noreferrer" className="my-inv-url">
                          {invUrl}
                        </a>
                        <a href={`/i/${inv.slug}`} target="_blank" rel="noreferrer" className="my-inv-view-btn">
                          보기
                        </a>
                      </div>

                      {/* QR */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR코드" className="my-inv-qr" />

                      {/* 수정 버튼 */}
                      <div className="my-inv-actions">
                        <Link href={`/my/${inv.id}/edit`} className="my-inv-edit-btn">
                          수정하기
                        </Link>
                      </div>

                      {/* 리뷰 */}
                      {inv.status !== "published" && (
                        <p className="my-inv-review-note">게시 후 리뷰를 작성할 수 있습니다.</p>
                      )}
                      {inv.status === "published" && review && (
                        <div className="my-inv-review">
                          <p>내가 남긴 리뷰 — {"★".repeat(review.rating)}</p>
                          <p>{review.content}</p>
                        </div>
                      )}
                      {inv.status === "published" && !review && (
                        <form action={createReview} className="my-inv-review-form">
                          <input type="hidden" name="invitation_id" value={inv.id} />
                          <div>
                            <label htmlFor={`rating-${inv.id}`}>평점</label>
                            <select id={`rating-${inv.id}`} name="rating" defaultValue={5}>
                              {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n} value={n}>{"★".repeat(n)}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`content-${inv.id}`}>리뷰 내용</label>
                            <textarea id={`content-${inv.id}`} name="content" required />
                          </div>
                          <button type="submit" className="admin-btn">리뷰 작성</button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <div className="pc-main" style={{ paddingTop: 0 }}>
        <PcFooter />
      </div>
    </>
  );
}
