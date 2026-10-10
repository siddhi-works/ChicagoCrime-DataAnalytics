import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { loadBundle, type Bundle } from "./lib/data";
import { NO_FILTERS, type Filters, type Results } from "./lib/engine";
import { C, TooltipLayer, fmt, pct } from "./lib/ui";
import { Card, FilterBar, Insight, KpiCard } from "./components/Parts";
import { Welcome } from "./components/Welcome";
import { Columns, Combo, Donut, DivBars, HBars, Heatmap, LineChart, Scatter } from "./charts/Charts";
import { MapPanel } from "./components/MapPanel";
import { TrustPanel } from "./components/TrustPanel";
import { Chat } from "./components/Chat";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TODS = ["Night", "Morning", "Afternoon", "Evening"];
const SEASONS = ["Winter", "Spring", "Summer", "Fall"];
const CATS = ["Violent", "Property", "Other"];
const rate = (a: number, n: number) => (n ? (a / n) * 100 : 0);
type Tab = "dashboard" | "story" | "map" | "trust";
type Story = "time" | "arrests" | "places" | "then";
const TABS: { id: Tab; label: string; icon: string; color: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◧", color: C.volume2 },
  { id: "story", label: "Story", icon: "✦", color: C.property },
  { id: "map", label: "Map", icon: "◎", color: "#2bd69c" },
  { id: "trust", label: "Data trust", icon: "✓", color: C.arrestText },
];
const STORIES: { id: Story; label: string; color: string }[] = [
  { id: "time", label: "When", color: C.volume2 }, { id: "arrests", label: "Arrests", color: C.arrestText },
  { id: "places", label: "What & where", color: C.domestic }, { id: "then", label: "Then vs now", color: C.violent },
];

/** Runtime self-check: with no filters, the browser's cube maths must equal the Python export. */
function selfCheck(b: Bundle, r: Results) {
  const q = (id: string) => b.baseline[id].data;
  const k = Object.fromEntries(b.kpis.map((x) => [x.id, x]));
  const same = (a: unknown, c: unknown) => JSON.stringify(a) === JSON.stringify(c);
  const checks = [
    r.total === k.K1.value, r.arrests === k.K2.numerator, r.domestic === k.K3.numerator, r.night === k.K7.numerator, r.violent === k.K8.numerator,
    r.typesPresent === k.K4.value, r.y2016 === k.K5.value,
    same(r.monthly.map((m) => m.crimes), q("q01").map((d) => d.crimes)), same(r.dow, q("q02").map((d) => d.crimes)),
    same(r.tod, q("q03").map((d) => d.crimes)), same(r.season2016, q("q04").map((d) => d.crimes)), same(r.category, q("q05").map((d) => d.crimes)),
    same(r.topTypes.map((t) => t.name), q("q07").map((d) => d["Primary Type"])), same(r.topDomestic.map((t) => t.name), q("q08").map((d) => d["Primary Type"])),
    same(r.topDistricts.map((t) => t.code), q("q09").map((d) => d.District)),
  ];
  return { ok: checks.every(Boolean), n: checks.length };
}

