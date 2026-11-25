# Mass and Balance

Mass and balance and take-off / landing performance for the school's two aircraft. It
comes in two versions:

- `web/`: the LPPM Flight web app (HTML, CSS and JavaScript, no build step), made for phones. It
  is the base for a future app.
- `mass_and_balance.py`: the original terminal version.

## Web app

Open `web/index.html` in a browser, or serve the folder so that offline mode also works:

```
cd web
python3 -m http.server 8000      # then open http://localhost:8000
```

It recalculates as you type, keeps your last inputs on the device, and once it has been served
over http(s) and opened once it also works without signal.

It follows the Flying Academy Operations Manual (Rev. 1, Sep 2024):

| Rule | OM reference | What the app does |
|---|---|---|
| Fuel | C 2.1 | Minimum fuel = taxi + trip + alternate + 45 min final reserve. Trip and alternate each include 10 min for the approach and landing. It shows the breakdown and the extra fuel. |
| Take-off | C 1.2 | 50 ft distance ×1.5 ≤ TORA, worked out at the maximum take-off mass |
| Landing | C 1.4 | 50 ft distance ×1.5 ≤ LDA, worked out at the maximum landing mass |
| Basic empty mass | C 3.2.1 | Includes unusable fuel and full oil (the weighing protocols are corrected for this) |
| Student solo (C152 with the instructor seat empty) | A 5.2.4, A 5.x | TORA at least 600 m, landing distance ×1.67 ≤ LDA, crosswind including gusts within the student's limit (50 % of the maximum demonstrated unless the instructor raised it, up to 100 %), at most 3 h in the C152 / 3.5 h in the C172 |
| Crosswind with a student as PIC, gusts included | C 1.4 | Flags anything above the maximum demonstrated, compared in whole knots as shown (12 kt is within a 12 kt maximum, 13 kt is not) |
| Contaminated runway | A 5.2.4 | Tick it per aerodrome. Solo landing then uses ×1.92, and a note says the POH distances are for a dry runway. |
| Student solo weather minima | C 5 | Visibility and ceiling at every aerodrome on the route. Local flight: 5 km and 1500 ft AGL. Cross-country: 8 km and 2000 ft AGL. |
| Stops on the way | C 2.1 | A route can have up to 4 landings before the destination (e.g. LPPM → LPEV → LPSO → LPPM), each with its flight time, time on the ground (default 30 min), alternate (default: back where the leg started) and whether you refuel there (only where AIP AD 2.4 lists AVGAS: LPPM, LPEV, LPCS). Every leg is checked at its take-off: taxi + trip + alternate + 45 min reserve, with the fuel carried from the last refuelling. The app says the least to load at each place you refuel, and checks mass and CG at every take-off and landing. The daylight check adds the legs and ground times; the solo maximum flight time counts all legs. |
| Daylight | A (risk register) | Sunset at the destination, worked out from its position and the date. Cross-country flights land 30 min before sunset. With a take-off time (UTC) it checks the planned landing, warns if a diversion to the alternate would land after sunset, and warns about a take-off before sunrise. It also shows when night starts (end of civil twilight). Sun times are within 2 min of NAV Portugal's sunrise/sunset tables. |

Under every take-off it also gives the **departure briefing** in the order of the school's C172P SOP
(departure crew briefing): runway, TORA / TORR, obstacles (yes, naming the one cleared by the least,
or nil), wind and crosswind, which way to hold the ailerons, Vr, Vy / Vx, climb speed and the
engine-failure speed. The speeds are in `departure` for each aircraft in `js/data.js`, from the
school's SOPs: the 172 (rotate 55 KIAS, climb 70–80 KIAS to 500 ft AGL, engine failure 65 KIAS flaps
up / 60 flaps down) and the 152 (rotate 50 KIAS, climb 65–75 KIAS to 500 ft AGL). For an engine
failure after take-off in the 152 the app gives the POH's 60 KIAS: the C152 SOP says 65 flaps up /
60 flaps down, and the SOP says the POH applies where they differ. The take-off results also say that the POH distances are for the short-field
technique (flaps 10°), so a normal take-off needs more runway.

