import type { UserData } from "@/lib/invitation/types";

export function AccountSection({ userData }: { userData: UserData }) {
  return (
    <section className="inv-section" data-section="account">
      <div className="eyebrow">Heart to Heart</div>
      <h2 className="heading">마음 전하실 곳</h2>
      <div className="acc-list">
        <div className="acc">
          <div className="left">
            <div className="who">신랑측</div>
            <div className="name">{userData.groom}</div>
            <div className="num">국민 123-456-789012</div>
          </div>
          <button className="copy" type="button">
            복사
          </button>
        </div>
        <div className="acc">
          <div className="left">
            <div className="who">신부측</div>
            <div className="name">{userData.bride}</div>
            <div className="num">신한 110-987-654321</div>
          </div>
          <button className="copy" type="button">
            복사
          </button>
        </div>
      </div>
    </section>
  );
}
