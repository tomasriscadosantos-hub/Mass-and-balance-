"""
Aerodrome data for the take-off and landing checks.

Copy it from the Portuguese AIP (AD 2) or the VFR Manual (MVFR) published by
NAV Portugal (ais.nav.pt), and check it again every AIRAC cycle.

The runway data is LEFT EMPTY ON PURPOSE: until an aerodrome's elevation and
runways are filled in, the program skips the runway checks there instead of
using made-up numbers.

For each runway direction add one line to "runways":
    rwy      designator, e.g. "29"
    bearing  runway direction in degrees, for the wind components (None =
             use the designator x 10). True or magnetic: in southern Portugal
             they are within about 1-2 degrees, so a METAR (true) or ATIS
             (magnetic) wind both work.
    tora, toda, asda, lda   declared distances in metres
    surface  "paved" or "grass" (None = not known yet, worked out as paved)
"""

DEPARTURE = "LPPM"        # every flight starts here
ALTERNATES = ["LPFR", "LPEV"]

AERODROMES = {
    "LPPM": {
        "name": "Portimao",
        "nm_from_departure": 0,
        # NAV Portugal VFR Manual AD 2-LPPM (20-MAR-2025): elevation 1 m.
        "elevation_ft": 5,
        "runways": [
            # RWY 11/29: 860 x 27 m asphalt, THR 29 displaced 90 m (AD 2.12,
            # 2.13). True bearing worked out from the threshold coordinates
            # (published as NOT AVBL).
            {"rwy": "11", "bearing": 107.5, "tora": 770, "toda": 770,
             "asda": 860, "lda": 860, "surface": "paved"},
            {"rwy": "29", "bearing": 287.5, "tora": 860, "toda": 860,
             "asda": 860, "lda": 770, "surface": "paved"},
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
    "LPSO": {
        "name": "Ponte de Sor",
        "nm_from_departure": 126,
        # Not in the VFR Manual (it's in the AIP): elevation 119 m from the
        # IPMA station at the aerodrome (station 817).
        "elevation_ft": 390,
        "runways": [
            # RWY 03/21 as the IPMA station gives them. Surface and declared
            # distances: AIP AD 2.12 / 2.13, still to add.
            {"rwy": "03", "bearing": None, "tora": None, "toda": None,
             "asda": None, "lda": None, "surface": None},
            {"rwy": "21", "bearing": None, "tora": None, "toda": None,
             "asda": None, "lda": None, "surface": None},
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
