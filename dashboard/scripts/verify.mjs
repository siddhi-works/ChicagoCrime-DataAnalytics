// Proves the browser engine (cube) reproduces the Python export for every handout KPI and chart.
import { build } from "esbuild";
import { readFileSync, mkdtempSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), "eng-")), "engine.mjs");
await build({ entryPoints: [resolve(here, "../src/lib/engine.ts")], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { Engine, NO_FILTERS } = await import(pathToFileURL(out).href);

const data = resolve(here, "../public/data");
const J = (p) => JSON.parse(readFileSync(join(data, p), "utf8"));
const cube = JSON.parse(gunzipSync(readFileSync(join(data, "cube/cube.json.gz"))).toString());
const eng = new Engine(cube);
const r = eng.compute(NO_FILTERS());
const kp = Object.fromEntries(J("kpis.json").map((k) => [k.id, k]));
let fail = 0;
const eq = (name, a, b, tol = 1e-6) => {
  const ok = typeof a === "number" ? Math.abs(a - b) <= tol : JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fail++; console.log("FAIL", name, a, b); } else console.log("PASS", name);
};
eq("K1", r.total, kp.K1.value);
eq("K2", r.arrests / r.total * 100, kp.K2.value, 1e-4);
eq("K3", r.domestic / r.total * 100, kp.K3.value, 1e-4);
eq("K4", r.typesPresent, kp.K4.value);
eq("K5", r.y2016, kp.K5.value);
eq("K6", r.windowTotal / r.windowMonths, kp.K6.value, 1e-3);
eq("K7", r.night / r.total * 100, kp.K7.value, 1e-4);
eq("K8", r.violent / r.total * 100, kp.K8.value, 1e-4);
const ch = (id) => J(`charts/${id}.json`).data;
eq("Q1", r.monthly.map((m) => m.crimes), ch("q01").map((d) => d.crimes));
eq("Q2", r.dow, ch("q02").map((d) => d.crimes));
eq("Q3", r.tod, ch("q03").map((d) => d.crimes));
eq("Q4", r.season2016, ch("q04").map((d) => d.crimes));
eq("Q5", r.category, ch("q05").map((d) => d.crimes));
eq("Q6", r.todArrests.map((a, i) => +(a / r.tod[i] * 100).toFixed(4)), ch("q06").map((d) => +d.arrest_rate_pct.toFixed(4)));
eq("Q7", r.topTypes.map((d) => [d.name, d.crimes]), ch("q07").map((d) => [d["Primary Type"], d.crimes]));
eq("Q8", r.topDomestic.map((d) => [d.name, d.crimes]), ch("q08").map((d) => [d["Primary Type"], d.crimes]));
eq("Q9", r.topDistricts.map((d) => [d.code, d.crimes, +d.rate.toFixed(4)]), ch("q09").map((d) => [d.District, d.crimes, +d.arrest_rate_pct.toFixed(4)]));
const q10 = ch("q10");
eq("Q10", q10.every((d) => r.heat[["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(d.day_of_week)][["Night","Morning","Afternoon","Evening"].indexOf(d.time_of_day)] === d.crimes), true);
// filter sanity: type filter must equal brute force from the cube rows
const f = NO_FILTERS(); f.types.add(cube.lookups.primary_type.indexOf("THEFT"));
const rf = eng.compute(f);
const brute = cube.columns.crimes.reduce((s, c, i) => s + (cube.columns.primary_type[i] === [...f.types][0] ? c : 0), 0);
eq("filter THEFT total", rf.total, brute);
console.log(fail ? `\n${fail} FAILED` : "\nENGINE MATCHES PYTHON EXPORT");
process.exit(fail ? 1 : 0);
