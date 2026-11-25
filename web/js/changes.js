/*
 * What's new: one entry per update of the app, newest first.
 *
 * After an update the app shows, once, the entries this phone hasn't seen
 * yet; "What's new" at the bottom of the page shows them all again. When you
 * publish a change the pilots should know about, add an entry at the top with
 * the next id, and bump VERSION in sw.js.
 */
(function (root) {
  "use strict";

  var CHANGES = [
    {
      id: 16,
      date: "2026-11-25",
      items: [
        {
          title: "Print from the iPad and iPhone app",
          text: "From the home screen, an iPad or iPhone app can't open the print dialog, so the button did " +
            "nothing. Now it makes a PDF of the printout and opens the share sheet: choose Print, Save to " +
            "Files or Mail. In Safari and on a computer, Print works as before, and Save PDF makes the same PDF.",
        },
        {
          title: "Chart readable on paper",
          text: "The CG chart is drawn again at its printed size before printing, so its numbers aren't tiny " +
            "when you print from an iPad or a computer.",
        },
      ],
    },
    {
      id: 15,
      date: "2026-11-24",
      items: [
        {
          title: "Crosswind at the limit",
          text: "Crosswind and tailwind are now compared in whole knots, as shown: 12 kt of crosswind is " +
            "within the 152's 12 kt maximum demonstrated, 13 kt is not. Before, 12.1 kt showed as 12 kt " +
            "and was flagged. Required runway distances are shown rounded up.",
        },
      ],
    },
    {
      id: 14,
      date: "2026-11-24",
      items: [
        {
          title: "METAR and TAF in the printout",
          text: "The printout now has the weather for your route: the IPMA station readings, METARs and TAFs " +
            "(the TAFs printed in full), with their times. Download the latest weather before you print.",
        },
      ],
    },
    {
      id: 13,
      date: "2026-11-24",
      items: [
        {
          title: "Print",
          text: "The Print button under the result prints the mass and balance, CG chart, fuel and performance " +
            "with the briefings on A4, or saves them as a PDF. The sheet starts with the aircraft, date, route, " +
            "flight times, alternate and fuel, and ends with lines to sign. On an iPhone or iPad, if the button " +
            "does nothing in the home-screen app, open the app in Safari and use Share → Print.",
        },
      ],
    },
    {
      id: 12,
      date: "2026-11-24",
      items: [
        {
          title: "Landing briefing",
          text: "Every landing now ends with a briefing in the order of the SOP's arrival briefing: runway, " +
            "LDA and the distance you need, wind and crosswind, runway surface, obstacles under the approach, " +
            "then the SOP approach speeds (flaps up and down), touchdown 50–55 KIAS, the 200 ft stabilized " +
            "call and the go-around. The landing results also say that a normal approach needs more runway " +
            "than the POH's short-field figures.",
        },
      ],
    },
    {
      id: 11,
      date: "2026-11-24",
      items: [
        {
          title: "C152 SOP",
          text: "The 152's departure briefing now follows the school's C152 SOP: rotate 50 KIAS, climb " +
            "65–75 KIAS to 500 ft. For an engine failure after take-off it gives the POH's 60 KIAS: the SOP " +
            "says 65 flaps up / 60 flaps down, and the SOP itself says to follow the POH where they differ.",
        },
      ],
    },
    {
      id: 10,
      date: "2026-11-24",
      items: [
        {
          title: "Departure briefing",
          text: "Every take-off now ends with the briefing in the SOP's order: runway, TORA and the distance " +
            "you need, obstacles, wind and crosswind, which way to hold the ailerons, Vr, Vy/Vx, climb speed " +
            "and the engine-failure speed. You add the turn after departure and the initial altitude.",
        },
        {
          title: "Short-field figures",
          text: "The take-off distances are the POH's short-field figures (flaps 10°). The app now says so: a " +
            "normal take-off (172 SOP: flaps 0°, rotate 55 KIAS) needs more runway.",
        },
      ],
    },
    {
      id: 9,
      date: "2026-11-24",
      items: [
        {
          title: "Fuel past what the tanks hold",
          text: "When a route needs more fuel than the tanks hold (24.5 gal in the 152, 40 in the 172), it's " +
            "now a limit that says so, with what to change: a nearer alternate or a refuelling stop.",
        },
        {
          title: "Left column scrolls on its own",
          text: "On an iPad, the inputs scroll separately from the results.",
        },
      ],
    },
    {
      id: 8,
      date: "2026-11-24",
      items: [
        {
          title: "Stops on the way",
          text: "Plan a cross-country with landings, e.g. Évora then Ponte de Sor and back. Each stop has its " +
            "flight time, time on the ground, alternate, and whether you refuel there.",
        },
        {
          title: "Fuel leg by leg",
          text: "Every take-off is checked with the fuel carried from the last refuelling, and the app tells " +
            "you the least to load: e.g. at Évora, enough to get to Ponte de Sor and back.",
        },
        {
          title: "Where there's AVGAS",
          text: "Portimão, Évora and Cascais. Faro and Beja have JET A1 only, Ponte de Sor no fuel.",
        },
      ],
    },
    {
      id: 7,
      date: "2026-11-22",
      items: [
        {
          title: "Cascais (LPCS)",
          text: "New destination, with its runway, obstacles and METAR/TAF from the AIP. Its runway " +
            "slopes about 0.9 %: the app notes it where the POH distances will be longer.",
        },
      ],
    },
    {
      id: 6,
      date: "2026-11-22",
      items: [
        {
          title: "Obstacles from the AIP",
          text: "Every take-off now checks the obstacles the AIP lists in its path: your altitude over each " +
            "one and the clearance. Landings list the obstacles under the approach.",
        },
        {
          title: "Your own obstacle",
          text: "Still there for a crane from a NOTAM, now measured from the end of the runway. The " +
            "ground speed comes from the wind.",
        },
      ],
    },
    {
      id: 5,
      date: "2026-11-22",
      items: [
        {
          title: "Every runway checked",
          text: "Faro, Évora, Beja and Ponte de Sor now have their runway lengths from the AIP, so " +
            "take-off and landing are checked against them at every aerodrome.",
        },
      ],
    },
    {
      id: 4,
      date: "2026-11-22",
      items: [
        {
          title: "Portimão runway lengths",
          text: "From the VFR Manual: RWY 11 TORA 770 m, LDA 860 m; RWY 29 TORA 860 m, LDA 770 m " +
            "(displaced threshold). Take-off and landing at LPPM are now checked against them.",
        },
        {
          title: "Ponte de Sor (LPSO)",
          text: "New destination, with its IPMA station's live wind. Its runway lengths aren't in the " +
            "app yet, so those checks wait for the AIP.",
        },
        {
          title: "Station sensor gaps",
          text: "When an IPMA station misses a reading, the app now uses its last complete one.",
        },
      ],
    },
    {
      id: 3,
      date: "2026-11-21",
      items: [
        {
          title: "How old is the weather?",
          text: "The weather panel shows when the app last downloaded it. Refresh says whether anything " +
            "newer has arrived, and opening the app fetches the latest by itself.",
        },
      ],
    },
    {
      id: 2,
      date: "2026-11-21",
      items: [
        {
          title: "New name: LPPM Flight",
          text: "The icon on your home screen keeps its old name until you add the app again from Safari.",
        },
        {
          title: "Updates arrive by themselves",
          text: "When there's a new version, the app loads it as soon as you open it. Your inputs stay.",
        },
      ],
    },
    {
      id: 1,
      date: "2026-11-21",
      items: [
        {
          title: "Live wind at Portimão and Évora",
          text: "The weather panel shows the IPMA station at the aerodrome: wind, max wind, QNH and " +
            "temperature. Fill puts them into the performance.",
        },
        {
          title: "METARs and TAFs",
          text: "Faro and Beja reports with their age, updated every 15 minutes. For Portimão and Évora the " +
            "nearest one gives visibility and ceiling.",
        },
        {
          title: "NOTAMs in IPPC",
          text: "One tap copies your route's ICAO codes and opens IPPC, ready to paste.",
        },
        {
          title: "Portimão runway 11/29, paved",
          text: "The runway checks now know LPPM's runway and surface. Declared distances still to come.",
        },
        {
          title: "This note",
          text: "It appears once after each update. Open it again from the bottom of the page.",
        },
      ],
    },
  ];

  var MB = (root.MB = root.MB || {});
  MB.changes = CHANGES;
  if (typeof module !== "undefined" && module.exports) module.exports = CHANGES;
})(typeof window !== "undefined" ? window : globalThis);
