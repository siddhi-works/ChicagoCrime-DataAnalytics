"""Arrest analysis: CIs, Simpson's-paradox standardisation, SIR by district, interpretable + benchmark models."""
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import SEED, TOD_ORDER
from statlib import wilson, poisson_ci, bh_fdr

TYPE = "Primary Type Harmonised"


def arrest_by_type(w, min_n=1000):
    g = w.groupby(TYPE)["Arrest"].agg(["sum", "size"]).rename(columns={"sum": "arrests", "size": "crimes"})
    g = g[g["crimes"] >= min_n]
    g["arrest_rate_pct"] = g["arrests"] / g["crimes"] * 100
    lo, hi = wilson(g["arrests"], g["crimes"])
    g["ci_lo"], g["ci_hi"] = lo * 100, hi * 100
    return g.sort_values("arrest_rate_pct", ascending=False).reset_index()


def tod_standardised(w):
    """Raw vs type-mix-standardised arrest rate by time of day (direct standardisation, weights = overall mix)."""
    w = w.copy()
    mix = w[TYPE].value_counts(normalize=True)
    cell = w.groupby(["time_of_day", TYPE])["Arrest"].agg(["mean", "size"])
    rows = []
    for tod in TOD_ORDER:
        c = cell.loc[tod]
        raw = w.loc[w["time_of_day"] == tod, "Arrest"].mean() * 100
        m = mix.reindex(c.index).fillna(0)
        std = float((c["mean"] * m).sum() / m.sum() * 100)
        k = int(w.loc[w["time_of_day"] == tod, "Arrest"].sum())
        n = int((w["time_of_day"] == tod).sum())
        lo, hi = wilson(k, n)
        narc = float((w.loc[w["time_of_day"] == tod, TYPE] == "NARCOTICS").mean() * 100)
        rows.append({"time_of_day": tod, "crimes": n, "raw_rate_pct": raw, "standardised_rate_pct": std,
                     "raw_ci_lo": float(lo * 100), "raw_ci_hi": float(hi * 100), "narcotics_share_pct": narc})
    return pd.DataFrame(rows)


def district_sir(w, min_n=3000):
    """Indirect standardisation: observed arrests vs arrests expected from each district's crime-type mix."""
    rate_t = w.groupby(TYPE)["Arrest"].mean()
    w = w.assign(exp_p=w[TYPE].map(rate_t))
    g = w.groupby("District").agg(crimes=("Arrest", "size"), arrests=("Arrest", "sum"), expected=("exp_p", "sum"))
    g = g[g["crimes"] >= min_n]
    g["raw_rate_pct"] = g["arrests"] / g["crimes"] * 100
    g["expected_rate_pct"] = g["expected"] / g["crimes"] * 100
    g["sir"] = g["arrests"] / g["expected"]
    lo, hi = poisson_ci(g["arrests"].values)
    g["sir_lo"], g["sir_hi"] = lo / g["expected"].values, hi / g["expected"].values
    # two-sided exact-ish Poisson p-value (overdispersion ignored -> treat as screening, FDR-adjusted)
    p = []
    for k, e in zip(g["arrests"], g["expected"]):
        p.append(2 * min(stats.poisson.cdf(k, e), stats.poisson.sf(k - 1, e), 0.5))
    g["p_value"] = p
    g["p_fdr"] = bh_fdr(g["p_value"].values)
    g["flag"] = np.where((g["p_fdr"] < 0.05) & (g["sir_lo"] > 1), "above expected",
                         np.where((g["p_fdr"] < 0.05) & (g["sir_hi"] < 1), "below expected", "in line"))
    return g.sort_values("sir", ascending=False).reset_index()


def domestic_vs_nondomestic(w, min_n=1500):
    rows = []
    for ty, g in w.groupby(TYPE):
        d = g[g["Domestic"]]
        nd = g[~g["Domestic"]]
        if len(d) < min_n // 3 or len(nd) < min_n // 3:
            continue
        rows.append({"crime_type": ty, "domestic_n": len(d), "non_domestic_n": len(nd),
                     "domestic_arrest_pct": d["Arrest"].mean() * 100, "non_domestic_arrest_pct": nd["Arrest"].mean() * 100,
                     "domestic_share_pct": len(d) / len(g) * 100})
    return pd.DataFrame(rows).sort_values("domestic_n", ascending=False)


def domestic_profile(w):
    by_hour = w[~w["default_time"]].groupby("hour")["Domestic"].agg(["mean", "size"]).reset_index()
    by_hour["domestic_share_pct"] = by_hour["mean"] * 100
    by_dow = w.groupby("day_of_week")["Domestic"].mean().mul(100).rename("domestic_share_pct").reset_index()
    return by_hour[["hour", "domestic_share_pct", "size"]].rename(columns={"size": "crimes"}), by_dow


