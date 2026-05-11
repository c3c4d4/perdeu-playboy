from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from app.constants import ANALYSIS_START_YEAR
from app.services import isp_repository, population_repository
from app.services.analytics import latest_period, methodology
from app.services.governor_performance import governor_performance
from app.services.indicator_catalog import INDICATORS
from app.services.territory_repository import territorial_units


TERRITORY_TYPES = ("state", "municipality", "police_area")


def export_static_frontend(output_path: Path) -> None:
    latest = latest_period()
    month_keys = _month_keys(ANALYSIS_START_YEAR, latest.year, latest.month)
    month_index = {key: index for index, key in enumerate(month_keys)}

    snapshot = {
        "generated_at": datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds"),
        "analysis_start_year": ANALYSIS_START_YEAR,
        "latest_period": latest.model_dump(mode="json"),
        "month_keys": month_keys,
        "indicators": [indicator.model_dump(mode="json") for indicator in INDICATORS],
        "territories": {
            territory_type: [
                {"territory_type": territory_type, "name": name}
                for name in isp_repository.territories(territory_type)
            ]
            for territory_type in TERRITORY_TYPES
        },
        "territorial_units": territorial_units("Rio de Janeiro"),
        "population_by_municipality": _population_by_municipality(),
        "methodology": methodology(),
        "governor_performance": governor_performance().model_dump(mode="json"),
        "series": _series(month_keys, month_index),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _month_keys(start_year: int, end_year: int, end_month: int) -> list[str]:
    keys: list[str] = []
    for year in range(start_year, end_year + 1):
        max_month = end_month if year == end_year else 12
        for month in range(1, max_month + 1):
            keys.append(f"{year:04d}-{month:02d}")
    return keys


def _series(month_keys: list[str], month_index: dict[str, int]) -> dict[str, dict[str, dict[str, list[float]]]]:
    result: dict[str, dict[str, dict[str, list[float]]]] = {}

    for indicator in INDICATORS:
        result[indicator.code] = {}
        for territory_type in TERRITORY_TYPES:
            frame = isp_repository.rows(
                indicator.code,
                territory_type,
                start_year=ANALYSIS_START_YEAR,
            )
            result[indicator.code][territory_type] = _series_for_frame(frame, month_keys, month_index)

    return result


def _series_for_frame(
    frame: pd.DataFrame,
    month_keys: list[str],
    month_index: dict[str, int],
) -> dict[str, list[float]]:
    output: dict[str, list[float]] = {}
    if frame.empty:
        return output

    grouped = frame.groupby(["territory_name", "year", "month"], as_index=False)["value"].sum()
    for territory_name, group in grouped.groupby("territory_name", sort=True):
        values = [0.0] * len(month_keys)
        for row in group.to_dict(orient="records"):
            key = f"{int(row['year']):04d}-{int(row['month']):02d}"
            index = month_index.get(key)
            if index is not None:
                values[index] = round(float(row["value"]), 1)
        output[str(territory_name)] = values

    return output


def _population_by_municipality() -> dict[str, float]:
    populations: dict[str, float] = {}
    for name in isp_repository.territories("municipality"):
        value = population_repository.population_for_municipality(municipality_name=name)
        if value is not None:
            populations[name] = float(value)
    return populations


def main() -> None:
    parser = argparse.ArgumentParser(description="Exporta um snapshot estático para o frontend.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[3] / "frontend" / "lib" / "static-data.generated.json",
    )
    args = parser.parse_args()
    export_static_frontend(args.output)
    print(args.output)


if __name__ == "__main__":
    main()
