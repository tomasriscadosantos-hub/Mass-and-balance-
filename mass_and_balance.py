#!/usr/bin/env python3
"""
Mass & balance calculator for OK-HAD (Cessna 152) and OK-KUN (Cessna 172P).

Units follow the Cessna POH: pounds (lb), inches (in), moments in lb-in/1000.
You can also type weights in kg ("80kg") and fuel in litres ("60l").
Flight times can be decimal hours ("1.5") or hours:minutes ("1:30").

BEFORE USING THIS FOR A REAL FLIGHT:
  1. Copy each aircraft's basic empty weight and moment from its CURRENT
     weighing report into AIRCRAFT below (left as None on purpose, so the
     program refuses to run with made-up numbers).
  2. Check the arms, limits, fuel capacity and fuel flow against that
     aircraft's own POH / flight manual and your school's procedures.
"""

LB_PER_KG = 2.20462
LITRES_PER_GAL = 3.78541
FUEL_LB_PER_GAL = 6.0     # AVGAS, as used in the POH
FINAL_RESERVE_MIN = 30    # VFR day final reserve; use 45 at night

DEPARTURE = "LPPM"        # Portimao - every flight starts here
# Alternates: (ICAO, name, straight-line distance from LPPM in nm).
# The flight time is worked out from each aircraft's cruise_kt.
ALTERNATES = [
    ("LPFR", "Faro", 31),
    ("LPBJ", "Beja", 64),
]

AIRCRAFT = {
    "OK-HAD": {
        "type": "Cessna 152",
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
        "usable_fuel_gal": 24.5,  # standard tanks (long range: 37.5)
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
        "usable_fuel_gal": 40.0,  # standard tanks
        "fuel_flow_gph": 9.0,     # planning figure, 9 gal/h = 54 lb/h
        "cruise_kt": 100,
        "taxi_fuel_lb": 7,
        "max_ramp": 2407,
        "max_takeoff": 2400,
        "max_landing": 2400,
        # Normal category: forward limit 35.0 in at 1950 lb or less, straight
        # line to 38.5 in at 2400 lb; aft limit 47.3 in at all weights.
        "cg_forward": [(1950, 35.0), (2400, 38.5)],
        "cg_aft": 47.3,
    },
}


# ------------------------------------------------------------------ input --

def to_number(text):
    return float(text.replace(",", "."))   # accept 1,5 as well as 1.5


def ask(prompt, convert, example):
    """Ask until convert(text) returns a number that isn't negative."""
    while True:
        text = input(prompt).strip().lower().replace(" ", "")
        try:
            value = convert(text)
        except ValueError:
            print(f"  Didn't understand that - try something like {example}")
            continue
        if value < 0:
            print("  Can't be negative.")
            continue
        return value


def menu(count):
    """Converter for ask(): a menu number from 1 to count."""
    def convert(text):
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


# ------------------------------------------------------------ calculation --

def forward_limit(ac, weight):
    (w1, cg1), (w2, cg2) = ac["cg_forward"]
    if weight <= w1:
        return cg1
    return cg1 + (cg2 - cg1) * (weight - w1) / (w2 - w1)


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
    trip_h = ask("Flight time (h) - ", hours, "1.5 or 1:30")

    kt = ac["cruise_kt"]
    print(f"Choose an alternate (distance from {DEPARTURE}, time at {kt} kt)")
    for i, (icao, name, nm) in enumerate(ALTERNATES, 1):
        print(f"{i}-{icao}  {name:6}{nm:4} nm  {hhmm(nm / kt)}")
    other = len(ALTERNATES) + 1
    print(f"{other}-Other (type the flight time)")
    n = ask("Alternate - ", menu(other), "1")
    if n == other:
        alt = "alternate"
        alt_h = ask("Flight time to alternate (h) - ", hours, "0:20")
    else:
        alt, _, nm = ALTERNATES[n - 1]
        alt_h = nm / kt

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

    print(f"\n{reg}  {ac['type']}  departing {DEPARTURE}")
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

    if problems:
        print("\nNOT WITHIN LIMITS:")
        for p in problems:
            print("  - " + p)
    else:
        print("\nAll within limits.")


if __name__ == "__main__":
    main()
