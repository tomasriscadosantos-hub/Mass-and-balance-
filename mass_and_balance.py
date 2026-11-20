#!/usr/bin/env python3
"""
Mass & balance and performance for OK-HAD (Cessna 152) and OK-KUN (Cessna 172P).

Units follow the Cessna POH: pounds (lb), inches (in), moments in lb-in/1000.
You can also type weights in kg ("80kg") and fuel in litres ("60l").
Flight times can be decimal hours ("1.5") or hours:minutes ("1:30").

After the loading sheet it works out the take-off and landing distances from
the POH tables (performance.py) and checks them against the runways in
aerodromes.py.

BEFORE USING THIS FOR A REAL FLIGHT:
  1. Keep each aircraft's weighing figures in AIRCRAFT below up to date with
     its CURRENT weighing report. The basic empty weight is worked out as in
     POH figure 6-1: as weighed + oil + unusable fuel. (Set "weighed" to None
     and the program refuses to run for that aircraft.)
  2. Copy the aerodrome elevations and runway declared distances from the AIP
     into aerodromes.py (until then the runway checks are skipped).
  3. Check the arms, limits, fuel capacity and fuel flow against that
     aircraft's own POH / flight manual and your school's procedures.
"""

import performance as perf
from aerodromes import AERODROMES, ALTERNATES, DEPARTURE, missing_data

LB_PER_KG = 2.20462
LITRES_PER_GAL = 3.78541
FUEL_LB_PER_GAL = 6.0     # AVGAS, as used in the POH
FINAL_RESERVE_MIN = 30    # VFR day final reserve; use 45 at night

AIRCRAFT = {
    "OK-HAD": {
        "type": "Cessna 152",
        "perf": "C152",           # performance tables in performance.py
        # Weighing protocol F-T-016, work order 014/2023 (30 Mar 2023):
        # 1154.5 lb, C.G. arm 29.97 in, moment 34.58 - weighed defueled and
        # without oil. Oil and unusable fuel are added as in POH figure 6-1.
        # (lb, lb-in/1000); None = not filled in yet
        "weighed": (1154.5, 34.58),
        "add_to_weighed": [       # (item, lb, arm in)
            ("Oil, 7 qt (with oil filter; 6 qt = 11.25 lb without)", 13.125, -14.7),
            ("Unusable fuel, 1.5 gal", 9.0, 40.0),
        ],
        # Loading stations: (name, arm in inches, max lb or None)
        "stations": [
            ("Pilot", 39.0, None),
            ("Front passenger", 39.0, None),
            ("Baggage area 1", 64.0, 120),
            ("Baggage area 2", 84.0, 40),
        ],
        "max_baggage": 120,       # baggage areas 1 + 2 together
        "fuel_arm": 42.0,
        "usable_fuel_gal": 24.5,  # OK-HAD: standard tanks, 24.5 gal usable
        "fuel_flow_gph": 6.0,     # planning figure, 6 gal/h = 36 lb/h
        "cruise_kt": 90,          # planning TAS, for the alternate leg
        "taxi_fuel_lb": 5,        # start, taxi and run-up
        "max_ramp": 1675,
        "max_takeoff": 1670,
        "max_landing": 1670,
        # Normal category: forward limit 31.0 in at 1350 lb or less, straight
        # line to 32.65 in at 1670 lb; aft limit 36.5 in at all weights.
        "cg_forward": [(1350, 31.0), (1670, 32.65)],
        "cg_aft": 36.5,
    },
    "OK-KUN": {
        "type": "Cessna 172P",
        "perf": "C172P",
        # Weighing protocol F-T-016, 16 Feb 2024: 1473 lb, C.G. arm 40.27 in,
        # moment 59317 lb-in, as weighed. Oil and unusable fuel are added as
        # in POH figure 6-1.
        "weighed": (1473.0, 59.317),
        "add_to_weighed": [
            ("Oil, 8 qt", 15.0, -14.0),
            ("Unusable fuel, 3 gal (standard tanks)", 18.0, 46.0),
        ],
        "stations": [
            ("Pilot", 37.0, None),
            ("Front passenger", 37.0, None),
            ("Rear passengers", 73.0, None),
            ("Baggage area 1", 95.0, 120),
            ("Baggage area 2", 123.0, 50),
        ],
        "max_baggage": 120,
        "fuel_arm": 48.0,
        "usable_fuel_gal": 40.0,  # OK-KUN: standard tanks, 40 gal usable
        "fuel_flow_gph": 9.0,     # planning figure, 9 gal/h = 54 lb/h
        "cruise_kt": 100,
        "taxi_fuel_lb": 7,        # POH: 1.1 gal for start, taxi and take-off
        "max_ramp": 2407,
        "max_takeoff": 2400,
        "max_landing": 2400,
        # Normal category: forward limit 35.0 in at 1950 lb or less, straight
        # line to 39.5 in at 2400 lb; aft limit 47.3 in at all weights.
        "cg_forward": [(1950, 35.0), (2400, 39.5)],
        "cg_aft": 47.3,
    },
}


