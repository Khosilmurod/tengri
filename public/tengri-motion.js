/* Tengri page motion */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var qsa = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  var rafThrottle = function (fn) {
    var scheduled = false;
    return function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; fn(); });
    };
  };

  var nav = document.getElementById("nav");
  var heroActions = document.querySelector("#hero .hero__actions");
  var heroPast = false;
  var logoRetracted = false;
  var atFooter = false;

  function setLogoRetract(retract) {
    if (!nav || retract === logoRetracted) return;
    logoRetracted = retract;
    nav.classList.toggle("nav--logo-retract", retract);
  }
  function updateLogoRetract() { setLogoRetract(heroPast && !atFooter); }
  function setHeroPast(past) {
    if (!nav || past === heroPast) return;
    heroPast = past;
    nav.classList.toggle("nav--cta-visible", past);
    updateLogoRetract();
  }
  function setAtFooter(at) {
    if (at === atFooter) return;
    atFooter = at;
    updateLogoRetract();
  }
  function isHeroActionsPast() {
    return !!heroActions && heroActions.getBoundingClientRect().bottom <= 0;
  }
  function navEase(t) { return 1 - Math.pow(1 - t, 2.4); }
  function onScroll() {
    if (!nav) return;
    var t = navEase(Math.min(1, (window.scrollY || 0) / 320));
    nav.style.setProperty("--nav-blur", (t * 26).toFixed(1) + "px");
    nav.style.setProperty("--nav-bg", (t * 0.88).toFixed(3));
    nav.style.setProperty("--nav-fade", t.toFixed(3));
  }
  window.addEventListener("scroll", rafThrottle(onScroll), { passive: true });

  if (heroActions && "IntersectionObserver" in window) {
    var heroObserver = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      if (entry) setHeroPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    heroObserver.observe(heroActions);
  } else if (heroActions) {
    window.addEventListener("scroll", function () { setHeroPast(isHeroActionsPast()); }, { passive: true });
  }

  var footer = document.getElementById("join");
  if (footer && "IntersectionObserver" in window) {
    var footerObserver = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      if (entry) setAtFooter(entry.isIntersecting);
    }, { rootMargin: "0px 0px -50% 0px" });
    footerObserver.observe(footer);
  }

  setHeroPast(isHeroActionsPast());
  onScroll();
  document.body.classList.add("is-loaded");

  var hero = document.getElementById("hero");
  function revealIntro() {
    if (nav) nav.classList.add("nav--logo-in");
    if (hero) hero.classList.add("hero--ready");
  }
  if (reduced) revealIntro();
  else requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (nav) nav.classList.add("nav--logo-in");
      window.setTimeout(function () { if (hero) hero.classList.add("hero--ready"); }, 280);
    });
  });

  var revealSelector = ".reveal, .h2, .statement";
  var revealItems = qsa(revealSelector);
  revealItems.forEach(function (element) {
    var parent = element.parentElement;
    if (!parent) return;
    var siblings = Array.prototype.filter.call(parent.children, function (child) { return child.matches && child.matches(revealSelector); });
    var index = siblings.indexOf(element);
    if (index > 0) element.style.setProperty("--reveal-delay", Math.min(index * 0.07, 0.4) + "s");
  });
  if ("IntersectionObserver" in window && !reduced) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    revealItems.forEach(function (element) { revealObserver.observe(element); });
  } else revealItems.forEach(function (element) { element.classList.add("in-view"); });

  var statementSection = document.querySelector(".statement-sec");
  var statement = statementSection && statementSection.querySelector(".statement");
  if (statement && !statement.dataset.words) {
    statement.dataset.words = "1";
    var words = statement.textContent.trim().split(/\s+/);
    var emphasisStart = Math.max(0, words.length - 5);
    statement.textContent = "";
    words.forEach(function (word, index) {
      if (index) statement.appendChild(document.createTextNode(" "));
      var span = document.createElement("span");
      span.className = "statement__w" + (index >= emphasisStart ? " statement__w--emph" : "");
      span.textContent = word;
      statement.appendChild(span);
    });
  }
  var statementWords = statement ? qsa(".statement__w", statement) : [];
  if (statementSection && statementWords.length) {
    function lightStatement() {
      var rect = statementSection.getBoundingClientRect();
      var height = window.innerHeight || 1;
      var progress = (height * 0.72 - rect.top) / (rect.height + height * 0.16);
      var lit = Math.ceil(Math.max(0, Math.min(1, progress)) * statementWords.length);
      statementWords.forEach(function (word, index) { word.classList.toggle("is-lit", index < lit); });
    }
    if (reduced) statementWords.forEach(function (word) { word.classList.add("is-lit"); });
    else {
      window.addEventListener("scroll", rafThrottle(lightStatement), { passive: true });
      window.addEventListener("resize", lightStatement, { passive: true });
      lightStatement();
    }
  }
})();

