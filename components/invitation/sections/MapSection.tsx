import type { UserData } from "@/lib/invitation/types";

export function MapSection({ userData }: { userData: UserData }) {
  return (
    <section className="inv-section" data-section="map">
      <div className="eyebrow">Location</div>
      <h2 className="heading">오시는 길</h2>
      <div className="map-wrap">
        <svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <rect width="400" height="240" fill="#efe8db" />
          <path d="M 0 80 L 400 100" stroke="#fff" strokeWidth="20" />
          <path d="M 100 0 L 130 240" stroke="#fff" strokeWidth="14" />
          <path d="M 260 0 L 280 240" stroke="#fff" strokeWidth="10" />
          <path d="M 0 180 L 400 190" stroke="#fff" strokeWidth="14" />
          <rect x="20" y="110" width="70" height="55" fill="#d8d0c0" opacity="0.5" />
          <rect x="150" y="115" width="90" height="50" fill="#d8d0c0" opacity="0.5" />
          <rect x="290" y="120" width="80" height="55" fill="#d8d0c0" opacity="0.5" />
          <rect x="40" y="20" width="50" height="50" fill="#c8c0b0" opacity="0.6" />
          <rect x="160" y="20" width="80" height="50" fill="#c8c0b0" opacity="0.6" />
          <rect x="295" y="20" width="80" height="50" fill="#c8c0b0" opacity="0.6" />
        </svg>
        <div className="map-pin">
          <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M 12 0 C 5.4 0, 0 5.4, 0 12 C 0 21, 12 32, 12 32 C 12 32, 24 21, 24 12 C 24 5.4, 18.6 0, 12 0 Z"
              fill="#1a1a1a"
            />
            <circle cx="12" cy="12" r="4" fill="#fff" />
          </svg>
        </div>
      </div>
      <div className="map-info">
        <strong>{userData.venue}</strong>
        <br />
        <span className="addr">{userData.address}</span>
      </div>
      <div className="map-actions">
        <button type="button">카카오맵</button>
        <button type="button">네이버지도</button>
        <button type="button">티맵</button>
      </div>
    </section>
  );
}
