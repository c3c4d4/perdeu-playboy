from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import httpx

from app.config import settings
from app.constants import ANALYSIS_START_YEAR
from app.etl.extract import checksum_file
from app.etl.sources import default_isp_sources
from app.services import isp_repository, population_repository
from app.services.analytics import latest_period, methodology
from app.services.governor_performance import governor_performance
from app.services.indicator_catalog import INDICATORS
from app.services.territory_repository import ISP_TERRITORIAL_DIVISION_URL
from app.services.territory_repository import territorial_units


TERRITORY_TYPES = ("state", "municipality", "police_area")
IBGE_RJ_MUNICIPALITIES_GEOJSON_URL = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/estados/33"
    "?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio"
)


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
        "municipality_geometries": _municipality_geometries(),
        "sources": _source_metadata(),
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


def _source_metadata() -> list[dict[str, object]]:
    raw_isp_dir = settings.data_dir / "raw" / "isp"
    raw_ibge_dir = settings.data_dir / "raw" / "ibge"
    rows: list[dict[str, object]] = []

    for source in default_isp_sources():
        path = raw_isp_dir / source.file_name
        rows.append(_file_source_row(source.name, source.url, path, source.territory_type))

    territorial_path = raw_isp_dir / "Relacao_RISPxAISPxCISP.csv"
    rows.append(
        _file_source_row(
            "isp_territorial_division",
            ISP_TERRITORIAL_DIVISION_URL,
            territorial_path,
            "territorial_division",
        )
    )

    population_path = raw_ibge_dir / "population_municipalities_rj_latest.json"
    rows.append(
        _file_source_row(
            "ibge_population_municipalities_rj",
            "https://sidra.ibge.gov.br/tabela/6579",
            population_path,
            "population",
        )
    )
    rows.append(
        _file_source_row(
            "ibge_municipality_geometries_rj",
            IBGE_RJ_MUNICIPALITIES_GEOJSON_URL,
            raw_ibge_dir / "rj_municipalities_min.geojson",
            "geometry",
        )
    )
    return rows


def _file_source_row(name: str, url: str, path: Path, category: str) -> dict[str, object]:
    exists = path.exists()
    return {
        "name": name,
        "category": category,
        "url": url,
        "file_name": path.name,
        "checksum_sha256": checksum_file(path) if exists else None,
        "size_bytes": path.stat().st_size if exists else None,
        "available": exists,
    }


def _municipality_geometries() -> dict[str, object]:
    path = _ensure_municipality_geometries_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    code_to_name = _municipality_code_to_name()
    features = []
    for feature in data.get("features", []):
        properties = feature.get("properties") or {}
        ibge_code = str(properties.get("codarea") or "")
        name = code_to_name.get(ibge_code)
        if not name:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": feature.get("geometry"),
                "properties": {
                    "ibge_code": ibge_code,
                    "territory_name": name,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _ensure_municipality_geometries_file() -> Path:
    raw_ibge_dir = settings.data_dir / "raw" / "ibge"
    raw_ibge_dir.mkdir(parents=True, exist_ok=True)
    path = raw_ibge_dir / "rj_municipalities_min.geojson"
    if path.exists() and path.stat().st_size > 0:
        return path
    response = httpx.get(IBGE_RJ_MUNICIPALITIES_GEOJSON_URL, timeout=90)
    response.raise_for_status()
    path.write_bytes(response.content)
    return path


def _municipality_code_to_name() -> dict[str, str]:
    frame = isp_repository.rows("letalidade_violenta", "municipality", start_year=ANALYSIS_START_YEAR)
    if frame.empty or "ibge_code" not in frame.columns:
        return {}
    pairs = frame[["ibge_code", "territory_name"]].drop_duplicates()
    return {
        str(row["ibge_code"]): str(row["territory_name"])
        for row in pairs.to_dict(orient="records")
        if str(row.get("ibge_code") or "").strip()
    }


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
