"use client";

import type { MotionId } from "@/lib/invitation/types";

interface ParticleConfig {
  count: number;
  rise: boolean;
  shape: "circle" | "heart" | "leaf" | "bubble" | "dot";
  opacity: number;
}

const CONFIGS: Partial<Record<MotionId, ParticleConfig>> = {
  vivid:  { count: 18, rise: false, shape: "dot",    opacity: 0.65 },
  lovely: { count: 14, rise: false, shape: "heart",  opacity: 0.55 },
  bubble: { count: 14, rise: true,  shape: "bubble", opacity: 0.30 },
  snow:   { count: 20, rise: false, shape: "circle", opacity: 0.75 },
  autumn: { count: 14, rise: false, shape: "leaf",   opacity: 0.60 },
  summer: { count: 10, rise: true,  shape: "bubble", opacity: 0.35 },
};

function det(seed: number, mod: number, base: number): number {
  return ((seed * 97 + 13) % mod) + base;
}

export function MotionOverlay({ motion }: { motion: MotionId }) {
  const cfg = CONFIGS[motion];
  if (!cfg) return null;

  return (
    <div className="motion-overlay" aria-hidden="true">
      {Array.from({ length: cfg.count }, (_, i) => {
        const left  = det(i * 3 + 1, 90, 5);
        const delay = det(i * 7, 40, 0) / 10;
        const dur   = det(i * 5 + 2, 25, 25) / 10;
        const size  = det(i * 11, 8, 8);
        const rot   = det(i * 13, 60, -30);

        return (
          <span
            key={i}
            className={`mp mp--${cfg.shape}${cfg.rise ? " mp--rise" : ""}`}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
              width:  `${size}px`,
              height: `${cfg.shape === "heart" ? Math.round(size * 0.85) : size}px`,
              opacity: cfg.opacity,
              "--rot": `${rot}deg`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
