"""Coverage audit + temporal analysis. Windows (A, B) are passed in, found empirically in windows.py."""
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.linear_model import PoissonRegressor
from sklearn.metrics import silhouette_score
from pandas.tseries.holiday import USFederalHolidayCalendar

from config import DAY_ORDER, SEED
from statlib import poisson_ci, bootstrap_ratio, cramers_v, clean_records


def coverage(df, windows):
    grid = df.groupby([df["Year"], df["month"]]).size().rename("records").reset_index()
    grid.columns = ["year", "month", "records"]
    # Missing-coordinate analysis: is it random? (within each dense window, by crime type)
    miss = {}
    for name, (a, b) in windows.items():
        w = df[(df["Date"] >= a) & (df["Date"] < b)]
        ct = pd.crosstab(w["Primary Type Harmonised"], w["has_coords"])
        ct = ct[ct.sum(axis=1) >= 500]
        v, chi2 = cramers_v(ct.values)
        by_type = (1 - w.groupby("Primary Type Harmonised")["has_coords"].mean()).rename("missing_share")
        by_type = by_type[w["Primary Type Harmonised"].value_counts() >= 500].sort_values(ascending=False)
        miss[name] = {"missing_share_overall": float(1 - w["has_coords"].mean()), "cramers_v_type": v,
                      "chi2": chi2, "highest_missing_types": by_type.head(5).round(4).to_dict(),
                      "lowest_missing_types": by_type.tail(3).round(4).to_dict()}
    total_nd = df["default_time"].sum()
    return {
        "coverage_grid": clean_records(grid),
        "missing_coords": miss,
        "default_time": {"records": int(total_nd), "share": float(df["default_time"].mean()),
                         "share_of_hour_0": float(df.loc[df["hour"] == 0, "default_time"].mean()),
                         "share_of_hour_12": float(df.loc[df["hour"] == 12, "default_time"].mean())},
    }


def day_of_week_index(w):
    """Relative risk per weekday vs uniform per-day expectation, accounting for how many of each weekday exist."""
    days = w.groupby("day").size()
    n_days = pd.Series(days.index.dayofweek).value_counts().sort_index()
    obs = w.groupby("dow").size().sort_index()
    exp = n_days / n_days.sum() * obs.sum()
    lo, hi = poisson_ci(obs.values)
    chi2 = float(((obs - exp) ** 2 / exp).sum())
    wd = np.sqrt(chi2 / obs.sum())     # Cohen's w
    # daily-rate view
    rate = obs / n_days
    out = pd.DataFrame({"day_of_week": DAY_ORDER, "crimes": obs.values, "days": n_days.values,
                        "per_day": rate.values, "index_vs_avg": (obs / exp).values,
                        "ci_lo": (lo / exp).values, "ci_hi": (hi / exp).values})
    return out, {"chi2": chi2, "cohens_w": float(wd), "n": int(obs.sum())}


def hourly_profile(w):
    h = w.groupby("hour").size().rename("crimes_all")
    h2 = w[~w["default_time"]].groupby("hour").size().rename("crimes_excl_placeholder")
    out = pd.concat([h, h2], axis=1).reset_index()
    out["share_pct"] = out["crimes_all"] / out["crimes_all"].sum() * 100
    return out


def hour_dow_matrix(w):
    m = w[~w["default_time"]].groupby(["dow", "hour"]).size().rename("crimes").reset_index()
    days = w.groupby("day").size()
    n_days = pd.Series(days.index.dayofweek).value_counts()
    m["per_day"] = m["crimes"] / m["dow"].map(n_days)
    m["day_of_week"] = m["dow"].map(dict(enumerate(DAY_ORDER)))
    return m[["day_of_week", "hour", "crimes", "per_day"]]


