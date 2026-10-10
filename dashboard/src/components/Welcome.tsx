import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { GridCell } from "../lib/data";

const LETTER_COLORS = ["#6da7ec", "#9085e9", "#e66767", "#f0b43c", "#2bd69c", "#d55181"];

/** Full-screen canvas: the real incident grid, coloured by dominant crime category, glowing around the cursor. */
function Field({ cells }: { cells: GridCell[] }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = cv.current!, g = el.getContext("2d")!;
    let w = 0, h = 0, raf = 0, mx = -999, my = -999, sx = -999, sy = -999;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fit = () => { const d = Math.min(2, devicePixelRatio || 1); w = el.clientWidth; h = el.clientHeight; el.width = w * d; el.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); };
    fit();
    const lat0 = cells.reduce((s, c) => s + c.lat, 0) / cells.length, k = Math.cos((lat0 * Math.PI) / 180);
    const xs = cells.map((c) => c.lon * k), ys = cells.map((c) => c.lat);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const vmax = Math.max(...cells.map((c) => c.crimes));
    const colour = (c: GridCell) => {
      const v = c.violent / c.crimes, p = c.property / c.crimes, o = c.other / c.crimes;
      return v > 0.36 ? "230,103,103" : p > 0.5 ? "144,133,233" : o > 0.32 ? "43,214,156" : c.arrests / c.crimes > 0.3 ? "240,180,60" : "109,167,236";
    };
    const cols = cells.map(colour);
    const pm = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; };
    addEventListener("resize", fit); addEventListener("pointermove", pm);
    const draw = (t: number) => {
      sx += (mx - sx) * 0.12; sy += (my - sy) * 0.12;
      g.clearRect(0, 0, w, h); g.globalCompositeOperation = "lighter";
      const side = Math.min(h * 1.05, w * 0.7);
      const s = Math.min(side / (x1 - x0), side / (y1 - y0));
      const ox = w * 0.5 - ((x1 - x0) * s) / 2, oy = h * 0.5 + ((y1 - y0) * s) / 2;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const x = ox + (c.lon * k - x0) * s, y = oy - (c.lat - y0) * s;
        const q = Math.sqrt(c.crimes / vmax);
        const dx = x - sx, dy = y - sy, d2 = dx * dx + dy * dy;
        const near = Math.max(0, 1 - Math.sqrt(d2) / 190);
        const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(t / 700 + i * 12.9898);
        const px = x + (near ? (dx / (Math.sqrt(d2) + 1)) * near * 14 : 0), py = y + (near ? (dy / (Math.sqrt(d2) + 1)) * near * 14 : 0);
        const r = 1.4 + q * 3.6 + near * 5;
        g.fillStyle = `rgba(${cols[i]},${Math.min(1, (0.16 + q * 0.7) * tw + near * 0.6)})`;
        g.beginPath(); g.arc(px, py, r, 0, 6.283); g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); removeEventListener("pointermove", pm); };
  }, [cells]);
  return <canvas ref={cv} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

/** Seeded RNG so the skyline is stable between renders. */
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** One parallax layer of a night skyline (two copies side by side so it scrolls seamlessly). */
function Skyline({ seed, h, fill, lit, speed, opacity }: { seed: number; h: number; fill: string; lit: number; speed: number; opacity: number }) {
  const W = 1600;
  const blds = useMemo(() => {
    const r = rng(seed), out: { x: number; w: number; h: number; win: { x: number; y: number; on: boolean }[] }[] = [];
    let x = 0;
    while (x < W) {
      const bw = 34 + r() * 70, bh = h * (0.25 + r() * 0.75), win: { x: number; y: number; on: boolean }[] = [];
      for (let wy = 14; wy < bh - 8; wy += 14) for (let wx = 8; wx < bw - 10; wx += 13) if (r() < lit) win.push({ x: wx, y: wy, on: r() < 0.55 });
      out.push({ x, w: bw, h: bh, win }); x += bw + r() * 6;
    }
    return out;
  }, [seed, h, lit]);
  // every lit window of a layer is ONE path (cheap); only a few "flicker" windows are animated
  const { dAll, flick } = useMemo(() => {
    const parts: string[] = [], fl: { x: number; y: number; k: number }[] = [];
    blds.forEach((b, i) => b.win.forEach((w, j) => {
      const x = b.x + w.x, y = h - b.h + w.y;
      if ((i * 7 + j) % 23 === 0 && fl.length < 14) fl.push({ x, y, k: fl.length % 3 });
      else if (w.on) parts.push(`M${x.toFixed(0)} ${y.toFixed(0)}h5v7h-5z`);
    }));
    return { dAll: parts.join(""), flick: fl };
  }, [blds, h]);
  const one = (
    <svg width={W} height={h} viewBox={`0 0 ${W} ${h}`} aria-hidden style={{ flex: "none" }}>
      <path d={blds.map((b) => `M${b.x.toFixed(0)} ${h}v${(-b.h).toFixed(0)}h${b.w.toFixed(0)}v${b.h.toFixed(0)}z`).join("")} fill={fill} />
      <path d={dAll} fill="#f5c518" opacity=".9" />
      {flick.map((f, i) => <rect key={i} x={f.x} y={f.y} width={5} height={7} className={`wn wn${f.k}`} fill="#f5c518" />)}
    </svg>
  );
  return <div className="sky" style={{ height: h, opacity, animationDuration: `${speed}s` }}>{one}{one}</div>;
}

