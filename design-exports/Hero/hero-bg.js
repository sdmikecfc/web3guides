/* ============================================================
   Launch Wars S2 — cinematic sea (canvas placeholder for the
   final hero video loop). Palette: deep navy, emerald sea,
   gold sunlight, lantern orange, storm gray.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('sea');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var running = true;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', function () { resize(); if (reduced || document.hidden) drawFrame(3); });
  resize();

  /* deterministic pseudo-random */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------- static scene data ---------- */
  var HOR = 0.60; /* horizon as fraction of height */

  var islands = [
    { x: 0.50, w: 0.085, h: 0.022, tone: 'rgba(16,52,60,0.55)', seed: 11 },
    { x: 0.665, w: 0.17, h: 0.05, tone: 'rgba(10,38,46,0.85)', seed: 23, fires: true },
    { x: 0.875, w: 0.27, h: 0.095, tone: 'rgba(4,20,26,0.96)', seed: 37, lighthouse: true }
  ];
  islands.forEach(function (isl) {
    var r = rng(isl.seed), pts = [], n = 14;
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      var env = Math.sin(Math.PI * f);
      pts.push(env * (0.45 + 0.55 * r()));
    }
    isl.pts = pts;
  });

  var ships = [];
  (function () {
    var r = rng(99);
    for (var i = 0; i < 5; i++) {
      ships.push({
        x: r(),                       /* 0..1 wraps */
        y: 0.002 + r() * 0.012,       /* below horizon */
        s: 5 + r() * 7,               /* scale px */
        v: (0.0014 + r() * 0.0022) * (r() > 0.4 ? 1 : -1),
        sway: r() * 6.28
      });
    }
  })();

  var flagship = { x: 0.81, v: 0.012, y: 0.115, s: 30 };

  /* ---------- the battle: two lines exchanging broadsides ---------- */
  /* kept center-right so the headline's negative space stays clean */
  var battleA = [   /* windward line, facing right */
    { x: 0.455, y: 0.034, s: 11, ph: 0.0 },
    { x: 0.405, y: 0.052, s: 13, ph: 2.6 },
    { x: 0.495, y: 0.021, s: 9,  ph: 4.4 }
  ];
  var battleB = [   /* leeward line, facing left */
    { x: 0.745, y: 0.031, s: 11, ph: 1.3 },
    { x: 0.805, y: 0.049, s: 13, ph: 3.6 },
    { x: 0.700, y: 0.019, s: 9,  ph: 5.4 }
  ];
  var FIRE_PERIOD = 6.5, FLASH_LIFE = 0.32, SMOKE_LIFE = 4.2;

  var mists = [];
  (function () {
    var r = rng(7);
    for (var i = 0; i < 5; i++) {
      mists.push({
        x: r(), y: HOR + 0.02 + r() * 0.16,
        rx: 0.16 + r() * 0.2, ry: 0.03 + r() * 0.035,
        v: 0.0016 + r() * 0.003, a: 0.035 + r() * 0.04, ph: r() * 6.28
      });
    }
  })();

  var embers = [];
  (function () {
    var r = rng(55);
    for (var i = 0; i < 36; i++) {
      embers.push({
        x: r(), y: r(), s: 0.6 + r() * 1.6,
        vx: 0.002 + r() * 0.005, vy: 0.003 + r() * 0.008,
        ph: r() * 6.28, sp: 0.5 + r() * 1.5
      });
    }
  })();

  var flash = { t0: -10, x: 0.2, life: 0.7, next: 2 };

  /* ---------- drawing helpers ---------- */
  function sky(t) {
    var hor = H * HOR;
    var g = ctx.createLinearGradient(0, 0, 0, hor);
    g.addColorStop(0, '#020F16');
    g.addColorStop(0.55, '#072732');
    g.addColorStop(0.88, '#0D3B42');
    g.addColorStop(1, '#155059');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hor + 1);

    /* dawn glow behind the islands, breathing slowly */
    var pulse = 0.92 + 0.08 * Math.sin(t * 0.22);
    var sg = ctx.createRadialGradient(W * 0.70, hor, 4, W * 0.70, hor, W * 0.42 * pulse);
    sg.addColorStop(0, 'rgba(255,196,110,0.55)');
    sg.addColorStop(0.35, 'rgba(240,160,80,0.22)');
    sg.addColorStop(1, 'rgba(240,160,80,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, hor + 1);

    /* warm band hugging the horizon */
    var hb = ctx.createLinearGradient(0, hor - H * 0.06, 0, hor);
    hb.addColorStop(0, 'rgba(255,170,90,0)');
    hb.addColorStop(1, 'rgba(255,170,90,0.14)');
    ctx.fillStyle = hb;
    ctx.fillRect(W * 0.3, hor - H * 0.06, W * 0.7, H * 0.06);

    /* storm bank, upper right, drifting almost imperceptibly */
    var drift = (t * 0.0012) % 0.08;
    for (var i = 0; i < 4; i++) {
      var cx = W * (0.78 + i * 0.09 - drift), cy = H * (0.10 + i * 0.045);
      var cr = W * (0.16 + i * 0.02);
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
      cg.addColorStop(0, 'rgba(7,18,24,0.5)');
      cg.addColorStop(1, 'rgba(7,18,24,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
    }
    /* faint god rays */
    ctx.save();
    ctx.globalAlpha = 0.022 + 0.01 * Math.sin(t * 0.3);
    ctx.fillStyle = '#FFC46E';
    for (var rIx = 0; rIx < 3; rIx++) {
      var rx = W * (0.62 + rIx * 0.09);
      var rTop = H * 0.18;
      ctx.beginPath();
      ctx.moveTo(rx, rTop);
      ctx.lineTo(rx + W * 0.012, rTop);
      ctx.lineTo(rx - W * 0.035, hor);
      ctx.lineTo(rx - W * 0.055, hor);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function water(t) {
    var hor = H * HOR;
    var g = ctx.createLinearGradient(0, hor, 0, H);
    g.addColorStop(0, '#155059');
    g.addColorStop(0.12, '#0E3A40');
    g.addColorStop(0.5, '#062028');
    g.addColorStop(1, '#020D13');
    ctx.fillStyle = g;
    ctx.fillRect(0, hor, W, H - hor);

    /* golden reflection column under the dawn glow */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 26; i++) {
      var f = i / 26;
      var y = hor + 4 + f * (H - hor) * 0.8;
      var width = W * (0.05 + f * 0.16);
      var sw = Math.sin(t * 0.9 + i * 1.7) * width * 0.18;
      var a = (1 - f) * 0.12 * (0.65 + 0.35 * Math.sin(t * 1.3 + i * 2.1));
      if (a <= 0.004) continue;
      ctx.fillStyle = 'rgba(255,185,100,' + a.toFixed(3) + ')';
      var lw = width * (0.5 + 0.5 * Math.sin(t * 0.6 + i));
      ctx.fillRect(W * 0.70 - lw / 2 + sw, y, lw, Math.max(1, (H - hor) * 0.004));
    }
    /* cool shimmer lines across the sea */
    for (var j = 0; j < 9; j++) {
      var fy = hor + ((j / 9) + (t * 0.004 % (1 / 9))) % 1 * (H - hor);
      var fa = 0.028 * (1 - Math.abs((fy - hor) / (H - hor) - 0.35));
      if (fa <= 0) continue;
      ctx.fillStyle = 'rgba(140,220,220,' + fa.toFixed(3) + ')';
      var lx = (Math.sin(j * 7.3 + t * 0.12) * 0.5 + 0.5) * W;
      ctx.fillRect(lx - W * 0.09, fy, W * 0.18, 1);
    }
    ctx.restore();
  }

  function islandShape(isl, t) {
    var hor = H * HOR;
    var bw = isl.w * W, bh = isl.h * H;
    var x0 = isl.x * W - bw / 2;
    ctx.beginPath();
    ctx.moveTo(x0, hor + 1);
    for (var i = 0; i < isl.pts.length; i++) {
      var f = i / (isl.pts.length - 1);
      ctx.lineTo(x0 + f * bw, hor + 1 - isl.pts[i] * bh);
    }
    ctx.lineTo(x0 + bw, hor + 1);
    ctx.closePath();
    ctx.fillStyle = isl.tone;
    ctx.fill();

    if (isl.fires) {
      /* signal fires on the ridge */
      var fx = x0 + bw * 0.32, fy = hor - isl.pts[4] * bh + 1;
      var fl = 0.6 + 0.4 * Math.sin(t * 7 + 1.3) * Math.sin(t * 3.1);
      glow(fx, fy, 7, 'rgba(255,140,60,' + (0.35 * fl).toFixed(3) + ')');
      dot(fx, fy, 1.1, 'rgba(255,190,120,' + (0.9 * fl).toFixed(3) + ')');
    }
    if (isl.lighthouse) {
      var lx = x0 + bw * 0.62, topY = hor + 1 - isl.pts[8] * bh;
      ctx.fillStyle = 'rgba(2,12,16,1)';
      ctx.fillRect(lx - 2, topY - 14, 4, 14);
      /* sweeping beam */
      var ang = (t * 0.5) % (Math.PI * 2);
      var vis = Math.max(0, Math.sin(ang));        /* bright when sweeping toward us */
      var bx = lx, by = topY - 15;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(Math.sin(ang) * 0.22);
      var bg = ctx.createLinearGradient(0, 0, W * 0.22, 0);
      bg.addColorStop(0, 'rgba(255,220,150,' + (0.20 * vis).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W * 0.22, -W * 0.018);
      ctx.lineTo(W * 0.22, W * 0.018);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      glow(bx, by, 10, 'rgba(255,225,160,' + (0.5 * (0.4 + 0.6 * vis)).toFixed(3) + ')');
      dot(bx, by, 1.4, '#FFE6B0');
      /* harbor lights at the waterline */
      for (var hIx = 0; hIx < 5; hIx++) {
        var hx = x0 + bw * (0.3 + hIx * 0.09);
        var ha = 0.5 + 0.5 * Math.sin(t * 2 + hIx * 2.2);
        dot(hx, hor - 1.5, 0.9, 'rgba(255,170,90,' + (0.5 + 0.3 * ha).toFixed(3) + ')');
      }
    }
  }

  function dot(x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function glow(x, y, r, fill) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, fill);
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function drawShip(x, y, s, t, sway, big) {
    var bob = Math.sin(t * 0.8 + sway) * s * 0.05;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(Math.sin(t * 0.5 + sway) * 0.015);
    var hull = 'rgba(2,11,15,0.96)';
    var sail = 'rgba(8,26,33,0.95)';
    /* hull */
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(-s * 0.9, s * 0.38, -s * 0.55, s * 0.4);
    ctx.lineTo(s * 0.6, s * 0.4);
    ctx.quadraticCurveTo(s * 1.05, s * 0.3, s * 1.15, -s * 0.12);
    ctx.lineTo(-s, 0);
    ctx.closePath();
    ctx.fillStyle = hull;
    ctx.fill();
    /* masts and sails */
    ctx.fillStyle = hull;
    ctx.fillRect(-s * 0.45, -s * 1.5, Math.max(1, s * 0.07), s * 1.5);
    ctx.fillRect(s * 0.25, -s * 1.2, Math.max(1, s * 0.06), s * 1.2);
    ctx.beginPath(); /* main sail */
    ctx.moveTo(-s * 0.42, -s * 1.45);
    ctx.quadraticCurveTo(-s * 1.05, -s * 0.7, -s * 0.42, -s * 0.1);
    ctx.lineTo(-s * 0.42, -s * 1.45);
    ctx.closePath();
    ctx.fillStyle = sail;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, -s * 1.45);
    ctx.quadraticCurveTo(s * 0.25, -s * 0.78, -s * 0.38, -s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); /* fore sail */
    ctx.moveTo(s * 0.28, -s * 1.15);
    ctx.quadraticCurveTo(s * 0.85, -s * 0.55, s * 0.28, -s * 0.05);
    ctx.closePath();
    ctx.fill();
    /* pennant */
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, -s * 1.5);
    ctx.lineTo(-s * 0.45 - s * 0.3, -s * 1.44);
    ctx.lineTo(-s * 0.45, -s * 1.38);
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,30,30,0.9)';
    ctx.fill();
    /* deck lanterns */
    var la = 0.55 + 0.45 * Math.sin(t * 3 + sway * 3);
    dot(s * 0.7, -s * 0.05, Math.max(0.7, s * 0.06), 'rgba(255,180,100,' + (0.8 * la).toFixed(3) + ')');
    if (big) {
      glow(s * 0.7, -s * 0.05, s * 0.4, 'rgba(255,170,90,0.35)');
      dot(-s * 0.85, -s * 0.1, Math.max(0.7, s * 0.05), 'rgba(255,180,100,' + (0.7 * la).toFixed(3) + ')');
    }
    ctx.restore();
  }

  function fleet(t) {
    var hor = H * HOR;
    ships.forEach(function (sh) {
      var x = ((sh.x + t * sh.v) % 1.1 + 1.1) % 1.1 - 0.05;
      drawShip(x * W, hor + sh.y * H, sh.s, t, sh.sway, false);
    });

    /* the legendary flagship crossing the foreground */
    var span = 1.5;
    var fx = ((flagship.x + t * flagship.v) % span + span) % span - 0.25;
    var fy = hor + flagship.y * H;
    /* glowing wake */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var wl = W * 0.16;
    var wg = ctx.createLinearGradient(fx * W - wl, fy, fx * W, fy);
    wg.addColorStop(0, 'rgba(120,230,210,0)');
    wg.addColorStop(1, 'rgba(120,230,210,0.13)');
    ctx.fillStyle = wg;
    ctx.beginPath();
    ctx.moveTo(fx * W - wl, fy + flagship.s * 0.42);
    ctx.lineTo(fx * W, fy + flagship.s * 0.18);
    ctx.lineTo(fx * W, fy + flagship.s * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    drawShip(fx * W, fy, flagship.s, t, 1.2, true);
  }

  function mist(t) {
    ctx.save();
    mists.forEach(function (m) {
      var x = ((m.x + t * m.v) % 1.3 + 1.3) % 1.3 - 0.15;
      var a = m.a * (0.7 + 0.3 * Math.sin(t * 0.2 + m.ph));
      var g = ctx.createRadialGradient(x * W, m.y * H, 0, x * W, m.y * H, m.rx * W);
      g.addColorStop(0, 'rgba(170,215,215,' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(170,215,215,0)');
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(x * W, m.y * H);
      ctx.scale(1, m.ry / m.rx);
      ctx.translate(-x * W, -m.y * H);
      ctx.fillRect(x * W - m.rx * W, m.y * H - m.rx * W, m.rx * W * 2, m.rx * W * 2);
      ctx.restore();
    });
    ctx.restore();
  }

  function particles(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    embers.forEach(function (p) {
      var x = ((p.x + t * p.vx) % 1 + 1) % 1;
      var y = ((p.y - t * p.vy * 0.4) % 1 + 1) % 1;
      var tw = 0.5 + 0.5 * Math.sin(t * p.sp * 2 + p.ph);
      ctx.fillStyle = 'rgba(255,175,95,' + (0.30 * tw).toFixed(3) + ')';
      ctx.fillRect(x * W, y * H, p.s, p.s);
    });
    ctx.restore();
  }

  function cannons(t) {
    if (t > flash.next) {
      flash.t0 = t;
      flash.x = 0.05 + ((t * 13.7) % 1) * 0.30;
      flash.next = t + 2 + ((t * 7.3) % 1) * 3;
    }
    var age = t - flash.t0;
    if (age >= 0 && age < flash.life) {
      var f = 1 - age / flash.life;
      var hor = H * HOR;
      glow(flash.x * W, hor - 2, 22 * f + 5, 'rgba(255,200,120,' + (0.6 * f).toFixed(3) + ')');
      dot(flash.x * W, hor - 2, 1.6 * f + 0.4, 'rgba(255,235,190,' + (0.9 * f).toFixed(3) + ')');
    }
  }

  /* ---------- broadside battle ---------- */
  function smokePuff(x, y, r, a) {
    if (a <= 0.004 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(150,162,168,' + a.toFixed(3) + ')');
    g.addColorStop(1, 'rgba(150,162,168,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  function battleShip(sh, dir, t) {
    var hor = H * HOR;
    var sx = sh.x + Math.sin(t * 0.05) * 0.008 * dir;  /* lines slowly closing */
    var x = sx * W, y = hor + sh.y * H, s = sh.s;

    ctx.save();
    if (dir < 0) {
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    drawShip(x, y, s, t, sh.ph, false);
    ctx.restore();

    var phase = (t + sh.ph) % FIRE_PERIOD;
    var gx = x + dir * s * 1.05;
    var gy = y - s * 0.16;

    /* muzzle flash + streak toward the enemy line */
    if (phase < FLASH_LIFE) {
      var f = 1 - phase / FLASH_LIFE;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(gx, gy, s * 1.8 * f + 2, 'rgba(255,190,110,' + (0.7 * f).toFixed(3) + ')');
      dot(gx, gy, s * 0.16 * f + 0.5, 'rgba(255,240,200,' + (0.95 * f).toFixed(3) + ')');
      var sl = s * 3.2 * (1 - f * 0.4);
      var lg = ctx.createLinearGradient(gx, gy, gx + dir * sl, gy);
      lg.addColorStop(0, 'rgba(255,210,140,' + (0.5 * f).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(Math.min(gx, gx + dir * sl), gy - 1, sl, 2);
      /* flash lights the water below */
      glow(gx, y + s * 0.5, s * 2.4 * f, 'rgba(255,170,90,' + (0.28 * f).toFixed(3) + ')');
      ctx.restore();
    }

    /* powder smoke drifting leeward after each shot */
    var sAge = phase;
    if (sAge < SMOKE_LIFE) {
      var k = sAge / SMOKE_LIFE;
      smokePuff(gx + dir * s * (0.8 + k * 2.6), gy - k * s * 1.4,
                s * (0.5 + k * 1.8), 0.14 * (1 - k));
      smokePuff(gx + dir * s * (0.3 + k * 1.6), gy - k * s * 0.7,
                s * (0.3 + k * 1.2), 0.10 * (1 - k));
    }
  }

  function burningShip(t) {
    var hor = H * HOR;
    var x = 0.595 * W, y = hor + 0.046 * H, s = 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.13);                      /* listing to starboard */
    ctx.translate(-x, -y);
    drawShip(x, y, s, t, 0.5, false);
    /* fires along the deck */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var fx = x + (i - 1) * s * 0.55;
      var fl = 0.55 + 0.45 * Math.sin(t * 9 + i * 2.4) * Math.sin(t * 3.7 + i);
      glow(fx, y - s * (0.25 + i * 0.18), s * (0.9 + 0.4 * fl), 'rgba(255,130,45,' + (0.45 * fl).toFixed(3) + ')');
      dot(fx, y - s * (0.25 + i * 0.18), s * 0.09 + fl, 'rgba(255,200,130,' + (0.85 * fl).toFixed(3) + ')');
    }
    /* glow on the surrounding water */
    glow(x, y + s * 0.55, s * 3, 'rgba(255,120,40,0.16)');
    ctx.restore();
    ctx.restore();
    /* smoke column rising off the wreck */
    var sway = Math.sin(t * 0.4);
    for (var k = 0; k < 4; k++) {
      var kf = (k + (t * 0.25 % 1)) / 4;
      smokePuff(x - kf * s * 1.6 + sway * kf * s * 1.2,
                y - s * 0.6 - kf * s * 4.2,
                s * (0.5 + kf * 1.7),
                0.13 * (1 - kf));
    }
  }

  function battle(t) {
    /* haze of gunsmoke hanging over the engagement */
    var hor = H * HOR;
    smokePuff(0.60 * W, hor + 0.025 * H, W * 0.10, 0.045 + 0.015 * Math.sin(t * 0.3));
    battleA.forEach(function (sh) { battleShip(sh, 1, t); });
    burningShip(t);
    battleB.forEach(function (sh) { battleShip(sh, -1, t); });
  }

  /* ---------- main loop ---------- */
  function drawFrame(t) {
    ctx.clearRect(0, 0, W, H);
    sky(t);
    islandShape(islands[0], t);
    islandShape(islands[1], t);
    water(t);
    islandShape(islands[2], t);
    cannons(t);
    battle(t);
    fleet(t);
    mist(t);
    particles(t);
  }

  /* paint one frame synchronously so the scene exists even before the
     first rAF (hidden tabs, screenshots, print) */
  drawFrame(3);

  if (!reduced) {
    var start = performance.now();
    function tick(now) {
      if (running) drawFrame((now - start) / 1000);
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', function () {
      running = !document.hidden;
    });
  }
})();
