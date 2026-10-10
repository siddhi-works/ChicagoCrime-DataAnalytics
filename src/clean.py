"""Cleaning. Every action is counted into a log (export/cleaning_log.json). Source workbook is untouched."""
import numpy as np
import pandas as pd
from config import LAT_RANGE, LON_RANGE

TEXT_FMT = "%m/%d/%Y %I:%M:%S %p"


def _parse_stamp(series: pd.Series, origin: pd.Series, swap_datetime: bool) -> pd.Series:
    """Text cells are MM/DD/YYYY hh:mm:ss AM/PM. Cells Excel auto-converted to real datetimes were read
    day-first, so month and day are swapped; swap them back (only possible when both are <=12, which is
    exactly the set Excel converted)."""
    out = pd.Series(pd.NaT, index=series.index, dtype="datetime64[ns]")
    t = origin == "text"
    out[t] = pd.to_datetime(series[t], format=TEXT_FMT, errors="coerce")
    d = ~t
    dt = pd.to_datetime(series[d], format="ISO8601")
    if swap_datetime:
        dt = pd.to_datetime(dict(year=dt.dt.year, month=dt.dt.day, day=dt.dt.month,
                                 hour=dt.dt.hour, minute=dt.dt.minute, second=dt.dt.second))
    out[d] = dt
    return out


def clean(raw: pd.DataFrame):
    log = {"rows_in": int(len(raw))}
    df = raw.copy()

    # --- Date repair -------------------------------------------------------------------------
    df["Date_naive"] = _parse_stamp(raw["Date"], raw["Date__src"], swap_datetime=False)
    df["Updated_naive"] = _parse_stamp(raw["Updated On"], raw["Updated On__src"], swap_datetime=False)
    df["Date"] = _parse_stamp(raw["Date"], raw["Date__src"], swap_datetime=True)
    updated = _parse_stamp(raw["Updated On"], raw["Updated On__src"], swap_datetime=True)
    d = raw["Date__src"] == "datetime"
    log["date_repair"] = {
        "text_cells": int((~d).sum()), "excel_datetime_cells_swapped": int(d.sum()),
        "unparseable": int(df["Date"].isna().sum()),
        "year_matches_Year_col_after": float((df["Date"].dt.year == df["Year"]).mean()),
        "date_after_updated_on_share_before_repair": float((df["Date_naive"] > df["Updated_naive"]).mean()),
        "date_after_updated_on_share_after_repair": float((df["Date"] > updated).mean()),
        "month_swap_evidence": "Excel-converted cells have day<=12 only and a flat 'month' distribution; "
                               "text cells have day>=13 only. Ambiguous cells were read day-first by Excel.",
    }
    df = df.drop(columns=["Date_naive", "Updated_naive", "Date__src", "Updated On__src", "Updated On"])

    # --- Text normalisation --------------------------------------------------------------------
    for c in ["Primary Type", "Description", "Location Description", "Block"]:
        df[c] = df[c].str.strip().str.upper()
    n = int(df["Location Description"].isna().sum())
    df["Location Description"] = df["Location Description"].fillna("UNKNOWN")
    log["location_description_null_filled_UNKNOWN"] = n

    # --- Crime type harmonisation (analysis column; raw kept for handout-literal KPIs) -------
    df["Primary Type Harmonised"] = df["Primary Type"].replace({"CRIM SEXUAL ASSAULT": "CRIMINAL SEXUAL ASSAULT"})
    log["primary_types_raw"] = int(df["Primary Type"].nunique())
    log["primary_types_harmonised"] = int(df["Primary Type Harmonised"].nunique())

    # --- Geography -----------------------------------------------------------------------------
    log["coords_missing"] = int(df["Latitude"].isna().sum())
    bad = df["Latitude"].notna() & ~(df["Latitude"].between(*LAT_RANGE) & df["Longitude"].between(*LON_RANGE))
    log["coords_outside_chicago_nulled"] = int(bad.sum())
    for c in ["Latitude", "Longitude", "X Coordinate", "Y Coordinate"]:
        df.loc[bad, c] = np.nan
    df["has_coords"] = df["Latitude"].notna()
    ca0 = df["Community Area"] == 0
    log["community_area_zero_to_null"] = int(ca0.sum())
    df.loc[ca0, "Community Area"] = np.nan
    log["ward_missing"] = int(df["Ward"].isna().sum())
    log["community_area_missing_after"] = int(df["Community Area"].isna().sum())
    for c in ["Ward", "Community Area"]:
        df[c] = df[c].astype("Int64")
    log["districts"] = sorted(int(x) for x in df["District"].unique())

    # --- Duplicates ----------------------------------------------------------------------------
    log["duplicate_ids"] = int(df["ID"].duplicated().sum())
    log["duplicate_case_numbers_kept"] = int(df["Case Number"].duplicated().sum())
    log["duplicate_full_rows"] = int(df.duplicated().sum())
    log["rows_out"] = int(len(df))
    df = df.drop(columns=["Location"])   # redundant with Latitude/Longitude
    return df, log
