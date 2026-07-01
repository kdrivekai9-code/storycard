import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { uploadBgmTrack, deleteBgmTrack } from "./actions";

export default async function AdminBgmPage() {
  const supabase = await createClient();

  const { data: tracks } = await supabase
    .from("bgm_tracks")
    .select("id, title, storage_path, sort_order, created_at")
    .order("sort_order", { ascending: true });

  const publicUrl = (path: string) =>
    supabase.storage.from("bgm-tracks").getPublicUrl(path).data.publicUrl;

  return (
    <>
      <AdminPageHeader
        title="배경음악 관리"
        description="프리미엄 영상 제작 시 사용자가 선택할 배경음악(mp3)을 등록·관리합니다."
      />

      <section className="admin-section">
        <h2 className="admin-section-title">배경음악 추가</h2>
        <form action={uploadBgmTrack} className="admin-form">
          <div>
            <label htmlFor="bgm-title">제목</label>
            <input id="bgm-title" name="title" type="text" required placeholder="예: 잔잔한 피아노" />
          </div>
          <div>
            <label htmlFor="bgm-file">음원 파일 (mp3)</label>
            <input id="bgm-file" name="file" type="file" accept="audio/*" required />
          </div>
          <div>
            <label htmlFor="bgm-sort">순서</label>
            <input id="bgm-sort" name="sort_order" type="number" defaultValue={0} />
          </div>
          <button type="submit" className="admin-btn">
            등록
          </button>
        </form>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">등록된 배경음악</h2>
        <AdminTable>
          <thead>
            <tr>
              <th>제목</th>
              <th>미리듣기</th>
              <th>순서</th>
              <th>등록일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {(tracks ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>
                  <audio controls preload="none" style={{ height: 32, width: 220 }}>
                    <source src={publicUrl(t.storage_path)} />
                  </audio>
                </td>
                <td>{t.sort_order}</td>
                <td>{new Date(t.created_at).toLocaleDateString("ko-KR")}</td>
                <td>
                  <form action={deleteBgmTrack}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="storage_path" value={t.storage_path} />
                    <button type="submit" className="admin-btn admin-btn--danger">
                      삭제
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(tracks ?? []).length === 0 && (
              <tr>
                <td colSpan={5}>등록된 배경음악이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
