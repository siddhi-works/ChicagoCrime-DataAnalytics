import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { line as d3line, area as d3area, curveMonotoneX } from "d3-shape";
import { interpolateRgbBasis } from "d3-interpolate";
import { C, compact, fmt, hideTip, showTip, useWidth } from "../lib/ui";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const grow = (delay = 0) => ({ duration: 0.9, ease: EASE, delay }) as const;
const spring = { type: "spring", stiffness: 140, damping: 22, mass: 0.8 } as const;

const TipRow = ({ color, label, value }: { color: string; label: string; value: string }) => (
  <div className="row"><i style={{ background: color }} /><span className="t2">{label}</span><span style={{ marginLeft: "auto", fontWeight: 600 }}>{value}</span></div>
);

/* ───────────────────────── Line (Q1) ───────────────────────── */
export function LineChart({ points, color = C.volume, height = 320, yTitle, xTitle }:
  { points: { label: string; value: number }[]; color?: string; height?: number; yTitle: string; xTitle: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 62, r: 18, t: 22, b: 54 };
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const vals = points.map((p) => p.value);
  const max = Math.max(1, ...vals), min = Math.min(...vals);
  const lo = vals.length ? Math.max(0, Math.floor((min * 0.88) / 1000) * 1000) : 0;
  const y = scaleLinear().domain([lo, max]).nice().range([ih, 0]);
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2);
  const path = useMemo(() => d3line<{ value: number }>().x((_, i) => x(i)).y((d) => y(d.value)).curve(curveMonotoneX)(points) ?? "", [points, w, height]); // eslint-disable-line
  const area = useMemo(() => d3area<{ value: number }>().x((_, i) => x(i)).y0(ih).y1((d) => y(d.value)).curve(curveMonotoneX)(points) ?? "", [points, w, height]); // eslint-disable-line
  const iMax = vals.indexOf(max), iMin = vals.indexOf(min);
  const gid = "lg-" + color.slice(1);
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label={`${yTitle} by month`}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".38" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="axis">
            {y.ticks(5).map((t) => (<g key={t} transform={`translate(0,${y(t)})`}><line x2={iw} /><text x={-10} dy="0.32em" textAnchor="end">{compact(t)}</text></g>))}
            {points.map((p, i) => (i % 3 === 0 || i === points.length - 1) && (<text key={p.label} x={x(i)} y={ih + 20} textAnchor="middle">{p.label.replace(" 20", " ’")}</text>))}
            <text x={iw / 2} y={ih + 44} textAnchor="middle">{xTitle}</text>
            <text transform={`translate(${-48},${ih / 2}) rotate(-90)`} textAnchor="middle">{yTitle}</text>
          </g>
          <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1, d: area }} transition={{ duration: 1.1, ease: EASE }} />
          <motion.path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: path }} transition={{ duration: 1.6, ease: EASE }} />
          {points.length > 0 && [iMax, iMin].map((i, k) => (
            <g key={k} transform={`translate(${x(i)},${y(vals[i])})`}>
              <circle r={5} fill={color} stroke="#131722" strokeWidth={2} />
              <text y={k === 0 ? -12 : 20} textAnchor="middle" fill="#f3f5f9" fontSize={11.5} fontWeight={600}>{k === 0 ? "Peak" : "Low"} {fmt(vals[i])}</text>
            </g>))}
          {hover !== null && points[hover] && (<g transform={`translate(${x(hover)},0)`}><line y2={ih} stroke="rgba(255,255,255,.35)" strokeDasharray="3 4" /><circle cy={y(points[hover].value)} r={6} fill={color} stroke="#fff" strokeWidth={2} /></g>)}
          <rect width={iw} height={ih} fill="transparent" onPointerLeave={() => { setHover(null); hideTip(); }}
            onPointerMove={(e) => {
              const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const i = Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1))));
              setHover(i);
              const prev = points[i - 1];
              showTip(e, <><div className="t2">{points[i].label}</div><b>{fmt(points[i].value)}</b>{prev && <div className="t3">{points[i].value >= prev.value ? "▲" : "▼"} {fmt(Math.abs(points[i].value - prev.value))} vs previous month</div>}</>);
            }} />
        </g>
      </svg>
    </div>
  );
}

