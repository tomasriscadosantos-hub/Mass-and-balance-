/*
 * Page code: reads the form, runs MB.calc and draws the results.
 * Everything recalculates as you type. Inputs are remembered on this device.
 */
(function () {
  "use strict";
  var MB = window.MB;
  var D = MB.data;
  var calc = MB.calc;
  var STORE = "lppm-mass-balance-v1";
  var OTHER = "OTHER";
  var DEP = D.DEPARTURE;

  var WX_KEYS = ["qnh", "oat", "dir", "kt", "gust", "vis", "ceil"];
  var MAX_STOPS = 4;
  var GROUND_MIN = 30; // time on the ground at a stop when none is typed

  // Example: a navigation flight to Évora with Faro as the alternate.
  var EXAMPLE = {
    example: true,
    reg: "OK-KUN",
    wUnit: "kg",
    loads: ["75", "85", "", ""],
    xwind: "",
    date: "", // empty = today
    tkof: "",
    fUnit: "gal",
    fuel: "40.0",
    fuelFull: true,
    stops: [], // landings on the way: { icao, h, m, ground, refuel, to, alt }
    dest: "LPEV",
    tripH: "1",
    tripM: "00",
    alt: "LPFR",
    altH: "",
    altM: "",
    wx: {},
    obstacle: { on: false, nm: "", elev: "", limit: "", gs: "" },
    rules: "om",
    method: "interp",
  };
  Object.keys(D.AERODROMES).forEach(function (icao) {
    EXAMPLE.wx[icao] = { qnh: "", oat: "", dir: "", kt: "", gust: "", vis: "", ceil: "", rwy: "auto",
      same: true, contaminated: false };
  });
  Object.assign(EXAMPLE.wx.LPPM, { qnh: "1013", oat: "18", vis: "10", ceil: "3000", same: false });
  Object.assign(EXAMPLE.wx.LPEV, { qnh: "1015", oat: "30", dir: "310", kt: "8", vis: "10", ceil: "4000",
    same: false });

  var state = load();
  var last = null; // last results, for redrawing the chart on resize

  // -------------------------------------------------------------- helpers

  function $(id) {
    return document.getElementById(id);
  }
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // "" -> null, "1,5" -> 1.5, rubbish -> NaN
  function parse(text) {
    var t = String(text === undefined || text === null ? "" : text).trim().replace(",", ".");
    if (t === "") return null;
    var x = Number(t);
    return isFinite(x) ? x : NaN;
  }
  // Fixed decimals with a real minus sign and no "-0".
  function n(x, digits) {
    var s = x.toFixed(digits || 0);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace(/^-/, "−");
  }
  function pad(x, width) {
    return String(Math.round(x)).padStart(width, "0");
  }
  function load() {
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORE) || "null");
    } catch (e) {
      saved = null;
    }
    var s = clone(EXAMPLE);
    if (saved && typeof saved === "object") {
      Object.keys(s).forEach(function (k) {
        if (saved[k] === undefined) return;
        if (k === "wx") {
          Object.keys(s.wx).forEach(function (icao) {
            if (saved.wx && saved.wx[icao]) Object.assign(s.wx[icao], saved.wx[icao]);
          });
        } else if (k === "obstacle") {
          Object.assign(s.obstacle, saved.obstacle);
        } else {
          s[k] = saved[k];
        }
      });
      if (!D.AIRCRAFT[s.reg]) s.reg = EXAMPLE.reg;
      s.stops = (Array.isArray(s.stops) ? s.stops : []).filter(function (st) {
        return st && D.AERODROMES[st.icao];
      }).slice(0, MAX_STOPS);
    }
    return s;
  }
  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {
      /* private window or storage blocked: the page still works */
    }
  }
  function aircraft() {
    return D.AIRCRAFT[state.reg];
  }
  function fullFuelText(ac) {
    var full = state.fUnit === "l" ? ac.usableFuelGal * D.LITRES_PER_GAL : ac.usableFuelGal;
    return n(full, 1);
  }

  // ------------------------------------------------------ build the form

  function bindSeg(id, key, after) {
    var seg = $(id);
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-value]");
      if (!b || state[key] === b.dataset.value) return;
      var before = state[key];
      state[key] = b.dataset.value;
      if (after) after(before);
      changed();
    });
  }
  function paintSeg(id, value) {
    $(id).querySelectorAll("button[data-value]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.value === value));
    });
  }

  function buildAircraft() {
    $("aircraft-seg").innerHTML = Object.keys(D.AIRCRAFT).map(function (reg) {
      return '<button type="button" role="radio" data-value="' + reg + '">' +
        '<span class="reg">' + reg + '</span><span class="type">' +
        esc(D.AIRCRAFT[reg].type) + "</span></button>";
    }).join("");
  }

  function buildStations() {
    var ac = aircraft();
    $("stations").innerHTML = ac.stations.map(function (st, i) {
      var placeholder = st.empty ? ' placeholder="' + st.empty + '"' : "";
      var hint = "";
      if (st.max) {
        hint = "max " + st.max + " lb" +
          (state.wUnit === "kg" ? " (" + n(st.max / D.LB_PER_KG, 1) + " kg)" : "");
      } else if (st.empty === null) {
        hint = "required";
      } else if (st.empty === "solo") {
        hint = "leave empty for solo";
      }
      return '<div class="field">' +
        '<label for="load-' + i + '">' + esc(st.name) + "</label>" +
        '<div class="input-row"><input id="load-' + i + '" type="text" inputmode="decimal" autocomplete="off"' +
        placeholder + '><span class="unit">' + state.wUnit + "</span></div>" +
        '<p class="hint">' + hint + "</p>" +
        '<p class="error" id="err-load-' + i + '" hidden></p></div>';
    }).join("");
    ac.stations.forEach(function (st, i) {
      var el = $("load-" + i);
      el.value = state.loads[i] || "";
      el.addEventListener("input", function () {
        state.loads[i] = el.value;
        changed();
      });
    });
  }

  // The alternate leg starts at the destination (LPPM on a local flight).
  // With "Other" as the destination the time has to be typed in.
  function altFrom() {
    return state.dest === OTHER ? null : state.dest;
  }
  function altTyped() {
    return state.alt === OTHER || !altFrom();
  }

  function buildRoute() {
    var ac = aircraft();
    var dest = Object.keys(D.AERODROMES).map(function (icao) {
      var ad = D.AERODROMES[icao];
      return '<option value="' + icao + '">' + icao + " · " + esc(ad.name) +
        (icao === DEP ? " (back to base)" : "") + "</option>";
    });
    dest.push('<option value="' + OTHER + '">Other</option>');
    $("dest").innerHTML = dest.join("");
    $("dest").value = state.dest;

    var from = altFrom();
    var alt = D.ALTERNATES.map(function (icao) {
      var ad = D.AERODROMES[icao];
      var leg = "";
      if (from && from !== icao) {
        var nm = calc.distanceNm(D.AERODROMES[from], ad);
        leg = " · " + n(nm, 0) + " NM, " + calc.hhmm(nm / ac.cruiseKt);
      }
      return '<option value="' + icao + '">' + icao + " · " + esc(ad.name) + leg + "</option>";
    });
    alt.push('<option value="' + OTHER + '">Other (type the time)</option>');
    $("alt").innerHTML = alt.join("");
    $("alt").value = state.alt;
    $("alt-hint").textContent = from
      ? "Straight line from " + from + " at " + ac.cruiseKt + " kt. Fuel adds 10 min for the approach and landing."
      : "Type the flight time from your destination to the alternate.";
  }

  // ------------------------------------------------------- stops on the way

  function stopFrom(i) {
    return i === 0 ? DEP : state.stops[i - 1].icao;
  }
  function lastPoint() {
    return state.stops.length ? state.stops[state.stops.length - 1].icao : DEP;
  }
  // Alternate for the leg to stop i: the one chosen, or back where the leg started.
  function stopAlt(i) {
    var s = state.stops[i];
    if (s.alt && s.alt !== s.icao && D.AERODROMES[s.alt]) return s.alt;
    var from = stopFrom(i);
    return from !== s.icao ? from : Object.keys(D.AERODROMES).filter(function (k) { return k !== s.icao; })[0];
  }
  function newStop() {
    var used = [DEP, state.dest].concat(state.stops.map(function (s) { return s.icao; }));
    var icao = Object.keys(D.AERODROMES).filter(function (k) { return used.indexOf(k) < 0; })[0] || "LPEV";
    return { icao: icao, h: "", m: "", ground: "", refuel: !!D.AERODROMES[icao].avgas, to: "", alt: "" };
  }

  function buildStops() {
    var ac = aircraft();
    var unit = state.fUnit === "l" ? "L" : "gal";
    var codes = Object.keys(D.AERODROMES);
    $("stops").innerHTML = state.stops.map(function (s, i) {
      var ad = D.AERODROMES[s.icao];
      var from = stopFrom(i);
      var legNm = calc.distanceNm(D.AERODROMES[from], ad);
      var places = codes.map(function (k) {
        return '<option value="' + k + '">' + k + " · " + esc(D.AERODROMES[k].name) +
          (D.AERODROMES[k].avgas ? "" : " (no AVGAS)") + "</option>";
      }).join("");
      var alts = codes.filter(function (k) { return k !== s.icao; }).map(function (k) {
        var nm = calc.distanceNm(ad, D.AERODROMES[k]);
        return '<option value="' + k + '">' + k + " · " + n(nm, 0) + " NM, " + calc.hhmm(nm / ac.cruiseKt) + "</option>";
      }).join("");
      var refuel = ad.avgas
        ? '<div class="refuel"><label class="checkbox"><input type="checkbox" id="stop-rf-' + i + '"> Refuel at ' +
          s.icao + '</label><div class="input-row" id="stop-to-wrap-' + i + '"><span class="unit">to</span>' +
          '<input id="stop-to-' + i + '" type="text" inputmode="decimal" placeholder="full" autocomplete="off" ' +
          'aria-label="Refuel to"><span class="unit">' + unit + "</span></div></div>"
        : '<p class="nofuel">No AVGAS at ' + s.icao + ": the fuel has to last from the last refuelling.</p>";
      return '<div class="stop" id="stop-' + i + '"><div class="stop-head"><span class="stop-title">Stop ' + (i + 1) +
        '</span><button type="button" class="link-btn" data-remove-stop="' + i + '">Remove</button></div>' +
        '<div class="field"><label for="stop-ad-' + i + '">Land at</label><select id="stop-ad-' + i + '">' + places +
        "</select></div>" +
        '<div class="field"><span class="label" id="lbl-stop-t-' + i + '">Flight time from ' + from + "</span>" +
        '<div class="input-row time" role="group" aria-labelledby="lbl-stop-t-' + i + '">' +
        '<input id="stop-h-' + i + '" type="text" inputmode="numeric" aria-label="Hours" autocomplete="off">' +
        '<span class="unit">h</span><input id="stop-m-' + i + '" type="text" inputmode="numeric" aria-label="Minutes" ' +
        'autocomplete="off"><span class="unit">min</span></div><p class="hint">' + from + "–" + s.icao + " " +
        n(legNm, 0) + " NM, about " + calc.hhmm(legNm / ac.cruiseKt) + " at " + ac.cruiseKt + " kt.</p></div>" +
        '<div class="fields"><div class="field"><label for="stop-g-' + i + '">On the ground</label>' +
        '<div class="input-row"><input id="stop-g-' + i + '" type="text" inputmode="numeric" placeholder="' + GROUND_MIN +
        '" autocomplete="off"><span class="unit">min</span></div></div>' +
        '<div class="field"><label for="stop-alt-' + i + '">Alternate, this leg</label><select id="stop-alt-' + i + '">' +
        alts + "</select></div></div>" + refuel + '<p class="error" id="err-stop-' + i + '" hidden></p></div>';
    }).join("");

    state.stops.forEach(function (s, i) {
      var input = function (id, key) {
        var el = $(id);
        el.value = s[key] || "";
        el.addEventListener("input", function () {
          s[key] = el.value;
          changed();
        });
      };
      var ad = $("stop-ad-" + i);
      ad.value = s.icao;
      ad.addEventListener("change", function () {
        s.icao = ad.value;
        s.refuel = !!D.AERODROMES[s.icao].avgas;
        s.alt = "";
        buildStops();
        buildRoute();
        changed();
      });
      input("stop-h-" + i, "h");
      input("stop-m-" + i, "m");
      input("stop-g-" + i, "ground");
      var alt = $("stop-alt-" + i);
      alt.value = stopAlt(i);
      alt.addEventListener("change", function () {
        s.alt = alt.value;
        changed();
      });
      var rf = $("stop-rf-" + i);
      if (rf) {
        rf.checked = !!s.refuel;
        $("stop-to-wrap-" + i).hidden = !s.refuel;
        rf.addEventListener("change", function () {
          s.refuel = rf.checked;
          $("stop-to-wrap-" + i).hidden = !s.refuel;
          changed();
        });
        input("stop-to-" + i, "to");
      }
    });
    $("add-stop").hidden = state.stops.length >= MAX_STOPS;
    $("add-stop").textContent = state.stops.length ? "Add another stop" : "Add a stop on the way";
    $("lbl-dest").textContent = state.stops.length ? "Destination (after the stops)" : "Destination";
    $("lbl-trip").textContent = state.stops.length ? "Flight time from " + lastPoint() : "Flight time";
  }

  function wxField(icao, key, label, unit, mode, placeholder) {
    return '<div class="field"><label for="' + key + "-" + icao + '">' + label +
      ' <span class="unit">' + unit + "</span></label>" +
      '<input id="' + key + "-" + icao + '" type="text"' + (mode ? ' inputmode="' + mode + '"' : "") +
      (placeholder ? ' placeholder="' + placeholder + '"' : "") + ' autocomplete="off"></div>';
  }

  function buildAerodromes() {
    var box = $("aerodromes");
    Object.keys(D.AERODROMES).forEach(function (icao) {
      var ad = D.AERODROMES[icao];
      var el = document.createElement("div");
      el.className = "aerodrome";
      el.id = "ad-" + icao;
      var rwys = '<option value="auto">Most into wind</option>' + ad.runways.map(function (r) {
        return '<option value="' + esc(r.rwy) + '">RWY ' + esc(r.rwy) + "</option>";
      }).join("");
      var obstacle = icao !== DEP ? "" :
        '<div class="obstacle" id="obstacle">' +
        '<label class="checkbox"><input type="checkbox" id="obs-on"> Add an obstacle (e.g. from a NOTAM) or an ' +
        "altitude limit</label>" +
        '<div class="wx" id="obs-fields">' +
        wxField("obs", "nm", "Beyond the runway", "NM", "decimal", "none") +
        wxField("obs", "elev", "Obstacle elevation", "ft", "numeric", "none") +
        wxField("obs", "limit", "Altitude limit", "ft", "numeric", "none") +
        '</div><p class="error" id="err-obs" hidden></p></div>';
      el.innerHTML =
        '<div class="aerodrome-head"><div class="aerodrome-name"><span class="icao">' + icao + "</span>" +
        esc(ad.name) + '</div><span class="roles" id="roles-' + icao + '"></span></div>' +
        '<p class="missing" id="missing-' + icao + '" hidden></p>' +
        '<div class="ad-inputs" id="inputs-' + icao + '">' +
        '<label class="checkbox" id="same-wrap-' + icao + '"><input type="checkbox" id="same-' + icao +
        '"> <span id="same-label-' + icao + '">Same weather</span></label>' +
        '<div class="wx" id="wx-' + icao + '">' +
        wxField(icao, "qnh", "QNH", "hPa", "decimal") +
        wxField(icao, "oat", "OAT", "°C", null) +
        wxField(icao, "dir", "Wind from", "°", "numeric", "calm") +
        wxField(icao, "kt", "Wind", "kt", "decimal", "0") +
        wxField(icao, "gust", "Gust", "kt", "decimal", "none") +
        wxField(icao, "vis", "Visibility", "km", "decimal", "9999 = 10") +
        wxField(icao, "ceil", "Ceiling", "ft AGL", "numeric", "none") +
        "</div>" +
        '<p class="error" id="err-wx-' + icao + '" hidden></p>' +
        '<div class="ad-inputs" id="rwy-wrap-' + icao + '">' +
        '<div class="field"><label for="rwy-' + icao + '">Runway in use</label><select id="rwy-' + icao + '">' +
        rwys + "</select></div>" +
        '<label class="checkbox"><input type="checkbox" id="cont-' + icao + '"> Runway contaminated ' +
        "(standing water, slush, snow)</label></div>" + obstacle + "</div>" +
        '<div class="reports" id="reports-' + icao + '"></div>';
      box.appendChild(el);

      WX_KEYS.forEach(function (key) {
        var input = $(key + "-" + icao);
        input.value = state.wx[icao][key];
        input.addEventListener("input", function () {
          state.wx[icao][key] = input.value;
          changed();
        });
      });
      var same = $("same-" + icao);
      same.checked = !!state.wx[icao].same;
      same.addEventListener("change", function () {
        state.wx[icao].same = same.checked;
        changed();
      });
      var rwy = $("rwy-" + icao);
      rwy.value = state.wx[icao].rwy;
      if (rwy.value !== state.wx[icao].rwy) rwy.value = "auto";
      rwy.addEventListener("change", function () {
        state.wx[icao].rwy = rwy.value;
        changed();
      });
      var cont = $("cont-" + icao);
      cont.checked = !!state.wx[icao].contaminated;
      cont.addEventListener("change", function () {
        state.wx[icao].contaminated = cont.checked;
        changed();
      });
    });

    var on = $("obs-on");
    on.checked = state.obstacle.on;
    on.addEventListener("change", function () {
      state.obstacle.on = on.checked;
      changed();
    });
    ["nm", "elev", "limit"].forEach(function (key) {
      var input = $(key + "-obs");
      input.value = state.obstacle[key];
      input.addEventListener("input", function () {
        state.obstacle[key] = input.value;
        changed();
      });
    });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  function fillSimpleInputs() {
    $("xwind").value = state.xwind;
    $("date").value = state.date || today();
    $("tkof").value = state.tkof;
    $("fuel").value = state.fuel;
    $("trip-h").value = state.tripH;
    $("trip-m").value = state.tripM;
    $("alt-h").value = state.altH;
    $("alt-m").value = state.altM;
  }

  function bindSimpleInputs() {
    $("fuel").addEventListener("input", function (e) {
      state.fuel = e.target.value;
      state.fuelFull = false;
      changed();
    });
    $("fuel-full").addEventListener("click", function () {
      state.fuel = fullFuelText(aircraft());
      state.fuelFull = true;
      $("fuel").value = state.fuel;
      changed();
    });
    [["trip-h", "tripH"], ["trip-m", "tripM"], ["alt-h", "altH"], ["alt-m", "altM"]].forEach(function (p) {
      $(p[0]).addEventListener("input", function (e) {
        state[p[1]] = e.target.value;
        changed();
      });
    });
    $("dest").addEventListener("change", function (e) {
      state.dest = e.target.value;
      buildRoute(); // alternate times are measured from the destination
      changed();
    });
    $("xwind").addEventListener("input", function (e) {
      state.xwind = e.target.value;
      changed();
    });
    $("date").addEventListener("input", function (e) {
      state.date = e.target.value === today() ? "" : e.target.value; // empty = always today
      changed();
    });
    $("tkof").addEventListener("input", function (e) {
      state.tkof = e.target.value;
      changed();
    });
    $("alt").addEventListener("change", function (e) {
      state.alt = e.target.value;
      changed();
    });
    $("add-stop").addEventListener("click", function () {
      if (state.stops.length >= MAX_STOPS) return;
      state.stops.push(newStop());
      buildStops();
      changed();
    });
    $("stops").addEventListener("click", function (e) {
      var b = e.target.closest("[data-remove-stop]");
      if (!b) return;
      state.stops.splice(Number(b.dataset.removeStop), 1);
      buildStops();
      changed();
    });
    $("reset").addEventListener("click", function () {
      state = clone(EXAMPLE);
      rebuildAll();
      changed(true);
    });

    bindSeg("aircraft-seg", "reg", function () {
      if (state.fuelFull) state.fuel = fullFuelText(aircraft());
      buildStations();
      buildRoute();
      buildStops();
      fillSimpleInputs();
    });
    bindSeg("wunit-seg", "wUnit", function (before) {
      var factor = before === "kg" ? D.LB_PER_KG : 1 / D.LB_PER_KG;
      state.loads = state.loads.map(function (v) {
        var x = parse(v);
        return x === null || isNaN(x) ? v : n(x * factor, 1);
      });
      buildStations();
    });
    bindSeg("funit-seg", "fUnit", function (before) {
      var convert = function (text) {
        var x = parse(text);
        if (x === null || isNaN(x)) return text;
        return before === "gal" ? n(x * D.LITRES_PER_GAL, 1) : n(x / D.LITRES_PER_GAL, 1);
      };
      state.fuel = convert(state.fuel);
      state.stops.forEach(function (st) {
        st.to = convert(st.to);
      });
      buildStops();
      if (state.fuelFull) state.fuel = fullFuelText(aircraft());
      $("fuel").value = state.fuel;
    });
    bindSeg("method-seg", "method");
    bindSeg("rules-seg", "rules");
  }

  function rebuildAll() {
    buildStations();
    buildRoute();
    buildStops();
    fillSimpleInputs();
    Object.keys(D.AERODROMES).forEach(function (icao) {
      WX_KEYS.forEach(function (key) {
        $(key + "-" + icao).value = state.wx[icao][key];
      });
      $("same-" + icao).checked = !!state.wx[icao].same;
      $("rwy-" + icao).value = state.wx[icao].rwy;
      $("cont-" + icao).checked = !!state.wx[icao].contaminated;
    });
    $("obs-on").checked = state.obstacle.on;
    ["nm", "elev", "limit"].forEach(function (key) {
      $(key + "-obs").value = state.obstacle[key];
    });
  }

  // ------------------------------------------------------------- compute

  function readTime(h, m) {
    var hh = parse(h);
    var mm = parse(m);
    if (hh === null && mm === null) return null;
    hh = hh === null ? 0 : hh;
    mm = mm === null ? 0 : mm;
    if (isNaN(hh) || isNaN(mm) || hh < 0 || mm < 0) return NaN;
    return hh + mm / 60;
  }

  // Weather typed for one aerodrome. Empty fields stay null: QNH and OAT are
  // needed only where the performance can be worked out, visibility and
  // ceiling only for the solo minima. Wrongly typed fields go to fieldErrors.
  function readWeather(icao, fieldErrors) {
    var w = state.wx[icao];
    var bad = [];
    var qnh = parse(w.qnh);
    var oat = parse(w.oat);
    var dir = parse(w.dir);
    var kt = parse(w.kt);
    var gust = parse(w.gust);
    if (qnh !== null && (isNaN(qnh) || qnh < 900 || qnh > 1100)) bad.push(["qnh", "QNH (900 to 1100 hPa)"]);
    if (oat !== null && (isNaN(oat) || oat < -60 || oat > 60)) bad.push(["oat", "OAT in °C"]);
    if (kt === null) kt = 0;
    if (isNaN(kt) || kt < 0 || kt > 60) bad.push(["kt", "wind speed in kt"]);
    if (dir === null) {
      if (kt > 0) bad.push(["dir", "wind direction"]);
      dir = 0;
    } else if (isNaN(dir) || dir < 0 || dir > 360) {
      bad.push(["dir", "wind direction (0 to 360°)"]);
    }
    if (gust !== null && (isNaN(gust) || gust < kt || gust > 80)) {
      bad.push(["gust", "gust (at least the wind speed)"]);
    }
    // Visibility in km; 9999 or other values from 100 up are read as metres.
    // CAVOK = 10 km and no ceiling. Ceiling: "none", "NSC" or "SKC" = no ceiling.
    var visText = String(w.vis || "").trim().toLowerCase();
    var ceilText = String(w.ceil || "").trim().toLowerCase();
    var vis = visText === "cavok" ? 10 : parse(visText);
    if (vis !== null && !isNaN(vis) && vis >= 100) vis = vis / 1000;
    if (vis !== null && (isNaN(vis) || vis < 0)) bad.push(["vis", "visibility in km"]);
    var ceil = /^(none|nsc|skc|clr|ncd)$/.test(ceilText) || (visText === "cavok" && ceilText === "")
      ? Infinity : parse(ceilText);
    if (ceil !== null && (isNaN(ceil) || ceil < 0)) bad.push(["ceil", "ceiling in ft"]);
    fieldErrors[icao] = bad;
    if (bad.length) return null;
    return { qnh: qnh, oat: oat, dir: dir, kt: kt, gust: gust, vis: vis, ceil: ceil };
  }

  function compute() {
    var ac = aircraft();
    calc.settings.nextHigher = state.method === "next";
    var errors = {}; // field id -> message
    var toLb = state.wUnit === "kg" ? D.LB_PER_KG : 1;

    var loads = ac.stations.map(function (st, i) {
      var v = parse(state.loads[i]);
      if (v === null) {
        if (st.empty === null) errors["load-" + i] = "Enter the " + st.name.toLowerCase() + "'s weight.";
        return 0;
      }
      if (isNaN(v) || v < 0) {
        errors["load-" + i] = "Enter a weight in " + state.wUnit + ".";
        return 0;
      }
      return v * toLb;
    });

    var fuel = parse(state.fuel);
    if (fuel === null) errors.fuel = "Enter the fuel on board, or tap Full.";
    else if (isNaN(fuel) || fuel < 0) errors.fuel = "Enter an amount in " + (state.fUnit === "l" ? "litres" : "US gal") + ".";
    var fuelGal = state.fUnit === "l" ? fuel / D.LITRES_PER_GAL : fuel;

    var tripH = readTime(state.tripH, state.tripM);
    if (tripH === null) errors.trip = "Enter the flight time.";
    else if (isNaN(tripH)) errors.trip = "Enter hours and minutes as numbers.";

    var altIcao = state.alt === OTHER ? null : state.alt;
    var altH;
    if (altIcao && altIcao === state.dest) {
      errors.alt = "Choose an alternate other than the destination.";
    } else if (!altTyped()) {
      altH = calc.distanceNm(D.AERODROMES[altFrom()], D.AERODROMES[altIcao]) / ac.cruiseKt;
    } else {
      altH = readTime(state.altH, state.altM);
      if (altH === null) errors.alt = "Enter the flight time to the alternate.";
      else if (isNaN(altH)) errors.alt = "Enter hours and minutes as numbers.";
    }

    // Stops on the way: each a landing, a time on the ground and a new take-off.
    var stops = [];
    state.stops.forEach(function (s, i) {
      var key = "stop-" + i;
      var name = "Stop " + (i + 1) + ": ";
      var ad = D.AERODROMES[s.icao];
      var from = stopFrom(i);
      var t = readTime(s.h, s.m);
      var g = parse(s.ground);
      if (g === null) g = GROUND_MIN;
      var to = null;
      if (s.icao === from) {
        errors[key] = name + "choose an aerodrome other than " + from + ", where the leg starts.";
      } else if (t === null) {
        errors[key] = name + "enter the flight time from " + from + ".";
      } else if (isNaN(t) || t <= 0) {
        errors[key] = name + "enter the flight time in hours and minutes.";
      } else if (isNaN(g) || g < 0) {
        errors[key] = name + "enter the time on the ground in minutes.";
      } else if (ad.avgas && s.refuel) {
        var x = parse(s.to);
        if (x === null) to = ac.usableFuelGal;
        else if (isNaN(x) || x <= 0) errors[key] = name + "enter the fuel to refuel to, or leave it empty for full.";
        else to = state.fUnit === "l" ? x / D.LITRES_PER_GAL : x;
      }
      if (errors[key]) return;
      var alt = stopAlt(i);
      stops.push({ icao: s.icao, label: s.icao, tripH: t, groundH: g / 60, refuelToGal: to, avgas: !!ad.avgas,
        altIcao: alt, altLabel: alt, altH: calc.distanceNm(ad, D.AERODROMES[alt]) / ac.cruiseKt });
    });
    if (state.stops.length && state.dest === lastPoint()) {
      errors.trip = "The destination is the last stop: choose where you fly to after it, or remove the stop.";
    }

    // Solo: the instructor seat can be left empty (C152 only).
    var solo = ac.stations.some(function (st, i) {
      return st.empty === "solo" && !loads[i] && !errors["load-" + i];
    });
    var demo = MB.poh.TYPES[ac.perf].maxCrosswindKt;
    var xwindLimit = null;
    if (solo) {
      var xw = parse(state.xwind);
      if (xw === null) xwindLimit = demo * calc.C.SOLO_XWIND_FRACTION;
      else if (isNaN(xw) || xw <= 0 || xw > demo) {
        errors.xwind = "Enter a limit up to " + demo + " kt (100 % of the maximum demonstrated).";
      } else xwindLimit = xw;
    }

    var result = { ac: ac, errors: errors, problems: [], notices: [], perf: null, mb: null,
      solo: solo, demoXwind: demo };
    if (Object.keys(errors).length) return result;

    result.stops = stops;
    result.mb = calc.massBalance(ac, {
      loads: loads,
      fuelGal: fuelGal,
      tripH: tripH,
      altH: altH,
      altLabel: altIcao || "alternate",
      solo: solo,
      departureLabel: DEP,
      destLabel: state.dest === OTHER ? "destination" : state.dest,
      stops: stops,
    });
    result.problems = result.mb.problems.slice();
    result.perf = performance(ac, result.mb, altIcao,
      { rules: state.rules, solo: solo, xwindLimitKt: xwindLimit }, stops);
    result.problems = result.problems.concat(result.perf.problems);
    result.notices = result.perf.notices;

    // Fuel to load where there's fuel, when it has to last past stops without.
    result.mb.fuel.fuelling.forEach(function (fp) {
      if (fp.until.length < 2 || fp.overCapacity) return; // over the tanks: a limit already says so
      var dry = fp.until.slice(0, -1).map(function (icao) {
        var st = stops.filter(function (x) { return x.icao === icao; })[0];
        return st && !st.avgas ? "no AVGAS at " + icao : "no refuelling at " + icao;
      });
      result.notices.push("Fuel: load at least " + n(fp.minGal, 1) + " gal at " + fp.at + ", enough for " + fp.at +
        " → " + fp.until.join(" → ") + " (" + dry.join(", ") + ")");
    });

    // Daylight (OM A: cross-country flights land 30 min before sunset).
    result.date = state.date || today();
    // The final landing comes after every leg and the time on the ground at each stop.
    var elapsedH = stops.reduce(function (sum, st) {
      return sum + st.tripH + st.groundH;
    }, tripH);
    result.day = calc.daylight({
      date: result.date,
      takeoffMin: clockMin(state.tkof),
      tripH: elapsedH,
      altH: altH,
      departure: D.AERODROMES[DEP],
      dest: state.dest === OTHER ? null : D.AERODROMES[state.dest],
      alt: altIcao ? D.AERODROMES[altIcao] : null,
      crossCountry: state.dest !== DEP || stops.length > 0,
    });
    var d = result.day;
    if (d.beforeSunrise) {
      result.notices.push("Daylight: take-off at " + clock(clockMin(state.tkof)) + " UTC is before sunrise at " +
        DEP + " (" + clock(d.departureSun.sunrise) + " UTC)");
    }
    if (d.landing !== undefined && !d.ok) {
      if (d.margin) {
        result.problems.push("Daylight: landing at " + state.dest + " " + clock(d.landing) +
          " UTC is later than 30 min before sunset (" + clock(d.latestLanding) + " UTC, OM A)");
      } else {
        result.notices.push("Daylight: landing at " + state.dest + " " + clock(d.landing) +
          " UTC is after sunset (" + clock(d.sunset) + " UTC); night from " + clock(d.nightFrom) + " UTC");
      }
    }
    if (d.altLanding !== undefined && !d.altOk) {
      result.notices.push("Daylight: diverting to " + altIcao + ", you would land at " + clock(d.altLanding) +
        " UTC, after sunset there (" + clock(d.altSunset) + " UTC)");
    }
    return result;
  }

  // "14:30" -> 870 minutes, "" -> null
  function clockMin(text) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(text || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  // 870 -> "14:30"
  function clock(minutes) {
    var t = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
  }
  // UTC minutes on a date -> local time in Portugal, or "" if the browser can't tell.
  function lisbon(dateText, minutes) {
    try {
      var p = dateText.split("-").map(Number);
      var at = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + Math.round(minutes) * 60000);
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(at);
    } catch (e) {
      return "";
    }
  }

  function performance(ac, mb, altIcao, opts, stops) {
    stops = stops || [];
    var dest = state.dest === OTHER ? null : state.dest;
    var involved = [];
    [DEP].concat(stops.map(function (s) { return s.icao; }), [dest, altIcao],
      stops.map(function (s) { return s.altIcao; })).forEach(function (icao) {
      if (icao && involved.indexOf(icao) < 0) involved.push(icao);
    });
    var roles = {};
    function role(icao, label) {
      if (!icao) return;
      (roles[icao] = roles[icao] || []).push(label);
    }
    role(DEP, "Departure");
    stops.forEach(function (s, k) {
      role(s.icao, "Stop " + (k + 1) + (s.refuelToGal !== null ? ", refuel" : ""));
    });
    role(dest, "Destination");
    role(altIcao, "Alternate");
    stops.forEach(function (s, k) {
      role(s.altIcao, "Alternate, leg " + (k + 1));
    });

    var out = { involved: involved, roles: roles, cards: {}, problems: [], notices: [], fieldErrors: {} };
    var crossCountry = state.dest !== DEP || stops.length > 0; // OM A: a flight away from the home aerodrome
    var source = null; // first aerodrome on the route: the others can reuse its weather
    involved.forEach(function (icao) {
      var ad = D.AERODROMES[icao];
      var card = (out.cards[icao] = { reports: [], source: source });
      var wx = source && state.wx[icao].same ? out.cards[source].wx : readWeather(icao, out.fieldErrors);
      if (!source) source = icao;
      card.wx = wx;

      // Student solo weather minima (OM C 5) at every aerodrome on the route.
      if (opts.solo) {
        if (!wx || wx.vis === null || wx.ceil === null) {
          out.notices.push(icao + ": enter the visibility and ceiling to check the solo weather minima");
        } else {
          card.minima = calc.minimaCheck(crossCountry, wx.vis, wx.ceil);
          card.minima.problems.forEach(function (p) {
            out.problems.push(icao + ": " + p + " (OM C 5)");
          });
        }
      }

      if (ad.elevationFt === null) {
        card.missing = "Elevation and runways for " + icao + " are not in the data yet, so the take-off " +
          "and landing can't be worked out here. Add them to js/data.js from the AIP.";
        out.notices.push(icao + ": elevation and runways not in the data yet");
        return;
      }
      if (!ad.runways.length) {
        // Elevation known: POH distances, climb and obstacle still work.
        card.noRunways = true;
        card.missing = "Runways for " + icao + " are not in the data yet. The distances below are without " +
          "wind, and the runway length isn't checked. Add the runways to js/data.js from the AIP.";
      }
      if (!wx) return; // a mistyped field is shown on the card
      if (wx.qnh === null || wx.oat === null) {
        card.waiting = true;
        out.notices.push(icao + ": enter the QNH and OAT to work out the performance");
        return;
      }
      var choice = state.wx[icao].rwy;
      var rwy = card.noRunways ? null : ad.runways.filter(function (r) {
        return r.rwy === choice;
      })[0] || calc.bestRunway(ad.runways, wx.dir, wx.kt);
      card.site = { icao: icao, elevationFt: ad.elevationFt, rwy: rwy, weather: wx,
        contaminated: !!state.wx[icao].contaminated };
      card.pa = calc.pressureAltitude(ad.elevationFt, wx.qnh);
    });

    // Your own obstacle (e.g. from a NOTAM) and altitude limit at the departure.
    var manual = null;
    var limit = null;
    var obstacleError = "";
    var so = state.obstacle;
    if (so.on) {
      var nm = parse(so.nm), elev = parse(so.elev);
      limit = parse(so.limit);
      if ((nm === null) !== (elev === null)) {
        obstacleError = "Enter both the distance and the elevation of the obstacle.";
      } else if ((nm !== null && (isNaN(nm) || nm <= 0)) || (elev !== null && isNaN(elev)) ||
                 (limit !== null && isNaN(limit))) {
        obstacleError = "Enter numbers: distance in NM, heights in ft.";
      } else if (nm !== null) {
        manual = { ob: { what: "Your obstacle", elevFt: elev, manual: true }, along: nm * calc.C.M_PER_NM,
          cross: 0, assumed: false };
      }
      if (limit !== null && isNaN(limit)) limit = null;
    }
    if (out.cards[DEP]) out.cards[DEP].obstacleError = obstacleError;

    var m = mb.byName;
    // In flying order: each stop is a landing and a take-off; then the
    // destination and the alternates.
    var events = [["take-off", DEP, m.TOM.lb, "Take-off"]];
    stops.forEach(function (s, k) {
      events.push(["landing", s.icao, m["L" + (k + 1)].lb, "Landing, stop " + (k + 1)]);
      events.push(["take-off", s.icao, m["T" + (k + 1)].lb, "Take-off, stop " + (k + 1)]);
    });
    events.push(["landing", dest, m.LM.lb, "Landing"]);
    events.push(["take-off", altIcao, m.TOM.lb, "Take-off at the alternate"]);
    events.push(["landing", altIcao, m.ALT.lb, "Landing at the alternate"]);
    stops.forEach(function (s, k) {
      events.push(["landing", s.altIcao, m["L" + (k + 1)].lb, "Landing, alternate for leg " + (k + 1)]);
    });
    events.forEach(function (ev) {
      var card = ev[1] && out.cards[ev[1]];
      if (!card || !card.site) return;
      var r = calc.runwayCheck(ac, ev[0], card.site, ev[2], opts);
      r.title = ev[3];
      card.reports.push(r);
      out.problems = out.problems.concat(r.problems);
      card.notesNoted = card.notesNoted || {};
      r.notes.forEach(function (note) {
        if (card.notesNoted[note]) return;
        card.notesNoted[note] = true;
        out.notices.push(ev[1] + ": " + note);
      });
      if (r.unchecked && !card.uncheckedNoted) {
        card.uncheckedNoted = true;
        out.notices.push(ev[1] + (card.noRunways
          ? ": runways not in the data yet, wind and runway length not checked"
          : ": declared distances not in the data yet, runway length not checked"));
      }

      // Obstacles from the AIP: cleared after the take-off, listed under the approach.
      var ad = D.AERODROMES[ev[1]];
      if (!r.noRunway && !r.outside) {
        if (ev[0] === "take-off") {
          var list = calc.takeoffObstacles(r.rwy, ad.obstacles);
          var mine = ev[1] === DEP;
          if (mine && manual) {
            list = list.concat([manual]).sort(function (a, b) {
              return a.along - b.along;
            });
          }
          r.obstacles = calc.obstacleClearance(ac, card.site, r, list, mine ? limit : null);
          out.problems = out.problems.concat(r.obstacles.problems);
          r.obstacles.notes.forEach(function (note) {
            out.notices.push(note);
          });
        } else {
          r.approach = calc.approachObstacles(r.rwy, ad.runways, ad.obstacles);
        }
      }
      // The SOP's departure and landing briefings: open for the flight's own
      // take-offs and landings, closed for the alternates.
      if (ev[0] === "take-off") {
        r.briefing = calc.departureBriefing(ac, r);
        r.briefing.open = ev[3] !== "Take-off at the alternate";
      } else {
        r.briefing = calc.landingBriefing(ac, r);
        r.briefing.open = !/alternate/.test(ev[3]);
      }
    });
    return out;
  }

  // -------------------------------------------------------------- render

  function setError(id, message) {
    var el = $("err-" + id);
    if (el) {
      el.hidden = !message;
      el.textContent = message || "";
    }
  }

  function renderErrors(r) {
    var ac = r.ac;
    ac.stations.forEach(function (st, i) {
      var msg = r.errors["load-" + i];
      setError("load-" + i, msg);
      $("load-" + i).setAttribute("aria-invalid", String(!!msg));
    });
    ["fuel", "trip", "alt", "xwind"].forEach(function (k) {
      setError(k, r.errors[k]);
    });
    state.stops.forEach(function (st, i) {
      setError("stop-" + i, r.errors["stop-" + i]);
    });
    $("fuel").setAttribute("aria-invalid", String(!!r.errors.fuel));
    $("xwind").setAttribute("aria-invalid", String(!!r.errors.xwind));
    $("alt").setAttribute("aria-invalid", String(!!r.errors.alt && !altTyped()));

    // Solo box: shown while the instructor seat is empty.
    var ac = r.ac;
    $("solo-box").hidden = !r.solo;
    if (r.solo) {
      var half = r.demoXwind * calc.C.SOLO_XWIND_FRACTION;
      $("xwind").placeholder = n(half, 1).replace(/\.0$/, "");
      $("xwind-hint").textContent = "Empty = " + n(half, 1).replace(/\.0$/, "") + " kt, 50 % of the " +
        r.demoXwind + " kt maximum demonstrated. Your instructor can raise it up to " + r.demoXwind + " kt.";
      $("solo-hours").textContent = calc.hhmm(ac.maxSoloHours);
    }
    ["trip-h", "trip-m"].forEach(function (id) {
      $(id).setAttribute("aria-invalid", String(!!r.errors.trip));
    });
    ["alt-h", "alt-m"].forEach(function (id) {
      $(id).setAttribute("aria-invalid", String(!!r.errors.alt));
    });
  }

  function renderSummary(r) {
    var chip = $("verdict-chip");
    var box = $("summary");
    var errors = Object.keys(r.errors).map(function (k) {
      return r.errors[k];
    });
    if (errors.length) {
      chip.className = "chip chip-lg chip-warn";
      chip.textContent = "Incomplete";
      box.innerHTML = '<div class="verdict"><span class="verdict-title">Fill in the flight</span></div>' +
        '<ul class="issues">' + errors.map(function (e) {
          return '<li><span class="chip chip-warn">Missing</span>' + esc(e) + "</li>";
        }).join("") + "</ul>";
      return;
    }
    var problems = r.problems;
    // Amber items: checks that couldn't be done (missing data or input) and plain notes.
    var unchecked = r.notices.filter(function (p) {
      return /not in the data|enter the/.test(p);
    });
    var notes = r.notices.filter(function (p) {
      return unchecked.indexOf(p) < 0;
    });
    var title;
    if (problems.length) {
      chip.className = "chip chip-lg chip-bad";
      chip.textContent = problems.length + (problems.length === 1 ? " problem" : " problems");
      title = '<span class="verdict-title bad">Not within limits</span>';
    } else if (unchecked.length) {
      chip.className = "chip chip-lg chip-warn";
      chip.textContent = "Not all checked";
      title = '<span class="verdict-title ok">No problems found</span>' +
        '<span class="chip chip-warn">' + unchecked.length + " not checked</span>";
    } else {
      chip.className = "chip chip-lg chip-ok";
      chip.textContent = "Within limits";
      title = '<span class="verdict-title ok">Within limits</span>';
    }
    var items = problems.map(function (p) {
      return '<li><span class="chip chip-bad">Limit</span><span>' + esc(p) + "</span></li>";
    }).concat(notes.map(function (p) {
      return '<li><span class="chip chip-warn">Note</span><span>' + esc(p) + "</span></li>";
    })).concat(unchecked.map(function (p) {
      return '<li><span class="chip chip-warn">Not checked</span><span>' + esc(p) + "</span></li>";
    }));

    var mb = r.mb;
    var tom = mb.byName.TOM;
    var f = mb.fuel;
    box.innerHTML = '<div class="verdict">' + title + (r.solo ? '<span class="chip chip-warn">Solo limits</span>' : "") +
      "</div>" +
      (items.length ? '<ul class="issues">' + items.join("") + "</ul>" : "") +
      '<div class="figures">' +
      figure("Take-off mass", n(tom.lb, 1) + " lb", n(tom.lb / D.LB_PER_KG, 0) + " kg · max " + r.ac.maxTakeoff) +
      figure("CG at take-off", n(tom.cg, 2) + " in", n(tom.fwd, 2) + " – " + n(tom.aft, 2) + " in") +
      figure("Minimum fuel", n(f.requiredGal, 1) + " gal", "on board " + n(f.requiredGal + f.extraGal, 1) +
        " · extra " + n(f.extraGal, 1)) +
      "</div>" +
      '<div class="summary-actions"><button type="button" class="btn-ghost" data-print>Print</button>' +
      '<span class="hint">Mass and balance, fuel and performance on A4, or save as PDF.</span></div>';
  }

  // Printed only: what the sheet is for (aircraft, date, route, fuel, rules).
  function renderPrintHead(r) {
    var box = $("print-head");
    if (!r.mb) {
      box.innerHTML = "";
      return;
    }
    var ac = r.ac;
    var dest = state.dest === OTHER ? "destination" : state.dest;
    var route = [DEP];
    var legs = [];
    var from = DEP;
    r.stops.forEach(function (s) {
      route.push(s.icao + (s.refuelToGal !== null ? " (refuel to " + n(s.refuelToGal, 1) + " gal)" : ""));
      legs.push(from + "–" + s.icao + " " + calc.hhmm(s.tripH) + ", " + Math.round(s.groundH * 60) + " min on the ground");
      from = s.icao;
    });
    route.push(dest);
    legs.push(from + "–" + dest + " " + calc.hhmm(readTime(state.tripH, state.tripM)));
    var alts = [state.alt === OTHER ? "other aerodrome" : state.alt].concat(r.stops.map(function (s, k) {
      return s.altIcao + " (leg " + (k + 1) + ")";
    }));
    var f = r.mb.fuel;
    var rows = [
      ["Aircraft", ac.type + " " + state.reg],
      ["Date", longDate(r.date) + (state.tkof ? ", take-off " + state.tkof + " UTC" : "")],
      ["Route", route.join(" → ")],
      ["Flight time", legs.join(" · ")],
      ["Alternate", alts.join(", ")],
      ["Fuel on board", n(f.requiredGal + f.extraGal, 1) + " US gal, minimum " + n(f.requiredGal, 1)],
      ["Runway checks", (state.rules === "om" ? "Flying Academy OM" : "Class B (old sheet)") + ", POH tables " +
        (state.method === "next" ? "read at the next higher value" : "interpolated") +
        (r.solo ? ". Student solo" : "")],
    ];
    box.innerHTML = '<div class="print-title"><span>LPPM Flight</span><span>Mass and balance and performance</span></div>' +
      "<dl>" + rows.map(function (row) {
        return "<dt>" + esc(row[0]) + "</dt><dd>" + esc(row[1]) + "</dd>";
      }).join("") + '<dt>Printed</dt><dd id="print-time"></dd></dl>';
    stampPrintTime();
  }

  function stampPrintTime() {
    var el = $("print-time");
    if (!el) return;
    var d = new Date();
    el.textContent = longDate(d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate()) + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") +
      " local, app update " + (MB.changes && MB.changes.length ? MB.changes[0].id : "?");
  }

  function bindPrint() {
    $("summary").addEventListener("click", function (e) {
      if (e.target.closest("[data-print]")) window.print();
    });
    window.addEventListener("beforeprint", stampPrintTime);
  }
  function figure(k, v, s) {
    return '<div class="figure"><div class="k">' + esc(k) + '</div><div class="v">' + v +
      '</div><div class="s">' + s + "</div></div>";
  }

  function renderSheet(r) {
    var table = $("sheet");
    if (!r.mb) {
      table.innerHTML = "";
      $("bew-note").textContent = "";
      return;
    }
    table.innerHTML = "<thead><tr><th>Item</th><th>Mass lb</th><th>Arm in</th><th>Moment</th></tr></thead><tbody>" +
      r.mb.sheet.map(function (row) {
        var cls = row.subtotal ? "subtotal" : row.lb < 0 ? "minus" : "";
        return '<tr class="' + cls + '"><td>' + esc(row.label) + "</td><td>" + n(row.lb, 1) + "</td><td>" +
          n(row.arm, 2) + "</td><td>" + n(row.moment, 1) + "</td></tr>";
      }).join("") + "</tbody>";
    var ac = r.ac;
    $("bew-note").textContent = "Basic empty mass = " + n(ac.weighed.lb, 1) + " lb as weighed (" +
      ac.weighed.source + ") + " + ac.addToWeighed.map(function (a) {
        return a.item.toLowerCase() + " " + n(a.lb, 1) + " lb";
      }).join(" + ") + ", as in POH figure 6-1.";
  }

  function renderLimits(r) {
    var table = $("limits");
    if (!r.mb) {
      table.innerHTML = "";
      $("fuel-left").textContent = "";
      return;
    }
    var short = { "CG too far forward": "Too fwd", "CG too far aft": "Too aft" };
    table.innerHTML = '<thead><tr><th>Stage</th><th>Mass lb</th><th>CG in</th><th>Limits in</th>' +
      '<th class="wide">Max lb</th><th></th></tr></thead><tbody>' +
      r.mb.conditions.map(function (c) {
        var status = c.ok ? '<span class="chip chip-ok">OK</span>' :
          c.status.map(function (s) {
            var label = short[s] || (s.indexOf("over max") === 0 ? "Over max" : s);
            return '<span class="chip chip-bad" title="' + esc(s) + '">' + esc(label) + "</span>";
          }).join(" ");
        return '<tr><td title="' + esc(c.label) + '">' + c.name + "</td><td>" + n(c.lb, 1) + "</td><td>" +
          n(c.cg, 2) + "</td><td>" + n(c.fwd, 2) + "–" + n(c.aft, 2) + '</td><td class="wide">' +
          (c.max || "–") + '</td><td class="status">' + status + "</td></tr>";
      }).join("") + "</tbody>";
    var f = r.mb.fuel;
    var altLabel = state.alt === OTHER ? "the alternate" : state.alt;
    $("fuel-legs-wrap").hidden = f.legs.length < 2;
    if (f.legs.length > 1) {
      $("fuel-left").textContent = f.fuelling.map(function (fp) {
        var route = fp.at + " → " + fp.until.join(" → ");
        return fp.overCapacity
          ? route + " needs " + n(fp.minGal, 1) + " gal at " + fp.at + ", more than the " + r.ac.usableFuelGal +
            " gal the tanks hold"
          : "Load at least " + n(fp.minGal, 1) + " gal at " + fp.at + " (for " + route + ")";
      }).join(". ") + ". At each take-off the OM fuel is taxi + trip + alternate + " + D.FINAL_RESERVE_MIN +
        " min, each with 10 min for the approach. Left at " + altLabel + " at the end: " + n(f.leftGal, 1) +
        " gal, about " + n(f.leftMin, 0) + " min.";
      $("fuel-legs").innerHTML = "<thead><tr><th>Leg</th><th>On board</th><th>Needed</th><th>Landing</th>" +
        "<th></th></tr></thead><tbody>" + f.legs.map(function (l) {
          return "<tr><td>" + l.from + "–" + l.to + (l.refuelled && l.from !== DEP ? " ⛽" : "") + "</td><td>" +
            n(l.blockGal, 1) + "</td><td>" + n(l.requiredGal, 1) + "</td><td>" + n(l.landingGal, 1) +
            '</td><td class="status">' + (l.ok ? '<span class="chip chip-ok">OK</span>'
              : '<span class="chip chip-bad">Short ' + n(l.requiredGal - l.blockGal, 1) + "</span>") + "</td></tr>";
        }).join("") + "</tbody>";
      return;
    }
    $("fuel-left").textContent = "Minimum fuel " + n(f.requiredGal, 1) + " gal = taxi " + n(f.taxiGal, 1) +
      " + trip " + n(f.tripGal, 1) + " + alternate " + n(f.altGal, 1) + " + final reserve " +
      n(f.reserveGal, 1) + " (" + D.FINAL_RESERVE_MIN + " min at " + r.ac.fuelFlowGph + " gal/h). On board " +
      n(f.requiredGal + f.extraGal, 1) + " gal, extra " + n(f.extraGal, 1) + " gal. Left at " + altLabel + ": " +
      n(f.leftGal, 1) + " gal, about " + n(f.leftMin, 0) + " min.";
  }

  // CG moment envelope: moment/1000 across, mass up, like POH section 6.
  function niceStep(span, count) {
    var raw = span / count;
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function ticks(lo, hi, count) {
    var step = niceStep(hi - lo, count);
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  function renderChart(r) {
    var box = $("chart");
    if (!r || !r.mb) {
      box.innerHTML = "";
      return;
    }
    var ac = r.ac;
    var W = Math.max(280, Math.round(box.clientWidth || 600));
    var H = Math.round(Math.min(400, Math.max(250, W * 0.62)));
    var M = { l: 54, r: 14, t: 12, b: 42 };
    var bottom = ac.envelopeMinLb;
    var w1 = ac.cgForward[0][0], cg1 = ac.cgForward[0][1];
    var w2 = ac.cgForward[1][0], cg2 = ac.cgForward[1][1];
    var env = [
      [(cg1 * bottom) / 1000, bottom],
      [(cg1 * w1) / 1000, w1],
      [(cg2 * w2) / 1000, w2],
      [(ac.cgAft * w2) / 1000, w2],
      [(ac.cgAft * bottom) / 1000, bottom],
    ];
    var by = r.mb.byName;
    // Take-offs and landings in flying order, the alternate, then zero fuel.
    var order = r.mb.conditions.filter(function (c) {
      return /^(TOM|LM|ALT|T\d+|L\d+)$/.test(c.key);
    }).map(function (c) { return c.key; }).concat(["ZFM"]);
    var pts = order.map(function (k) {
      return { name: k, x: by[k].moment, y: by[k].lb, ok: by[k].ok, c: by[k] };
    });
    var xs = env.map(function (p) { return p[0]; }).concat(pts.map(function (p) { return p.x; }));
    var ys = env.map(function (p) { return p[1]; }).concat(pts.map(function (p) { return p.y; }));
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var xp = (x1 - x0) * 0.05, yp = (y1 - y0) * 0.05;
    x0 -= xp; x1 += xp; y0 -= yp; y1 += yp;
    function sx(v) { return M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r); }
    function sy(v) { return H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b); }

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
      '" role="img" aria-label="Centre of gravity moment envelope for ' + esc(ac.type) +
      ' with the take-off, landing, alternate and zero-fuel points">');
    ticks(x0, x1, Math.max(3, Math.floor(W / 90))).forEach(function (t) {
      svg.push('<line class="gridline" x1="' + sx(t) + '" x2="' + sx(t) + '" y1="' + M.t + '" y2="' + (H - M.b) + '"/>');
      svg.push('<text x="' + sx(t) + '" y="' + (H - M.b + 16) + '" text-anchor="middle" font-size="11">' + t + "</text>");
    });
    ticks(y0, y1, 5).forEach(function (t) {
      svg.push('<line class="gridline" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + sy(t) + '" y2="' + sy(t) + '"/>');
      svg.push('<text x="' + (M.l - 6) + '" y="' + (sy(t) + 4) + '" text-anchor="end" font-size="11">' + t + "</text>");
    });
    svg.push('<text class="axis-title" x="' + (M.l + (W - M.l - M.r) / 2) + '" y="' + (H - 6) +
      '" text-anchor="middle" font-size="11">Moment / 1000 (lb-in)</text>');
    svg.push('<text class="axis-title" x="12" y="' + (M.t + (H - M.t - M.b) / 2) + '" text-anchor="middle" font-size="11" ' +
      'transform="rotate(-90 12 ' + (M.t + (H - M.t - M.b) / 2) + ')">Mass (lb)</text>');

    svg.push('<polygon class="env" points="' + env.map(function (p) {
      return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1);
    }).join(" ") + '"/>');

    var alt = pts[pts.length - 2], zfm = pts[pts.length - 1];
    var line = pts.slice(0, -1).map(function (p) { return sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1); }).join(" ");
    svg.push('<polyline class="path" points="' + line + '"/>');
    svg.push('<polyline class="path-zero" points="' + sx(alt.x).toFixed(1) + "," + sy(alt.y).toFixed(1) + " " +
      sx(zfm.x).toFixed(1) + "," + sy(zfm.y).toFixed(1) + '"/>');

    // Labels to the right of each point, pushed down so they never overlap.
    var placed = pts.map(function (p) { return { p: p, x: sx(p.x), y: sy(p.y) }; })
      .sort(function (a, b) { return a.y - b.y; });
    var lastY = -Infinity;
    placed.forEach(function (q) {
      q.ly = Math.max(q.y + 4, lastY + 13);
      lastY = q.ly;
    });
    placed.forEach(function (q) {
      var c = q.p.c;
      var tip = c.label + ": " + n(c.lb, 1) + " lb, moment " + n(c.moment, 2) + ", CG " + n(c.cg, 2) + " in" +
        (c.ok ? "" : " - " + c.status.join(", "));
      svg.push('<g><title>' + esc(tip) + "</title>" +
        '<circle class="pt' + (q.p.ok ? "" : " out") + '" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="5"/>' +
        '<text class="pt-label" x="' + (q.x + 9).toFixed(1) + '" y="' + q.ly.toFixed(1) + '" font-size="11">' +
        q.p.name + (q.p.ok ? "" : " ✕") + "</text>" +
        '<circle class="hit" cx="' + q.x.toFixed(1) + '" cy="' + q.y.toFixed(1) + '" r="14"/></g>');
    });
    svg.push("</svg>");
    box.innerHTML = svg.join("");
  }

  function reportHtml(r) {
    var isTakeoff = r.kind === "take-off";
    var head;
    if (r.outside || r.problems.length) head = '<span class="chip chip-bad">Not OK</span>';
    else if (r.unchecked) head = '<span class="chip chip-warn">Runway not checked</span>';
    else head = '<span class="chip chip-ok">OK</span>';
    var wx = r.weather;
    var gust = wx.gust !== null && wx.gust !== undefined;
    var wind = wx.kt ? pad(wx.dir, 3) + "/" + pad(wx.kt, 2) + (gust ? "G" + pad(wx.gust, 2) : "") : "calm";
    var mass = n(r.mass, 0) + " lb" + (r.massNote ? " (" + r.massNote + ", as the OM requires)" : "");
    var windPart = r.noRunway
      ? "wind " + wind + " (runway not in the data, so no head or cross wind)"
      : "wind " + wind + " → " + (r.head >= 0 ? "headwind " : "tailwind ") + n(Math.abs(r.head), 0) +
        " kt, crosswind " + n(r.cross, 0) + " kt" + (gust ? " (" + n(r.gustCross, 0) + " in gusts)" : "");
    var facts = (r.noRunway ? "" : "RWY " + esc(r.rwy.rwy) + " · ") + mass + " · " + windPart +
      " · OAT " + n(wx.oat, 0) + " °C · QNH " + n(wx.qnh, 0) + " · PA " + n(r.pa, 0) + " ft · DA " +
      n(r.da, 0) + " ft";
    var html = '<div class="report"><div class="report-head"><span class="report-title">' + esc(r.title) +
      "</span>" + head + '</div><p class="facts">' + facts + "</p>";
    if (r.outside) {
      return html + "<p>Outside the POH table: pressure altitude or temperature too high.</p></div>";
    }
    var normal = r.briefing && r.briefing.normal;
    html += "<p>Short field, " + esc(r.note) + ": " + (isTakeoff
      ? "lift-off " + r.speeds[0] + " KIAS, " + r.speeds[1] + " KIAS at 50 ft"
      : r.speeds[0] + " KIAS at 50 ft") + "." + (normal
      ? " These POH distances are for the short-field technique: a normal " + (isTakeoff ? "take-off" : "approach") +
        " (" + esc(r.briefing.source) + ": " + esc(normal) + ") needs more runway."
      : "") + "</p>";
    html += "<p>POH, zero wind, paved: ground roll " + n(r.poh.roll, 0) + " ft, 50 ft " + n(r.poh.total, 0) +
      " ft. Corrections: " + esc(r.corrections.join(", ")) + ".</p>";
    html += '<div class="table-scroll"><table class="data"><tbody>' + r.lines.map(function (l) {
      var avail = l.available === null || l.available === undefined ? "–" : n(l.available, 0) + " m";
      var chip = l.ok === null ? '<span class="chip chip-warn">no data</span>' :
        l.ok ? '<span class="chip chip-ok">OK</span>' : '<span class="chip chip-bad">Not OK</span>';
      return "<tr><td>" + esc(l.label) + "</td><td>" + n(l.need, 0) + " m</td><td>" + (l.ok === false ? "&gt;" : "&lt;") +
        "</td><td>" + esc(l.name) + " " + avail + '</td><td class="status">' + chip + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    if (r.rules === "classb" && isTakeoff && r.unchecked && r.lines.length === 2) {
      html += '<p class="hint">The ×1.15 / ×1.3 or ×1.25 checks need TORA, TODA and ASDA.</p>';
    }
    r.warnings.forEach(function (w) {
      html += '<p class="warnline">! ' + esc(w.charAt(0).toUpperCase() + w.slice(1)) + ".</p>";
    });
    return html + obstaclesHtml(r) + approachHtml(r) + briefingHtml(r) + "</div>";
  }

  // The SOP's departure crew briefing or arrival briefing, filled in from the
  // take-off or landing above.
  function briefingHtml(r) {
    var b = r.briefing;
    if (!b) return "";
    var isTakeoff = r.kind === "take-off";
    var from = b.source === "SOP" ? "Speeds from the school's SOP and the POH."
      : "Speeds from the POH: the school's SOP for this aircraft isn't in the app yet.";
    var yours = isTakeoff
      ? "Add the turn after departure, the initial altitude and who takes control in an emergency."
      : "Add the airspace, the circuit entry and altitude, the traffic, wind shear, noise abatement and " +
        "the runway exit, and check the NOTAMs.";
    return '<details class="dep-brief"' + (b.open ? " open" : "") + "><summary>" +
      (isTakeoff ? "Departure briefing" : "Landing briefing") + "</summary>" +
      "<dl>" + b.items.map(function (it) {
        return "<dt>" + esc(it[0]) + "</dt><dd>" + esc(it[1]) + "</dd>";
      }).join("") + '</dl><p class="hint">' + esc(from) + (b.note ? " " + esc(b.note) : "") + " " + esc(yours) +
      "</p></details>";
  }

  // "700 m", "2.2 km, 200 m left", with * where the AIP gives no position.
  function placeText(o) {
    var d = o.along >= 1000 ? n(o.along / 1000, 1) + " km" : n(Math.round(o.along / 10) * 10, 0) + " m";
    var side = Math.abs(o.cross) >= 50 ? ", " + n(Math.round(Math.abs(o.cross) / 10) * 10, 0) + " m " +
      (o.cross > 0 ? "right" : "left") : "";
    return d + side + (o.assumed ? " *" : "");
  }

  function obstaclesHtml(r) {
    var o = r.obstacles;
    if (!o) return "";
    if (!o.climb) return '<p class="obs-title">After take-off</p><p>Rate of climb: outside the POH table.</p>';
    var html = '<p class="obs-title">After take-off</p><p>Climb ' + n(o.climb[1], 0) + " ft/min at " + o.climb[0] +
      " KIAS (POH, max weight, flaps up), ground speed " + n(o.gs, 0) + " kt: " + n(o.ftPerNm, 0) +
      " ft per NM, from 50 ft at the end of the take-off distance (POH, not factored).</p>";
    if (!o.rows.length) {
      return html + "<p>No obstacles in the take-off path of RWY " + esc(r.rwy.rwy) + " in the AIP.</p>";
    }
    html += '<div class="table-scroll"><table class="data obs"><thead><tr><th>Obstacle</th><th>Ahead</th>' +
      "<th>You</th><th>Clear</th></tr></thead><tbody>" + o.rows.map(function (row) {
        var chip;
        if (row.clearance === undefined) chip = '<span class="chip chip-warn">no elev.</span>';
        else if (!row.ok) chip = '<span class="chip chip-bad">' + n(row.clearance, 0) + " ft</span>";
        else if (row.clearance < calc.C.OBST_MARGIN_FT) chip = '<span class="chip chip-warn">+' + n(row.clearance, 0) + " ft</span>";
        else chip = '<span class="chip chip-ok">+' + n(row.clearance, 0) + " ft</span>";
        return "<tr><td>" + esc(row.what) + '<span class="sub">' +
          (row.elevFt === null ? "elevation not published" : n(row.elevFt, 0) + " ft") + "</span></td><td>" +
          placeText(row) + "</td><td>" +
          (row.altFt === undefined ? "–" : n(row.altFt, 0) + " ft" + (row.limited ? " (limit)" : "")) +
          '</td><td class="status">' + chip + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    var notes = ["Obstacles from the AIP (AD 2.10) in the take-off path: 90 m either side at the end of the " +
      "runway, widening by 12.5 % of the distance, out to 6 km. Heights above mean sea level."];
    if (o.rows.some(function (row) { return row.assumed; })) {
      notes.push("* The AIP gives no position: taken on the extended centre line.");
    }
    return html + notes.map(function (t) { return '<p class="hint">' + esc(t) + "</p>"; }).join("");
  }

  function approachHtml(r) {
    if (!r.approach || !r.approach.length) return "";
    var elev = D.AERODROMES[r.icao].elevationFt;
    return '<p class="obs-title">Under the approach</p><ul class="obs-list">' + r.approach.map(function (o) {
      var h = o.ob.elevFt === null ? "elevation not published" :
        n(o.ob.elevFt, 0) + " ft (" + n(o.ob.elevFt - elev, 0) + " ft above the aerodrome)";
      return "<li>" + esc(o.ob.what) + ", " + h + ", " + placeText(o) + " before the runway</li>";
    }).join("") + "</ul>" + (r.approach.some(function (o) { return o.assumed; })
      ? '<p class="hint">* The AIP gives no position: taken on the extended centre line.</p>' : "");
  }

  // Every obstacle the AIP lists at the aerodrome, for reference.
  function allObstaclesHtml(icao) {
    var ad = D.AERODROMES[icao];
    if (!ad.obstacles || !ad.obstacles.length) return "";
    return '<details class="method"><summary>All obstacles in the AIP at ' + icao + " (" + ad.obstacles.length +
      ')</summary><ul class="obs-list">' + ad.obstacles.map(function (ob) {
        var h = ob.elevFt === null ? "elevation not published" :
          n(ob.elevFt, 0) + " ft (" + n(ob.elevFt - ad.elevationFt, 0) + " ft above the aerodrome)";
        var where;
        if (ob.pos) {
          var p = calc.fromArp(ad, ob.pos);
          where = (p.m >= 1000 ? n(p.m / 1000, 1) + " km" : n(Math.round(p.m / 10) * 10, 0) + " m") + " " +
            pad(p.brg, 3) + "° from the ARP";
        } else {
          where = n(ob.ahead.m, 0) + " m beyond RWY " + [].concat(ob.ahead.rwy).join(" and RWY ") +
            (ob.ahead.cross ? ", " + n(Math.abs(ob.ahead.cross), 0) + " m " + (ob.ahead.cross > 0 ? "right" : "left") : "");
        }
        return "<li>" + esc(ob.what) + ", " + h + ", " + where + "</li>";
      }).join("") + '</ul><p class="hint">' + esc(ad.obstacleSource || "AIP AD 2.10") + ".</p></details>";
  }

  function renderPerformance(r) {
    var perf = r.perf;
    var container = $("aerodromes");
    Object.keys(D.AERODROMES).forEach(function (icao) {
      $("ad-" + icao).hidden = !perf || perf.involved.indexOf(icao) < 0;
    });
    if (!perf) return;
    perf.involved.forEach(function (icao) {
      container.appendChild($("ad-" + icao)); // keep the cards in route order
      var card = perf.cards[icao];
      $("roles-" + icao).textContent = perf.roles[icao].join(" · ");
      var missing = $("missing-" + icao);
      missing.hidden = !card.missing;
      missing.textContent = card.missing || "";
      // Weather stays visible (solo minima, shared weather); runways only with data.
      $("rwy-wrap-" + icao).hidden = !D.AERODROMES[icao].runways.length;
      if (icao === DEP) $("obstacle").hidden = !card.site;
      var canShare = !!card.source;
      $("same-wrap-" + icao).hidden = !canShare;
      $("same-label-" + icao).textContent = "Same weather as " + (card.source || "");
      var sharing = canShare && state.wx[icao].same;
      $("wx-" + icao).hidden = sharing;
      var bad = (perf.fieldErrors[icao] || []);
      WX_KEYS.forEach(function (key) {
        $(key + "-" + icao).setAttribute("aria-invalid", String(bad.some(function (b) { return b[0] === key; })));
      });
      setError("wx-" + icao, !sharing && bad.length ? "Enter the " + bad.map(function (b) { return b[1]; }).join(", ") + "." : "");

      if (icao === DEP) {
        $("obs-fields").hidden = !state.obstacle.on;
        setError("obs", state.obstacle.on ? card.obstacleError : "");
      }
      var html = "";
      if (card.minima) {
        var mn = card.minima;
        html += '<p class="minima">' + (mn.ok ? '<span class="chip chip-ok">OK</span>' : '<span class="chip chip-bad">Below</span>') +
          " Solo minima, " + (mn.crossCountry ? "cross-country" : "local flight") + " (OM C 5): " + mn.visKm +
          " km and " + mn.ceilFt + " ft. Here: " + n(card.wx.vis, 1) + " km, " +
          (card.wx.ceil === Infinity ? "no ceiling" : n(card.wx.ceil, 0) + " ft") + ".</p>";
      }
      html += card.reports.map(reportHtml).join("");
      html += allObstaclesHtml(icao);
      $("reports-" + icao).innerHTML = html;
    });
  }

  function renderDaylight(r) {
    var el = $("daylight-hint");
    var d = r.day;
    if (!d) {
      el.textContent = "";
      return;
    }
    if (d.sunset === undefined) {
      el.textContent = "Choose a destination from the list to work out the sunset.";
      return;
    }
    var local = lisbon(r.date, d.sunset);
    var text = (d.departureSun ? "Sunrise at " + DEP + " " + clock(d.departureSun.sunrise) + " UTC. " : "") +
      "Sunset at " + state.dest + " " + clock(d.sunset) + " UTC" + (local ? " (" + local + " in Portugal)" : "") +
      ", night from " + clock(d.nightFrom) + " UTC. ";
    text += d.margin
      ? "Land by " + clock(d.latestLanding) + " UTC (30 min before sunset, OM A), so take off by " +
        clock(d.latestTakeoff) + " UTC."
      : "Take off by " + clock(d.latestTakeoff) + " UTC to land before sunset.";
    if (d.landing !== undefined) text += " Planned landing " + clock(d.landing) + " UTC.";
    el.textContent = text;
  }

  function renderStatic() {
    var ac = aircraft();
    paintSeg("aircraft-seg", state.reg);
    paintSeg("wunit-seg", state.wUnit);
    paintSeg("funit-seg", state.fUnit);
    paintSeg("method-seg", state.method);
    paintSeg("rules-seg", state.rules);
    $("brand-ac").textContent = state.reg + " " + ac.type.replace("Cessna ", "C");
    $("fuel-unit").textContent = state.fUnit === "l" ? "L" : "gal";
    var fullGal = ac.usableFuelGal;
    $("fuel-hint").textContent = "Full: " + n(fullGal, 1) + " gal (" + n(fullGal * D.LITRES_PER_GAL, 1) +
      " L) usable, " + n(fullGal * D.FUEL_LB_PER_GAL, 0) + " lb.";
    $("alt-time-field").hidden = !altTyped();
    $("example-note").hidden = !state.example;
  }

  function renderSources() {
    var parts = Object.keys(D.AIRCRAFT).map(function (reg) {
      return reg + ": " + D.AIRCRAFT[reg].weighed.source;
    });
    Object.keys(D.AERODROMES).forEach(function (icao) {
      var ad = D.AERODROMES[icao];
      parts.push(icao + ": " + (ad.source || "no AIP data yet"));
    });
    $("sources").textContent = "Flying Academy Operations Manual Rev. 1 (Sep 2024). POH: C152 (1980 model) and " +
      "C172P (1980, rev. 2). " + parts.join(" · ") + ".";
  }

  // ------------------------------------------------- weather and NOTAMs

  var wx = { data: null, error: "", status: "", loading: false, filled: {} };

  function getJson(url, ms) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    return fetch(url, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      clearTimeout(timer);
      return data;
    }, function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  // Live weather from the relay, with anything it couldn't get (or all of it,
  // if the relay can't be reached) taken from the copy published with the app.
  function mergeWeather(live, copy) {
    if (!live) return copy ? Object.assign({}, copy, { live: false }) : null;
    var out = Object.assign({}, live, { live: true });
    if (copy) {
      ["metars", "tafs", "stations"].forEach(function (key) {
        (copy[key] || []).forEach(function (r) {
          if (!reportFor(out[key], r.icao)) out[key] = (out[key] || []).concat([r]);
        });
      });
    }
    return out;
  }

  // The relay (worker/) fetches the weather live when asked; weather.json is
  // the copy published with the app by the deploy workflow. manual: the
  // Refresh button, which says what it found.
  function loadWeather(manual) {
    if (wx.loading) return;
    var before = wx.data && wx.data.fetched;
    wx.loading = true;
    wx.status = "";
    var btn = $("wx-refresh");
    btn.disabled = true;
    btn.textContent = "Checking…";
    renderBriefing();
    var none = function () {
      return null;
    };
    Promise.all([
      D.WEATHER_RELAY ? getJson(D.WEATHER_RELAY, 30000).catch(none) : null,
      getJson("weather.json?t=" + Date.now(), 15000).catch(none),
    ]).then(function (got) {
      var data = mergeWeather(got[0], got[1]);
      if (!data) {
        if (wx.data) wx.status = "Couldn't check for newer weather. Is there signal?";
        else wx.error = "No weather here. It needs signal and the installed app (not the preview).";
        return;
      }
      wx.data = data;
      var errors = data.errors || (data.error ? [data.error] : []);
      wx.error = errors.length
        ? (data.live
          ? "Part of the weather didn't download just now. Older reports from the app's copy are shown where there are any."
          : "Part of the weather didn't download at the last update; what's missing is not shown.")
        : "";
      if (manual) {
        if (data.live) wx.status = "Updated with live weather.";
        else if (data.fetched === before) {
          wx.status = "Nothing newer on the server yet. For the wind right now, use Live wind on IPMA.";
        } else wx.status = "Updated.";
      }
    }).then(function () {
      wx.loading = false;
      btn.disabled = false;
      btn.textContent = "Refresh";
      renderBriefing();
    });
  }

  function routeAerodromes() {
    var list = [];
    [DEP].concat(state.stops.map(function (st) { return st.icao; }), [state.dest, state.alt],
      state.stops.map(function (st, i) { return stopAlt(i); })).forEach(function (icao) {
      if (icao && icao !== OTHER && list.indexOf(icao) < 0) list.push(icao);
    });
    return list;
  }

  function ageText(iso) {
    var minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(minutes)) return "";
    if (minutes < 1) return "just now";
    if (minutes < 120) return minutes + " min ago";
    return Math.round(minutes / 60) + " h ago";
  }
  function utcTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : clock(d.getUTCHours() * 60 + d.getUTCMinutes()) + " UTC";
  }

  function reportFor(list, icao) {
    return (list || []).filter(function (r) {
      return r.icao === icao;
    })[0];
  }

  // Nearest aerodrome in the app's list that has a METAR.
  function nearestMetar(icao) {
    var best = null;
    (wx.data.metars || []).forEach(function (m) {
      var ad = D.AERODROMES[m.icao];
      if (!ad || m.icao === icao) return;
      var nm = calc.distanceNm(D.AERODROMES[icao], ad);
      if (!best || nm < best.nm) best = { metar: m, nm: nm };
    });
    return best;
  }

  function renderBriefing() {
    var box = $("briefing");
    if (wx.loading && !wx.data) {
      box.innerHTML = '<p class="hint">Loading the latest reports…</p>';
      return;
    }
    if (!wx.data) {
      box.innerHTML = '<p class="missing">' + esc(wx.error) + "</p>";
      return;
    }
    var html = "";
    if (wx.data.fetched) {
      html += '<div class="wx-updated"><span>' + (wx.data.live ? "Live weather, downloaded" :
        "Weather downloaded for the app") + "</span>" + ageChip(wx.data.fetched, 30) + "</div>";
    }
    if (wx.status) html += '<p class="hint wx-status" role="status">' + esc(wx.status) + "</p>";
    if (wx.error) html += '<p class="missing">' + esc(wx.error) + "</p>";
    routeAerodromes().forEach(function (icao) {
      var ad = D.AERODROMES[icao];
      var station = reportFor(wx.data.stations, icao); // IPMA station at the aerodrome
      var own = reportFor(wx.data.metars, icao);
      var near = own ? null : nearestMetar(icao);
      var metar = own || (near && near.metar);
      var taf = reportFor(wx.data.tafs, metar ? metar.icao : icao);
      var shown = station || metar;
      html += '<div class="wx-report"><div class="wx-report-head"><span class="wx-report-title">' + icao + " · " +
        esc(ad.name) + "</span>";
      if (shown) html += ageChip(shown.time);
      html += "</div>";

      if (station) {
        var parts = [];
        if (station.qnh !== null) parts.push("QNH " + station.qnh);
        if (station.tempC !== null) parts.push(n(station.tempC, 1) + " °C");
        html += "<p>IPMA station at the aerodrome: wind <strong>" +
          (station.kt === 0 ? "calm" : pad(station.dir, 3) + "° " + station.kt + " kt") + "</strong>" +
          (station.maxKt !== null && station.maxKt > station.kt ? ", max " + station.maxKt + " kt" : "") +
          " (10-min mean)" + (parts.length ? ", " + parts.join(", ") : "") + ".</p>";
        html += '<div class="wx-buttons"><button type="button" class="btn-ghost" data-fill="' + icao +
          '" data-from="ipma">Fill ' + icao + " weather</button>" +
          '<a class="btn-ghost" href="' + esc(ad.ipma.page) + '" target="_blank" rel="noopener">Live wind on IPMA</a></div>';
        html += '<p class="hint">The station measures no visibility or cloud: ask the AFIS' +
          (metar ? ", or see the " + metar.icao + " METAR below." : ".") + "</p>";
      } else if (ad.ipma) {
        html += '<p>No recent data from the IPMA station. <a href="' + esc(ad.ipma.page) +
          '" target="_blank" rel="noopener">Live wind on IPMA</a></p>';
      }

      if (!metar) {
        if (!station) html += "<p>No METAR for " + icao + " or anywhere nearby in the data.</p>";
      } else {
        if (!own) {
          html += "<p>" + (station ? "" : "No METAR from " + icao + ". ") + "Nearest METAR: <strong>" + metar.icao +
            "</strong>, " + n(near.nm, 0) + " NM away" + (station ? ", " + esc(utcTime(metar.time)) : "") +
            ". Use it only as a guide for " + icao + ".</p>";
        }
        html += '<p class="wx-raw">' + esc(metar.raw) + "</p>";
        if (taf) {
          var tafHead = "TAF " + metar.icao + ", issued " + esc(utcTime(taf.issued));
          html += "<details><summary>" + tafHead + '</summary><p class="wx-raw">' + esc(taf.raw) + "</p></details>" +
            // printed open (a closed <details> doesn't print its content)
            '<div class="print-only"><p class="hint">' + tafHead + '</p><p class="wx-raw">' + esc(taf.raw) + "</p></div>";
        }
        if (own) {
          html += '<button type="button" class="btn-ghost" data-fill="' + icao + '" data-from="' + metar.icao +
            '">Fill ' + icao + " weather</button>";
        } else if (station) {
          html += '<button type="button" class="btn-ghost" data-fill="' + icao + '" data-from="' + metar.icao +
            '" data-only="visceil">Use ' + metar.icao + " visibility and ceiling</button>";
        } else {
          html += '<button type="button" class="btn-ghost" data-fill="' + icao + '" data-from="' + metar.icao + '">Fill ' +
            icao + " weather from " + metar.icao + "</button>";
        }
      }
      if (wx.filled[icao]) html += '<p class="hint">' + esc(wx.filled[icao]) + "</p>";
      html += "</div>";
    });
    box.innerHTML = html;
  }

  function ageChip(iso, oldAfterMin) {
    var old = (Date.now() - Date.parse(iso)) / 60000 > (oldAfterMin || 60);
    return '<span class="chip ' + (old ? "chip-warn" : "chip-ok") + '">' + esc(utcTime(iso)) + ", " +
      esc(ageText(iso)) + "</span>";
  }

  // Put weather into an aerodrome's fields: from its IPMA station ("ipma"),
  // from a METAR, or only a METAR's visibility and ceiling (only "visceil").
  function fillWeather(icao, from, only) {
    var w = state.wx[icao];
    var note;
    if (from === "ipma") {
      var s = reportFor(wx.data && wx.data.stations, icao);
      if (!s) return;
      if (s.qnh !== null) w.qnh = String(s.qnh);
      if (s.tempC !== null) w.oat = String(Math.round(s.tempC));
      w.dir = s.kt === 0 ? "" : String(s.dir);
      w.kt = String(s.kt);
      w.gust = s.maxKt !== null && s.maxKt > s.kt ? String(s.maxKt) : "";
      note = "Filled from the IPMA station at " + utcTime(s.time) + " (the 10-min maximum goes in Gust). " +
        "Add the visibility and ceiling.";
    } else {
      var metar = reportFor(wx.data && wx.data.metars, from);
      if (!metar) return;
      var p = calc.parseMetar(metar.raw);
      if (only !== "visceil") {
        if (p.qnh !== null) w.qnh = String(p.qnh);
        if (p.tempC !== null) w.oat = String(p.tempC);
        if (p.wind) {
          w.dir = p.wind.dir === null || p.wind.kt === 0 ? "" : String(p.wind.dir);
          w.kt = String(p.wind.kt);
          w.gust = p.wind.gust === null ? "" : String(p.wind.gust);
        }
      }
      if (p.visKm !== null) w.vis = p.cavok ? "cavok" : n(p.visKm, 1).replace(/\.0$/, "");
      w.ceil = p.ceilFt === Infinity ? "none" : String(p.ceilFt);
      note = (only === "visceil" ? "Visibility and ceiling from the " : "Filled from the ") + from + " METAR of " +
        utcTime(metar.time) + "." +
        (only !== "visceil" && p.wind && p.wind.variable && p.wind.kt > 0
          ? " The wind is variable: enter the direction to plan with." : "");
    }
    w.same = false;
    WX_KEYS.forEach(function (key) {
      $(key + "-" + icao).value = w[key];
    });
    $("same-" + icao).checked = false;
    wx.filled[icao] = note;
    changed();
  }

  function renderIppc() {
    var codes = routeAerodromes().join(" ");
    $("ippc-link").dataset.codes = codes;
    if (!$("ippc-hint").dataset.copied) {
      $("ippc-hint").textContent = "Copies " + codes + " to paste into IPPC's aerodrome briefing.";
    }
  }

  function bindBriefing() {
    $("wx-refresh").addEventListener("click", function () {
      loadWeather(true);
    });
    // Coming back to the app: fetch the latest copy without a message.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") loadWeather(false);
    });
    $("briefing").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-fill]");
      if (b) fillWeather(b.dataset.fill, b.dataset.from, b.dataset.only);
    });
    // Copy the route's codes, then let the link open IPPC as usual.
    $("ippc-link").addEventListener("click", function () {
      var codes = this.dataset.codes;
      var hint = $("ippc-hint");
      try {
        navigator.clipboard.writeText(codes).then(function () {
          hint.dataset.copied = "1";
          hint.textContent = "Copied " + codes + ". Paste it into IPPC's aerodrome briefing.";
        }, function () {
          hint.textContent = "Type " + codes + " into IPPC's aerodrome briefing.";
        });
      } catch (err) {
        hint.textContent = "Type " + codes + " into IPPC's aerodrome briefing.";
      }
    });
  }

  function changed(keepExample) {
    if (!keepExample) state.example = false;
    save();
    update();
  }

  function update() {
    renderStatic();
    var r = compute();
    last = r;
    renderErrors(r);
    renderSummary(r);
    renderPrintHead(r);
    renderSheet(r);
    renderLimits(r);
    renderChart(r);
    renderPerformance(r);
    renderDaylight(r);
    renderBriefing();
    renderIppc();
  }

  // ------------------------------------------------------------ what's new

  // Shown once after an update: the entries in changes.js this phone hasn't
  // seen yet. The footer button shows all of them.
  var SEEN_KEY = "lppm-mass-balance-seen-update";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function longDate(iso) {
    var p = iso.split("-");
    return Number(p[2]) + " " + MONTHS[Number(p[1]) - 1] + " " + p[0];
  }

  function readSeen() {
    try {
      var v = localStorage.getItem(SEEN_KEY);
      return v === null ? null : Number(v);
    } catch (e) {
      return undefined; // no storage here: don't show the note on every visit
    }
  }
  function writeSeen(id) {
    try {
      localStorage.setItem(SEEN_KEY, String(id));
    } catch (e) {
      /* nothing to remember it in */
    }
  }

  function showWhatsNew(entries, all) {
    var dlg = $("whatsnew");
    $("wn-kicker").textContent = all ? "All updates" : "Update of " + longDate(entries[0].date);
    // One list per day, newest first.
    var days = [];
    entries.forEach(function (entry) {
      var day = days[days.length - 1];
      if (!day || day.date !== entry.date) days.push((day = { date: entry.date, items: [] }));
      day.items = day.items.concat(entry.items);
    });
    var html = "";
    var i = 0;
    days.forEach(function (day, k) {
      if (all || days.length > 1) {
        html += '<p class="changes-date">' + (k === 0 ? "Latest · " : "") + longDate(day.date) + "</p>";
      }
      html += '<ol class="changes">';
      day.items.forEach(function (item, n) {
        html += '<li style="--i:' + i++ + '"><span class="n">' + pad(n + 1, 2) + '</span><span class="t">' +
          esc(item.title) + '</span><span class="d">' + esc(item.text) + "</span></li>";
      });
      html += "</ol>";
    });
    $("wn-body").innerHTML = html;
    $("wn-body").scrollTop = 0;
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
  }

  var latestUpdate = null;

  function closeWhatsNew() {
    var dlg = $("whatsnew");
    if (typeof dlg.close === "function") {
      dlg.close(); // the "close" event remembers it
    } else {
      dlg.removeAttribute("open");
      writeSeen(latestUpdate);
    }
  }

  function initWhatsNew() {
    var list = MB.changes || [];
    if (!list.length) return;
    var latest = (latestUpdate = list[0].id);
    var dlg = $("whatsnew");
    $("whatsnew-open").addEventListener("click", function () {
      showWhatsNew(list, true);
    });
    $("wn-close").addEventListener("click", closeWhatsNew);
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) closeWhatsNew(); // tap outside the card
    });
    dlg.addEventListener("close", function () {
      writeSeen(latest);
    });
    var seen = readSeen();
    if (seen === undefined) return;
    // Never seen a note: show the latest day's updates only.
    var fresh = list.filter(function (c) {
      return seen === null ? c.date === list[0].date : c.id > seen;
    });
    if (fresh.length) showWhatsNew(fresh, false);
  }

  // ---------------------------------------------------------------- start

  buildAircraft();
  buildStations();
  buildRoute();
  buildStops();
  buildAerodromes();
  fillSimpleInputs();
  bindSimpleInputs();
  renderSources();
  bindBriefing();
  bindPrint();
  update();
  loadWeather();
  initWhatsNew();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderChart(last);
    }, 120);
  });

  // Offline mode where the page is hosted normally (not inside previews).
  // It also looks for an update each time the app comes back on screen, and
  // reloads once when a new version takes over (inputs are saved as you type).
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try {
      var sw = navigator.serviceWorker;
      var hadVersion = !!sw.controller; // false on the very first visit: nothing to reload
      var reloading = false;
      sw.addEventListener("controllerchange", function () {
        if (!hadVersion || reloading) return;
        reloading = true;
        location.reload();
      });
      window.addEventListener("load", function () {
        sw.register("sw.js")
          .then(function (reg) {
            document.addEventListener("visibilitychange", function () {
              if (document.visibilityState === "visible") reg.update().catch(function () {});
            });
          })
          .catch(function () {});
      });
    } catch (e) {
      /* not allowed here; the page works anyway */
    }
  }
})();
