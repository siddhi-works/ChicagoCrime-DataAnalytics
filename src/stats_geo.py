"""Spatial analysis. Uses only coordinates present in the data (no external boundaries)."""
import numpy as np
import pandas as pd

TYPE = "Primary Type Harmonised"


def district_centroids(w):
    g = w[w["has_coords"]].groupby("District").agg(lat=("Latitude", "median"), lon=("Longitude", "median"),
                                                    located_crimes=("Latitude", "size"))
    tot = w.groupby("District").size().rename("crimes")
    return g.join(tot).reset_index()


def grid_density(w, step=0.005):
    """~550 m square cells; counts by category and arrests. Cells with <5 crimes dropped for privacy/noise."""
    x = w[w["has_coords"]]
    gl = (np.floor(x["Latitude"] / step) * step + step / 2).round(5)
    gn = (np.floor(x["Longitude"] / step) * step + step / 2).round(5)
    g = x.assign(lat=gl, lon=gn).groupby(["lat", "lon"]).agg(
        crimes=("Arrest", "size"), arrests=("Arrest", "sum"),
        violent=("crime_category", lambda s: int((s == "Violent").sum())),
        property=("crime_category", lambda s: int((s == "Property").sum()))).reset_index()
    g["other"] = g["crimes"] - g["violent"] - g["property"]
    # dominant police district of each cell (real data: the district code most incidents in the cell carry)
    dom = (x.assign(lat=gl, lon=gn).groupby(["lat", "lon", "District"]).size().rename("n").reset_index()
           .sort_values(["lat", "lon", "n"], ascending=[True, True, False]).drop_duplicates(["lat", "lon"])
           .rename(columns={"District": "district"})[["lat", "lon", "district"]])
    g = g.merge(dom, on=["lat", "lon"], how="left")
    g = g[g["crimes"] >= 5]
    return g.sort_values("crimes", ascending=False)


def concentration(w):
    """Crime concentration across beats: Lorenz curve, Gini, share of crime in the top 10% of beats."""
    s = w.groupby("Beat").size().sort_values()
    cum = s.cumsum() / s.sum()
    x = (np.arange(1, len(s) + 1)) / len(s)
    gini = float(1 - 2 * np.trapezoid(np.r_[0, cum.values], np.r_[0, x]))
    top10 = float(s.tail(int(np.ceil(0.1 * len(s)))).sum() / s.sum())
    top20 = float(s.tail(int(np.ceil(0.2 * len(s)))).sum() / s.sum())
    lor = pd.DataFrame({"beat_share_pct": np.r_[0, x] * 100, "crime_share_pct": np.r_[0, cum.values] * 100})
    step = max(1, len(lor) // 100)
    return lor.iloc[::step].reset_index(drop=True), {"beats": int(len(s)), "gini": gini, "top10pct_beats_share": top10,
                                                      "top20pct_beats_share": top20}


def location_quotients(w, top_types=12, min_district=3000):
    """LQ = district share of type / citywide share of type. >1 means the district over-indexes."""
    types = w[TYPE].value_counts().head(top_types).index
    ct = pd.crosstab(w["District"], w[TYPE])
    ct = ct[ct.sum(axis=1) >= min_district]
    city = ct.sum() / ct.values.sum()
    lq = (ct.div(ct.sum(axis=1), axis=0) / city)[types]
    out = lq.stack().rename("lq").reset_index().rename(columns={TYPE: "crime_type"})
    out["crimes"] = [int(ct.loc[d, t]) for d, t in zip(out["District"], out["crime_type"])]
    top = out.sort_values("lq", ascending=False).head(10)
    return out, top


def community_areas(w):
    g = w[w["Community Area"].notna()].groupby("Community Area").agg(
        crimes=("Arrest", "size"), arrest_rate_pct=("Arrest", "mean"), violent_share_pct=("crime_category", lambda s: (s == "Violent").mean()))
    g[["arrest_rate_pct", "violent_share_pct"]] *= 100
    return g.reset_index().rename(columns={"Community Area": "community_area"}).sort_values("crimes", ascending=False)