/* Interactive footer grid */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initField(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    opts = opts || {};
    var interactive = opts.interactive === true;
    var ctx = canvas.getContext("2d");
    var host = canvas.parentElement;
    var PITCH = opts.pitch || 22;
    var BASE = opts.base != null ? opts.base : 0.045;
    var PEAK = opts.peak != null ? opts.peak : 0.72;
    var dpr = 1, cssW = 0, cssH = 0, cols = 0, rows = 0, offX = 0, offY = 0, R = interactive ? 180 : 0;
    var bx = null, by = null, ox = null, oy = null, wt = null, ph = null, twSpd = null, starHue = null, starTint = null, introCol = null, introGlow = null, shimCol = null, shimGlow = null, twExtra = null;
    var PULSE_ATTACK = 0.2;
    var PULSE_DECAY = 0.982;
    var lastFrameNow = 0;
    var pulseSmooth = !!(opts.intro || opts.periodicShimmer);
    var twinkle = !!opts.twinkle;
    var periodicShimmer = !!opts.periodicShimmer;
    var scrollShimmer = !!opts.scrollShimmer;
    var scrollShimmerEl = opts.scrollShimmerEl || null;
    var shimmerStart = 0;
    var shimmerNextAt = 0;
    var shimmerDur = opts.shimmerDur != null ? opts.shimmerDur : 2600;
    var shimmerBandW = 0.2;
    var shimmerVaryDir = opts.shimmerVaryDir === true;
    var SHIMMER_IDLE_MIN = opts.shimmerIdleMin != null ? opts.shimmerIdleMin : 4000;
    var SHIMMER_IDLE_RANGE = opts.shimmerIdleRange != null ? opts.shimmerIdleRange : 2800;
    /* continuous interference pattern (a drifting/rotating plaid of light) */
    var patternField = !!opts.patternField;
    var patternScale = opts.patternScale != null ? opts.patternScale : 3.4;
    var patternSpeed = opts.patternSpeed != null ? opts.patternSpeed : 0.1;
    var patternRot = opts.patternRot != null ? opts.patternRot : 0.045;
    var patternFloor = opts.patternFloor != null ? opts.patternFloor : 0.5;
    var patternAmp = opts.patternAmp != null ? opts.patternAmp : 1;
    var starsOnly = !!opts.stars;
    var starHover = opts.starHover != null ? !!opts.starHover : starsOnly;
    var autoRun = !!opts.autoRun;
    var autoDrift = !!opts.autoDrift;
    var driftMul = opts.driftMul != null ? opts.driftMul : 1;
    var driftAmp = opts.driftAmp != null ? opts.driftAmp : 1;
    var waveMul = opts.waveMul != null ? opts.waveMul : 1;
    var twMul = opts.twinkleMul != null ? opts.twinkleMul : 1;
    var timeMul = opts.timeMul != null ? opts.timeMul : 1;
    var starTwPow = opts.starTwPow != null ? opts.starTwPow : 1.35;
    var starTwFloor = opts.starTwFloor != null ? opts.starTwFloor : 0.04;
    var tintRate = opts.tintRate != null ? opts.tintRate : (starsOnly ? 0.26 : 0);
    var sparkCutoff = opts.sparkCutoff != null ? opts.sparkCutoff : null;
    var alphaMul = opts.alphaMul != null ? opts.alphaMul : 1;
    var maxAlpha = opts.maxAlpha != null ? opts.maxAlpha : 0.98;
    var textShields = null;
    var textShieldFloor = opts.textShieldFloor != null ? opts.textShieldFloor : 0.76;
    var textShieldFeather = opts.textShieldFeather != null ? opts.textShieldFeather : 52;
    var sizeMul = opts.sizeMul != null ? opts.sizeMul : 1;
    var heroDots = !!opts.heroDots;
    var topScatter = !!opts.topScatter;
    var scatterBand = opts.scatterBand != null ? opts.scatterBand : 0.5;
    var scatterDepth = opts.scatterDepth != null ? opts.scatterDepth : 0.38;
    var scatterKeep = opts.scatterKeep != null ? opts.scatterKeep : null;
    var rightScatter = !!opts.rightScatter;
    var rightFade = opts.rightFade != null ? opts.rightFade : 0;
    var leftFade = opts.leftFade != null ? opts.leftFade : 0;
    var edgeGate = null;
    var insetL = 0, insetR = 0, insetT = 0, insetB = 0;
    var fieldW = 0, fieldH = 0;
    var hasInset = false;
    var insetFeather = opts.insetFeather != null ? opts.insetFeather : 52;
    (function applyInsetOpts() {
      var ins = opts.inset;
      if (typeof ins === "number") insetL = insetR = insetT = insetB = ins;
      else if (ins && typeof ins === "object") {
        insetT = ins.top || 0;
        insetR = ins.right || 0;
        insetB = ins.bottom || 0;
        insetL = ins.left || 0;
      }
      if (opts.insetX != null) insetL = insetR = opts.insetX;
      if (opts.insetY != null) insetT = insetB = opts.insetY;
      if (opts.insetTop != null) insetT = opts.insetTop;
      if (opts.insetRight != null) insetR = opts.insetRight;
      if (opts.insetBottom != null) insetB = opts.insetBottom;
      if (opts.insetLeft != null) insetL = opts.insetLeft;
      hasInset = insetL + insetR + insetT + insetB > 0;
    })();
    var px = -9999, py = -9999, tx = 0, ty = 0;
    var hasPointer = false, lastMove = -9999, raf = 0, running = false;
    var boostTarget = 0, boost = 0, hotX = -9999, hotY = -9999;
    var intro = !!opts.intro;
    var deferIntroVisible = !!opts.deferIntroVisible;
    var introStart = 0;
    var INTRO_MS = 2800;
    var INTRO_BAND = 0.24;
    var INTRO_TAIL_MS = 1400;
    function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }
    function smooth01(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
    function pulseMix(v, lo, hi) { return smooth01((v - lo) / (hi - lo)); }

    function hash01(a, b, c) {
      var x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
      return x - Math.floor(x);
    }

    function edgeInsetDim(cx, cy) {
      if (!hasInset) return 1;
      var dl = cx - insetL;
      var dr = insetR > 0 ? (cssW - insetR) - cx : Infinity;
      var dt = cy - insetT;
      var db = (cssH - insetB) - cy;
      var d = Math.min(dl, dr, dt, db);
      if (d >= insetFeather) return 1;
      if (d <= 0) return 0;
      return smooth01(d / insetFeather);
    }

    function sideFadeDim(cx) {
      var dim = 1;
      var rf = rightFade > 0 && rightFade <= 1 ? rightFade * cssW : rightFade;
      var lf = leftFade > 0 && leftFade <= 1 ? leftFade * cssW : leftFade;
      if (rf > 0 && cx > cssW - rf) dim *= smooth01((cssW - cx) / rf);
      if (lf > 0 && cx < lf) dim *= smooth01(cx / lf);
      return dim;
    }

    function rightScatterGate(x, c, r, ph) {
      var xNorm = cssW > 0 ? x / cssW : 0;
      if (xNorm < 0.5) return 1;
      var t = smooth01((xNorm - 0.5) / 0.5);
      var spor = hash01(ph, c * 0.43, r * 0.29);
      var cut = 0.52 + t * 0.46;
      if (spor > cut) return 0;
      return 0.35 + (1 - t) * 0.65 * (0.5 + spor * 0.5);
    }

    function topScatterGate(y, x, c, r, ph, w) {
      var xNorm = fieldW > 0 ? (x - insetL) / fieldW : 0;
      var yn = fieldH > 0 ? (y - insetT) / fieldH : y / cssH;
      var edge =
        scatterBand +
        Math.sin(xNorm * 8.1 + ph * 0.42) * 0.15 +
        Math.sin(xNorm * 3.1 + c * 0.51 + r * 0.17) * 0.13 +
        Math.cos(xNorm * 5.4 - ph * 1.1 + r * 0.28) * 0.1 +
        (hash01(ph, c * 0.37, r * 0.21) - 0.5) * 0.28;
      var dist = yn - edge;
      if (dist >= scatterDepth) return 1;
      if (dist <= -scatterDepth * 0.28) return 0;
      var t = smooth01((dist + scatterDepth * 0.28) / (scatterDepth * 1.22));
      var n1 = hash01(ph, c * 0.17, r * 0.23);
      var n2 = 0.5 + 0.5 * Math.sin(ph * 4.1 + c * 0.91 + r * 1.37);
      var n3 = 0.5 + 0.5 * Math.cos(ph * 2.6 - c * 1.2 + r * 0.55);
      var spor = n1 * n2 * n3;
      var gate = 0.1 + t * (0.22 + spor * 0.78) * (0.42 + w * 0.58);
      if (t < 0.32 && spor < 0.18) gate *= 0.32;
      return Math.min(1, gate);
    }

    function textShieldDim(cx, cy) {
      if (!textShields || !textShields.length) return 1;
      var dim = 1, si, sh, sdx, sdy, sd, floor, feather;
      for (si = 0; si < textShields.length; si++) {
        sh = textShields[si];
        floor = sh.floor != null ? sh.floor : textShieldFloor;
        feather = sh.feather != null ? sh.feather : textShieldFeather;
        sdx = Math.max(sh.x0 - cx, 0, cx - sh.x1);
        sdy = Math.max(sh.y0 - cy, 0, cy - sh.y1);
        sd = Math.sqrt(sdx * sdx + sdy * sdy);
        if (sd < feather) {
          dim = Math.min(dim, sd <= 0 ? floor : floor + (sd / feather) * (1 - floor));
        }
      }
      return dim;
    }

    function armShimmerPause(now, delayMs) {
      shimmerNextAt = now + (delayMs != null ? delayMs : SHIMMER_IDLE_MIN + Math.random() * SHIMMER_IDLE_RANGE);
    }

    function triggerShimmer(now) {
      shimmerStart = now;
      shimmerBandW = 0.14 + Math.random() * 0.13;
      /* re-aim the sweep each time so the pattern keeps evolving */
      if (shimmerVaryDir && shimCol && bx && shimCol.length === bx.length) {
        var ang = Math.random() * Math.PI * 2;
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var minS = Infinity, maxS = -Infinity, si, s;
        for (si = 0; si < bx.length; si++) {
          s = (bx[si] / cssW) * dx + (by[si] / cssH) * dy;
          shimCol[si] = s;
          if (s < minS) minS = s;
          if (s > maxS) maxS = s;
        }
        var rng = maxS - minS || 1;
        for (si = 0; si < bx.length; si++) shimCol[si] = (shimCol[si] - minS) / rng;
      }
    }

    function size() {
      var r = host.getBoundingClientRect();
      cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
      if (typeof opts.getInset === "function") {
        var ins = opts.getInset(host, cssW, cssH);
        insetT = ins.top || 0;
        insetR = ins.right || 0;
        insetB = ins.bottom || 0;
        insetL = ins.left || 0;
        hasInset = insetL + insetR + insetT + insetB > 0;
      }
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = starsOnly ? Math.max(130, Math.min(cssW * 0.22, 260)) : Math.max(140, Math.min(cssW * 0.18, 250));
      fieldW = Math.max(PITCH * 3, cssW - insetL - insetR);
      fieldH = Math.max(PITCH * 3, cssH - insetT - insetB);
      if (hasInset) {
        cols = Math.max(3, Math.ceil(fieldW / PITCH) + 1);
        rows = Math.max(3, Math.ceil(fieldH / PITCH) + 1);
      } else {
        cols = Math.ceil(fieldW / PITCH) + 2;
        rows = Math.ceil(fieldH / PITCH) + 2;
      }
      offX = insetL + Math.round((fieldW - (cols - 1) * PITCH) / 2);
      offY = insetT + Math.round((fieldH - (rows - 1) * PITCH) / 2);
      var n = cols * rows;
      bx = new Float32Array(n); by = new Float32Array(n);
      ox = new Float32Array(n); oy = new Float32Array(n);
      wt = new Float32Array(n); ph = new Float32Array(n);
      if (twinkle) twSpd = new Float32Array(n);
      if (starsOnly) { starHue = new Float32Array(n); starTint = new Float32Array(n); }
      if (intro) introCol = new Float32Array(n);
      if (topScatter || scatterKeep != null || rightScatter) edgeGate = new Float32Array(n);
      var k = 0;
      for (var rr = 0; rr < rows; rr++) for (var c = 0; c < cols; c++) {
        bx[k] = offX + c * PITCH; by[k] = offY + rr * PITCH;

        wt[k] = 0.45 + Math.random() * 0.55; ph[k] = Math.random() * 6.283;
        if (twinkle) {
          var tb = starsOnly ? (opts.starTwBase != null ? opts.starTwBase : 0.18) : 0.55;
          var tr = starsOnly ? (opts.starTwRange != null ? opts.starTwRange : 0.75) : 2.4;
          twSpd[k] = (tb + Math.random() * tr) * twMul;
        }
        if (starsOnly) {
          starHue[k] = 185 + Math.random() * 155;
          starTint[k] = Math.random() < tintRate ? 1 : 0;
        }
        if (topScatter || scatterKeep != null || rightScatter) {
          var gate = 1;
          if (topScatter) gate *= topScatterGate(by[k], bx[k], c, rr, ph[k], wt[k]);
          if (scatterKeep != null && hash01(ph[k], c * 0.37, rr * 0.21) > scatterKeep) gate = 0;
          if (rightScatter) gate *= rightScatterGate(bx[k], c, rr, ph[k]);
          edgeGate[k] = gate;
        }
        k++;
      }
      if (intro && bx.length) {
        if (!introCol || introCol.length !== bx.length) introCol = new Float32Array(bx.length);
        if (!introGlow || introGlow.length !== bx.length) introGlow = new Float32Array(bx.length);
        var iMin = Infinity, iMax = -Infinity, ii;
        for (ii = 0; ii < bx.length; ii++) {
          var iv = (bx[ii] / cssW) * (0.8 + Math.sin(ph[ii] * 1.25) * 0.05) + (by[ii] / cssH) * (0.3 + Math.cos(ph[ii] * 1.6) * 0.06);
          introCol[ii] = iv;
          if (iv < iMin) iMin = iv;
          if (iv > iMax) iMax = iv;
        }
        var iRange = iMax - iMin || 1;
        for (ii = 0; ii < bx.length; ii++) introCol[ii] = (introCol[ii] - iMin) / iRange;
      }
      if (pulseSmooth && bx.length) {
        if (!twExtra || twExtra.length !== bx.length) twExtra = new Float32Array(bx.length);
      }
      if (periodicShimmer && bx.length) {
        if (!shimCol || shimCol.length !== bx.length) shimCol = new Float32Array(bx.length);
        if (!shimGlow || shimGlow.length !== bx.length) shimGlow = new Float32Array(bx.length);
        var minS = Infinity, maxS = -Infinity, si;
        for (si = 0; si < bx.length; si++) {
          var s = (bx[si] / cssW) * (0.76 + Math.sin(ph[si] * 1.3) * 0.04) + (by[si] / cssH) * (0.26 + Math.cos(ph[si] * 1.7) * 0.05);
          shimCol[si] = s;
          if (s < minS) minS = s;
          if (s > maxS) maxS = s;
        }
        var sRange = maxS - minS || 1;
        for (si = 0; si < bx.length; si++) shimCol[si] = (shimCol[si] - minS) / sRange;
      }
    }

    function render(now) {
      var dt = lastFrameNow > 0 ? Math.min(48, now - lastFrameNow) : 16.67;
      lastFrameNow = now;
      var pulseDecay = Math.pow(PULSE_DECAY, dt / 16.67);
      var pulseAttack = 1 - Math.pow(1 - PULSE_ATTACK, dt / 16.67);
      var aa = now * 0.00018;
      if (interactive) {
        var auto = !hasPointer || (now - lastMove) > 2400;
        if (auto) {
          tx = cssW * (0.5 + 0.30 * Math.cos(aa) + 0.07 * Math.cos(aa * 2.7));
          ty = cssH * (0.46 + 0.26 * Math.sin(aa * 1.25));
        }
        if (px < -9000) { px = tx; py = ty; }
        px += (tx - px) * 0.09; py += (ty - py) * 0.09;
      } else if (autoDrift) {
        tx = cssW * (0.5 + 0.34 * Math.cos(aa) + 0.09 * Math.cos(aa * 2.4));
        ty = cssH * (0.48 + 0.26 * Math.sin(aa * 1.3) + 0.07 * Math.sin(aa * 2.1));
        if (px < -9000) { px = tx; py = ty; }
        px += (tx - px) * 0.07; py += (ty - py) * 0.07;
      } else if (!starsOnly) {
        tx = cssW * (0.52 + 0.22 * Math.cos(aa) + 0.06 * Math.sin(aa * 1.8));
        ty = cssH * (0.44 + 0.18 * Math.sin(aa * 1.1) + 0.05 * Math.cos(aa * 2.4));
        px = tx; py = ty;
      }
      if (starHover && hasPointer) {
        if (px < -9000) { px = tx; py = ty; }
        px += (tx - px) * 0.12; py += (ty - py) * 0.12;
      }
      boost += (boostTarget - boost) * (boostTarget > boost ? 0.14 : 0.07);
      var Rnow = R * (1 + boost * 1.05);
      var T = now * 0.001, Tt = T * (starsOnly ? (0.32 + boost * 1.15) * timeMul : 1);
      var R2 = Rnow * Rnow, n = bx.length;
      var hotR = Rnow * (1.22 + boost * 0.32), hotR2 = hotR * hotR;
      var hotOn = boost > 0.04 && hotX > -9000;
      var patInvW = 0, patInvH = 0, patCos = 1, patSin = 0, patPhase = 0;
      if (patternField) {
        patInvW = 1 / cssW; patInvH = 1 / cssH;
        var patAng = T * patternRot;
        patCos = Math.cos(patAng); patSin = Math.sin(patAng);
        patPhase = T * patternSpeed;
      }

      var introBusy = intro && introStart > 0 && (now - introStart) < INTRO_MS + INTRO_TAIL_MS;
      if (periodicShimmer && !reduced) {
        if (!introBusy) {
          if (shimmerStart > 0 && now - shimmerStart >= shimmerDur) {
            shimmerStart = 0;
            armShimmerPause(now);
          } else if (shimmerStart <= 0 && now >= shimmerNextAt) {
            triggerShimmer(now);
          }
        }
      }

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#ffffff";
      for (var i = 0; i < n; i++) {
        var X = bx[i], Y = by[i];
        var footerStar = autoDrift && starsOnly && !heroDots;
        var driftT = footerStar ? T * timeMul : T;
        var fx = Math.sin(driftT * 0.55 + X * 0.011 + ph[i]);
        var fy = Math.cos(driftT * 0.52 + Y * 0.013 + ph[i]);
        var dx = X - px, dy = Y - py, d2 = dx * dx + dy * dy;
        var illum = 0, repel = 0, hover = 0;
        if ((interactive || starHover) && px > -9000 && d2 < R2) {
          var d = Math.sqrt(d2) || 1, t = 1 - d / Rnow, s = t * t * (3 - 2 * t);
          illum = s; hover = s;
          if (interactive) repel = s * 16 / d;
        }
        if (hotOn) {
          var hdx = X - hotX, hdy = Y - hotY, hd2 = hdx * hdx + hdy * hdy;
          if (hd2 < hotR2) {
            var hd = Math.sqrt(hd2) || 1, ht = 1 - hd / hotR, hs = ht * ht * (3 - 2 * ht) * boost;
            illum = Math.max(illum, hs * 0.68);
            hover = Math.max(hover, hs * 0.5);
            repel += hs * (9 + boost * 4) / hd;
          }
        }
        var wave = interactive ? 0 : footerStar
          ? 0.09 * waveMul * (0.5 + 0.5 * Math.sin(driftT * 1.35 + ph[i] * 2 + X * 0.01))
          : starsOnly ? 0 : (twinkle ? 0.05 : 0.14) * (0.5 + 0.5 * Math.sin(T * 0.9 + ph[i] * 2 + X * 0.008));
        var drift = starsOnly ? (autoDrift ? 0.12 * driftMul * driftAmp : 0.12) : twinkle ? 0.5 : 1.2;
        var tox = fx * drift + dx * repel;
        var toy = fy * drift + dy * repel;
        var settle = starsOnly ? (autoDrift ? 0.075 : 0.04) : twinkle ? 0.06 : 0.12;
        ox[i] += (tox - ox[i]) * settle; oy[i] += (toy - oy[i]) * settle;
        var w = wt[i];
        var tw = 1, sparkle = 0;
        if (twinkle) {
          var t1 = Math.sin(Tt * twSpd[i] * (1 + boost * 0.8) + ph[i]);
          var t2 = Math.sin(Tt * twSpd[i] * 1.9 * (1 + boost * 0.5) + ph[i] * 1.85);
          var t3 = Math.sin(Tt * twSpd[i] * 0.35 + ph[i] * 0.6);
          var twPow = footerStar ? starTwPow - boost * 0.28 : 1.7 - boost * 0.35;
          var twSpan = 1 - starTwFloor;
          tw = footerStar
            ? starTwFloor + twSpan * Math.pow(0.5 + 0.5 * t1, twPow) * (0.5 + 0.5 * (0.5 + 0.5 * t3))
            : 0.06 + 0.94 * Math.pow(0.5 + 0.5 * t1, twPow) * (0.65 + 0.35 * (0.5 + 0.5 * t3));
          var cut = sparkCutoff != null ? sparkCutoff : (0.96 - boost * 0.12);
          var cutW = footerStar ? 0.2 : 0.04;
          if (t2 > cut) {
            sparkle = 1;
            tw = Math.min(footerStar ? 2.65 : 1.85, tw + (0.7 + boost * 0.5) * ((t2 - cut) / cutW));
          }
        }
        var a;
        if (starsOnly) {
          a = (BASE * w * tw * 3.1 + (w > 0.82 ? 0.05 * tw : 0) + wave * w) * (1 + boost * 0.45) * alphaMul;
          if (hover > 0.04) a *= 1 + hover * (0.22 + boost * 0.35);
        }
        else a = (BASE * w + 0.018 * (0.5 + 0.5 * fx) + illum * PEAK * w * (1 + boost * 0.5) + wave * w) * tw;
        var patB = 0;
        if (patternField) {
          var pnx = X * patInvW, pny = Y * patInvH;
          var pu = pnx * patCos + pny * patSin;
          var pv = pny * patCos - pnx * patSin;
          var pband = Math.sin((pu * patternScale - patPhase) * 6.2831853) * 0.6
                    + Math.sin((pv * patternScale * 0.85 + patPhase * 0.7) * 6.2831853) * 0.4;
          patB = 0.5 + 0.5 * pband;
          patB = patB * patB * (3 - 2 * patB);
          a *= patternFloor + patternAmp * patB;
        }
        if (intro && introCol && !reduced && !introStart) continue;

        var pulseTarget = 0;
        if (intro && introCol && !reduced && introStart > 0) {
          var introElapsed = now - introStart;
          var introT = Math.min(1, introElapsed / INTRO_MS);
          if (introT < 1) {
            var introFront = easeOut3(introT) * (1 + INTRO_BAND * 1.45);
            var introNx = introCol[i] + Math.sin(ph[i] * 2.3 + Y * 0.008 + X * 0.005) * 0.058;
            var introBand = (introFront - introNx) / INTRO_BAND;
            var introGate = smooth01(introBand);
            var introWake = smooth01((introFront - introNx + INTRO_BAND * 0.62) / (INTRO_BAND * 1.85));
            var textDimIntro = textShields ? textShieldDim(X, Y) : 1;
            a *= Math.max(introGate, introWake * 0.16 * (0.4 + 0.6 * textDimIntro));
            if (a < 0.008) continue;
            var introCrest = 0;
            if (introBand > 0 && introBand < 1) {
              introCrest = Math.pow(Math.sin(introBand * Math.PI), 0.78);
              if (introGlow) introGlow[i] = Math.max(introGlow[i], introCrest);
              pulseTarget = Math.max(pulseTarget, introCrest * (1.35 + wt[i] * 0.32) + introGate * 0.18);
            } else if (introWake > 0.35 && introGlow) {
              introGlow[i] = Math.max(introGlow[i], introWake * 0.28);
              pulseTarget = Math.max(pulseTarget, introWake * 0.18);
            }
          }
          if (introGlow) {
            var iGlow = introGlow[i];
            if (iGlow > 0.002) {
              iGlow *= Math.pow(0.962, dt / 16.67);
              introGlow[i] = iGlow;
              pulseTarget = Math.max(pulseTarget, iGlow * (0.9 + wt[i] * 0.24));
            } else {
              introGlow[i] = 0;
            }
          }
        }
        if (periodicShimmer && shimCol && shimmerStart > 0) {
          var shimT = Math.min(1, (now - shimmerStart) / shimmerDur);
          var shimFront = easeOut3(shimT) * (1 + shimmerBandW * 1.2);
          var shimPos = shimCol[i] + Math.sin(ph[i] * 2.4 + X * 0.009 + Y * 0.007) * 0.055;
          var shimBand = (shimFront - shimPos) / shimmerBandW;
          var shimGate = smooth01(shimBand);
          if (shimGate > 0.02) {
            var shimPulse = Math.sin(shimBand * Math.PI);
            if (shimGlow) shimGlow[i] = Math.max(shimGlow[i], shimPulse);
            pulseTarget = Math.max(pulseTarget, shimPulse * (1.02 + wt[i] * 0.32));
          }
        }
        if (periodicShimmer && shimGlow) {
          var glow = shimGlow[i];
          if (glow > 0.002) {
            glow *= Math.pow(0.978, dt / 16.67);
            shimGlow[i] = glow;
            pulseTarget = Math.max(pulseTarget, glow * (0.76 + wt[i] * 0.18));
          } else {
            shimGlow[i] = 0;
          }
        }
        var cx = X + ox[i], cy = Y + oy[i];
        var textDim = textShields ? textShieldDim(cx, cy) : 1;
        if (textDim < 0.92 && pulseTarget > 0) {
          pulseTarget *= 0.42 + 0.58 * textDim;
        }
        var extra = 0;
        var twDraw = tw;
        if (twExtra) {
          extra = twExtra[i];
          if (pulseTarget > extra) extra += (pulseTarget - extra) * pulseAttack;
          else {
            var extraDecay = pulseDecay;
            if (textDim < 0.9) extraDecay = Math.pow(0.93, dt / 16.67);
            extra *= extraDecay;
            if (extra < 0.002) extra = 0;
          }
          twExtra[i] = extra;
          twDraw = tw + extra;
          a *= 1 + extra * 0.3;
        }
        a *= textDim;
        if (edgeGate) a *= edgeGate[i];
        if (rightFade || leftFade) a *= sideFadeDim(cx);
        if (hasInset) {
          var insetDim = edgeInsetDim(cx, cy);
          a *= insetDim;
          if (insetDim < 0.008) continue;
        }
        if (a < 0.008) continue;
        if (a > maxAlpha) a = maxAlpha;
        ctx.globalAlpha = a;
        if (starsOnly) {
          if (hover > 0.04) {
            var hue = (ph[i] * 57.3 + Math.atan2(dy, dx) * 57.3 + 240) % 360;
            ctx.fillStyle = "hsl(" + hue.toFixed(0) + ", " + (62 + hover * 32) + "%, " + (56 + hover * 34) + "%)";
          } else {
            var tintMix = (periodicShimmer || intro) ? pulseMix(extra, 0.035, 0.24) : 0;
            if (tintMix > 0.001) {
              var sh = 205 + Math.sin(ph[i] * 1.6 + Tt * 0.6) * 22 + starHue[i] * 0.04;
              var sat = (20 + twDraw * 16) * tintMix;
              var lit = 92 * (1 - tintMix) + (72 + twDraw * 24) * tintMix;
              ctx.fillStyle = "hsl(" + sh.toFixed(0) + ", " + sat.toFixed(0) + "%, " + lit.toFixed(0) + "%)";
            } else if (starTint[i] > 0.5 && (sparkle || twDraw > (autoDrift && sparkle ? 0.55 : 0.82))) {
              var h = starHue[i] + Math.sin(Tt * 0.45 + ph[i]) * 14;
              ctx.fillStyle = "hsl(" + h.toFixed(0) + ", " + (48 + twDraw * 42).toFixed(0) + "%, " + (52 + twDraw * 34).toFixed(0) + "%)";
            } else if (autoDrift && sparkle) {
              ctx.fillStyle = "hsl(" + (210 + Math.sin(Tt + ph[i]) * 18).toFixed(0) + ", 28%, " + (78 + twDraw * 18).toFixed(0) + "%)";
            } else {
              ctx.fillStyle = "#ffffff";
            }
          }
          var pulseSz = extra * 1.05;
          var szPulse = footerStar ? 0.35 * (0.5 + 0.5 * Math.sin(Tt * 1.4 + ph[i])) : 0;
          var sz = (0.65 + w * 0.55 + twDraw * (footerStar ? 2.15 : 1.85) + szPulse + (autoDrift && sparkle ? 0.65 : 0) + pulseSz + patB * 0.8) * sizeMul * (1 + hover * (0.18 + boost * 0.22) + boost * 0.08);
          var half = sz * 0.5;
          ctx.fillRect(cx - half, cy - half, sz, sz);
        } else {
          var sz = (twinkle ? 1 + twDraw * 1.6 + illum * 2.2 : 2 + illum * 2.6) * (1 + boost * 0.2);
          ctx.fillRect(cx - sz * 0.5, cy - sz * 0.5, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(render);
    }

    function armIntro() {
      if (!intro || introStart || reduced) return;
      introStart = performance.now();
      if (deferIntroVisible) canvas.classList.add("is-on");
      if (periodicShimmer && !shimmerNextAt) {
        armShimmerPause(introStart, INTRO_MS + INTRO_TAIL_MS + 1800);
      }
    }

    function start() {
      if (running || reduced) return;
      var now = performance.now();
      if (periodicShimmer && !shimmerNextAt && !intro) {
        armShimmerPause(now, 2400 + Math.random() * 1200);
      }
      running = true;
      raf = requestAnimationFrame(render);
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }

    if (interactive || starHover) {
      window.addEventListener("pointermove", function (e) {
        var r = host.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) { hasPointer = false; px = -9999; py = -9999; return; }
        tx = e.clientX - r.left; ty = e.clientY - r.top;
        hasPointer = true; lastMove = performance.now();
      }, { passive: true });
    }

    var rT;
    window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(function () { size(); if (reduced) render(performance.now()); }, 160); }, { passive: true });

    size();
    if (reduced) { px = cssW * 0.6; py = cssH * 0.46; render(performance.now()); canvas.classList.add("is-on"); return; }

    if (autoRun) {
      if (!deferIntroVisible) canvas.classList.add("is-on");
      start();
      if ("IntersectionObserver" in window) {
        var ioAuto = new IntersectionObserver(function (en) {
          en[0].isIntersecting ? start() : stop();
        }, { threshold: 0 });
        ioAuto.observe(host);
      }
    } else {
      requestAnimationFrame(function () { canvas.classList.add("is-on"); });
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (en) { en[0].isIntersecting ? start() : stop(); }, { threshold: 0.02 });
        io.observe(host);
      } else { start(); }
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (autoRun || !("IntersectionObserver" in window)) start();
    });

    if (scrollShimmer && periodicShimmer && "IntersectionObserver" in window && !reduced) {
      var shimTarget = scrollShimmerEl ? document.querySelector(scrollShimmerEl) : host;
      if (shimTarget) {
        var scrollShimmerFired = false;
        var ioScrollShim = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting || scrollShimmerFired) return;
            scrollShimmerFired = true;
            ioScrollShim.disconnect();
            start();
            window.setTimeout(function () {
              var now = performance.now();
              triggerShimmer(now);
              armShimmerPause(now, shimmerDur + SHIMMER_IDLE_MIN + Math.random() * SHIMMER_IDLE_RANGE);
            }, 160);
          });
        }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
        ioScrollShim.observe(shimTarget);
      }
    }

    return {
      setBoost: function (v) { boostTarget = Math.max(0, Math.min(1, v)); },
      setHotspot: function (x, y) { hotX = x; hotY = y; tx = x; ty = y; px = x; py = y; hasPointer = true; lastMove = performance.now(); },
      setTextShields: function (rects) { textShields = rects && rects.length ? rects : null; },
      armIntro: armIntro,
      fireShimmer: function () {
        if (reduced || !periodicShimmer) return;
        start();
        var now = performance.now();
        triggerShimmer(now);
        armShimmerPause(now, shimmerDur + SHIMMER_IDLE_MIN + Math.random() * SHIMMER_IDLE_RANGE);
      }
    };
  }

  /* ---- Aave-style dot grid -------------------------------------------------
     Dense grid of tiny dots that's always gently alive. Each dot's brightness:
       (a) a fixed per-dot random "spark" (most faint, a scattered few bright),
       (b) a smooth low-frequency noise field that clusters brightness into soft
           clouds — gives the field real depth (not a flat glow),
       (c) a slow per-dot twinkle so the whole field breathes (ambient motion),
       (d) a wide, soft cursor lift (brightness + dot size) — responsive but not
           a hard spotlight.
     On first load an organic shimmer sweeps across once (eased, wavy, ramped).
     initField is reassigned so the hero/footer calls use this; the returned
     object exposes no-op stubs for setBoost/setTextShields/armIntro. */
  function makeDotGrid(canvas, opts) {
    var api = { setBoost: function () {}, setTextShields: function () {}, armIntro: function () {} };
    if (!canvas || !canvas.getContext) return api;
    var ctx = canvas.getContext("2d");
    var PITCH = opts && opts.pitch != null ? opts.pitch : 14;  /* dot spacing */
    var DOT = 1.05;          /* base dot radius — a touch bigger than Aave's ~0.9px */
    var BASE = opts && opts.base != null ? opts.base : 0.15;         /* floor brightness for every dot */
    var SPARK = opts && opts.spark != null ? opts.spark : 0.3;       /* extra brightness for scattered bright dots */
    var DEPTH = opts && opts.depth != null ? opts.depth : 0.5;  /* noise-cluster strength (per-instance) */
    var VIS_FLOOR = 0.92;    /* steady visibility before flicker */
    var AMB = 1.15;          /* ambient flicker amplitude (random "activation" pops) */
    var HOVER = 2.4;         /* extra flicker amplitude near cursor (twinkly activation on hover) */
    var FLSPD = 0.0033;      /* base flicker speed (rad/ms) */
    var CLIFT = 0.45;        /* steady brightness lift near the cursor */
    var SIZE_LIFT = 0.35;    /* extra dot size near the cursor */
    var GLOW_R = 460;        /* cursor influence radius */
    var TRAIL_DECAY = 0.986; /* hover-trail fade per frame (leaves a trail for ~a few seconds) */
    var EDGE = 60;           /* fade dots near canvas edges */
    var INTRO_MS = opts && opts.introMs != null ? opts.introMs : 3000;  /* reveal duration (per-instance) */
    var INTRO_BAND = 0.30;   /* softness/width of the reveal front */
    var CREST = 1.2;         /* brightness bloom that travels with the reveal */
    var CRESTW = 0.13;       /* width of that bloom (wide = soft, not a flash) */
    var RAMP_MS = 900;       /* interactivity fades in over this long after the intro */
    var scatterMode = opts && opts.scatter ? String(opts.scatter) : "";
    var getInset = opts && opts.getInset;
    var insetFeather = opts && opts.insetFeather != null ? opts.insetFeather : 52;
    var insetL = 0, insetR = 0, insetT = 0, insetB = 0, fieldW = 0, fieldH = 0;
    var TAU = Math.PI * 2;
    function smooth01(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
    function applyInset() {
      insetL = insetR = insetT = insetB = 0;
      fieldW = cssW;
      fieldH = cssH;
      if (!getInset) return;
      var ins = getInset(canvas, cssW, cssH);
      if (!ins) return;
      insetT = ins.top || 0;
      insetR = ins.right || 0;
      insetB = ins.bottom || 0;
      insetL = ins.left || 0;
      fieldW = Math.max(1, cssW - insetL - insetR);
      fieldH = Math.max(1, cssH - insetT - insetB);
    }
    function insetDim(cx, cy) {
      if (!getInset) return 1;
      var dl = cx - insetL;
      var dr = insetR > 0 ? (cssW - insetR) - cx : Infinity;
      var dt = cy - insetT;
      var db = (cssH - insetB) - cy;
      var d = Math.min(dl, dr, dt, db);
      if (d >= insetFeather) return 1;
      if (d <= 0) return 0;
      return smooth01(d / insetFeather);
    }
    function scatterDim(x, y, col, row, ph, idx) {
      if (!scatterMode) return 1;
      var fx = x - insetL;
      var fy = y - insetT;
      var xn = fieldW > 0 ? fx / fieldW : 0;
      var yn = fieldH > 0 ? fy / fieldH : 0;
      if (scatterMode === "footer") {
        /* Sporadic cloud — bleeds past content, irregular on every edge + interior pockets */
        var spor = rnd(idx + 99) * (0.5 + 0.5 * Math.sin(ph * 4.1 + col * 0.91 + row * 1.37))
          * (0.5 + 0.5 * Math.cos(ph * 2.6 - col * 1.2 + row * 0.55));
        var topEdge =
          -0.06 +
          Math.sin(xn * 7.4 + ph * 0.41) * 0.14 +
          Math.sin(xn * 3.6 + col * 0.43) * 0.1 +
          (rnd(idx + 404) - 0.5) * 0.12;
        var botEdge =
          1.04 +
          Math.sin(xn * 6.1 - ph * 0.62) * 0.12 +
          Math.cos(xn * 4.2 + row * 0.31) * 0.09 +
          (rnd(idx + 505) - 0.5) * 0.1;
        var leftEdge =
          -0.05 +
          Math.sin(yn * 8.2 + ph * 0.33) * 0.14 +
          Math.cos(yn * 3.8 + col * 0.27) * 0.1 +
          (rnd(idx + 606) - 0.5) * 0.11;
        var rightEdge =
          1.05 +
          Math.sin(yn * 5.6 - ph * 0.48) * 0.13 +
          Math.cos(yn * 7.1 + row * 0.19) * 0.09 +
          (rnd(idx + 707) - 0.5) * 0.11;
        var fromTop = yn - topEdge;
        var fromBot = botEdge - yn;
        var fromLeft = xn - leftEdge;
        var fromRight = rightEdge - xn;
        if (fromTop <= -0.08 || fromBot <= -0.08 || fromLeft <= -0.08 || fromRight <= -0.08) return 0;
        var gate = smooth01(fromTop / 0.22) * smooth01(fromBot / 0.22)
          * smooth01(fromLeft / 0.2) * smooth01(fromRight / 0.2);
        gate *= 0.38 + spor * 0.62;
        if (fromTop < 0.14 && spor < 0.14) gate *= 0.35;
        if (fromBot < 0.14 && spor < 0.16) gate *= 0.35;
        gate *= 1.05 - xn * 0.12;
        /* Interior voids — breaks up any rectangular fill */
        if (rnd(idx + 1201) > 0.74 + gate * 0.18) return 0;
        if (rnd(idx + 1302) > 0.88 && spor < 0.35) return 0;
        return gate;
      }
      return 1;
    }
    var dpr = 1, cssW = 0, cssH = 0, cols = 0, rows = 0, offX = 0, offY = 0;
    var spark = null, depth = null, phase = null, spd = null, heat = null;
    var px = 0, py = 0, gx = 0, gy = 0, pointerSeen = false;
    var raf = 0, running = false, inView = true, primed = false, introStart = -1, introEnd = -1;
    var introFired = false, deferIntro = !!(opts && opts.deferIntroVisible);
    var skipIntro = !!(opts && opts.skipIntro);

    function rnd(i) { var x = Math.sin(i * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); }
    function spike(t, c, w) { var z = (t - c) / w; return Math.exp(-z * z); } /* sharp flash pulse */
    function fieldNoise(x, y) {
      var n = Math.sin(x * 0.0125 + y * 0.0071) * 0.5
            + Math.sin(x * 0.027 - y * 0.019 + 1.7) * 0.32
            + Math.sin((x + y) * 0.0094 + 2.3) * 0.18;
      return 0.5 + 0.5 * n;                      /* ~0..1 smooth clouds */
    }
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      cssW = r.width; cssH = r.height;
      if (!cssW || !cssH) return;
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      cols = Math.ceil(cssW / PITCH) + 1; rows = Math.ceil(cssH / PITCH) + 1;
      offX = Math.round((cssW - (cols - 1) * PITCH) / 2);
      offY = Math.round((cssH - (rows - 1) * PITCH) / 2);
      spark = new Float32Array(cols * rows);
      depth = new Float32Array(cols * rows);
      phase = new Float32Array(cols * rows);
      spd = new Float32Array(cols * rows);
      heat = new Float32Array(cols * rows);
      var k = 0;
      for (var rr = 0; rr < rows; rr++) {
        for (var c = 0; c < cols; c++) {
          var v = rnd(k + 1); spark[k] = v * v;          /* skew faint */
          depth[k] = fieldNoise(offX + c * PITCH, offY + rr * PITCH);
          phase[k] = rnd(k + 941) * TAU;                 /* per-dot flicker phase */
          spd[k] = 0.4 + 1.2 * rnd(k + 5003);            /* per-dot flicker rate (random rhythms) */
          k++;
        }
      }
      applyInset();
      if (!primed) {
        px = gx = insetL + fieldW * 0.35;
        py = gy = insetT + fieldH * 0.42;
        primed = true;
      }
    }
    function edgeDim(x, y) {
      var d = Math.min(x, cssW - x, y, cssH - y);
      return d >= EDGE ? 1 : d <= 0 ? 0 : d / EDGE;
    }
    function draw(now) {
      if (!cssW || !cssH || !spark) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (!reduced && !introFired) return;             /* grid isn't there until the reveal fires */
      var introActive = false, front = 0;
      if (introStart >= 0) {
        var ip = (now - introStart) / INTRO_MS;
        if (ip >= 1) { introStart = -1; introEnd = now; }
        else {
          introActive = true;
          var t = ip < 0 ? 0 : ip;
          var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   /* graceful easeInOut sweep */
          front = e * (1 + 2 * INTRO_BAND) - INTRO_BAND;
        }
      }
      /* interactivity is off during the intro, then fades in smoothly */
      var iFac = introStart >= 0 ? 0 : (introEnd >= 0 ? Math.min(1, (now - introEnd) / RAMP_MS) : 1);
      var paint = iFac > 0 && pointerSeen;
      ctx.fillStyle = "#fff";
      var k = 0;
      for (var rr = 0; rr < rows; rr++) {
        for (var c = 0; c < cols; c++) {
          var s = spark[k], dp = depth[k], ph = phase[k], sp = spd[k];
          var x = offX + c * PITCH, y = offY + rr * PITCH;
          /* hover heat: decays each frame; the cursor paints fresh heat → a fading trail */
          var h = heat[k] * TRAIL_DECAY;
          if (paint) {
            var dx = x - gx, dy = y - gy, d2 = dx * dx + dy * dy;
            if (d2 < GLOW_R * GLOW_R) { var pr = 1 - Math.sqrt(d2) / GLOW_R; pr = pr * pr * iFac; if (pr > h) h += (pr - h) * 0.1; } /* ease heat up, no abrupt pop */
          }
          heat[k] = h; k++;
          var glow = h;
          /* irregular twinkle (two beating sines → more random activation) */
          var f = (0.5 + 0.5 * Math.sin(now * FLSPD * sp + ph)) * (0.5 + 0.5 * Math.sin(now * FLSPD * sp * 0.53 + ph * 2.3 + 1.1));
          f = f * f;
          var a = (BASE + SPARK * s) * (1 - DEPTH + DEPTH * dp) * (VIS_FLOOR + (AMB + HOVER * glow) * f) * (1 + CLIFT * glow);
          var rad = DOT * (0.78 + 0.5 * dp) * (1 + SIZE_LIFT * glow);
          if (introActive) {
            /* dots ease in along a soft diagonal front, lit by a gentle traveling bloom */
            var dpos = (x / cssW + y / cssH) * 0.5 + (ph / TAU - 0.5) * 0.22;
            var dd = front - dpos;
            var rt = dd / INTRO_BAND;
            var reveal = rt <= 0 ? 0 : rt >= 1 ? 1 : rt * rt * (3 - 2 * rt);
            if (reveal <= 0) continue;                   /* not there yet */
            a = (a + CREST * Math.exp(-(dd * dd) / (CRESTW * CRESTW)) * (0.4 + 0.6 * s)) * reveal;
            rad *= 0.45 + 0.55 * reveal;                 /* dots grow in for a clearer reveal */
          }
          a *= scatterDim(x, y, c, rr, ph, k - 1);
          if (a <= 0.004) continue;
          a *= insetDim(x, y);
          if (a <= 0.004) continue;
          if (!getInset) a *= edgeDim(x, y);
          if (a <= 0.004) continue;
          ctx.globalAlpha = a > 1 ? 1 : a;   /* let the brightest twinkles reach full white */
          ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);   /* little squares */
        }
      }
      ctx.globalAlpha = 1;
    }
    function frame() {
      gx += (px - gx) * 0.14;
      gy += (py - gy) * 0.14;
      draw(performance.now());
      if (running) raf = requestAnimationFrame(frame);   /* continuous: ambient twinkle + trail */
    }
    function start() { if (running || reduced) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function triggerIntro() { if (introFired || reduced) return; introFired = true; introStart = performance.now(); start(); }
    api.armIntro = triggerIntro;   /* hero calls this once its text has animated in */

    size();
    if (skipIntro) introFired = true;
    draw(performance.now());       /* empty pre-intro (or full grid when reduced-motion / skipIntro) */
    canvas.classList.add("is-on");
    if (reduced) return api;
    if (deferIntro) window.setTimeout(triggerIntro, 250);    /* reveal shortly after the text starts loading in */

    window.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      var nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (!pointerSeen) { gx = nx; gy = ny; }   /* start the glow at the cursor, not the centre */
      px = nx; py = ny; pointerSeen = true;
      if (inView && introFired) start();
    }, { passive: true });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) {
        inView = en[0].isIntersecting;
        if (inView) { if (introFired) start(); else if (!deferIntro) triggerIntro(); }
        else stop();
      }, { threshold: 0.01 });
      io.observe(canvas);
    } else if (!deferIntro) triggerIntro();
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (inView && introFired) start(); });
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { size(); draw(performance.now()); }, 150); }, { passive: true });
    return api;
  }
  initField = makeDotGrid;

  /* The factory image is static; the animated grid belongs in the footer. */
  initField(document.querySelector(".footer__grid-fx"), {
    scatter: "footer",
    pitch: 11,
    base: 0.19,
    spark: 0.36,
    depth: 0.62,
    skipIntro: true,
    deferIntroVisible: false,
    insetFeather: 36,
    getInset: function (host, w, h) {
      var footer = host.closest(".footer");
      var box = footer && footer.querySelector(".container");
      var bleedX = Math.round(Math.min(80, Math.max(44, w * 0.055)));
      var bleedY = Math.round(Math.min(28, h * 0.035));
      var top = Math.max(0, Math.round(6 + h * 0.008 - bleedY));
      var bottom = 0;
      if (!box || !footer) {
        return { top: top, bottom: bottom, left: Math.round(w * 0.02), right: Math.round(w * 0.02) };
      }
      var fr = footer.getBoundingClientRect();
      var cr = box.getBoundingClientRect();
      return {
        top: top,
        bottom: bottom,
        left: Math.max(0, Math.round(cr.left - fr.left - bleedX)),
        right: Math.max(0, Math.round(fr.right - cr.right - bleedX))
      };
    }
  });
})();