Under every landing there is a **landing briefing** in the order of the SOP's arrival briefing:
runway, LDA / LDR, wind and crosswind, runway surface (contaminated, slope), obstacles under the
approach (the highest one the AIP lists), then the SOP speeds: final approach (152: 60–70 KIAS flaps
up, 55–65 flaps down; 172: 65–75 and 60–70, the same as POH section 4), the POH short-field speed,
touchdown 50–55 KIAS, the 200 ft AGL stabilized call and the go-around (POH balked landing: full
power, flaps 20°, 55 KIAS). The speeds are in `arrival` for each aircraft in `js/data.js`. The landing
results also say that a normal approach needs more runway than the POH short-field figures.

**Print.** The Print button under the result (or the browser's own print) gives an A4 sheet in
light colours, also in dark mode: a header with the aircraft, date, take-off time, route, flight
times, alternates, fuel and the rules used, then the result, loading sheet, CG chart and limits, fuel
by leg, the METARs, TAFs and IPMA station readings for the route (TAFs printed open), the performance
with the open briefings, and lines for the pilot in command, signature and instructor. The inputs,
buttons, NOTAM link and method notes are left out. A local flight with an alternate is four pages. The print layout is the
`@media print` block at the end of `styles.css`.

**PDF, and printing from an iPhone or iPad home-screen app.** A web app opened from the home screen
on iOS / iPadOS has no print dialog (`window.print()` does nothing), so there the button makes a PDF
instead: the page is laid out with the same print styles, drawn page by page into images with
[html2canvas](https://html2canvas.hertzen.com) 1.4.1 (MIT, `vendor/html2canvas.min.js`, loaded only
when needed and kept offline), and put into an A4 PDF by `js/pdf.js` (one image per page, page numbers
at the foot). Pages break between rows and boxes, never through one. When it's ready, a button opens
the share sheet (Print, Save to Files, Mail); iOS only allows that straight after a tap, so it's a
second tap. In a browser the summary has Print and Save PDF; Save PDF downloads the same file where
there's no share sheet. Before printing or making the PDF, the CG chart is drawn again at its printed
width (half the page), so its text isn't tiny when printing from a wide screen.

The previous school's sheet (EASA class B factors: ×1.15 TODA, ×1.3 ASDA or ×1.25 TORA, 70 % of
LDA) is still there as an option. The alternate leg is measured from the destination, using the
aerodrome reference points in `js/data.js`. LPPM's position and elevation come from NAV Portugal's sunrise/sunset tables. LPFR and LPBJ coordinates
still need checking against the AIP.

On top of the terminal version it adds:

- the CG moment envelope chart, like the one in POH section 6
- a summary at the top, with problems marked in red and checks it could not do in amber

| File | What it holds |
|---|---|
| `js/data.js` | Aircraft (weighing, arms, limits, fuel) and aerodromes (AIP data). The file to keep up to date. |
| `js/poh.js` | POH section 5 tables |
| `js/calc.js` | All the calculations, no page code |
| `js/app.js` | The page |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline mode and "Add to Home Screen" |

Tests (Node 18 or newer):

```
node --test "web/tests/*.test.js"
```

The tests compare the results with:

- the POH sample problem
- the OM rules
- the previous school's performance sheet
- the Python version

**Install on a phone (GitHub Pages).** `.github/workflows/pages.yml` publishes `web/` to
<https://tomasriscadosantos-hub.github.io/Mass-and-balance-/>. It does this every time something
in `web/` changes on the default branch, after the tests pass. You can also start it by hand from
the Actions tab ("Deploy web app", "Run workflow"). One-time setup in the repository settings:

1. Pages needs a public repository, or a paid GitHub plan for a private one. The published site
   is public either way.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.

