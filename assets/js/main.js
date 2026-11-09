/* ==========================================================================
   RC Radio 107.7 FM Estelí — Interacciones del sitio
   ========================================================================== */
(function () {
  "use strict";

  // Raíz del sitio, deducida de la ubicación de este script (sirve desde cualquier URL, p. ej. 404.html)
  var ROOT = (function () {
    try { return new URL("../../", document.currentScript.src).href; } catch (e) { return ""; }
  })();

  var STREAM = "https://rcradioenlinea.radioca.st/stream";

  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ------------------------------------------------------------ Menú móvil */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ------------------------------------------------------------ Audio global
     El objeto Audio vive fuera del contenedor PJAX, así que sigue sonando
     mientras se cambia de página. */
  var audio, audioCtx, analyser, freqData, isOn = false, corsFallback = false, retries = 0;

  // iOS: el analizador sobre un stream puede dejar el audio mudo, así que allí usamos <audio> directo
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var skipAnalyser = isIOS || (function () { try { return sessionStorage.getItem("rc_nocors") === "1"; } catch (e) { return false; } })();

  function createAudio(useCors) {
    var a = new Audio();
    if (useCors) a.crossOrigin = "anonymous";
    a.preload = "none";
    a.setAttribute("playsinline", "");
    a.addEventListener("playing", function () { retries = 0; syncUI(); ensureLoop(); });
    a.addEventListener("pause", function () { if (!isOn) syncUI(); });
    a.addEventListener("ended", function () { if (a === audio && isOn) reconnect(); });
    a.addEventListener("error", function () {
      if (a !== audio || !isOn) return;
      if (window.console) console.warn("[RC Radio] error de audio, código:", a.error && a.error.code);
      if (a.crossOrigin && !corsFallback) {
        // El servidor no permite CORS: reproducimos sin analizador (onda simulada)
        corsFallback = true;
        analyser = null;
        try { sessionStorage.setItem("rc_nocors", "1"); } catch (e) {}
        var fb = audio = createAudio(false);
        applyVolume(currentVolume());
        fb.src = STREAM + "/;" + Date.now();
        fb.play().catch(function (err) { if (fb === audio) playFailed(err); });
      } else {
        reconnect();
      }
    });
    return a;
  }

  function playFailed(err) {
    var name = err && err.name;
    if (window.console) console.warn("[RC Radio] play() rechazado:", name);
    // Solo el bloqueo del navegador (NotAllowedError) es definitivo.
    // Si el stream no carga (NotSupportedError) el evento "error" se encarga de reintentar.
    if (name === "NotAllowedError") {
      isOn = false;
      store("rc_playing", "false");
      syncUI();
    }
  }

  // Si el stream se corta, reintentamos unas veces antes de rendirnos
  function reconnect() {
    if (!isOn) return;
    if (retries++ >= 3) { isOn = false; store("rc_playing", "false"); syncUI(); return; }
    var el = audio;
    setTimeout(function () {
      if (!isOn || el !== audio) return;
      el.src = STREAM + "/;" + Date.now();
      el.play().catch(function (err) { if (el === audio) playFailed(err); });
    }, 1500);
  }

  audio = createAudio(!skipAnalyser);

  // UI persistente (fuera de PJAX)
  var miniPlayBtn = document.getElementById("rcMiniPlay");
  var miniMarquee = document.getElementById("miniMarqueeContent");
  var miniVol = document.getElementById("rcMiniVol");
  var floatingBar = document.getElementById("rcFloating");

  // UI que cambia con cada página
  var playBtn, mainMarquee, canvas, ctx, vol, volValue, playerCard;

  function currentVolume() {
    var v = parseFloat(load("rc_volume"));
    if (isNaN(v)) v = 100;
    if (v <= 1 && v > 0) v = v * 100;
    return Math.max(0, Math.min(100, v));
  }

  function initUIElements() {
    playBtn = document.getElementById("rcPlay");
    mainMarquee = document.getElementById("rcMarqueeContent");
    canvas = document.getElementById("rcWave");
    ctx = canvas ? canvas.getContext("2d") : null;
    vol = document.getElementById("rcVolume");
    volValue = document.getElementById("rcVolumeValue");
    playerCard = playBtn ? playBtn.closest(".player-v2") : null;

    if (playBtn) playBtn.onclick = togglePlay;
    if (vol) vol.oninput = function () { applyVolume(parseFloat(vol.value)); };

    updateProgram();
    applyVolume(currentVolume());
    syncUI();
    ensureLoop();
  }

  /* ------------------------------------------------------------ Contenido editable (contenido.txt) */
  var CONTENT_URL = ROOT + "contenido.txt";
  var content = null; // { text: {}, schedule: {semana:[], ...} }

  function pad5(t) { return ("0" + t).slice(-5); }

  function parseContent(raw) {
    var out = { text: {}, schedule: {}, programas: null, audios: null }, block = null;
    raw.replace(/^\uFEFF/, "").split(/\r?\n/).forEach(function (line) {
      var l = line.trim();
      if (!l || l.charAt(0) === "#") return;
      var m = l.match(/^\[([a-z_]+)\]/i);
      if (m) {
        var nm = m[1].toLowerCase();
        if (nm.indexOf("horario_") === 0) { block = nm.slice(8); out.schedule[block] = []; }
        else if (nm === "programas" || nm === "audios") { block = nm; out[nm] = []; }
        else block = null;
        return;
      }
      if (block === "programas" && l.indexOf("|") > -1) {
        var q = l.split("|").map(function (x) { return x.trim(); });
        out.programas.push({ img: q[0] || "", nombre: q[1] || "", horario: q[2] || "", desc: q[3] || "",
          tags: (q[4] || "").split(";").map(function (x) { return x.trim(); }).filter(Boolean) });
        return;
      }
      if (block === "audios" && l.indexOf("|") > -1) {
        var a = l.split("|").map(function (x) { return x.trim(); });
        out.audios.push({ titulo: a[0] || "", subtitulo: a[1] || "", url: a[2] || "" });
        return;
      }
      if (block && block !== "programas" && block !== "audios") {
        var s = l.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\|\s*(.+)$/);
        if (s) { out.schedule[block].push({ start: pad5(s[1]), end: pad5(s[2]), program: s[3].trim() }); return; }
      }
      var i = l.indexOf(":");
      if (i < 1) return;
      block = null;
      out.text[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    return out;
  }

  function esc(t) {
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // *palabra* → <span>palabra</span> (se pinta de rojo según el estilo)
  function richHtml(v) { return esc(v).replace(/\*([^*]+)\*/g, "<span>$1</span>"); }
  function plain(v) { return v.replace(/\*/g, ""); }

  function sortByStart(list) {
    return list.slice().sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  }

  function renderSchedules(root) {
    if (!content) return;
    var sc = content.schedule;
    root.querySelectorAll("ul[data-schedule]").forEach(function (ul) {
      var kind = ul.getAttribute("data-schedule"), list;
      if (kind === "semana") {
        if (!sc.semana || !sc.semana.length) return;
        list = sc.semana.concat((sc.viernes || []).map(function (e) {
          return { start: e.start, end: e.end, program: e.program + " (Viernes)" };
        }));
        list = sortByStart(list);
      } else {
        list = sc[kind];
        if (!list || !list.length) return;
      }
      ul.innerHTML = "";
      list.forEach(function (e) {
        var li = document.createElement("li");
        var h = document.createElement("span"); h.className = "hora"; h.textContent = e.start + " - " + e.end;
        var p = document.createElement("span"); p.className = "prog"; p.textContent = e.program;
        li.appendChild(h); li.appendChild(p); ul.appendChild(li);
      });
    });
  }

  function imgSrc(v) { return /^(https?:|data:|\/)/i.test(v) ? v : ROOT + v; }
  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  // Tarjetas de programas y audios (se editan desde el panel de administración)
  function renderLists(root) {
    if (!content) return;
    var g = root.querySelector('[data-lista="programas"]');
    if (g && content.programas && content.programas.length) {
      g.innerHTML = "";
      content.programas.forEach(function (p, i) {
        var art = mk("article", "program-card"); art.setAttribute("data-prog", i);
        var th = mk("div", "thumb"), im = document.createElement("img");
        if (p.img) im.src = imgSrc(p.img);
        im.alt = p.nombre; im.setAttribute("data-prog", i); im.setAttribute("data-campo", "img");
        th.appendChild(im);
        var body = mk("div", "body");
        var h3 = mk("h3", "", p.nombre); h3.setAttribute("data-prog", i); h3.setAttribute("data-campo", "nombre");
        var tm = mk("span", "time", p.horario); tm.setAttribute("data-prog", i); tm.setAttribute("data-campo", "horario");
        var pp = mk("p", "", p.desc); pp.setAttribute("data-prog", i); pp.setAttribute("data-campo", "desc");
        body.appendChild(h3); body.appendChild(tm); body.appendChild(pp);
        if (p.tags.length) {
          var tg = mk("div", "tags");
          p.tags.forEach(function (t, k) { var s = mk("span", "tag", t); s.setAttribute("data-prog", i); s.setAttribute("data-campo", "tag"); s.setAttribute("data-tag", k); tg.appendChild(s); });
          body.appendChild(tg);
        }
        art.appendChild(th); art.appendChild(body); g.appendChild(art);
      });
    }
    var ga = root.querySelector('[data-lista="audios"]');
    if (ga && content.audios && content.audios.length) {
      ga.innerHTML = "";
      content.audios.forEach(function (a, i) {
        var card = mk("div", "audio-card"); card.setAttribute("data-audio", i);
        var info = mk("div", "info"); info.appendChild(mk("div", "icon", "\u266A"));
        var tx = mk("div", "text");
        var t1 = mk("span", "title", a.titulo); t1.setAttribute("data-audio", i); t1.setAttribute("data-campo", "titulo");
        var t2 = mk("span", "subtitle", a.subtitulo); t2.setAttribute("data-audio", i); t2.setAttribute("data-campo", "subtitulo");
        tx.appendChild(t1); tx.appendChild(t2); info.appendChild(tx);
        var btn = mk("button", "play-btn", "\u25B6"); btn.setAttribute("data-audio-toggle", ""); btn.setAttribute("aria-label", "Reproducir");
        var au = document.createElement("audio"); au.preload = "none";
        var so = document.createElement("source"); so.src = a.url; so.type = "audio/mpeg"; au.appendChild(so);
        card.appendChild(info); card.appendChild(btn); card.appendChild(au); ga.appendChild(card);
      });
    }
  }

  function applyContent(root) {
    if (!content) return;
    root = root || document;
    root.querySelectorAll("[data-content-id]").forEach(function (el) {
      var v = content.text[el.getAttribute("data-content-id")];
      if (v == null || v === "") return;
      var tag = el.tagName;
      if (tag === "TITLE" || tag === "META") return; // se aplican en applyHead
      el.innerHTML = richHtml(v);
    });
    root.querySelectorAll("[data-content-img]").forEach(function (el) {
      var v = content.text[el.getAttribute("data-content-img")];
      if (!v) return;
      var src = imgSrc(v);
      if (el.getAttribute("src") !== src) el.setAttribute("src", src);
    });
    root.querySelectorAll("[data-content-href]").forEach(function (el) {
      var v = content.text[el.getAttribute("data-content-href")];
      if (v) el.setAttribute("href", v);
    });
    root.querySelectorAll("[data-content-src]").forEach(function (el) {
      var v = content.text[el.getAttribute("data-content-src")];
      if (v && el.getAttribute("src") !== v) el.setAttribute("src", v);
    });
    root.querySelectorAll("[data-content-twitch]").forEach(function (el) {
      var v = content.text[el.getAttribute("data-content-twitch")];
      if (v) el.setAttribute("data-twitch", v);
    });
    renderLists(root);
    renderSchedules(root);
  }

  // Título de la pestaña y descripción (de un documento cualquiera)
  function applyHead(doc) {
    if (!content) return;
    var t = doc.querySelector("title[data-content-id]");
    if (t) {
      var v = content.text[t.getAttribute("data-content-id")];
      if (v) document.title = plain(v);
    }
    var m = doc.querySelector('meta[name="description"][data-content-id]');
    var cur = document.querySelector('meta[name="description"]');
    if (m && cur) {
      var d = content.text[m.getAttribute("data-content-id")];
      cur.setAttribute("content", d ? plain(d) : m.getAttribute("content"));
    }
  }

  var contentPromise = fetch(CONTENT_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(function (txt) { content = parseContent(txt); })
    .catch(function (err) {
      content = null; /* se usan los textos del HTML */
      if (window.console) console.warn("[RC Radio] No se pudo leer contenido.txt (" + (err && err.message) + "). Si abriste el archivo con doble clic, súbelo a un servidor o usa localhost.");
    });

  /* ------------------------------------------------------------ Programación (por defecto) */
  var defaultSchedule = {
    weekday: [
      { start: "05:00", end: "06:00", program: "El Amanesquero" },
      { start: "06:00", end: "08:00", program: "Solo Éxitos de la RC" },
      { start: "08:00", end: "11:00", program: "Revista Ke Mañana" },
      { start: "11:00", end: "13:00", program: "Autoridad Grupera" },
      { start: "13:00", end: "14:00", program: "Pegaditas 1077" },
      { start: "14:00", end: "17:00", program: "Zona Urbana: Bajo Cero" },
      { start: "17:00", end: "19:00", program: "Las más Chulonas de la RC" },
      { start: "19:00", end: "20:00", program: "Baladas en Español" },
      { start: "20:00", end: "23:00", program: "Retro de Noche" }
    ],
    friday: [
      { start: "09:00", end: "10:00", program: "El INNS con Vos" },
      { start: "11:00", end: "11:30", program: "Fem en Acción" }
    ],
    saturday: [
      { start: "05:00", end: "08:00", program: "Solo Éxitos de la RC" },
      { start: "08:00", end: "12:00", program: "Delivery RC" },
      { start: "12:00", end: "13:00", program: "Pegaditas 1077" },
      { start: "13:00", end: "14:00", program: "El INNS con Vos" },
      { start: "14:00", end: "17:00", program: "Último Hit" },
      { start: "17:00", end: "19:00", program: "Las más Chulonas de la RC" },
      { start: "19:00", end: "20:00", program: "Bachata Mix" },
      { start: "20:00", end: "23:59", program: "Retro de Noche" }
    ],
    sunday: [
      { start: "08:00", end: "09:00", program: "Activado 60 Segundos" },
      { start: "09:00", end: "11:00", program: "Ruta de Sandino" },
      { start: "11:00", end: "13:00", program: "Doble contra Sencillo" },
      { start: "13:00", end: "14:00", program: "Pegaditas 1077" },
      { start: "14:00", end: "17:00", program: "Set de la RC" },
      { start: "17:00", end: "19:00", program: "Las más Chulonas de la RC" },
      { start: "19:00", end: "20:00", program: "Bachata Mix" },
      { start: "20:00", end: "23:59", program: "Retro de Noche" }
    ]
  };

  function activeSchedule() {
    var sc = content && content.schedule;
    if (!sc || !sc.semana || !sc.semana.length) return defaultSchedule;
    return {
      weekday: sc.semana,
      friday: sc.viernes || [],
      saturday: sc.sabado || [],
      sunday: sc.domingo || []
    };
  }

  function findIn(list, time) {
    for (var i = 0; i < list.length; i++) {
      if (time >= list[i].start && time < list[i].end) return list[i].program;
    }
    return null;
  }

  function getProgram() {
    var schedule = activeSchedule();
    var now = new Date();
    var day = now.getDay();
    var time = ("0" + now.getHours()).slice(-2) + ":" + ("0" + now.getMinutes()).slice(-2);
    var found = null;
    if (day === 0) found = findIn(schedule.sunday, time);
    else if (day === 6) found = findIn(schedule.saturday, time);
    else {
      if (day === 5) found = findIn(schedule.friday, time);
      if (!found) found = findIn(schedule.weekday, time);
    }
    var fallback = (content && content.text.reproductor_programa_por_defecto) || "Radio Estelí 107.7 FM - La que te gusta";
    return found || fallback;
  }

  /* ------------------------------------------------------------ Marquee infinito sin huecos
     Repite el texto las veces necesarias para llenar el ancho y duplica el grupo:
     al desplazar -50% el final empalma exactamente con el principio. */
  function buildMarquee(el, text, force) {
    if (!el) return;
    var wrap = el.parentNode;
    var w = (wrap && wrap.clientWidth) || 300;
    if (!force && el._text === text && Math.abs((el._w || 0) - w) < 40) return;
    el._text = text; el._w = w;

    el.innerHTML = "";
    el.style.animation = "none";
    var probe = document.createElement("span");
    probe.className = "marquee-text";
    probe.textContent = text;
    el.appendChild(probe);
    var itemW = probe.offsetWidth || 200;
    var perGroup = Math.max(1, Math.ceil(w / itemW));
    el.innerHTML = "";
    for (var g = 0; g < 2; g++) {
      for (var i = 0; i < perGroup; i++) {
        var sp = document.createElement("span");
        sp.className = "marquee-text";
        sp.textContent = text;
        if (g === 1) sp.setAttribute("aria-hidden", "true");
        el.appendChild(sp);
      }
    }
    var groupW = itemW * perGroup;
    el.style.animation = "";
    el.style.animationDuration = Math.max(8, groupW / 45).toFixed(1) + "s"; // 45 px/s
  }

  function updateProgram(force) {
    var program = getProgram();
    var prefix = (content && content.text.reproductor_prefijo) || "Estás escuchando:";
    var text = prefix + " " + program;
    buildMarquee(mainMarquee, text, force === true);
    buildMarquee(miniMarquee, text, force === true);
    if ("mediaSession" in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: program,
        artist: "RC Radio 107.7 FM",
        album: "Estelí, Nicaragua"
      });
    }
  }
  setInterval(updateProgram, 30000);
  window.addEventListener("resize", function () { updateProgram(false); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { updateProgram(true); });

  /* ------------------------------------------------------------ Visualizador */
  function initAnalyser() {
    if (analyser || corsFallback || skipAnalyser) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audioCtx) {
        audioCtx = new AC();
        var src = audioCtx.createMediaElementSource(audio);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);
        freqData = new Uint8Array(analyser.frequencyBinCount);
      }
    } catch (e) { analyser = null; }
  }

  var rafId = 0, bars = [], silentFrames = 0, simT = 0;

  function ensureLoop() {
    if (!rafId && canvas && ctx) rafId = requestAnimationFrame(renderFrame);
  }

  function sizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function renderFrame() {
    rafId = 0;
    if (!canvas || !ctx || !document.body.contains(canvas)) return;
    if (document.hidden) return; // se reanuda en visibilitychange
    // Solo animamos mientras suena y el reproductor está visible
    if (!isOn || (playerCard && playerCard.classList.contains("is-idle"))) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    rafId = requestAnimationFrame(renderFrame);

    var s = sizeCanvas(), w = s.w, h = s.h;
    if (w < 10 || h < 10) return;
    ctx.clearRect(0, 0, w, h);

    // Las barras ocupan TODO el ancho: primera pegada a la izquierda, última a la derecha
    var barW = w < 480 ? 4 : 6;
    var count = Math.max(24, Math.floor(w / (barW + 4)));
    var step = (w - barW) / (count - 1);
    if (bars.length !== count) { bars = new Array(count); for (var k = 0; k < count; k++) bars[k] = 0; }

    var real = false;
    if (analyser && !audio.paused) {
      analyser.getByteFrequencyData(freqData);
      var sum = 0;
      for (var q = 0; q < freqData.length; q += 8) sum += freqData[q];
      if (sum > 0) { real = true; silentFrames = 0; } else silentFrames++;
    }
    var useSim = !real && (silentFrames > 20 || !analyser);
    simT += 0.035;

    var bins = freqData ? freqData.length : 512;
    var lo = 2, hi = bins * 0.72; // ~40 Hz – ~16 kHz
    var grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#e50914");
    grad.addColorStop(0.5, "#ff5a5f");
    grad.addColorStop(1, "#ffffff");
    ctx.fillStyle = grad;

    for (var i = 0; i < count; i++) {
      var t = i / (count - 1), target;
      if (useSim) {
        target = 0.25 + 0.35 * Math.abs(Math.sin(simT * 1.3 + i * 0.35)) +
                 0.25 * Math.abs(Math.sin(simT * 0.7 - i * 0.18));
      } else if (real) {
        // escala logarítmica: reparte los graves y agudos por todo el ancho
        var a = Math.floor(lo * Math.pow(hi / lo, t));
        var b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, Math.min(1, t + 1 / count))));
        var acc = 0, n = 0;
        for (var j = a; j <= b && j < bins; j++) { acc += freqData[j]; n++; }
        target = (n ? acc / n : 0) / 255;
        target = Math.min(1, Math.pow(target, 1.1) * (1 + t * 0.9)); // compensa agudos débiles
      } else target = 0;
      bars[i] += (target - bars[i]) * (target > bars[i] ? 0.5 : 0.14);

      var bh = Math.max(3, bars[i] * h * 0.92);
      var x = i * step, y = (h - bh) / 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, barW / 2);
      else ctx.rect(x, y, barW, bh);
      ctx.fill();
    }
  }

  document.addEventListener("visibilitychange", function () { if (!document.hidden) ensureLoop(); });

  /* ------------------------------------------------------------ Controles */
  var playIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var pauseIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

  function syncUI() {
    if (playBtn) {
      playBtn.innerHTML = isOn ? pauseIcon : playIcon;
      playBtn.setAttribute("aria-label", isOn ? "Pausar" : "Reproducir");
    }
    if (miniPlayBtn) {
      miniPlayBtn.innerHTML = isOn ? "⏸" : "▶";
      miniPlayBtn.setAttribute("aria-label", isOn ? "Pausar" : "Reproducir");
    }
    // Reproductor grande: pequeño cuando no suena
    if (playerCard) playerCard.classList.toggle("is-idle", !isOn);
    if (floatingBar) floatingBar.classList.toggle("is-playing", isOn);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isOn ? "playing" : "paused";
    if (isOn) ensureLoop();
  }

  function startRadio() {
    initAnalyser();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    stopClips();
    isOn = true;
    audio.src = STREAM + "/;" + Date.now(); // siempre en vivo
    retries = 0;
    var el = audio, p = el.play();
    // ignoramos el rechazo de un elemento que ya fue reemplazado por el respaldo sin CORS
    if (p && p.catch) p.catch(function (err) { if (el === audio) playFailed(err); });
    store("rc_playing", "true");
    syncUI();
  }

  function stopRadio() {
    isOn = false;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    store("rc_playing", "false");
    syncUI();
  }

  function togglePlay() { if (isOn) stopRadio(); else startRadio(); }

  if (miniPlayBtn) miniPlayBtn.onclick = togglePlay;

  function applyVolume(val) {
    if (isNaN(val)) val = 100;
    audio.volume = Math.pow(val / 100, 1.5);
    store("rc_volume", val);
    if (vol) { vol.value = val; vol.style.setProperty("--fill", val + "%"); }
    if (miniVol) { miniVol.value = val; miniVol.style.setProperty("--fill", val + "%"); }
    if (volValue) volValue.textContent = Math.round(val) + "%";
  }
  if (miniVol) miniVol.oninput = function () { applyVolume(parseFloat(miniVol.value)); };

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", startRadio);
      navigator.mediaSession.setActionHandler("pause", stopRadio);
    } catch (e) {}
  }

  // Si la página se recargó por completo, el navegador exige un gesto para volver a sonar
  if (load("rc_playing") === "true") {
    var resume = function () {
      document.removeEventListener("click", resume, true);
      if (load("rc_playing") === "true" && !isOn) startRadio();
    };
    document.addEventListener("click", resume, true);
  }

  /* Audios de la página de programación (botones .audio-card) */
  var clip = null;
  function stopClips() {
    document.querySelectorAll(".audio-card audio").forEach(function (a) {
      a.pause();
      var b = a.parentNode.querySelector("[data-audio-toggle]");
      if (b) b.textContent = "▶";
    });
    clip = null;
  }
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-audio-toggle]");
    if (!btn) return;
    var a = btn.parentNode.querySelector("audio");
    if (!a) return;
    if (!a.paused) { a.pause(); btn.textContent = "▶"; return; }
    if (isOn) stopRadio();
    stopClips();
    clip = a;
    a.play().catch(function () {});
    btn.textContent = "⏸";
    a.onended = function () { btn.textContent = "▶"; };
  });

  /* ------------------------------------------------------------ Twitch
     Twitch solo carga si "parent" coincide con el dominio actual: lo ponemos automáticamente. */
  function initTwitch() {
    var host = location.hostname;
    if (!host) return;
    document.querySelectorAll("iframe[data-twitch]").forEach(function (f) {
      var parents = [host];
      if (host.indexOf("www.") === 0) parents.push(host.slice(4));
      else if (host.split(".").length === 2) parents.push("www." + host);
      var src = "https://player.twitch.tv/?channel=" + encodeURIComponent(f.getAttribute("data-twitch")) +
        parents.map(function (p) { return "&parent=" + encodeURIComponent(p); }).join("") + "&autoplay=false";
      if (f.getAttribute("src") !== src) f.setAttribute("src", src);
    });
  }

  /* ------------------------------------------------------------ Barra flotante */
  var observer = null;
  function initObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    if (!floatingBar) return;
    if (playBtn && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(function (entries) {
        floatingBar.classList.toggle("show", !entries[0].isIntersecting);
      }, { threshold: 0 });
      observer.observe(playBtn);
    } else {
      floatingBar.classList.add("show"); // en otras páginas siempre visible
    }
  }

  /* ------------------------------------------------------------ Carrusel infinito
     Animación CSS sobre transform (compositor, 60 fps), sin saltos al reiniciar. */
  var carouselRO = null;
  var IMG_DIR = ROOT + "assets/img/";
  var team = null; // lista leída de equipo.txt (o null si no se pudo leer)

  /* equipo.txt: una línea por foto, p. ej.  6 - Ana Pérez - Locutora.png
     (opcional:  archivo.png | Nombre | Cargo ) */
  var EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"];
  var EXT_RE = /\.(jpe?g|png|webp|avif|gif)$/i;

  // Extensiones a probar para una foto: la indicada primero, luego las demás (minúscula y mayúscula)
  function candidates(m) {
    var list = [];
    if (m.ext) list.push(m.base + m.ext);
    EXTS.forEach(function (e) { list.push(m.base + e); });
    EXTS.forEach(function (e) { list.push(m.base + e.toUpperCase()); });
    return list;
  }

  function parseTeam(raw) {
    var list = [];
    raw.replace(/^\uFEFF/, "").split(/\r?\n/).forEach(function (line, idx) {
      var l = line.trim();
      if (!l || l.charAt(0) === "#") return;
      var file = l, name = "", role = "";
      if (l.indexOf("|") > -1) {
        var p = l.split("|").map(function (x) { return x.trim(); });
        file = p[0]; name = p[1] || ""; role = p[2] || "";
      }
      var em = file.match(EXT_RE);
      var ext = em ? em[0] : "";
      var base = em ? file.slice(0, -ext.length) : file;
      var parts = base.split(/\s+-\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
      var num = null;
      if (parts.length && /^\d+$/.test(parts[0])) num = parseInt(parts.shift(), 10);
      if (!name) name = parts.shift() || "";
      if (!role) role = parts.join(" - ");
      if (!name) return;
      var item = { base: base, ext: ext, name: name, role: role, num: num, idx: idx, tried: {} };
      item.file = candidates(item)[0];
      list.push(item);
    });
    // el orden del carrusel es el orden de las líneas de equipo.txt
    return list;
  }

  function makeCards(list) {
    return list.map(function (m) {
      var card = document.createElement("div");
      card.className = "staff-card";
      card.setAttribute("data-team-file", m.base + m.ext);
      var photo = document.createElement("div"); photo.className = "photo";
      var img = document.createElement("img");
      img.src = IMG_DIR + encodeURIComponent(m.file).replace(/%2F/g, "/");
      img.alt = m.name;
      img.setAttribute("data-file", m.file);
      img.decoding = "async";
      photo.appendChild(img);
      var info = document.createElement("div"); info.className = "info";
      var h3 = document.createElement("h3"); h3.textContent = m.name;
      var p = document.createElement("p"); p.textContent = m.role;
      info.appendChild(h3); info.appendChild(p);
      card.appendChild(photo); card.appendChild(info);
      return card;
    });
  }

  var teamPromise = fetch(ROOT + "equipo.txt?t=" + Date.now(), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
    .then(function (txt) { var l = parseTeam(txt); team = l.length ? l : null; })
    .catch(function (err) {
      team = null; /* se usa el equipo escrito en el HTML */
      if (window.console) console.warn("[RC Radio] No se pudo leer equipo.txt (" + (err && err.message) + ").");
    });

  function cardsFor(carousel) {
    return team && team.length ? makeCards(team) : carousel._static;
  }

  function buildCarousel(carousel) {
    var cards = carousel._cards;
    if (!cards || !cards.length) return;
    carousel.innerHTML = "";
    var track = document.createElement("div");
    track.className = "staff-track";
    carousel.appendChild(track);

    // 1) medimos el ancho real de un juego completo (cambia según la pantalla)
    cards.forEach(function (c) { track.appendChild(c.cloneNode(true)); });
    var setW = track.scrollWidth || cards.length * 300;
    var viewW = carousel.clientWidth || window.innerWidth || 1200;

    // 2) copias mínimas para cubrir la pantalla (pistas más cortas = menos memoria de GPU)
    var need = Math.max(1, Math.ceil(viewW / setW));
    track.innerHTML = "";
    // dos grupos idénticos: la animación recorre exactamente uno (-50%)
    for (var rep = 0; rep < 2; rep++) {
      for (var g = 0; g < need; g++) {
        cards.forEach(function (c) {
          var el = c.cloneNode(true);
          if (rep === 1) el.setAttribute("aria-hidden", "true");
          track.appendChild(el);
        });
      }
    }
    var groupW = setW * need;
    carousel.style.setProperty("--staff-duration", (groupW / 55).toFixed(2) + "s"); // 55 px/s
  }

  function refreshCarousel() {
    var carousel = document.querySelector(".staff-carousel");
    if (!carousel || !carousel._static) return;
    carousel._cards = cardsFor(carousel);
    buildCarousel(carousel);
  }

  function initStaffCarousel() {
    var carousel = document.querySelector(".staff-carousel");
    if (carouselRO) { carouselRO.disconnect(); carouselRO = null; }
    if (!carousel) return;
    carousel._static = Array.prototype.slice.call(carousel.children);
    if (!carousel._static.length) return;
    carousel._cards = cardsFor(carousel);
    buildCarousel(carousel);

    // en pantallas táctiles: se pausa mientras el dedo está sobre el carrusel
    var hold = function () { carousel.classList.add("is-held"); };
    var release = function () { carousel.classList.remove("is-held"); };
    carousel.addEventListener("pointerdown", hold);
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { carousel.addEventListener(ev, release); });

    var lastW = carousel.clientWidth;
    if ("ResizeObserver" in window) {
      carouselRO = new ResizeObserver(function () {
        if (Math.abs(carousel.clientWidth - lastW) > 80) {
          lastW = carousel.clientWidth;
          buildCarousel(carousel);
        }
      });
      carouselRO.observe(carousel);
    }
  }

  // Si una foto no carga, probamos otras extensiones (jpg, jpeg, png, webp...).
  // Si ninguna existe, se omite y el carrusel se rearma sin ella.
  var rebuildTimer = null;
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG" || !img.closest || !img.closest(".staff-track")) return;
    var file = img.getAttribute("data-file");
    if (!file || !team) return;
    var m = null;
    for (var i = 0; i < team.length; i++) if (team[i].file === file) { m = team[i]; break; }
    if (!m) return; // otra copia de la misma foto ya lo resolvió
    m.tried[file] = true;
    var next = null, c = candidates(m);
    for (var k = 0; k < c.length; k++) if (!m.tried[c[k]]) { next = c[k]; break; }
    if (next) m.file = next;
    else team = team.filter(function (x) { return x !== m; });
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(refreshCarousel, 60);
  }, true);

  /* ------------------------------------------------------------ Navegación PJAX
     Intercepta TODOS los enlaces internos, así el audio nunca se corta. */
  var container = document.getElementById("pjax-container");
  var pageCache = {};
  var navigating = false;

  function isInternalPage(a) {
    if (!a || !a.href) return false;
    if (a.target && a.target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    if (a.protocol !== location.protocol || a.host !== location.host) return false;
    return /(\.html?|\/)$/.test(a.pathname) || a.pathname === "";
  }

  function updateNavActive(url) {
    var path = new URL(url, location.href).pathname.replace(/\/$/, "/index.html");
    document.querySelectorAll(".nav-links a").forEach(function (link) {
      var lp = new URL(link.href).pathname.replace(/\/$/, "/index.html");
      link.classList.toggle("active", lp === path);
    });
  }

  function initPage(root) {
    applyContent(root || container || document);
    initUIElements();
    initObserver();
    initTwitch();
    initStaffCarousel();
    if (navLinks) navLinks.classList.remove("open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  function swapIn(html, url, push, hash) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var fresh = doc.getElementById("pjax-container");
    if (!fresh) { location.href = url; return; }
    container.innerHTML = fresh.innerHTML;
    document.title = doc.title;
    var desc = doc.querySelector('meta[name="description"]');
    var curDesc = document.querySelector('meta[name="description"]');
    if (desc && curDesc) curDesc.setAttribute("content", desc.getAttribute("content"));
    applyHead(doc);
    if (push) history.pushState({ pjax: true }, doc.title, url);
    updateNavActive(url);
    initPage();
    var target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView(); else window.scrollTo(0, 0);
    container.classList.remove("is-leaving");
    document.body.classList.remove("loading-page");
    navigating = false;
  }

  function navigate(url, push) {
    if (navigating) return;
    navigating = true;
    var u = new URL(url, location.href);
    var hash = u.hash;
    var clean = u.origin + u.pathname + u.search;
    document.body.classList.add("loading-page");
    container.classList.add("is-leaving");

    var wait = new Promise(function (r) { setTimeout(r, 180); }); // deja terminar el fade-out
    var data = pageCache[clean]
      ? Promise.resolve(pageCache[clean])
      : fetch(clean).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        }).then(function (t) { pageCache[clean] = t; return t; });

    Promise.all([data, wait]).then(function (res) {
      swapIn(res[0], clean + hash, push, hash);
    }).catch(function () {
      // Último recurso (p. ej. abierto como file://): navegación normal
      location.href = url;
    });
  }

  function initPJAX() {
    if (!container || location.protocol === "file:") return; // fetch no funciona en file://
    history.replaceState({ pjax: true }, document.title, location.href);

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest("a");
      if (!isInternalPage(a)) return;
      // mismo documento + ancla → scroll normal
      if (a.pathname === location.pathname && a.hash) return;
      e.preventDefault();
      if (a.pathname === location.pathname) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      navigate(a.href, true);
    });

    window.addEventListener("popstate", function () { navigate(location.href, false); });
  }

  /* ------------------------------------------------------------ Arranque */
  initPage(document);
  initPJAX();
  teamPromise.then(refreshCarousel);
  contentPromise.then(function () {
    if (!content) return;
    applyContent(document);
    applyHead(document);
    updateProgram(true);
  });
})();
