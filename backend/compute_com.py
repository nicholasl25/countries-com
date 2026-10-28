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
from affine import Affine
from rasterio.features import geometry_mask
from rasterio.windows import Window

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


def _points(geometry: dict) -> np.ndarray:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return np.array([p for poly in polygons for ring in poly for p in ring])


def bounds(geometry: dict) -> tuple[float, float, float, float]:
    points = _points(geometry)
    west, south = points.min(axis=0)
    east, north = points.max(axis=0)
    return west, south, east, north


def shift_east(geometry: dict) -> dict:
    """Move western-hemisphere longitudes to 180–360 so a territory that crosses
    the antimeridian (Alaska, Russia, Fiji...) is one contiguous range."""

    def shift(coords):
        if isinstance(coords[0], (int, float)):
            return [coords[0] + 360 if coords[0] < 0 else coords[0], coords[1]]
        return [shift(c) for c in coords]

    return {"type": geometry["type"], "coordinates": shift(geometry["coordinates"])}


def read_window(src: rasterio.DatasetReader, west: float, south: float, east: float, north: float):
    """Read the population grid for a lon/lat box. `east` may exceed 180, in
    which case the read wraps around to the start of the raster."""
    col0, row0 = ~src.transform * (west, north)
    col1, row1 = ~src.transform * (east, south)
    col0, col1 = math.floor(col0), math.ceil(col1)
    row0, row1 = max(0, math.floor(row0)), min(src.height, math.ceil(row1))

    parts = []
    col = col0
    while col < col1:
        start = col % src.width
        width = min(col1 - col, src.width - start)
        window = Window(start, row0, width, row1 - row0)
        parts.append(src.read(1, window=window, masked=True).filled(0))
        col += width
    pop = np.hstack(parts).astype(np.float64)
    return pop, src.transform * Affine.translation(col0, row0)


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


def center_of_mass(src: rasterio.DatasetReader, shape: dict) -> tuple[dict, dict] | None:
    """Returns (answer, density grid), or None if nobody lives there."""
    geometry = shape["geometry"]
    west, south, east, north = bounds(geometry)
    if east - west > 180:
        geometry = shift_east(geometry)
        west, south, east, north = bounds(geometry)
    pop, transform = read_window(src, west, south, east, north)

    # True for cells whose center is inside the territory. Territories smaller
    # than a cell may contain no cell centers; count any cell they touch.
    inside = ~geometry_mask([geometry], out_shape=pop.shape, transform=transform)
    if not inside.any():
        inside = ~geometry_mask([geometry], out_shape=pop.shape, transform=transform, all_touched=True)
    pop = np.where(inside & (pop > 0), pop, 0.0)
    if pop.sum() == 0:
        return None

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
    skipped = []
    density_dir = DATA_DIR / "density"
    density_dir.mkdir(exist_ok=True)
    for old in density_dir.glob("*.json"):
        old.unlink()
    with rasterio.open(RASTER_PATH) as src:
        for t in TERRITORIES:
            computed = center_of_mass(src, get_shape(t.id))
            if computed is None:
                skipped.append(t.name)
                continue
            a, density = computed
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
    print(f"Wrote {out.relative_to(Path(__file__).parent)}: {len(answers)} territories")
    if skipped:
        print(f"Skipped (no population): {', '.join(skipped)}")


if __name__ == "__main__":
    main()
