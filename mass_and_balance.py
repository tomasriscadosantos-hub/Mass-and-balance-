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
  1. Copy each aircraft's basic empty weight and moment from its CURRENT
     weighing report into AIRCRAFT below (left as None on purpose, so the
     program refuses to run with made-up numbers).
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
        # From OK-HAD's weighing report. If the report gives an arm instead
        # of a moment: moment = weight x arm / 1000.
        "empty_weight": None,     # lb
        "empty_moment": None,     # lb-in/1000
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
        "empty_weight": None,     # lb
        "empty_moment": None,     # lb-in/1000
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


def runway_check(ac, kind, icao, mass, weather):
    """Print take-off or landing distances for every runway at icao.
    Returns a list of problems (empty if at least one runway is fine)."""
    ad = AERODROMES[icao]
    qnh, oat, wind_dir, wind_kt = weather
    pa = perf.pressure_altitude(ad["elevation_ft"], qnh)
    data = perf.TYPES[ac["perf"]]
    takeoff = kind == "take-off"
    lookup = perf.takeoff if takeoff else perf.landing
    (roll, total), speeds = lookup(ac["perf"], mass, pa, oat)

    wind_txt = f"{wind_dir:03d}/{wind_kt:02d}" if wind_kt else "calm"
    print(f"\n{kind.upper()} {icao} - {mass:.0f} lb, elevation "
          f"{ad['elevation_ft']} ft, QNH {qnh:g}, PA {pa:.0f} ft, "
          f"OAT {oat:g} C, wind {wind_txt}")
    if roll is None:
        print("  Outside the POH table (pressure altitude or temperature too "
              "high) - no figures.")
        return [f"{kind} {icao}: outside the POH performance table"]

    if takeoff:
        factor, grass_pct = perf.TAKEOFF_FACTOR, 0.15
        print(f"  Short field, {data['takeoff_note']}: lift off {speeds[0]} "
              f"KIAS, {speeds[1]} KIAS at 50 ft")
        print(f"  POH (zero wind, paved): ground roll {roll:.0f} ft, "
              f"to 50 ft {total:.0f} ft")
        print(f"  {'RWY':5}{'Wind kt':>10}{'Run m':>8}{'TORA':>7}"
              f"{'To 50ft m':>11}{'TODA':>7}")
    else:
        factor, grass_pct = perf.LANDING_FACTOR, 0.45
        print(f"  Short field, {data['landing_note']}: {speeds[0]} KIAS "
              "at 50 ft")
        print(f"  POH (zero wind, paved): ground roll {roll:.0f} ft, "
              f"from 50 ft {total:.0f} ft")
        print(f"  {'RWY':5}{'Wind kt':>10}{'From 50ft m':>13}{'LDA':>7}")

    usable = []
    for rwy in ad["runways"]:
        bearing = rwy.get("bearing")
        if bearing is None:
            bearing = int(rwy["rwy"][:2]) * 10
        head, cross = perf.wind_components(bearing, wind_dir, wind_kt)
        run, dist = perf.corrected((roll, total), head, rwy["surface"] == "grass",
                                   grass_pct)
        run, dist = (x * factor * perf.M_PER_FT for x in (run, dist))

        status = []
        if -head > perf.MAX_TAILWIND_KT:
            status.append(f"tailwind over {perf.MAX_TAILWIND_KT} kt")
        if cross > data["max_crosswind_kt"]:
            status.append(f"crosswind over the {data['max_crosswind_kt']} kt "
                          "demonstrated")
        if takeoff and run > rwy["tora"]:
            status.append("TORA too short")
        if takeoff and dist > rwy["toda"]:
            status.append("TODA too short")
        if not takeoff and dist > rwy["lda"]:
            status.append("LDA too short")
        if not status:
            usable.append(rwy["rwy"])

        wind_col = f"{'H' if head >= 0 else 'T'}{abs(head):.0f} X{cross:.0f}"
        verdict = ", ".join(status) or "OK"
        if takeoff:
            print(f"  {rwy['rwy']:5}{wind_col:>10}{run:8.0f}{rwy['tora']:7}"
                  f"{dist:11.0f}{rwy['toda']:7}  {verdict}")
        else:
            print(f"  {rwy['rwy']:5}{wind_col:>10}{dist:13.0f}{rwy['lda']:7}  "
                  f"{verdict}")

    grass = any(r["surface"] == "grass" for r in ad["runways"])
    print(f"  (wind{', grass' if grass else ''} corrections and the "
          f"x{factor:g} safety factor included; H = head, T = tail, X = cross)")

    if takeoff:
        climb = perf.climb(ac["perf"], pa, oat)
        if climb:
            print(f"  Max rate of climb: {climb[1]:.0f} ft/min at {climb[0]} "
                  "KIAS (POH, max weight, flaps up)")
    if not usable:
        return [f"{kind} {icao}: no runway within limits"]
    return []


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
    checks = [("take-off", DEPARTURE, mass["TOM"]),
              ("landing", dest, mass["LM"]),
              ("landing at alternate", alt_icao, mass["ALT"])]
    checks = [c for c in checks if c[1]]        # skip "Other" places
    print(f"\nPERFORMANCE (POH short field; safety factor x{perf.TAKEOFF_FACTOR:g} "
          f"take-off, x{perf.LANDING_FACTOR:g} landing)")
    weather, previous = {}, None
    for icao in dict.fromkeys(c[1] for c in checks):
        missing = missing_data(icao)
        if missing:
            print(f"{icao}: {missing} in aerodromes.py - no runway check there.")
            continue
        weather[icao] = ask_weather(icao, previous)
        previous = (icao, weather[icao])
    for kind, icao, m in checks:
        if icao in weather:
            problems += runway_check(ac, kind, icao, m, weather[icao])

    if problems:
        print("\nNOT WITHIN LIMITS:")
        for p in problems:
            print("  - " + p)
    else:
        print("\nAll within limits.")


if __name__ == "__main__":
    main()
