"""Offline step: compute each territory's population-weighted center of mass.

Reads the GHS-POP 2025 30 arc-second (~1 km) global population grid
(downloading it on first run, ~480 MB) and writes `data/answers.json`.

    python compute_com.py

Each grid cell's population is treated as a point mass on the sphere at the
cell center. The CoM is the weighted mean of those 3D unit vectors, projected
back onto the surface. The territory's area (used for scoring) is the summed
area of the cells inside it.

It also writes `data/density/<id>.json`: a coarse population-density grid the
frontend draws as a heat map after a guess.
"""

import base64
import json
import math
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.windows import from_bounds

from territories import TERRITORIES, get_shape

DATA_DIR = Path(__file__).parent / "data"
RAW_DIR = DATA_DIR / "raw"
RASTER_NAME = "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0"
RASTER_PATH = RAW_DIR / f"{RASTER_NAME}.tif"
RASTER_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/"
    f"GHS_POP_E2025_GLOBE_R2023A_4326_30ss/V1-0/{RASTER_NAME}.zip"
)
EARTH_RADIUS_KM = 6371.0
DENSITY_MAX_CELLS = 256  # grid cells along the longer side of the heat map


def ensure_raster() -> None:
    if RASTER_PATH.exists():
        return
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    zip_path = RAW_DIR / f"{RASTER_NAME}.zip"
    if not zip_path.exists():
        print(f"Downloading {RASTER_URL} (~480 MB)...")
        urllib.request.urlretrieve(RASTER_URL, zip_path)
    print("Unzipping...")
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(RAW_DIR)


def bounds(shape: dict) -> tuple[float, float, float, float]:
    g = shape["geometry"]
    polygons = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    points = np.array([p for poly in polygons for ring in poly for p in ring])
    west, south = points.min(axis=0)
    east, north = points.max(axis=0)
    return west, south, east, north


def density_grid(pop: np.ndarray, area: np.ndarray, transform) -> dict:
    """Downsample people and inside-area per cell into blocks, then encode
    log-scaled people/km² as one byte per block: 0 = outside or empty,
    1–255 = low to high. The color range is stretched between the territory's
    5th and 99.5th percentile so both sparse and crowded places show contrast."""
    rows, cols = pop.shape
    f = max(1, math.ceil(max(rows, cols) / DENSITY_MAX_CELLS))
    out_rows, out_cols = math.ceil(rows / f), math.ceil(cols / f)

    def blocks(a: np.ndarray) -> np.ndarray:
        a = np.pad(a, ((0, out_rows * f - rows), (0, out_cols * f - cols)))
        return a.reshape(out_rows, f, out_cols, f).sum(axis=(1, 3))

    people, km2 = blocks(pop), blocks(area)
    density = np.divide(people, km2, out=np.zeros_like(people), where=km2 > 0)
    level = np.log1p(density)
    low, high = np.percentile(level[level > 0], [5, 99.5]) if np.any(level > 0) else (0.0, 1.0)
    scaled = np.clip((level - low) / max(high - low, 1e-9), 0, 1)
    values = np.where(level > 0, 1 + np.round(254 * scaled), 0).astype(np.uint8)

    return {
        "west": transform.c,
        "north": transform.f,
        "east": transform.c + out_cols * f * transform.a,
        "south": transform.f + out_rows * f * transform.e,
        "width": out_cols,
        "height": out_rows,
        "values": base64.b64encode(values.tobytes()).decode(),
    }


def center_of_mass(src: rasterio.DatasetReader, shape: dict) -> tuple[dict, dict]:
    window = from_bounds(*bounds(shape), transform=src.transform).round_offsets().round_lengths()
    pop = src.read(1, window=window, masked=True).filled(0).astype(np.float64)
    transform = src.window_transform(window)

    # True for cells whose center is inside the territory.
    inside = ~geometry_mask([shape["geometry"]], out_shape=pop.shape, transform=transform)
    pop = np.where(inside & (pop > 0), pop, 0.0)

    rows, cols = pop.shape
    res_lon, res_lat = transform.a, transform.e  # res_lat is negative (north-up)
    lons = np.radians(transform.c + (np.arange(cols) + 0.5) * res_lon)
    lats = np.radians(transform.f + (np.arange(rows) + 0.5) * res_lat)

    # Sum population * unit vector without building full lat/lon grids.
    row_cos_lon = pop @ np.cos(lons)
    row_sin_lon = pop @ np.sin(lons)
    x = np.sum(np.cos(lats) * row_cos_lon)
    y = np.sum(np.cos(lats) * row_sin_lon)
    z = np.sum(np.sin(lats) * pop.sum(axis=1))

    # Each cell's area on the sphere: R^2 * dLon * (sin(lat_top) - sin(lat_bottom)).
    lat_top = np.radians(transform.f + np.arange(rows) * res_lat)
    cell_area = EARTH_RADIUS_KM**2 * np.radians(res_lon) * (np.sin(lat_top) - np.sin(lat_top + np.radians(res_lat)))
    area_km2 = float(np.sum(cell_area * inside.sum(axis=1)))

    answer = {
        "lat": round(float(np.degrees(np.arctan2(z, np.hypot(x, y)))), 4),
        "lon": round(float(np.degrees(np.arctan2(y, x))), 4),
        "population": int(round(pop.sum())),
        "area_km2": round(area_km2),
    }
    return answer, density_grid(pop, inside * cell_area[:, None], transform)


def main() -> None:
    ensure_raster()
    answers = {}
    density_dir = DATA_DIR / "density"
    density_dir.mkdir(exist_ok=True)
    with rasterio.open(RASTER_PATH) as src:
        for t in TERRITORIES:
            a, density = center_of_mass(src, get_shape(t.id))
            answers[t.id] = a
            (density_dir / f"{t.id}.json").write_text(json.dumps(density) + "\n")
            print(f"{t.name:<12} {a['lat']:8.3f}, {a['lon']:9.3f}  pop {a['population']:>13,}  area {a['area_km2']:>9,} km²")

    out = DATA_DIR / "answers.json"
    out.write_text(
        json.dumps(
            {"source": "GHS-POP E2025 R2023A, 30 arc-second (JRC, CC BY 4.0)", "answers": answers},
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {out.relative_to(Path(__file__).parent)}")


if __name__ == "__main__":
    main()
