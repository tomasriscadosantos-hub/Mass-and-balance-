"""
Take-off, landing and climb performance from the POHs (Section 5).

  Cessna 152:  1980 Model 152 POH (1 July 1979)
  Cessna 172P: 1981 Model 172P POH (30 May 1980, revision 2, 1 October 1994)

Take-off and landing use the SHORT FIELD tables. Distances are in feet, as in
the POH. Corrections, from the notes under each table (same for both types):
  - headwind: decrease distances 10 % for each 9 kt
  - tailwind up to 10 kt: increase distances 10 % for each 2 kt
  - dry grass runway: increase distances by 15 % (take-off) or 45 % (landing)
    of the ground roll figure
Between table values the numbers are interpolated in a straight line. Below
sea level or below the coldest column the program uses the S.L. / coldest
values (which gives a slightly longer distance, so it stays on the safe side).
"""

from math import cos, radians, sin

FT_PER_HPA = 30           # pressure altitude = elevation + (1013 - QNH) x 30 ft
# False: interpolate between table values (more exact).
# True:  read the table at the next higher weight, altitude and temperature,
#        the conservative method the POH uses in its sample problem.
NEXT_HIGHER = False
M_PER_FT = 0.3048
MAX_TAILWIND_KT = 10      # the POH corrections only go up to 10 kt tailwind

# Safety factors put on top of the POH distances before they are compared with
# the runway (the UK CAA Safety Sense 7 recommendation). Set to 1.0 to compare
# the plain POH numbers.
TAKEOFF_FACTOR = 1.33
LANDING_FACTOR = 1.43

ALTS = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]
TEMPS = [0, 10, 20, 30, 40]
CLIMB_ALTS = [0, 2000, 4000, 6000, 8000, 10000, 12000]
CLIMB_TEMPS = [-20, 0, 20, 40]
_ = None                  # "---" in the POH: outside the published data

