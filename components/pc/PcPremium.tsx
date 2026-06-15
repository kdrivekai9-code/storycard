export function PcPremium() {
  return (
    <section className="pc-section" id="sec-premium">
      <span className="step-num">PREMIUM UPGRADE</span>
      <h2 className="h">
        한 번뿐인 하루를 <em>더 닮게.</em>
      </h2>
      <p className="desc">사진을 영상으로, 디자이너의 손길로, 한정 폰트로. 프리미엄에서만 가능한 것들입니다.</p>

      <div className="pc-upgrade">
        <span className="badge">PREMIUM</span>
        <h3>
          <em>Bloom</em> Premium 으로 업그레이드
        </h3>
        <p style={{ color: "rgba(246,242,234,0.66)", fontSize: "13px", lineHeight: 1.7, maxWidth: "480px", margin: "8px 0 0" }}>
          지금 만든 청첩장을 그대로 가져가서, 영상·시안·한정 폰트를 더할 수 있습니다.
        </p>
        <div className="row">
          <div className="item">
            <div className="n">AI VIDEO</div>
            <div className="t">사진 → 1분 영상 청첩장</div>
            <div className="d">스튜디오 사진을 올리면 AI가 톤·움직임을 분석해 60초 영상으로 만듭니다.</div>
          </div>
          <div className="item">
            <div className="n">DESIGNER</div>
            <div className="t">디자이너 1:1 컨설팅</div>
            <div className="d">전문 디자이너가 시안 3안을 제안하고 마지막까지 손봐드립니다.</div>
          </div>
          <div className="item">
            <div className="n">EXCLUSIVE</div>
            <div className="t">한정 템플릿 · 폰트</div>
            <div className="d">프리미엄 전용 시즈널 템플릿과 한정 폰트 라이선스를 사용합니다.</div>
          </div>
        </div>
        <button className="upbtn" type="button">
          프리미엄 자세히 보기 →
        </button>
      </div>
    </section>
  );
}