def seasonality(w):
    daily = w.groupby("day").size().rename("n").to_frame()
    daily["month"] = daily.index.month
    daily["season"] = daily["month"].map(lambda m: "Winter" if m in (12, 1, 2) else "Spring" if m in (3, 4, 5)
                                         else "Summer" if m in (6, 7, 8) else "Fall")
    by_month = daily.groupby("month")["n"].agg(["mean", "std", "count"]).reset_index()
    by_month["sem"] = by_month["std"] / np.sqrt(by_month["count"])
    summer = daily.loc[daily.season == "Summer", "n"].values
    winter = daily.loc[daily.season == "Winter", "n"].values
    ratio, lo, hi = bootstrap_ratio(summer, winter)
    kw = stats.kruskal(*[g["n"].values for _, g in daily.groupby("season")])
    # Which crime types swing most between summer and winter (per-day rate)?
    t = w.assign(season=w["day"].dt.month.map(lambda m: "Summer" if m in (6, 7, 8) else "Winter" if m in (12, 1, 2) else None))
    t = t[t["season"].notna()]
    per_day = t.groupby(["Primary Type Harmonised", "season", "day"]).size().rename("n").reset_index()
    nd = {s: daily[daily.season == s].shape[0] for s in ("Summer", "Winter")}
    rows = []
    for ty, g in t.groupby("Primary Type Harmonised"):
        if len(g) < 3000:
            continue
        s = np.zeros(nd["Summer"])
        wv = np.zeros(nd["Winter"])
        gs = per_day[(per_day["Primary Type Harmonised"] == ty)]
        sv = gs.loc[gs.season == "Summer", "n"].values
        wvv = gs.loc[gs.season == "Winter", "n"].values
        s[:len(sv)] = sv
        wv[:len(wvv)] = wvv
        r, l, h = bootstrap_ratio(s, wv, n_boot=500)
        rows.append({"crime_type": ty, "summer_per_day": s.mean(), "winter_per_day": wv.mean(),
                     "summer_winter_ratio": r, "ci_lo": l, "ci_hi": h, "records": int(len(g))})
    types = pd.DataFrame(rows).sort_values("summer_winter_ratio", ascending=False)
    return by_month, {"summer_per_day": float(summer.mean()), "winter_per_day": float(winter.mean()),
                      "ratio": ratio, "ci_lo": lo, "ci_hi": hi, "kruskal_H": float(kw.statistic),
                      "kruskal_p": float(kw.pvalue), "n_days": int(len(daily))}, types


def type_hour_clusters(w, min_n=3000):
    """Cluster crime types by the shape of their 24h profile (placeholder-time records excluded)."""
    x = w[~w["default_time"]]
    ct = pd.crosstab(x["Primary Type Harmonised"], x["hour"])
    ct = ct[ct.sum(axis=1) >= min_n]
    prof = ct.div(ct.sum(axis=1), axis=0)
    best = None
    for k in range(2, min(7, len(prof))):
        km = KMeans(k, n_init=20, random_state=SEED).fit(prof.values)
        s = silhouette_score(prof.values, km.labels_)
        if best is None or s > best[0]:
            best = (s, k, km)
    s, k, km = best
    # name clusters by peak hour of centroid
    names = {}
    for c in range(k):
        peak = int(km.cluster_centers_[c].argmax())
        names[c] = f"Peak ~{peak:02d}:00"
    rows = []
    for ty, lab in zip(prof.index, km.labels_):
        rows.append({"crime_type": ty, "cluster": int(lab), "cluster_name": names[lab],
                     "records": int(ct.loc[ty].sum()), "profile": [float(v) for v in prof.loc[ty].values]})
    return rows, {"k": int(k), "silhouette": float(s)}


def holiday_features(idx):
    cal = USFederalHolidayCalendar()
    hol = cal.holidays(idx.min(), idx.max())
    return pd.Series(idx.isin(hol).astype(int), index=idx)


def daily_glm(w, train_end="2016-12-31"):
    """Poisson GLM on daily counts: weekday + month + holiday. Holdout = after train_end."""
    daily = w.groupby("day").size().rename("n").to_frame()
    X = pd.concat([pd.get_dummies(daily.index.dayofweek, prefix="dow", dtype=float).set_index(daily.index),
                   pd.get_dummies(daily.index.month, prefix="m", dtype=float).set_index(daily.index),
                   holiday_features(daily.index).rename("holiday")], axis=1)
    tr = daily.index <= train_end
    mdl = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(X[tr], daily.loc[tr, "n"])
    pred = pd.Series(mdl.predict(X), index=daily.index)
    ho = ~tr
    mape = float(np.mean(np.abs(pred[ho] - daily.loc[ho, "n"]) / daily.loc[ho, "n"]))
    naive = daily["n"].shift(7)       # same weekday last week
    mape_naive = float(np.mean(np.abs(naive[ho] - daily.loc[ho, "n"]) / daily.loc[ho, "n"]))
    # refit on all for anomaly residuals
    mdl_all = PoissonRegressor(alpha=1e-6, max_iter=1000).fit(X, daily["n"])
    fitted = pd.Series(mdl_all.predict(X), index=daily.index)
    resid = (daily["n"] - fitted) / np.sqrt(fitted)
    mad = np.median(np.abs(resid - np.median(resid))) * 1.4826
    z = (resid - np.median(resid)) / mad
    out = daily.assign(expected=fitted, z=z)
    return out, {"holdout_from": "2017-01-01", "holdout_days": int(ho.sum()), "mape_glm": mape,
                 "mape_same_weekday_last_week": mape_naive, "mad_sigma": float(mad),
                 "holiday_coef": float(mdl_all.coef_[-1])}


