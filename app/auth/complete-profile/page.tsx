import { redirect } from "next/navigation";
import { getMyProfile } from "@/lib/supabase/profile-actions";
import { isPlaceholderEmail } from "@/lib/supabase/profile-utils";
import { PcHeader } from "@/components/pc/PcHeader";
import { CompleteProfileForm } from "./CompleteProfileForm";

export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const profile = await getMyProfile();
  if (!profile) redirect("/login");

  const { next } = await searchParams;
  const nextPath = next || "/";

  const providerLabel =
    profile.provider === "kakao" ? "카카오" :
    profile.provider === "naver" ? "네이버" : "간편";

  const isEdit = !!profile.onboarding_done;

  return (
    <>
      <PcHeader />
      <main className="login-page">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <p
            className="login-logo"
            style={{ fontFamily: "inherit", fontSize: 20, fontWeight: 700, letterSpacing: "0.08em" }}
          >
            STORY<em>CARD</em>
          </p>
          <p className="login-subtitle">{isEdit ? "회원정보 수정" : `${providerLabel} 로그인 회원가입`}</p>
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-soft)",
              marginBottom: 20,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {isEdit
              ? "회원정보를 확인하고 수정할 수 있습니다."
              : "서비스 이용을 위해 아래 필수 정보를 입력해주세요."}
          </p>
          <CompleteProfileForm
            nextPath={nextPath}
            defaultName={profile.nickname ?? ""}
            defaultEmail={isPlaceholderEmail(profile.authEmail) ? "" : (profile.authEmail ?? profile.email ?? "")}
            defaultPhone={profile.phone ?? ""}
            defaultAddress={profile.shipping_address ?? ""}
            defaultAddressDetail={profile.shipping_detail ?? ""}
            defaultReceiverName={profile.receiver_name ?? ""}
            provider={profile.provider ?? ""}
            isEdit={isEdit}
          />
        </div>
      </main>
    </>
  );
}
