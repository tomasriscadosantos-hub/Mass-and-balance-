// The weather download shared by the live relay and the deploy workflow
// (worker/weather.mjs), and the relay itself (worker/index.mjs).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const D = require("../js/data.js");
const load = (file) => import(pathToFileURL(path.join(__dirname, "../../worker", file)));

const CSV_HEAD =
  "estacao,data,pressao,pnmm,deltap,qfe,qnh,tar,tdew,hrel,dd,ff,ddx,ffx,rwy1,rwy2,h1,c1,h2,c2,prec,precdia,tmax,tmin,ventoaero";
const CSV_878 = [
  CSV_HEAD,
  "878,2026-11-21 16:00:00,1017.3,1017.4,-1.0,1017.4,1017,19.4,17.0,86,217,4,204,9,11,29,T01,R04,H01,L04,0.0,0.0,20.4,11.5,&value=||| &deg;",
  "878,2026-11-21 16:10:00,1017.3,1017.4,-0.9,1017.4,1017,19.3,17.3,88,216,5,224,9,11,29,T01,R05,H01,L05,0.0,0.0,20.4,11.5,&value=205|215 &deg;",
  "878,2026-11-21 16:20:00,1017.2,,,,,,,,,,,,11,29,,,,,,,,,",
].join("\n");

test("IPMA aerodrome station file (ema.ipma.pt)", async () => {
  const { parseIpmaCsv } = await load("weather.mjs");
  const r = parseIpmaCsv(CSV_878);
  assert.equal(r.station, "878");
  assert.equal(r.time, "2026-11-21T16:10:00Z"); // the empty 16:20 row is skipped
  assert.deepEqual([r.qnh, r.tempC, r.dir, r.kt, r.maxDir, r.maxKt], [1017, 19.3, 216, 5, 224, 9]);
  assert.deepEqual(r.runways, ["11", "29"]);
  const evora = parseIpmaCsv(CSV_HEAD + "\n" +
    "843,2026-11-21 16:10:00,986.9,1015.7,-1.2,987.1,1016,16.8,16.6,99,198,12,197,15,1,19,T12,L02,H12,R02,0.0,1.4,17.8,12.5,x");
  assert.deepEqual(evora.runways, ["01", "19"]);
  assert.equal(parseIpmaCsv("estacao,data\n"), null);
});

// Fake aviationweather.gov and IPMA. "down" makes that service answer 503.
function fakeFetch(down) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const u = String(url);
    const reply = (status, body) => new Response(body, { status });
    if (u.includes("/metar?")) {
      if (down === "awc") return reply(503, "busy");
      return reply(200, JSON.stringify([
        { icaoId: "LPFR", obsTime: 100, reportTime: "2026-11-21T16:00:00Z", rawOb: "METAR LPFR old" },
        { icaoId: "LPFR", obsTime: 200, reportTime: "2026-11-21T16:30:00Z", rawOb: "METAR LPFR new" },
        { icaoId: "LPBJ", obsTime: 150, reportTime: "2026-11-21T16:20:00Z", rawOb: "SPECI LPBJ" },
      ]));
    }
    if (u.includes("/taf?")) {
      if (down === "awc") return reply(503, "busy");
      return reply(200, JSON.stringify([{ icaoId: "LPFR", issueTime: "2026-11-21T11:00:00Z", rawTAF: "TAF LPFR" }]));
    }
    if (u.endsWith("data878.csv")) return reply(200, CSV_878);
    if (u.endsWith("data843.csv")) return down === "ipma" ? reply(404, "") : reply(200, CSV_HEAD + "\n" +
      "843,2026-11-21 16:10:00,986.9,1015.7,-1.2,987.1,1016,16.8,16.6,99,198,12,197,15,1,19,T12,L02,H12,R02,0.0,1.4,17.8,12.5,x");
    return reply(404, "");
  };
  fn.calls = calls;
  return fn;
}

async function withFetch(fake, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test("weather download: newest METAR per aerodrome, TAFs, IPMA stations", async () => {
  const { buildWeather } = await load("weather.mjs");
  const stations = [{ icao: "LPPM", station: 878 }, { icao: "LPEV", station: 843 }];
  const w = await withFetch(fakeFetch(), () =>
    buildWeather({ icaos: ["LPPM", "LPFR", "LPEV", "LPBJ"], stations }));
  assert.deepEqual(w.errors, []);
  assert.deepEqual(w.metars.map((m) => [m.icao, m.raw]), [["LPFR", "METAR LPFR new"], ["LPBJ", "SPECI LPBJ"]]);
  assert.deepEqual(w.tafs, [{ icao: "LPFR", issued: "2026-11-21T11:00:00Z", raw: "TAF LPFR" }]);
  assert.deepEqual(w.stations.map((s) => [s.icao, s.kt]), [["LPPM", 5], ["LPEV", 12]]);
  assert.ok(Date.parse(w.fetched) > 0);
});

test("weather download: a service that fails is left out and named", async () => {
  const { buildWeather } = await load("weather.mjs");
  const stations = [{ icao: "LPPM", station: 878 }, { icao: "LPEV", station: 843 }];
  const noIpma = await withFetch(fakeFetch("ipma"), () => buildWeather({ icaos: ["LPFR"], stations }));
  assert.deepEqual(noIpma.stations.map((s) => s.icao), ["LPPM"]);
  assert.deepEqual(noIpma.errors, ["IPMA 843: HTTP 404"]);
  assert.equal(noIpma.metars.length, 2);
  const fake = fakeFetch("awc");
  const noAwc = await withFetch(fake, () => buildWeather({ icaos: ["LPFR"], stations }));
  assert.deepEqual([noAwc.metars, noAwc.tafs], [[], []]);
  assert.deepEqual(noAwc.errors.sort(), ["metar: HTTP 503", "taf: HTTP 503"]);
  assert.equal(noAwc.stations.length, 2);
  // a 5xx is tried once more
  assert.equal(fake.calls.filter((u) => u.includes("/metar?")).length, 2);
});

test("relay: same aerodromes and IPMA stations as the app", async () => {
  const { ICAOS, STATIONS } = await load("index.mjs");
  assert.deepEqual(ICAOS, Object.keys(D.AERODROMES));
  const fromData = Object.entries(D.AERODROMES)
    .filter(([, ad]) => ad.ipma)
    .map(([icao, ad]) => ({ icao, station: ad.ipma.station }));
  assert.deepEqual(STATIONS, fromData);
});

test("relay: answers the app with CORS and reuses a fresh copy", async () => {
  const worker = (await load("index.mjs")).default;
  const fake = fakeFetch();
  const ask = (init) => worker.fetch(new Request("https://relay.example/", init));
  await withFetch(fake, async () => {
    const res = await ask({ headers: { Origin: "https://tomasriscadosantos-hub.github.io" } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://tomasriscadosantos-hub.github.io");
    const body = await res.json();
    assert.equal(body.stations.length, 2);
    const n = fake.calls.length;
    await (await ask({})).json(); // within a minute: no new download
    assert.equal(fake.calls.length, n);
    const other = await ask({ headers: { Origin: "https://elsewhere.example" } });
    assert.notEqual(other.headers.get("Access-Control-Allow-Origin"), "https://elsewhere.example");
    assert.equal((await ask({ method: "POST" })).status, 405);
    assert.equal((await worker.fetch(new Request("https://relay.example/x"))).status, 404);
  });
});