function Tape({ text, className }: { text: string; className: string }) {
  const unit = `${text}  ✕  `.repeat(6);
  return <div className={`tape ${className}`} aria-hidden><div className="tape-run"><span>{unit}</span><span>{unit}</span></div></div>;
}

function Word({ text, offset = 0, delay = 0 }: { text: string; offset?: number; delay?: number }) {
  return (
    <span className="wl-word" aria-hidden>
      {[...text].map((ch, i) => (
        <motion.span key={i} className="wl-letter" style={{ color: LETTER_COLORS[(i + offset) % LETTER_COLORS.length] }}
          initial={{ y: "110%", opacity: 0, rotate: 8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.9, delay: delay + i * 0.045, ease: [0.2, 0.8, 0.2, 1] }}
          whileHover={{ y: -18, scale: 1.12, rotate: i % 2 ? 5 : -5, transition: { type: "spring", stiffness: 500, damping: 14 } }}>{ch}</motion.span>
      ))}
    </span>
  );
}

function Molecule() {
  const nodes = [[24, 8, "#6da7ec"], [40, 22, "#e66767"], [34, 42, "#2bd69c"], [14, 38, "#f0b43c"], [8, 20, "#9085e9"], [24, 25, "#fff"]] as const;
  const bonds = [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [0, 1], [2, 3], [4, 0]];
  return (
    <motion.svg width="46" height="46" viewBox="0 0 48 48" animate={{ rotate: 360 }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }} aria-hidden>
      {bonds.map(([a, b], i) => <line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="rgba(255,255,255,.35)" strokeWidth="1.4" />)}
      {nodes.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r={i === 5 ? 5 : 3.6} fill={c} />)}
    </motion.svg>
  );
}

export function Welcome({ cells, total, arrestRate, types, onEnter }: { cells: GridCell[]; total: string; arrestRate: string; types: string; onEnter: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEnter(); } };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onEnter]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    const mv = (e: PointerEvent) => { el.style.setProperty("--mx", `${e.clientX}px`); el.style.setProperty("--my", `${e.clientY}px`); el.style.setProperty("--px", String((e.clientX / innerWidth - 0.5) * 2)); };
    addEventListener("pointermove", mv);
    return () => removeEventListener("pointermove", mv);
  }, []);
  return (
    <motion.div ref={root} className="welcome" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.06, filter: "blur(14px)" }} transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="siren sr" /><div className="siren sb" />
      <Field cells={cells} />
      <div className="wl-dark" aria-hidden />
      <Tape text="Chicago Crime Branch · Do not cross · Team Moleculens" className="t1" />
      <Tape text="Crime scene · Do not cross · Evidence inside" className="t2" />
      <div className="skyline" aria-hidden>
        <Skyline seed={7} h={260} fill="#0d1018" lit={0.16} speed={140} opacity={0.5} />
        <Skyline seed={21} h={190} fill="#090b11" lit={0.22} speed={90} opacity={0.85} />
        <Skyline seed={3} h={120} fill="#05060a" lit={0.3} speed={55} opacity={1} />
      </div>
      <div className="wl-inner">
        <motion.div className="wl-by" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.8 }}>
          <Molecule /><span>Team Moleculens</span><em className="case-tag">Case file opened</em>
        </motion.div>
        <motion.p className="wl-welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }}>Welcome to</motion.p>
        <h1 className="wl-title" aria-label="Chicago Crime Branch">
          <Word text="Chicago" delay={0.35} />
          <Word text="Crime" offset={2} delay={0.65} />
          <Word text="Branch" offset={4} delay={0.9} />
        </h1>
        <motion.div className="wl-chips" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.8 }}>
          <span><b>{total}</b> crime reports</span><span><b>{types}</b> crime types</span><span><b>{arrestRate}</b> ended in arrest</span>
        </motion.div>
        <motion.button className="wl-enter" onClick={onEnter} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.75, duration: 0.8 }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.97 }}>
          Enter the dashboard <span aria-hidden>→</span>
        </motion.button>
        <p className="mono wl-hint">Move your cursor over the city · press Enter</p>
      </div>
    </motion.div>
  );
}