Then open the address on the phone:

- iPhone: Safari → Share → Add to Home Screen.
- Android: Chrome → menu → Install app.

Once opened, it also works without signal. After an update (a new `VERSION` in `web/sw.js`) the
app loads the new version by itself the next time it comes on screen with signal, keeping the
inputs.

**Weather and NOTAMs.** The deploy workflow also runs every 15 minutes. It downloads the latest
METARs and TAFs for the app's aerodromes from aviationweather.gov, and the latest readings of the
IPMA automatic stations at LPPM (878), LPEV (843) and LPSO (817) from ema.ipma.pt. It publishes
them with the app as `weather.json`, because these services don't let web pages on other sites read
them directly. In the app, the Weather and NOTAMs panel shows each report with its age:

- **IPMA station (LPPM, LPEV, LPSO):** the 10-minute mean wind, the 10-minute maximum, QNH and
  temperature. **Fill** puts them into that aerodrome's weather fields (the maximum goes in Gust).
  **Live wind on IPMA** opens the station's page, which is newer than the app's copy (up to about
  25 minutes old). The stations measure no visibility or cloud.
- **Nearest METAR:** LPPM and LPEV publish no METAR, so the panel shows the nearest one (LPFR,
  LPBJ) and offers only its visibility and ceiling, as a guide.
- **Fill (LPFR, LPBJ):** puts the METAR's values (QNH, OAT, wind and gusts, visibility, ceiling)
  into that aerodrome's weather fields.
- **NOTAMs in IPPC:** copies the route's ICAO codes and opens IPPC (ippc.no) to paste them into the
  aerodrome briefing. IPPC has no data service the app could read NOTAMs from.

None of this replaces the official briefing.

**Live weather relay.** GitHub's scheduled runs are often late or skipped, so `weather.json` can be
old. `worker/` is a small Cloudflare Worker (free plan) that downloads the same weather live when
the app asks, reusing a copy for up to a minute. The app asks the relay first and fills in anything
missing from `weather.json`; with no relay set, or when it can't be reached, it uses `weather.json`
alone. `worker/weather.mjs` is the download itself, shared with the deploy workflow. To deploy or
update the relay: `CLOUDFLARE_API_TOKEN=... worker/deploy.sh` (an API token made with Cloudflare's
"Edit Cloudflare Workers" template), then put the address it prints in `WEATHER_RELAY` in
`web/js/data.js`. If the relay's aerodromes change, update `ICAOS` and `STATIONS` in
`worker/index.mjs` too (a test checks they match `data.js`).

**What's new.** After an update the app shows, once, a note with what changed; "What's new" at the
bottom of the page opens it again. The notes are in `web/js/changes.js`. When publishing a change,
add an entry at the top with the next id, and bump `VERSION` in `web/sw.js`.

**Towards an app.** For the App Store or Google Play the same folder can be wrapped with
Capacitor, which uses it as the app's content.

**Two copies of the data.** Aircraft and aerodrome data is in `web/js/data.js` and also in the
Python files. Update both, or retire the Python version.

## Terminal version

The original version. It uses the OM fuel rules (45 min reserve, 10 min approach allowances). Its
runway checks still use the previous school's sheet, it has none of the student solo rules, and it
measures the alternate leg from LPPM only. For planning by the OM, use the web app.

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

- Weights: lb (`170`) or kg (`77kg`). It asks for the student, the instructor and the two
  baggage areas. The C172 is always flown with two people, so both seats must be filled in. In
  the C152, press Enter on the instructor for a solo flight. Press Enter on a baggage area to
  leave it empty.
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
   | OK-HAD (protocol 014/2023, 30 Mar 2023) | 1154.5 lb, moment 34.58 | 6 qt, 11.25 lb at −14.7 in | 1.5 gal, 9 lb at 40.0 in | **1174.75 lb, moment 34.77, arm 29.60 in** |
   | OK-KUN (protocol of 16 Feb 2024) | 1473 lb, moment 59.32 | 8 qt, 15 lb at −14.0 in | 3 gal, 18 lb at 46.0 in | **1506.0 lb, moment 59.94, arm 39.80 in** |

   Oil quantities:
   - OK-HAD: 6 qt (no oil filter).
   - OK-KUN: 8 qt, full oil, as the OM defines the basic empty mass.
