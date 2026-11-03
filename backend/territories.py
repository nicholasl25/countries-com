"""Playable territories and their borders.

Borders are TopoJSON files from the `us-atlas` and `world-atlas` npm packages
(Natural Earth / US Census data), copied into `data/borders/`.

Countries come from `data/countries.csv` (display name, name in the border
file, continent) — edit it to rename a country, move it to another continent,
or remove it. That continent column is only the catalog group: several
countries sit on two continents, so the playable continent shapes are the
country outlines cut along the real boundaries (`data/borders/continents.geojson`,
built by `build_continents.py`). US states are all 50 states in the us-atlas file.
"""

import csv
import json
import re
import unicodedata
from dataclasses import dataclass
from functools import cache
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
BORDERS_DIR = DATA_DIR / "borders"

SOURCES = {
    # source name -> (file, object name inside the TopoJSON)
    "states": ("us-states-10m.json", "states"),
    "countries": ("world-countries-50m.json", "countries"),
    # Low-detail world map for catalog previews only.
    "world-preview": ("world-countries-110m.json", "countries"),
}

# Order catalog groups are listed in.
CONTINENT_NAMES = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"]
CATEGORIES = ["Countries", "US States", "Continents", *CONTINENT_NAMES]


@dataclass(frozen=True)
class Territory:
    id: str
    name: str
    source: str  # key of SOURCES
    atlas_name: str  # name in the border file
    continent: str | None = None  # countries only

    @property
    def region(self) -> str:
        """Subtitle shown under the name."""
        if self.source == "states":
            return "United States"
        if self.source == "continent":
            return "Continent"
        return self.continent or ""

    @property
    def categories(self) -> list[str]:
        """Catalog groups this territory appears in."""
        if self.source == "states":
            return ["US States"]
        if self.source == "continent":
            return ["Continents"]
        return ["Countries", self.continent] if self.continent else ["Countries"]


@cache
def _load_topology(source: str) -> dict:
    filename, _ = SOURCES[source]
    return json.loads((BORDERS_DIR / filename).read_text())


def _slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def _us_states() -> list[Territory]:
    geometries = _load_topology("states")["objects"]["states"]["geometries"]
    # FIPS codes 01–56 are the 50 states plus DC (11); above 56 are territories.
    return [
        Territory(f"us-{_slug(g['properties']['name'])}", g["properties"]["name"], "states", g["properties"]["name"])
        for g in geometries
        if g["id"] <= "56" and g["id"] != "11"
    ]


def _countries() -> list[Territory]:
    with open(DATA_DIR / "countries.csv", newline="") as f:
        return [
            Territory(_slug(row["name"]), row["name"], "countries", row["atlas_name"], row["continent"])
            for row in csv.DictReader(f)
        ]


def _continents() -> list[Territory]:
    """One question per continent: the center of mass of that landmass."""
    return [Territory(f"continent-{_slug(name)}", name, "continent", name, name) for name in CONTINENT_NAMES]


TERRITORIES = sorted(_us_states() + _countries() + _continents(), key=lambda t: t.name)
TERRITORIES_BY_ID = {t.id: t for t in TERRITORIES}
assert len(TERRITORIES_BY_ID) == len(TERRITORIES), "Territory ids must be unique"


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


def _decode_geometry(topology: dict, geom: dict) -> dict:
    if geom["type"] == "Polygon":
        coordinates = [_decode_ring(topology, ring) for ring in geom["arcs"]]
    elif geom["type"] == "MultiPolygon":
        coordinates = [[_decode_ring(topology, ring) for ring in poly] for poly in geom["arcs"]]
    else:
        raise ValueError(f'Unsupported geometry type {geom["type"]}.')
    return {"type": geom["type"], "coordinates": coordinates}


@cache
def _continent_features() -> dict[str, dict]:
    data = json.loads((BORDERS_DIR / "continents.geojson").read_text())
    return {f["properties"]["name"]: f for f in data["features"]}


@cache
def get_shape(territory_id: str) -> dict:
    """GeoJSON Feature (Polygon or MultiPolygon) for a territory."""
    t = TERRITORIES_BY_ID[territory_id]
    if t.source == "continent":
        feature = _continent_features()[t.name]
        return {"type": "Feature", "properties": {"name": t.name}, "geometry": feature["geometry"]}
    topology = _load_topology(t.source)
    _, object_name = SOURCES[t.source]
    geometries = topology["objects"][object_name]["geometries"]
    geom = next((g for g in geometries if g.get("properties", {}).get("name") == t.atlas_name), None)
    if geom is None:
        raise KeyError(f'No border data for "{t.atlas_name}".')

    return {
        "type": "Feature",
        "properties": {"name": t.name},
        "geometry": _decode_geometry(topology, geom),
    }


def _round_coords(coords, digits: int):
    if isinstance(coords[0], (int, float)):
        return [round(c, digits) for c in coords]
    return [_round_coords(c, digits) for c in coords]


@cache
def get_continents_preview() -> dict:
    """Every continent at low detail, as a GeoJSON FeatureCollection."""
    from shapely.geometry import MultiPolygon, mapping, shape

    features = []
    for name, feature in _continent_features().items():
        geom = shape(feature["geometry"]).simplify(0.2, preserve_topology=True)
        # Islands too small to see on a catalog card.
        parts = [p for p in getattr(geom, "geoms", [geom]) if p.area >= 0.3]
        simple = mapping(MultiPolygon(parts))
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name},
                "geometry": {"type": simple["type"], "coordinates": _round_coords(simple["coordinates"], 2)},
            }
        )
    return {"type": "FeatureCollection", "features": features}


@cache
def get_world_preview() -> dict:
    """Every country at low detail, as a GeoJSON FeatureCollection."""
    topology = _load_topology("world-preview")
    _, object_name = SOURCES["world-preview"]
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": g.get("properties", {}).get("name")},
                "geometry": {
                    "type": g["type"],
                    "coordinates": _round_coords(_decode_geometry(topology, g)["coordinates"], 2),
                },
            }
            for g in topology["objects"][object_name]["geometries"]
        ],
    }
