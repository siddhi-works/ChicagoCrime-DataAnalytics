import { Engine, parseCube } from "./engine";

export interface KPIJson {
  id: string; label: string; value: number; unit: string; formula: string;
  numerator: number | null; denominator: number | null; harmonised_value?: number | null;
  sensitivity_value?: number | null; sensitivity_note?: string | null; note?: string | null;
}
export interface InsightJson {
  id: string; tier: "headline" | "supporting" | "data_quality"; headline: string; text: string;
  evidence: Record<string, unknown>; method: string; charts: string[]; caveat: string | null;
}
export interface ChartJson<T = Record<string, any>> {
  id: string; title: string; note?: string | null; caveats: string[]; window?: string | null; scope: string; data: T[];
}
export interface Methodology {
  assumptions: string[]; limitations: string[]; definitions: Record<string, string>;
  windows: { A: { start: string; end_exclusive: string; records: number }; B: { start: string; end_exclusive: string; records: number } };
  source: { file: string; provenance: string };
  records_outside_windows: number;
}
export interface GridCell { lat: number; lon: number; crimes: number; arrests: number; violent: number; property: number; other: number; district?: number | null }
export interface Centroid { District: number; lat: number; lon: number; located_crimes: number; crimes: number }

export interface Bundle {
  engine: Engine;
  kpis: KPIJson[];
  insights: Record<string, InsightJson>;
  methodology: Methodology;
  charts: Record<string, ChartJson>;
  grid: GridCell[];
  centroids: Centroid[];
  cleaning: Record<string, any>;
  methodologyFull: Record<string, any>;
  baseline: Record<string, ChartJson>;
}

const EXTRA = ["x_coverage_grid", "x_hour_dow_heatmap", "x_arrest_tod_standardised", "x_district_sir", "x_season_types", "x_era_change", "x_dow_index"];
const BASE = ["q01", "q02", "q03", "q04", "q05", "q06", "q07", "q08", "q09", "q10"];

const j = async <T,>(p: string): Promise<T> => {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${p}`);
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
};

export async function loadBundle(): Promise<Bundle> {
  const cubeBuf = fetch(`${import.meta.env.BASE_URL}data/cube/cube.json.gz`).then((r) => r.arrayBuffer());
  const [kpis, ins, methodology, geo, cen, cleaning, cubeB, ...ch] = await Promise.all([
    j<KPIJson[]>("kpis.json"), j<InsightJson[]>("insights.json"), j<Methodology>("methodology.json"),
    j<{ rows: GridCell[] }>("geo/grid_density.json"), j<{ rows: Centroid[] }>("geo/district_centroids.json"), j<Record<string, any>>("cleaning_log.json"), cubeBuf,
    ...[...EXTRA, ...BASE].map((id) => j<ChartJson>(`charts/${id}.json`)),
  ]);
  const cube = await parseCube(cubeB);
  const all = Object.fromEntries([...EXTRA, ...BASE].map((id, i) => [id, ch[i]]));
  return {
    engine: new Engine(cube), kpis, methodology, grid: geo.rows, centroids: cen.rows, cleaning, methodologyFull: methodology as unknown as Record<string, any>,
    insights: Object.fromEntries(ins.map((i) => [i.id, i])),
    charts: Object.fromEntries(EXTRA.map((id) => [id, all[id]])),
    baseline: Object.fromEntries(BASE.map((id) => [id, all[id]])),
  };
}
