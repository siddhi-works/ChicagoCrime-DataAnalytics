import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { interpolateRgbBasis } from "d3-interpolate";
import type { Bundle, GridCell } from "../lib/data";
import type { DistrictStat, Filters } from "../lib/engine";
import { C, Counter, fmt, hideTip, showTip, useWidth } from "../lib/ui";

export type Metric = "crimes" | "arrest" | "violent" | "domestic" | "night";
const METRICS: { id: Metric; label: string; unit: string; ramp: string[]; hint: string }[] = [
  { id: "crimes", label: "Crimes", unit: "", ramp: ["#12233f", "#1c5cab", "#3987e5", "#86b6ef", "#d9ebff"], hint: "Total crimes recorded in the district" },
  { id: "arrest", label: "Arrest rate", unit: "%", ramp: ["#2a1c05", "#7a4d00", "#c98500", "#f0b43c", "#ffe3a1"], hint: "Share of crimes ending in an arrest" },
  { id: "violent", label: "Violent share", unit: "%", ramp: ["#2c1214", "#8a2f35", "#e66767", "#f5a3a3", "#ffe0e0"], hint: "Share of crimes that are violent (handout definition)" },
  { id: "domestic", label: "Domestic share", unit: "%", ramp: ["#2b1020", "#7d2a52", "#d55181", "#ee94b3", "#ffdbe8"], hint: "Share of crimes flagged domestic" },
  { id: "night", label: "Night share", unit: "%", ramp: ["#191633", "#413a8f", "#7f78e0", "#b3aef5", "#e6e4ff"], hint: "Share of crimes between 00:00 and 05:59" },
];
const val = (s: DistrictStat, m: Metric) => (m === "crimes" ? s.crimes : s.crimes ? ((m === "arrest" ? s.arrests : m === "violent" ? s.violent : m === "domestic" ? s.domestic : s.night) / s.crimes) * 100 : 0);
const show = (v: number, m: Metric) => (m === "crimes" ? fmt(v) : `${fmt(v, 1)}%`);

