"""
Aerodrome data for the take-off and landing checks.

Copy it from the Portuguese AIP (AD 2) or the VFR Manual (MVFR) published by
NAV Portugal (ais.nav.pt), and check it again every AIRAC cycle.

The runway data is LEFT EMPTY ON PURPOSE: until an aerodrome's elevation and
runways are filled in, the program skips the runway checks there instead of
using made-up numbers.

For each runway direction add one line to "runways":
    rwy      designator, e.g. "29"
    bearing  runway direction in degrees from the AIP, for the wind
             components (None = use the designator x 10). The AIP gives it
             magnetic; in southern Portugal that is within about 1-2 degrees
             of true, so a METAR (true) or ATIS (magnetic) wind both work.
    tora, toda, asda, lda   declared distances in metres
    surface  "paved" or "grass"
"""

DEPARTURE = "LPPM"        # every flight starts here
ALTERNATES = ["LPFR", "LPEV"]

AERODROMES = {
    "LPPM": {
        "name": "Portimao",
        "nm_from_departure": 0,
        "elevation_ft": 5,       # 1.47 m, NAV Portugal sunrise/sunset tables 2026
        "runways": [
            # {"rwy": "..", "bearing": None, "tora": ..., "toda": ..., "asda": ..., "lda": ..., "surface": "paved"},
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
        # AIP Portugal LPEV AD 2.24.01-1, aerodrome chart (12 AUG 2021,
        # AIRAC 003-21): ARP 38 31 47N 007 53 31W, elevation 246 m.
        "elevation_ft": 807,
        "runways": [
            # RWY 01/19: asphalt 1300 x 23 m, displaced threshold at both
            # ends. Declared distances: AIP AD 2.13 (not on the chart).
            {"rwy": "01", "bearing": 6, "tora": None, "toda": None,
             "asda": None, "lda": None, "surface": "paved"},
            {"rwy": "19", "bearing": 186, "tora": None, "toda": None,
             "asda": None, "lda": None, "surface": "paved"},
            # RWY 07/25 (sand, 530 x 30 m) is left out: the POH has no
            # performance data for sand.
        ],
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
        if None in (rwy.get(k) for k in ("tora", "toda", "asda", "lda")):
            return f"RWY {rwy.get('rwy')} declared distances not filled in yet"
    return ""
