# QuietMel Crowd Forecast Model Training

This folder builds the `hourly-gradient-v1` crowd profile files from the official City of Melbourne pedestrian counting history.

## Requirements

- Python 3.12.13 was used for this run.
- Install dependencies:

```bash
python -m pip install -r requirements.txt
```

## Run

From this folder:

```bash
python train_crowd_profiles.py --force-download
```

By default, the script downloads the official current available dataset and trains on the actual dates present after cleaning. This matches the current rolling-data behavior of the official source. On 2026-08-07, the official API reported data from 2024-08-07 through 2026-08-06, so this version includes 2026 data.

To train a fixed date range instead:

```bash
python train_crowd_profiles.py --start-date 2024-08-07 --end-date 2026-08-06
```

To use a local CSV or Parquet file:

```bash
python train_crowd_profiles.py --input path/to/pedestrian_counts.csv
```

The script uses the official Parquet export when a Parquet engine is available; otherwise it uses the official CSV export with the same data.

## Source

- Dataset: Pedestrian Counting System - Monthly Counts per Hour
- URL: https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-monthly-counts-per-hour/
- Download date for generated outputs: 2026-08-07
- Input format used in this environment: official CSV export
- Actual training range: 2024-08-07 to 2026-08-06
- Training mode: current available rolling data

The earlier three-complete-year plan is not used in this version because the official online source currently does not expose 2023 records. Metadata and profile dates therefore record the actual cleaned data range, not a planned target window.

## Field Mapping

- `location_id` is read as text and used as the stable sensor key.
- `sensing_date` is parsed as a local Australia/Melbourne date.
- `hourday` becomes `hour_of_day`, with valid values 0 through 23.
- `pedestriancount` is the hourly total and is converted to persons per minute as `pedestriancount / 60`.
- `sensor_name` and `location` are ignored for keys and modelling.

Day of week uses `0=Sunday,...,6=Saturday`. Seasons are Australian meteorological seasons: summer is December-February, autumn is March-May, winter is June-August, and spring is September-November.

## Cleaning

The script removes rows with unparseable dates, invalid hours, null counts, or negative counts. Zero counts are retained. Duplicate `location_id` plus `sensing_date` plus `hourday` records are counted in metadata and aggregated by summing `pedestriancount`; complete duplicate rows and conflicting duplicate groups are also reported separately.

For this generated run:

- Input rows: 1,614,110
- Clean rows: 1,614,110
- Dropped rows: 0
- Duplicate groups: 0
- Complete duplicate rows: 0
- Conflicting duplicate groups: 0
- Source sensors before deployment filtering: 103
- Forecast sensors: 100
- Removed location IDs excluded from forecasting: `28`, `65`, `78`

## Profile Calculation

The base grouping key is:

```text
location_id, day_of_week, season, hour_of_day
```

A complete grid is generated for every sensor, day of week, season, and hour. Each sensor therefore has 672 profile rows, so downstream lookup does not miss a time key just because that exact group had no direct observations.

For each observed group, the script calculates:

- `baseline_ppm`: median observed persons per minute.
- `trimmed_mean_ppm`: mean after removing the bottom and top 10 percent of sorted observations; if trimming empties the group, the plain mean is used.
- `p25_ppm` and `p75_ppm`: pandas/numpy linear-interpolated percentiles.
- `sample_count`: the original complete-group sample count.

Low-sample handling:

- `sample_count >= 10`: `quality_flag=ok`.
- `sample_count` from 5 to 9: `quality_flag=low_sample`.
- `sample_count < 5`: `quality_flag=fallback`, with fallback statistics written into the numeric profile fields while preserving the original `sample_count`.

Fallback order:

1. Same sensor, same day of week, same hour, ignoring season.
2. Same sensor, weekday/weekend, same hour, ignoring specific day and season.
3. Same sensor and same hour, using all available dates.
4. If no samples exist, numeric prediction fields are zero and `quality_flag=fallback`.

When choosing a fallback, the script first uses the earliest fallback level with at least 5 samples. If none has at least 5 samples, it uses the available fallback level with the highest sample count. If no fallback samples exist at all, the row remains zero-valued.

## Gradient

`gradient_ppm_per_hour` is the next-hour baseline minus the current baseline under a typical seasonal profile rule:

- Hours 0 through 22 use the same sensor, same day of week, same season, and `hour + 1`.
- Hour 23 uses the same sensor, next day of week, same season, and hour 0.

This avoids giving rare season-boundary dates disproportionate weight in a seasonal profile. If either the current or next profile has no effective samples after fallback, the gradient is set to 0.

## Validation

Offline validation holds out the most recent 4 weeks in the clean source range. With this run, the test window is 2026-07-10 through 2026-08-06, and earlier clean rows are used to rebuild validation-only profiles. Each test row is predicted from its `location_id`, `day_of_week`, `season`, and `hour_of_day` baseline.

Generated validation summary:

- Validation sensors: 99
- Mean MAE: 1.0402 ppm
- Mean WAPE: 23.4926 percent
- Median WAPE: 17.0181 percent
- Validation quality flags: 85 `ok`, 14 `low_sample`, 0 `fallback`

The validation `quality_flag` is based on the quality of the profiles used for prediction, not only the number of test rows. Sensors with a notable share of low-sample or fallback predictions are marked down.

Highest WAPE sensors in this run:

- Sensor 124: WAPE 187.5512 percent, MAE 0.0751 ppm. The absolute error is small, but the observed volume denominator is very low.
- Sensor 136: WAPE 81.7526 percent, MAE 2.3470 ppm.
- Sensor 161: WAPE 64.0536 percent, MAE 2.3390 ppm.
- Sensor 51: WAPE 62.7837 percent, MAE 0.7774 ppm.
- Sensor 188: WAPE 61.6309 percent, MAE 1.8008 ppm.

No hard v1 accuracy threshold is applied; the validation check is intended to confirm repeatability, no leakage, correct units, and transparent fallback behavior.

## Outputs

The generated files are written to `output/`:

- `crowd_hourly_profiles.csv`: fixed-contract hourly profile table for backend import.
- `model_metadata.json`: training range, source, cleaning counts, profile counts, and conventions.
- `validation_metrics.csv`: per-sensor MAE and WAPE from the offline holdout.

For this run, `crowd_hourly_profiles.csv` contains 67,200 rows for 100 current sensor locations. Quality counts are 64,381 `ok`, 1,327 `low_sample`, and 1,492 `fallback`. Removed location IDs `28`, `65`, and `78` are excluded from both the generated profiles and future training runs.

## Delivery Checks

The script ends by checking:

- all 3 output files exist;
- profile and validation columns match the required order;
- profile keys are unique;
- day, hour, season, and quality flag values are valid;
- numeric profile values are finite;
- all non-gradient numeric profile values are non-negative;
- metadata row counts and quality counts match the generated CSV.

No `.env`, API key, Supabase key, or project secret is required or written by this model training package.
