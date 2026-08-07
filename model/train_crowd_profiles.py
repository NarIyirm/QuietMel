"""Train QuietMel hourly crowd profiles from Melbourne pedestrian counts."""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
from zoneinfo import ZoneInfo


MODEL_VERSION = "hourly-gradient-v1"
TIMEZONE = "Australia/Melbourne"
SOURCE_DATASET = "pedestrian-counting-system-monthly-counts-per-hour"
SOURCE_URL = (
    "https://data.melbourne.vic.gov.au/explore/dataset/"
    "pedestrian-counting-system-monthly-counts-per-hour/"
)
EXPORT_BASE_URL = (
    "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/"
    f"{SOURCE_DATASET}/exports"
)
REQUIRED_COLUMNS = ["location_id", "sensing_date", "hourday", "pedestriancount"]
OPTIONAL_COLUMNS = ["sensor_name", "location"]
KEY_COLUMNS = ["location_id", "day_of_week", "season", "hour_of_day"]
PROFILE_COLUMNS = [
    "location_id",
    "day_of_week",
    "season",
    "hour_of_day",
    "baseline_ppm",
    "trimmed_mean_ppm",
    "p25_ppm",
    "p75_ppm",
    "gradient_ppm_per_hour",
    "sample_count",
    "quality_flag",
    "source_start_date",
    "source_end_date",
    "model_version",
]
VALIDATION_COLUMNS = [
    "location_id",
    "mae_ppm",
    "wape_percent",
    "test_sample_count",
    "quality_flag",
]
NUMERIC_PROFILE_COLUMNS = [
    "baseline_ppm",
    "trimmed_mean_ppm",
    "p25_ppm",
    "p75_ppm",
    "gradient_ppm_per_hour",
]
SEASONS = ("summer", "autumn", "winter", "spring")
QUALITY_FLAGS = ("ok", "low_sample", "fallback")


@dataclass(frozen=True)
class TrainWindow:
    """Inclusive source-data date range used in outputs and validation."""

    start_date: pd.Timestamp
    end_date: pd.Timestamp

    @classmethod
    def from_values(cls, start_date: str | pd.Timestamp, end_date: str | pd.Timestamp) -> "TrainWindow":
        start = pd.Timestamp(start_date).normalize()
        end = pd.Timestamp(end_date).normalize()
        if start > end:
            raise ValueError(f"Invalid training window: {start.date()} > {end.date()}")
        return cls(start, end)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train QuietMel hourly crowd profiles from official pedestrian counts."
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Optional local CSV or Parquet input. If omitted, the official current export is downloaded.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "data",
        help="Directory used for cached official downloads.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "output",
        help="Directory for generated model files.",
    )
    parser.add_argument("--start-date", help="Optional inclusive YYYY-MM-DD source filter.")
    parser.add_argument("--end-date", help="Optional inclusive YYYY-MM-DD source filter.")
    parser.add_argument(
        "--generated-at",
        help=(
            "Optional ISO timestamp for metadata. Defaults to a deterministic "
            "midday timestamp on the run date in Australia/Melbourne."
        ),
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Download the official source again even when the cached file exists.",
    )
    return parser.parse_args()


def main() -> int:
    """Run the full reproducible training pipeline."""

    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    requested_window = parse_requested_window(args.start_date, args.end_date)

    # The official dataset is rolling. When no explicit window is requested, the
    # actual source dates are determined after cleaning rather than assumed.
    input_path = args.input or download_official_data(
        args.data_dir, requested_window, force=args.force_download
    )
    raw = read_input(input_path)
    clean, metadata_counts, actual_window = clean_input(raw, requested_window)

    profiles = build_profiles(clean, actual_window)
    validation = build_validation_metrics(clean)
    metadata = build_metadata(
        clean, profiles, metadata_counts, actual_window, args.generated_at, requested_window
    )

    write_outputs(args.output_dir, profiles, metadata, validation)
    run_contract_checks(args.output_dir, actual_window)
    print(f"Wrote {len(profiles):,} profiles for {metadata['sensor_count']:,} sensors.")
    print(f"Source dates: {metadata['source_start_date']} to {metadata['source_end_date']}")
    print(f"Outputs: {args.output_dir}")
    return 0


