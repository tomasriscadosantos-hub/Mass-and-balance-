/*
 * Mass & balance and performance calculations (no page code in here).
 * Load after data.js and poh.js. Works in the browser and in Node.
 *
 * Performance checks follow the school's performance sheet (same factors as
 * EASA performance class B):
 *   take-off: ground roll <= TORA and 50 ft distance <= TODA, then
 *             with a clearway or stopway: 50 ft x1.15 <= TODA and x1.3 <= ASDA
 *             without:                    50 ft x1.25 <= TORA
 *   landing:  ground roll <= LDA and 50 ft distance <= 70 % of LDA
 * POH corrections: -10 % per 9 kt headwind, +10 % per 2 kt tailwind (up to
 * 10 kt); dry grass +15 % (take-off) / +45 % (landing) of the ground roll.
 */
(function (root) {
  "use strict";
  var MB = (root.MB = root.MB || {});
  if (typeof require !== "undefined" && (!MB.data || !MB.poh)) {
    require("./data.js");
    require("./poh.js");
  }

  var C = {
    FT_PER_HPA: 27, // pressure altitude = elevation + (1013 - QNH) x 27 ft
    M_PER_FT: 0.3048,
    MAX_TAILWIND_KT: 10, // the POH corrections only go up to 10 kt
    TODA_FACTOR: 1.15,
    ASDA_FACTOR: 1.3,
    TORA_FACTOR: 1.25,
    LDA_FRACTION: 0.7,
    GRASS_TAKEOFF: 0.15,
    GRASS_LANDING: 0.45,
  };

  // false: interpolate between table values (more exact).
  // true:  read the table at the next higher weight, altitude and
  //        temperature - the POH sample problem's conservative method.
  var settings = { nextHigher: false };

  // ---------------------------------------------------------------- helpers

  function hhmm(hours) {
    var minutes = Math.round(hours * 60);
    return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
  }

  function round(x, digits) {
    var f = Math.pow(10, digits);
    return Math.round(x * f) / f;
  }

  // ------------------------------------------------------- mass and balance

  function basicEmpty(ac) {
    var lb = ac.weighed.lb;
    var moment = ac.weighed.moment;
    ac.addToWeighed.forEach(function (add) {
      lb += add.lb;
      moment += (add.lb * add.arm) / 1000;
    });
    return { lb: lb, moment: moment, arm: (moment * 1000) / lb };
  }

  function forwardLimit(ac, lb) {
    var w1 = ac.cgForward[0][0], cg1 = ac.cgForward[0][1];
    var w2 = ac.cgForward[1][0], cg2 = ac.cgForward[1][1];
    if (lb <= w1) return cg1;
    return cg1 + ((cg2 - cg1) * (lb - w1)) / (w2 - w1);
  }

  /*
   * input: { loads: [lb per station], fuelGal, tripH, altH, altLabel }
   * Returns the loading sheet, the conditions (ZFM, Ramp, TOM, LM, ALT) with
   * their CG limits, the fuel left at the alternate and a list of problems.
   */
  function massBalance(ac, input) {
    var D = MB.data;
    var sheet = [];
    var conditions = [];
    var problems = [];
    var w = 0;
    var m = 0;

    function add(label, lb, arm) {
      var moment = (lb * arm) / 1000;
      w += lb;
      m += moment;
      sheet.push({ label: label, lb: lb, arm: arm, moment: moment, subtotal: false });
    }
    function subtotal(label, name, max) {
      sheet.push({ label: label, lb: w, arm: (m * 1000) / w, moment: m, subtotal: true });
      conditions.push({ name: name, label: label, lb: w, moment: m, max: max });
    }

    var bew = basicEmpty(ac);
    var fuelLb = input.fuelGal * D.FUEL_LB_PER_GAL;
    var tripLb = input.tripH * ac.fuelFlowGph * D.FUEL_LB_PER_GAL;
    var altLb = input.altH * ac.fuelFlowGph * D.FUEL_LB_PER_GAL;

    add("Basic empty mass", bew.lb, bew.arm);
    ac.stations.forEach(function (st, i) {
      var lb = input.loads[i] || 0;
      if (lb) add(st.name, lb, st.arm);
    });
    subtotal("Zero fuel mass", "ZFM", null);
    add("Fuel " + input.fuelGal.toFixed(1) + " gal", fuelLb, ac.fuelArm);
    subtotal("Ramp mass", "Ramp", ac.maxRamp);
    add("Taxi fuel", -ac.taxiFuelLb, ac.fuelArm);
    subtotal("Take-off mass", "TOM", ac.maxTakeoff);
    add("Trip fuel " + hhmm(input.tripH), -tripLb, ac.fuelArm);
    subtotal("Landing mass", "LM", ac.maxLanding);
    add("Fuel to " + input.altLabel + " " + hhmm(input.altH), -altLb, ac.fuelArm);
    subtotal("Mass at " + input.altLabel, "ALT", ac.maxLanding);

    conditions.forEach(function (c) {
      c.cg = (c.moment * 1000) / c.lb;
      c.fwd = forwardLimit(ac, c.lb);
      c.aft = ac.cgAft;
      c.status = [];
      if (c.max && round(c.lb, 1) > c.max) {
        c.status.push("over max by " + (c.lb - c.max).toFixed(1) + " lb");
      }
      if (round(c.cg, 2) < round(c.fwd, 2)) c.status.push("CG too far forward");
      if (round(c.cg, 2) > c.aft) c.status.push("CG too far aft");
      c.ok = c.status.length === 0;
      c.status.forEach(function (s) {
        problems.push(c.name + ": " + s);
      });
    });

    var baggage = 0;
    ac.stations.forEach(function (st, i) {
      var lb = input.loads[i] || 0;
      if (st.max && lb > st.max) {
        problems.push(st.name + ": " + lb.toFixed(0) + " lb is over its " + st.max + " lb limit");
      }
      if (st.baggage) baggage += lb;
    });
    if (baggage > ac.maxBaggage) {
      problems.push("Baggage: " + baggage.toFixed(0) + " lb in total is over the " +
        ac.maxBaggage + " lb limit");
    }
    if (input.fuelGal > ac.usableFuelGal + 1e-9) {
      problems.push("Fuel: " + input.fuelGal.toFixed(1) + " gal is more than the " +
        ac.usableFuelGal + " gal usable capacity");
    }

    var leftLb = fuelLb - ac.taxiFuelLb - tripLb - altLb;
    var leftMin = (leftLb / (ac.fuelFlowGph * D.FUEL_LB_PER_GAL)) * 60;
    if (leftLb < 0) {
      problems.push("Fuel: not enough fuel for the trip and the alternate");
    } else if (leftMin < D.FINAL_RESERVE_MIN) {
      problems.push("Fuel: less than the " + D.FINAL_RESERVE_MIN +
        " min final reserve left at " + input.altLabel);
    }

    var byName = {};
    conditions.forEach(function (c) {
      byName[c.name] = c;
    });
    return {
      bew: bew,
      sheet: sheet,
      conditions: conditions,
      byName: byName,
      fuel: { leftLb: leftLb, leftGal: leftLb / D.FUEL_LB_PER_GAL, leftMin: leftMin },
      problems: problems,
    };
  }

  // ------------------------------------------------------------ POH tables

  function between(value, points) {
    for (var i = 0; i < points.length - 1; i++) {
      if (points[i] <= value && value <= points[i + 1]) {
        var f = (value - points[i]) / (points[i + 1] - points[i]);
        return [i, settings.nextHigher && f > 0 ? 1 : f];
      }
    }
    return null;
  }

  // Interpolate one quantity in a POH table; null if outside the table.
  // Below sea level / below the coldest column the S.L. / coldest values are
  // used (slightly longer distances, so on the safe side).
  function grid(rows, alts, temps, pa, oat, width, col) {
    pa = Math.max(pa, alts[0]);
    oat = Math.max(oat, temps[0]);
    var a = between(pa, alts);
    var t = between(oat, temps);
    if (!a || !t) return null;
    var total = 0;
    for (var di = 0; di <= 1; di++) {
      var wa = di ? a[1] : 1 - a[1];
      for (var dj = 0; dj <= 1; dj++) {
        var wt = dj ? t[1] : 1 - t[1];
        if (wa * wt === 0) continue;
        var value = rows[a[0] + di][(t[0] + dj) * width + col];
        if (value === null || value === undefined) return null;
        total += value * wa * wt;
      }
    }
    return total;
  }

  function weights(tables) {
    return Object.keys(tables).map(Number).sort(function (x, y) {
      return x - y;
    });
  }

  function byWeight(tables, weight, value) {
    var ws = weights(tables);
    var w = Math.min(Math.max(weight, ws[0]), ws[ws.length - 1]);
    if (ws.length === 1) return value(tables[ws[0]]);
    var b = between(w, ws);
    var low = value(tables[ws[b[0]]]);
    var high = value(tables[ws[b[0] + 1]]);
    if (low === null || high === null) return null;
    return low + (high - low) * b[1];
  }

  // Speeds of the nearest POH weight at or above this weight.
  function speedsFor(tables, weight) {
    var ws = weights(tables);
    var heavier = ws.filter(function (w) {
      return w >= weight;
    });
    var row = tables[heavier.length ? heavier[0] : ws[ws.length - 1]];
    return row.slice(0, -1);
  }

  function distances(tables, weight, pa, oat) {
    var P = MB.poh;
    var dist = [0, 1].map(function (col) {
      return byWeight(tables, weight, function (t) {
        return grid(t[t.length - 1], P.ALTS, P.TEMPS, pa, oat, 2, col);
      });
    });
    return { roll: dist[0], total: dist[1], speeds: speedsFor(tables, weight) };
  }

  function takeoff(typeKey, weight, pa, oat) {
    return distances(MB.poh.TYPES[typeKey].takeoff, weight, pa, oat);
  }

  function landing(typeKey, weight, pa, oat) {
    return distances(MB.poh.TYPES[typeKey].landing, weight, pa, oat);
  }

  // [climb speed KIAS, max rate of climb ft/min] or null outside the table.
  function climb(typeKey, pa, oat) {
    var P = MB.poh;
    var rows = P.TYPES[typeKey].climb;
    var nearest = 0;
    for (var i = 1; i < P.CLIMB_ALTS.length; i++) {
      if (Math.abs(P.CLIMB_ALTS[i] - Math.max(pa, 0)) <
          Math.abs(P.CLIMB_ALTS[nearest] - Math.max(pa, 0))) nearest = i;
    }
    var rate = grid(rows.map(function (r) {
      return r.slice(1);
    }), P.CLIMB_ALTS, P.CLIMB_TEMPS, pa, oat, 1, 0);
    return rate === null ? null : [rows[nearest][0], rate];
  }

  // ----------------------------------------------------------- performance

  function pressureAltitude(elevationFt, qnh) {
    return elevationFt + (1013 - qnh) * C.FT_PER_HPA;
  }

  // PA + 120 ft for each degree C above ISA (ISA = 15 C - 2 C per 1000 ft).
  function densityAltitude(pa, oat) {
    return pa + 120 * (oat - (15 - (2 * pa) / 1000));
  }

  // [headwind, crosswind] in kt; a negative headwind is a tailwind.
  function windComponents(runwayBearing, windDir, windKt) {
    var angle = ((windDir - runwayBearing) * Math.PI) / 180;
    return [windKt * Math.cos(angle), Math.abs(windKt * Math.sin(angle))];
  }

  function windFactor(headwind) {
    if (headwind >= 0) return 1 - (0.1 * headwind) / 9;
    return 1 + (0.1 * -headwind) / 2;
  }

  // Apply the POH wind and grass corrections to the ground roll and total.
  function corrected(roll, total, headwind, grass, grassPct) {
    var f = windFactor(headwind);
    roll *= f;
    total *= f;
    if (grass) {
      var extra = roll * grassPct;
      roll += extra;
      total += extra;
    }
    return [roll, total];
  }

  function runwayBearing(rwy) {
    return rwy.bearing === null || rwy.bearing === undefined
      ? parseInt(rwy.rwy.slice(0, 2), 10) * 10
      : rwy.bearing;
  }

  // The runway most into wind.
  function bestRunway(runways, windDir, windKt) {
    var best = null;
    var bestHead = -Infinity;
    runways.forEach(function (r) {
      var head = windComponents(runwayBearing(r), windDir, windKt)[0];
      if (head > bestHead) {
        best = r;
        bestHead = head;
      }
    });
    return best;
  }

  function known(x) {
    return x !== null && x !== undefined;
  }

  /*
   * Take-off or landing check on the runway in use, laid out like the
   * school's performance sheet.
   * site: { icao, elevationFt, rwy, weather: { qnh, oat, dir, kt } }
   */
  function runwayCheck(ac, kind, site, mass) {
    var type = MB.poh.TYPES[ac.perf];
    var isTakeoff = kind === "take-off";
    var wx = site.weather;
    var rwy = site.rwy;
    var pa = pressureAltitude(site.elevationFt, wx.qnh);
    var wc = windComponents(runwayBearing(rwy), wx.dir, wx.kt);
    var head = wc[0];
    var cross = wc[1];
    var where = kind + " " + site.icao + " RWY " + rwy.rwy;
    var result = {
      kind: kind,
      icao: site.icao,
      rwy: rwy,
      mass: mass,
      weather: wx,
      head: head,
      cross: cross,
      pa: pa,
      da: densityAltitude(pa, wx.oat),
      note: isTakeoff ? type.takeoffNote : type.landingNote,
      lines: [],
      warnings: [],
      problems: [],
      unchecked: false,
    };

    var poh = (isTakeoff ? takeoff : landing)(ac.perf, mass, pa, wx.oat);
    result.speeds = poh.speeds;
    if (poh.roll === null) {
      result.outside = true;
      result.problems.push(where + ": outside the POH performance table");
      return result;
    }
    result.poh = { roll: poh.roll, total: poh.total };

    var grass = rwy.surface === "grass";
    var grassPct = isTakeoff ? C.GRASS_TAKEOFF : C.GRASS_LANDING;
    result.corrections = [];
    if (Math.abs(head) >= 0.5) {
      var change = (windFactor(head) - 1) * 100;
      result.corrections.push((change > 0 ? "+" : "−") + Math.abs(change).toFixed(1) + " % for the " +
        (head >= 0 ? "headwind" : "tailwind"));
    } else {
      result.corrections.push("no wind correction");
    }
    if (grass) {
      result.corrections.push("+" + Math.round(grassPct * 100) + " % of the ground roll for grass");
    }
    var c = corrected(poh.roll, poh.total, head, grass, grassPct);
    var run = c[0] * C.M_PER_FT;
    var dist = c[1] * C.M_PER_FT;
    result.run = run;
    result.dist = dist;

    function check(label, need, name, available) {
      var line = { label: label, need: need, name: name, available: available, ok: null };
      if (known(available)) {
        line.ok = need <= available;
        if (!line.ok) {
          result.problems.push(where + ": " + label + " " + need.toFixed(0) +
            " m is more than " + name + " (" + available.toFixed(0) + " m)");
        }
      } else {
        result.unchecked = true;
      }
      result.lines.push(line);
    }

    if (isTakeoff) {
      check("Ground roll", run, "TORA", rwy.tora);
      check("50 ft clearance", dist, "TODA", rwy.toda);
      if (known(rwy.tora) && known(rwy.toda) && known(rwy.asda)) {
        if (rwy.toda > rwy.tora || rwy.asda > rwy.tora) {
          check("50 ft ×" + C.TODA_FACTOR, dist * C.TODA_FACTOR, "TODA", rwy.toda);
          check("50 ft ×" + C.ASDA_FACTOR, dist * C.ASDA_FACTOR, "ASDA", rwy.asda);
        } else {
          check("50 ft ×" + C.TORA_FACTOR, dist * C.TORA_FACTOR, "TORA/TODA/ASDA", rwy.tora);
        }
      }
    } else {
      check("Ground roll", run, "LDA", rwy.lda);
      check("50 ft clearance", dist, Math.round(C.LDA_FRACTION * 100) + " % LDA",
        known(rwy.lda) ? rwy.lda * C.LDA_FRACTION : null);
    }

    if (-head > C.MAX_TAILWIND_KT) {
      result.warnings.push("tailwind " + (-head).toFixed(0) + " kt is more than the " +
        C.MAX_TAILWIND_KT + " kt the POH covers");
    }
    if (cross > type.maxCrosswindKt) {
      result.warnings.push("crosswind " + cross.toFixed(0) + " kt is above the " +
        type.maxCrosswindKt + " kt maximum demonstrated");
    }
    result.warnings.forEach(function (w) {
      result.problems.push(where + ": " + w);
    });
    return result;
  }

  /*
   * Max rate of climb after take-off and the optional obstacle clearance.
   * obstacle: { nm, elevationFt, limitFt (or null), gs }
   */
  function climbCheck(ac, site, obstacle) {
    var pa = pressureAltitude(site.elevationFt, site.weather.qnh);
    var c = climb(ac.perf, pa, site.weather.oat);
    var result = { climb: c, problems: [] };
    if (!c) {
      if (obstacle) result.problems.push("climb " + site.icao + ": outside the POH table");
      return result;
    }
    if (!obstacle) return result;
    var minutes = (obstacle.nm / obstacle.gs) * 60;
    var climbFt = c[1] * minutes;
    var reach = site.elevationFt + climbFt;
    var crossAt = reach;
    var limited = false;
    if (known(obstacle.limitFt) && reach > obstacle.limitFt) {
      crossAt = obstacle.limitFt;
      limited = true;
    }
    var clearance = crossAt - obstacle.elevationFt;
    result.obstacle = {
      nm: obstacle.nm,
      elevationFt: obstacle.elevationFt,
      limitFt: obstacle.limitFt,
      gs: obstacle.gs,
      minutes: minutes,
      climbFt: climbFt,
      reach: reach,
      crossAt: crossAt,
      limited: limited,
      clearance: clearance,
      ok: clearance > 0,
    };
    if (clearance <= 0) {
      result.problems.push("obstacle after take-off " + site.icao + ": clearance " +
        clearance.toFixed(0) + " ft");
    }
    return result;
  }

  MB.calc = {
    C: C,
    settings: settings,
    hhmm: hhmm,
    basicEmpty: basicEmpty,
    forwardLimit: forwardLimit,
    massBalance: massBalance,
    takeoff: takeoff,
    landing: landing,
    climb: climb,
    pressureAltitude: pressureAltitude,
    densityAltitude: densityAltitude,
    windComponents: windComponents,
    windFactor: windFactor,
    corrected: corrected,
    runwayBearing: runwayBearing,
    bestRunway: bestRunway,
    runwayCheck: runwayCheck,
    climbCheck: climbCheck,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MB.calc;
})(typeof window !== "undefined" ? window : globalThis);