export default function App() {
  const [b, setB] = useState<Bundle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(NO_FILTERS());
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [story, setStory] = useState<Story>("time");
  const [district, setDistrict] = useState<number | null>(null);
  useEffect(() => { loadBundle().then(setB).catch((e) => setErr(String(e))); }, []);

  const df = useDeferredValue(f);
  const stale = df !== f;
  const r = useMemo(() => (b ? b.engine.compute(df) : null), [b, df]);
  const base = useMemo(() => (b ? b.engine.compute(NO_FILTERS()) : null), [b]);
  const check = useMemo(() => (b && base ? selfCheck(b, base) : null), [b, base]);

  if (err) return <div className="loading">Could not load data: {err}. Run <code>python run_all.py</code> then <code>npm run dev</code>.</div>;
  if (!b || !r || !base) return <div className="loading">Loading the Chicago police record…</div>;

  const L = b.engine.cube.lookups;
  const kp = Object.fromEntries(b.kpis.map((k) => [k.id, k]));
  const I = b.insights;
  const fil = f.types.size + f.districts.size > 0 || f.arrest !== null || f.domestic !== null;
  const pickType = (name: string) => { const i = L.primary_type.indexOf(name), s = new Set(f.types); s.has(i) ? s.delete(i) : s.add(i); setF({ ...f, types: s }); };
  const pickDistrict = (code: string) => { const i = L.district.indexOf(Number(code)), s = new Set(f.districts); s.has(i) ? s.delete(i) : s.add(i); setF({ ...f, districts: s }); };
  const selTypes = new Set([...f.types].map((i) => L.primary_type[i]));
  const selDist = new Set([...f.districts].map((i) => String(L.district[i])));
  const w = b.methodology.windows;
  const last = (d: string) => new Date(new Date(d).getTime() - 864e5).toISOString().slice(0, 10);
  const heatX = (() => {
    const rows = b.charts.x_hour_dow_heatmap.data;
    return DAYS.map((d) => Array.from({ length: 24 }, (_, h) => rows.find((x) => x.day_of_week === d && x.hour === h)?.per_day ?? 0));
  })();
  const filterBar = <FilterBar cube={b.engine.cube} f={f} setF={setF} inView={r.total} total={base.total} />;

  return (
    <div className={stale ? "stale" : ""}>
      <TooltipLayer />
      <div className="orb o1 fixed" /><div className="orb o2 fixed" /><div className="orb o3 fixed" />

      <AnimatePresence>
        {!entered && (
          <Welcome key="welcome" cells={b.grid} total={fmt(kp.K1.value)} types={String(kp.K4.value)} arrestRate={pct(kp.K2.value, 1)} onEnter={() => setEntered(true)} />
        )}
      </AnimatePresence>

      {entered && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}>
          {/* ───────── top nav ───────── */}
          <nav className="topnav" aria-label="Sections">
            <div className="topnav-in wrap">
              <button className="brand" onClick={() => setEntered(false)} title="Back to welcome" style={{ background: "none", border: 0, padding: 0 }}>
                <i><svg width="20" height="20" viewBox="0 0 32 32"><path d="M16 4l3.2 7.8 8.4.7-6.4 5.5 2 8.2L16 21.8 8.8 26.2l2-8.2-6.4-5.5 8.4-.7z" fill="#e66767" /></svg></i>
                <span>Chicago Crime Branch<small>Team Moleculens</small></span>
              </button>
              <LayoutGroup>
                <div className="tabs" role="tablist">
                  {TABS.map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => setTab(t.id)} style={{ ["--tc" as string]: t.color }}>
                      {tab === t.id && <motion.span layoutId="tabpill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <span className="tab-ic" aria-hidden>{t.icon}</span><span className="tab-tx">{t.label}</span>
                    </button>))}
                </div>
              </LayoutGroup>
            </div>
          </nav>

          <main className="wrap view">
            <div className="casebar" aria-hidden>
              <span><i />Case file <b>CHI-{kp.K1.value}</b></span><span>Status <b>Open</b></span><span>Lead <b>Team Moleculens</b></span><span>Evidence <b>{fmt(r.total)} reports in view</b></span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={tab + (tab === "story" ? story : "")} initial={{ opacity: 0, y: 18, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -12, filter: "blur(6px)" }} transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}>

                {/* ═════════ DASHBOARD: 8 KPIs + 10 required charts on one page ═════════ */}
                {tab === "dashboard" && (<>
                  {filterBar}
                  {r.total === 0 && <p className="insight" style={{ marginBottom: 14 }}>No crimes match this combination of filters. Reset to see the full picture.</p>}
                  <section className="kpis dense" aria-label="Key performance indicators">
                    <KpiCard k={kp.K1} value={r.total} decimals={0} sub={fil ? `of ${fmt(base.total)} in dataset` : "rows in the dataset"} />
                    <KpiCard k={kp.K2} value={rate(r.arrests, r.total)} decimals={1} unit="%" sub={`${fmt(r.arrests)} arrests`} ratio={rate(r.arrests, r.total)} />
                    <KpiCard k={kp.K3} value={rate(r.domestic, r.total)} decimals={1} unit="%" sub={`${fmt(r.domestic)} domestic`} ratio={rate(r.domestic, r.total)} />
                    <KpiCard k={kp.K4} value={r.typesPresent} decimals={0} sub="distinct Primary Types" note={!fil && kp.K4.harmonised_value ? `${kp.K4.harmonised_value} if two labels merged` : undefined} />
                    <KpiCard k={kp.K5} value={r.y2016} decimals={0} sub="reports dated 2016" />
                    <KpiCard k={kp.K6} value={r.windowTotal / r.windowMonths} decimals={0} sub={`per month, Apr 2015–Jul 2017`} />
                    <KpiCard k={kp.K7} value={rate(r.night, r.total)} decimals={1} unit="%" sub={`${fmt(r.night)} at 00:00–05:59`} ratio={rate(r.night, r.total)} note={!fil && kp.K7.sensitivity_value ? `${fmt(kp.K7.sensitivity_value, 1)}% excl. placeholder times` : undefined} />
                    <KpiCard k={kp.K8} value={rate(r.violent, r.total)} decimals={1} unit="%" sub={`${fmt(r.violent)} violent`} ratio={rate(r.violent, r.total)} />
                  </section>

                  <div className="grid" style={{ marginTop: 16 }}>
                    <Card q="Q1" accent={C.volume2} title="Monthly crime count" sub="Apr 2015 – Jul 2017 · 28 months" span={8} table={{ columns: ["Month", "Crimes"], rows: r.monthly.map((m) => [m.label, m.crimes]) }}>
                      <LineChart height={250} points={r.monthly.map((m) => ({ label: m.label, value: m.crimes }))} yTitle="Number of crimes" xTitle="Month" />
                    </Card>
                    <Card q="Q5" accent={C.property} title="Violent · Property · Other" sub="Share of crimes" span={4} table={{ columns: ["Category", "Crimes", "Share %"], rows: CATS.map((c, i) => [c, r.category[i], rate(r.category[i], r.total)]) }}>
                      <Donut items={CATS.map((c, i) => ({ label: c, value: r.category[i], color: C.categories[c] }))} centerLabel="crimes" />
                    </Card>
                    <Card q="Q2" accent="#5db8f5" title="By day of week" sub="Monday → Sunday" span={4} table={{ columns: ["Day", "Crimes"], rows: DAYS.map((d, i) => [d, r.dow[i]]) }}>
                      <Columns height={220} items={DAYS.map((d, i) => ({ label: d.slice(0, 3), value: r.dow[i] }))} color="#5db8f5" yTitle="Crimes" xTitle="Day of week" />
                    </Card>
                    <Card q="Q3" accent="#8f8cf0" title="By time of day" sub="Night · Morning · Afternoon · Evening" span={4} table={{ columns: ["Time of day", "Crimes"], rows: TODS.map((d, i) => [d, r.tod[i]]) }}>
                      <Columns height={220} items={TODS.map((d, i) => ({ label: d, value: r.tod[i] }))} color="#8f8cf0" yTitle="Crimes" xTitle="Time of day" />
                    </Card>
                    <Card q="Q4" accent="#2bd69c" title="By season" sub="2016 only" span={4} table={{ columns: ["Season", "Crimes"], rows: SEASONS.map((s, i) => [s, r.season2016[i]]) }}>
                      <Columns height={220} items={SEASONS.map((s, i) => ({ label: s, value: r.season2016[i], color: ["#5db8f5", "#2bd69c", "#f0b43c", "#e8844a"][i] }))} yTitle="Crimes" xTitle="Season (2016)" />
                    </Card>
                    <Card q="Q7" accent={C.violent} title="Top 10 crime types" sub="Click a bar to filter · colour = category" span={6} table={{ columns: ["Crime type", "Crimes"], rows: r.topTypes.map((t) => [t.name, t.crimes]) }}
                      extra={<div className="legend">{CATS.map((c) => <span key={c}><i style={{ background: C.categories[c] }} />{c}</span>)}</div>}>
                      <HBars items={r.topTypes.map((t) => ({ key: t.name, label: t.name, value: t.crimes, color: C.categories[t.category], sub: `${t.category} crime` }))} selected={selTypes} onPick={pickType} />
                    </Card>
                    <Card q="Q8" accent={C.domestic} title="Top 5 domestic crime types" sub="Click a bar to filter" span={6} table={{ columns: ["Crime type", "Domestic crimes"], rows: r.topDomestic.map((t) => [t.name, t.crimes]) }}>
                      <HBars items={r.topDomestic.map((t) => ({ key: t.name, label: t.name, value: t.crimes, color: C.domestic }))} selected={selTypes} onPick={pickType} />
                    </Card>
                    <Card q="Q6" accent={C.arrestText} title="Arrest rate % by time of day" sub="Night → Evening" span={4} table={{ columns: ["Time of day", "Arrests", "Crimes", "Rate %"], rows: TODS.map((t, i) => [t, r.todArrests[i], r.tod[i], rate(r.todArrests[i], r.tod[i])]) }}>
                      <Columns height={250} items={TODS.map((t, i) => ({ label: t, value: rate(r.todArrests[i], r.tod[i]) }))} color={C.arrest} yTitle="Arrest rate %" xTitle="Time of day" valueFmt={(n) => pct(n, 1)} />
                    </Card>
                    <Card q="Q9" accent={C.arrestText} title="Top 10 districts: crimes + arrest rate" sub="Bars: crimes · line (right axis): arrest rate % · click to filter" span={8} table={{ columns: ["District", "Crimes", "Arrests", "Arrest rate %"], rows: r.topDistricts.map((d) => [`District ${d.code}`, d.crimes, d.arrests, d.rate]) }}>
                      <Combo height={290} items={r.topDistricts.map((d) => ({ key: String(d.code), label: `D${d.code}`, crimes: d.crimes, rate: d.rate }))} selected={selDist} onPick={pickDistrict} />
                    </Card>
                    <Card q="Q10" accent="#6da7ec" title="Day of week × time of day" sub="Colour scale: darker = fewer, brighter = busier" span={8} table={{ columns: ["Day", ...TODS], rows: DAYS.map((d, j) => [d, ...r.heat[j]]) }}>
                      <Heatmap rows={DAYS} cols={TODS} values={r.heat} rowTitle="day" colTitle="Time of day" cellH={36} />
                    </Card>
                    <section className="assump c-4" role="note" style={{ margin: 0 }}>
                      <b>Definitions & assumptions</b>
                      <ul>
                        <li><b>Time of Day:</b> Night 00–05, Morning 06–11, Afternoon 12–17, Evening 18–23.</li>
                        <li><b>Season:</b> Winter Dec–Feb · Spring Mar–May · Summer Jun–Aug · Fall Sep–Nov.</li>
                        <li><b>Violent:</b> assault, battery, robbery, homicide, both sexual-assault labels, kidnapping. <b>Property:</b> theft, burglary, motor vehicle theft, criminal damage, arson.</li>
                        <li>K1–K5, K7–K8, Q2–Q3, Q5–Q10 use the whole dataset; K6 and Q1 use Apr 2015–Jul 2017; Q4 uses 2016.</li>
                        <li>{b.methodology.assumptions[0]}</li>
                      </ul>
                    </section>
                  </div>
                </>)}

                {/* ═════════ STORY: chapters as sub-tabs (no endless scroll) ═════════ */}
                {tab === "story" && (<>
                  <div className="subtabs" role="tablist" aria-label="Story chapters">
                    <LayoutGroup id="story">
                      {STORIES.map((s) => (
                        <button key={s.id} role="tab" aria-selected={story === s.id} className="subtab" onClick={() => setStory(s.id)} style={{ ["--tc" as string]: s.color }}>
                          {story === s.id && <motion.span layoutId="subpill" className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                          <span className="tab-tx">{s.label}</span>
                        </button>))}
                    </LayoutGroup>
                  </div>
                  {story === "time" && (
                    <div className="grid">
                      <Insight i={I.seasonality} span={4} />
                      <Card q="Extra" accent={C.volume2} title="Which crimes follow the sun?" sub="Summer ÷ winter crimes per day" span={8} caveats={["1.00 = no swing · window A · not filtered"]}>
                        <HBars items={b.charts.x_season_types.data.map((d) => ({ key: d.crime_type, label: d.crime_type, value: d.summer_winter_ratio, color: C.volume, sub: `95% CI ${fmt(d.ci_lo, 2)}–${fmt(d.ci_hi, 2)}` }))} valueFmt={(n) => `×${fmt(n, 2)}`} refValue={1} refLabel="Dashed line = 1.00 (no summer/winter difference)" max={Math.max(1.6, ...b.charts.x_season_types.data.map((d) => d.summer_winter_ratio))} />
                      </Card>
                      <Insight i={I.nights_weekend} span={4} />
                      <Card q="Extra" accent="#8f8cf0" title="The week by the hour" sub="Crimes per day · placeholder timestamps removed" span={8} caveats={["Window A · not filtered"]}>
                        <Heatmap rows={DAYS} cols={Array.from({ length: 24 }, (_, h) => String(h))} values={heatX} rowTitle="day" colTitle="Hour of day" cellH={30} showValues={false} unit="crimes/day" colTick={(c, i) => (i % 3 === 0 ? `${c}h` : null)} />
                      </Card>
                      <Insight i={I.weekday} span={6} />
                      <Insight i={I.model_check} span={6} />
                    </div>)}
                  {story === "arrests" && (
                    <div className="grid">
                      <Card q="Extra" accent={C.arrestText} title="Arrest rate by time: raw vs mix-standardised" sub="Bars: raw · line: standardised to overall crime mix" span={6} caveats={["Window A · not filtered"]}>
                        <Columns height={260} items={b.charts.x_arrest_tod_standardised.data.map((d) => ({ label: d.time_of_day, value: d.raw_rate_pct }))} overlay={b.charts.x_arrest_tod_standardised.data.map((d) => d.standardised_rate_pct)} overlayLabel="Standardised" color={C.arrest} yTitle="Arrest rate %" xTitle="Time of day" valueFmt={(n) => pct(n, 1)} domainMax={30} />
                        <div className="legend"><span><i style={{ background: C.arrest }} />Raw</span><span><i className="line" style={{ background: "#fff" }} />Standardised</span></div>
                      </Card>
                      <Insight i={I.arrest_simpson} span={6} />
                      <Card q="Extra" accent={C.violent} title="Districts vs expected arrest rate" sub="Expected = what each district’s crime mix predicts" span={7} caveats={["Window A · screening result"]}>
                        <Scatter height={330} items={b.charts.x_district_sir.data.map((d) => ({ label: `D${d.District}`, x: d.expected_rate_pct, y: d.raw_rate_pct, flag: d.flag, sub: `index ${fmt(d.sir, 2)} (${fmt(d.sir_lo, 2)}–${fmt(d.sir_hi, 2)})` }))} />
                      </Card>
                      <Insight i={I.arrest_district} span={5} />
                      <Insight i={I.arrest_drivers} span={12} />
                    </div>)}
                  {story === "places" && (
                    <div className="grid">
                      <Insight i={I.handout_overview} span={4} />
                      <Insight i={I.domestic} span={4} />
                      <Insight i={I.places} span={4} />
                      <Insight i={I.spatial} span={6} />
                      <Insight i={I.hourly_clusters} span={6} />
                    </div>)}
                  {story === "then" && (
                    <div className="grid">
                      <Card q="Extra" accent={C.violent} title="Change in crimes per day, window B vs A" sub="Seasonally matched months · by crime type" span={7} caveats={["Not a trend: two periods only"]}>
                        <DivBars items={b.charts.x_era_change.data.map((d) => ({ label: d.name, value: d.change_pct }))} />
                      </Card>
                      <Insight i={I.era_change} span={5} />
                    </div>)}
                </>)}

                {/* ═════════ MAP ═════════ */}
                {tab === "map" && (<>
                  {filterBar}
                  <MapPanel b={b} f={f} selected={district} setSelected={setDistrict} onFilter={(code) => { const i = L.district.indexOf(code); setF({ ...f, districts: new Set([i]) }); }} />
                </>)}

                {/* ═════════ DATA TRUST ═════════ */}
                {tab === "trust" && <TrustPanel b={b} verified={check} />}
              </motion.div>
            </AnimatePresence>
          </main>
          <Chat ctx={{ b, f, r, base, tab, story, district }} goTab={(t) => setTab(t)} />
          <footer className="wrap mini-foot">Team Moleculens · Chicago Crime Branch · every figure computed in Python from the supplied workbook (never modified)</footer>
        </motion.div>
      )}
    </div>
  );
}