def parse_requested_window(start_date: str | None, end_date: str | None) -> TrainWindow | None:
    """Return an optional user-requested date filter."""

    if not start_date and not end_date:
        return None
    if not start_date or not end_date:
        raise ValueError("--start-date and --end-date must be provided together.")
    return TrainWindow.from_values(start_date, end_date)


def download_official_data(
    data_dir: Path, requested_window: TrainWindow | None, force: bool = False
) -> Path:
    """Download the official export, optionally restricted to a date window."""

    data_dir.mkdir(parents=True, exist_ok=True)
    export_format = "parquet" if parquet_available() else "csv"
    suffix = ".parquet" if export_format == "parquet" else ".csv"
    if requested_window:
        name = (
            f"{SOURCE_DATASET}_{requested_window.start_date.date().isoformat()}_"
            f"{requested_window.end_date.date().isoformat()}{suffix}"
        )
    else:
        name = f"{SOURCE_DATASET}_current_available{suffix}"
    output_path = data_dir / name
    if output_path.exists() and not force:
        return output_path

    # No `where` parameter means "use the source's current rolling coverage".
    params = {"timezone": TIMEZONE, "use_labels": "false"}
    if requested_window:
        params["where"] = (
            f"sensing_date >= date'{requested_window.start_date.date().isoformat()}' "
            f"AND sensing_date <= date'{requested_window.end_date.date().isoformat()}'"
        )
    if export_format == "csv":
        params["delimiter"] = ","
    url = f"{EXPORT_BASE_URL}/{export_format}?" + urlencode(params)
    request = Request(url, headers={"User-Agent": "QuietMel model trainer"})
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with urlopen(request, timeout=180) as response, tmp_path.open("wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
    tmp_path.replace(output_path)
    return output_path


def parquet_available() -> bool:
    """Use Parquet only when the local environment already supports it."""

    try:
        import pyarrow  # noqa: F401
    except ImportError:
        return False
    return True


def read_input(path: Path) -> pd.DataFrame:
    """Read a local CSV or Parquet file and keep only model-relevant columns."""

    if not path.exists():
        raise FileNotFoundError(path)
    suffix = path.suffix.lower()
    if suffix in {".parquet", ".pq"}:
        data = pd.read_parquet(path)
    elif suffix == ".csv":
        data = pd.read_csv(path, dtype={"location_id": "string"}, encoding="utf-8-sig")
    else:
        raise ValueError(f"Unsupported input format: {path.suffix}")
    data.columns = [str(column).strip().lower() for column in data.columns]
    missing = sorted(set(REQUIRED_COLUMNS) - set(data.columns))
    if missing:
        raise ValueError(f"Input is missing required columns: {missing}")
    keep_columns = [column for column in REQUIRED_COLUMNS + OPTIONAL_COLUMNS if column in data.columns]
    return data[keep_columns].copy()


def clean_input(
    raw: pd.DataFrame, requested_window: TrainWindow | None
) -> tuple[pd.DataFrame, dict[str, int], TrainWindow]:
    """Normalize source rows and return clean hourly observations plus audit counts."""

    input_row_count = int(len(raw))
    data = raw.copy()
    data["location_id"] = data["location_id"].astype("string").str.strip()
    data["sensing_date"] = pd.to_datetime(data["sensing_date"], errors="coerce").dt.tz_localize(None)
    date_parse_drop = int(data["sensing_date"].isna().sum())
    data = data[data["sensing_date"].notna()].copy()

    data["hourday"] = pd.to_numeric(data["hourday"], errors="coerce")
    hour_drop = int((data["hourday"].isna() | ~data["hourday"].between(0, 23)).sum())
    data = data[data["hourday"].notna() & data["hourday"].between(0, 23)].copy()
    data["hourday"] = data["hourday"].astype("int64")

    data["pedestriancount"] = pd.to_numeric(data["pedestriancount"], errors="coerce")
    count_drop = int((data["pedestriancount"].isna() | (data["pedestriancount"] < 0)).sum())
    data = data[data["pedestriancount"].notna() & (data["pedestriancount"] >= 0)].copy()

    data = data[data["location_id"].notna() & (data["location_id"] != "")].copy()
    if requested_window:
        window_mask = data["sensing_date"].between(
            requested_window.start_date, requested_window.end_date, inclusive="both"
        )
        range_drop = int((~window_mask).sum())
        data = data[window_mask].copy()
    else:
        range_drop = 0

    # Duplicates are audited before aggregation. The v1 contract says duplicate
    # hourly counts should be summed, but the extra counters make accidental
    # repeated imports visible in metadata.
    duplicate_key = ["location_id", "sensing_date", "hourday"]
    complete_duplicate_row_count = int(data.duplicated().sum())
    duplicate_group_count = int(data.groupby(duplicate_key).size().gt(1).sum())
    conflicting_duplicate_group_count = int(
        data.groupby(duplicate_key)["pedestriancount"].nunique().gt(1).sum()
    )
    grouped = (
        data.groupby(duplicate_key, as_index=False, observed=False)
        .agg(pedestriancount=("pedestriancount", "sum"))
    )
    if grouped.empty:
        raise ValueError("No clean rows remain after filtering.")

    grouped["day_of_week"] = grouped["sensing_date"].dt.dayofweek.add(1).mod(7).astype("int64")
    grouped["season"] = grouped["sensing_date"].dt.month.map(month_to_season)
    grouped["hour_of_day"] = grouped["hourday"].astype("int64")
    # The model unit is persons per minute, not the raw hourly count.
    grouped["observed_ppm"] = grouped["pedestriancount"].astype("float64") / 60.0
    grouped["is_weekend"] = grouped["day_of_week"].isin([0, 6])

    clean_row_count = int(len(grouped))
    dropped_row_count = int(input_row_count - clean_row_count)
    counts = {
        "input_row_count": input_row_count,
        "clean_row_count": clean_row_count,
        "dropped_row_count": dropped_row_count,
        "dropped_parse_date_count": date_parse_drop,
        "dropped_invalid_hour_count": hour_drop,
        "dropped_invalid_count_count": count_drop,
        "dropped_out_of_range_count": range_drop,
        "duplicate_group_count": duplicate_group_count,
        "complete_duplicate_row_count": complete_duplicate_row_count,
        "conflicting_duplicate_group_count": conflicting_duplicate_group_count,
    }
    actual_window = TrainWindow.from_values(
        grouped["sensing_date"].min(), grouped["sensing_date"].max()
    )
    return grouped, counts, actual_window


def month_to_season(month: int) -> str:
    """Map a calendar month to Australian meteorological season."""

    if month in (12, 1, 2):
        return "summer"
    if month in (3, 4, 5):
        return "autumn"
    if month in (6, 7, 8):
        return "winter"
    return "spring"


def stats_for(values: pd.Series | np.ndarray) -> dict[str, float | int]:
    """Calculate robust summary statistics for one profile group."""

    array = np.asarray(values, dtype="float64")
    array = array[np.isfinite(array)]
    if len(array) == 0:
        return {
            "baseline_ppm": 0.0,
            "trimmed_mean_ppm": 0.0,
            "p25_ppm": 0.0,
            "p75_ppm": 0.0,
            "sample_count": 0,
        }
    sorted_values = np.sort(array)
    trim = math.floor(len(sorted_values) * 0.10)
    trimmed = sorted_values[trim : len(sorted_values) - trim] if trim else sorted_values
    if len(trimmed) == 0:
        trimmed = sorted_values
    return {
        "baseline_ppm": float(np.median(array)),
        "trimmed_mean_ppm": float(np.mean(trimmed)),
        "p25_ppm": float(np.percentile(array, 25)),
        "p75_ppm": float(np.percentile(array, 75)),
        "sample_count": int(len(array)),
    }


def aggregate_stats(data: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Aggregate observed ppm values by the supplied grouping keys."""

    rows = []
    for key_values, group in data.groupby(keys, dropna=False, observed=False):
        if not isinstance(key_values, tuple):
            key_values = (key_values,)
        row = dict(zip(keys, key_values))
        row.update(stats_for(group["observed_ppm"]))
        rows.append(row)
    return pd.DataFrame(rows)


def build_profiles(clean: pd.DataFrame, window: TrainWindow) -> pd.DataFrame:
    """Build the fixed-contract profile table for every sensor/time key."""

    if clean.empty:
        raise ValueError("No clean rows remain after filtering.")

    sensors = sorted(clean["location_id"].dropna().unique(), key=lambda value: str(value))
    # Build the full keyspace so backend lookups never miss a sensor/day/season/hour
    # row just because that exact combination had too few or no observations.
    grid = pd.MultiIndex.from_product(
        [sensors, range(7), SEASONS, range(24)], names=KEY_COLUMNS
    ).to_frame(index=False)

    full_stats = aggregate_stats(clean, KEY_COLUMNS)
    profiles = grid.merge(full_stats, how="left", on=KEY_COLUMNS)
    stat_columns = ["baseline_ppm", "trimmed_mean_ppm", "p25_ppm", "p75_ppm", "sample_count"]
    profiles[stat_columns] = profiles[stat_columns].fillna(0)
    profiles["sample_count"] = profiles["sample_count"].astype("int64")
    # `sample_count` stays as the direct group sample count for transparency.
    # `effective_sample_count` is internal and tracks fallback support.
    profiles["effective_sample_count"] = profiles["sample_count"]

    fallback_1 = aggregate_stats(clean, ["location_id", "day_of_week", "hour_of_day"])
    fallback_2 = aggregate_stats(clean, ["location_id", "is_weekend", "hour_of_day"])
    fallback_3 = aggregate_stats(clean, ["location_id", "hour_of_day"])

    needs_fallback = profiles["sample_count"] < 5
    profiles.loc[profiles["sample_count"] >= 10, "quality_flag"] = "ok"
    profiles.loc[profiles["sample_count"].between(5, 9), "quality_flag"] = "low_sample"
    profiles.loc[needs_fallback, "quality_flag"] = "fallback"

    profiles = apply_fallbacks(profiles, fallback_1, fallback_2, fallback_3)
    profiles = add_gradients(profiles, window)
    profiles["source_start_date"] = window.start_date.date().isoformat()
    profiles["source_end_date"] = window.end_date.date().isoformat()
    profiles["model_version"] = MODEL_VERSION

    profiles = profiles[PROFILE_COLUMNS].copy()
    profiles = round_profile_numbers(profiles)
    profiles = profiles.sort_values(KEY_COLUMNS, kind="mergesort").reset_index(drop=True)
    return profiles


def apply_fallbacks(
    profiles: pd.DataFrame,
    fallback_1: pd.DataFrame,
    fallback_2: pd.DataFrame,
    fallback_3: pd.DataFrame,
) -> pd.DataFrame:
    """Fill weak groups with progressively broader sensor-specific statistics."""

    output = profiles.copy()
    output["is_weekend"] = output["day_of_week"].isin([0, 6])
    stat_cols = ["baseline_ppm", "trimmed_mean_ppm", "p25_ppm", "p75_ppm"]
    fallback_lookups = [
        make_fallback_lookup(fallback_1, ["location_id", "day_of_week", "hour_of_day"], stat_cols),
        make_fallback_lookup(fallback_2, ["location_id", "is_weekend", "hour_of_day"], stat_cols),
        make_fallback_lookup(fallback_3, ["location_id", "hour_of_day"], stat_cols),
    ]
    fallback_keys = [
        ["location_id", "day_of_week", "hour_of_day"],
        ["location_id", "is_weekend", "hour_of_day"],
        ["location_id", "hour_of_day"],
    ]
    for index, row in output[output["sample_count"] < 5].iterrows():
        candidates = []
        for lookup, keys in zip(fallback_lookups, fallback_keys):
            key = tuple(row[key] for key in keys)
            candidate = lookup.get(key)
            if candidate and candidate["sample_count"] > 0:
                candidates.append(candidate)
        # Prefer the first fallback level with at least 5 samples. If all
        # fallbacks are weak, use the available level with the most support.
        chosen = next((candidate for candidate in candidates if candidate["sample_count"] >= 5), None)
        if chosen is None and candidates:
            chosen = max(candidates, key=lambda candidate: candidate["sample_count"])
        if chosen:
            for col in stat_cols:
                output.at[index, col] = chosen[col]
            output.at[index, "effective_sample_count"] = int(chosen["sample_count"])
    return output.drop(columns=["is_weekend"])


def make_fallback_lookup(
    fallback: pd.DataFrame,
    keys: list[str],
    stat_cols: list[str],
) -> dict[tuple, dict[str, float | int]]:
    """Convert fallback aggregate frames to dictionaries for row-wise lookup."""

    lookup = {}
    if fallback.empty:
        return lookup
    for row in fallback[keys + stat_cols + ["sample_count"]].itertuples(index=False):
        values = row._asdict()
        key = tuple(values[column] for column in keys)
        lookup[key] = {column: values[column] for column in stat_cols}
        lookup[key]["sample_count"] = int(values["sample_count"])
    return lookup


def add_gradients(profiles: pd.DataFrame, window: TrainWindow) -> pd.DataFrame:
    """Add next-hour profile gradients without over-weighting season boundaries."""

    output = profiles.copy()
    lookup = output.set_index(KEY_COLUMNS)[
        ["baseline_ppm", "effective_sample_count"]
    ].to_dict("index")
    gradient_values = []
    for row in output.itertuples(index=False):
        current_baseline = float(row.baseline_ppm)
        current_effective_count = int(row.effective_sample_count)
        # Profiles represent typical seasonal behavior. Hour 23 rolls to the
        # next weekday but keeps the same season, instead of using rare calendar
        # season-boundary days as equal-weight next-hour candidates.
        if int(row.hour_of_day) == 23:
            next_key = (
                row.location_id,
                (int(row.day_of_week) + 1) % 7,
                row.season,
                0,
            )
        else:
            next_key = (
                row.location_id,
                int(row.day_of_week),
                row.season,
                int(row.hour_of_day) + 1,
            )
        next_profile = lookup.get(next_key)
        if (
            current_effective_count <= 0
            or not next_profile
            or int(next_profile["effective_sample_count"]) <= 0
        ):
            # A zero produced by "no data anywhere" is not treated as a real
            # next-hour baseline; keep the trend flat in that case.
            gradient = 0.0
        else:
            gradient = float(next_profile["baseline_ppm"] - current_baseline)
        gradient_values.append(gradient)
    output["gradient_ppm_per_hour"] = gradient_values
    return output


def round_profile_numbers(profiles: pd.DataFrame) -> pd.DataFrame:
    """Round output numeric fields to the required four-decimal precision."""

    output = profiles.copy()
    for col in NUMERIC_PROFILE_COLUMNS:
        output[col] = output[col].astype("float64").round(4)
        if col != "gradient_ppm_per_hour":
            output[col] = output[col].clip(lower=0)
    return output


def build_validation_metrics(clean: pd.DataFrame) -> pd.DataFrame:
    """Hold out the latest 28 days and report per-sensor forecast error."""

    if clean.empty:
        return pd.DataFrame(columns=VALIDATION_COLUMNS)
    max_date = clean["sensing_date"].max()
    test_start = max_date - pd.Timedelta(days=27)
    # The split is temporal: validation profiles are rebuilt from data strictly
    # before the latest 28-day test window to avoid leakage.
    train = clean[clean["sensing_date"] < test_start].copy()
    test = clean[clean["sensing_date"] >= test_start].copy()
    if train.empty or test.empty:
        return pd.DataFrame(columns=VALIDATION_COLUMNS)

    train_window = TrainWindow.from_values(
        train["sensing_date"].min(), train["sensing_date"].max()
    )
    train_profiles = build_profiles_for_validation(train, train_window)
    prediction_map = train_profiles.set_index(KEY_COLUMNS)["baseline_ppm"].to_dict()
    quality_map = train_profiles.set_index(KEY_COLUMNS)["quality_flag"].to_dict()
    test["predicted_ppm"] = [
        float(
            prediction_map.get(
                (row.location_id, int(row.day_of_week), row.season, int(row.hour_of_day)),
                0.0,
            )
        )
        for row in test.itertuples(index=False)
    ]
    test["prediction_quality_flag"] = [
        quality_map.get(
            (row.location_id, int(row.day_of_week), row.season, int(row.hour_of_day)),
            "fallback",
        )
        for row in test.itertuples(index=False)
    ]
    test["absolute_error"] = (test["observed_ppm"] - test["predicted_ppm"]).abs()
    rows = []
    for location_id, group in test.groupby("location_id", observed=False):
        denominator = float(group["observed_ppm"].sum())
        wape = "" if denominator == 0 else float(group["absolute_error"].sum() / denominator * 100.0)
        test_sample_count = int(len(group))
        fallback_percent = float((group["prediction_quality_flag"] == "fallback").mean())
        low_sample_percent = float((group["prediction_quality_flag"] == "low_sample").mean())
        # Validation quality reflects the profiles used for prediction, not
        # just how many test rows the sensor happened to have.
        if test_sample_count < 5 or fallback_percent >= 0.25:
            quality_flag = "fallback"
        elif test_sample_count < 10 or fallback_percent > 0 or low_sample_percent >= 0.25:
            quality_flag = "low_sample"
        else:
            quality_flag = "ok"
        rows.append(
            {
                "location_id": location_id,
                "mae_ppm": round(float(group["absolute_error"].mean()), 4),
                "wape_percent": "" if wape == "" else round(float(wape), 4),
                "test_sample_count": test_sample_count,
                "quality_flag": quality_flag,
            }
        )
    return pd.DataFrame(rows, columns=VALIDATION_COLUMNS).sort_values("location_id").reset_index(drop=True)


def build_profiles_for_validation(clean: pd.DataFrame, window: TrainWindow) -> pd.DataFrame:
    """Build the minimal profile fields needed for validation lookup."""

    profiles = build_profiles(clean, window)
    return profiles[KEY_COLUMNS + ["baseline_ppm", "quality_flag"]].copy()


def build_metadata(
    clean: pd.DataFrame,
    profiles: pd.DataFrame,
    counts: dict[str, int],
    window: TrainWindow,
    generated_at: str | None,
    requested_window: TrainWindow | None,
) -> dict:
    """Build the audit JSON that accompanies the profile CSV."""

    generated = generated_at or default_generated_at()
    quality_counts = {
        flag: int((profiles["quality_flag"] == flag).sum()) for flag in QUALITY_FLAGS
    }
    metadata = {
        "model_version": MODEL_VERSION,
        "generated_at": generated,
        "timezone": TIMEZONE,
        "source_dataset": SOURCE_DATASET,
        "source_url": SOURCE_URL,
        "source_start_date": window.start_date.date().isoformat(),
        "source_end_date": window.end_date.date().isoformat(),
        "input_row_count": counts["input_row_count"],
        "clean_row_count": counts["clean_row_count"],
        "dropped_row_count": counts["dropped_row_count"],
        "duplicate_group_count": counts["duplicate_group_count"],
        "complete_duplicate_row_count": counts["complete_duplicate_row_count"],
        "conflicting_duplicate_group_count": counts["conflicting_duplicate_group_count"],
        "sensor_count": int(clean["location_id"].nunique()),
        "profile_row_count": int(len(profiles)),
        "quality_counts": quality_counts,
        "unit": "persons_per_minute",
        "day_of_week_convention": "0=Sunday,...,6=Saturday",
        "season_convention": "Australian meteorological seasons",
        "gradient_method": "next_hour_baseline_minus_current_hour_baseline",
        "dropped_parse_date_count": counts["dropped_parse_date_count"],
        "dropped_invalid_hour_count": counts["dropped_invalid_hour_count"],
        "dropped_invalid_count_count": counts["dropped_invalid_count_count"],
        "dropped_out_of_range_count": counts["dropped_out_of_range_count"],
        "training_window_mode": "current_available_data"
        if requested_window is None
        else "requested_date_filter",
        "requested_start_date": None
        if requested_window is None
        else requested_window.start_date.date().isoformat(),
        "requested_end_date": None
        if requested_window is None
        else requested_window.end_date.date().isoformat(),
    }
    return metadata


def default_generated_at() -> str:
    """Return a stable per-day timestamp so repeated runs are byte-reproducible."""

    now = datetime.now(ZoneInfo(TIMEZONE))
    stable = now.replace(hour=12, minute=0, second=0, microsecond=0)
    return stable.isoformat()


def write_outputs(
    output_dir: Path,
    profiles: pd.DataFrame,
    metadata: dict,
    validation: pd.DataFrame,
) -> None:
    """Write all required deliverable files."""

    profiles.to_csv(
        output_dir / "crowd_hourly_profiles.csv",
        index=False,
        encoding="utf-8",
        float_format="%.4f",
    )
    (output_dir / "model_metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    validation.to_csv(
        output_dir / "validation_metrics.csv",
        index=False,
        encoding="utf-8",
        float_format="%.4f",
    )


def run_contract_checks(output_dir: Path, window: TrainWindow) -> None:
    """Validate the fixed output contract before delivery."""

    profiles_path = output_dir / "crowd_hourly_profiles.csv"
    metadata_path = output_dir / "model_metadata.json"
    validation_path = output_dir / "validation_metrics.csv"
    for path in [profiles_path, metadata_path, validation_path]:
        if not path.exists():
            raise AssertionError(f"Missing output file: {path}")

    profiles = pd.read_csv(profiles_path, dtype={"location_id": "string"})
    if list(profiles.columns) != PROFILE_COLUMNS:
        raise AssertionError("crowd_hourly_profiles.csv column order mismatch")
    if profiles[KEY_COLUMNS + ["model_version"]].duplicated().sum() != 0:
        raise AssertionError("Duplicate profile keys found")
    if not profiles["day_of_week"].between(0, 6).all():
        raise AssertionError("day_of_week out of range")
    if not profiles["hour_of_day"].between(0, 23).all():
        raise AssertionError("hour_of_day out of range")
    if not set(profiles["season"]) <= set(SEASONS):
        raise AssertionError("Invalid season value")
    if not set(profiles["quality_flag"]) <= set(QUALITY_FLAGS):
        raise AssertionError("Invalid quality_flag value")
    if not np.isfinite(profiles[NUMERIC_PROFILE_COLUMNS].to_numpy()).all():
        raise AssertionError("Non-finite profile numeric value")
    non_gradient = [col for col in NUMERIC_PROFILE_COLUMNS if col != "gradient_ppm_per_hour"]
    if (profiles[non_gradient] < 0).any().any():
        raise AssertionError("Negative non-gradient profile value")
    if profiles["source_start_date"].nunique() != 1 or profiles["source_start_date"].iloc[0] != window.start_date.date().isoformat():
        raise AssertionError("Invalid source_start_date")
    if profiles["source_end_date"].nunique() != 1 or profiles["source_end_date"].iloc[0] != window.end_date.date().isoformat():
        raise AssertionError("Invalid source_end_date")
    if set(profiles["model_version"]) != {MODEL_VERSION}:
        raise AssertionError("Invalid model_version")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata["profile_row_count"] != len(profiles):
        raise AssertionError("metadata profile_row_count mismatch")
    if metadata["quality_counts"] != {
        flag: int((profiles["quality_flag"] == flag).sum()) for flag in QUALITY_FLAGS
    }:
        raise AssertionError("metadata quality_counts mismatch")

    validation = pd.read_csv(validation_path, dtype={"location_id": "string"})
    if list(validation.columns) != VALIDATION_COLUMNS:
        raise AssertionError("validation_metrics.csv column order mismatch")
    if not set(validation["quality_flag"].dropna()) <= set(QUALITY_FLAGS):
        raise AssertionError("Invalid validation quality_flag")


if __name__ == "__main__":
    sys.exit(main())
