"""Offline step: compute each territory's population-weighted center of mass.

Reads the GHS-POP 2025 30 arc-second (~1 km) global population grid
(downloading it on first run, ~480 MB) and writes `data/answers.json`.

    python compute_com.py

Each grid cell's population is treated as a point mass on the sphere at the
cell center. The CoM is the weighted mean of those 3D unit vectors, projected
back onto the surface. σ (which scales scores) treats the population as a 2D
normal distribution around the CoM: it's the distance containing 39.3% of
people, the share within 1σ of a 2D normal. The area is the summed area of the
cells inside the territory.

It also writes `data/density/<id>.json`: coarse population-density grids the
frontend draws as a heat map after a guess. Territories with far-apart parts
(France and its overseas departments, Kiribati...) get one grid per group of
nearby parts, so each keeps full detail when zoomed in.
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
DENSITY_MAX_CELLS = 256  # grid cells along the longer side of each heat map grid
CLUSTER_GAP_DEG = 1.0  # parts closer than this share a heat map grid
SIGMA_SHARE = 1 - math.exp(-1 / 2)  # share of a 2D normal distribution within 1σ
MIN_SIGMA_KM = 0.5  # about half a raster cell


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


def _polygons(geometry: dict) -> list:
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def _points(geometry: dict) -> np.ndarray:
    return np.array([p for poly in _polygons(geometry) for ring in poly for p in ring])


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


def clusters(geometry: dict) -> list[tuple[float, float, float, float]]:
    """Bounding boxes of groups of polygons that lie within CLUSTER_GAP_DEG of
    each other."""
    boxes = [bounds({"type": "Polygon", "coordinates": p}) for p in _polygons(geometry)]

    def near(a, b) -> bool:
        g = CLUSTER_GAP_DEG
        return a[0] - g <= b[2] and b[0] - g <= a[2] and a[1] - g <= b[3] and b[1] - g <= a[3]

    merged = True
    while merged:
        merged = False
        out: list[tuple[float, float, float, float]] = []
        for box in boxes:
            for i, other in enumerate(out):
                if near(box, other):
                    out[i] = (min(box[0], other[0]), min(box[1], other[1]), max(box[2], other[2]), max(box[3], other[3]))
                    merged = True
                    break
            else:
                out.append(box)
        boxes = out
    return boxes


def density_grids(pop: np.ndarray, area: np.ndarray, transform, geometry: dict) -> list[dict]:
    """One grid per cluster of the territory's parts. Each downsamples people
    and inside-area per cell into blocks, then encodes log-scaled people/km² as
    one byte per block: 0 = outside or empty, 1–255 = low to high. The color
    range is stretched between the territory's 5th and 99.5th percentile (over
    all its grids) so both sparse and crowded places show contrast."""
    rows, cols = pop.shape
    grids = []
    for west, south, east, north in clusters(geometry):
        c0, r0 = ~transform * (west, north)
        c1, r1 = ~transform * (east, south)
        c0, r0 = max(0, math.floor(c0)), max(0, math.floor(r0))
        c1, r1 = min(cols, math.ceil(c1)), min(rows, math.ceil(r1))
        p, a = pop[r0:r1, c0:c1], area[r0:r1, c0:c1]
        if p.sum() == 0:
            continue

        f = max(1, math.ceil(max(p.shape) / DENSITY_MAX_CELLS))
        out_rows, out_cols = math.ceil(p.shape[0] / f), math.ceil(p.shape[1] / f)

        def blocks(x: np.ndarray) -> np.ndarray:
            x = np.pad(x, ((0, out_rows * f - x.shape[0]), (0, out_cols * f - x.shape[1])))
            return x.reshape(out_rows, f, out_cols, f).sum(axis=(1, 3))

        people, km2 = blocks(p), blocks(a)
        density = np.divide(people, km2, out=np.zeros_like(people), where=km2 > 0)
        grids.append((np.log1p(density), transform * Affine.translation(c0, r0), f))

    every = np.concatenate([level[level > 0] for level, _, _ in grids])
    low, high = np.percentile(every, [5, 99.5])
    out = []
    for level, t, f in grids:
        scaled = np.clip((level - low) / max(high - low, 1e-9), 0, 1)
        values = np.where(level > 0, 1 + np.round(254 * scaled), 0).astype(np.uint8)
        out_rows, out_cols = level.shape
        out.append(
            {
                "west": t.c,
                "north": t.f,
                "east": t.c + out_cols * f * t.a,
                "south": t.f + out_rows * f * t.e,
                "width": out_cols,
                "height": out_rows,
                "values": base64.b64encode(values.tobytes()).decode(),
            }
        )
    return out


def center_of_mass(src: rasterio.DatasetReader, shape: dict) -> tuple[dict, list[dict]] | None:
    """Returns (answer, density grids), or None if nobody lives there."""
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

    com_lat, com_lon = np.arctan2(z, np.hypot(x, y)), np.arctan2(y, x)

    # σ, assuming people are normally distributed around the CoM: a 2D normal
    # has 39.3% of its mass within 1σ, so σ is the distance containing 39.3%
    # of people. Unlike an RMS distance, a few far-off islands can't inflate it.
    rr, cc = np.nonzero(pop)
    cos_angle = np.sin(lats[rr]) * np.sin(com_lat) + np.cos(lats[rr]) * np.cos(com_lat) * np.cos(lons[cc] - com_lon)
    dist_km = EARTH_RADIUS_KM * np.arccos(np.clip(cos_angle, -1, 1))
    order = np.argsort(dist_km)
    share = np.cumsum(pop[rr, cc][order]) / pop.sum()
    # Every cell's people sit at its center, so σ can't be finer than a cell.
    sigma_km = max(float(dist_km[order][np.searchsorted(share, SIGMA_SHARE)]), MIN_SIGMA_KM)

    answer = {
        "lat": round(float(np.degrees(com_lat)), 4),
        "lon": round(float(np.degrees(com_lon)), 4),
        "population": int(round(pop.sum())),
        "area_km2": round(area_km2),
        "sigma_km": round(sigma_km, 2),
    }
    return answer, density_grids(pop, inside * cell_area[:, None], transform, geometry)


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
            print(
                f"{t.name:<12} {a['lat']:8.3f}, {a['lon']:9.3f}  pop {a['population']:>13,}"
                f"  area {a['area_km2']:>9,} km²  σ {a['sigma_km']:>7,.1f} km"
            )

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