# Take-off and landing tables: one row per pressure altitude in ALTS, each row
# holding (ground roll, total over 50 ft) for 0, 10, 20, 30 and 40 C.
# Climb tables: one row per pressure altitude in CLIMB_ALTS, each row holding
# (climb speed KIAS, then rate of climb ft/min for -20, 0, 20 and 40 C).
TYPES = {
    "C152": {
        "max_crosswind_kt": 12,          # maximum demonstrated (fig. 5-4)
        "takeoff_note": "flaps 10, full throttle before brake release",
        "takeoff": {
            # weight: (lift-off KIAS, KIAS at 50 ft, rows)      Figure 5-4
            1670: (50, 54, [
                [640, 1190, 695, 1290, 755, 1390, 810, 1495, 875, 1605],
                [705, 1310, 765, 1420, 825, 1530, 890, 1645, 960, 1770],
                [775, 1445, 840, 1565, 910, 1690, 980, 1820, 1055, 1960],
                [855, 1600, 925, 1730, 1000, 1870, 1080, 2020, 1165, 2185],
                [940, 1775, 1020, 1920, 1100, 2080, 1190, 2250, 1285, 2440],
                [1040, 1970, 1125, 2140, 1215, 2320, 1315, 2525, 1420, 2750],
                [1145, 2200, 1245, 2395, 1345, 2610, 1455, 2855, 1570, 3125],
                [1270, 2470, 1375, 2705, 1490, 2960, 1615, 3255, 1745, 3590],
                [1405, 2800, 1525, 3080, 1655, 3395, 1795, 3765, 1940, 4195],
            ]),
        },
        "landing_note": "flaps 30, power off, maximum braking",
        "landing": {
            # weight: (KIAS at 50 ft, rows)                      Figure 5-11
            1670: (54, [
                [450, 1160, 465, 1185, 485, 1215, 500, 1240, 515, 1265],
                [465, 1185, 485, 1215, 500, 1240, 520, 1270, 535, 1295],
                [485, 1215, 500, 1240, 520, 1270, 535, 1300, 555, 1330],
                [500, 1240, 520, 1275, 540, 1305, 560, 1335, 575, 1360],
                [520, 1275, 540, 1305, 560, 1335, 580, 1370, 600, 1400],
                [540, 1305, 560, 1335, 580, 1370, 600, 1400, 620, 1435],
                [560, 1340, 580, 1370, 605, 1410, 625, 1440, 645, 1475],
                [585, 1375, 605, 1410, 625, 1440, 650, 1480, 670, 1515],
                [605, 1410, 630, 1450, 650, 1480, 675, 1520, 695, 1555],
            ]),
        },
        "climb": [                       # 1670 lb, flaps up      Figure 5-5
            [67, 835, 765, 700, 630],
            [66, 735, 670, 600, 535],
            [65, 635, 570, 505, 445],
            [63, 535, 475, 415, 355],
            [62, 440, 380, 320, 265],
            [61, 340, 285, 230, 175],
            [60, 245, 190, 135, 85],
        ],
    },
    "C172P": {
        "max_crosswind_kt": 15,          # maximum demonstrated (section 4)
        "takeoff_note": "flaps 10, full throttle before brake release",
        "takeoff": {                     #                  Figure 5-4, sheets 1-2
            2400: (51, 56, [
                [795, 1460, 860, 1570, 925, 1685, 995, 1810, 1065, 1945],
                [875, 1605, 940, 1725, 1015, 1860, 1090, 2000, 1170, 2155],
                [960, 1770, 1035, 1910, 1115, 2060, 1200, 2220, 1290, 2395],
                [1055, 1960, 1140, 2120, 1230, 2295, 1325, 2480, 1425, 2685],
                [1165, 2185, 1260, 2365, 1355, 2570, 1465, 2790, 1575, 3030],
                [1285, 2445, 1390, 2660, 1500, 2895, 1620, 3160, 1745, 3455],
                [1425, 2755, 1540, 3015, 1665, 3300, 1800, 3620, 1940, 3990],
                [1580, 3140, 1710, 3450, 1850, 3805, 2000, 4220, _, _],
                [1755, 3615, 1905, 4015, 2060, 4480, _, _, _, _],
            ]),
            2200: (49, 54, [
                [650, 1195, 700, 1280, 750, 1375, 805, 1470, 865, 1575],
                [710, 1310, 765, 1405, 825, 1510, 885, 1615, 950, 1735],
                [780, 1440, 840, 1545, 905, 1660, 975, 1785, 1045, 1915],
                [855, 1585, 925, 1705, 995, 1835, 1070, 1975, 1150, 2130],
                [945, 1750, 1020, 1890, 1100, 2040, 1180, 2200, 1270, 2375],
                [1040, 1945, 1125, 2105, 1210, 2275, 1305, 2465, 1405, 2665],
                [1150, 2170, 1240, 2355, 1340, 2555, 1445, 2775, 1555, 3020],
                [1270, 2440, 1375, 2655, 1485, 2890, 1605, 3155, 1730, 3450],
                [1410, 2760, 1525, 3015, 1650, 3305, 1785, 3630, 1925, 4005],
            ]),
            2000: (46, 51, [
                [525, 970, 565, 1035, 605, 1110, 650, 1185, 695, 1265],
                [570, 1060, 615, 1135, 665, 1215, 710, 1295, 765, 1385],
                [625, 1160, 675, 1240, 725, 1330, 780, 1425, 840, 1525],
                [690, 1270, 740, 1365, 800, 1465, 860, 1570, 920, 1685],
                [755, 1400, 815, 1500, 880, 1615, 945, 1735, 1015, 1865],
                [830, 1545, 900, 1660, 970, 1790, 1040, 1925, 1120, 2070],
                [920, 1710, 990, 1845, 1070, 1990, 1150, 2145, 1235, 2315],
                [1015, 1900, 1095, 2055, 1180, 2225, 1275, 2405, 1370, 2605],
                [1125, 2125, 1215, 2305, 1310, 2500, 1410, 2715, 1520, 2950],
            ]),
        },
        "landing_note": "flaps 30, power off, maximum braking",
        "landing": {                     #                        Figure 5-10
            2400: (61, [
                [510, 1235, 530, 1265, 550, 1295, 570, 1325, 585, 1350],
                [530, 1265, 550, 1295, 570, 1325, 590, 1360, 610, 1390],
                [550, 1295, 570, 1330, 590, 1360, 610, 1390, 630, 1425],
                [570, 1330, 590, 1360, 615, 1395, 635, 1430, 655, 1460],
                [595, 1365, 615, 1400, 635, 1430, 660, 1470, 680, 1500],
                [615, 1400, 640, 1435, 660, 1470, 685, 1510, 705, 1540],
                [640, 1435, 660, 1470, 685, 1510, 710, 1550, 730, 1580],
                [665, 1475, 690, 1515, 710, 1550, 735, 1590, 760, 1630],
                [690, 1515, 715, 1555, 740, 1595, 765, 1635, 790, 1675],
            ]),
        },
        "climb": [                       # 2400 lb, flaps up      Figure 5-5
            [76, 805, 745, 685, 625],
            [75, 695, 640, 580, 525],
            [74, 590, 535, 480, 420],
            [73, 485, 430, 375, 320],
            [72, 380, 330, 275, 220],
            [71, 275, 225, 175, _],
            [70, 175, 125, _, _],
        ],
    },
}