/* ───────────────────────── Columns (Q2, Q3, Q4, Q6) ───────────────────────── */
export function Columns({ items, color = C.volume, height = 280, valueFmt = fmt, yTitle, xTitle, overlay, overlayLabel, domainMax }:
  { items: { label: string; value: number; color?: string; sub?: string }[]; color?: string; height?: number; valueFmt?: (n: number) => string;
    yTitle: string; xTitle: string; overlay?: number[]; overlayLabel?: string; domainMax?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);
  const m = { l: 58, r: 12, t: 26, b: 52 };
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const max = Math.max(1e-9, domainMax ?? 0, ...items.map((i) => i.value), ...(overlay ?? []));
  const y = scaleLinear().domain([0, max]).nice().range([ih, 0]);
  const band = iw / Math.max(1, items.length), bw = Math.min(88, band * 0.64);
  const maxI = items.reduce((b, it, i) => (it.value > items[b].value ? i : b), 0);
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label={`${yTitle} by ${xTitle}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="axis">
            {y.ticks(4).map((t) => (<g key={t} transform={`translate(0,${y(t)})`}><line x2={iw} /><text x={-10} dy="0.32em" textAnchor="end">{valueFmt === fmt ? compact(t) : valueFmt(t)}</text></g>))}
            <text x={iw / 2} y={ih + 44} textAnchor="middle">{xTitle}</text>
            <text transform={`translate(${-44},${ih / 2}) rotate(-90)`} textAnchor="middle">{yTitle}</text>
          </g>
          {items.map((it, i) => {
            const cx = band * i + band / 2, h = ih - y(it.value), c = it.color ?? color;
            return (
              <g key={it.label} opacity={hot === null || hot === i ? 1 : 0.5} style={{ transition: "opacity .2s" }}>
                <motion.rect x={cx - bw / 2} width={bw} rx={6} fill={c} initial={{ y: ih, height: 0 }} animate={{ y: ih - h, height: Math.max(0, h) }} transition={grow(i * 0.05)} />
                <motion.text x={cx} textAnchor="middle" fill={i === maxI ? "#fff" : "#b4bac8"} fontSize={12.5} fontWeight={i === maxI ? 700 : 500} initial={{ y: ih - 6, opacity: 0 }} animate={{ y: ih - h - 8, opacity: 1 }} transition={{ ...spring, delay: 0.2 + i * 0.05 }}>{band < 78 && valueFmt === fmt ? compact(it.value) : valueFmt(it.value)}</motion.text>
                <text x={cx} y={ih + 20} textAnchor="middle" className="axis" fill="#b4bac8" fontSize={12}>{it.label}</text>
                <rect className="hit" x={cx - band / 2} width={band} height={ih} fill="transparent" tabIndex={0}
                  onPointerMove={(e) => { setHot(i); showTip(e, <><div className="t2">{it.label}</div><b>{valueFmt(it.value)}</b>{overlay && <div className="t3">{overlayLabel}: {valueFmt(overlay[i])}</div>}{it.sub && <div className="t3">{it.sub}</div>}</>); }}
                  onFocus={() => setHot(i)} onBlur={() => setHot(null)} onPointerLeave={() => { setHot(null); hideTip(); }} />
              </g>
            );
          })}
          {overlay && (<g pointerEvents="none">
            <motion.path fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: overlay.map((v, i) => `${i ? "L" : "M"}${band * i + band / 2},${y(v)}`).join("") }} transition={{ duration: 1.2, delay: 0.5, ease: EASE }} />
            {overlay.map((v, i) => <motion.circle key={i} r={5.5} fill="#0a0c12" stroke="#fff" strokeWidth={2.5} animate={{ cx: band * i + band / 2, cy: y(v) }} transition={spring} />)}
          </g>)}
        </g>
      </svg>
    </div>
  );
}

/* ───────────────────────── Horizontal bars (Q7, Q8, extras) ───────────────────────── */
export function HBars({ items, selected, onPick, valueFmt = fmt, refValue, refLabel, max: maxIn }:
  { items: { key: string; label: string; value: number; color: string; sub?: string }[]; selected?: Set<string>; onPick?: (k: string) => void;
    valueFmt?: (n: number) => string; refValue?: number; refLabel?: string; max?: number }) {
  const max = maxIn ?? Math.max(1e-9, ...items.map((i) => i.value));
  return (
    <div className="chart" role="list" style={{ position: "relative" }}>
      {items.map((it, i) => {
        const dim = selected && selected.size > 0 && !selected.has(it.key);
        return (
          <div key={it.key} role="listitem" className={onPick ? "hit" : ""} tabIndex={onPick ? 0 : undefined}
            onClick={() => onPick?.(it.key)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick?.(it.key)}
            onPointerMove={(e) => showTip(e, <><div className="t2">{it.label}</div><b>{valueFmt(it.value)}</b>{it.sub && <div className="t3">{it.sub}</div>}{onPick && <div className="t3">Click to filter the whole dashboard</div>}</>)}
            onPointerLeave={hideTip}
            style={{ display: "grid", gridTemplateColumns: "minmax(110px, 36%) 1fr 64px", alignItems: "center", gap: 10, padding: "5px 0", opacity: dim ? 0.38 : 1, transition: "opacity .2s" }}>
            <span style={{ fontSize: 12.5, color: "#b4bac8", textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label.toLowerCase()}</span>
            <span style={{ position: "relative", height: 16, borderRadius: 8, background: "rgba(255,255,255,.04)" }}>
              <motion.span initial={{ width: 0 }} animate={{ width: `${(Math.max(0, it.value) / max) * 100}%` }} transition={grow(i * 0.04)}
                style={{ position: "absolute", inset: "0 auto 0 0", borderRadius: 8, background: it.color, outline: selected?.has(it.key) ? "2px solid #fff" : undefined, outlineOffset: 2 }} />
              {refValue !== undefined && <span style={{ position: "absolute", top: -3, bottom: -3, left: `${(refValue / max) * 100}%`, borderLeft: "1.5px dashed rgba(255,255,255,.55)" }} />}
            </span>
            <span style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{valueFmt(it.value)}</span>
          </div>
        );
      })}
      {refValue !== undefined && refLabel && <div className="mono" style={{ marginTop: 8, textTransform: "none", letterSpacing: 0 }}>┆ {refLabel}</div>}
    </div>
  );
}

/* ───────────────────────── Donut (Q5) ───────────────────────── */
export function Donut({ items, centerLabel }: { items: { label: string; value: number; color: string }[]; centerLabel: string }) {
  const [hot, setHot] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const R = 70;
  return (
    <div className="chart" style={{ display: "grid", placeItems: "center" }}>
      <svg viewBox="0 0 200 200" width="100%" style={{ maxWidth: 300 }} role="img" aria-label="Share of violent, property and other crimes">
        <g transform="rotate(-90 100 100)">
          <circle cx={100} cy={100} r={R} fill="none" stroke="rgba(255,255,255,.04)" strokeWidth={26} />
          {items.map((it, i) => {
            const len = (it.value / total) * 100, start = acc; acc += len;
            const gap = items.length > 1 && len > 0 ? 1.2 : 0;
            return (
              <motion.circle key={it.label} cx={100} cy={100} r={R} fill="none" stroke={it.color} pathLength={100} tabIndex={0} className="hit"
                animate={{ strokeDasharray: `${Math.max(0, len - gap)} ${100 - Math.max(0, len - gap)}`, strokeDashoffset: -start, strokeWidth: hot === i ? 32 : 26, opacity: hot === null || hot === i ? 1 : 0.45 }}
                initial={{ strokeDasharray: "0 100", strokeDashoffset: -start }} transition={{ duration: 0.9, ease: EASE }}
                onPointerMove={(e) => { setHot(i); showTip(e, <><div className="t2">{it.label}</div><b>{fmt(it.value)}</b><div className="t3">{fmt((it.value / total) * 100, 1)}% of crimes in view</div></>); }}
                onPointerLeave={() => { setHot(null); hideTip(); }} onFocus={() => setHot(i)} onBlur={() => setHot(null)} />
            );
          })}
        </g>
        <text x={100} y={95} textAnchor="middle" fill="#f3f5f9" fontSize={hot === null ? 20 : 24} fontWeight={800} fontFamily="var(--display)">{hot === null ? fmt(total) : `${fmt((items[hot].value / total) * 100, 1)}%`}</text>
        <text x={100} y={114} textAnchor="middle" fill="#7d8597" fontSize={9.5}>{hot === null ? centerLabel : items[hot].label}</text>
      </svg>
      <div className="legend">{items.map((it) => <span key={it.label}><i style={{ background: it.color }} />{it.label} · {fmt((it.value / total) * 100, 1)}%</span>)}</div>
    </div>
  );
}

/* ───────────────────────── Combo (Q9): bars + arrest-rate line on a secondary axis (handout-mandated) ───────────────────────── */
export function Combo({ items, selected, onPick, height = 340 }:
  { items: { key: string; label: string; crimes: number; rate: number }[]; selected: Set<string>; onPick: (k: string) => void; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<number | null>(null);
  const m = { l: 62, r: 62, t: 28, b: 56 };
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const yL = scaleLinear().domain([0, Math.max(1, ...items.map((i) => i.crimes))]).nice().range([ih, 0]);
  const rMax = Math.max(10, ...items.map((i) => i.rate));
  const yR = scaleLinear().domain([0, rMax]).nice().range([ih, 0]);
  const band = iw / Math.max(1, items.length), bw = Math.min(54, band * 0.6);
  const lineD = items.map((it, i) => `${i ? "L" : "M"}${band * i + band / 2},${yR(it.rate)}`).join("");
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label="Top 10 districts: crimes and arrest rate">
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="axis">
            {yL.ticks(5).map((t) => (<g key={t} transform={`translate(0,${yL(t)})`}><line x2={iw} /><text x={-10} dy="0.32em" textAnchor="end" fill={C.volume2}>{compact(t)}</text></g>))}
            {yR.ticks(5).map((t) => (<text key={t} x={iw + 10} y={yR(t)} dy="0.32em" fill={C.arrestText}>{t}%</text>))}
            <text x={iw / 2} y={ih + 48} textAnchor="middle">Police district</text>
            <text transform={`translate(${-48},${ih / 2}) rotate(-90)`} textAnchor="middle" fill={C.volume2}>Number of crimes</text>
            <text transform={`translate(${iw + 50},${ih / 2}) rotate(90)`} textAnchor="middle" fill={C.arrestText}>Arrest rate %</text>
          </g>
          {items.map((it, i) => {
            const cx = band * i + band / 2, h = ih - yL(it.crimes);
            return (
              <g key={it.key} opacity={(selected.size === 0 || selected.has(it.key)) && (hot === null || hot === i) ? 1 : 0.4} style={{ transition: "opacity .2s" }}>
                <motion.rect x={cx - bw / 2} width={bw} rx={6} fill={C.volume} initial={{ y: ih, height: 0 }} animate={{ y: ih - h, height: Math.max(0, h) }} transition={grow(i * 0.05)} />
                <text x={cx} y={ih + 20} textAnchor="middle" fill="#b4bac8" fontSize={12}>{it.label}</text>
                <rect className="hit" x={cx - band / 2} width={band} height={ih} fill="transparent" tabIndex={0} onClick={() => onPick(it.key)} onKeyDown={(e) => e.key === "Enter" && onPick(it.key)}
                  onPointerMove={(e) => { setHot(i); showTip(e, <><div className="t2">District {it.label.replace("D", "")}</div><TipRow color={C.volume} label="Crimes" value={fmt(it.crimes)} /><TipRow color={C.arrestText} label="Arrest rate" value={`${fmt(it.rate, 1)}%`} /><div className="t3">Click to filter</div></>); }}
                  onPointerLeave={() => { setHot(null); hideTip(); }} />
              </g>
            );
          })}
          <g pointerEvents="none">
            <motion.path fill="none" stroke={C.arrestText} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, d: lineD }} transition={{ duration: 1.3, delay: 0.4, ease: EASE }} />
            {items.map((it, i) => (<motion.circle key={it.key} r={5.5} fill="#0a0c12" stroke={C.arrestText} strokeWidth={2.5} animate={{ cx: band * i + band / 2, cy: yR(it.rate) }} transition={spring} />))}
          </g>
        </g>
      </svg>
      <div className="legend"><span><i style={{ background: C.volume }} />Crimes (left axis)</span><span><i className="line" style={{ background: C.arrestText }} />Arrest rate % (right axis)</span></div>
    </div>
  );
}

/* ───────────────────────── Heatmap (Q10, weekday × hour) ───────────────────────── */
const ramp = interpolateRgbBasis(C.ramp);
export function Heatmap({ rows, cols, values, valueFmt = fmt, cellH = 44, showValues = true, unit = "crimes", colTitle, rowTitle, colTick }:
  { rows: string[]; cols: string[]; values: number[][]; valueFmt?: (n: number) => string; cellH?: number; showValues?: boolean; unit?: string; colTitle: string; rowTitle: string; colTick?: (c: string, i: number) => string | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const lw = 92, top = 28, bottom = 34;
  const cw = (w - lw) / cols.length;
  const flat = values.flat();
  const max = Math.max(1e-9, ...flat), min = Math.min(...flat);
  const t = (v: number) => (max === min ? 0.5 : (v - min) / (max - min));
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={top + rows.length * cellH + bottom} role="img" aria-label={`${unit} by ${rowTitle} and ${colTitle}`}>
        <g className="axis">
          {cols.map((c, i) => { const l = colTick ? colTick(c, i) : c; return l && <text key={c} x={lw + cw * i + cw / 2} y={top - 10} textAnchor="middle" fill="#b4bac8">{l}</text>; })}
          {rows.map((r, j) => <text key={r} x={lw - 12} y={top + cellH * j + cellH / 2} dy="0.32em" textAnchor="end" fill="#b4bac8" fontSize={12}>{r.length > 4 ? r.slice(0, 3) : r}</text>)}
          <text x={lw + (w - lw) / 2} y={top + rows.length * cellH + 26} textAnchor="middle">{colTitle}</text>
        </g>
        {rows.map((r, j) => cols.map((c, i) => {
          const v = values[j]?.[i] ?? 0, key = `${j}-${i}`, f = ramp(t(v) * 0.92 + 0.04);
          return (
            <g key={key}>
              <motion.rect x={lw + cw * i + 1.5} y={top + cellH * j + 1.5} width={cw - 3} height={cellH - 3} rx={Math.min(9, cw / 4)} initial={{ fill: C.ramp[0], opacity: 0 }}
                animate={{ fill: f, opacity: hot === null || hot === key ? 1 : 0.55 }} transition={{ duration: 0.6, delay: (i + j) * 0.012 }}
                stroke={hot === key ? "#fff" : "none"} strokeWidth={1.5} className="hit" tabIndex={0}
                onPointerMove={(e) => { setHot(key); showTip(e, <><div className="t2">{r} · {c}</div><b>{valueFmt(v)}</b><div className="t3">{unit}</div></>); }}
                onPointerLeave={() => { setHot(null); hideTip(); }} onFocus={() => setHot(key)} onBlur={() => setHot(null)} />
              {showValues && cw > 52 && <text x={lw + cw * i + cw / 2} y={top + cellH * j + cellH / 2} dy="0.34em" textAnchor="middle" pointerEvents="none" fontSize={12} fontWeight={600} fill={t(v) > 0.55 ? "#0a0c12" : "#e9edf5"}>{valueFmt(v)}</text>}
            </g>
          );
        }))}
      </svg>
      <div className="legend" style={{ alignItems: "center" }}>
        <span>{valueFmt(min)}</span><i style={{ width: 140, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${C.ramp.join(",")})` }} /><span>{valueFmt(max)} {unit}</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Scatter: observed vs expected ───────────────────────── */
