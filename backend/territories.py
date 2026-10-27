"""Playable territories and their borders.

Borders are TopoJSON files from the `us-atlas` and `world-atlas` npm packages
(Natural Earth / US Census data), copied into `data/borders/`.
"""

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path

BORDERS_DIR = Path(__file__).parent / "data" / "borders"

SOURCES = {
    # source name -> (file, object name inside the TopoJSON)
    "states": ("us-states-10m.json", "states"),
    "countries": ("world-countries-50m.json", "countries"),
}


@dataclass(frozen=True)
class Territory:
    id: str
    name: str
    region: str
    source: str  # key of SOURCES


TERRITORIES = [
    Territory("us-colorado", "Colorado", "United States", "states"),
    Territory("us-texas", "Texas", "United States", "states"),
    Territory("us-california", "California", "United States", "states"),
    Territory("poland", "Poland", "Europe", "countries"),
    Territory("germany", "Germany", "Europe", "countries"),
    Territory("egypt", "Egypt", "Africa", "countries"),
    Territory("brazil", "Brazil", "South America", "countries"),
    Territory("india", "India", "Asia", "countries"),
]

TERRITORIES_BY_ID = {t.id: t for t in TERRITORIES}


@cache
def _load_topology(source: str) -> dict:
    filename, _ = SOURCES[source]
    return json.loads((BORDERS_DIR / filename).read_text())


def _decode_arc(topology: dict, index: int) -> list[list[float]]:
    """Decode one (quantized, delta-encoded) TopoJSON arc into [lon, lat] points."""
    arc = topology["arcs"][index if index >= 0 else ~index]
    transform = topology.get("transform")
    if transform:
        (sx, sy), (tx, ty) = transform["scale"], transform["translate"]
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append([x * sx + tx, y * sy + ty])
    else:
        points = [list(p) for p in arc]
    return points if index >= 0 else points[::-1]


def _decode_ring(topology: dict, arc_indexes: list[int]) -> list[list[float]]:
    ring: list[list[float]] = []
    for i in arc_indexes:
        points = _decode_arc(topology, i)
        # Consecutive arcs share an endpoint; don't repeat it.
        ring.extend(points[1:] if ring else points)
    return ring


@cache
def get_shape(territory_id: str) -> dict:
    """GeoJSON Feature (Polygon or MultiPolygon) for a territory."""
    t = TERRITORIES_BY_ID[territory_id]
    topology = _load_topology(t.source)
    _, object_name = SOURCES[t.source]
    geometries = topology["objects"][object_name]["geometries"]
    geom = next((g for g in geometries if g.get("properties", {}).get("name") == t.name), None)
    if geom is None:
        raise KeyError(f'No border data for "{t.name}".')

    if geom["type"] == "Polygon":
        coordinates = [_decode_ring(topology, ring) for ring in geom["arcs"]]
    elif geom["type"] == "MultiPolygon":
        coordinates = [[_decode_ring(topology, ring) for ring in poly] for poly in geom["arcs"]]
    else:
        raise ValueError(f'Unsupported geometry type {geom["type"]} for "{t.name}".')

    return {
        "type": "Feature",
        "properties": {"name": t.name},
        "geometry": {"type": geom["type"], "coordinates": coordinates},
    }
