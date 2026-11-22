// Downloads the latest weather for the app's aerodromes and writes it to the
// file named on the command line. The deploy workflow publishes it with the
// app as weather.json: the copy the app uses when the live relay (worker/)
// can't be reached. The download itself is worker/weather.mjs, shared with
// the relay.
//
//   node .github/scripts/fetch-weather.js _site/weather.json
"use strict";
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const data = require(path.join(__dirname, "../../web/js/data.js"));

(async () => {
  const { buildWeather } = await import(pathToFileURL(path.join(__dirname, "../../worker/weather.mjs")));
  const stations = Object.entries(data.AERODROMES)
    .filter(([, ad]) => ad.ipma)
    .map(([icao, ad]) => ({ icao, station: ad.ipma.station }));
  const out = await buildWeather({ icaos: Object.keys(data.AERODROMES), stations, timeoutMs: 20000 });
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
  console.log(`METARs: ${out.metars.map((m) => m.icao).join(" ") || "none"}; ` +
    `TAFs: ${out.tafs.map((t) => t.icao).join(" ") || "none"}; ` +
    `IPMA: ${out.stations.map((s) => `${s.icao} ${s.time}`).join(", ") || "none"}` +
    (out.errors.length ? `; errors: ${out.errors.join(" | ")}` : ""));
})();
