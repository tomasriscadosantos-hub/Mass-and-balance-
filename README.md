# Mass and Balance

A terminal calculator for the school's two aircraft. It does the mass and balance and the
take-off and landing performance.

| Aircraft | Type        |
|----------|-------------|
| OK-HAD   | Cessna 152  |
| OK-KUN   | Cessna 172P |

```
python3 mass_and_balance.py
```

## What it does

**Mass and balance.** Every flight departs from **LPPM (Portimão)**. The script asks for the
people, baggage, fuel, destination (Enter for back to LPPM) and flight time. Then you pick an
alternate: LPFR (Faro, 31 nm), LPEV (Évora, 89 nm), or type the time yourself. The time to the
alternate comes from its distance from LPPM and the aircraft's planning cruise speed (90 kt for
the C152, 100 kt for the C172P). It prints a loading sheet (mass, arm, moment) and checks these
masses against the maximum masses and the CG envelope:

- ZFM
- ramp mass
- take-off mass (TOM)
- landing mass (LM)
- mass at the alternate

It also shows how much fuel is left at the alternate.

**Performance.** It asks for the QNH, OAT and wind at each aerodrome. Press Enter on the QNH to
reuse the previous aerodrome's weather. It then works out these figures from the POH
short-field tables:

- take-off at LPPM with the TOM
- landing at the destination with the LM
- landing at the alternate with the mass there

For every runway it shows:

- the headwind or tailwind and the crosswind
- the take-off run against TORA, and the distance to 50 ft against TODA
- the landing distance from 50 ft against LDA
- the maximum rate of climb at departure

It flags anything outside limits.

How the performance figures are worked out (all in `performance.py`):

- **POH tables:** C152 1980 POH and C172P 1980 POH (rev. 2), Section 5, short-field technique.
  The C172P take-off is interpolated between the 2000, 2200 and 2400 lb tables.
- **Wind:** −10 % for each 9 kt of headwind, +10 % for each 2 kt of tailwind (up to 10 kt), as in
  the POH notes.
- **Grass:** +15 % (take-off) or +45 % (landing) of the ground roll, as in the POH notes.
- **Safety factors:** ×1.33 on take-off and ×1.43 on landing (UK CAA Safety Sense 7). Set
  `TAKEOFF_FACTOR` / `LANDING_FACTOR` to `1.0` to compare plain POH numbers.
- **Crosswind:** flagged above the maximum demonstrated (12 kt C152, 15 kt C172P).
- **Pressure altitude:** elevation + (1013 − QNH) × 30 ft.
- **Reading the tables:** values between table entries are interpolated. Set `NEXT_HIGHER = True`
  to read the table at the next higher weight, altitude and temperature instead, the
  conservative method the POH uses in its sample problem.

**Input formats.**

- Weights: lb (`170`) or kg (`77kg`). Press Enter on a seat or baggage area to leave it empty.
- Fuel: US gal (`20`) or litres (`75l`). Press Enter for full tanks.
- Times: `1.5` or `1:30`.
- Wind: `270/10`. Press Enter for calm.

## Before first use

Some data is **left blank on purpose**, so the program never runs on made-up numbers:

1. **Empty weight and moment of each aircraft.** Copy them from that aircraft's current
   weighing report into `AIRCRAFT` at the top of `mass_and_balance.py`. Until then the program
   stops for that aircraft.
   - OK-KUN: done (weighing of 16 Feb 2024: 1473 lb, arm 40.27 in, moment 59317 lb-in).
   - OK-HAD: still to fill in.

   Update them whenever the aircraft is re-weighed or its equipment changes.
2. **Aerodrome data.** Copy each aerodrome's elevation and runway declared distances (TORA, TODA,
   LDA in metres, surface, bearing) into `aerodromes.py`, from the AIP or the VFR Manual
   published by NAV Portugal (ais.nav.pt). Until then the runway checks for that aerodrome are
   skipped. Check the data again every AIRAC cycle.

Also check the arms, limits, fuel capacity and planning fuel flow against each aircraft's own
POH and the school's procedures. To add another alternate, add it to `AERODROMES` with its
distance from LPPM, and its ICAO code to `ALTERNATES`, both in `aerodromes.py`.
