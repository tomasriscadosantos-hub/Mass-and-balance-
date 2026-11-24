/*
 * Mass & balance and performance calculations (no page code in here).
 * Load after data.js and poh.js. Works in the browser and in Node.
 *
 * Fuel (Flying Academy OM part C 2.1): trip and alternate fuel each include
 * 10 min for approach and landing (VFR); final reserve 45 min (VFR day).
 *
 * Runway checks, rules "om" (default - Flying Academy OM part C 1.2 / 1.4,
 * worked out at maximum take-off / landing mass):
 *   take-off: 50 ft distance x1.5 <= TORA
 *   landing:  50 ft distance x1.5 <= LDA
 * plus, for a student solo flight (OM part A 5.2.4):
 *   TORA at least 600 m, landing 50 ft distance x1.67 <= LDA (x1.92 on a
 *   contaminated runway), weather minima (OM C 5), crosswind
 *   (gusts included) within the student's limit - 50 % of the maximum
 *   demonstrated unless the instructor has raised it (up to 100 %).
 *
 * Rules "classb" (the previous school's sheet, EASA performance class B
 * factors, at the actual mass):
 *   take-off: ground roll <= TORA and 50 ft distance <= TODA, then
 *             with a clearway or stopway: 50 ft x1.15 <= TODA and x1.3 <= ASDA
 *             without:                    50 ft x1.25 <= TORA
 *   landing:  ground roll <= LDA and 50 ft distance <= 70 % of LDA
 *
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
    OM_FACTOR: 1.5, // OM C 1.2 / 1.4
    SOLO_LDA_FACTOR: 1.67, // OM A 5.2.4
    SOLO_LDA_FACTOR_CONTAMINATED: 1.92, // OM A 5.2.4, contaminated runway
    SUNSET_MARGIN_MIN: 30, // OM A: cross-country flights arrive 30 min before sunset
    // OM C 5: weather minima for a student solo flight (day)
    MINIMA: { local: { visKm: 5, ceilFt: 1500 }, xc: { visKm: 8, ceilFt: 2000 } },
    SOLO_MIN_TORA_M: 600, // OM A 5.2.4
    SOLO_XWIND_FRACTION: 0.5, // OM A 5.2.4: 50 % of the maximum demonstrated
    TODA_FACTOR: 1.15,
    ASDA_FACTOR: 1.3,
    TORA_FACTOR: 1.25,
    LDA_FRACTION: 0.7,
    GRASS_TAKEOFF: 0.15,
    GRASS_LANDING: 0.45,
    M_PER_NM: 1852,
    // Obstacles: the take-off flight path area as in EASA's aeroplane
    // performance rules: 90 m either side at the end of the take-off run,
    // widening by 12.5 % of the distance, at most 900 m; looked at out to 6 km.
    OBST_HALF_WIDTH_M: 90,
    OBST_SPLAY: 0.125,
    OBST_MAX_HALF_WIDTH_M: 900,
    OBST_RANGE_M: 6000,
    OBST_MARGIN_FT: 50, // less than this above an obstacle: a note
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

  // "38 31 47N" -> 38.5297
  function parseDms(text) {
    var m = /^(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s*([NSEW])$/.exec(String(text).trim());
    if (!m) throw new Error("Can't read the coordinate " + text);
    var deg = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
    return m[4] === "S" || m[4] === "W" ? -deg : deg;
  }

  // Great-circle distance in NM between two aerodromes (their ARPs).
  function distanceNm(a, b) {
    var rad = Math.PI / 180;
    var lat1 = parseDms(a.arp[0]) * rad, lon1 = parseDms(a.arp[1]) * rad;
    var lat2 = parseDms(b.arp[0]) * rad, lon2 = parseDms(b.arp[1]) * rad;
    var h = Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2);
    return 2 * 3440.065 * Math.asin(Math.sqrt(h));
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
   * input: { loads: [lb per station], fuelGal, tripH, altH, altLabel, solo,
   *          departureLabel, destLabel, stops }
   * tripH and altH are flight times; the 10 min approach and landing
   * allowance is added to each. stops (optional) are landings on the way,
   * in order: [{ label, tripH (from the point before), altH, altLabel,
   * refuelToGal (null: no fuel taken there) }]; tripH is then the last leg,
   * from the last stop. Each leg is a flight of its own: taxi, take-off,
   * trip, and the OM fuel (taxi + trip + alternate + final reserve) is
   * checked at each departure with the fuel carried from the last refuelling.
   * Returns the loading sheet, the conditions (ZFM, Ramp, TOM, LM, ALT, and
   * for each stop k: Lk landing, Rk ramp after refuelling, Tk take-off) with
   * their CG limits, the fuel figures and plan, and a list of problems.
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
    function subtotal(label, name, max, key) {
      sheet.push({ label: label, lb: w, arm: (m * 1000) / w, moment: m, subtotal: true });
      conditions.push({ name: name, key: key || name, label: label, lb: w, moment: m, max: max });
    }

    var bew = basicEmpty(ac);
    var lbPerHour = ac.fuelFlowGph * D.FUEL_LB_PER_GAL;
    var approachH = D.APPROACH_MIN / 60;
    var fuelLb = input.fuelGal * D.FUEL_LB_PER_GAL;
    var reserveLb = (D.FINAL_RESERVE_MIN / 60) * lbPerHour;
    var plus = " + " + hhmm(approachH);
    var gal = function (lb) {
      return lb / D.FUEL_LB_PER_GAL;
    };

    // The legs: to each stop, then to the destination.
    var legs = (input.stops || []).map(function (st) {
      return { to: st.label, tripH: st.tripH, altH: st.altH, altLabel: st.altLabel,
        refuelToGal: known(st.refuelToGal) ? st.refuelToGal : null };
    });
    legs.push({ to: input.destLabel || "destination", tripH: input.tripH, altH: input.altH,
      altLabel: input.altLabel, refuelToGal: null, final: true });
    var multi = legs.length > 1;

    add("Basic empty mass", bew.lb, bew.arm);
    ac.stations.forEach(function (st, i) {
      var lb = input.loads[i] || 0;
      if (lb) add(st.name, lb, st.arm);
    });
    subtotal("Zero fuel mass", "ZFM", null);
    add("Fuel " + input.fuelGal.toFixed(1) + " gal", fuelLb, ac.fuelArm);
    subtotal("Ramp mass", "Ramp", ac.maxRamp);

    var fuel = fuelLb; // on board now
    var plan = [];
    legs.forEach(function (leg, i) {
      var from = i === 0 ? input.departureLabel || D.DEPARTURE : legs[i - 1].to;
      var refuelled = i === 0;
      if (i > 0 && legs[i - 1].refuelToGal !== null) {
        var target = legs[i - 1].refuelToGal;
        var addLb = Math.max(0, target * D.FUEL_LB_PER_GAL - fuel);
        add("Refuel at " + from + " to " + target.toFixed(1) + " gal", addLb, ac.fuelArm);
        fuel += addLb;
        subtotal("Ramp mass at " + from, "Ramp " + from, ac.maxRamp, "R" + i);
        refuelled = true;
        if (target > ac.usableFuelGal + 1e-9) {
          problems.push("Refuel at " + from + ": " + target.toFixed(1) + " gal is more than the " +
            ac.usableFuelGal + " gal usable capacity");
        }
      }
      var tripLb = (leg.tripH + approachH) * lbPerHour;
      var altLb = (leg.altH + approachH) * lbPerHour;
      var blockLb = fuel;
      add(i === 0 ? "Taxi fuel" : "Taxi fuel at " + from, -ac.taxiFuelLb, ac.fuelArm);
      fuel -= ac.taxiFuelLb;
      if (i === 0) subtotal("Take-off mass", "TOM", ac.maxTakeoff);
      else subtotal("Take-off mass at " + from, "TOM " + from, ac.maxTakeoff, "T" + i);
      add("Trip fuel " + (multi ? "to " + leg.to + " " : "") + hhmm(leg.tripH) + plus, -tripLb, ac.fuelArm);
      fuel -= tripLb;
      if (leg.final) subtotal("Landing mass", "LM", ac.maxLanding);
      else subtotal("Landing mass at " + leg.to, "LM " + leg.to, ac.maxLanding, "L" + (i + 1));
      plan.push({ from: from, to: leg.to, refuelled: refuelled, altLabel: leg.altLabel, blockLb: blockLb,
        tripLb: tripLb, altLb: altLb, requiredLb: ac.taxiFuelLb + tripLb + altLb + reserveLb, landingLb: fuel });
    });
    var last = plan[plan.length - 1];
    add("Fuel to " + input.altLabel + " " + hhmm(input.altH) + plus, -last.altLb, ac.fuelArm);
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

    // OM C 2.1, at each departure: taxi + trip + alternate + final reserve.
    var capLb = ac.usableFuelGal * D.FUEL_LB_PER_GAL;
    var tanks = ac.usableFuelGal + " gal usable in the " + ac.type + "'s tanks";
    var avgasAt = Object.keys(D.AERODROMES || {}).filter(function (k) {
      return D.AERODROMES[k].avgas;
    }).join(", ");
    plan.forEach(function (p) {
      p.ok = p.blockLb >= p.requiredLb - 1e-9;
      p.overCapacity = p.requiredLb > capLb + 1e-9;
      if (p.ok) return;
      var parts = "taxi, trip, alternate " + (multi ? p.altLabel + " " : "") + "and " + D.FINAL_RESERVE_MIN +
        " min final reserve";
      if (p.overCapacity) {
        // More than the tanks hold: loading more can't fix it.
        problems.push("Fuel" + (multi ? " " + p.from + "–" + p.to : "") + ": needs " +
          gal(p.requiredLb).toFixed(1) + " gal (" + parts + "), more than the " + tanks +
          ": plan a shorter leg or a nearer alternate");
      } else {
        problems.push(multi
          ? "Fuel " + p.from + "–" + p.to + ": " + gal(p.blockLb).toFixed(1) + " gal on board at " + p.from + ", " +
            gal(p.requiredLb).toFixed(1) + " gal required (" + parts + ")"
          : "Fuel: " + input.fuelGal.toFixed(1) + " gal on board, " + gal(p.requiredLb).toFixed(1) +
            " gal required (" + parts + ")");
      }
    });
    // Where fuel is loaded (the departure and each refuelling stop): the least
    // to load there for every leg until the next refuelling.
    var fuelling = [];
    plan.forEach(function (p, i) {
      if (!p.refuelled) return;
      var burn = 0;
      var need = 0;
      var legsCovered = [];
      for (var j = i; j < plan.length && (j === i || !plan[j].refuelled); j++) {
        need = Math.max(need, burn + plan[j].requiredLb);
        burn += ac.taxiFuelLb + plan[j].tripLb;
        legsCovered.push(plan[j]);
      }
      var fp = { at: p.from, leg: i, minGal: gal(need), haveGal: gal(p.blockLb),
        until: legsCovered.map(function (l) { return l.to; }), overCapacity: need > capLb + 1e-9 };
      fuelling.push(fp);
      // The legs together need more than the tanks hold, though each fits
      // alone: there has to be a refuelling between them.
      var eachFits = legsCovered.every(function (l) { return !l.overCapacity; });
      if (fp.overCapacity && legsCovered.length > 1 && eachFits) {
        problems.push("Fuel " + p.from + " → " + fp.until.join(" → ") + ": needs at least " +
          fp.minGal.toFixed(1) + " gal at " + p.from + ", more than the " + tanks +
          ", so it can't be flown without refuelling on the way (AVGAS at " + avgasAt + ") or a nearer " +
          "alternate");
      }
    });
    var requiredLb = fuelling[0].minGal * D.FUEL_LB_PER_GAL;
    var leftLb = last.landingLb - last.altLb;
    var leftMin = (leftLb / lbPerHour) * 60;

    var flownH = legs.reduce(function (sum, leg) {
      return sum + leg.tripH + approachH;
    }, 0);
    if (input.solo && ac.maxSoloHours && flownH > ac.maxSoloHours + 1e-9) {
      problems.push("Solo: " + hhmm(flownH) + " planned" + (multi ? " in all" : "") + " is over the " +
        hhmm(ac.maxSoloHours) + " maximum for a student solo flight in the " + ac.type);
    }

    var byName = {};
    conditions.forEach(function (c) {
      byName[c.key] = c;
    });
    return {
      bew: bew,
      sheet: sheet,
      conditions: conditions,
      byName: byName,
      fuel: {
        leftLb: leftLb,
        leftGal: gal(leftLb),
        leftMin: leftMin,
        taxiGal: gal(ac.taxiFuelLb),
        tripGal: gal(plan[0].tripLb),
        altGal: gal(plan[0].altLb),
        reserveGal: gal(reserveLb),
        requiredGal: gal(requiredLb),
        extraGal: gal(fuelLb - requiredLb),
        legs: plan.map(function (p) {
          return { from: p.from, to: p.to, refuelled: p.refuelled, altLabel: p.altLabel, ok: p.ok,
            blockGal: gal(p.blockLb), requiredGal: gal(p.requiredLb), tripGal: gal(p.tripLb),
            altGal: gal(p.altLb), landingGal: gal(p.landingLb) };
        }),
        fuelling: fuelling,
      },
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

  // Best rate of climb speed (KIAS) from the POH climb table, at the nearest altitude.
  function climbSpeed(typeKey, pa) {
    var P = MB.poh;
    var rows = P.TYPES[typeKey].climb;
    var nearest = 0;
    for (var i = 1; i < P.CLIMB_ALTS.length; i++) {
      if (Math.abs(P.CLIMB_ALTS[i] - Math.max(pa, 0)) <
          Math.abs(P.CLIMB_ALTS[nearest] - Math.max(pa, 0))) nearest = i;
    }
    return rows[nearest][0];
  }

  // [climb speed KIAS, max rate of climb ft/min] or null outside the table.
  function climb(typeKey, pa, oat) {
    var P = MB.poh;
    var rate = grid(P.TYPES[typeKey].climb.map(function (r) {
      return r.slice(1);
    }), P.CLIMB_ALTS, P.CLIMB_TEMPS, pa, oat, 1, 0);
    return rate === null ? null : [climbSpeed(typeKey, pa), rate];
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
   * Take-off or landing check on the runway in use.
   * site: { icao, elevationFt, rwy, weather: { qnh, oat, dir, kt, gust } }
   * opts: { rules: "om" | "classb", solo: bool, xwindLimitKt: number|null }
   * With the OM rules the distances are worked out at the maximum take-off /
   * landing mass, whatever mass is passed in.
   */
  function runwayCheck(ac, kind, site, mass, opts) {
    opts = opts || {};
    var rules = opts.rules === "classb" ? "classb" : "om";
    var solo = !!opts.solo;
    var type = MB.poh.TYPES[ac.perf];
    var isTakeoff = kind === "take-off";
    var wx = site.weather;
    // Without runway data (only the elevation): zero wind, nothing to check against.
    var noRunway = !site.rwy;
    var rwy = site.rwy || { rwy: null, bearing: null, tora: null, toda: null, asda: null, lda: null,
      surface: "paved" };
    var pa = pressureAltitude(site.elevationFt, wx.qnh);
    var wc = noRunway ? [0, 0] : windComponents(runwayBearing(rwy), wx.dir, wx.kt);
    var head = wc[0];
    var cross = wc[1];
    var gustCross = !noRunway && known(wx.gust) ? windComponents(runwayBearing(rwy), wx.dir, wx.gust)[1] : cross;
    var where = kind + " " + site.icao + (noRunway ? "" : " RWY " + rwy.rwy);
    var massNote = null;
    if (rules === "om") {
      mass = isTakeoff ? ac.maxTakeoff : ac.maxLanding;
      massNote = isTakeoff ? "MTOM" : "MLM";
    }
    var result = {
      kind: kind,
      rules: rules,
      solo: solo,
      icao: site.icao,
      rwy: rwy,
      noRunway: noRunway,
      mass: mass,
      massNote: massNote,
      weather: wx,
      head: head,
      cross: cross,
      gustCross: gustCross,
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
    if (noRunway) {
      result.corrections.push("no wind correction (runway direction not in the data)");
    } else if (Math.abs(head) >= 0.5) {
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

    if (rules === "om") {
      if (isTakeoff) {
        check("50 ft ×" + C.OM_FACTOR, dist * C.OM_FACTOR, "TORA", rwy.tora);
        if (solo) check("Solo: minimum TORA", C.SOLO_MIN_TORA_M, "TORA", rwy.tora);
      } else {
        check("50 ft ×" + C.OM_FACTOR, dist * C.OM_FACTOR, "LDA", rwy.lda);
        if (solo) {
          var f = site.contaminated ? C.SOLO_LDA_FACTOR_CONTAMINATED : C.SOLO_LDA_FACTOR;
          check("Solo: 50 ft ×" + f, dist * f, "LDA", rwy.lda);
        }
      }
    } else if (isTakeoff) {
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
    // Crosswind including gusts (OM C 1.4 note, OM A 5.2.4).
    var xwLimit = type.maxCrosswindKt;
    var xwWhat = "the " + type.maxCrosswindKt + " kt maximum demonstrated";
    if (solo) {
      xwLimit = known(opts.xwindLimitKt) ? opts.xwindLimitKt : type.maxCrosswindKt * C.SOLO_XWIND_FRACTION;
      xwWhat = "the student's " + xwLimit + " kt solo limit";
    }
    result.xwindLimitKt = xwLimit;
    if (gustCross > xwLimit + 1e-9) {
      result.warnings.push("crosswind " + gustCross.toFixed(0) + " kt" +
        (known(wx.gust) ? " in the gusts" : "") + " is above " + xwWhat);
    }
    result.warnings.forEach(function (w) {
      result.problems.push(where + ": " + w);
    });
    // Information only.
    result.notes = [];
    if (site.contaminated) {
      result.notes.push("contaminated runway: the POH distances are for a dry runway, expect them to be longer");
    }
    if (!noRunway && !known(rwy.surface)) {
      result.notes.push("runway surface not in the data yet: worked out as paved (no grass correction)");
    }
    // The POH has no slope correction: say so where the slope makes it longer.
    if (!noRunway && known(rwy.slopePct)) {
      var pct = Math.abs(rwy.slopePct).toFixed(1);
      if (isTakeoff && rwy.slopePct > 0) {
        result.notes.push("RWY " + rwy.rwy + " slopes up about " + pct + " %: the POH has no slope correction, " +
          "so the take-off distance will be longer (UK CAA guidance: about 5 % per 1 % of slope)");
      } else if (!isTakeoff && rwy.slopePct < 0) {
        result.notes.push("RWY " + rwy.rwy + " slopes down about " + pct + " %: the POH has no slope correction, " +
          "so the landing distance will be longer (UK CAA guidance: about 5 % per 1 % of slope)");
      }
    }
    return result;
  }

  /*
   * Reads the parts of a METAR the app needs: wind (dir null when variable),
   * visibility (km), ceiling (lowest BKN/OVC/VV in ft above the aerodrome,
   * Infinity when none), temperature, dew point and QNH. Stops at the trend
   * (TEMPO, BECMG, NOSIG) and the remarks.
   */
  function parseMetar(raw) {
    var tokens = String(raw).trim().replace(/=$/, "").split(/\s+/);
    var out = { raw: raw, icao: null, wind: null, visKm: null, cavok: false, clouds: [],
      tempC: null, dewC: null, qnh: null };
    var i = 0;
    if (tokens[i] === "METAR" || tokens[i] === "SPECI") i++;
    out.icao = tokens[i++] || null;
    var t = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[i] || "");
    if (t) {
      out.day = Number(t[1]);
      out.hour = Number(t[2]);
      out.minute = Number(t[3]);
      i++;
    }
    function temp(s) {
      return s.charAt(0) === "M" ? -Number(s.slice(1)) : Number(s);
    }
    for (; i < tokens.length; i++) {
      var tok = tokens[i];
      var m;
      if (/^(TEMPO|BECMG|NOSIG|RMK)$/.test(tok)) break;
      if (!out.wind && (m = /^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(tok))) {
        var f = m[4] === "MPS" ? 1.94384 : 1;
        out.wind = { dir: m[1] === "VRB" ? null : Number(m[1]), kt: Math.round(Number(m[2]) * f),
          gust: m[3] ? Math.round(Number(m[3]) * f) : null, variable: m[1] === "VRB" };
      } else if (tok === "CAVOK") {
        out.cavok = true;
        out.visKm = 10;
      } else if (out.visKm === null && (m = /^(\d{4})(NDV|[NSEW]{1,2})?$/.exec(tok))) {
        out.visKm = m[1] === "9999" ? 10 : Number(m[1]) / 1000;
      } else if (out.visKm === null && (m = /^P?(\d+)SM$/.exec(tok))) {
        out.visKm = Number(m[1]) * 1.609;
      } else if ((m = /^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)/.exec(tok))) {
        out.clouds.push({ cover: m[1], baseFt: m[2] === "///" ? null : Number(m[2]) * 100 });
      } else if ((m = /^(M?\d{2})\/(M?\d{2})?$/.exec(tok))) {
        out.tempC = temp(m[1]);
        out.dewC = m[2] ? temp(m[2]) : null;
      } else if ((m = /^Q(\d{4})$/.exec(tok))) {
        out.qnh = Number(m[1]);
      } else if ((m = /^A(\d{4})$/.exec(tok))) {
        out.qnh = Math.round((Number(m[1]) / 100) * 33.8639);
      }
    }
    var bases = out.clouds.filter(function (c) {
      return /^(BKN|OVC|VV)$/.test(c.cover) && c.baseFt !== null;
    }).map(function (c) {
      return c.baseFt;
    });
    out.ceilFt = bases.length ? Math.min.apply(null, bases) : Infinity;
    return out;
  }

  // OM C 5: visibility (km) and ceiling (ft AGL, Infinity = none) against the
  // student solo minima, local (aerodrome) or cross-country.
  function minimaCheck(crossCountry, visKm, ceilFt) {
    var m = crossCountry ? C.MINIMA.xc : C.MINIMA.local;
    var out = { crossCountry: crossCountry, visKm: m.visKm, ceilFt: m.ceilFt, problems: [] };
    if (visKm < m.visKm) {
      out.problems.push("visibility " + round(visKm, 1) + " km is below the " + m.visKm + " km solo minimum");
    }
    if (ceilFt < m.ceilFt) {
      out.problems.push("ceiling " + Math.round(ceilFt) + " ft is below the " + m.ceilFt + " ft solo minimum");
    }
    out.ok = out.problems.length === 0;
    return out;
  }

  /*
   * Sun times at an aerodrome on a date, in minutes after 00:00 UTC: start of
   * morning civil twilight, sunrise, sunset and end of evening civil twilight
   * (night begins). NOAA solar equations; within 2 min of NAV Portugal's
   * sunrise/sunset tables. dateText: "2026-11-21".
   */
  function sunTimes(dateText, ad) {
    var p = String(dateText).split("-").map(Number);
    var day = (Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 0)) / 864e5;
    var rad = Math.PI / 180;
    var lat = parseDms(ad.arp[0]) * rad;
    var lon = parseDms(ad.arp[1]);
    function event(zenith, rising, hourUtc) {
      var g = ((2 * Math.PI) / 365) * (day - 1 + (hourUtc - 12) / 24);
      var eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
        0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
        0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      var cosH = Math.cos(zenith * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
      var ha = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad;
      return 720 - 4 * (lon + (rising ? ha : -ha)) - eqTime;
    }
    return {
      twilightStart: event(96, true, 7),
      sunrise: event(90.833, true, 7),
      sunset: event(90.833, false, 18),
      twilightEnd: event(96, false, 18),
    };
  }

  function sunsetUtcMin(dateText, ad) {
    return sunTimes(dateText, ad).sunset;
  }

  /*
   * Daylight planning. input: { date, takeoffMin (UTC minutes or null), tripH,
   * altH, departure, dest (aerodrome or null), alt (aerodrome or null),
   * crossCountry }. Landing = take-off + flight time + 10 min approach.
   * Cross-country flights must land 30 min before sunset at the destination
   * (OM A); local flights before sunset. Take-off before sunrise is flagged.
   */
  function daylight(input) {
    var D = MB.data;
    var out = { margin: input.crossCountry ? C.SUNSET_MARGIN_MIN : 0 };
    if (input.departure) {
      out.departureSun = sunTimes(input.date, input.departure);
      if (known(input.takeoffMin)) out.beforeSunrise = input.takeoffMin < out.departureSun.sunrise;
    }
    if (!input.dest) return out;
    var flightMin = input.tripH * 60 + D.APPROACH_MIN;
    var sun = sunTimes(input.date, input.dest);
    out.sunset = sun.sunset;
    out.nightFrom = sun.twilightEnd;
    out.latestLanding = out.sunset - out.margin;
    out.latestTakeoff = out.latestLanding - flightMin;
    if (known(input.takeoffMin)) {
      out.landing = input.takeoffMin + flightMin;
      out.ok = out.landing <= out.latestLanding + 1e-9;
      if (input.alt && known(input.altH)) {
        out.altSunset = sunsetUtcMin(input.date, input.alt);
        out.altLanding = out.landing + input.altH * 60 + D.APPROACH_MIN;
        out.altOk = out.altLanding <= out.altSunset + 1e-9;
      }
    }
    return out;
  }

  /*
   * Max rate of climb after take-off and the optional obstacle clearance.
   * obstacle: { nm, elevationFt, limitFt (or null), gs }
   */
  // ------------------------------------------------------------ obstacles

  /*
   * Where an obstacle is for a take-off on rwy: along = metres beyond the end
   * of the take-off run (negative: behind it), cross = metres right (+) or
   * left (-) of the extended centre line, assumed = the AIP gives no position.
   * null if the obstacle is given for another runway only.
   */
  function obstacleOffset(rwy, ob) {
    if (ob.ahead) {
      var rwys = [].concat(ob.ahead.rwy);
      if (rwys.indexOf(rwy.rwy) < 0) return null;
      return { along: ob.ahead.m, cross: ob.ahead.cross || 0, assumed: !ob.ahead.cross };
    }
    if (!ob.pos || !rwy.toraEnd) return null;
    var lat0 = parseDms(rwy.toraEnd[0]), lon0 = parseDms(rwy.toraEnd[1]);
    var north = (parseDms(ob.pos[0]) - lat0) * 111132;
    var east = (parseDms(ob.pos[1]) - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    var b = (runwayBearing(rwy) * Math.PI) / 180;
    return {
      along: east * Math.sin(b) + north * Math.cos(b),
      cross: east * Math.cos(b) - north * Math.sin(b),
      assumed: false,
    };
  }

  // Distance (m) and true bearing (degrees) of a position from the aerodrome
  // reference point.
  function fromArp(ad, pos) {
    var lat0 = parseDms(ad.arp[0]), lon0 = parseDms(ad.arp[1]);
    var north = (parseDms(pos[0]) - lat0) * 111132;
    var east = (parseDms(pos[1]) - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180);
    return { m: Math.sqrt(north * north + east * east),
      brg: ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360 };
  }

  function inTakeoffPath(off) {
    if (!off || off.along <= 0 || off.along > C.OBST_RANGE_M) return false;
    var half = Math.min(C.OBST_HALF_WIDTH_M + C.OBST_SPLAY * off.along, C.OBST_MAX_HALF_WIDTH_M);
    return Math.abs(off.cross) <= half;
  }

  // The obstacles in the take-off path of rwy, nearest first.
  function takeoffObstacles(rwy, obstacles) {
    return (obstacles || []).map(function (ob) {
      var off = obstacleOffset(rwy, ob);
      return off && inTakeoffPath(off) ? { ob: ob, along: off.along, cross: off.cross, assumed: off.assumed } : null;
    }).filter(Boolean).sort(function (a, b) {
      return a.along - b.along;
    });
  }

  // The obstacles under the approach to rwy: those in the take-off path of
  // the opposite direction, measured from the end of its take-off run.
  function approachObstacles(rwy, runways, obstacles) {
    var opposite = (runways || []).filter(function (r) {
      var d = Math.abs(((runwayBearing(r) - runwayBearing(rwy) + 540) % 360) - 180);
      return d > 170;
    })[0];
    return opposite ? takeoffObstacles(opposite, obstacles) : [];
  }

  /*
   * Clearance over the obstacles after a take-off (report from runwayCheck):
   * 50 ft at the end of the POH take-off distance (with the wind, not
   * factored), then the POH best rate of climb at the climb speed, the true
   * airspeed about 2 % above it per 1000 ft of density altitude, less the
   * headwind. list from takeoffObstacles; limitFt caps the altitude.
   */
  function obstacleClearance(ac, site, report, list, limitFt) {
    var c = climb(ac.perf, report.pa, site.weather.oat);
    var out = { climb: c, rows: [], problems: [], notes: [] };
    if (!c || report.outside || report.noRunway || !known(report.rwy.tora)) return out;
    var tas = c[0] * (1 + (0.02 * Math.max(report.da, 0)) / 1000);
    var gs = Math.max(tas - report.head, 20);
    var grad = c[1] / ((gs * C.M_PER_NM) / 60); // ft per metre
    var tora = report.rwy.tora;
    var where = "take-off " + site.icao + " RWY " + report.rwy.rwy;
    out.tas = tas;
    out.gs = gs;
    out.ftPerNm = grad * C.M_PER_NM;
    list.forEach(function (o) {
      var row = { what: o.ob.what, elevFt: o.ob.elevFt, along: o.along, cross: o.cross, assumed: o.assumed,
        manual: !!o.ob.manual };
      if (known(o.ob.elevFt)) {
        var fromStart = tora + o.along;
        var h = fromStart >= report.dist ? 50 + grad * (fromStart - report.dist) : (50 * fromStart) / report.dist;
        // heights from the far end of the take-off run where it's lower (a sloping runway)
        var alt = (known(report.rwy.endElevFt) ? report.rwy.endElevFt : site.elevationFt) + h;
        if (known(limitFt) && alt > limitFt) {
          alt = limitFt;
          row.limited = true;
        }
        row.altFt = alt;
        row.clearance = alt - o.ob.elevFt;
        row.ok = row.clearance > 0;
        var name = o.ob.what + " (" + Math.round(o.ob.elevFt) + " ft) " + Math.round(o.along) + " m beyond the runway";
        if (!row.ok) out.problems.push(where + ": " + name + " not cleared (" + Math.round(row.clearance) + " ft)");
        else if (row.clearance < C.OBST_MARGIN_FT) {
          out.notes.push(where + ": " + name + " cleared by only " + Math.round(row.clearance) + " ft");
        }
      }
      out.rows.push(row);
    });
    return out;
  }

  function pad0(x, len) {
    var s = String(Math.round(x));
    while (s.length < len) s = "0" + s;
    return s;
  }

  // "1.2 km" or "450 m" past the end of the take-off run.
  function aheadText(m) {
    return (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m / 10) * 10 + " m") + " past the runway end";
  }

  /*
   * The departure briefing, in the order of the school's SOP (departure crew
   * briefing), for a take-off report from runwayCheck, with report.obstacles
   * from obstacleClearance where the runway is known. The speeds come from
   * ac.departure. Returns { items: [[what, text], ...], source, normal }.
   */
  function departureBriefing(ac, report) {
    var s = ac.departure || {};
    var wx = report.weather;
    var rwy = report.rwy;
    var items = [["Departure", "VFR"]];
    items.push(["Runway", report.noRunway ? "not in the data" : rwy.rwy]);

    // TORR: the largest distance the rules compare with TORA.
    var torr = null;
    (report.lines || []).forEach(function (l) {
      if (/^TORA/.test(l.name) && !/^Solo/.test(l.label) && (torr === null || l.need > torr)) torr = l.need;
    });
    var tora = report.noRunway ? null : rwy.tora;
    items.push(["TORA / TORR", (known(tora) ? Math.round(tora) + " m" : "–") + " / " +
      (report.outside ? "outside the POH table" : torr === null ? "–" : Math.round(torr) + " m")]);

    var obs = report.obstacles;
    var obsText;
    if (!obs || !obs.climb || report.noRunway || !known(rwy.tora)) {
      obsText = "not checked here";
    } else if (!obs.rows.length) {
      obsText = "NIL in the AIP";
    } else {
      // The one cleared by the least (or the nearest, without elevations).
      var worst = obs.rows.reduce(function (a, b) {
        if (!known(b.clearance)) return a;
        return !known(a.clearance) || b.clearance < a.clearance ? b : a;
      }, obs.rows[0]);
      obsText = "YES: " + worst.what.charAt(0).toLowerCase() + worst.what.slice(1) +
        (known(worst.elevFt) ? " " + Math.round(worst.elevFt) + " ft AMSL" : "") + ", " + aheadText(worst.along) +
        (known(worst.clearance)
          ? (worst.ok ? ", cleared by " + Math.round(worst.clearance) + " ft" : ", NOT cleared (" + Math.round(worst.clearance) + " ft)")
          : "") +
        (obs.rows.length > 1 ? " (" + obs.rows.length + " in the take-off path)" : "");
    }
    items.push(["Obstacles", obsText]);

    var gust = known(wx.gust);
    var wind = !wx.kt ? "calm" : pad0(wx.dir, 3) + "/" + pad0(wx.kt, 2) + (gust ? "G" + pad0(wx.gust, 2) : "");
    var side = null;
    if (!report.noRunway && wx.kt) {
      var sin = Math.sin(((wx.dir - runwayBearing(rwy)) * Math.PI) / 180);
      if (Math.abs(sin * wx.kt) >= 0.5) side = sin > 0 ? "right" : "left";
    }
    var windText = wind;
    if (!report.noRunway && wx.kt) {
      windText += side
        ? ", crosswind " + Math.round(report.cross) + " kt from the " + side +
          (gust && Math.round(report.gustCross) > Math.round(report.cross) ? " (" + Math.round(report.gustCross) + " in gusts)" : "")
        : ", no crosswind";
      if (report.head <= -0.5) windText += ", tailwind " + Math.round(-report.head) + " kt";
    }
    items.push(["Wind", windText]);
    items.push(["Ailerons", report.noRunway ? "into the wind" : side ? side + ", into the wind, on the ground roll" : "neutral"]);

    if (known(s.vr)) items.push(["Vr", s.vr + " KIAS"]);
    var vy = climbSpeed(ac.perf, report.pa);
    var vx = s.vx ? Math.round(s.vx[0] + ((s.vx[1] - s.vx[0]) * Math.min(Math.max(report.pa, 0), 10000)) / 10000) : null;
    items.push(["Vy / Vx", vy + (vx === null ? "" : " / " + vx) + " KIAS"]);
    if (s.climbOut) items.push(["Climb", s.climbOut]);
    if (s.engineFailure) items.push(["Engine failure after take-off", s.engineFailure]);
    return { items: items, source: s.source || null, normal: s.normal || null };
  }

  // Best rate of climb at the departure (POH, maximum weight).
  function climbCheck(ac, site) {
    var pa = pressureAltitude(site.elevationFt, site.weather.qnh);
    return { climb: climb(ac.perf, pa, site.weather.oat), problems: [] };
  }

  MB.calc = {
    C: C,
    settings: settings,
    hhmm: hhmm,
    distanceNm: distanceNm,
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
    obstacleOffset: obstacleOffset,
    fromArp: fromArp,
    takeoffObstacles: takeoffObstacles,
    approachObstacles: approachObstacles,
    obstacleClearance: obstacleClearance,
    climbSpeed: climbSpeed,
    departureBriefing: departureBriefing,
    minimaCheck: minimaCheck,
    parseMetar: parseMetar,
    sunTimes: sunTimes,
    sunsetUtcMin: sunsetUtcMin,
    daylight: daylight,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MB.calc;
})(typeof window !== "undefined" ? window : globalThis);