def basic_empty(ac):
    """Basic empty weight and moment: as weighed + oil + unusable fuel."""
    if ac["weighed"] is None:
        return None, None
    weight, moment = ac["weighed"]
    for _, lb, arm in ac["add_to_weighed"]:
        weight += lb
        moment += lb * arm / 1000
    return weight, moment


for _ac in AIRCRAFT.values():
    _ac["empty_weight"], _ac["empty_moment"] = basic_empty(_ac)


# ------------------------------------------------------------------ input --

def to_number(text):
    return float(text.replace(",", "."))   # accept 1,5 as well as 1.5


def ask(prompt, convert, example, minimum=0):
    """Ask until convert(text) gives a value (not below minimum, if set)."""
    while True:
        text = input(prompt).strip().lower().replace(" ", "")
        try:
            value = convert(text)
        except ValueError:
            print(f"  Didn't understand that - try something like {example}")
            continue
        if minimum is not None and value < minimum:
            print("  Can't be negative.")
            continue
        return value


def menu(count, default=None):
    """Converter for ask(): a menu number from 1 to count."""
    def convert(text):
        if text == "" and default:
            return default
        n = int(text)
        if not 1 <= n <= count:
            raise ValueError
        return n
    return convert


def weight_lb(text):
    if text == "":
        return 0.0                          # empty seat / no baggage
    if text.endswith("kg"):
        return to_number(text[:-2]) * LB_PER_KG
    return to_number(text.removesuffix("lb"))


def fuel_gal(text, full):
    if text == "":
        return full
    if text.endswith("gal"):
        return to_number(text[:-3])
    if text.endswith("l"):
        return to_number(text[:-1]) / LITRES_PER_GAL
    return to_number(text)


def hours(text):
    if ":" in text:
        h, m = text.split(":")
        return int(h or 0) + int(m) / 60
    return to_number(text)


def hhmm(h):
    minutes = round(h * 60)
    return f"{minutes // 60}:{minutes % 60:02d}"


def qnh_hpa(text):
    qnh = to_number(text)
    if not 900 <= qnh <= 1100:
        raise ValueError
    return qnh


def celsius(text):
    oat = to_number(text.removesuffix("c"))
    if not -60 <= oat <= 60:
        raise ValueError
    return oat


def wind(text):
    """'270/10' or '27010' -> (270, 10); Enter or 'calm' -> (0, 0)."""
    text = text.removesuffix("kt")
    if text in ("", "calm", "0"):
        return 0, 0
    if "/" in text:
        direction, speed = text.split("/")
    elif len(text) == 5 and text.isdigit():
        direction, speed = text[:3], text[3:]
    else:
        raise ValueError
    direction, speed = int(direction), int(speed)
    if not (0 <= direction <= 360 and 0 <= speed <= 60):
        raise ValueError
    return direction, speed


def ask_weather(icao, previous):
    """(QNH, OAT, wind direction, wind speed) at icao. If `previous` is given
    as (icao, weather), Enter on the QNH reuses that weather."""
    if previous:
        print(f"Weather at {icao} (Enter on QNH = same as {previous[0]})")
        qnh = ask("  QNH (hPa) - ",
                  lambda t: "same" if t == "" else qnh_hpa(t), "1015", None)
        if qnh == "same":
            return previous[1]
    else:
        print(f"Weather at {icao}")
        qnh = ask("  QNH (hPa) - ", qnh_hpa, "1015")
    oat = ask("  OAT (C) - ", celsius, "18 or -2", minimum=None)
    direction, speed = ask("  Wind (e.g. 270/10, Enter = calm) - ",
                           wind, "270/10", minimum=None)
    return qnh, oat, direction, speed


