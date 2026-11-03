"""Game API. Implements the contract in `src/api/types.ts`:

    GET  /api/territory[?id=|?category=]  -> Territory (random, optionally within a category
                                             or "100 Largest Countries")
    POST /api/guess             -> GuessResult   body: { territoryId, guess: { lat, lon } }
    GET  /api/catalog           -> Catalog       list of territories by category
    GET  /api/catalog/{id}      -> CatalogDetail territory + answer + heat map
    GET  /api/world             -> low-detail world map (GeoJSON) for catalog previews
    GET  /api/daily?date=YYYY-MM-DD -> DailyGame the day's rounds (from data/daily.csv)

Answers and density grids come from `data/` (see `compute_com.py`). In the game
they only leave the server as part of a guess result; the catalog shows them
on purpose.

    uvicorn main:app --reload --port 8787
"""

import csv
import datetime as dt
import json
import math
import os
import random
from functools import cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from territories import (
    CATEGORIES,
    TERRITORIES,
    TERRITORIES_BY_ID,
    get_continents_preview,
    get_shape,
    get_world_preview,
)

EARTH_RADIUS_KM = 6371.0
SCORE_K = math.log(2)
DATA_DIR = Path(__file__).parent / "data"
# Built frontend. Locally this is the repo's dist/; the image sets STATIC_DIR.
DIST_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parent.parent / "dist"))
ANSWERS: dict[str, dict] = json.loads((DATA_DIR / "answers.json").read_text())["answers"]
PLAYABLE = [t for t in TERRITORIES if t.id in ANSWERS]

# A random-play pool that isn't a catalog group: the largest countries by area.
LARGEST_CATEGORY = "100 Largest Countries"
LARGEST = {
    t.id
    for t in sorted(
        (t for t in PLAYABLE if "Countries" in t.categories),
        key=lambda t: ANSWERS[t.id]["area_km2"],
        reverse=True,
    )[:100]
}


def in_category(t, category: str | None) -> bool:
    if not category:
        return True
    if category == LARGEST_CATEGORY:
        return t.id in LARGEST
    return category in t.categories


def load_daily() -> dict[dt.date, list[str]]:
    """Hand-picked rounds per day: `date,round1,round2,...` (territory ids)."""
    schedule = {}
    with open(DATA_DIR / "daily.csv", newline="") as f:
        for row in csv.DictReader(f):
            day = dt.date.fromisoformat(row["date"])
            ids = [v.strip() for k, v in row.items() if k.startswith("round") and v and v.strip()]
            unknown = [i for i in ids if i not in ANSWERS]
            if unknown:
                raise ValueError(f"daily.csv {day}: unknown territory ids {unknown}")
            if day in schedule:
                raise ValueError(f"daily.csv: {day} is listed twice")
            schedule[day] = ids
    return schedule


DAILY = load_daily()
DAILY_START = min(DAILY, default=dt.date.today())

app = FastAPI(title="Countries.CoM API")
app.add_middleware(GZipMiddleware)