# ---------------------------------------------------------- interpolation --

def _between(value, points):
    """(i, f): value lies between points[i] and points[i+1], f of the way."""
    for i in range(len(points) - 1):
        if points[i] <= value <= points[i + 1]:
            f = (value - points[i]) / (points[i + 1] - points[i])
            return i, (1.0 if NEXT_HIGHER and f > 0 else f)
    return None


def _grid(rows, alts, temps, pa, oat, width, col):
    """Interpolate one quantity in a POH table; None if outside the table."""
    pa, oat = max(pa, alts[0]), max(oat, temps[0])   # see module notes
    a, t = _between(pa, alts), _between(oat, temps)
    if a is None or t is None:
        return None
    (i, fa), (j, ft) = a, t
    total = 0.0
    for di, wa in ((0, 1 - fa), (1, fa)):
        for dj, wt in ((0, 1 - ft), (1, ft)):
            if wa * wt == 0:
                continue
            value = rows[i + di][(j + dj) * width + col]
            if value is None:
                return None
            total += value * wa * wt
    return total


def _by_weight(tables, weight, value):
    """Interpolate value(table) between the POH weights."""
    weights = sorted(tables)
    w = min(max(weight, weights[0]), weights[-1])
    if len(weights) == 1:
        return value(tables[weights[0]])
    i, f = _between(w, weights)
    low, high = value(tables[weights[i]]), value(tables[weights[i + 1]])
    if low is None or high is None:
        return None
    return low + (high - low) * f


def _speeds(tables, weight):
    """Speeds of the nearest POH weight at or above this weight."""
    heavier = [w for w in sorted(tables) if w >= weight]
    return tables[heavier[0] if heavier else max(tables)][:-1]


# ------------------------------------------------------------ public API --

def pressure_altitude(elevation_ft, qnh_hpa):
    return elevation_ft + (1013 - qnh_hpa) * FT_PER_HPA


def wind_components(runway_bearing, wind_dir, wind_kt):
    """(headwind, crosswind) in kt; a negative headwind is a tailwind."""
    angle = radians(wind_dir - runway_bearing)
    return wind_kt * cos(angle), abs(wind_kt * sin(angle))


def wind_factor(headwind):
    if headwind >= 0:
        return 1 - 0.10 * headwind / 9
    return 1 + 0.10 * -headwind / 2


def takeoff(type_key, weight, pa, oat):
    """POH (ground roll, total over 50 ft) in ft at zero wind, paved; and the
    (lift-off, 50 ft) speeds. Distances are None outside the POH table."""
    tables = TYPES[type_key]["takeoff"]
    dist = [_by_weight(tables, weight,
                       lambda t, c=c: _grid(t[-1], ALTS, TEMPS, pa, oat, 2, c))
            for c in (0, 1)]
    return dist, _speeds(tables, weight)


def landing(type_key, weight, pa, oat):
    """Like takeoff(): (ground roll, total from 50 ft) and (speed at 50 ft,)."""
    tables = TYPES[type_key]["landing"]
    dist = [_by_weight(tables, weight,
                       lambda t, c=c: _grid(t[-1], ALTS, TEMPS, pa, oat, 2, c))
            for c in (0, 1)]
    return dist, _speeds(tables, weight)


def corrected(dist, headwind, grass, grass_pct):
    """Apply the POH wind and grass corrections to (ground roll, total)."""
    roll, total = (d * wind_factor(headwind) for d in dist)
    if grass:
        roll, total = roll + roll * grass_pct, total + roll * grass_pct
    return roll, total


def climb(type_key, pa, oat):
    """(climb speed KIAS, max rate of climb ft/min), or None outside the table."""
    rows = TYPES[type_key]["climb"]
    speed = rows[min(range(len(CLIMB_ALTS)),
                     key=lambda i: abs(CLIMB_ALTS[i] - max(pa, 0)))][0]
    rate = _grid([r[1:] for r in rows], CLIMB_ALTS, CLIMB_TEMPS, pa, oat, 1, 0)
    return None if rate is None else (speed, rate)