# ------------------------------------------------------------ calculation --

def forward_limit(ac, weight):
    (w1, cg1), (w2, cg2) = ac["cg_forward"]
    if weight <= w1:
        return cg1
    return cg1 + (cg2 - cg1) * (weight - w1) / (w2 - w1)


def runway_bearing(rwy):
    bearing = rwy.get("bearing")
    return int(rwy["rwy"][:2]) * 10 if bearing is None else bearing


def positive(text):
    value = to_number(text)
    if value <= 0:
        raise ValueError
    return value


def optional_positive(text):
    return None if text == "" else positive(text)


def ask_site(icao, previous):
    """Weather and runway in use at icao. Enter on the runway picks the one
    most into wind."""
    weather = ask_weather(icao, previous)
    qnh, oat, wind_dir, wind_kt = weather
    runways = AERODROMES[icao]["runways"]
    best = max(runways, key=lambda r: perf.wind_components(
        runway_bearing(r), wind_dir, wind_kt)[0])

    def pick(text):
        if text == "":
            return best
        for rwy in runways:
            if rwy["rwy"].lower() == text:
                return rwy
        raise ValueError

    names = "/".join(r["rwy"] for r in runways)
    rwy = ask(f"  Runway in use ({names}, Enter = {best['rwy']}) - ", pick,
              best["rwy"], minimum=None)
    pa = perf.pressure_altitude(AERODROMES[icao]["elevation_ft"], qnh)
    return {"weather": weather, "rwy": rwy, "pa": pa,
            "da": perf.density_altitude(pa, oat)}


def ask_obstacle(climb_kias):
    """Optional obstacle after take-off: (NM, elevation ft, altitude limit
    ft or None, ground speed kt), or None."""
    nm = ask("Obstacle after take-off - distance in NM (Enter = none) - ",
             optional_positive, "1.5", minimum=None)
    if nm is None:
        return None
    elevation = ask("  Obstacle elevation (ft) - ", to_number, "659")
    limit = ask("  Altitude limit after departure (ft, Enter = none) - ",
                optional_positive, "1000", minimum=None)
    gs = ask(f"  Ground speed in the climb (kt, Enter = {climb_kias}, no wind) - ",
             lambda t: float(climb_kias) if t == "" else positive(t), "60")
    return nm, elevation, limit, gs


