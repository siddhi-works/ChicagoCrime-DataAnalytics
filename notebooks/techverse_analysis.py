# %% [markdown]
# # TECHVERSE - Chicago Crimes walkthrough (run top to bottom; each cell is explainable in the viva)
# Source workbook is only read, never written.
# %%
import sys; sys.path.insert(0, "../src")
import pandas as pd
from load import load_raw
from clean import clean
from features import add_features
raw = load_raw()
print(raw.shape, raw["Date"].map(type).value_counts().to_dict() if False else raw["Date__src"].value_counts().to_dict())
# %% [markdown]
# ## 1. Date repair: text cells vs Excel-converted datetimes (month/day swapped)
# %%
df, log = clean(raw)
df = add_features(df)
log["date_repair"]
# %% [markdown]
# ## 2. Handout KPIs
# %%
from kpis import compute_kpis
pd.DataFrame(compute_kpis(df))[["id", "label", "value", "unit"]]
# %% [markdown]
# ## 3. Where is the data dense? (windows are *found*, not assumed)
# %%
from windows import dense_windows
dense_windows(df)
# %% [markdown]
# ## 4. Handout charts Q1-Q10 (tidy data)
# %%
from charts import build_handout_charts
ch = build_handout_charts(df)
pd.DataFrame(ch["q01"]["data"]).head()
# %% [markdown]
# ## 5. Deeper analysis: see src/stats_time.py, stats_arrest.py, stats_geo.py - run `python run_all.py` to build everything and validate.