def anomaly_table(daily_fit, w, top=12):
    top_days = daily_fit.reindex(daily_fit["z"].abs().sort_values(ascending=False).index).head(top)
    rows = []
    for d, r in top_days.iterrows():
        day = w[w["day"] == d]
        base_mix = w["Primary Type Harmonised"].value_counts(normalize=True)
        mix = day["Primary Type Harmonised"].value_counts(normalize=True)
        lift = (mix / base_mix).dropna()
        lift = lift[day["Primary Type Harmonised"].value_counts() >= 20]
        drv = lift.sort_values(ascending=False).head(1)
        rows.append({"date": d.strftime("%Y-%m-%d"), "day_of_week": d.day_name(), "crimes": int(r["n"]),
                     "expected": float(r["expected"]), "z": float(r["z"]),
                     "top_over_represented_type": (drv.index[0] if len(drv) else None),
                     "type_lift": (float(drv.iloc[0]) if len(drv) else None)})
    return rows


def era_comparison(a, b):
    """Seasonally matched comparison of two dense windows (same calendar months only)."""
    months = sorted(set(a["month"]) & set(b["month"]))
    a = a[a["month"].isin(months)]
    b = b[b["month"].isin(months)]
    da = a.groupby("day").size()
    db = b.groupby("day").size()
    ratio, lo, hi = bootstrap_ratio(db.values, da.values)
    rows = []
    for col, key in (("crime_category", "category"), ("Primary Type Harmonised", "type")):
        for ty in sorted(set(a[col]) | set(b[col])):
            ca = (a[col] == ty).sum() / len(da)
            cb = (b[col] == ty).sum() / len(db)
            if ca * len(da) + cb * len(db) < 2000:
                continue
            rows.append({"level": key, "name": ty, "per_day_A": float(ca), "per_day_B": float(cb),
                         "change_pct": float((cb / ca - 1) * 100) if ca > 0 else None,
                         "share_A": float(ca / (len(a) / len(da)) * 100), "share_B": float(cb / (len(b) / len(db)) * 100)})
    arr_a, arr_b = a["Arrest"].mean() * 100, b["Arrest"].mean() * 100
    return pd.DataFrame(rows), {"months_matched": months, "per_day_A": float(da.mean()), "per_day_B": float(db.mean()),
                                "ratio_B_over_A": ratio, "ci_lo": lo, "ci_hi": hi,
                                "arrest_rate_A": float(arr_a), "arrest_rate_B": float(arr_b),
                                "days_A": int(len(da)), "days_B": int(len(db))}


def first_of_month_artifact(w, min_n=1500):
    """Records dated on day 1 of a month are over-represented for some types (unknown-date placeholder?)."""
    d1 = w["Date"].dt.day == 1
    expected = 1 / w["Date"].dt.days_in_month.mean()
    rows = []
    for ty, g in w.groupby("Primary Type Harmonised"):
        if len(g) < min_n:
            continue
        share = float((g["Date"].dt.day == 1).mean())
        rows.append({"crime_type": ty, "records": int(len(g)), "day1_share_pct": share * 100,
                     "expected_share_pct": float(expected * 100), "excess_records": float((share - expected) * len(g)),
                     "lift": share / expected})
    t = pd.DataFrame(rows).sort_values("lift", ascending=False)
    other = w.loc[~d1, "default_time"].mean()
    return t, {"day1_records": int(d1.sum()), "day1_per_month": float(d1.sum() / w["month_start"].nunique()),
               "avg_other_day_per_month": float((~d1).sum() / w["month_start"].nunique() / 29.4),
               "default_time_share_day1": float(w.loc[d1, "default_time"].mean()),
               "default_time_share_other": float(other),
               "excess_total": float(t["excess_records"].clip(lower=0).sum())}
