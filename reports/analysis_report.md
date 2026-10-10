# TECHVERSE - Chicago Crimes: analysis report

Generated from `export/` by `src/docs.py`. Every number below is read from the exported JSON.

## 1. Problem and data

Source: Provided by the competition organisers. Column layout matches the City of Chicago Data Portal dataset 'Crimes - 2001 to Present' (Chicago Police Dept.); confirm before citing as such. File: `Crime Dataset.xlsx` (read-only; byte-identical after analysis - see `validate.py`).
Windows detected from data: A = 2015-04-01 to 2017-08-01 (excl.), 627,787 records; B = 2025-10-01 to 2026-09-01 (excl.), 211,787 records; 209,001 records elsewhere.

## 2. KPIs (handout definitions, whole dataset)

| KPI | value | formula |
|---|---|---|
| K1 Total crimes | 1,048,575  | rows in dataset |
| K2 Arrest rate | 20.49 % | Arrest=TRUE / total |
| K3 Domestic crime | 18.34 % | Domestic=TRUE / total |
| K4 Different crime types | 33  | distinct Primary Type (raw labels) |
| K5 Crimes in 2016 | 268,944  | rows with Year=2016 |
| K6 Avg crimes per month (Apr 2015-Jul 2017) | 22,420.96 count/month | rows in window / months in window |
| K7 Night-time crime (00:00-05:59) | 17.73 % | Time of Day=Night / total |
| K8 Violent crime | 29.20 % | Category=Violent / total |

## 3. Cleaning log

```json
{
 "rows_in": 1048575,
 "date_repair": {
  "text_cells": 623937,
  "excel_datetime_cells_swapped": 424638,
  "unparseable": 0,
  "year_matches_Year_col_after": 1.0,
  "date_after_updated_on_share_before_repair": 0.03296,
  "date_after_updated_on_share_after_repair": 0.0,
  "month_swap_evidence": "Excel-converted cells have day<=12 only and a flat 'month' distribution; text cells have day>=13 only. Ambiguous cells were read day-first by Excel."
 },
 "location_description_null_filled_UNKNOWN": 8337,
 "primary_types_raw": 33,
 "primary_types_harmonised": 32,
 "coords_missing": 327690,
 "coords_outside_chicago_nulled": 16,
 "community_area_zero_to_null": 2616,
 "ward_missing": 16478,
 "community_area_missing_after": 19121,
 "districts": [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  22,
  24,
  25,
  31,
  61
 ],
 "duplicate_ids": 0,
 "duplicate_case_numbers_kept": 13,
 "duplicate_full_rows": 0,
 "rows_out": 1048575
}
```

## 4. Assumptions and limitations

- Excel-converted Date cells were read day-first and are swapped back (month<->day).
- Handout KPIs use the whole dataset (ground rules); deeper analysis uses the two dense windows.
- CRIM SEXUAL ASSAULT and CRIMINAL SEXUAL ASSAULT are one offence under two labels; merged only in the harmonised column.
- Timestamps at exactly 00:00/12:00 are treated as possible placeholders in sensitivity analyses, never dropped from handout metrics.
- No population or area denominators exist in the data, so no per-capita statements are made.
- p-values are secondary: with n ~ 10^5-10^6 effect sizes and CIs are reported; multiple comparisons use Benjamini-Hochberg FDR.

- File is a truncated slice (Excel row limit); only two periods are dense.
- Window B has ~0% coordinates; arrest outcomes in recent months may be incomplete.
- Models describe association, not causation.

## 5. Findings

### Headline

**Summer days see 17% more crime than winter days**  
In window A the daily average is 788 in Jun-Aug vs 674 in Dec-Feb (ratio 1.17, 95% CI 1.14-1.19; Kruskal-Wallis p=2.0e-59). Biggest swing: Weapons Violation x1.46; smallest: Deceptive Practice x0.92.
*Method:* Daily counts by season; bootstrap ratio over days (2000 resamples); per-type ratios. *Caveat:* Window A spans 28 months; Mar-Dec seen twice at most, so month-level estimates carry year-specific noise.
*Charts:* q01, q04, x_month_per_day, x_season_types

**Weekend nights run 69% above weekday nights; the daily peak is around 18:00**  
Excluding placeholder timestamps, between 00:00 and 05:59 a weekend day logs 1.69x the crimes of a weekday. The quietest hour is 05:00. The hour-by-weekday heat map is the single most informative view of timing.
*Method:* Crimes per calendar day by weekday and hour (window A, placeholder times excluded).
*Charts:* q10, x_hour_dow_heatmap, x_hour_profile

**86% of the raw night-to-evening arrest-rate gap is explained by crime-type mix**  
Raw arrest rate rises from 18.1% (night) to 25.4% (evening), a 7.3-pt gap. After standardising to the overall crime-type mix the gap is 1.0 pts (21.4% vs 22.4%). Narcotics make up 2.3% of night crimes but 8.1% of evening crimes, and 100% of narcotics records end in arrest (vs 22% overall).
*Method:* Direct standardisation of time-of-day arrest rates to the overall crime-type distribution. *Caveat:* Standardisation adjusts for observed crime type only; other confounders may remain.
*Charts:* q06, x_arrest_tod_standardised

