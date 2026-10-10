"""Small, auditable statistics helpers (scipy/numpy only)."""
import numpy as np
import pandas as pd
from scipy import stats

from config import SEED


def wilson(k, n, z=1.96):
    k = np.asarray(k, float)
    n = np.asarray(n, float)
    p = np.where(n > 0, k / np.maximum(n, 1), np.nan)
    den = 1 + z ** 2 / n
    centre = (p + z ** 2 / (2 * n)) / den
    half = z * np.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2)) / den
    return centre - half, centre + half


def poisson_ci(k, alpha=0.05):
    """Exact (Garwood) CI for a Poisson count."""
    k = np.asarray(k, float)
    lo = np.where(k > 0, stats.chi2.ppf(alpha / 2, 2 * k) / 2, 0.0)
    hi = stats.chi2.ppf(1 - alpha / 2, 2 * (k + 1)) / 2
    return lo, hi


def bh_fdr(p):
    """Benjamini-Hochberg adjusted p-values."""
    p = np.asarray(p, float)
    n = len(p)
    order = np.argsort(p)
    ranked = p[order] * n / (np.arange(n) + 1)
    adj = np.minimum.accumulate(ranked[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.minimum(adj, 1)
    return out


def cramers_v(table):
    table = np.asarray(table)
    chi2 = stats.chi2_contingency(table, correction=False)[0]
    n = table.sum()
    r, c = table.shape
    return float(np.sqrt(chi2 / (n * (min(r, c) - 1)))), float(chi2)


def bootstrap_ratio(a, b, n_boot=2000, seed=SEED):
    """Bootstrap CI for mean(a)/mean(b) resampling observations (e.g. daily counts)."""
    rng = np.random.default_rng(seed)
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    ia = rng.integers(0, len(a), (n_boot, len(a)))
    ib = rng.integers(0, len(b), (n_boot, len(b)))
    r = a[ia].mean(1) / b[ib].mean(1)
    return float(a.mean() / b.mean()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def clean_records(df: pd.DataFrame):
    """DataFrame -> JSON-safe records (NaN -> None, numpy -> python)."""
    df = df.astype(object).where(df.notna(), None)
    recs = df.to_dict("records")
    for r in recs:
        for k, v in r.items():
            if isinstance(v, (np.integer,)):
                r[k] = int(v)
            elif isinstance(v, (np.floating,)):
                r[k] = float(v)
            elif isinstance(v, (np.bool_,)):
                r[k] = bool(v)
            elif isinstance(v, pd.Timestamp):
                r[k] = v.strftime("%Y-%m-%d")
    return recs
