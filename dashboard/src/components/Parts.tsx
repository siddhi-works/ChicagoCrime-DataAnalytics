import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "motion/react";
import type { Filters, Cube } from "../lib/engine";
import type { InsightJson, KPIJson } from "../lib/data";
import { C, Counter, fmt } from "../lib/ui";

/* ───────── Card: chart container with Q-tag, table view, caveats ───────── */
export interface TableSpec { columns: string[]; rows: (string | number)[][] }
export function Card({ q, title, sub, span = 6, table, caveats, children, extra, accent }:
  { accent?: string; q: string; title: string; sub?: string; span?: 3 | 4 | 5 | 6 | 7 | 8 | 12; table?: TableSpec; caveats?: string[]; children: ReactNode; extra?: ReactNode }) {
  const [view, setView] = useState(false);
  return (
    <motion.section className={`card c-${span}`} style={accent ? ({ ["--accent" as string]: accent }) : undefined} initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} aria-label={title}>
      <div className="card-head">
        <div><h3>{title}</h3>{sub && <div className="sub">{sub}</div>}</div>
        <div className="card-tools">
          {table && <button className="tbtn" aria-pressed={view} onClick={() => setView(!view)}>{view ? "Chart" : "Table"}</button>}
          <span className={`qtag ${q.startsWith("Q") ? "" : "x"}`} title={q.startsWith("Q") ? "Required by the competition handout" : "Extra analysis"}>{q}</span>
        </div>
      </div>
      {view && table ? (
        <div className="tablewrap"><table className="dt"><thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{typeof v === "number" ? fmt(v, Number.isInteger(v) ? 0 : 2) : v}</td>)}</tr>)}</tbody></table></div>
      ) : children}
      {extra}
      {caveats && caveats.length > 0 && <div className="caveat">{caveats.join(" · ")}</div>}
    </motion.section>
  );
}

/* ───────── Chapter with scroll-linked headline ───────── */
export function Chapter({ n, title, lead, children, id }: { n: string; title: string; lead: string; children: ReactNode; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 35%"] });
  const x = useTransform(scrollYProgress, [0, 1], [-60, 0]);
  const o = useTransform(scrollYProgress, [0, 0.7], [0.15, 1]);
  return (
    <div className="chapter wrap" id={id}>
      <div className="chapter-head" ref={ref}>
        <motion.div className="chapter-num" style={{ x, opacity: o }} aria-hidden>{n}</motion.div>
        <motion.h2 style={{ opacity: o }}>{title}</motion.h2>
        <p className="chapter-lead">{lead}</p>
      </div>
      <div className="grid">{children}</div>
    </div>
  );
}

/* ───────── Insight (text comes from insights.json — nothing typed here) ───────── */
export function Insight({ i, span = 6 }: { i?: InsightJson; span?: 4 | 5 | 6 | 7 | 12 }) {
  if (!i) return null;
  return (
    <motion.article className={`insight c-${span} ${i.tier === "data_quality" ? "dq" : ""}`} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}>
      <span className={`chip ${i.tier}`}>{i.tier.replace("_", " ")}</span>
      <h4>{i.headline}</h4>
      <p>{i.text}</p>
      <details><summary>How we know</summary><p><b>Method:</b> {i.method}</p>{i.caveat && <p><b>Caveat:</b> {i.caveat}</p>}</details>
    </motion.article>
  );
}