export function Scatter({ items, height = 360 }: { items: { label: string; x: number; y: number; flag: string; sub: string }[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hot, setHot] = useState<string | null>(null);
  const m = { l: 56, r: 16, t: 14, b: 50 };
  const iw = w - m.l - m.r, ih = height - m.t - m.b;
  const hi = Math.ceil(Math.max(...items.map((i) => Math.max(i.x, i.y)), 10) / 5) * 5;
  const s = scaleLinear().domain([0, hi]).range([0, iw]), sy = scaleLinear().domain([0, hi]).range([ih, 0]);
  const col = (f: string) => (f === "above expected" ? C.violent : f === "below expected" ? C.volume : "#8a93a6");
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label="Observed versus expected arrest rate by district">
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="axis">
            {sy.ticks(5).map((t) => (<g key={t} transform={`translate(0,${sy(t)})`}><line x2={iw} /><text x={-10} dy="0.32em" textAnchor="end">{t}%</text></g>))}
            {s.ticks(5).map((t) => <text key={t} x={s(t)} y={ih + 18} textAnchor="middle">{t}%</text>)}
            <text x={iw / 2} y={ih + 42} textAnchor="middle">Expected arrest rate given the district’s crime mix</text>
            <text transform={`translate(${-42},${ih / 2}) rotate(-90)`} textAnchor="middle">Observed arrest rate</text>
          </g>
          <line x1={0} y1={ih} x2={iw} y2={0} stroke="rgba(255,255,255,.35)" strokeDasharray="4 5" />
          <text x={iw - 6} y={14} textAnchor="end" fill="#7d8597" fontSize={11}>on the line = exactly as expected</text>
          {items.map((it, i) => (
            <g key={it.label} opacity={hot === null || hot === it.label ? 1 : 0.4}>
              <motion.circle r={hot === it.label ? 10 : 7.5} fill={col(it.flag)} stroke="#131722" strokeWidth={2} initial={{ cx: s(it.x), cy: ih, opacity: 0 }} animate={{ cx: s(it.x), cy: sy(it.y), opacity: 1 }} transition={{ ...spring, delay: i * 0.03 }} />
              <text x={s(it.x) + 11} y={sy(it.y) + 4} fill="#b4bac8" fontSize={10.5} pointerEvents="none">{it.label}</text>
              <circle cx={s(it.x)} cy={sy(it.y)} r={16} fill="transparent" className="hit" onPointerMove={(e) => { setHot(it.label); showTip(e, <><div className="t2">District {it.label.replace("D", "")}</div><b>{fmt(it.y, 1)}%</b><div className="t3">expected {fmt(it.x, 1)}% · {it.sub}</div></>); }} onPointerLeave={() => { setHot(null); hideTip(); }} />
            </g>
          ))}
        </g>
      </svg>
      <div className="legend"><span><i style={{ background: C.violent }} />Above expected</span><span><i style={{ background: "#8a93a6" }} />In line</span><span><i style={{ background: C.volume }} />Below expected</span></div>
    </div>
  );
}

