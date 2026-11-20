# Mass and Balance

A terminal calculator for the school's two aircraft:

| Aircraft | Type        |
|----------|-------------|
| OK-HAD   | Cessna 152  |
| OK-KUN   | Cessna 172P |

```
python3 mass_and_balance.py
```

Every flight departs from **LPPM (Portimão)**. It asks for the people, baggage, fuel and flight
time, then has you pick an alternate: LPFR (Faro, 31 nm) or LPBJ (Beja, 64 nm), or type the time
yourself. The alternate's flight time comes from its distance from LPPM and the aircraft's
planning cruise speed (90 kt for the C152, 100 kt for the C172P). Then it prints a
loading sheet (mass, arm, moment) and checks the ZFM, ramp mass, TOM, LM and mass at the
alternate against the maximum masses and the CG envelope. It also shows how much fuel is
left at the alternate.

Weights can be typed in lb (`170`) or kg (`77kg`). Fuel can be typed in US gal (`20`) or
litres (`75l`). Times can be typed as `1.5` or `1:30`. Press Enter on a seat or baggage
area to leave it empty, or on fuel for full tanks.

## Before first use

Each aircraft's **basic empty weight and moment are left blank on purpose**. Copy them
from that aircraft's current weighing report into `AIRCRAFT` at the top of
`mass_and_balance.py`. Also check the arms, limits, fuel capacity and planning fuel flow
against the aircraft's own POH and the school's procedures. To add another alternate, add
a line to `ALTERNATES` with its ICAO code, name and distance from LPPM in nm.
