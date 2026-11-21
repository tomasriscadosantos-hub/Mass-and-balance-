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

  var EXAMPLE = {
    example: true,
    reg: "OK-KUN",
    wUnit: "kg",
    loads: ["75", "85", "", ""],
    fUnit: "gal",
    fuel: "40.0",
    fuelFull: true,
    dest: "LPPM",
    tripH: "1",
    tripM: "00",
    alt: "LPEV",
    altH: "",
    altM: "",
    wx: {
      LPPM: { qnh: "1013", oat: "15", dir: "", kt: "", rwy: "auto", same: false },
      LPFR: { qnh: "", oat: "", dir: "", kt: "", rwy: "auto", same: true },
      LPEV: { qnh: "1015", oat: "30", dir: "310", kt: "8", rwy: "auto", same: true },
    },
    obstacle: { on: false, nm: "", elev: "", limit: "", gs: "" },
    method: "interp",
  };

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

    var alt = D.ALTERNATES.map(function (icao) {
      var ad = D.AERODROMES[icao];
      return '<option value="' + icao + '">' + icao + " · " + esc(ad.name) + " · " +
        ad.nmFromDeparture + " NM, " + calc.hhmm(ad.nmFromDeparture / ac.cruiseKt) + "</option>";
    });
    alt.push('<option value="' + OTHER + '">Other (type the time)</option>');
    $("alt").innerHTML = alt.join("");
    $("alt").value = state.alt;
    $("alt-hint").textContent = "Times from " + DEP + " at " + ac.cruiseKt + " kt, " +
      ac.fuelFlowGph + " gal/h.";
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
        '<label class="checkbox"><input type="checkbox" id="obs-on"> Check an obstacle after take-off</label>' +
        '<div class="wx" id="obs-fields">' +
        wxField("obs", "nm", "Distance", "NM", "decimal") +
        wxField("obs", "elev", "Obstacle elevation", "ft", "numeric") +
        wxField("obs", "limit", "Altitude limit", "ft", "numeric", "none") +
        wxField("obs", "gs", "Climb ground speed", "kt", "numeric") +
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
        "</div>" +
        '<p class="error" id="err-wx-' + icao + '" hidden></p>' +
        '<div class="field"><label for="rwy-' + icao + '">Runway in use</label><select id="rwy-' + icao + '">' +
        rwys + "</select></div>" + obstacle + "</div>" +
        '<div class="reports" id="reports-' + icao + '"></div>';
      box.appendChild(el);

      ["qnh", "oat", "dir", "kt"].forEach(function (key) {
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
    });

    var on = $("obs-on");
    on.checked = state.obstacle.on;
    on.addEventListener("change", function () {
      state.obstacle.on = on.checked;
      changed();
    });
    ["nm", "elev", "limit", "gs"].forEach(function (key) {
      var input = $(key + "-obs");
      input.value = state.obstacle[key];
      input.addEventListener("input", function () {
        state.obstacle[key] = input.value;
        changed();
      });
    });
  }

  function fillSimpleInputs() {
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
      changed();
    });
    $("alt").addEventListener("change", function (e) {
      state.alt = e.target.value;
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
      var x = parse(state.fuel);
      if (x !== null && !isNaN(x)) {
        state.fuel = before === "gal" ? n(x * D.LITRES_PER_GAL, 1) : n(x / D.LITRES_PER_GAL, 1);
      }
      if (state.fuelFull) state.fuel = fullFuelText(aircraft());
      $("fuel").value = state.fuel;
    });
    bindSeg("method-seg", "method");
  }

  function rebuildAll() {
    buildStations();
    buildRoute();
    fillSimpleInputs();
    Object.keys(D.AERODROMES).forEach(function (icao) {
      ["qnh", "oat", "dir", "kt"].forEach(function (key) {
        $(key + "-" + icao).value = state.wx[icao][key];
      });
      $("same-" + icao).checked = !!state.wx[icao].same;
      $("rwy-" + icao).value = state.wx[icao].rwy;
    });
    $("obs-on").checked = state.obstacle.on;
    ["nm", "elev", "limit", "gs"].forEach(function (key) {
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

  function readWeather(icao, fieldErrors) {
    var w = state.wx[icao];
    var qnh = parse(w.qnh);
    var oat = parse(w.oat);
    var dir = parse(w.dir);
    var kt = parse(w.kt);
    var bad = [];
    if (qnh === null || isNaN(qnh) || qnh < 900 || qnh > 1100) bad.push(["qnh", "QNH (900 to 1100 hPa)"]);
    if (oat === null || isNaN(oat) || oat < -60 || oat > 60) bad.push(["oat", "OAT in °C"]);
    if (kt === null) kt = 0;
    if (isNaN(kt) || kt < 0 || kt > 60) bad.push(["kt", "wind speed in kt"]);
    if (dir === null) {
      if (kt > 0) bad.push(["dir", "wind direction"]);
      dir = 0;
    } else if (isNaN(dir) || dir < 0 || dir > 360) {
      bad.push(["dir", "wind direction (0 to 360°)"]);
    }
    fieldErrors[icao] = bad;
    if (bad.length) return null;
    return { qnh: qnh, oat: oat, dir: dir, kt: kt };
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
    if (altIcao) {
      altH = D.AERODROMES[altIcao].nmFromDeparture / ac.cruiseKt;
    } else {
      altH = readTime(state.altH, state.altM);
      if (altH === null) errors.alt = "Enter the flight time to the alternate.";
      else if (isNaN(altH)) errors.alt = "Enter hours and minutes as numbers.";
    }

    var result = { ac: ac, errors: errors, problems: [], notices: [], perf: null, mb: null };
    if (Object.keys(errors).length) return result;

    result.mb = calc.massBalance(ac, {
      loads: loads,
      fuelGal: fuelGal,
      tripH: tripH,
      altH: altH,
      altLabel: altIcao || "alternate",
    });
    result.problems = result.mb.problems.slice();
    result.perf = performance(ac, result.mb, altIcao);
    result.problems = result.problems.concat(result.perf.problems);
    result.notices = result.perf.notices;
    return result;
  }

  function performance(ac, mb, altIcao) {
    var dest = state.dest === OTHER ? null : state.dest;
    var involved = [];
    [DEP, dest, altIcao].forEach(function (icao) {
      if (icao && involved.indexOf(icao) < 0) involved.push(icao);
    });
    var roles = {};
    function role(icao, label) {
      if (!icao) return;
      (roles[icao] = roles[icao] || []).push(label);
    }
    role(DEP, "Departure");
    role(dest, "Destination");
    role(altIcao, "Alternate");

    var out = { involved: involved, roles: roles, cards: {}, problems: [], notices: [], fieldErrors: {} };
    var source = null; // first aerodrome with data: the others can reuse its weather
    involved.forEach(function (icao) {
      var ad = D.AERODROMES[icao];
      var card = (out.cards[icao] = { reports: [], source: source });
      if (ad.elevationFt === null || !ad.runways.length) {
        card.missing = "Elevation and runways for " + icao + " are not in the data yet, so the take-off " +
          "and landing can't be worked out here. Add them to js/data.js from the AIP.";
        out.notices.push(icao + ": elevation and runways not in the data yet");
        return;
      }
      var useSame = source && state.wx[icao].same;
      var weather = useSame ? out.cards[source].weather : readWeather(icao, out.fieldErrors);
      if (!source) source = icao;
      if (!weather) {
        card.waiting = true;
        out.notices.push(icao + ": enter the weather to work out the performance");
        return;
      }
      card.weather = weather;
      var choice = state.wx[icao].rwy;
      var rwy = ad.runways.filter(function (r) {
        return r.rwy === choice;
      })[0] || calc.bestRunway(ad.runways, weather.dir, weather.kt);
      card.site = { icao: icao, elevationFt: ad.elevationFt, rwy: rwy, weather: weather };
      card.pa = calc.pressureAltitude(ad.elevationFt, weather.qnh);
    });

    var m = mb.byName;
    [
      ["take-off", DEP, m.TOM.lb, "Take-off"],
      ["landing", dest, m.LM.lb, "Landing"],
      ["take-off", altIcao, m.TOM.lb, "Take-off at the alternate (take-off mass, as if refuelled)"],
      ["landing", altIcao, m.ALT.lb, "Landing at the alternate"],
    ].forEach(function (ev) {
      var card = ev[1] && out.cards[ev[1]];
      if (!card || !card.site) return;
      var r = calc.runwayCheck(ac, ev[0], card.site, ev[2]);
      r.title = ev[3];
      card.reports.push(r);
      out.problems = out.problems.concat(r.problems);
      if (r.unchecked && !card.uncheckedNoted) {
        card.uncheckedNoted = true;
        out.notices.push(ev[1] + ": declared distances not in the data yet, runway length not checked");
      }
    });

    var depCard = out.cards[DEP];
    if (depCard && depCard.site) {
      var c = calc.climb(ac.perf, depCard.pa, depCard.site.weather.oat);
      var obstacle = null;
      var o = state.obstacle;
      depCard.obstacleError = "";
      if (o.on) {
        var nm = parse(o.nm), elev = parse(o.elev), limit = parse(o.limit), gs = parse(o.gs);
        if (gs === null && c) gs = c[0];
        if (nm === null || elev === null) {
          depCard.obstacleError = "Enter the distance and elevation of the obstacle.";
        } else if (isNaN(nm) || nm <= 0 || isNaN(elev) || (limit !== null && isNaN(limit)) ||
                   gs === null || isNaN(gs) || gs <= 0) {
          depCard.obstacleError = "Enter numbers: distance in NM, heights in ft, speed in kt.";
        } else {
          obstacle = { nm: nm, elevationFt: elev, limitFt: limit, gs: gs };
        }
      }
      depCard.climb = calc.climbCheck(ac, depCard.site, obstacle);
      depCard.climbSpeed = c ? c[0] : null;
      out.problems = out.problems.concat(depCard.climb.problems);
    }
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
    ["fuel", "trip", "alt"].forEach(function (k) {
      setError(k, r.errors[k]);
    });
    $("fuel").setAttribute("aria-invalid", String(!!r.errors.fuel));
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
    var notices = r.notices;
    var title;
    if (problems.length) {
      chip.className = "chip chip-lg chip-bad";
      chip.textContent = problems.length + (problems.length === 1 ? " problem" : " problems");
      title = '<span class="verdict-title bad">Not within limits</span>';
    } else if (notices.length) {
      chip.className = "chip chip-lg chip-warn";
      chip.textContent = "Not all checked";
      title = '<span class="verdict-title ok">No problems found</span>' +
        '<span class="chip chip-warn">' + notices.length + " not checked</span>";
    } else {
      chip.className = "chip chip-lg chip-ok";
      chip.textContent = "Within limits";
      title = '<span class="verdict-title ok">Within limits</span>';
    }
    var items = problems.map(function (p) {
      return '<li><span class="chip chip-bad">Limit</span><span>' + esc(p) + "</span></li>";
    }).concat(notices.map(function (p) {
      return '<li><span class="chip chip-warn">Not checked</span><span>' + esc(p) + "</span></li>";
    }));

    var mb = r.mb;
    var tom = mb.byName.TOM;
    var altLabel = state.alt === OTHER ? "alternate" : state.alt;
    box.innerHTML = '<div class="verdict">' + title + "</div>" +
      (items.length ? '<ul class="issues">' + items.join("") + "</ul>" : "") +
      '<div class="figures">' +
      figure("Take-off mass", n(tom.lb, 1) + " lb", n(tom.lb / D.LB_PER_KG, 0) + " kg · max " + r.ac.maxTakeoff) +
      figure("CG at take-off", n(tom.cg, 2) + " in", n(tom.fwd, 2) + " – " + n(tom.aft, 2) + " in") +
      figure("Fuel at " + altLabel, n(mb.fuel.leftGal, 1) + " gal", "about " + n(Math.max(mb.fuel.leftMin, 0), 0) + " min") +
      "</div>";
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
    $("fuel-left").textContent = "Fuel left at " + altLabel + ": " + n(f.leftGal, 1) + " gal (" + n(f.leftLb, 0) +
      " lb), about " + n(f.leftMin, 0) + " min at " + r.ac.fuelFlowGph + " gal/h. Final reserve: " +
      D.FINAL_RESERVE_MIN + " min (VFR day).";
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
    var pts = ["TOM", "LM", "ALT", "ZFM"].map(function (k) {
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

    var line = pts.slice(0, 3).map(function (p) { return sx(p.x).toFixed(1) + "," + sy(p.y).toFixed(1); }).join(" ");
    svg.push('<polyline class="path" points="' + line + '"/>');
    svg.push('<polyline class="path-zero" points="' + sx(pts[2].x).toFixed(1) + "," + sy(pts[2].y).toFixed(1) + " " +
      sx(pts[3].x).toFixed(1) + "," + sy(pts[3].y).toFixed(1) + '"/>');

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
    var wind = wx.kt ? pad(wx.dir, 3) + "/" + pad(wx.kt, 2) : "calm";
    var facts = "RWY " + esc(r.rwy.rwy) + " · " + n(r.mass, 0) + " lb · wind " + wind + " → " +
      (r.head >= 0 ? "headwind " : "tailwind ") + n(Math.abs(r.head), 0) + " kt, crosswind " + n(r.cross, 0) +
      " kt · OAT " + n(wx.oat, 0) + " °C · QNH " + n(wx.qnh, 0) + " · PA " + n(r.pa, 0) + " ft · DA " +
      n(r.da, 0) + " ft";
    var html = '<div class="report"><div class="report-head"><span class="report-title">' + esc(r.title) +
      "</span>" + head + '</div><p class="facts">' + facts + "</p>";
    if (r.outside) {
      return html + "<p>Outside the POH table: pressure altitude or temperature too high.</p></div>";
    }
    html += "<p>Short field, " + esc(r.note) + ": " + (isTakeoff
      ? "lift-off " + r.speeds[0] + " KIAS, " + r.speeds[1] + " KIAS at 50 ft"
      : r.speeds[0] + " KIAS at 50 ft") + ".</p>";
    html += "<p>POH, zero wind, paved: ground roll " + n(r.poh.roll, 0) + " ft, 50 ft " + n(r.poh.total, 0) +
      " ft. Corrections: " + esc(r.corrections.join(", ")) + ".</p>";
    html += '<div class="table-scroll"><table class="data"><tbody>' + r.lines.map(function (l) {
      var avail = l.available === null || l.available === undefined ? "–" : n(l.available, 0) + " m";
      var chip = l.ok === null ? '<span class="chip chip-warn">no data</span>' :
        l.ok ? '<span class="chip chip-ok">OK</span>' : '<span class="chip chip-bad">Too long</span>';
      return "<tr><td>" + esc(l.label) + "</td><td>" + n(l.need, 0) + " m</td><td>" + (l.ok === false ? "&gt;" : "&lt;") +
        "</td><td>" + esc(l.name) + " " + avail + '</td><td class="status">' + chip + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    if (isTakeoff && r.unchecked && r.lines.length === 2) {
      html += '<p class="hint">The ×1.15 / ×1.3 or ×1.25 checks need TORA, TODA and ASDA.</p>';
    }
    r.warnings.forEach(function (w) {
      html += '<p class="warnline">! ' + esc(w.charAt(0).toUpperCase() + w.slice(1)) + ".</p>";
    });
    return html + "</div>";
  }

  function climbHtml(card) {
    var c = card.climb;
    if (!c) return "";
    if (!c.climb) return '<div class="report"><p>Rate of climb: outside the POH table.</p></div>';
    var html = '<div class="report"><div class="report-head"><span class="report-title">Climb</span>' +
      (c.obstacle ? (c.obstacle.ok ? '<span class="chip chip-ok">Clears the obstacle</span>' :
        '<span class="chip chip-bad">Does not clear</span>') : "") + "</div>" +
      "<p>Max rate of climb " + n(c.climb[1], 0) + " ft/min at " + c.climb[0] +
      " KIAS (POH, max weight, flaps up).</p>";
    var o = c.obstacle;
    if (o) {
      html += "<p>Obstacle " + n(o.nm, 1) + " NM away at " + n(o.elevationFt, 0) + " ft: at " + n(o.gs, 0) +
        " kt that takes " + n(o.minutes, 1) + " min, climbing " + n(o.climbFt, 0) + " ft to " + n(o.reach, 0) +
        " ft." + (o.limited ? " Altitude limit " + n(o.limitFt, 0) + " ft, so you cross it at " +
        n(o.crossAt, 0) + " ft." : "") + " Clearance <strong>" + n(o.clearance, 0) + " ft</strong>.</p>";
    }
    return html + "</div>";
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
      $("inputs-" + icao).hidden = !!card.missing;
      if (card.missing) {
        $("reports-" + icao).innerHTML = "";
        return;
      }
      var canShare = !!card.source;
      $("same-wrap-" + icao).hidden = !canShare;
      $("same-label-" + icao).textContent = "Same weather as " + (card.source || "");
      var sharing = canShare && state.wx[icao].same;
      $("wx-" + icao).hidden = sharing;
      var bad = (perf.fieldErrors[icao] || []);
      ["qnh", "oat", "dir", "kt"].forEach(function (key) {
        $(key + "-" + icao).setAttribute("aria-invalid", String(bad.some(function (b) { return b[0] === key; })));
      });
      setError("wx-" + icao, !sharing && bad.length ? "Enter the " + bad.map(function (b) { return b[1]; }).join(", ") + "." : "");

      if (icao === DEP) {
        $("obs-fields").hidden = !state.obstacle.on;
        $("gs-obs").placeholder = card.climbSpeed ? String(card.climbSpeed) : "";
        setError("obs", state.obstacle.on ? card.obstacleError : "");
      }
      var html = card.reports.map(reportHtml).join("");
      if (icao === DEP) html += climbHtml(card);
      $("reports-" + icao).innerHTML = html;
    });
  }

  function renderStatic() {
    var ac = aircraft();
    paintSeg("aircraft-seg", state.reg);
    paintSeg("wunit-seg", state.wUnit);
    paintSeg("funit-seg", state.fUnit);
    paintSeg("method-seg", state.method);
    $("brand-ac").textContent = state.reg + " " + ac.type.replace("Cessna ", "C");
    $("fuel-unit").textContent = state.fUnit === "l" ? "L" : "gal";
    var fullGal = ac.usableFuelGal;
    $("fuel-hint").textContent = "Full: " + n(fullGal, 1) + " gal (" + n(fullGal * D.LITRES_PER_GAL, 1) +
      " L) usable, " + n(fullGal * D.FUEL_LB_PER_GAL, 0) + " lb.";
    $("alt-time-field").hidden = state.alt !== OTHER;
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
    $("sources").textContent = "POH: C152 (1980 model) and C172P (1980, rev. 2). " + parts.join(" · ") + ".";
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
    renderSheet(r);
    renderLimits(r);
    renderChart(r);
    renderPerformance(r);
  }

  // ---------------------------------------------------------------- start

  buildAircraft();
  buildStations();
  buildRoute();
  buildAerodromes();
  fillSimpleInputs();
  bindSimpleInputs();
  renderSources();
  update();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      renderChart(last);
    }, 120);
  });

  // Offline mode where the page is hosted normally (not inside previews).
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      try {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      } catch (e) {
        /* not allowed here; the page works anyway */
      }
    });
  }
})();