/* ───────── KPI placard ───────── */
const ACCENT: Record<string, string> = { K1: C.volume, K2: C.arrest, K3: C.domestic, K4: C.volume2, K5: C.volume, K6: C.volume2, K7: "#7f8fe8", K8: C.violent };
export function KpiCard({ k, value, decimals, unit, sub, ratio, note }: { k: KPIJson; value: number; decimals: number; unit?: string; sub: string; ratio?: number; note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  return (
    <motion.div ref={ref} className="kpi" style={{ ["--accent" as string]: ACCENT[k.id] }}
      initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, rotateX: tilt.rx, rotateY: tilt.ry }}
      transition={{ duration: 0.8, delay: (Number(k.id.slice(1)) % 4) * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        ref.current!.style.setProperty("--mx", `${px * 100}%`); ref.current!.style.setProperty("--my", `${py * 100}%`);
        setTilt({ rx: (0.5 - py) * 7, ry: (px - 0.5) * 9 });
      }} onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}>
      <div className="tag"><span className="mono">{k.id}</span><i /></div>
      <div className="val"><Counter value={value} decimals={decimals} />{unit && <small>{unit}</small>}</div>
      <h3>{k.label}</h3>
      <p>{sub}</p>
      {note && <p style={{ fontSize: 11.5, marginTop: 6, color: "var(--arrest-text)" }}>{note}</p>}
      {ratio !== undefined && <div className="bar"><span><motion.i style={{ display: "block" }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, ratio)}%` }} transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }} /></span></div>}
    </motion.div>
  );
}

/* ───────── Filter controls (≥2 required by the handout: we give 4) ───────── */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const idx = Math.max(0, options.findIndex((o) => o.v === value));
  return (
    <div className="fgroup"><span className="mono">{label}</span>
      <div className="seg" role="group" aria-label={label} style={{ display: "inline-grid", gridAutoFlow: "column", gridAutoColumns: "1fr" }}>
        <motion.span className="thumb" initial={false} animate={{ left: `calc(${(idx * 100) / options.length}% + 3px)`, width: `calc(${100 / options.length}% - 6px)` }} transition={{ type: "spring", stiffness: 380, damping: 32 }} style={{ inset: "3px auto 3px 0" }} />
        {options.map((o) => <button key={o.v} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function MultiSelect({ label, items, selected, onToggle, onClear }: { label: string; items: { id: number; label: string; color?: string }[]; selected: Set<number>; onToggle: (id: number) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("pointerdown", f); addEventListener("keydown", k);
    return () => { removeEventListener("pointerdown", f); removeEventListener("keydown", k); };
  }, []);
  const shown = useMemo(() => items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())), [items, q]);
  return (
    <div className="ms" ref={box}>
      <button className="ms-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mono" style={{ fontSize: 10.5 }}>{label}</span>
        <span>{selected.size === 0 ? "All" : selected.size === 1 ? items.find((i) => selected.has(i.id))?.label.toLowerCase() : `${selected.size} selected`}</span>
        {selected.size > 0 && <span className="count">{selected.size}</span>}<span aria-hidden style={{ color: "var(--muted)" }}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="ms-pop" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <input autoFocus placeholder={`Search ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search ${label}`} />
            <div className="ms-list" role="listbox" aria-multiselectable>
              {shown.map((i) => (
                <button key={i.id} role="option" aria-checked={selected.has(i.id)} className="ms-item" onClick={() => onToggle(i.id)}>
                  <span className="box">{selected.has(i.id) && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.2l2.3 2.3L8.5 2.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}</span>
                  {i.color && <span className="sw" style={{ background: i.color }} />}<span style={{ textTransform: "capitalize" }}>{i.label.toLowerCase()}</span>
                </button>))}
              {shown.length === 0 && <div className="mono" style={{ padding: 12 }}>No match</div>}
            </div>
            {selected.size > 0 && <button className="reset" style={{ margin: 8 }} onClick={onClear}>Clear {label.toLowerCase()}</button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FilterBar({ cube, f, setF, inView, total }: { cube: Cube; f: Filters; setF: (f: Filters) => void; inView: number; total: number }) {
  const L = cube.lookups;
  const toggle = (key: "types" | "districts") => (id: number) => { const s = new Set(f[key]); s.has(id) ? s.delete(id) : s.add(id); setF({ ...f, [key]: s }); };
  const clear = (key: "types" | "districts") => () => setF({ ...f, [key]: new Set() });
  const active = f.types.size + f.districts.size > 0 || f.arrest !== null || f.domestic !== null;
  const tItems = L.primary_type.map((t, i) => ({ id: i, label: t, color: C.categories[L.crime_category_of_type[i]] }));
  const dItems = L.district.map((d, i) => ({ id: i, label: `District ${d}` }));
  return (
    <div className="filterbar" role="search" aria-label="Dashboard filters">
      <div className="filterbar-in">
        <MultiSelect label="Crime type" items={tItems} selected={f.types} onToggle={toggle("types")} onClear={clear("types")} />
        <MultiSelect label="District" items={dItems} selected={f.districts} onToggle={toggle("districts")} onClear={clear("districts")} />
        <Segmented label="Arrest" value={String(f.arrest) as "null" | "1" | "0"} onChange={(v) => setF({ ...f, arrest: v === "null" ? null : (Number(v) as 0 | 1) })} options={[{ v: "null", label: "All" }, { v: "1", label: "Arrested" }, { v: "0", label: "No arrest" }]} />
        <Segmented label="Domestic" value={String(f.domestic) as "null" | "1" | "0"} onChange={(v) => setF({ ...f, domestic: v === "null" ? null : (Number(v) as 0 | 1) })} options={[{ v: "null", label: "All" }, { v: "1", label: "Domestic" }, { v: "0", label: "Other" }]} />
        <div className="fb-right">
          <div className="inview"><span className="mono">In view </span><b><Counter value={inView} duration={0.5} /></b><span className="mono"> / {fmt(total)}</span></div>
          <button className="reset" disabled={!active} onClick={() => setF({ types: new Set(), districts: new Set(), arrest: null, domestic: null })}>Reset</button>
        </div>
      </div>
    </div>
  );
}