def runway_report(ac, kind, icao, mass, site, note=""):
    """Take-off or landing check on the runway in use, laid out like the
    school's performance sheet. Returns a list of problems."""
    data = perf.TYPES[ac["perf"]]
    rwy = site["rwy"]
    qnh, oat, wind_dir, wind_kt = site["weather"]
    takeoff = kind == "take-off"
    where = f"{kind} {icao} RWY {rwy['rwy']}"
    head, cross = perf.wind_components(runway_bearing(rwy), wind_dir, wind_kt)
    side = "head" if head >= 0 else "tail"
    wind_txt = f"{wind_dir:03d}/{wind_kt:02d}" if wind_kt else "calm"

    print(f"\n{kind.upper()} {icao} - {mass:.0f} lb{note}")
    print(f"  Runway {rwy['rwy']}, wind {wind_txt} ({side}wind {abs(head):.0f} kt, "
          f"crosswind {cross:.0f} kt), OAT {oat:g} C, QNH {qnh:g}")
    print(f"  Pressure altitude {site['pa']:.0f} ft, density altitude "
          f"{site['da']:.0f} ft")

    lookup = perf.takeoff if takeoff else perf.landing
    (roll, total), speeds = lookup(ac["perf"], mass, site["pa"], oat)
    if roll is None:
        print("  Outside the POH table (pressure altitude or temperature too high).")
        return [f"{where}: outside the POH performance table"]
    if takeoff:
        print(f"  Short field, {data['takeoff_note']}: lift off {speeds[0]} KIAS, "
              f"{speeds[1]} KIAS at 50 ft")
    else:
        print(f"  Short field, {data['landing_note']}: {speeds[0]} KIAS at 50 ft")
    print(f"  POH (zero wind, paved): ground roll {roll:.0f} ft, "
          f"50 ft {total:.0f} ft")

    grass, grass_pct = rwy["surface"] == "grass", (0.15 if takeoff else 0.45)
    change = (perf.wind_factor(head) - 1) * 100
    notes = [f"{change:+.1f} % for the {side}wind" if abs(head) >= 0.5
             else "no wind correction"]
    if grass:
        notes.append(f"+{grass_pct:.0%} of the ground roll for grass")
    print("  Corrections: " + ", ".join(notes))
    run, dist = (d * perf.M_PER_FT for d in
                 perf.corrected((roll, total), head, grass, grass_pct))

    problems = []

    def check(label, need, name, available):
        ok = need <= available
        limit = f"{name} ({available:.0f} m)"
        print(f"    {label:17}{need:6.0f} m  {'<' if ok else '>'}  {limit:24}"
              f"{'OK' if ok else 'NOT OK'}")
        if not ok:
            problems.append(f"{where}: {label} {need:.0f} m is more than {limit}")

    if takeoff:
        check("Ground roll", run, "TORA", rwy["tora"])
        check("50 ft clearance", dist, "TODA", rwy["toda"])
        if rwy["toda"] > rwy["tora"] or rwy["asda"] > rwy["tora"]:
            check(f"50 ft x{perf.TODA_FACTOR:g}", dist * perf.TODA_FACTOR,
                  "TODA", rwy["toda"])
            check(f"50 ft x{perf.ASDA_FACTOR:g}", dist * perf.ASDA_FACTOR,
                  "ASDA", rwy["asda"])
        else:
            check(f"50 ft x{perf.TORA_FACTOR:g}", dist * perf.TORA_FACTOR,
                  "TORA/TODA/ASDA", rwy["tora"])
    else:
        check("Ground roll", run, "LDA", rwy["lda"])
        check("50 ft clearance", dist, f"{perf.LDA_FRACTION:.0%} LDA",
              rwy["lda"] * perf.LDA_FRACTION)

    warnings = []
    if -head > perf.MAX_TAILWIND_KT:
        warnings.append(f"tailwind {-head:.0f} kt is more than the "
                        f"{perf.MAX_TAILWIND_KT} kt the POH covers")
    if cross > data["max_crosswind_kt"]:
        warnings.append(f"crosswind {cross:.0f} kt is above the "
                        f"{data['max_crosswind_kt']} kt maximum demonstrated")
    for w in warnings:
        print("  ! " + w)
    return problems + [f"{where}: {w}" for w in warnings]


def climb_report(ac, icao, site, obstacle):
    """Max rate of climb after take-off and the optional obstacle clearance
    (as on the school's sheet). Returns a list of problems."""
    climb = perf.climb(ac["perf"], site["pa"], site["weather"][1])
    if climb is None:
        print("  Rate of climb: outside the POH table.")
        return [f"climb {icao}: outside the POH table"] if obstacle else []
    speed, roc = climb
    print(f"  Max rate of climb {roc:.0f} ft/min at {speed} KIAS "
          "(POH, max weight, flaps up)")
    if not obstacle:
        return []

    nm, obstacle_ft, limit, gs = obstacle
    minutes = nm / gs * 60
    over = AERODROMES[icao]["elevation_ft"] + roc * minutes
    print(f"\nCLEARANCE - obstacle {nm:g} NM from {icao}, {obstacle_ft:.0f} ft")
    print(f"  Vclimb {speed} KIAS, GS {gs:g} kt, rate of climb {roc:.0f} ft/min")
    print(f"  {nm:g} NM at {gs:g} kt = {minutes:.1f} min: climb {roc * minutes:.0f} ft"
          f" -> {over:.0f} ft when reaching the obstacle")
    if limit is not None and over > limit:
        over = limit
        print(f"  Altitude limit {limit:.0f} ft -> cross the obstacle at "
              f"{limit:.0f} ft")
    clearance = over - obstacle_ft
    ok = clearance > 0
    print(f"  Clearance {clearance:.0f} ft  {'OK' if ok else 'NOT OK'}")
    return [] if ok else [f"obstacle after take-off {icao}: clearance "
                          f"{clearance:.0f} ft"]


