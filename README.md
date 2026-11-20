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

**Performance.** It follows the school's performance sheet. For each aerodrome it asks:

- the QNH, OAT and wind (press Enter on the QNH to reuse the previous aerodrome's weather)
- the runway in use (press Enter for the one most into wind)

At departure it also asks about an optional obstacle after take-off. It then works out, from the
POH short-field tables:

- take-off at LPPM with the TOM, the maximum rate of climb, and the obstacle clearance
- landing at the destination with the LM
- take-off at the alternate with the TOM (as if refuelled), and landing there with the mass at the
  alternate

For each one it shows the runway, the head/tail and cross wind, the pressure and density altitude,
the POH figures and the corrections. Then come the same checks as on the sheet:

| | Check |
|---|---|
| Take-off | ground roll < TORA, 50 ft distance < TODA |
| Take-off, runway with clearway or stopway | also 50 ft ×1.15 < TODA and 50 ft ×1.3 < ASDA |
| Take-off, runway without them | also 50 ft ×1.25 < TORA/TODA/ASDA |
| Landing | ground roll < LDA, 50 ft distance < 70 % of LDA |
| Obstacle clearance | altitude at the obstacle = elevation + rate of climb × time to the obstacle at the climb ground speed, capped by the altitude limit, minus the obstacle elevation |

It flags anything outside limits, and also a tailwind above 10 kt or a crosswind above the maximum
demonstrated (12 kt C152, 15 kt C172P).

How the figures are worked out (all in `performance.py`):

- **POH tables:** C152 1980 POH and C172P 1980 POH (rev. 2), Section 5, short-field technique.
  The C172P take-off is interpolated between the 2000, 2200 and 2400 lb tables.
- **Wind:** −10 % for each 9 kt of headwind, +10 % for each 2 kt of tailwind (up to 10 kt), as in
  the POH notes.
- **Grass:** +15 % (take-off) or +45 % (landing) of the ground roll, as in the POH notes.
- **Pressure altitude:** elevation + (1013 − QNH) × 27 ft.
- **Density altitude:** PA + 120 ft for each °C above ISA.
- **Factors:** `TODA_FACTOR`, `ASDA_FACTOR`, `TORA_FACTOR`, `LDA_FRACTION`.
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

1. **Empty weight and moment of each aircraft.** They are in `AIRCRAFT` at the top of
   `mass_and_balance.py`. Update them whenever the aircraft is re-weighed or its equipment
   changes. The script takes the weighing protocol figure (as weighed: defueled, without oil)
   and adds oil and unusable fuel, as in POH figure 6-1:

   | | As weighed | Oil | Unusable fuel | Basic empty weight |
   |---|---|---|---|---|
   | OK-HAD (protocol 014/2023, 30 Mar 2023) | 1154.5 lb, moment 34.58 | 7 qt, 13.1 lb at −14.7 in | 1.5 gal, 9 lb at 40.0 in | **1176.6 lb, moment 34.75, arm 29.53 in** |
   | OK-KUN (protocol of 16 Feb 2024) | 1473 lb, moment 59.32 | 8 qt, 15 lb at −14.0 in | 3 gal, 18 lb at 46.0 in | **1506.0 lb, moment 59.94, arm 39.80 in** |

   OK-HAD uses 7 qt of oil, the POH figure with an oil filter. Without a filter it is 6 qt
   (11.25 lb).
2. **Aerodrome data.** Copy each aerodrome's elevation and runway declared distances (TORA, TODA,
   ASDA, LDA in metres, surface, bearing) into `aerodromes.py`, from the AIP or the VFR Manual
   published by NAV Portugal (ais.nav.pt). Until then the runway checks for that aerodrome are
   skipped. Check the data again every AIRAC cycle.

Also check the arms, limits, fuel capacity and planning fuel flow against each aircraft's own
POH and the school's procedures. To add another alternate, add it to `AERODROMES` with its
distance from LPPM, and its ICAO code to `ALTERNATES`, both in `aerodromes.py`.