/* CTA arrow animation */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var qsa = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var ARROW_HTML = '<span class="link-cta__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line data-part="shaft" x1="15" y1="12" x2="15" y2="12"></line><line data-part="upper" x1="11" y1="8" x2="15" y2="12"></line><line data-part="lower" x1="11" y1="16" x2="15" y2="12"></line></svg></span>';

  function lerp(a, b, t) { return a + (b - a) * t; }

  function setArrowProgress(svg, p) {
    var shaft = svg.querySelector('[data-part="shaft"]');
    var upper = svg.querySelector('[data-part="upper"]');
    var lower = svg.querySelector('[data-part="lower"]');
    if (!shaft || !upper || !lower) return;
    shaft.setAttribute("x1", String(lerp(15, 9, p)));
    shaft.setAttribute("x2", String(lerp(15, 18, p)));
    shaft.style.opacity = p < 0.1 ? "0" : String(lerp(0, 1, (p - 0.1) / 0.9));
    upper.setAttribute("x1", String(lerp(11, 14, p)));
    upper.setAttribute("x2", String(lerp(15, 18, p)));
    lower.setAttribute("x1", String(lerp(11, 14, p)));
    lower.setAttribute("x2", String(lerp(15, 18, p)));
  }

  qsa(".link-cta").forEach(function (link) {
    if (!link.querySelector(".link-cta__arrow")) link.insertAdjacentHTML("beforeend", ARROW_HTML);
    var svg = link.querySelector(".link-cta__arrow svg");
    if (!svg) return;
    setArrowProgress(svg, 0);

    if (reduced) {
      link.addEventListener("mouseenter", function () { setArrowProgress(svg, 1); });
      link.addEventListener("mouseleave", function () { setArrowProgress(svg, 0); });
      link.addEventListener("focusin", function () { setArrowProgress(svg, 1); });
      link.addEventListener("focusout", function () { setArrowProgress(svg, 0); });
      return;
    }

    var progress = 0, target = 0, velocity = 0, raf = 0;
    function tick() {
      var spring = -500 * (progress - target) - 30 * velocity;
      velocity += spring * (1 / 60);
      progress += velocity * (1 / 60);
      if (Math.abs(progress - target) < 0.002 && Math.abs(velocity) < 0.002) { progress = target; velocity = 0; }
      setArrowProgress(svg, progress);
      if (progress !== target || Math.abs(velocity) > 0.002) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    function setTarget(v) { target = v; if (!raf) raf = requestAnimationFrame(tick); }
    link.addEventListener("mouseenter", function () { setTarget(1); });
    link.addEventListener("mouseleave", function () { setTarget(0); });
    link.addEventListener("focusin", function () { setTarget(1); });
    link.addEventListener("focusout", function () { setTarget(0); });
  });
})();
