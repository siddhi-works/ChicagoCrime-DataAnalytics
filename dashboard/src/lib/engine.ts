/**
 * Cube engine. Every handout KPI/visual is recomputed here from the dictionary-coded cube produced by the
 * Python analysis (export/cube/cube.json.gz), so filters change every number consistently.
 * Definitions follow the competition handout exactly:
 *  - K6 / Q1: months April 2015 .. July 2017 (28 months)   - K5 / Q4: calendar year 2016 only
 *  - K7: Time of Day = Night (00:00-05:59)                   - K8: Violent category
 *  - Q7 top 10 / Q8 top 5 / Q9 top 10 districts sorted high -> low
 */
export interface Cube {
  dims: string[];
  lookups: {
    primary_type: string[];
    crime_category_of_type: ("Violent" | "Property" | "Other")[];
    district: number[];
    month: string[];
    year_of_month: number[];
    season_of_month: string[];
    day_of_week: string[];
    time_of_day: string[];
    arrest: boolean[];
    domestic: boolean[];
  };
  columns: Record<string, number[]>;
  rows: number;
  total_crimes: number;
}

export interface Filters {
  types: Set<number>; // empty set = no filter
  districts: Set<number>;
  arrest: 0 | 1 | null;
  domestic: 0 | 1 | null;
}
export const NO_FILTERS = (): Filters => ({ types: new Set(), districts: new Set(), arrest: null, domestic: null });

export const TREND_START = "2015-04";
export const TREND_END = "2017-07";
export const CATEGORIES = ["Violent", "Property", "Other"] as const;
export const SEASONS = ["Winter", "Spring", "Summer", "Fall"] as const;

export interface Results {
  total: number;
  arrests: number;
  domestic: number;
  night: number;
  violent: number;
  typesPresent: number;
  y2016: number;
  windowTotal: number;
  windowMonths: number;
  monthly: { month: string; label: string; crimes: number }[];
  dow: number[];
  tod: number[];
  todArrests: number[];
  season2016: number[];
  category: number[];
  topTypes: { idx: number; name: string; crimes: number; category: string }[];
  topDomestic: { idx: number; name: string; crimes: number; category: string }[];
  topDistricts: { code: number; crimes: number; arrests: number; rate: number }[];
  heat: number[][]; // [dow][tod]
}

export interface DistrictStat { code: number; crimes: number; arrests: number; domestic: number; violent: number; night: number; types: number[] }

export class Engine {
  readonly cube: Cube;
  private t: Int32Array; private d: Int32Array; private m: Int32Array; private w: Int32Array;
  private o: Int32Array; private a: Uint8Array; private dm: Uint8Array; private n: Int32Array;
  private catOfType: Uint8Array;
  private winIdx: Int16Array; // month idx -> position inside handout window or -1
  private yearOfMonth: Int16Array; private seasonOfMonth: Uint8Array;
  readonly winLabels: string[] = [];

  constructor(cube: Cube) {
    this.cube = cube;
    const c = cube.columns;
    this.t = Int32Array.from(c.primary_type); this.d = Int32Array.from(c.district); this.m = Int32Array.from(c.month);
    this.w = Int32Array.from(c.day_of_week); this.o = Int32Array.from(c.time_of_day);
    this.a = Uint8Array.from(c.arrest); this.dm = Uint8Array.from(c.domestic); this.n = Int32Array.from(c.crimes);
    const L = cube.lookups;
    this.catOfType = Uint8Array.from(L.crime_category_of_type.map((x) => CATEGORIES.indexOf(x)));
    this.yearOfMonth = Int16Array.from(L.year_of_month);
    this.seasonOfMonth = Uint8Array.from(L.season_of_month.map((s) => SEASONS.indexOf(s as (typeof SEASONS)[number])));
    this.winIdx = new Int16Array(L.month.length).fill(-1);
    let k = 0;
    L.month.forEach((ym, i) => {
      if (ym >= TREND_START && ym <= TREND_END) {
        this.winIdx[i] = k++;
        this.winLabels.push(ym);
      }
    });
  }

  /** Per-crime-type totals under the district/arrest/domestic filters (the type filter is ignored here). */
  typeStats(f: Filters): { idx: number; name: string; crimes: number; arrests: number; domestic: number; night: number }[] {
    const L = this.cube.lookups, nD = L.district.length;
    const dOK = new Uint8Array(nD).fill(f.districts.size ? 0 : 1);
    f.districts.forEach((i) => (dOK[i] = 1));
    const out = L.primary_type.map((name, idx) => ({ idx, name, crimes: 0, arrests: 0, domestic: 0, night: 0 }));
    for (let i = 0; i < this.n.length; i++) {
      if (!dOK[this.d[i]]) continue;
      const ar = this.a[i], dm = this.dm[i];
      if (f.arrest !== null && ar !== f.arrest) continue;
      if (f.domestic !== null && dm !== f.domestic) continue;
      const s = out[this.t[i]], c = this.n[i];
      s.crimes += c; if (ar) s.arrests += c; if (dm) s.domestic += c; if (this.o[i] === 0) s.night += c;
    }
    return out;
  }

