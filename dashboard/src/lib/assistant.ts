/**
 * Grounded data assistant. It is NOT a free-form language model: every answer is assembled from
 *  (1) the exported analysis (kpis, insights, methodology, cleaning log) and
 *  (2) live calculations on the same cube that powers the dashboard (so answers follow the current filters).
 * Nothing here contains a hard-coded finding; numbers are read at answer time.
 */
import type { Bundle } from "./data";
import { NO_FILTERS, type Filters, type Results } from "./engine";
import { fmt } from "./ui";
import { extra, pickChips } from "./dot";

export type TabId = "dashboard" | "story" | "map" | "trust";
export interface Ctx { b: Bundle; f: Filters; r: Results; base: Results; tab: TabId; story: string; district: number | null }
export interface Answer { text: string; sources: string[]; go?: { label: string; tab: TabId }[]; follow?: string[] }

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TODS = ["Night (00–05)", "Morning (06–11)", "Afternoon (12–17)", "Evening (18–23)"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const pctOf = (a: number, n: number) => (n ? (a / n) * 100 : 0);
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const isFiltered = (f: Filters) => f.types.size + f.districts.size > 0 || f.arrest !== null || f.domestic !== null;
const describeFilters = (c: Ctx) => {
  const L = c.b.engine.cube.lookups, p: string[] = [];
  if (c.f.types.size) p.push(`crime type: ${[...c.f.types].map((i) => title(L.primary_type[i])).join(", ")}`);
  if (c.f.districts.size) p.push(`district: ${[...c.f.districts].map((i) => L.district[i]).join(", ")}`);
  if (c.f.arrest !== null) p.push(c.f.arrest ? "arrested only" : "no arrest only");
  if (c.f.domestic !== null) p.push(c.f.domestic ? "domestic only" : "non-domestic only");
  return p.length ? p.join(" · ") : "none (whole dataset)";
};
const scopeNote = (c: Ctx) => (isFiltered(c.f) ? ` _(for the current filters: ${describeFilters(c)})_` : "");

/* ───────────────────────── contextual suggestions ───────────────────────── */
export function suggestions(c: { tab: TabId; story: string; district: number | null }, seed = 1): string[] {
  return pickChips(c, 5, seed);
}

/* ───────────────────────── knowledge base ───────────────────────── */
interface Entry { id: string; keys: string[]; src: string; go?: { label: string; tab: TabId }[]; follow?: string[]; a: (c: Ctx) => string }
const ins = (c: Ctx, id: string) => c.b.insights[id];
const insightEntry = (id: string, keys: string[], go?: Entry["go"], follow?: string[]): Entry => ({
  id, keys, src: `insights.json › ${id}`, go, follow,
  a: (c) => { const i = ins(c, id); return i ? `**${i.headline}**\n${i.text}${i.caveat ? `\n_Caveat: ${i.caveat}_` : ""}\n_Method: ${i.method}_` : "I don’t have that insight loaded."; },
});
const kpiEntry = (id: string, keys: string[], meaning: string): Entry => ({
  id: "kpi_" + id, keys, src: "kpis.json", go: [{ label: "Open Dashboard", tab: "dashboard" }], follow: ["How was this calculated?"],
  a: (c) => {
    const k = c.b.kpis.find((x) => x.id === id)!;
    const live: Record<string, number> = { K1: c.r.total, K2: pctOf(c.r.arrests, c.r.total), K3: pctOf(c.r.domestic, c.r.total), K4: c.r.typesPresent, K5: c.r.y2016, K6: c.r.windowTotal / c.r.windowMonths, K7: pctOf(c.r.night, c.r.total), K8: pctOf(c.r.violent, c.r.total) };
    const u = k.unit === "%" ? "%" : "", d = k.unit === "%" ? 1 : 0;
    let t = `**${id} · ${k.label}: ${fmt(live[id], d)}${u}**${scopeNote(c)}\n${meaning}\nFormula: ${k.formula}.`;
    if (id === "K4" && k.harmonised_value) t += ` (${k.harmonised_value} if the two sexual-assault labels are merged.)`;
    if (id === "K7" && k.sensitivity_value) t += `\nWithout records stamped exactly 00:00/12:00 (often a placeholder) it is ${fmt(k.sensitivity_value, 1)}%.`;
    if (isFiltered(c.f)) t += `\nWhole dataset: ${fmt(k.value, d)}${u}.`;
    return t;
  },
});

const KB: Entry[] = [
  { id: "about", keys: ["what is this dashboard", "dashboard about", "about this", "this project", "project about", "purpose", "overview", "explain the dashboard", "what is this"], src: "kpis.json · insights.json", go: [{ label: "Open Dashboard", tab: "dashboard" }], follow: ["What are the main findings?", "What methodology was used?"],
    a: (c) => `**Chicago Crime Branch** (Team Moleculens) is an interactive view of **${fmt(c.base.total)} Chicago police crime reports**.\n• **Dashboard** – the 8 competition KPIs and 10 required charts, with filters.\n• **Story** – deeper findings: timing, arrests, places, then-vs-now.\n• **Map** – districts coloured by crimes, arrest rate and more.\n• **Data trust** – source, pipeline, metrics, methods and limits.\nAll numbers are computed in Python from the supplied workbook; this page only draws them.` },
  { id: "kpi", keys: ["what is a kpi", "what are kpis", "what is kpi", "kpi means", "key performance", "kpis", "kpi"], src: "kpis.json", go: [{ label: "Open Dashboard", tab: "dashboard" }], follow: ["What is the arrest rate?", "How was this calculated?"],
    a: (c) => `A **KPI (key performance indicator)** is a single headline number that summarises something important at a glance. Here there are 8:\n${c.b.kpis.map((k) => `• ${k.id} ${k.label}: **${k.unit === "%" ? fmt(k.id === "K2" ? pctOf(c.r.arrests, c.r.total) : k.id === "K3" ? pctOf(c.r.domestic, c.r.total) : k.id === "K7" ? pctOf(c.r.night, c.r.total) : pctOf(c.r.violent, c.r.total), 1) + "%" : fmt(k.id === "K1" ? c.r.total : k.id === "K4" ? c.r.typesPresent : k.id === "K5" ? c.r.y2016 : c.r.windowTotal / c.r.windowMonths)}**`).join("\n")}${scopeNote(c)}` },
  kpiEntry("K1", ["total crimes", "how many crimes", "k1", "number of crimes", "row count"], "One row = one reported crime, so this is simply the number of rows in view."),
  kpiEntry("K2", ["arrest rate", "k2", "arrests"], "Crimes where an arrest was made ÷ all crimes. It measures police outcomes, not how dangerous a place is."),
  kpiEntry("K3", ["domestic crime", "domestic percent", "k3", "domestic share"], "Crimes flagged domestic-related ÷ all crimes."),
  kpiEntry("K4", ["different crime types", "how many crime types", "crime types", "k4", "primary type count"], "Distinct values of Primary Type in view."),
  kpiEntry("K5", ["crimes in 2016", "2016", "k5"], "Reports dated in calendar year 2016."),
  kpiEntry("K6", ["average per month", "crimes per month", "monthly average", "k6"], "Total crimes April 2015 – July 2017 ÷ the 28 months in that period."),
  kpiEntry("K7", ["night time", "nighttime", "night crime", "k7", "midnight"], "Crimes between 00:00 and 05:59 ÷ all crimes."),
  kpiEntry("K8", ["violent crime", "violent percent", "violent share", "k8"], "Violent = assault, battery, robbery, homicide, both sexual-assault labels, kidnapping."),
  { id: "calc", keys: ["how was this calculated", "how calculated", "how do you calculate", "calculation", "calculated", "computed", "formula", "how are numbers", "where do the numbers"], src: "methodology.json", go: [{ label: "Open Data trust", tab: "trust" }], follow: ["What methodology was used?", "What was cleaned or repaired?"],
    a: (c) => `Every figure follows the **competition handout definitions** exactly (Time of Day, Season, Violent/Property/Other).\n1. Python reads the workbook (read-only), repairs dates and cleans it.\n2. Python computes KPIs, charts and statistics and exports JSON.\n3. The page loads a compact **cube** (counts for every combination of type, district, month, weekday, time of day, arrest, domestic) and recomputes everything from it when you filter.\n4. On load the page re-checks its own maths against Python’s export (see the “Verified” note in Data trust › Limits).\nExample: Arrest rate = ${fmt(c.r.arrests)} arrests ÷ ${fmt(c.r.total)} crimes = **${fmt(pctOf(c.r.arrests, c.r.total), 1)}%**${scopeNote(c)}.` },
  { id: "findings", keys: ["main findings", "key findings", "findings", "insights", "takeaways", "summary", "conclusion", "what did you find", "important"], src: "insights.json", go: [{ label: "Open Story", tab: "story" }], follow: ["Is crime higher in summer?", "Why does the evening arrest rate look higher?"],
    a: (c) => `The headline findings (all computed from the data):\n${Object.values(c.b.insights).filter((i) => i.tier === "headline").map((i) => `• **${i.headline}**`).join("\n")}\nAsk about any of them for the detail, evidence and caveats.` },
  { id: "method", keys: ["methodology", "methods", "approach", "how was the analysis", "derived", "techniques", "statistics used", "statistical", "what methodology"], src: "methodology.json", go: [{ label: "Open Data trust", tab: "trust" }], follow: ["How was the arrest rate standardised?", "What are the limitations?"],
    a: (c) => { const m = c.b.methodologyFull.models, g = c.b.methodologyFull.glm; return `The analysis combines:\n• **Dense-period detection** – only two near-complete periods (A: ${c.b.methodology.windows.A.start}→, B: ${c.b.methodology.windows.B.start}→) support trend claims.\n• **Effect sizes + confidence intervals** (bootstrap, exact Poisson) instead of bare p-values.\n• **Standardisation** (direct by time, indirect “index” by district) to compare arrests fairly.\n• **Models with a time hold-out**: logistic and gradient boosting, AUC ${fmt(m.auc_logistic, 2)} / ${fmt(m.auc_gradient_boosting, 2)} on unseen months; a daily Poisson model with ${fmt(g.mape_glm * 100, 1)}% hold-out error.\n• **Robust anomaly scoring**, k-means timing groups, Lorenz/Gini concentration.\nFixed seeds make it reproducible. Full details in Data trust › Methods.`; } },
  { id: "source", keys: ["where did the data", "data come from", "source", "dataset", "provenance", "who collected", "origin", "where is the data"], src: "methodology.json", go: [{ label: "Open Data trust", tab: "trust" }], follow: ["What was cleaned or repaired?", "What are the limitations?"],
    a: (c) => `${c.b.methodology.source.provenance}\nFile: **${c.b.methodology.source.file}** · ${fmt(c.b.cleaning.rows_in)} rows. The workbook was only read, never modified (verified by checksum). ${fmt(c.b.methodology.records_outside_windows)} records sit outside the two dense periods.` },
  { id: "clean", keys: ["cleaning", "cleaned", "preprocess", "preprocessing", "repair", "repaired", "dates swapped", "what was fixed", "data prep", "preparation"], src: "cleaning_log.json", go: [{ label: "Open Data trust", tab: "trust" }], follow: ["Where does the data come from?"],
    a: (c) => { const l = c.b.cleaning, d = l.date_repair; return `**What we did (all logged):**\n• **Dates:** ${fmt(d.excel_datetime_cells_swapped)} cells had month/day swapped by Excel – swapped back; records dated after their own update stamp fell from ${fmt(d.date_after_updated_on_share_before_repair * 100, 1)}% to ${fmt(d.date_after_updated_on_share_after_repair * 100, 1)}%.\n• **Coordinates:** ${fmt(l.coords_outside_chicago_nulled)} impossible points blanked.\n• **Community area 0** → missing (${fmt(l.community_area_zero_to_null)}); **empty place** → UNKNOWN (${fmt(l.location_description_null_filled_UNKNOWN)}).\n• **Types:** ${l.primary_types_raw} raw labels; two sexual-assault labels merged only for deep analysis.\n• **No rows deleted.**`; } },
  { id: "limits", keys: ["limitation", "limitations", "assumption", "assumptions", "caveat", "caveats", "reliable", "trust", "accurate", "bias", "weakness"], src: "methodology.json", go: [{ label: "Open Data trust", tab: "trust" }],
    a: (c) => `**Assumptions**\n${c.b.methodology.assumptions.map((x) => `• ${x}`).join("\n")}\n**Limitations**\n${c.b.methodology.limitations.map((x) => `• ${x}`).join("\n")}` },
  { id: "filters", keys: ["filter", "filters", "how do i use", "interact", "how to use", "click"], src: "App", go: [{ label: "Open Dashboard", tab: "dashboard" }],
    a: (c) => `Use the bar on the Dashboard: **Crime type**, **District**, **Arrest** and **Domestic**. Every KPI and chart recomputes together. You can also **click bars** in Q7, Q8 and Q9 to filter, and a district on the Map (“Filter the dashboard to this district”).\nCurrent filters: ${describeFilters(c)} → **${fmt(c.r.total)}** crimes in view.` },
  { id: "team", keys: ["team", "moleculens", "who made", "who built", "who are you", "creators"], src: "—", a: () => `Built by **Team Moleculens** for TECHVERSE. I’m **Detective Dot**, the dashboard’s case-file sidekick: I answer from the project’s own analysis, not from the internet.` },
  { id: "handout", keys: ["requirement", "requirements", "handout", "competition", "techverse", "required charts", "required", "q1", "q10", "rules"], src: "App", go: [{ label: "Open Dashboard", tab: "dashboard" }],
    a: () => `The Dashboard tab contains all **8 KPI cards (K1–K8)** and **10 required visuals (Q1–Q10)**, each tagged with its handout number, with ≥2 filters and a definitions/assumptions box. Extra analysis is tagged “Extra”. Q9 uses a secondary axis because the handout asks for it.` },
  { id: "can", keys: ["what can you do", "help", "how do you work", "are you ai", "are you chatgpt", "capabilities"], src: "—", a: () => `I’m **Detective Dot**, a **grounded data assistant**: I read this project’s exported analysis and run live calculations on the same data as the dashboard, so my answers follow your filters. Try: “How many theft crimes?”, “Tell me about District 11”, “Which month had the most crime?”, “What is the arrest rate?”. I’m not a general chatbot, so I won’t know things outside this project.` },
  { id: "map", keys: ["map", "map colours", "map colors", "territories", "glow", "read the map", "what does the map", "heatmap colour"], src: "geo/grid_density.json", go: [{ label: "Open Map", tab: "map" }], follow: ["Which district has the most crime?"],
    a: () => `The map draws ~550 m cells from the data’s own coordinates, each coloured by its **police district’s** score on the metric you pick (crimes, arrest rate, violent/domestic/night share). Brighter = more crimes in that cell. “Territories” shows the blocks; “Glow” shows density. No boundary lines are drawn because none exist in the data – each cell takes its most common district. Click a district for details.` },
  { id: "nocoords", keys: ["no map data", "no coordinates", "window b", "2025", "2026", "missing coordinates", "why no data"], src: "insights.json › dq_missing_coords", go: [{ label: "Open Map", tab: "map" }],
    a: (c) => `${ins(c, "dq_missing_coords")?.text ?? ""} That’s why the map uses Apr 2015 – Jul 2017 positions only.` },
  { id: "g_std", keys: ["standardised", "standardized", "standardisation", "standardization", "expected arrest", "mix adjusted"], src: "insights.json › arrest_simpson", go: [{ label: "Open Story", tab: "story" }],
    a: (c) => `**Standardising** recomputes an arrest rate as if every group had the same mix of crime types, so you compare like with like.\n${ins(c, "arrest_simpson")?.text ?? ""}` },
  { id: "g_sir", keys: ["index", "sir", "above expected", "below expected", "why is a district", "district above"], src: "insights.json › arrest_district", go: [{ label: "Open Map", tab: "map" }],
    a: (c) => `The **index** = observed arrests ÷ arrests expected from the district’s crime-type mix (1.00 = as expected). Flags use exact Poisson CIs with Benjamini-Hochberg correction.\n${ins(c, "arrest_district")?.text ?? ""}` },
  { id: "g_lq", keys: ["location quotient", "specialise", "over index", "overindex"], src: "insights.json › spatial", a: (c) => `A **location quotient** is a district’s share of a crime type ÷ the city-wide share; above 1 means it over-indexes.\n${ins(c, "spatial")?.text ?? ""}` },
  { id: "g_effect", keys: ["effect size", "p value", "significant", "significance", "cohen"], src: "insights.json › weekday", a: (c) => `With 10⁵–10⁶ rows almost any difference is “statistically significant”, so we report **effect sizes and CIs**.\n${ins(c, "weekday")?.text ?? ""}` },
  { id: "g_placeholder", keys: ["placeholder", "midnight", "noon", "unknown time", "00 00"], src: "insights.json › dq_placeholder_time", a: (c) => `${ins(c, "dq_placeholder_time")?.text ?? ""}` },
  insightEntry("seasonality", ["summer", "winter", "season", "seasonal", "seasonality", "hotter"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("weekday", ["weekday effect", "which weekday", "friday", "monday", "day of week"], [{ label: "Open Dashboard", tab: "dashboard" }]),
  insightEntry("nights_weekend", ["weekend", "weekend nights", "night hours", "peak hour", "busiest hour", "what time"], [{ label: "Open Dashboard", tab: "dashboard" }]),
  insightEntry("arrest_simpson", ["evening arrest", "arrest by time", "time of day arrest", "simpson", "why does the evening"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("arrest_district", ["district arrest", "which districts beat", "arrest by district", "district 11 arrest"], [{ label: "Open Map", tab: "map" }]),
  insightEntry("arrest_drivers", ["predicts arrest", "predict", "drivers", "what influences arrest", "model", "auc", "machine learning"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("era_change", ["then vs now", "change between", "two periods", "decline", "decreased", "increase", "compare periods", "trend", "motor vehicle theft change"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("domestic", ["domestic", "domestic violence", "household"], [{ label: "Open Dashboard", tab: "dashboard" }]),
  insightEntry("places", ["location", "locations", "where do crimes happen", "street", "residence", "sidewalk", "apartment", "places"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("spatial", ["concentrated", "concentration", "hotspot", "hot spot", "gini", "beats", "spread"], [{ label: "Open Map", tab: "map" }]),
  insightEntry("hourly_clusters", ["timing groups", "clusters", "which crimes happen when", "hourly profile"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("model_check", ["anomaly", "anomalies", "spike", "unusual days", "forecast", "expected daily"], [{ label: "Open Story", tab: "story" }]),
  insightEntry("dq_date_repair", ["date repair", "dates", "excel", "month and day"], [{ label: "Open Data trust", tab: "trust" }]),
  insightEntry("dq_coverage", ["coverage", "complete", "missing years", "sparse", "dense", "truncated", "row limit"], [{ label: "Open Data trust", tab: "trust" }]),
  insightEntry("dq_first_of_month", ["first of the month", "1st of the month", "unknown date", "day 1"], [{ label: "Open Data trust", tab: "trust" }]),
];

/* ───────────────────────── live calculators ───────────────────────── */
function typeFromQuestion(q: string, c: Ctx): number | null {
  const names = c.b.engine.cube.lookups.primary_type.map((t, i) => ({ i, n: norm(t) })).sort((a, b) => b.n.length - a.n.length);
  const hit = names.find((x) => q.includes(x.n)) ?? names.find((x) => (x.n === "criminal damage" && q.includes("vandal")) || (x.n === "deceptive practice" && /fraud|scam/.test(q)) || (x.n === "motor vehicle theft" && /car theft|auto theft/.test(q)) || (x.n === "narcotics" && /drug/.test(q)));
  return hit ? hit.i : null;
}
function districtFromQuestion(q: string, c: Ctx): number | null {
  const m = q.match(/\b(?:district|dist|d)\s*(\d{1,2})\b/);
  if (m && c.b.engine.cube.lookups.district.includes(+m[1])) return +m[1];
  if (/(this|selected|that) district/.test(q) && c.district != null) return c.district;
  return null;
}
function typeAnswer(i: number, c: Ctx): Answer {
  const L = c.b.engine.cube.lookups, f = NO_FILTERS(); f.types.add(i);
  const t = c.b.engine.compute(f), name = title(L.primary_type[i]);
  const best = (a: number[], lab: string[]) => lab[a.indexOf(Math.max(...a))];
  const top = c.b.engine.districtStats(f).sort((a, b) => b.crimes - a.crimes)[0];
  const peakMonth = [...t.monthly].sort((a, b) => b.crimes - a.crimes)[0];
  return { text: `**${name}** (${L.crime_category_of_type[i]})\n• **${fmt(t.total)}** crimes – ${fmt(pctOf(t.total, c.base.total), 1)}% of all (${fmt(c.base.total)})\n• Arrest rate **${fmt(pctOf(t.arrests, t.total), 1)}%** vs ${fmt(pctOf(c.base.arrests, c.base.total), 1)}% overall\n• Domestic: ${fmt(pctOf(t.domestic, t.total), 1)}% · Night (00–05): ${fmt(pctOf(t.night, t.total), 1)}%\n• Busiest weekday: ${best(t.dow, DAYS)} · busiest time: ${best(t.tod, TODS)}\n• Most in District ${top?.code} (${fmt(top?.crimes ?? 0)})${peakMonth && peakMonth.crimes ? `\n• Peak month (Apr 2015–Jul 2017): ${peakMonth.label} (${fmt(peakMonth.crimes)})` : ""}\n_(Whole dataset, ignoring your current filters.)_`,
    sources: ["cube.json (live)"], go: [{ label: "Filter dashboard to this type", tab: "dashboard" }], follow: [`Which district has the most ${name.toLowerCase()}?`] };
}
function districtAnswer(code: number, c: Ctx): Answer {
  const st = c.b.engine.districtStats(c.f), d = st.find((s) => s.code === code)!;
  const rk = (k: (s: typeof d) => number) => [...st].sort((a, b) => k(b) - k(a)).findIndex((s) => s.code === code) + 1;
  const sir = c.b.charts.x_district_sir.data.find((x) => x.District === code);
  const L = c.b.engine.cube.lookups;
  const tt = d.types.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => `${title(L.primary_type[x.i])} (${fmt(x.n)})`).join(", ");
  const tot = st.reduce((s, x) => s + x.crimes, 0), ar = st.reduce((s, x) => s + x.arrests, 0);
  return { text: `**District ${code}**${scopeNote({ ...c, f: { ...c.f, districts: new Set() } })}\n• **${fmt(d.crimes)}** crimes – rank ${rk((s) => s.crimes)} of ${st.length} (${fmt(pctOf(d.crimes, tot), 1)}% of the city)\n• Arrest rate **${fmt(pctOf(d.arrests, d.crimes), 1)}%** (city ${fmt(pctOf(ar, tot), 1)}%) – rank ${rk((s) => pctOf(s.arrests, s.crimes))}\n• Violent ${fmt(pctOf(d.violent, d.crimes), 1)}% · Domestic ${fmt(pctOf(d.domestic, d.crimes), 1)}% · Night ${fmt(pctOf(d.night, d.crimes), 1)}%\n• Most common: ${tt}${sir ? `\n• Arrest rate vs its crime mix (Apr 2015–Jul 2017): **${sir.flag}** – index ${fmt(sir.sir, 2)} (expected ${fmt(sir.expected_rate_pct, 1)}%, observed ${fmt(sir.raw_rate_pct, 1)}%)` : ""}`,
    sources: ["cube.json (live)", "charts/x_district_sir.json"], go: [{ label: "Open Map", tab: "map" }] };
}
function ranking(q: string, c: Ctx): Answer | null {
  const all = c.b.engine.districtStats(c.f).filter((s) => s.crimes > 0);
  if (!all.length) return null;
  const minN = Math.max(20, all.reduce((x, d) => x + d.crimes, 0) * 0.0015);
  const lowest = /(lowest|least|fewest|smallest|safest|quietest)/.test(q), isD = /district/.test(q);
  if (!isD) return null;
  const metric = /arrest/.test(q) ? "arrest" : /violent/.test(q) ? "violent" : /domestic/.test(q) ? "domestic" : /night/.test(q) ? "night" : /(most|highest|lowest|least|fewest|top|busiest|worst|safest|crime)/.test(q) ? "crimes" : null;
  if (!metric) return null;
  const st = metric === "crimes" ? all : all.filter((s) => s.crimes >= minN);
  const v = (s: (typeof st)[0]) => (metric === "crimes" ? s.crimes : pctOf(metric === "arrest" ? s.arrests : metric === "violent" ? s.violent : metric === "domestic" ? s.domestic : s.night, s.crimes));
  const sorted = [...st].sort((a, b) => (lowest ? v(a) - v(b) : v(b) - v(a))).slice(0, 5);
  const lab = metric === "crimes" ? "crimes" : `${metric} share/rate`;
  return { text: `**${lowest ? "Lowest" : "Highest"} districts by ${lab}**${scopeNote(c)}${metric !== "crimes" && st.length < all.length ? ` _(districts with at least ${fmt(Math.round(minN))} crimes; tiny districts excluded)_` : ""}\n${sorted.map((s, i) => `${i + 1}. District ${s.code} – **${metric === "crimes" ? fmt(v(s)) : fmt(v(s), 1) + "%"}**`).join("\n")}`, sources: ["cube.json (live)"], go: [{ label: "Open Map", tab: "map" }], follow: [`Tell me about District ${sorted[0].code}`] };
}
function timeAnswers(q: string, c: Ctx): Answer | null {
  const r = c.r, sc = scopeNote(c), srcs = ["cube.json (live)"];
  const hi = /(most|highest|peak|busiest|worst|max)/.test(q), lo = /(least|lowest|fewest|quietest|min|low)/.test(q);
  if (/month/.test(q) && (hi || lo) && !/district/.test(q)) {
    const m = [...r.monthly].sort((a, b) => (lo && !hi ? a.crimes - b.crimes : b.crimes - a.crimes))[0];
    return { text: `${lo && !hi ? "Quietest" : "Busiest"} month (Apr 2015 – Jul 2017): **${m.label}** with **${fmt(m.crimes)}** crimes.${sc}\nSeasonal pattern: crime rises through spring, peaks in summer and dips in winter (shortest month, February, is the low).`, sources: srcs, go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  if (/(day|weekday)/.test(q) && (hi || lo || /busiest/.test(q)) && !/time of day/.test(q) && !/(hour|night)/.test(q)) {
    const i = r.dow.indexOf(lo && !hi ? Math.min(...r.dow) : Math.max(...r.dow));
    return { text: `${lo && !hi ? "Quietest" : "Busiest"} day of week: **${DAYS[i]}** with **${fmt(r.dow[i])}** crimes.${sc}\nAll days are within a few percent of each other – weekday matters far less than hour.`, sources: srcs, go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  if (/(time of day|which time|hour|busiest time|when)/.test(q) && (hi || /busiest|when/.test(q))) {
    let best = [0, 0, 0];
    r.heat.forEach((row, d) => row.forEach((v, t) => { if (v > best[2]) best = [d, t, v]; }));
    const i = r.tod.indexOf(Math.max(...r.tod));
    return { text: `Busiest time of day: **${TODS[i]}** (${fmt(r.tod[i])} crimes).${sc}\nBusiest single cell of the week: **${DAYS[best[0]]} ${TODS[best[1]]}** with ${fmt(best[2])}.`, sources: srcs, go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  if (/(top|most common|biggest|main) (crime )?types?|most common crime|top crimes|common crimes/.test(q)) {
    return { text: `Top crime types${sc}:\n${r.topTypes.slice(0, 5).map((t, i) => `${i + 1}. ${title(t.name)} – **${fmt(t.crimes)}** (${t.category})`).join("\n")}`, sources: srcs, go: [{ label: "Open Dashboard", tab: "dashboard" }] };
  }
  return null;
}

/* ───────────────────────── main entry ───────────────────────── */
export function answer(question: string, c: Ctx): Answer {
  const q = norm(question);
  if (!q) return { text: "Ask me anything about the dashboard or the data.", sources: [] };
  const definitional = /^(what is|what s|what are|define|explain|meaning of)\b/.test(q);

  if (/(this|current) (tab|page|view|screen)|what am i (looking|seeing)|what s on this/.test(q)) {
    const t: Record<TabId, string> = {
      dashboard: `You’re on the **Dashboard**: 8 KPI cards (K1–K8) and 10 required charts (Q1–Q10) for **${fmt(c.r.total)}** crimes in view. Filters: ${describeFilters(c)}.`,
      story: "You’re in the **Story** tab: deeper findings on timing, arrests, places and then-vs-now, each with method and caveat.",
      map: `You’re on the **Map**: police districts coloured by a metric you choose.${c.district != null ? ` District ${c.district} is selected.` : ""}`,
      trust: "You’re in **Data trust**: where the data came from, the pipeline, metric definitions, methods, quality issues and limits.",
    };
    return { text: t[c.tab], sources: ["App"], follow: suggestions(c).slice(0, 3) };
  }
  const ex = extra(q, c);
  if (ex) return ex;
  const d = districtFromQuestion(q, c);
  if (d != null && !definitional) return districtAnswer(d, c);
  const rk = !definitional ? ranking(q, c) : null;
  if (rk) return rk;
  const ti = typeFromQuestion(q, c);
  if (ti != null && !definitional && !/(top|which|most common)/.test(q.replace(norm(c.b.engine.cube.lookups.primary_type[ti]), ""))) return typeAnswer(ti, c);
  const ta = !definitional ? timeAnswers(q, c) : null;
  if (ta) return ta;

  // keyword retrieval over the knowledge base
  let best: { e: Entry; s: number } | null = null; const scored: { e: Entry; s: number }[] = [];
  for (const e of KB) {
    let s = 0;
    for (const k of e.keys) { const kk = norm(k); if (kk && (` ${q} `).includes(` ${kk} `)) s += kk.includes(" ") ? 4 : kk.length >= 5 ? 2 : 1; }
    if (s > 0) scored.push({ e, s });
    if (s > 0 && (!best || s > best.s)) best = { e, s };
  }
  if (best) {
    const e = best.e;
    return { text: e.a(c), sources: [e.src], go: e.go, follow: e.follow ?? suggestions(c).slice(0, 3) };
  }
  if (/(how many|total|number of).*(crime|report)/.test(q)) return { text: `**${fmt(c.r.total)}** crimes in view${scopeNote(c)} (dataset total ${fmt(c.base.total)}).`, sources: ["cube.json (live)"] };
  return { text: "I can’t answer that from this project’s data. I can talk about the KPIs and charts, crime types (e.g. “How many theft crimes?”), districts (“Tell me about District 11”), timing, arrests, the map, and how the data was cleaned and analysed. Try one of the suggestions below.", sources: [], follow: suggestions(c).slice(0, 4) };
}