def main():
    print(f"Departure {DEPARTURE}")
    regs = list(AIRCRAFT)
    for i, reg in enumerate(regs, 1):
        print(f"{i}-{reg}  {AIRCRAFT[reg]['type']}")
    reg = regs[ask("Choose an airplane: ", menu(len(regs)), "1") - 1]
    ac = AIRCRAFT[reg]
    if ac["empty_weight"] is None or ac["empty_moment"] is None:
        print(f"\n{reg}'s basic empty weight and moment are not filled in yet.")
        print("Copy them from the aircraft's weighing report into AIRCRAFT "
              "at the top of this file.")
        return

    print(f"\n{reg} ({ac['type']}) - weights in lb, or add kg (e.g. 80kg). "
          "Enter = empty.")
    loads = [(name, ask(f"{name} - ", weight_lb, "170 or 77kg"), arm, max_lb)
             for name, arm, max_lb in ac["stations"]]

    full = ac["usable_fuel_gal"]
    fuel = ask(f"Usable fuel on board, US gal or add l (Enter = full {full:g} gal) - ",
               lambda t: fuel_gal(t, full), "20 or 75l")

    places = list(AERODROMES)
    print("Destination")
    for i, icao in enumerate(places, 1):
        note = "back to base" if icao == DEPARTURE else AERODROMES[icao]["name"]
        print(f"{i}-{icao}  {note}")
    print(f"{len(places) + 1}-Other")
    n = ask(f"Destination (Enter = {DEPARTURE}) - ",
            menu(len(places) + 1, default=places.index(DEPARTURE) + 1), "1")
    dest = places[n - 1] if n <= len(places) else None
    trip_h = ask(f"Flight time to {dest or 'destination'} (h) - ", hours,
                 "1.5 or 1:30")

    kt = ac["cruise_kt"]
    print(f"Choose an alternate (distance from {DEPARTURE}, time at {kt} kt)")
    for i, icao in enumerate(ALTERNATES, 1):
        ad = AERODROMES[icao]
        nm = ad["nm_from_departure"]
        print(f"{i}-{icao}  {ad['name']:6}{nm:4} nm  {hhmm(nm / kt)}")
    other = len(ALTERNATES) + 1
    print(f"{other}-Other (type the flight time)")
    n = ask("Alternate - ", menu(other), "1")
    if n == other:
        alt_icao, alt = None, "alternate"
        alt_h = ask("Flight time to alternate (h) - ", hours, "0:20")
    else:
        alt_icao = alt = ALTERNATES[n - 1]
        alt_h = AERODROMES[alt]["nm_from_departure"] / kt

    gph = ac["fuel_flow_gph"]
    fuel_arm = ac["fuel_arm"]
    fuel_lb = fuel * FUEL_LB_PER_GAL
    taxi_lb = ac["taxi_fuel_lb"]
    trip_lb = trip_h * gph * FUEL_LB_PER_GAL
    alt_lb = alt_h * gph * FUEL_LB_PER_GAL

    # Build the loading sheet line by line, keeping a running total.
    sheet = []        # (label, mass, arm, moment, is_subtotal)
    conditions = []   # (name, mass, moment, max mass or None)
    total = {"w": 0.0, "m": 0.0}

    def add(label, weight, arm):
        moment = weight * arm / 1000
        total["w"] += weight
        total["m"] += moment
        sheet.append((label, weight, arm, moment, False))

    def subtotal(label, name, max_mass):
        w, m = total["w"], total["m"]
        sheet.append((label, w, m * 1000 / w, m, True))
        conditions.append((name, w, m, max_mass))

    bew, bem = ac["empty_weight"], ac["empty_moment"]
    add("Basic empty mass", bew, bem * 1000 / bew)
    for name, lb, arm, _ in loads:
        if lb:
            add(name, lb, arm)
    subtotal("Zero fuel mass (ZFM)", "ZFM", None)
    add(f"Fuel {fuel:.1f} gal", fuel_lb, fuel_arm)
    subtotal("Ramp mass", "Ramp", ac["max_ramp"])
    add("Taxi fuel", -taxi_lb, fuel_arm)
    subtotal("Take-off mass (TOM)", "TOM", ac["max_takeoff"])
    add(f"Trip fuel {hhmm(trip_h)}", -trip_lb, fuel_arm)
    subtotal("Landing mass (LM)", "LM", ac["max_landing"])
    add(f"Fuel to {alt} {hhmm(alt_h)}", -alt_lb, fuel_arm)
    subtotal(f"Mass at {alt} (ALT)", "ALT", ac["max_landing"])

    print(f"\n{reg}  {ac['type']}  {DEPARTURE} - {dest or 'destination'}")
    print(f"{'':26}{'Mass lb':>9}{'Arm in':>9}{'Moment':>9}")
    for label, weight, arm, moment, is_subtotal in sheet:
        if is_subtotal:
            print("-" * 53)
        print(f"{label:26}{weight:9.1f}{arm:9.2f}{moment:9.1f}")

    problems = []
    print(f"\n{'':6}{'Mass lb':>9}{'CG in':>8}{'CG limits':>16}{'Max lb':>8}")
    for name, weight, moment, max_mass in conditions:
        cg = moment * 1000 / weight
        fwd, aft = forward_limit(ac, weight), ac["cg_aft"]
        status = []
        if max_mass and round(weight, 1) > max_mass:
            status.append(f"OVER MAX by {weight - max_mass:.1f} lb")
        if round(cg, 2) < round(fwd, 2):
            status.append("CG TOO FAR FORWARD")
        if round(cg, 2) > aft:
            status.append("CG TOO FAR AFT")
        problems += [f"{name}: {s}" for s in status]
        limits = f"{fwd:.2f}-{aft:.2f}"
        max_txt = f"{max_mass}" if max_mass else "-"
        print(f"{name:6}{weight:9.1f}{cg:8.2f}{limits:>16}{max_txt:>8}  "
              f"{', '.join(status) or 'OK'}")

    for name, lb, _, max_lb in loads:
        if max_lb and lb > max_lb:
            problems.append(f"{name}: {lb:.0f} lb is over its {max_lb} lb limit")
    baggage = sum(lb for name, lb, _, _ in loads if name.startswith("Baggage"))
    if baggage > ac["max_baggage"]:
        problems.append(f"Baggage: {baggage:.0f} lb in total is over the "
                        f"{ac['max_baggage']} lb limit")
    if fuel > full + 1e-9:
        problems.append(f"Fuel: {fuel:.1f} gal is more than the "
                        f"{full:g} gal usable capacity")

    left_lb = fuel_lb - taxi_lb - trip_lb - alt_lb
    left_min = left_lb / (gph * FUEL_LB_PER_GAL) * 60
    print(f"\nFuel left at {alt}: {left_lb / FUEL_LB_PER_GAL:.1f} gal "
          f"({left_lb:.0f} lb, about {left_min:.0f} min at {gph:g} gal/h)")
    if left_lb < 0:
        problems.append("Fuel: not enough fuel for the trip and the alternate")
    elif left_min < FINAL_RESERVE_MIN:
        problems.append(f"Fuel: less than the {FINAL_RESERVE_MIN} min final "
                        f"reserve left at {alt}")

    # ---------------------------------------------------- performance --
    mass = {name: w for name, w, _, _ in conditions}
    print("\nPERFORMANCE (POH short field)")
    sites, previous, obstacle = {}, None, None
    for icao in dict.fromkeys(i for i in (DEPARTURE, dest, alt_icao) if i):
        missing = missing_data(icao)
        if missing:
            print(f"{icao}: {missing} in aerodromes.py - no runway check there.")
            continue
        sites[icao] = ask_site(icao, previous)
        previous = (icao, sites[icao]["weather"])
        if icao == DEPARTURE:
            climb = perf.climb(ac["perf"], sites[icao]["pa"], previous[1][1])
            if climb:
                obstacle = ask_obstacle(climb[0])

    checks = [("take-off", DEPARTURE, mass["TOM"], ""),
              ("landing", dest, mass["LM"], ""),
              ("take-off", alt_icao, mass["TOM"],
               " (alternate, at TOM as if refuelled)"),
              ("landing", alt_icao, mass["ALT"], " (alternate)")]
    for kind, icao, m, note in checks:
        if icao in sites:
            problems += runway_report(ac, kind, icao, m, sites[icao], note)
            if kind == "take-off" and icao == DEPARTURE:
                problems += climb_report(ac, icao, sites[icao], obstacle)

    if problems:
        print("\nNOT WITHIN LIMITS:")
        for p in problems:
            print("  - " + p)
    else:
        print("\nAll within limits.")


if __name__ == "__main__":
    main()
