"""
Aerodrome data for the take-off and landing checks.

Copy it from the Portuguese AIP (AD 2) or the VFR Manual (MVFR) published by
NAV Portugal (ais.nav.pt), and check it again every AIRAC cycle.

The runway data is LEFT EMPTY ON PURPOSE: until an aerodrome's elevation and
runways are filled in, the program skips the runway checks there instead of
using made-up numbers.

For each runway direction add one line to "runways":
    rwy      designator, e.g. "29"
    bearing  true bearing in degrees, for the wind components
             (None = use the designator x 10)
    tora, toda, lda   declared distances in metres
    surface  "paved" or "grass"
"""

DEPARTURE = "LPPM"        # every flight starts here
ALTERNATES = ["LPFR", "LPEV"]

AERODROMES = {
    "LPPM": {
        "name": "Portimao",
        "nm_from_departure": 0,
        "elevation_ft": None,
        "runways": [
            # {"rwy": "..", "bearing": None, "tora": ..., "toda": ..., "lda": ..., "surface": "paved"},
        ],
    },
    "LPFR": {
        "name": "Faro",
        "nm_from_departure": 31,      # straight line from LPPM
        "elevation_ft": None,
        "runways": [],
    },
    "LPEV": {
        "name": "Evora",
        "nm_from_departure": 89,
        "elevation_ft": None,
        "runways": [],
    },
}


def missing_data(icao):
    """What still has to be copied from the AIP for this aerodrome, or ""."""
    ad = AERODROMES.get(icao)
    if ad is None:
        return "not in aerodromes.py"
    if ad["elevation_ft"] is None or not ad["runways"]:
        return "elevation and runways not filled in yet"
    for rwy in ad["runways"]:
        if None in (rwy.get("tora"), rwy.get("toda"), rwy.get("lda")):
            return f"RWY {rwy.get('rwy')} declared distances not filled in yet"
    return ""