function frame(cells: GridCell[], w: number, h: number) {
  const lat0 = cells.reduce((s, c) => s + c.lat, 0) / cells.length, k = Math.cos((lat0 * Math.PI) / 180);
  const xs = cells.map((c) => c.lon * k), ys = cells.map((c) => c.lat);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const s = Math.min((w - 40) / (x1 - x0), (h - 40) / (y1 - y0));
  const ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
  return { px: (lon: number) => ox + (lon * k - x0) * s, py: (lat: number) => h - oy - (lat - y0) * s, cw: 0.005 * k * s, ch: 0.005 * s };
}
const hexRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export function MapPanel({ b, f, selected, setSelected, onFilter }: { b: Bundle; f: Filters; selected: number | null; setSelected: (d: number | null) => void; onFilter: (code: number) => void }) {
  const [metric, setMetric] = useState<Metric>("crimes");
  const [layer, setLayer] = useState<"territories" | "glow">("territories");
  const [hover, setHover] = useState<number | null>(null);
  const [wrapRef, w] = useWidth<HTMLDivElement>(720);
  const H = Math.max(440, Math.min(600, w * 0.95));
  const cv = useRef<HTMLCanvasElement>(null);

  const stats = useMemo(() => b.engine.districtStats(f), [b, f]);
  const byCode = useMemo(() => new Map(stats.map((s) => [s.code, s])), [stats]);
  const cells = useMemo(() => b.grid.filter((c) => c.district != null), [b.grid]);
  const M = METRICS.find((m) => m.id === metric)!;
  const active = stats.filter((s) => s.crimes > 0);
  // Rates from tiny districts (e.g. a district with 31 records) are noise: rank and scale on districts with enough crimes.
  const minN = Math.max(20, active.reduce((s, d) => s + d.crimes, 0) * 0.0015);
  const rankable = metric === "crimes" ? active : active.filter((s) => s.crimes >= minN);
  const values = new Map(active.map((s) => [s.code, val(s, metric)]));
  const scaleSet = rankable.length ? rankable : active;
  const vmin = Math.min(...scaleSet.map((s) => val(s, metric))), vmax = Math.max(...scaleSet.map((s) => val(s, metric)));
  const t = (code: number) => { const v = values.get(code); return v === undefined || vmax === vmin ? 0 : Math.max(0, Math.min(1, (v - vmin) / (vmax - vmin))); };
  const rampFn = useMemo(() => interpolateRgbBasis(M.ramp), [M]);
  const ranked = [...rankable].sort((a, c) => val(c, metric) - val(a, metric));
  const cityRate = (m: Metric) => { const tot = stats.reduce((s, d) => s + d.crimes, 0); const num = stats.reduce((s, d) => s + (m === "arrest" ? d.arrests : m === "violent" ? d.violent : m === "domestic" ? d.domestic : d.night), 0); return tot ? (num / tot) * 100 : 0; };
  const sir = useMemo(() => new Map(b.charts.x_district_sir.data.map((d) => [d.District as number, d])), [b]);
  const { px, py, cw, ch } = useMemo(() => frame(cells, w, H), [cells, w, H]);
  const maxCells = useMemo(() => Math.max(1, ...cells.map((c) => c.crimes)), [cells]);

  // live state read by the animation loop
  const live = useRef({ hover, selected, metric, layer, t: new Map<number, number>(), from: new Map<number, [number, number, number]>(), tweenStart: 0, ramp: rampFn });
  useEffect(() => {
    const L = live.current, prevColors = new Map<number, [number, number, number]>();
    cells.forEach((c) => { if (c.district != null && !prevColors.has(c.district)) { const tv = L.t.get(c.district) ?? 0; const m = L.ramp(tv).match(/\d+/g)!.map(Number); prevColors.set(c.district, [m[0], m[1], m[2]]); } });
    L.from = prevColors; L.tweenStart = performance.now();
    L.hover = hover; L.selected = selected; L.metric = metric; L.layer = layer; L.ramp = rampFn;
    L.t = new Map(active.map((s) => [s.code, t(s.code)]));
  });

  useEffect(() => {
    const el = cv.current!, g = el.getContext("2d")!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    el.width = w * dpr; el.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const born = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const L = live.current;
      const tween = Math.min(1, (now - L.tweenStart) / 550), e = 1 - Math.pow(1 - tween, 3);
      const reveal = Math.min(1.3, (now - born) / 1100);
      g.clearRect(0, 0, w, H);
      g.globalCompositeOperation = L.layer === "glow" ? "lighter" : "source-over";
      const focus = L.hover ?? L.selected;
      for (const c of cells) {
        const d = c.district!;
        const x = px(c.lon), y = py(c.lat);
        const row = (y / H);
        const appear = Math.max(0, Math.min(1, reveal * 1.6 - row * 0.9));
        if (appear <= 0) continue;
        const to = L.ramp(L.t.get(d) ?? 0).match(/\d+/g)!.map(Number), fr = L.from.get(d) ?? [to[0], to[1], to[2]];
        const r = Math.round(fr[0] + (to[0] - fr[0]) * e), gg = Math.round(fr[1] + (to[1] - fr[1]) * e), bb = Math.round(fr[2] + (to[2] - fr[2]) * e);
        const dens = Math.sqrt(c.crimes / maxCells);
        const dim = focus != null && focus !== d ? 0.28 : 1;
        if (L.layer === "territories") {
          g.fillStyle = `rgba(${r},${gg},${bb},${(0.42 + dens * 0.58) * dim * appear})`;
          g.fillRect(x - cw / 2 + 0.4, y - ch / 2 + 0.4, cw - 0.8, ch - 0.8);
        } else {
          const rad = (1.5 + dens * 6) * (focus === d ? 1.5 : 1) * appear;
          const grd = g.createRadialGradient(x, y, 0, x, y, rad * 2);
          grd.addColorStop(0, `rgba(${r},${gg},${bb},${(0.2 + dens * 0.7) * dim})`); grd.addColorStop(1, `rgba(${r},${gg},${bb},0)`);
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad * 2, 0, 6.283); g.fill();
        }
      }
      g.globalCompositeOperation = "source-over";
      // district labels + pulse on selection
      g.textAlign = "center"; g.textBaseline = "middle";
      for (const ce of b.centroids) {
        if (!values.has(ce.District)) continue;
        const x = px(ce.lon), y = py(ce.lat), on = L.selected === ce.District, hv = L.hover === ce.District;
        if (on) {
          const p = ((now / 1400) % 1);
          g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - p)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 12 + p * 30, 0, 6.283); g.stroke();
          g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, 5, 0, 6.283); g.fill();
        }
        g.font = `${on || hv ? 700 : 600} ${on || hv ? 13 : 10.5}px Inter Variable, system-ui, sans-serif`;
        g.lineWidth = 3; g.strokeStyle = "rgba(8,10,16,.9)"; g.strokeText(String(ce.District), x, y + (on ? 17 : 0));
        g.fillStyle = on || hv ? "#fff" : "rgba(255,255,255,.78)"; g.fillText(String(ce.District), x, y + (on ? 17 : 0));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cells, w, H, px, py, cw, ch, maxCells, b.centroids, active.length]); // eslint-disable-line

  const hit = (e: React.MouseEvent | React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best: GridCell | null = null, bd = (Math.max(cw, ch) * 1.4) ** 2;
    for (const c of cells) { const d2 = (px(c.lon) - mx) ** 2 + (py(c.lat) - my) ** 2; if (d2 < bd) { bd = d2; best = c; } }
    return best?.district ?? null;
  };
  const sel = selected != null ? byCode.get(selected) : undefined;
  const topTypes = sel ? sel.types.map((n, i) => ({ n, i })).filter((x) => x.n > 0).sort((a, c) => c.n - a.n).slice(0, 5) : [];
  const s = selected != null ? sir.get(selected) : undefined;
  const L = b.engine.cube.lookups;

  return (
    <div className="mapgrid">
      {/* ranked list */}
      <section className="card maplist" style={{ ["--accent" as string]: "#2bd69c" }}>
        <div className="card-head"><div><h3>Districts ranked</h3><div className="sub">by {M.label.toLowerCase()} · click to open{metric !== "crimes" && rankable.length < active.length ? ` · ${active.length - rankable.length} tiny district(s) hidden (<${fmt(Math.round(minN))} crimes)` : ""}</div></div></div>
        <div className="rank" role="listbox" aria-label="Districts ranked">
          {ranked.map((d, i) => (
            <button key={d.code} role="option" aria-selected={selected === d.code} className={`rank-row ${selected === d.code ? "on" : ""}`} onClick={() => setSelected(selected === d.code ? null : d.code)}
              onPointerEnter={() => setHover(d.code)} onPointerLeave={() => setHover(null)}>
              <span className="rk">{i + 1}</span><span className="dn">District {d.code}</span>
              <span className="rbar"><motion.i layout initial={false} animate={{ width: `${Math.max(3, t(d.code) * 100)}%` }} style={{ background: rampFn(0.45 + t(d.code) * 0.5) }} transition={{ duration: 0.5 }} /></span>
              <span className="rv">{show(val(d, metric), metric)}</span>
            </button>))}
        </div>
      </section>

      {/* map */}
      <section className="card mapcard" style={{ ["--accent" as string]: M.ramp[2] }}>
        <div className="card-head">
          <div><h3>Chicago by police district</h3><div className="sub">Cells (~550 m) coloured by their district’s {M.label.toLowerCase()} · {M.hint}</div></div>
          <span className="qtag x">Extra</span>
        </div>
        <div className="map-controls">
          <div className="seg" role="group" aria-label="Map metric">
            {METRICS.map((m) => <button key={m.id} aria-pressed={metric === m.id} style={metric === m.id ? { background: m.ramp[3], borderRadius: 9, color: "#0a0c12" } : undefined} onClick={() => setMetric(m.id)}>{m.label}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Map layer">
            {(["territories", "glow"] as const).map((l) => <button key={l} aria-pressed={layer === l} style={layer === l ? { background: "var(--ink)", borderRadius: 9 } : undefined} onClick={() => setLayer(l)}>{l === "territories" ? "Territories" : "Glow"}</button>)}
          </div>
        </div>
        <div ref={wrapRef} className="mapstage" style={{ height: H }}
          onPointerMove={(e) => { const d = hit(e); setHover(d); if (d == null) return hideTip(); const st = byCode.get(d)!; showTip(e, <><div className="t2">District {d}</div><b>{show(val(st, metric), metric)}</b><div className="t3">{fmt(st.crimes)} crimes · {fmt((st.arrests / Math.max(1, st.crimes)) * 100, 1)}% arrested</div><div className="t3">Click for details</div></>); }}
          onPointerLeave={() => { setHover(null); hideTip(); }} onClick={(e) => { const d = hit(e); setSelected(d != null && d !== selected ? d : null); }}>
          <canvas ref={cv} style={{ width: w, height: H, display: "block", cursor: hover != null ? "pointer" : "default" }} role="img" aria-label="Map of Chicago police districts coloured by the selected metric" />
          <div className="map-legend"><span>{show(vmin, metric)}</span><i style={{ background: `linear-gradient(90deg, ${M.ramp.join(",")})` }} /><span>{show(vmax, metric)}</span></div>
          <div className="mono map-note">Territories = each cell’s most common district · lake to the east</div>
        </div>
        <div className="caveat">Positions: window A coordinates (Apr 2015 – Jul 2017); window B has almost none. Values: all records, honouring your filters (except district).</div>
      </section>

      {/* detail */}
      <section className="card mapdetail" style={{ ["--accent" as string]: "#9085e9" }}>
        {sel ? (
          <motion.div key={sel.code} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35 }}>
            <div className="card-head"><div><div className="mono">Police district</div><h3 style={{ fontSize: 42 }}>{sel.code}</h3></div><button className="tbtn" onClick={() => setSelected(null)}>Close</button></div>
            <div className="dstats">
              <div><span className="mono">Crimes</span><b><Counter value={sel.crimes} duration={0.6} /></b></div>
              {(["arrest", "violent", "domestic", "night"] as Metric[]).map((m) => {
                const v = val(sel, m), c = cityRate(m), dl = v - c;
                return <div key={m}><span className="mono">{METRICS.find((x) => x.id === m)!.label}</span><b><Counter value={v} decimals={1} duration={0.6} />%</b><em className={dl >= 0 ? "up" : "dn"}>{dl >= 0 ? "▲" : "▼"} {fmt(Math.abs(dl), 1)} pts vs city</em></div>;
              })}
            </div>
            <div className="mono" style={{ margin: "14px 0 6px" }}>Top crime types here</div>
            {topTypes.map((x, k) => (
              <div key={x.i} className="mini-row"><span style={{ textTransform: "capitalize" }}>{L.primary_type[x.i].toLowerCase()}</span>
                <span className="rbar"><motion.i initial={{ width: 0 }} animate={{ width: `${(x.n / topTypes[0].n) * 100}%` }} transition={{ duration: 0.6, delay: k * 0.05 }} style={{ background: C.categories[L.crime_category_of_type[x.i]] }} /></span><b>{fmt(x.n)}</b></div>))}
            {s && <div className={`sirbox ${s.flag === "above expected" ? "hi" : s.flag === "below expected" ? "lo" : ""}`}>
              <span className="mono">Arrest rate vs crime mix (window A)</span>
              <b>{s.flag}</b><span>Index {fmt(s.sir, 2)} (95% CI {fmt(s.sir_lo, 2)}–{fmt(s.sir_hi, 2)}): observed {fmt(s.raw_rate_pct, 1)}% vs {fmt(s.expected_rate_pct, 1)}% expected from its mix of crime types.</span></div>}
            <button className="reset" style={{ marginTop: 14, width: "100%" }} onClick={() => onFilter(sel.code)}>Filter the dashboard to District {sel.code}</button>
          </motion.div>
        ) : (
          <div>
            <div className="card-head"><div><h3>Explore a district</h3><div className="sub">Click the map or the list</div></div></div>
            <p className="mapdetail-p">Each glowing block is a ~550 m patch of the city, coloured by how its police district scores on <b>{M.label.toLowerCase()}</b>. Brighter blocks hold more crimes.</p>
            {ranked.length > 0 && <div className="topbot">
              <div><span className="mono">Highest {M.label.toLowerCase()}</span>{ranked.slice(0, 3).map((d) => <button key={d.code} onClick={() => setSelected(d.code)}>District {d.code}<b>{show(val(d, metric), metric)}</b></button>)}</div>
              <div><span className="mono">Lowest</span>{ranked.slice(-3).reverse().map((d) => <button key={d.code} onClick={() => setSelected(d.code)}>District {d.code}<b>{show(val(d, metric), metric)}</b></button>)}</div>
            </div>}
            <p className="mapdetail-p" style={{ marginTop: 14 }}>Tip: the dashboard filters (crime type, arrest, domestic) also recolour this map.</p>
          </div>
        )}
      </section>
    </div>
  );
}
