"""Game API. Implements the contract in `src/api/types.ts`:

    GET  /api/territory -> Territory
    POST /api/guess     -> GuessResult   body: { territoryId, guess: { lat, lon } }

Answers and density grids come from `data/` (see `compute_com.py`) and only
ever leave the server as part of a guess result.

    uvicorn main:app --reload --port 8787
"""

import json
import math
import random
from functools import cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from territories import TERRITORIES, get_shape

EARTH_RADIUS_KM = 6371.0
DATA_DIR = Path(__file__).parent / "data"
ANSWERS: dict[str, dict] = json.loads((DATA_DIR / "answers.json").read_text())["answers"]
PLAYABLE = [t for t in TERRITORIES if t.id in ANSWERS]

app = FastAPI(title="Countries.CoM API")


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
    distanceKm: float
    score: int
    density: DensityGrid


@cache
def load_density(territory_id: str) -> DensityGrid:
    return DensityGrid.model_validate_json((DATA_DIR / "density" / f"{territory_id}.json").read_text())


def distance_km(a: LatLon, b: LatLon) -> float:
    """Great-circle (haversine) distance."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def score(distance: float, area_km2: float) -> int:
    """0–1000. Distance is judged relative to the territory's size."""
    size_km = math.sqrt(area_km2)
    return max(0, round(1000 * math.exp(-distance / (0.18 * size_km))))


@app.get("/api/territory")
def get_territory() -> dict:
    t = random.choice(PLAYABLE)
    return {"id": t.id, "name": t.name, "region": t.region, "shape": get_shape(t.id)}


@app.post("/api/guess")
def post_guess(body: GuessRequest) -> GuessResult:
    answer = ANSWERS.get(body.territoryId)
    if answer is None:
        raise HTTPException(404, f'Unknown territory "{body.territoryId}".')
    true_com = LatLon(lat=answer["lat"], lon=answer["lon"])
    d = distance_km(body.guess, true_com)
    return GuessResult(
        trueCom=true_com,
        distanceKm=d,
        score=score(d, answer["area_km2"]),
        density=load_density(body.territoryId),
    )


# The frontend expects errors as { "error": "message" }.
@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse({"error": "Expected { territoryId, guess: { lat, lon } }."}, status_code=400)
