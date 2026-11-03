"""Build continent outlines by cutting country borders along continent boundaries.

`countries.csv` names one continent per country, but several countries sit on
two: Russia, Turkey, Egypt, Kazakhstan, Indonesia, France (overseas), the
United States (Hawaii), and others. A continent question is the land itself,
so those countries are split and each part counts only for the continent it
falls in.

The cuts are the GBIF continent cookie cutter (ODbL, derived from OpenStreetMap):
https://github.com/gbif/continents — download `continent_cookie_cutter.geojson`
and pass its path. Antarctica is left out; this game's six continents are the
ones in CONTINENT_NAMES.

    python build_continents.py path/to/continent_cookie_cutter.geojson
"""

import json
import math
import sys
from pathlib import Path

from shapely.affinity import translate
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from territories import CONTINENT_NAMES, TERRITORIES, get_shape

OUT = Path(__file__).parent / "data" / "borders" / "continents.geojson"
# About a kilometre: finer than it needs to be for a 1 km population grid,
# coarse enough to drop river-bend detail from the boundary lines.
SIMPLIFY_DEG = 0.01


def polygonal(geom):
    geom = make_valid(geom)
    if geom.geom_type == "GeometryCollection":
        geom = unary_union([g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")])
    return geom


def _unwrap_ring(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Shift longitudes so a ring that crosses the antimeridian stays continuous.

    A planar union treats the jump from 179° to −179° as a line across the
    whole map. That line survives as a thin strip through every continent.
    """
    out = [coords[0]]
    offset = 0.0
    for lon, lat in coords[1:]:
        lon += offset
        while lon - out[-1][0] > 180:
            lon -= 360
            offset -= 360
        while out[-1][0] - lon > 180:
            lon += 360
            offset += 360
        out.append((lon, lat))
    # The input ring is closed. After shifting, the ends meet, possibly 360° apart.
    delta = out[-1][0] - out[0][0]
    turns = round(delta / 360)
    if abs(delta - turns * 360) < 1e-4 and abs(out[-1][1] - out[0][1]) < 1e-4:
        if turns:
            out = [(lon - turns * 360, lat) for lon, lat in out]
        out[-1] = out[0]
    return out


def _crosses_antimeridian(geom) -> bool:
    geoms = [geom] if geom.geom_type == "Polygon" else [g for g in geom.geoms if g.geom_type == "Polygon"]
    for poly in geoms:
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.coords)
            if any(abs(a[0] - b[0]) > 180 for a, b in zip(pts, pts[1:])):
                return True
    return False


def seam_safe(geom):
    """Keep antimeridian crossings as separate pieces, each within −180..180.

    Repair the raw rings first. A planar make-valid treats the date line as a
    cut across the whole map and bakes that line into the outline.
    """
    if geom.is_empty or not _crosses_antimeridian(geom):
        return polygonal(geom)
    polys = [geom] if geom.geom_type == "Polygon" else [g for g in geom.geoms if g.geom_type == "Polygon"]
    fixed = []
    for poly in polys:
        holes = [_unwrap_ring(list(r.coords)) for r in poly.interiors]
        unwrapped = polygonal(Polygon(_unwrap_ring(list(poly.exterior.coords)), holes))
        minx, _, maxx, _ = unwrapped.bounds
        for k in range(math.floor((minx + 180) / 360), math.floor((maxx + 180) / 360) + 1):
            piece = unwrapped.intersection(box(-180 + 360 * k, -90, 180 + 360 * k, 90))
            if piece.is_empty:
                continue
            if k:
                piece = translate(piece, xoff=-360 * k)
            fixed.append(piece)
    return polygonal(unary_union(fixed)) if fixed else geom


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python build_continents.py continent_cookie_cutter.geojson")
    cutter = json.loads(Path(sys.argv[1]).read_text())
    by_slug: dict[str, list] = {}
    for feature in cutter["features"]:
        slug = feature["properties"]["continent"]
        if slug == "antarctica":
            continue
        by_slug.setdefault(slug, []).append(seam_safe(shape(feature["geometry"])))

    land = polygonal(
        unary_union(
            [
                seam_safe(shape(get_shape(t.id)["geometry"]))
                for t in TERRITORIES
                if t.source == "countries"
            ]
        )
    )

    features = []
    for name in CONTINENT_NAMES:
        slug = name.lower().replace(" ", "_")
        geom = polygonal(unary_union(by_slug[slug])).intersection(land)
        geom = polygonal(geom.simplify(SIMPLIFY_DEG, preserve_topology=True))
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name},
                "geometry": mapping(geom),
            }
        )
        print(f"{name:<16} {geom.geom_type} {len(geom.geoms) if geom.geom_type == 'MultiPolygon' else 1} parts")

    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}) + "\n")
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
