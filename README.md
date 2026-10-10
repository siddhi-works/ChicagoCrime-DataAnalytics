# Chicago Crime Analytics Dashboard

> ### 🏆 TECHVERSE 2026 · Grand Prize Winner
> **Ajeenkya DY Patil** · built by **Team Moleculens**

Live demo: **https://chicagocrime-data-analytics.vercel.app/**

---

## Why this dashboard is different

Most crime dashboards are a wall of charts that assumes you already know what to look for. This one is built around the person using it.

- **Easy to start.** Open it and every headline number is on one page: 8 KPI cards and 10 charts, each clearly labelled with its question. No setup, no login, no manual.
- **Easy to explore.** Four filters (crime type, district, arrest, domestic) update every number, chart and map at the same time. Clicking a bar filters the whole page.
- **Easy to understand.** Findings are written in plain language, as short chapters, with the method and the caveat next to every claim.
- **Easy to trust.** A dedicated Data Trust section shows where the data came from, every cleaning step with its count, what each metric means, and where the data falls short.
- **Easy to ask.** A built-in assistant, Detective Dot, answers questions about the project and the data in plain English, using live calculations on the same data you see on screen.
- **Honest by design.** Comparisons are adjusted for crime mix, models are tested on months they have never seen, and incomplete data is flagged rather than hidden.

---

## Key figures

| Total crimes | Arrest rate | Domestic | Crime types | Crimes in 2016 | Average per month | Night-time | Violent |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 1,048,575 | 20.5% | 18.3% | 33 | 268,944 | 22,421 | 17.7% | 29.2% |

---

## Features

**Dashboard.** All 8 competition KPIs and 10 required visualisations on a single page, with filters, hover details, a table view for every chart, and a definitions and assumptions panel.

**Story.** Deeper findings organised as four chapters: When, Arrests, What and where, and Then versus now. Examples:
- Summer sees about 17% more crime per day than winter.
- Weekend nights run about 69% above weekday nights.
- About 86% of the evening-versus-night arrest gap is explained by crime type rather than time of day.

**District map.** About 2,400 map patches of roughly 550 m each, coloured by their police district's crimes, arrest rate, violent share, domestic share or night share. Selecting a district shows its totals, its main crime types, and whether its arrest rate is above or below what its mix of crimes predicts. Boundaries are derived from the data's own coordinates, not invented.

**Detective Dot (assistant).** Answers general questions (what is a KPI, how was this calculated, what are the main findings) and questions specific to the tab you are on. It can compare two crime types or districts, explain any chart, and share data facts. It uses only this project's analysis and never makes up numbers.

**Data Trust.** Source, processing pipeline, metric definitions, statistical methods, data-quality findings, cleaning log, assumptions and limitations, presented in a single guided section.

**Welcome experience.** A night-city introduction with a moving skyline and a flashlight that follows the cursor over the real crime map, setting the tone for the rest of the site.

**Verified numbers.** Every figure is computed in Python and checked by 44 automated tests. The website re-checks its own calculations when it loads and displays a verification badge.

---

## Tech stack

| Area | Technology |
|---|---|
| Analysis | Python 3.13, pandas, NumPy, SciPy, scikit-learn |
| Data handling | openpyxl, PyArrow (Parquet), Pydantic |
| Dashboard | React, TypeScript, Vite |
| Visualisation | Hand-built SVG and Canvas, d3 (scales and shapes) |
| Motion | Motion (animation library) |
| Typography | Bricolage Grotesque, Inter, JetBrains Mono |
| Hosting | Vercel (static site) |

The project has no server or database. The analysis runs once and produces static files, so the dashboard is fast and works offline.

---

## Data pipeline

1. **Load.** The source workbook is read in read-only mode and fingerprinted (SHA-256) so it is provably unchanged.
2. **Repair.** 424,638 dates had their month and day swapped by Excel; these are corrected and validated three independent ways.
3. **Clean.** Impossible coordinates and empty values are handled without deleting any rows or guessing missing data.
4. **Engineer.** Time of day, season and crime category are added using the competition's exact definitions.
5. **Analyse.** Dense reporting periods are identified, then statistics, standardised comparisons and models are run with confidence intervals and hold-out testing.
6. **Export.** Results are written as JSON files plus a compact pre-aggregated data cube.
7. **Validate.** 44 automated checks confirm totals, orderings, handout values and agreement between the cube and the raw data.
8. **Present.** The React dashboard reads the exported files and recalculates live from the cube when filters change.

---

## Data

The dataset was supplied by the TECHVERSE organisers and is not included in this repository. It appears to be an extract of the City of Chicago "Crimes - 2001 to Present" data. The file is a partial slice of the full table, so trend analysis is restricted to the two periods that are densely populated (April 2015 to July 2017, and October 2025 to August 2026).

---

## Copyright

Copyright (c) 2026 Team Moleculens. All rights reserved.

No part of this project may be copied, modified, distributed or used without prior written permission from the authors.
