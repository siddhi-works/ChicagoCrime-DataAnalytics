import { useEffect, useMemo, useRef, useState } from "react";
import type { GridCell } from "../lib/data";
import { C, fmt, hideTip, showTip, useWidth } from "../lib/ui";

export type MapMode = "all" | "violent" | "property" | "other" | "arrest";
const COLORS: Record<MapMode, string> = { all: "#6da7ec", violent: C.violent, property: C.property, other: "#2bd69c", arrest: "#f0b43c" };

function project(cells: GridCell[], w: number, h: number) {
  const lat0 = cells.reduce((s, c) => s + c.lat, 0) / cells.length;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = cells.map((c) => c.lon * k), ys = cells.map((c) => c.lat);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((w - 24) / (x1 - x0), (h - 24) / (y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  return (c: GridCell) => [ox + (c.lon * k - x0) * s, h - oy - (c.lat - y0) * s] as const;
}

export function MapCanvas({ cells, mode, height = 560 }: { cells: GridCell[]; mode: MapMode; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>(800);
  const cv = useRef<HTMLCanvasElement>(null);
  const [hot, setHot] = useState<number | null>(null);
  const proj = useMemo(() => project(cells, w, height), [cells, w, height]);
  const pts = useMemo(() => cells.map((c) => {
    const [x, y] = proj(c);
    const v = mode === "all" ? c.crimes : mode === "arrest" ? c.arrests : c[mode];
    const share = mode === "arrest" ? (c.crimes >= 25 ? c.arrests / c.crimes : 0) : v / c.crimes;
    return { x, y, v, share, c };
  }), [cells, proj, mode]);
  const vmax = useMemo(() => Math.max(1, ...pts.map((p) => (mode === "arrest" ? p.share * 100 : p.v))), [pts, mode]);

  useEffect(() => {
    const el = cv.current; if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = w * dpr; el.height = height * dpr;
    const g = el.getContext("2d")!; g.scale(dpr, dpr); g.clearRect(0, 0, w, height);
    g.globalCompositeOperation = "lighter";
    const col = COLORS[mode];
    pts.forEach((p, i) => {
      const val = mode === "arrest" ? p.share * 100 : p.v;
      if (val <= 0) return;
      const t = Math.sqrt(val / vmax);
      const r = 2.2 + t * (mode === "arrest" ? 9 : 11);
      const a = i === hot ? 1 : 0.16 + t * 0.62;
      const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.9);
      grd.addColorStop(0, hexA(col, a)); grd.addColorStop(1, hexA(col, 0));
      g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, r * 1.9, 0, 6.283); g.fill();
    });
  }, [pts, vmax, w, height, mode, hot]);

  const move = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = -1, bd = 22 * 22;
    pts.forEach((p, i) => { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd && p.v > 0) { bd = d; best = i; } });
    setHot(best < 0 ? null : best);
    if (best < 0) return hideTip();
    const c = pts[best].c;
    showTip(e, <><div className="t2">≈550 m cell · {fmt(c.crimes)} crimes</div><b>{fmt((c.arrests / c.crimes) * 100, 1)}% arrested</b><div className="t3">{fmt(c.violent)} violent · {fmt(c.property)} property · {fmt(c.other)} other</div></>);
  };
  return (
    <div ref={ref} style={{ position: "relative", height, borderRadius: 18, background: "radial-gradient(600px 400px at 50% 40%, #121a2b, #0b0e16)", overflow: "hidden", border: "1px solid var(--line)" }}
      onPointerMove={move} onPointerLeave={() => { setHot(null); hideTip(); }}>
      <canvas ref={cv} style={{ width: w, height, display: "block" }} role="img" aria-label="Density map of crime incidents across Chicago" />
      <div className="mono" style={{ position: "absolute", left: 14, bottom: 12 }}>West ← Chicago, incident grid → Lake Michigan</div>
    </div>
  );
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Ambient hero background: the same incident grid, breathing slowly; parallaxes with the pointer. */
export function HeroCanvas({ cells }: { cells: GridCell[] }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = cv.current!, g = el.getContext("2d")!;
    let w = 0, h = 0, raf = 0, px = 0, py = 0, tx = 0, ty = 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fit = () => { const dpr = Math.min(2, devicePixelRatio || 1); w = el.clientWidth; h = el.clientHeight; el.width = w * dpr; el.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit();
    const mm = (e: PointerEvent) => { tx = (e.clientX / innerWidth - 0.5) * 24; ty = (e.clientY / innerHeight - 0.5) * 16; };
    addEventListener("resize", fit); addEventListener("pointermove", mm);
    const vmax = Math.max(...cells.map((c) => c.crimes));
    const draw = (t: number) => {
      px += (tx - px) * 0.05; py += (ty - py) * 0.05;
      const side = Math.min(w * 0.62, h * 1.05);
      const p = project(cells, side, h);
      g.clearRect(0, 0, w, h); g.globalCompositeOperation = "lighter";
      const ox = w - side - w * 0.04 + px, oy = py;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i], [x, y] = p(c), k = c.crimes / vmax;
        const tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(t / 900 + i * 12.9898);
        const viol = c.violent / c.crimes;
        const rgb = viol > 0.34 ? "230,103,103" : "109,167,236";
        g.fillStyle = `rgba(${rgb},${(0.12 + Math.sqrt(k) * 0.7) * tw})`;
        g.beginPath(); g.arc(ox + x, oy + y, 1.2 + Math.sqrt(k) * 3.4, 0, 6.283); g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", fit); removeEventListener("pointermove", mm); };
  }, [cells]);
  return <canvas ref={cv} aria-hidden="true" />;
}