def location_profile(w, top=15):
    g = w.groupby("Location Description").agg(crimes=("Arrest", "size"), arrest_rate_pct=("Arrest", "mean"),
                                              domestic_share_pct=("Domestic", "mean"))
    g[["arrest_rate_pct", "domestic_share_pct"]] *= 100
    g["share_pct"] = g["crimes"] / g["crimes"].sum() * 100
    top_loc = g.sort_values("crimes", ascending=False).head(top)
    top_types = w[TYPE].value_counts().head(8).index
    sel = w[w["Location Description"].isin(top_loc.index[:8]) & w[TYPE].isin(top_types)]
    ct = pd.crosstab(sel["Location Description"], sel[TYPE])
    share = ct.div(ct.sum(axis=1), axis=0) * 100
    return top_loc.reset_index(), share.stack().rename("share_pct").reset_index().rename(
        columns={"Location Description": "location", TYPE: "crime_type"})


def _features(w):
    top_loc = w["Location Description"].value_counts().head(15).index
    top_type = w[TYPE].value_counts().head(25).index
    X = pd.DataFrame({
        "crime_type": w[TYPE].where(w[TYPE].isin(top_type), "OTHER_TYPE"),
        "location": w["Location Description"].where(w["Location Description"].isin(top_loc), "OTHER_LOC"),
        "district": w["District"].astype(str),
        "time_of_day": w["time_of_day"],
        "day_of_week": w["day_of_week"],
        "domestic": w["Domestic"].astype(int),
        "weekend": w["is_weekend"].astype(int),
    })
    return X, w["Arrest"].astype(int)


def _encoder(X, cat):
    ref = [X[c].value_counts().index[0] for c in cat]          # reference = most common level (interpretable)
    return OneHotEncoder(handle_unknown="ignore", drop=ref)


def arrest_models(w, split_date="2017-01-01", n_boot=15):
    """Temporal hold-out (train on earlier months, test on later) so we test generalisation, not memorisation.
    Odds ratios are vs the most common level of each factor; CIs are bootstrap percentiles (full-size resamples)."""
    X, y = _features(w)
    tr = (w["Date"] < split_date).values
    cat = ["crime_type", "location", "district", "time_of_day", "day_of_week"]
    num = ["domestic", "weekend"]

    def make():
        return make_pipeline(ColumnTransformer([("c", _encoder(X[tr], cat), cat), ("n", "passthrough", num)]),
                             LogisticRegression(max_iter=500, C=100.0))
    lr = make().fit(X[tr], y[tr])
    p_lr = lr.predict_proba(X[~tr])[:, 1]
    base_rate = float(y[tr].mean())
    out = {"train_n": int(tr.sum()), "test_n": int((~tr).sum()), "test_from": split_date,
           "auc_logistic": float(roc_auc_score(y[~tr], p_lr)), "brier_logistic": float(brier_score_loss(y[~tr], p_lr)),
           "brier_baseline": float(brier_score_loss(y[~tr], np.full((~tr).sum(), base_rate))), "bootstrap_reps": n_boot}
    names = list(lr[0].get_feature_names_out())
    coef = lr[-1].coef_[0]
    rng = np.random.default_rng(SEED)
    idx_tr = np.flatnonzero(tr)
    boots = []
    for _ in range(n_boot):
        s_ = rng.choice(idx_tr, size=len(idx_tr), replace=True)
        boots.append(make().fit(X.iloc[s_], y.iloc[s_])[-1].coef_[0])
    boots = np.array(boots)
    ors = pd.DataFrame({"term": names, "odds_ratio": np.exp(coef), "or_lo": np.exp(np.percentile(boots, 2.5, axis=0)),
                        "or_hi": np.exp(np.percentile(boots, 97.5, axis=0))})
    ors["term"] = ors["term"].str.replace("c__", "", regex=False).str.replace("n__", "", regex=False)
    # Gradient boosting benchmark
    Xo = X.copy()
    for c in cat:
        Xo[c] = Xo[c].astype("category")
    hgb = HistGradientBoostingClassifier(categorical_features=[Xo.columns.get_loc(c) for c in cat], max_iter=200,
                                         learning_rate=0.1, random_state=SEED)
    hgb.fit(Xo[tr], y[tr])
    p_h = hgb.predict_proba(Xo[~tr])[:, 1]
    out["auc_gradient_boosting"] = float(roc_auc_score(y[~tr], p_h))
    out["brier_gradient_boosting"] = float(brier_score_loss(y[~tr], p_h))
    # permutation importance (AUC drop) on a test subsample
    te = np.flatnonzero(~tr)
    sub = rng.choice(te, size=min(40_000, len(te)), replace=False)
    pi = permutation_importance(hgb, Xo.iloc[sub], y.iloc[sub], scoring="roc_auc", n_repeats=5, random_state=SEED)
    imp = pd.DataFrame({"feature": Xo.columns, "auc_drop": pi.importances_mean, "auc_drop_sd": pi.importances_std}) \
        .sort_values("auc_drop", ascending=False)
    # calibration (deciles of predicted prob from the logistic model)
    q = pd.qcut(pd.Series(p_lr), 10, duplicates="drop")
    cal = pd.DataFrame({"pred": p_lr, "obs": y[~tr].values, "bin": q.values}).groupby("bin", observed=True) \
        .agg(predicted_pct=("pred", "mean"), observed_pct=("obs", "mean"), n=("obs", "size")).reset_index(drop=True)
    cal[["predicted_pct", "observed_pct"]] *= 100
    return ors, imp, cal, out
