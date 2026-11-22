"""
Aerodrome data for the take-off and landing checks.

Copy it from the Portuguese AIP (AD 2) or the VFR Manual (MVFR) published by
NAV Portugal (ais.nav.pt), and check it again every AIRAC cycle.

A new aerodrome can be added with None until its data is copied: until its
elevation and runways are filled in, the program skips the runway checks
there instead of using made-up numbers.

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
    # Faro: AIP Portugal LPFR AD 2 (AIRAC 008-26). RWY 10/28 2490 x 45 m
    # asphalt, THR displaced 45 m at both ends.
    "LPFR": {
        "name": "Faro",
        "nm_from_departure": 31,      # straight line from LPPM
        "elevation_ft": 24,           # 7 m
        "runways": [
            {"rwy": "10", "bearing": 100.07, "tora": 2490, "toda": 2645,
             "asda": 2490, "lda": 2445, "surface": "paved"},
            {"rwy": "28", "bearing": 280.07, "tora": 2490, "toda": 2645,
             "asda": 2490, "lda": 2445, "surface": "paved"},
        ],
    },
    # Evora: AIP Portugal LPEV AD 2 (AIRAC 008-26). RWY 01/19 1300 x 23 m
    # asphalt, THR 01 displaced 54 m, THR 19 40 m.
    "LPEV": {
        "name": "Evora",
        "nm_from_departure": 89,
        "elevation_ft": 807,          # 246 m
        "runways": [
            {"rwy": "01", "bearing": 4.25, "tora": 1260, "toda": 1300,
             "asda": 1300, "lda": 1245, "surface": "paved"},
            {"rwy": "19", "bearing": 184.25, "tora": 1245, "toda": 1300,
             "asda": 1300, "lda": 1260, "surface": "paved"},
            # RWY 07/25 (sand, 530 x 30 m) is left out: the POH has no
            # performance data for sand.
        ],
    },
    # Beja: AIP Portugal LPBJ AD 2 (AIRAC 007-26). RWY 01L/19R 3450 x 60 m
    # concrete, slippery when wet; 01R/19L is for taxiing only.
    "LPBJ": {
        "name": "Beja",
        "nm_from_departure": 64,
        "elevation_ft": 636,          # 194 m
        "runways": [
            {"rwy": "01L", "bearing": 5.93, "tora": 3450, "toda": 3815,
             "asda": 3450, "lda": 3450, "surface": "paved"},
            {"rwy": "19R", "bearing": 185.93, "tora": 3450, "toda": 4040,
             "asda": 3450, "lda": 3450, "surface": "paved"},
        ],
    },
    # Ponte de Sor: AIP Portugal LPSO AD 2 (AIRAC 007-26). RWY 03/21
    # 1800 x 30 m asphalt; true bearing worked out from the threshold
    # coordinates (published as NIL).
    "LPSO": {
        "name": "Ponte de Sor",
        "nm_from_departure": 126,
        "elevation_ft": 390,          # 119 m
        "runways": [
            {"rwy": "03", "bearing": 24, "tora": 1800, "toda": 1800,
             "asda": 1800, "lda": 1800, "surface": "paved"},
            {"rwy": "21", "bearing": 204, "tora": 1800, "toda": 1800,
             "asda": 1800, "lda": 1800, "surface": "paved"},
        ],
    },    # Cascais: AIP Portugal LPCS AD 2 (AIRAC 006-26). RWY 17/35 1400 x 30 m
    # asphalt, THR 17 displaced 190 m, TORAs include 140 m starter
    # extensions; slopes down to the south about 0.9 % (no POH correction).
    "LPCS": {
        "name": "Cascais",
        "nm_from_departure": 101,
        "elevation_ft": 326,          # 99.32 m
        "runways": [
            {"rwy": "17", "bearing": 164.08, "tora": 1540, "toda": 1645,
             "asda": 1540, "lda": 1210, "surface": "paved"},
            {"rwy": "35", "bearing": 344.08, "tora": 1480, "toda": 1540,
             "asda": 1540, "lda": 1400, "surface": "paved"},
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