class LatLon(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class GuessRequest(BaseModel):
    territoryId: str
    guess: LatLon


class DensityGrid(BaseModel):
    """Population density on a lat/lon grid (row 0 = north), for the heat map."""

    west: float
    south: float
    east: float
    north: float
    width: int
    height: int
    values: str  # base64, one byte per cell: 0 = no people, 1–255 = low to high


class GuessResult(BaseModel):
    trueCom: LatLon
    sigmaKm: float  # population spread, treating it as a 2D normal around the CoM
    distanceKm: float
    score: int
    density: list[DensityGrid]  # one per group of nearby parts of the territory


@cache
def load_density(territory_id: str) -> list[DensityGrid]:
    path = DATA_DIR / "density" / f"{territory_id}.json"
    if not path.exists():
        return []
    return [DensityGrid.model_validate(g) for g in json.loads(path.read_text())]


def distance_km(a: LatLon, b: LatLon) -> float:
    """Great-circle (haversine) distance."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def score(distance: float, sigma_km: float) -> int:
    """0–1000, judged relative to how spread out the territory's people are
    (σ): 1000 on the dot, and 2× fewer points per σ of distance — 500 at 1σ,
    250 at 2σ, 125 at 3σ."""
    return max(0, round(1000 * math.exp(-SCORE_K * distance / sigma_km)))


def territory_json(territory_id: str) -> dict:
    t = TERRITORIES_BY_ID.get(territory_id)
    if t is None or territory_id not in ANSWERS:
        raise HTTPException(404, f'Unknown territory "{territory_id}".')
    return {"id": t.id, "name": t.name, "region": t.region, "shape": get_shape(t.id)}


@app.get("/api/territory")
def get_territory(id: str | None = None, category: str | None = None) -> dict:
    if id:
        return territory_json(id)
    pool = [t for t in PLAYABLE if in_category(t, category)]
    if not pool:
        raise HTTPException(404, f'No territories in "{category}".')
    return territory_json(random.choice(pool).id)


@app.get("/api/catalog")
def get_catalog() -> dict:
    used = {c for t in PLAYABLE for c in t.categories}
    return {
        "categories": [c for c in CATEGORIES if c in used],
        "territories": [
            {
                "id": t.id,
                "name": t.name,
                "region": t.region,
                "categories": t.categories,
                "mapName": (
                    t.atlas_name
                    if t.source == "countries"
                    else "United States of America"
                    if t.source == "states"
                    else None
                ),
            }
            for t in sorted(PLAYABLE, key=lambda t: t.name)
        ],
    }


@app.get("/api/world")
def get_world() -> dict:
    return get_world_preview()


@app.get("/api/continents")
def get_continents() -> dict:
    return get_continents_preview()


@app.get("/api/catalog/{territory_id}")
def get_catalog_entry(territory_id: str) -> dict:
    territory = territory_json(territory_id)
    answer = ANSWERS[territory_id]
    return {
        "territory": territory,
        "trueCom": {"lat": answer["lat"], "lon": answer["lon"]},
        "sigmaKm": answer["sigma_km"],
        "population": answer["population"],
        "areaKm2": answer["area_km2"],
        "density": [g.model_dump() for g in load_density(territory_id)],
    }


@app.get("/api/daily")
def get_daily(date: str = "") -> dict:
    """`date` is the player's local date, so the game flips at their midnight."""
    try:
        day = dt.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(400, "Expected ?date=YYYY-MM-DD.")
    # The furthest-ahead time zone (UTC+14) is at most a day past UTC.
    if day > dt.datetime.now(dt.timezone.utc).date() + dt.timedelta(days=1):
        raise HTTPException(403, "That daily game isn't out yet.")
    ids = DAILY.get(day)
    if not ids:
        raise HTTPException(404, f"No daily game for {day.isoformat()}.")
    return {
        "date": day.isoformat(),
        "number": (day - DAILY_START).days + 1,
        "rounds": [territory_json(i) for i in ids],
    }


@app.post("/api/guess")
def post_guess(body: GuessRequest) -> GuessResult:
    answer = ANSWERS.get(body.territoryId)
    if answer is None:
        raise HTTPException(404, f'Unknown territory "{body.territoryId}".')
    true_com = LatLon(lat=answer["lat"], lon=answer["lon"])
    d = distance_km(body.guess, true_com)
    return GuessResult(
        trueCom=true_com,
        sigmaKm=answer["sigma_km"],
        distanceKm=d,
        score=score(d, answer["sigma_km"]),
        density=load_density(body.territoryId),
    )


# The frontend expects errors as { "error": "message" }.
@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse({"error": "Expected { territoryId, guess: { lat, lon } }."}, status_code=400)


# After the API routes, so /api is never served as a file. Hash routes need only index.html.
if DIST_DIR.is_dir():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="site")