2. **Aerodrome data.** In the web app it is in `web/js/data.js`, in the terminal version in
   `aerodromes.py`. Where it stands:

   | Aerodrome | Source | Elevation | Runway (true bearing) | TORA / TODA / ASDA / LDA (m) |
   |---|---|---|---|---|
   | LPPM Portimão | VFR Manual AD 2-LPPM (20-MAR-2025) | 5 ft | 11/29, 860 × 27 asphalt (107.5°/287.5°*) | 11: 770/770/860/860 · 29: 860/860/860/770 |
   | LPFR Faro | AIP AD 2 (AIRAC 008-26) | 24 ft | 10/28, 2490 × 45 asphalt (100.07°/280.07°) | both: 2490/2645/2490/2445 |
   | LPEV Évora | AIP AD 2 (AIRAC 008-26) | 807 ft | 01/19, 1300 × 23 asphalt (4.25°/184.25°) | 01: 1260/1300/1300/1245 · 19: 1245/1300/1300/1260 |
   | LPBJ Beja | AIP AD 2 (AIRAC 007-26) | 636 ft | 01L/19R, 3450 × 60 concrete (5.93°/185.93°) | 01L: 3450/3815/3450/3450 · 19R: 3450/4040/3450/3450 |
   | LPSO Ponte de Sor | AIP AD 2 (AIRAC 007-26) | 390 ft | 03/21, 1800 × 30 asphalt (24°/204°*) | both: 1800/1800/1800/1800 |
   | LPCS Cascais | AIP AD 2 (AIRAC 006-26) | 326 ft | 17/35, 1400 × 30 asphalt (164.08°/344.08°), slopes down to the south about 0.9 % | 17: 1540/1645/1540/1210 · 35: 1480/1540/1540/1400 (TORAs include 140 m starter extensions) |

   \* Published as not available: worked out from the threshold coordinates (the same method
   gives Faro's published 100.07° exactly). Left out: Évora's sand runway 07/25 (no POH data for
   sand) and Beja's 01R/19L (taxiing only). The data is in `web/js/data.js` and in
   `aerodromes.py`; check it again every AIRAC cycle.

   **Obstacles** (web app only), from AD 2.10:
   - LPPM: 5 obstacles under the RWY 29 approach, so under the RWY 11 climb-out. No positions
     are published, so they are placed on the extended centre line, with distances from THR 29
     (the end of RWY 11's take-off run). That is up to 90 m closer than from the runway end,
     so on the safe side. The water reservoir has no published elevation, so it is listed but
     not checked.
   - LPFR: AD 2.10 refers to the Type A obstacle chart (AD 2.24.04-1); distances read from the
     chart, about ±50 m.
   - LPEV (1), LPBJ (11), LPSO (7), LPCS (5): with positions. LPSO's power lines have only
     "DIST 650 M", so they are checked on the extended centre line in both directions.
   - LPCS slopes: RWY 17's climb-out heights are measured from its low south end (88 m), and
     the app notes the slope where the POH distances will be longer (uphill take-off on 35,
     downhill landing on 17); the POH has no slope correction.

   Each runway also has `toraEnd`, where its take-off run ends (a threshold or runway end from
   AD 2.12): the obstacles' distances are measured from there. A test checks that every take-off
   run starts within 100 m of where its TORA says.

Also check the arms, limits, fuel capacity and planning fuel flow against each aircraft's own
POH and the school's procedures. To add another alternate, add it to `AERODROMES` with its
distance from LPPM, and its ICAO code to `ALTERNATES`, both in `aerodromes.py`.