**District arrest rates vs what their crime mix predicts: 6 above, 9 below**  
District 11 has the highest arrest rate among the top-10 districts by volume (38.3%). Given its crime-type mix we would expect 39.5%, an index of 0.98 (95% CI 0.97-1.00) - i.e. it is explained by what is reported there. After adjustment 6 districts are above expectation (largest: District 1, index 1.23) and 9 below (lowest: District 2, index 0.85).
*Method:* Indirect standardisation (SIR) with exact Poisson CIs and Benjamini-Hochberg FDR across districts. *Caveat:* Screening result; CIs ignore overdispersion and spatial correlation.
*Charts:* q09, x_district_sir

**What was reported predicts arrest far better than when or where (AUC 0.86 on unseen later months)**  
Trained on records before 2017-01-01 (474,279) and tested on later ones (153,508): logistic AUC 0.837, gradient boosting 0.865. Shuffling crime_type costs 0.310 AUC, location 0.100, while time of day plus weekday together cost 0.005. Brier score improves from 0.162 (base rate) to 0.095.
*Method:* Temporal hold-out; permutation importance; calibration deciles. *Caveat:* Predictive association, not causal; arrest outcomes can also be recorded after the report.
*Charts:* x_arrest_importance, x_arrest_odds_ratios, x_arrest_calibration

**Daily crime in window B is 14% below window A; Motor Vehicle Theft changed most (+68%)**  
Matching calendar months, window B averages 632 crimes/day vs 733 in window A (ratio 0.86, 95% CI 0.85-0.87). Largest rise: Motor Vehicle Theft (+68%); largest fall: Prostitution (-84%). Arrest rate 21.6% -> 15.4%.
*Method:* Seasonally matched calendar months; bootstrap ratio of daily counts. *Caveat:* Two windows ~10 years apart, not a trend. Window B is recent: arrests recorded later are missing (its arrest rate is likely understated) and, because the file is a slice, B may also be less complete than A.
*Charts:* x_era_change, x_era_category

**1,048,575 crimes; 20.5% led to arrest; 29% were violent**  
Theft (236,314) and battery (185,608) lead the 10 top types. District 11 records the most crimes (69,214).
*Method:* Handout definitions, whole dataset. *Caveat:* Whole-dataset totals mix a dense window with sparse years; see dq_coverage.
*Charts:* q05, q07, q09

### Supporting