  /** Per-district totals under the current type/arrest/domestic filters (the district filter is ignored here). */
  districtStats(f: Filters): DistrictStat[] {
    const L = this.cube.lookups, nT = L.primary_type.length;
    const tOK = new Uint8Array(nT).fill(f.types.size ? 0 : 1);
    f.types.forEach((i) => (tOK[i] = 1));
    const out: DistrictStat[] = L.district.map((code) => ({ code, crimes: 0, arrests: 0, domestic: 0, violent: 0, night: 0, types: new Array(nT).fill(0) }));
    for (let i = 0; i < this.n.length; i++) {
      const ti = this.t[i];
      if (!tOK[ti]) continue;
      const ar = this.a[i], dm = this.dm[i];
      if (f.arrest !== null && ar !== f.arrest) continue;
      if (f.domestic !== null && dm !== f.domestic) continue;
      const s = out[this.d[i]], c = this.n[i];
      s.crimes += c; s.types[ti] += c;
      if (ar) s.arrests += c;
      if (dm) s.domestic += c;
      if (this.catOfType[ti] === 0) s.violent += c;
      if (this.o[i] === 0) s.night += c;
    }
    return out;
  }

  compute(f: Filters): Results {
    const L = this.cube.lookups;
    const nT = L.primary_type.length, nD = L.district.length;
    const tOK = new Uint8Array(nT).fill(f.types.size ? 0 : 1);
    f.types.forEach((i) => (tOK[i] = 1));
    const dOK = new Uint8Array(nD).fill(f.districts.size ? 0 : 1);
    f.districts.forEach((i) => (dOK[i] = 1));
    const W = this.winLabels.length;
    const monthly = new Array<number>(W).fill(0);
    const dow = new Array<number>(7).fill(0), tod = [0, 0, 0, 0], todA = [0, 0, 0, 0];
    const season = [0, 0, 0, 0], cat = [0, 0, 0];
    const typeN = new Array<number>(nT).fill(0), typeDom = new Array<number>(nT).fill(0);
    const distN = new Array<number>(nD).fill(0), distA = new Array<number>(nD).fill(0);
    const heat = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    let total = 0, arrests = 0, domestic = 0, night = 0, y2016 = 0, windowTotal = 0;
    const N = this.n.length;
    for (let i = 0; i < N; i++) {
      const ti = this.t[i], di = this.d[i];
      if (!tOK[ti] || !dOK[di]) continue;
      const ar = this.a[i], dm = this.dm[i];
      if (f.arrest !== null && ar !== f.arrest) continue;
      if (f.domestic !== null && dm !== f.domestic) continue;
      const c = this.n[i], o = this.o[i], wd = this.w[i], mi = this.m[i];
      total += c; typeN[ti] += c; cat[this.catOfType[ti]] += c;
      distN[di] += c; if (ar) { arrests += c; distA[di] += c; todA[o] += c; }
      if (dm) { domestic += c; typeDom[ti] += c; }
      if (o === 0) night += c;
      dow[wd] += c; tod[o] += c; heat[wd][o] += c;
      const yr = this.yearOfMonth[mi];
      if (yr === 2016) { y2016 += c; season[this.seasonOfMonth[mi]] += c; }
      const wi = this.winIdx[mi];
      if (wi >= 0) { monthly[wi] += c; windowTotal += c; }
    }
    const rank = (arr: number[], k: number) =>
      arr.map((v, idx) => ({ idx, v })).filter((x) => x.v > 0).sort((p, q) => q.v - p.v || p.idx - q.idx).slice(0, k)
        .map((x) => ({ idx: x.idx, name: L.primary_type[x.idx], crimes: x.v, category: L.crime_category_of_type[x.idx] }));
    const topDistricts = distN.map((v, i) => ({ code: L.district[i], crimes: v, arrests: distA[i], rate: v ? (distA[i] / v) * 100 : 0 }))
      .filter((x) => x.crimes > 0).sort((p, q) => q.crimes - p.crimes || p.code - q.code).slice(0, 10);
    return {
      total, arrests, domestic, night, violent: cat[0], typesPresent: typeN.filter((v) => v > 0).length, y2016,
      windowTotal, windowMonths: W,
      monthly: this.winLabels.map((m, i) => ({ month: m, label: monthLabel(m), crimes: monthly[i] })),
      dow, tod, todArrests: todA, season2016: season, category: cat,
      topTypes: rank(typeN, 10), topDomestic: rank(typeDom, 5), topDistricts, heat,
    };
  }
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(ym: string) { return `${MON[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`; }

export async function parseCube(buf: ArrayBuffer): Promise<Cube> {
  const u8 = new Uint8Array(buf);
  let text: string;
  if (u8[0] === 0x1f && u8[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(u8);
  return JSON.parse(text) as Cube;
}