/* ───────────────────────── Diverging bars (change %) ───────────────────────── */
export function DivBars({ items, unit = "%" }: { items: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="chart" role="list">
      {items.map((it, i) => (
        <div key={it.label} role="listitem" style={{ display: "grid", gridTemplateColumns: "minmax(110px,32%) 1fr 56px", alignItems: "center", gap: 10, padding: "4px 0" }}
          onPointerMove={(e) => showTip(e, <><div className="t2">{it.label}</div><b>{it.value > 0 ? "+" : ""}{fmt(it.value, 1)}{unit}</b></>)} onPointerLeave={hideTip}>
          <span style={{ fontSize: 12.5, color: "#b4bac8", textTransform: "capitalize", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label.toLowerCase()}</span>
          <span style={{ position: "relative", height: 14 }}>
            <span style={{ position: "absolute", left: "50%", top: -4, bottom: -4, borderLeft: "1px solid rgba(255,255,255,.25)" }} />
            <motion.span initial={{ width: 0 }} animate={{ width: `${(Math.abs(it.value) / max) * 50}%` }} transition={grow(i * 0.035)}
              style={{ position: "absolute", top: 0, bottom: 0, borderRadius: 7, background: it.value >= 0 ? C.violent : C.volume, [it.value >= 0 ? "left" : "right"]: "50%" }} />
          </span>
          <span style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{it.value > 0 ? "+" : ""}{fmt(it.value, 0)}{unit}</span>
        </div>
      ))}
      <div className="legend"><span><i style={{ background: C.volume }} />Fewer per day</span><span><i style={{ background: C.violent }} />More per day</span></div>
    </div>
  );
}