**Weekday barely matters (Friday is highest at +4.6% vs average)**  
Per-day volumes differ by only a few percent (Cohen's w = 0.020, a very small effect) even though chi-square is huge at n=627,787. Statistical significance at this sample size says little; the effect size is what matters.
*Method:* Chi-square goodness of fit vs per-day exposure; exact Poisson CIs; Cohen's w.
*Charts:* q02, x_dow_index

**Domestic crime: 18.3% of all records, led by Battery**  
18.3% of all crimes are domestic. For battery the figure is 56%. The domestic share is highest around 02:00 (26%) and lowest around 15:00 (15%).
*Method:* Domestic share by type and hour (window A).
*Charts:* q08, x_domestic_vs_non, x_domestic_by_hour

**Arrest rate ranges 4%-52% across the top 15 locations; domestic share 1%-48%**  
Street is the largest location (22% of crimes). Residence/apartment crimes are 44% domestic with only 14% arrested, while Sidewalk has 39% arrested.
*Method:* Group by Location Description (window A).
*Charts:* x_location_profile, x_location_by_type

**Crime is spread widely: the busiest 10% of beats hold 18% of crimes**  
Beat-level Gini = 0.21 over 275 beats; the top 20% of beats hold 32%. Districts specialise instead: District 11 over-indexes on Narcotics (location quotient 3.7).
*Method:* Lorenz/Gini on beat counts; district x type location quotients (window A). *Caveat:* No population or area denominators in the data, so no per-capita claims.
*Charts:* x_beat_lorenz, x_district_lq

**Crime types fall into 3 groups by when they happen**  
Peak ~09:00: Deceptive Practice, Offense Involving Children; Peak ~19:00: Assault, Burglary, Criminal Trespass, Narcotics, Other Offense; Peak ~22:00: Battery, Criminal Damage, Criminal Sexual Assault, Motor Vehicle Theft, Robbery. Silhouette = 0.28 (descriptive).
*Method:* k-means on normalised 24-hour profiles; k by silhouette. *Caveat:* Groups are not sharply separated.
*Charts:* x_type_hour_clusters

**A weekday + month + holiday model predicts unseen daily counts to within 6.7% on average**  
Hold-out MAPE for Jan-Jul 2017 is 6.7% vs 8.2% for 'same weekday last week'. 9 of the 12 largest anomalies fall on the 1st of a month (see placeholder dates); the largest non-1st anomaly is 2017-03-14 (471 vs 675 expected).
*Method:* Poisson GLM, train 2015-04..2016-12, test 2017-01..07; robust MAD z for anomalies.
*Charts:* x_daily_expected, x_anomalies

### Data Quality

**424,638 dates had month and day swapped by Excel; we repaired them**  
40% of the Date cells were stored as real datetimes (all with day <= 12), the rest as MM/DD/YYYY text. Excel read the ambiguous ones day-first. Swapping them back makes records dated after their own 'Updated On' stamp fall from 3.3% to 0.0%, and reproduces the handout's monthly chart.
*Method:* Compare text vs datetime cells; test day/month distributions; consistency with Updated On. *Caveat:* The original workbook was not modified; the repair is applied in memory by src/clean.py.
*Charts:* q01

**Only two periods are dense: 2015-04-01 to 2017-07-31 and 2025-10-01 to 2026-08-31**  
The file holds 1,048,575 records but 209,001 (19.9%) fall outside these two windows, at 300-900 records/month versus ~20,000. It looks like a truncated slice of a larger table (row count equals Excel's 1,048,576 row limit). Multi-year trends are therefore not supported; deep dives use window A (and window B for a before/after contrast).
*Method:* Daily record counts; contiguous runs >= 60 days with >= 200 records/day. *Caveat:* Handout KPIs use the whole dataset, as required, so sparse years are included in K1-K5, K7, K8.
*Charts:* x_coverage_grid

**Coordinates are missing for 100.0% of window B but only 1.7% of window A**  
Maps are only meaningful for window A. Within window A, missing coordinates concentrate in sensitive categories Sex Offense (14%), Offense Involving Children (13%), Criminal Sexual Assault (10%).
*Method:* Share of records without latitude/longitude by window and crime type; chi-square / Cramer's V. *Caveat:* District, beat and ward remain available in window B.
*Charts:* x_district_lq

**Records dated on the 1st of a month are inflated: Sex Offense is 4.4x over-represented**  
If dates were uniform, ~3.3% of each type would fall on the 1st; Sex Offense has 14.4%. Day-1 records also carry placeholder times 9.0% of the time vs 3.6% on other days. This is consistent with reports where the exact date is unknown being booked to the 1st (~4,819 excess records in window A). It also explains the largest daily 'anomalies'.
*Method:* Share of each type on day 1 vs 1/average month length. *Caveat:* An explanation, not proof: the data has no field stating that a date was estimated.
*Charts:* x_first_of_month, x_anomalies

**Night-time share is 17.7% as defined, but 15.8% without placeholder timestamps**  
5.5% of records are stamped exactly 00:00 or 12:00 (41% of all midnight-hour records, 45% of noon-hour records), far more than a smooth clock would give. K7 is reported as the handout defines it, with the sensitivity value alongside.
*Method:* Share of records at exact 00:00/12:00 within each hour.
*Charts:* q03, q06, q10

## 6. Viva cheat-sheet: why each handout chart type

- **Q01** - A line shows ordered, continuous time and makes the repeating seasonal shape and the February dip visible; 28 points is well within what a line can carry.
- **Q02** - Seven discrete ordered categories compared on one measure: columns, in Monday-Sunday order (not alphabetical) so the weekly cycle reads naturally.
- **Q03** - Four ordered parts of the day; columns keep the order Night->Evening and let bar length be compared exactly.
- **Q04** - Four seasons of one year; columns (or a donut) - columns preferred because differences are modest and donut angles are hard to compare.
- **Q05** - Three mutually exclusive parts of one whole - the one case where a donut is justified (share of total).
- **Q06** - A rate for four ordered groups; columns. Shown beside the standardised line so the confounding by crime type is visible.
- **Q07** - Ranked categories with long labels: horizontal bars sorted high to low.
- **Q08** - Same as Q7 for the top 5 domestic types.
- **Q09** - Volume and rate are different units on the same categories, so bars (volume) + line (rate) on a secondary axis show whether busy districts are also high-arrest.
- **Q10** - Two categorical dimensions and a count: a heat map with a colour scale makes the busiest weekday/time cells stand out at a glance.

## 7. Likely judge questions

- *Why did you change the dates?* 40% of Date cells were Excel datetimes with month/day swapped (only possible when day<=12); swapped back, they match Updated On and the handout's monthly chart (`cleaning_log.json`).
- *Why two windows?* The file is a slice of a larger table; only two periods are near-complete (daily-count rule in `windows.py`). Whole-dataset KPIs still follow the handout.
- *Why standardise arrest rates?* Because crime mix differs by hour and district; Simpson's paradox. See `arrest_simpson` and `arrest_district`.
- *Why report effect sizes instead of p-values?* n is 10^5-10^6, so everything is 'significant'; Cohen's w, ratios and CIs say how big.
- *What would change the conclusions?* Population denominators, complete data for window B, a flag for estimated dates.
