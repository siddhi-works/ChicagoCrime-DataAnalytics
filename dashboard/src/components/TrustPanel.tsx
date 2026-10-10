import { useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import type { Bundle } from "../lib/data";
import { C, fmt } from "../lib/ui";
import { Card, Insight } from "./Parts";
import { Heatmap } from "../charts/Charts";

type Sec = "source" | "pipeline" | "metrics" | "methods" | "quality" | "limits";
const SECS: { id: Sec; label: string; color: string }[] = [
  { id: "source", label: "1 · Source", color: C.volume2 }, { id: "pipeline", label: "2 · Pipeline", color: "#2bd69c" },
  { id: "metrics", label: "3 · Metrics", color: C.arrestText }, { id: "methods", label: "4 · Methods", color: C.property },
  { id: "quality", label: "5 · Data quality", color: C.violent }, { id: "limits", label: "6 · Limits", color: C.domestic },
];
const MEANING: Record<string, string> = {
  K1: "How many crime reports exist. One row = one reported crime.",
  K2: "Of all reported crimes, the share where someone was arrested.",
  K3: "The share flagged as domestic-related (e.g. between family or household members).",
  K4: "How many different crime categories (Primary Type) appear.",
  K5: "Reports dated in calendar year 2016 only.",
  K6: "Typical monthly volume across the 28 months from April 2015 to July 2017.",
  K7: "The share happening in the small hours, midnight to 05:59.",
  K8: "The share that is violent: assault, battery, robbery, homicide, sexual assault (both labels) and kidnapping.",
};
const GLOSSARY: [string, string][] = [
  ["Arrest rate", "Crimes with an arrest ÷ all crimes. It describes police outcomes, not how dangerous a place is."],
  ["Standardised rate", "An arrest rate re-computed as if every group had the same crime-type mix, so groups compare fairly."],
  ["Index (SIR)", "Observed arrests ÷ arrests expected from a district’s crime-type mix. 1.00 = as expected; 1.20 = 20% more."],
  ["Location quotient", "A district’s share of a crime type ÷ the city-wide share. Above 1 means it over-indexes on that type."],
  ["Effect size", "How big a difference is. With ~10⁵–10⁶ rows almost everything is ‘significant’, so size matters more than p-values."],
  ["Placeholder timestamp", "A record stamped exactly 00:00 or 12:00, which is often a default for ‘time unknown’."],
  ["Window A / B", "The two near-complete periods in the file: Apr 2015 – Jul 2017 and Oct 2025 – Aug 2026."],
];

export function TrustPanel({ b, verified }: { b: Bundle; verified: { ok: boolean; n: number } | null }) {
  const [sec, setSec] = useState<Sec>("source");
  const m = b.methodology, cl = b.cleaning, I = b.insights, mf = b.methodologyFull;
  const base = b.engine.compute({ types: new Set(), districts: new Set(), arrest: null, domestic: null });
  const kv = Object.fromEntries(b.kpis.map((k) => [k.id, k]));
  const last = (d: string) => new Date(new Date(d).getTime() - 864e5).toISOString().slice(0, 10);
  const grid = b.charts.x_coverage_grid.data as { year: number; month: number; records: number }[];
  const years = [...new Set(grid.map((g) => g.year))].sort();
  const cov = years.map((y) => Array.from({ length: 12 }, (_, i) => grid.find((g) => g.year === y && g.month === i + 1)?.records ?? 0));
  const dr = cl.date_repair, mod = mf.models, glm = mf.glm;
  const clus = I.hourly_clusters?.evidence as { k?: number; silhouette?: number } | undefined;
  const seas = I.seasonality?.evidence as { n_days?: number } | undefined;

  const steps = [
    { n: 1, t: "Load", c: "#6da7ec", d: `Read the Excel workbook in read-only mode: ${fmt(cl.rows_in)} rows × 22 columns. The original file is never modified (checked by SHA-256).` },
    { n: 2, t: "Repair dates", c: "#2bd69c", d: `${fmt(dr.excel_datetime_cells_swapped)} Date cells had month and day swapped by Excel; swapped back. Records dated after their own update stamp fell from ${fmt(dr.date_after_updated_on_share_before_repair * 100, 1)}% to ${fmt(dr.date_after_updated_on_share_after_repair * 100, 1)}%.` },
    { n: 3, t: "Clean", c: "#f0b43c", d: `${fmt(cl.coords_outside_chicago_nulled)} impossible coordinates blanked, ${fmt(cl.community_area_zero_to_null)} community-area zeros → missing, ${fmt(cl.location_description_null_filled_UNKNOWN)} empty places → UNKNOWN. No rows deleted; ${fmt(cl.duplicate_ids)} duplicate IDs.` },
    { n: 4, t: "Engineer", c: "#9085e9", d: "Added Time of Day, Season, Crime Category (handout definitions), hour, weekday, month, and flags for placeholder times and missing coordinates." },
    { n: 5, t: "Analyse", c: "#e66767", d: "Found the two dense periods from daily counts, then ran statistics and models with confidence intervals and hold-out tests (see Methods)." },
    { n: 6, t: "Validate", c: "#d55181", d: `Checked totals, orders, sort rules and the filter cube against the raw rows; handout anchor values reproduced exactly (K1 ${fmt(kv.K1.value)}, K2 ${fmt(kv.K2.value, 1)}%).` },
    { n: 7, t: "Visualise", c: "#5db8f5", d: "The dashboard only draws exported results; filters recompute from the same cube, so every card and chart agrees." },
  ];
  const methods = [
    { t: "Finding the reliable periods", a: "Daily record counts; runs ≥ 60 days with ≥ 200 records/day", w: "The file is a slice of a bigger table, so only dense periods can support trend claims.", c: C.volume2 },
    { t: "Seasonality", a: `Summer vs winter crimes per day; bootstrap 95% CI over ${fmt(seas?.n_days ?? 0)} days; Kruskal-Wallis`, w: "Shows how large the swing is, not only whether it exists.", c: "#2bd69c" },
    { t: "Weekday & hour effects", a: "Observed ÷ expected per weekday with exact Poisson CIs; Cohen’s w; placeholder times excluded", w: "At this sample size effect size tells the real story.", c: "#5db8f5" },
    { t: "Fair arrest comparison", a: "Direct standardisation by time; indirect standardisation (index) by district with exact CIs and Benjamini-Hochberg FDR", w: "Raw arrest rates mix ‘what happened’ with ‘how police responded’.", c: C.arrestText },
    { t: "What predicts arrest", a: `Logistic regression + gradient boosting, trained before ${mod?.test_from}, tested after (AUC ${fmt(mod?.auc_logistic ?? 0, 2)} / ${fmt(mod?.auc_gradient_boosting ?? 0, 2)}); permutation importance`, w: "Tests that findings hold on unseen months, not just memorised ones.", c: C.violent },
    { t: "Daily expectation & anomalies", a: `Poisson model on weekday + month + holiday; hold-out error ${fmt((glm?.mape_glm ?? 0) * 100, 1)}%; robust MAD z-scores`, w: "Separates genuine spikes from normal weekly and seasonal rhythm.", c: C.property },
    { t: "Crime-type timing groups", a: `k-means on 24-hour profiles, k = ${clus?.k} chosen by silhouette (${fmt(clus?.silhouette ?? 0, 2)})`, w: "Groups crimes by when they happen; descriptive only.", c: C.domestic },
    { t: "Spatial patterns", a: "Location quotients per district × type; Lorenz curve and Gini across police beats; ~550 m grid", w: "Shows concentration and specialisation without needing population data.", c: "#6da7ec" },
  ];

  return (
    <div>
      <div className="subtabs" role="tablist" aria-label="Data trust sections">
        <LayoutGroup id="trust">
          {SECS.map((s) => (
            <button key={s.id} role="tab" aria-selected={sec === s.id} className="subtab" onClick={() => setSec(s.id)} style={{ ["--tc" as string]: s.color }}>
              {sec === s.id && <motion.span layoutId="trustpill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="tab-tx">{s.label}</span>
            </button>))}
        </LayoutGroup>
      </div>

      <motion.div key={sec} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {sec === "source" && (
          <div className="grid">
            <Card q="Source" accent={C.volume2} title="Where the data comes from" span={5}>
              <div className="trust-p"><p>{m.source.provenance}</p>
                <dl className="facts">
                  <div><dt>File</dt><dd>{m.source.file}</dd></div>
                  <div><dt>Rows</dt><dd>{fmt(cl.rows_in)} (one crime report each)</dd></div>
                  <div><dt>Window A</dt><dd>{m.windows.A.start} → {last(m.windows.A.end_exclusive)} · {fmt(m.windows.A.records)} records</dd></div>
                  <div><dt>Window B</dt><dd>{m.windows.B.start} → {last(m.windows.B.end_exclusive)} · {fmt(m.windows.B.records)} records</dd></div>
                  <div><dt>Elsewhere</dt><dd>{fmt(m.records_outside_windows)} records spread thinly over other years</dd></div>
                </dl>
                <p className="note">The file holds exactly Excel’s maximum row count, so it looks like a truncated slice of the full Chicago Police table. We cite it as supplied by the organisers.</p></div>
            </Card>
            <Card q="Source" accent="#8f8cf0" title="How complete is each month?" sub="Records per month, 2001 – 2026 · bright = dense" span={7} caveats={["Only two periods are near-complete, so trends are only claimed inside them"]}>
              <Heatmap rows={years.map(String)} cols={["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]} values={cov} rowTitle="year" colTitle="Month" cellH={13} showValues={false} unit="records" />
            </Card>
          </div>)}

        {sec === "pipeline" && (
          <div className="pipeline">
            {steps.map((s, i) => (
              <motion.article key={s.n} className="step" style={{ ["--sc" as string]: s.c }} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.5 }}>
                <span className="step-n">{s.n}</span><h4>{s.t}</h4><p>{s.d}</p>
              </motion.article>))}
          </div>)}

        {sec === "metrics" && (
          <div>
            <div className="metric-grid">
              {b.kpis.map((k, i) => (
                <motion.article key={k.id} className="metric" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className="mono">{k.id}</div><h4>{k.label}</h4>
                  <p>{MEANING[k.id]}</p>
                  <code>{k.formula}</code>
                  <b>{k.unit === "%" ? `${fmt(k.value, 1)}%` : fmt(k.value)}</b>
                </motion.article>))}
            </div>
            <div className="grid" style={{ marginTop: 16 }}>
              <section className="assump c-6" style={{ margin: 0 }}><b>Handout definitions used everywhere</b>
                <ul><li><b>Time of Day:</b> {m.definitions.time_of_day}</li><li><b>Season:</b> {m.definitions.season}</li><li><b>Category:</b> {m.definitions.crime_category}</li><li><b>Whole dataset</b> for every KPI and chart unless a period is stated (K6/Q1: Apr 2015–Jul 2017, Q4: 2016).</li></ul></section>
              <section className="assump c-6" style={{ margin: 0 }}><b>Plain-English glossary</b>
                <ul>{GLOSSARY.map(([t, d]) => <li key={t}><b>{t}:</b> {d}</li>)}</ul></section>
            </div>
            <p className="mono" style={{ marginTop: 12 }}>Values shown are for the whole dataset ({fmt(base.total)} crimes), unaffected by dashboard filters.</p>
          </div>)}

        {sec === "methods" && (
          <div className="method-grid">
            {methods.map((x, i) => (
              <motion.article key={x.t} className="method" style={{ ["--mc" as string]: x.c }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <h4>{x.t}</h4><p><b>How:</b> {x.a}</p><p><b>Why:</b> {x.w}</p>
              </motion.article>))}
            <section className="assump" style={{ margin: 0, gridColumn: "1 / -1" }}>Everything uses fixed random seeds, so results reproduce exactly. Confidence intervals and hold-out tests are reported instead of relying on p-values alone, and multiple comparisons are corrected (Benjamini-Hochberg).</section>
          </div>)}

        {sec === "quality" && (
          <div className="grid">
            <Insight i={I.dq_date_repair} span={6} /><Insight i={I.dq_coverage} span={6} />
            <Insight i={I.dq_first_of_month} span={6} /><Insight i={I.dq_placeholder_time} span={6} />
            <Insight i={I.dq_missing_coords} span={12} />
            <section className="card c-12" style={{ ["--accent" as string]: C.arrestText }}>
              <div className="card-head"><div><h3>Cleaning log</h3><div className="sub">Every automatic action, with counts (cleaning_log.json)</div></div></div>
              <div className="tablewrap"><table className="dt"><tbody>
                {([["Rows in / out", `${fmt(cl.rows_in)} / ${fmt(cl.rows_out)}`], ["Date cells swapped back", fmt(dr.excel_datetime_cells_swapped)], ["Dates still unparseable", fmt(dr.unparseable)],
                  ["Year column matches repaired Date", `${fmt(dr.year_matches_Year_col_after * 100, 1)}%`], ["Coordinates missing", fmt(cl.coords_missing)], ["Coordinates outside Chicago → blank", fmt(cl.coords_outside_chicago_nulled)],
                  ["Community area 0 → missing", fmt(cl.community_area_zero_to_null)], ["Place empty → UNKNOWN", fmt(cl.location_description_null_filled_UNKNOWN)],
                  ["Crime types (raw / merged sexual-assault labels)", `${cl.primary_types_raw} / ${cl.primary_types_harmonised}`], ["Duplicate IDs / duplicate rows", `${cl.duplicate_ids} / ${cl.duplicate_full_rows}`], ["Repeated case numbers kept", fmt(cl.duplicate_case_numbers_kept)]] as [string, string][])
                  .map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
              </tbody></table></div>
            </section>
          </div>)}

        {sec === "limits" && (
          <div className="grid">
            <section className="insight c-6"><span className="chip supporting">Assumptions</span><h4>What we assumed</h4><ul className="biglist">{m.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></section>
            <section className="insight c-6 dq"><span className="chip data_quality">Limitations</span><h4>What still limits the conclusions</h4><ul className="biglist">{m.limitations.map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="verified" style={{ marginTop: 14 }}>{verified && <><i style={{ background: verified.ok ? "var(--good)" : "var(--violent)" }} />{verified.ok ? `Verified: this page’s calculations match the Python export (${verified.n}/${verified.n})` : "Check failed: browser and Python results differ"}</>}</p></section>
            <section className="assump c-12" style={{ margin: 0 }}><b>What would change the conclusions:</b> population or area denominators (for per-capita rates), a complete window B with final arrest outcomes, and a flag that marks estimated dates.</section>
          </div>)}
      </motion.div>
    </div>
  );
}
