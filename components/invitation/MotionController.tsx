"use client";
import { useEffect, useRef } from "react";
import type { MotionId } from "@/lib/invitation/types";

export function MotionController({ motion }: { motion: MotionId }) {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const container = anchor.closest("[data-motion]") as HTMLElement | null;
    if (!container) return;

    let animId: number | null = null;
    let burstInterval: ReturnType<typeof setInterval> | null = null;
    let obs: IntersectionObserver | null = null;

    const stopCanvas = () => {
      if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
      if (burstInterval !== null) { clearInterval(burstInterval); burstInterval = null; }
      container.querySelector("#petalCanvas")?.remove();
    };

    const mkCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; W: number; H: number } | null => {
      const cover = container.querySelector<HTMLElement>(".inv-cover");
      if (!cover) return null;
      const canvas = document.createElement("canvas");
      canvas.id = "petalCanvas";
      cover.appendChild(canvas);
      canvas.width = cover.offsetWidth || 390;
      canvas.height = cover.offsetHeight || 560;
      const ctx = canvas.getContext("2d");
      if (!ctx) { canvas.remove(); return null; }
      return { canvas, ctx, W: canvas.width, H: canvas.height };
    };

    // ── Reset ────────────────────────────────────────────────────
    stopCanvas();
    container.querySelectorAll<HTMLElement>(".motion-in").forEach(el => {
      el.classList.remove("motion-in");
      el.style.transitionDelay = "";
    });
    const cover = container.querySelector<HTMLElement>(".inv-cover");
    if (cover) cover.classList.add("motion-in");

    // ── Canvas effects ───────────────────────────────────────────

    if (motion === "soft") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const petals = Array.from({ length: 22 }, () => ({
          x: Math.random() * W, y: Math.random() * H * 1.5 - H * 0.5,
          rx: Math.random() * 10 + 6, ry: Math.random() * 5.5 + 3.5,
          rot: Math.random() * Math.PI * 2, drot: (Math.random() - 0.5) * 0.025,
          vy: Math.random() * 0.7 + 0.3, vx: (Math.random() - 0.5) * 0.35,
          alpha: Math.random() * 0.4 + 0.15, hue: Math.random() * 30 + 335,
          phase: Math.random() * Math.PI * 2,
        }));
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          petals.forEach(p => {
            ctx.save(); ctx.globalAlpha = p.alpha;
            ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = `hsl(${p.hue},75%,78%)`;
            ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            p.y += p.vy; p.x += p.vx + Math.sin(p.y * 0.014 + p.phase) * 0.35; p.rot += p.drot;
            if (p.y > H + 15) { p.y = -15; p.x = Math.random() * W; }
          });
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "vivid") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const HUES = [0, 30, 55, 180, 270, 330];
        const floaters: { x: number; y: number; vx: number; vy: number; size: number; hue: number; phase: number; age: number; trail: { x: number; y: number }[] }[] = [];
        const bursts: { x: number; y: number; vx: number; vy: number; size: number; life: number; decay: number; hue: number; glow?: boolean; star?: boolean }[] = [];

        const starPath = (cx: number, cy: number, rad: number) => {
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2, r2 = i % 2 === 0 ? rad : rad * 0.35;
            i === 0 ? ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
                    : ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
          }
          ctx.closePath();
        };

        const spawnFloater = () => {
          const angle = Math.random() * Math.PI * 2, spd = Math.random() * 2.5 + 2.0;
          floaters.push({ x: Math.random() * W, y: Math.random() * H, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, size: Math.random() * 3 + 4, hue: HUES[Math.floor(Math.random() * HUES.length)], phase: Math.random() * Math.PI * 2, age: 0, trail: [] });
        };

        const explode = (x: number, y: number) => {
          const hue = HUES[Math.floor(Math.random() * HUES.length)];
          bursts.push({ x, y, vx: 0, vy: 0, size: 52, life: 1, decay: 0.055, hue, glow: true });
          bursts.push({ x, y, vx: 0, vy: 0, size: 30, life: 1, decay: 0.07, hue: (hue + 40) % 360, glow: true });
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2, spd = Math.random() * 4.5 + 2;
            bursts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - Math.random() * 1.5, size: Math.random() * 5 + 3.5, life: 1, decay: Math.random() * 0.022 + 0.016, hue: hue + Math.random() * 40 - 20, star: true });
          }
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2, spd = Math.random() * 6 + 3;
            bursts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, size: Math.random() * 3 + 1.5, life: 1, decay: Math.random() * 0.03 + 0.02, hue: hue + Math.random() * 60 - 30, star: false });
          }
        };

        for (let i = 0; i < 8; i++) spawnFloater();
        burstInterval = setInterval(() => {
          if (!document.getElementById("petalCanvas")) { clearInterval(burstInterval!); return; }
          explode(Math.random() * W * 0.75 + W * 0.12, Math.random() * H * 0.7 + H * 0.08);
          if (floaters.length < 10) spawnFloater();
        }, 1000);
        setTimeout(() => explode(W / 2, H * 0.35), 300);

        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          floaters.forEach(f => {
            try {
              f.trail.push({ x: f.x, y: f.y });
              if (f.trail.length > 10) f.trail.shift();
              f.trail.forEach((pt, idx) => {
                const a = Math.max(0, (idx / f.trail.length) * 0.5);
                const rr = Math.max(0.1, f.size * (idx / f.trail.length) * 0.4);
                ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = `hsl(${f.hue},85%,85%)`;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
              });
              const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(f.age * 0.08 + f.phase));
              const sz = Math.max(1, f.size * tw);
              ctx.save();
              ctx.globalAlpha = Math.max(0, Math.min(1, tw * 0.45));
              const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, sz * 3.5);
              g.addColorStop(0, `hsl(${f.hue},90%,88%)`); g.addColorStop(1, `hsla(${f.hue},90%,88%,0)`);
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, sz * 3.5, 0, Math.PI * 2); ctx.fill();
              ctx.globalAlpha = Math.max(0, Math.min(1, tw));
              ctx.fillStyle = `hsl(${f.hue},92%,94%)`; starPath(f.x, f.y, sz); ctx.fill();
              ctx.globalAlpha = Math.max(0, Math.min(1, tw * 0.8));
              ctx.strokeStyle = `hsl(${f.hue},80%,97%)`; ctx.lineWidth = 1.5;
              const cl = sz * 5.5;
              ctx.beginPath(); ctx.moveTo(f.x - cl, f.y); ctx.lineTo(f.x + cl, f.y);
              ctx.moveTo(f.x, f.y - cl); ctx.lineTo(f.x, f.y + cl); ctx.stroke();
              ctx.globalAlpha = Math.max(0, Math.min(1, tw * 0.38));
              const dl = sz * 3;
              ctx.beginPath(); ctx.moveTo(f.x - dl, f.y - dl); ctx.lineTo(f.x + dl, f.y + dl);
              ctx.moveTo(f.x + dl, f.y - dl); ctx.lineTo(f.x - dl, f.y + dl); ctx.stroke();
              ctx.restore();
            } catch { /* ignore */ }
            f.x += f.vx; f.y += f.vy; f.age++;
            f.vx += Math.sin(f.age * 0.05 + f.phase) * 0.04; f.vy += Math.cos(f.age * 0.04 + f.phase) * 0.04;
            const spd = Math.hypot(f.vx, f.vy) || 0.001;
            if (spd > 4.5) { f.vx = f.vx / spd * 4.5; f.vy = f.vy / spd * 4.5; }
            else if (spd < 1.5) { f.vx = f.vx / spd * 1.5; f.vy = f.vy / spd * 1.5; }
            if (f.x < 8 || f.x > W - 8) f.vx *= -1;
            if (f.y < 8 || f.y > H - 8) f.vy *= -1;
          });
          for (let i = bursts.length - 1; i >= 0; i--) {
            const p = bursts[i];
            ctx.save();
            if (p.glow) {
              ctx.globalAlpha = p.life * 0.7;
              const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * p.life);
              g.addColorStop(0, `hsla(${p.hue},92%,97%,1)`); g.addColorStop(0.4, `hsla(${p.hue},88%,80%,0.6)`); g.addColorStop(1, `hsla(${p.hue},88%,80%,0)`);
              ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
            } else {
              ctx.globalAlpha = p.life; ctx.translate(p.x, p.y); ctx.fillStyle = `hsl(${p.hue},88%,78%)`;
              if (p.star) { starPath(0, 0, p.size); ctx.fill(); }
              else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2); ctx.fill(); }
            }
            ctx.restore();
            if (!p.glow) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.97; }
            p.life -= p.decay;
            if (p.life <= 0) bursts.splice(i, 1);
          }
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "lovely") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const heartPath = (cx: number, cy: number, rad: number) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy + rad * 0.6);
          ctx.bezierCurveTo(cx - rad * 2, cy + rad * 0.3, cx - rad * 2, cy - rad * 1.2, cx, cy - rad * 0.4);
          ctx.bezierCurveTo(cx + rad * 2, cy - rad * 1.2, cx + rad * 2, cy + rad * 0.3, cx, cy + rad * 0.6);
          ctx.closePath();
        };
        const beatScale = (age: number) => {
          const t = (age % 48) / 48;
          if (t < 0.08) return 1 + 0.35 * Math.sin((t / 0.08) * Math.PI);
          if (t < 0.18) return 1;
          if (t < 0.26) return 1 + 0.2 * Math.sin(((t - 0.18) / 0.08) * Math.PI);
          return 1;
        };
        const hearts = Array.from({ length: 8 }, (_, i) => ({
          x: Math.random() * W, y: i < 5 ? Math.random() * H : H + 15 + Math.random() * 60,
          vy: -(Math.random() * 0.5 + 0.3), vx: (Math.random() - 0.5) * 0.3,
          r: Math.random() > 0.45 ? Math.random() * 8 + 12 : Math.random() * 4 + 5,
          hue: Math.random() * 20 + 335, sat: 80 + Math.random() * 15, lit: 65 + Math.random() * 15,
          alpha: 0.55 + Math.random() * 0.35, age: Math.floor(Math.random() * 48),
          phase: Math.random() * Math.PI * 2, stringLen: Math.random() * 24 + 28,
        }));
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          hearts.forEach(h => {
            const bs = beatScale(h.age), rad = h.r * bs;
            const sway = Math.sin(h.age * 0.04 + h.phase) * rad * 0.4;
            ctx.save();
            ctx.globalAlpha = h.alpha * 0.5;
            ctx.strokeStyle = `hsl(${h.hue},60%,75%)`; ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(h.x, h.y + rad * 0.65);
            ctx.quadraticCurveTo(h.x + sway, h.y + rad * 0.65 + h.stringLen * 0.55, h.x + sway * 2, h.y + rad * 0.65 + h.stringLen);
            ctx.stroke();
            ctx.globalAlpha = h.alpha * 0.28;
            const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, rad * 2.5);
            g.addColorStop(0, `hsl(${h.hue},${h.sat}%,${h.lit}%)`); g.addColorStop(1, `hsla(${h.hue},${h.sat}%,${h.lit}%,0)`);
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h.x, h.y, rad * 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = h.alpha; ctx.fillStyle = `hsl(${h.hue},${h.sat}%,${h.lit}%)`;
            heartPath(h.x, h.y, rad); ctx.fill();
            ctx.globalAlpha = h.alpha * 0.6; ctx.fillStyle = "#fff";
            ctx.beginPath(); ctx.arc(h.x - rad * 0.52, h.y - rad * 0.18, rad * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            h.x += h.vx + Math.sin(h.age * 0.035 + h.phase) * 0.3; h.y += h.vy; h.age++;
            if (h.y < -60) { h.y = H + 30 + Math.random() * 80; h.x = Math.random() * W; }
          });
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "bubble") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        type Bubble = { x: number; y: number; r: number; vy: number; vx: number; alpha: number; phase: number; age: number; popping: boolean; popScale: number; popAlpha: number };
        const mkBubble = (startY?: number): Bubble => ({
          x: Math.random() * W * 0.85 + W * 0.07,
          y: startY !== undefined ? startY : H + 15 + Math.random() * 80,
          r: Math.random() * 18 + 8, vy: -(Math.random() * 0.8 + 0.4), vx: (Math.random() - 0.5) * 0.35,
          alpha: Math.random() * 0.35 + 0.35, phase: Math.random() * Math.PI * 2, age: 0,
          popping: false, popScale: 1, popAlpha: 1,
        });
        const bubbles: Bubble[] = Array.from({ length: 10 }, (_, i) => mkBubble(H * (0.1 + i * 0.09)));
        const drawBubble = (b: Bubble) => {
          const rad = b.r * (b.popping ? b.popScale : 1), a = b.alpha * (b.popping ? b.popAlpha : 1);
          ctx.save(); ctx.globalAlpha = Math.max(0, a);
          ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(b.x - rad * 0.3, b.y - rad * 0.3, rad * 0.05, b.x, b.y, rad);
          grad.addColorStop(0, "rgba(255,255,255,0.55)"); grad.addColorStop(0.4, "rgba(200,230,255,0.18)"); grad.addColorStop(1, "rgba(140,200,255,0.10)");
          ctx.fillStyle = grad; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(180,220,255,0.55)"; ctx.lineWidth = 0.9; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(b.x - rad * 0.32, b.y - rad * 0.3, rad * 0.22, rad * 0.14, -0.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill();
          if (b.popping && b.popScale > 1.1) {
            for (let i = 0; i < 6; i++) {
              const a2 = (i / 6) * Math.PI * 2, dist = rad * (b.popScale - 1) * 2.5;
              ctx.beginPath(); ctx.arc(b.x + Math.cos(a2) * dist, b.y + Math.sin(a2) * dist, rad * 0.12, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(180,220,255,${0.6 * b.popAlpha})`; ctx.fill();
            }
          }
          ctx.restore();
        };
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            if (b.popping) {
              b.popScale += 0.08; b.popAlpha -= 0.07;
              if (b.popAlpha <= 0) { bubbles.splice(i, 1); bubbles.push(mkBubble()); }
            } else {
              b.x += b.vx + Math.sin(b.age * 0.035 + b.phase) * 0.4; b.y += b.vy; b.age++;
              if (b.y < -b.r || (b.age > 200 && Math.random() < 0.012)) b.popping = true;
            }
            drawBubble(b);
          }
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "snow") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const drawSnowflake = (x: number, y: number, rad: number, rot: number, alpha: number) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
          ctx.strokeStyle = "rgba(220,235,255,0.9)"; ctx.lineWidth = Math.max(0.6, rad * 0.13); ctx.lineCap = "round";
          for (let i = 0; i < 6; i++) {
            ctx.save(); ctx.rotate((i / 6) * Math.PI * 2);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, rad); ctx.stroke();
            ([[rad * 0.38, rad * 0.56], [rad * 0.62, rad * 0.8]] as [number, number][]).forEach(([s, e]) => {
              ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(rad * 0.22, e); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(-rad * 0.22, e); ctx.stroke();
            });
            ctx.restore();
          }
          ctx.beginPath(); ctx.arc(0, 0, rad * 0.1, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(220,235,255,0.9)"; ctx.fill(); ctx.restore();
        };
        const mkFlake = (startY?: number) => ({
          x: Math.random() * W, y: startY !== undefined ? startY : -10 - Math.random() * 100,
          r: Math.random() * 9 + 4, vy: Math.random() * 0.9 + 0.4, vx: (Math.random() - 0.5) * 0.3,
          rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.015,
          alpha: Math.random() * 0.45 + 0.35, phase: Math.random() * Math.PI * 2, age: 0,
        });
        const flakes = Array.from({ length: 18 }, () => mkFlake(Math.random() * H));
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          flakes.forEach(f => {
            drawSnowflake(f.x, f.y, f.r, f.rot, f.alpha);
            f.x += f.vx + Math.sin(f.age * 0.03 + f.phase) * 0.45; f.y += f.vy; f.rot += f.rotV; f.age++;
            if (f.y > H + 15) Object.assign(f, mkFlake());
          });
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "autumn") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const COLORS = [{ h: 5, s: 85, l: 50 }, { h: 15, s: 90, l: 53 }, { h: 25, s: 92, l: 56 }, { h: 38, s: 88, l: 57 }, { h: 48, s: 82, l: 60 }, { h: 28, s: 62, l: 42 }];
        const drawLeaf = (x: number, y: number, rad: number, rot: number, c: { h: number; s: number; l: number }, flip: boolean) => {
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot); if (flip) ctx.scale(-1, 1);
          ctx.beginPath();
          ctx.moveTo(0, rad * 0.6);
          ctx.bezierCurveTo(-rad * 0.12, rad * 0.35, -rad * 0.65, rad * 0.5, -rad * 0.62, rad * 0.1);
          ctx.bezierCurveTo(-rad * 0.92, rad * 0.18, -rad * 1.0, -rad * 0.22, -rad * 0.52, -rad * 0.12);
          ctx.bezierCurveTo(-rad * 0.68, -rad * 0.48, -rad * 0.38, -rad * 0.72, -rad * 0.14, -rad * 0.58);
          ctx.bezierCurveTo(-rad * 0.28, -rad * 0.88, -rad * 0.08, -rad * 1.0, 0, -rad * 0.72);
          ctx.bezierCurveTo(rad * 0.08, -rad * 1.0, rad * 0.28, -rad * 0.88, rad * 0.14, -rad * 0.58);
          ctx.bezierCurveTo(rad * 0.38, -rad * 0.72, rad * 0.68, -rad * 0.48, rad * 0.52, -rad * 0.12);
          ctx.bezierCurveTo(rad * 1.0, -rad * 0.22, rad * 0.92, rad * 0.18, rad * 0.62, rad * 0.1);
          ctx.bezierCurveTo(rad * 0.65, rad * 0.5, rad * 0.12, rad * 0.35, 0, rad * 0.6);
          ctx.closePath();
          ctx.fillStyle = `hsl(${c.h},${c.s}%,${c.l}%)`; ctx.fill();
          ctx.strokeStyle = `hsla(${c.h - 5},55%,${c.l - 12}%,0.55)`; ctx.lineWidth = rad * 0.07; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(0, rad * 0.6); ctx.lineTo(0, -rad * 0.65); ctx.stroke();
          ctx.strokeStyle = "hsl(28,50%,35%)"; ctx.lineWidth = rad * 0.09;
          ctx.beginPath(); ctx.moveTo(0, rad * 0.6); ctx.lineTo(0, rad * 0.95); ctx.stroke();
          ctx.restore();
        };
        const mkLeaf = (spreadY?: number) => {
          const c = COLORS[Math.floor(Math.random() * COLORS.length)];
          return { x: Math.random() * W, y: spreadY !== undefined ? spreadY : -15 - Math.random() * 60, r: Math.random() * 9 + 8, vy: Math.random() * 1.1 + 0.5, vx: (Math.random() - 0.5) * 0.55, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.045, phase: Math.random() * Math.PI * 2, age: 0, c, flip: Math.random() > 0.5, alpha: 0.78 + Math.random() * 0.18 };
        };
        const leaves = Array.from({ length: 14 }, (_, i) => mkLeaf(i < 10 ? Math.random() * H : undefined));
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          leaves.forEach(lf => {
            ctx.save(); ctx.globalAlpha = lf.alpha;
            drawLeaf(lf.x, lf.y, lf.r, lf.rot, lf.c, lf.flip);
            ctx.restore();
            lf.x += lf.vx + Math.sin(lf.age * 0.038 + lf.phase) * 0.65; lf.y += lf.vy; lf.rot += lf.rotV; lf.age++;
            if (lf.y > H + 25) Object.assign(lf, mkLeaf());
          });
          animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    if (motion === "summer") {
      const r = mkCanvas();
      if (r) {
        const { ctx, W, H } = r;
        const WAVE_H = 55, BASE_Y = H - WAVE_H;
        let t = 0;
        const tick = () => {
          ctx.clearRect(0, 0, W, H);
          ctx.save();
          ctx.beginPath(); ctx.rect(0, BASE_Y - 22, W, WAVE_H + 22); ctx.clip();
          const WL = W * 1.3, AMP = 14, SPD = 0.009;
          ctx.fillStyle = "rgba(40,145,205,0.6)";
          ctx.beginPath(); ctx.moveTo(-2, H); ctx.lineTo(-2, BASE_Y + AMP);
          for (let x = 0; x <= W + 2; x += 3) {
            const y = BASE_Y + Math.sin((x / WL) * Math.PI * 2 - t * SPD) * AMP;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(W + 2, H); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.0; ctx.lineCap = "round";
          ctx.beginPath();
          for (let x = 0; x <= W; x += 3) {
            const y = BASE_Y + Math.sin((x / WL) * Math.PI * 2 - t * SPD) * AMP;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
          const fadeG = ctx.createLinearGradient(0, BASE_Y - 22, 0, BASE_Y + 5);
          fadeG.addColorStop(0, "rgba(0,0,0,0)"); fadeG.addColorStop(1, "rgba(40,145,205,0)");
          ctx.globalAlpha = 1; ctx.fillStyle = fadeG; ctx.fillRect(0, BASE_Y - 22, W, 27);
          ctx.restore();
          t++; animId = requestAnimationFrame(tick);
        };
        tick();
      }
    }

    // ── IntersectionObserver ─────────────────────────────────────
    if (motion !== "still") {
      const scrollRoot = container.closest<HTMLElement>(".device-inner");
      obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          if (motion === "vivid") {
            const idx = [...container.querySelectorAll(".inv-section")].indexOf(el);
            el.style.transitionDelay = `${idx * 0.04}s`;
          }
          el.classList.add("motion-in");
          obs?.unobserve(el);
        });
      }, { root: scrollRoot, threshold: 0.12 });
      container.querySelectorAll(".inv-section").forEach(el => obs!.observe(el));
    }

    return () => {
      obs?.disconnect();
      stopCanvas();
    };
  }, [motion]);

  return <span ref={anchorRef} style={{ display: "none" }} aria-hidden />;
}
