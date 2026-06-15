import { PcHeader } from "./PcHeader";
import { PcHero } from "./PcHero";
import { PcLiveEditor } from "./PcLiveEditor";
import { PcSamples } from "./PcSamples";
import { PcPremium } from "./PcPremium";
import { PcPublish } from "./PcPublish";
import { PcFooter } from "./PcFooter";
import { PcEmulator } from "./PcEmulator";

export function PcMaster() {
  return (
    <>
      <PcHeader />
      <PcHero />
      <div className="pc-grid">
        <main className="pc-main">
          <PcLiveEditor />
          <PcSamples />
          <PcPremium />
          <PcPublish />
          <PcFooter />
        </main>
        <PcEmulator />
      </div>
    </>
  );
}
