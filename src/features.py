"""Derived columns, using the handout's exact definitions."""
import numpy as np
import pandas as pd
from config import VIOLENT, PROPERTY


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    d = df["Date"]
    df["hour"] = d.dt.hour.astype("int8")
    df["month"] = d.dt.month.astype("int8")
    df["month_start"] = d.dt.to_period("M").dt.to_timestamp()
    df["day"] = d.dt.normalize()
    df["day_of_week"] = d.dt.day_name()
    df["dow"] = d.dt.dayofweek.astype("int8")            # 0 = Monday
    df["is_weekend"] = df["dow"] >= 5
    df["time_of_day"] = pd.cut(df["hour"], [-1, 5, 11, 17, 23],
                               labels=["Night", "Morning", "Afternoon", "Evening"]).astype(str)
    df["season"] = df["month"].map(lambda m: "Winter" if m in (12, 1, 2) else "Spring" if m in (3, 4, 5)
                                   else "Summer" if m in (6, 7, 8) else "Fall")
    pt = df["Primary Type"]
    df["crime_category"] = np.where(pt.isin(VIOLENT), "Violent", np.where(pt.isin(PROPERTY), "Property", "Other"))
    # Timestamps at exactly 00:00 or 12:00 are over-represented placeholders (time unknown) -> flag
    df["default_time"] = (d.dt.minute == 0) & d.dt.hour.isin([0, 12])
    return df
