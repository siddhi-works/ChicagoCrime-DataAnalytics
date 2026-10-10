"""Find the dense (near-complete) periods empirically from daily record counts - nothing assumed."""
import pandas as pd


def dense_windows(df: pd.DataFrame, min_daily: int = 200, min_days: int = 60):
    daily = df.groupby("day").size()
    full = daily.reindex(pd.date_range(daily.index.min(), daily.index.max()), fill_value=0)
    ok = (full >= min_daily).astype(int)
    run = (ok != ok.shift()).cumsum()
    out = []
    for _, g in ok.groupby(run):
        if g.iloc[0] == 1 and len(g) >= min_days:
            out.append({"start": str(g.index[0].date()), "end": str(g.index[-1].date()), "days": int(len(g)),
                        "records": int(full[g.index].sum()), "mean_per_day": float(full[g.index].mean())})
    return out
