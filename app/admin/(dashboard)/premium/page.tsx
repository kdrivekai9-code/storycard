import Link from "next/link";
import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminBadge } from "@/components/admin/AdminBadge";
import {
  updateServiceConfig,
  createPreset,
  deletePreset,
  togglePreset,
  deleteBgStyle,
} from "./actions";

const TABS = [
  { id: "video-effect",           label: "서비스1 · 영상효과" },
  { id: "watercolor-illustration",label: "서비스2 · 수채화" },
  { id: "webtoon",                label: "서비스3 · 웹툰" },
  { id: "bg-change",              label: "서비스4 · 배경변경" },
];

export default async function AdminPremiumPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service: rawService } = await searchParams;
  const activeService = rawService ?? "video-effect";

  const supabase = await createClient();

  const [{ data: configs }, { data: presets }, { data: bgStyles }] = await Promise.all([
    supabase.from("premium_service_configs").select("*").order("sort_order"),
    supabase.from("premium_service_presets").select("*").order("sort_order"),
    supabase.from("premium_bg_styles").select("*").order("sort_order"),
  ]);

  const config = (configs ?? []).find((c) => c.service_id === activeService);
  const configPresets = (presets ?? []).filter((p) => p.service_id === activeService);

  return (
    <>
      <AdminPageHeader
        title="프리미엄서비스 관리"
        description="fal.ai 연동 프리미엄 서비스의 모델 설정, 프롬프트, 옵션을 관리합니다."
      />

      {/* 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/admin/premium?service=${tab.id}`}
            className={`admin-btn${activeService === tab.id ? "" : " admin-btn--ghost"}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {!config ? (
        <p style={{ color: "var(--ink-soft)" }}>서비스 설정을 불러올 수 없습니다.</p>
      ) : (
        <>
          {/* 서비스 기본 설정 */}
          <section className="admin-section">
            <h2 className="admin-section-title">
              {config.label} — {config.title}
            </h2>

            <form action={updateServiceConfig} className="admin-form">
              <input type="hidden" name="service_id" value={config.service_id} />

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label>
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={config.is_active}
                    style={{ marginRight: 6 }}
                  />
                  서비스 활성화
                </label>
                <AdminBadge variant={config.is_active ? "ok" : "muted"}>
                  {config.is_active ? "활성" : "비활성"}
                </AdminBadge>
              </div>

              <div>
                <label>연동 모델</label>
                <input
                  name="model"
                  type="text"
                  defaultValue={config.model}
                  required
                  style={{ fontFamily: "monospace", fontSize: 13 }}
                />
              </div>

              <div>
                <label>모델 옵션 (JSON)</label>
                <textarea
                  name="model_options"
                  rows={4}
                  defaultValue={JSON.stringify(config.model_options, null, 2)}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </div>

              <div>
                <label>예상 소요 시간 (초)</label>
                <input
                  name="estimate_sec"
                  type="number"
                  defaultValue={config.estimate_sec}
                  min={5}
                  max={600}
                  style={{ width: 120 }}
                />
              </div>

              {/* 서비스2, 3만 default_prompt 표시 */}
              {(config.service_id === "watercolor-illustration" ||
                config.service_id === "webtoon") && (
                <div>
                  <label>기본 프롬프트</label>
                  <textarea
                    name="default_prompt"
                    rows={8}
                    defaultValue={config.default_prompt}
                    placeholder="fal.ai에 전달할 프롬프트"
                  />
                </div>
              )}

              <button type="submit" className="admin-btn">
                저장
              </button>
            </form>
          </section>

          {/* 서비스3 말풍선 텍스트 프리셋 */}
          {config.service_id === "webtoon" && (
            <section className="admin-section">
              <h2 className="admin-section-title">말풍선 텍스트 옵션</h2>

              <AdminTable>
                <thead>
                  <tr>
                    <th>레이블</th>
                    <th>값</th>
                    <th>순서</th>
                    <th>상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {configPresets.map((p) => (
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td style={{ fontStyle: "italic" }}>{p.value}</td>
                      <td>{p.sort_order}</td>
                      <td>
                        <AdminBadge variant={p.is_active ? "ok" : "muted"}>
                          {p.is_active ? "활성" : "비활성"}
                        </AdminBadge>
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <form action={togglePreset}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="next" value={String(!p.is_active)} />
                          <button type="submit" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }}>
                            {p.is_active ? "비활성화" : "활성화"}
                          </button>
                        </form>
                        <form action={deletePreset}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="service_id" value={config.service_id} />
                          <button type="submit" className="admin-btn admin-btn--danger" style={{ fontSize: 12 }}>
                            삭제
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {configPresets.length === 0 && (
                    <tr>
                      <td colSpan={5}>등록된 옵션이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </AdminTable>

              {/* 프리셋 추가 */}
              <form action={createPreset} className="admin-form" style={{ marginTop: 16 }}>
                <input type="hidden" name="service_id" value={config.service_id} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, alignItems: "end" }}>
                  <div>
                    <label>레이블</label>
                    <input name="label" type="text" required placeholder="We&apos;re Getting Married" />
                  </div>
                  <div>
                    <label>값 (동일하게)</label>
                    <input name="value" type="text" required placeholder="We&apos;re Getting Married" />
                  </div>
                  <div>
                    <label>순서</label>
                    <input name="sort_order" type="number" defaultValue={0} style={{ width: 80 }} />
                  </div>
                  <button type="submit" className="admin-btn" style={{ alignSelf: "flex-end" }}>
                    추가
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* 서비스4 배경 스타일 */}
          {config.service_id === "bg-change" && (
            <section className="admin-section">
              <h2 className="admin-section-title">
                배경 스타일 목록
                <Link
                  href="/admin/premium/bg-styles/new"
                  className="admin-btn"
                  style={{ fontSize: 13, marginLeft: 16 }}
                >
                  + 배경 추가
                </Link>
              </h2>

              <AdminTable>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>레이블</th>
                    <th>Seed</th>
                    <th>미리보기</th>
                    <th>순서</th>
                    <th>상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {(bgStyles ?? []).map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.id}</td>
                      <td>{s.label}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.seed ?? "-"}</td>
                      <td>
                        {s.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.image_url}
                            alt={s.label}
                            style={{ width: 48, height: 72, objectFit: "cover", borderRadius: 4 }}
                          />
                        )}
                      </td>
                      <td>{s.sort_order}</td>
                      <td>
                        <AdminBadge variant={s.is_active ? "ok" : "muted"}>
                          {s.is_active ? "활성" : "비활성"}
                        </AdminBadge>
                      </td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <Link
                          href={`/admin/premium/bg-styles/${s.id}/edit`}
                          className="admin-btn admin-btn--ghost"
                          style={{ fontSize: 12 }}
                        >
                          수정
                        </Link>
                        <form action={deleteBgStyle}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="admin-btn admin-btn--danger" style={{ fontSize: 12 }}>
                            삭제
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {(bgStyles ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7}>등록된 배경 스타일이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </AdminTable>
            </section>
          )}
        </>
      )}
    </>
  );
}
