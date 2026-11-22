// LPPM Flight weather relay (Cloudflare Worker).
//
// GET / returns the app's weather, fetched live from aviationweather.gov and
// IPMA (see weather.mjs), so the Refresh button gets the latest reports. A
// copy is reused for up to a minute so the sources aren't asked on every tap.
// Deploy with worker/deploy.sh.

import { buildWeather } from "./weather.mjs";

// The same aerodromes and IPMA stations as web/js/data.js (a test checks it).
export const ICAOS = ["LPPM", "LPFR", "LPEV", "LPBJ", "LPSO", "LPCS"];
export const STATIONS = [
  { icao: "LPPM", station: 878 },
  { icao: "LPEV", station: 843 },
  { icao: "LPSO", station: 817 },
];

// Web pages allowed to read the relay: the app, and a local copy for testing.
const ORIGINS = ["https://tomasriscadosantos-hub.github.io", "http://localhost:8765"];
const REUSE_S = 60; // a complete copy
const REUSE_PARTIAL_S = 15; // a copy with a part missing: try again sooner

let last = null; // { at, body, partial } in this worker instance
let pending = null; // a download already under way, shared by requests that arrive meanwhile

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function weatherBody() {
  const age = last ? (Date.now() - last.at) / 1000 : Infinity;
  if (age < (last && last.partial ? REUSE_PARTIAL_S : REUSE_S)) return last.body;
  if (!pending) {
    pending = buildWeather({ icaos: ICAOS, stations: STATIONS, timeoutMs: 12000 })
      .then((data) => {
        last = { at: Date.now(), body: JSON.stringify(data), partial: data.errors.length > 0 };
        return last.body;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

export default {
  async fetch(request) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });
    const path = new URL(request.url).pathname;
    if (path !== "/" && path !== "/weather.json") return new Response("Not found", { status: 404, headers: cors });
    return new Response(await weatherBody(), {
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
