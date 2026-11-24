import os
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestRegressor
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error


# =====================================
# 1. CONFIGURATION
# =====================================

DATA_PATH = "data/chicago_crime.csv"

MODEL_DIR = "models"
OUTPUT_DIR = "outputs"

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# =====================================
# 2. LOAD DATA
# =====================================

print("Loading Chicago Crime Dataset...")

df = pd.read_csv(DATA_PATH, low_memory=False)

df.columns = df.columns.str.strip()

# Identify area column
if "Community Area" in df.columns:
    AREA_COL = "Community Area"
elif "District" in df.columns:
    AREA_COL = "District"
else:
    raise ValueError(
        "Dataset must contain Community Area or District column"
    )

if "Date" not in df.columns:
    raise ValueError("Date column not found")

# Convert dates
df["Date"] = pd.to_datetime(
    df["Date"],
    errors="coerce"
)

df = df.dropna(subset=["Date", AREA_COL]).copy()

df["Area"] = df[AREA_COL].astype(str).str.strip()

df = df[df["Area"].ne("") & df["Area"].ne("nan")]

if df.empty:
    raise ValueError("No valid crime records found")

print("Dataset loaded:", len(df), "records")


# =====================================
# 3. MONTHLY CRIME COUNTS
# =====================================

df["Month"] = df["Date"].dt.to_period("M")

crime_data = (
    df.groupby(["Area", "Month"])
      .size()
      .reset_index(name="Crime_Count")
)

areas = sorted(crime_data["Area"].unique())

months = pd.period_range(
    crime_data["Month"].min(),
    crime_data["Month"].max(),
    freq="M"
)

# Fill missing months with zero counts
full_index = pd.MultiIndex.from_product(
    [areas, months],
    names=["Area", "Month"]
)

monthly = (
    crime_data.set_index(["Area", "Month"])
    .reindex(full_index, fill_value=0)
    .reset_index()
)

monthly = monthly.sort_values(
    ["Area", "Month"]
).reset_index(drop=True)


# =====================================
# 4. FEATURE ENGINEERING
# =====================================

monthly["Month_Number"] = monthly["Month"].dt.month

group = monthly.groupby("Area")["Crime_Count"]

monthly["Previous_Month"] = group.shift(1)
monthly["Previous_2_Month"] = group.shift(2)
monthly["Previous_3_Month"] = group.shift(3)

monthly["Rolling_Average"] = (
    monthly["Previous_Month"]
    + monthly["Previous_2_Month"]
    + monthly["Previous_3_Month"]
) / 3

monthly = monthly.dropna().copy()

features = [
    "Area",
    "Month_Number",
    "Previous_Month",
    "Previous_2_Month",
    "Previous_3_Month",
    "Rolling_Average"
]

target = "Crime_Count"

if monthly.empty:
    raise ValueError("Insufficient historical data")


# =====================================
# 5. TRAIN TEST SPLIT
# =====================================

unique_months = sorted(monthly["Month"].unique())

if len(unique_months) < 2:
    raise ValueError("Need more historical months for evaluation")

split_index = max(
    1,
    int(len(unique_months) * 0.8)
)

if split_index >= len(unique_months):
    split_index = len(unique_months) - 1

test_start = unique_months[split_index]

train = monthly[monthly["Month"] < test_start]
test = monthly[monthly["Month"] >= test_start]

X_train = train[features]
X_test = test[features]

y_train = train[target]
y_test = test[target]


# =====================================
# 6. RANDOM FOREST MODEL
# =====================================

preprocessor = ColumnTransformer([
    (
        "area",
        OneHotEncoder(handle_unknown="ignore"),
        ["Area"]
    )
], remainder="passthrough")

model = Pipeline([
    ("preprocessor", preprocessor),

    ("random_forest", RandomForestRegressor(
        n_estimators=200,
        max_depth=14,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    ))
])

print("\nTraining Random Forest Regressor...")

model.fit(X_train, y_train)


# =====================================
# 7. MODEL EVALUATION
# =====================================

predictions = np.maximum(
    model.predict(X_test),
    0
)

mae = mean_absolute_error(
    y_test,
    predictions
)

rmse = np.sqrt(
    mean_squared_error(y_test, predictions)
)

print("\nMODEL PERFORMANCE")
print("-------------------------")

print("Test starts:", test_start)
print("MAE:", round(mae, 2))
print("RMSE:", round(rmse, 2))


# =====================================
# 8. FUTURE MONTH ESTIMATION
# =====================================

latest_month = max(months)

next_month = latest_month + 1

future_rows = []

for area in areas:

    history = (
        monthly[
            monthly["Area"] == area
        ]
        .sort_values("Month")
    )

    # Use the complete monthly series,
    # including zero-count months.
    counts = (
        crime_data[
            crime_data["Area"] == area
        ]
        .set_index("Month")["Crime_Count"]
        .reindex(months, fill_value=0)
    )

    if len(counts) < 3:
        continue

    last_three = counts.iloc[-3:].values

    future_rows.append({
        "Area": area,
        "Month_Number": next_month.month,
        "Previous_Month": last_three[-1],
        "Previous_2_Month": last_three[-2],
        "Previous_3_Month": last_three[-3],
        "Rolling_Average": np.mean(last_three)
    })


future = pd.DataFrame(future_rows)

if future.empty:
    raise ValueError("No areas available for forecasting")

future_predictions = np.maximum(
    model.predict(future[features]),
    0
)


# =====================================
# 9. HOTSPOT RANKING
# =====================================

hotspots = pd.DataFrame({

    "Area": future["Area"],

    "Forecast_Month": str(next_month),

    "Estimated_Crime_Count": np.round(
        future_predictions,
        1
    )
})

hotspots = hotspots.sort_values(
    by="Estimated_Crime_Count",
    ascending=False
).reset_index(drop=True)

hotspots.insert(
    0,
    "Rank",
    range(1, len(hotspots) + 1)
)

if len(hotspots) >= 3:

    hotspots["Relative_Level"] = pd.qcut(
        hotspots["Estimated_Crime_Count"].rank(
            method="first"
        ),
        q=3,
        labels=["Lower", "Medium", "Higher"]
    ).astype(str)

else:

    hotspots["Relative_Level"] = "Relative estimate"


# =====================================
# 10. SAVE MODEL AND RESULTS
# =====================================

joblib.dump(
    {
        "model": model,
        "features": features,
        "area_column": AREA_COL,
        "last_historical_month": str(latest_month),
        "forecast_month": str(next_month),
        "mae": mae,
        "rmse": rmse
    },
    os.path.join(
        MODEL_DIR,
        "crime_hotspot_model.pkl"
    )
)

hotspots.to_csv(
    os.path.join(
        OUTPUT_DIR,
        "future_crime_hotspots.csv"
    ),
    index=False
)


# =====================================
# 11. DISPLAY RESULTS
# =====================================

print("\nFUTURE CRIME HOTSPOT ESTIMATES")
print("--------------------------------")

print(
    hotspots.head(10).to_string(index=False)
)

print("\nModel saved successfully!")

print(
    "Model: models/crime_hotspot_model.pkl"
)

print(
    "Results: outputs/future_crime_hotspots.csv"
)

print("\nForecast month:", next_month)

print(
    "\nNote: These are exploratory area-level "
    "statistical estimates, not guaranteed crime predictions."
)
