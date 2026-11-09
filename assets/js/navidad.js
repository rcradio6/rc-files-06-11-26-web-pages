/* ==========================================================================
   Ambiente navideño — luces decorativas (RC Radio 107.7 FM)
   - Una guirnalda cuelga del header y otra del borde superior del footer.
   - Son solo decorativas: no son enlaces, no se enfocan con teclado y los
     lectores de pantalla las ignoran.
   - Interacción: al pasar el ratón la bombilla se balancea; al tocar/clic
     cambia de color y se propaga una pequeña ola por la guirnalda.
   ========================================================================== */
(function () {
  "use strict";

  /* Las luces se apagan solas después de esta fecha (AAAA-MM-DD).
     Pon null para dejarlas siempre. */
  var HASTA = "2027-01-10";
  if (HASTA && new Date() > new Date(HASTA + "T23:59:59")) return;

  var COLORS = ["#ff3b3b", "#ffc933", "#35e070", "#3aa0ff", "#ff6bd6"];
  var NS = "http://www.w3.org/2000/svg";
  var strings = [];

  function el(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  function create(host, shift) {
    if (!host) return;
    var box = el("div", "xmas-lights");
    box.setAttribute("aria-hidden", "true");
    box.setAttribute("role", "presentation");
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "xmas-wire");
    svg.setAttribute("preserveAspectRatio", "none");
    var bulbs = el("div", "xmas-bulbs");
    box.appendChild(svg);
    box.appendChild(bulbs);
    host.appendChild(box);

    var s = { host: host, box: box, svg: svg, bulbs: bulbs, shift: shift, width: 0, items: [] };
    strings.push(s);
    bindEvents(s);
    build(s);
  }

  function build(s) {
    var W = Math.round(s.box.clientWidth || s.host.clientWidth);
    if (!W) return;
    s.width = W;

    var mobile = W < 640;
    var n = Math.max(2, Math.round(W / (mobile ? 130 : 210))); // cantidad de "festones"
    var sw = W / n;                                             // ancho de cada festón
    var sag = mobile ? 10 : 15;                                 // cuánto cae el cable
    var gap = mobile ? 34 : 44;                                 // separación entre bombillas
    var k = Math.max(2, Math.round(sw / gap));                  // bombillas por festón

    var d = "M0,0 ";
    for (var i = 0; i < n; i++) {
      var x0 = i * sw;
      d += "Q" + (x0 + sw / 2).toFixed(1) + "," + (2 * sag) + " " + (x0 + sw).toFixed(1) + ",0 ";
    }
    for (var a = 0; a <= n; a++) {
      var cx = a === n ? W : a * sw;
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", cx.toFixed(1));
      c.setAttribute("cy", "0");
      c.setAttribute("r", "2.5");
      s.svg.appendChild(c);
    }
    var path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    s.svg.insertBefore(path, s.svg.firstChild);
    s.svg.setAttribute("viewBox", "0 0 " + W + " " + (sag + 4));
    s.svg.setAttribute("height", sag + 4);

    s.items = [];
    var idx = 0;
    for (var p = 0; p < n; p++) {
      for (var j = 0; j < k; j++) {
        var t = (j + 0.5) / k;
        var x = p * sw + t * sw;
        var y = 4 * sag * t * (1 - t); // y exacto del cable en ese punto
        var b = el("span", "xb");
        var ci = (idx + s.shift) % COLORS.length;
        b.style.left = x.toFixed(1) + "px";
        b.style.top = (y - 1).toFixed(1) + "px";
        b.style.setProperty("--c", COLORS[ci]);
        b.style.setProperty("--d", ((idx % 3) * 0.8).toFixed(1) + "s"); // parpadeo por grupos
        b.appendChild(el("i"));
        b._ci = ci;
        b._idx = idx;
        s.bulbs.appendChild(b);
        s.items.push(b);
        idx++;
      }
    }
  }

  function swing(b, delay, dir) {
    b.style.setProperty("--s", delay.toFixed(2) + "s");
    b.style.setProperty("--sg", dir);
    b.classList.remove("swing");
    void b.offsetWidth; // reinicia la animación
    b.classList.add("swing");
  }

  function bindEvents(s) {
    // Al pasar el ratón: la bombilla se balancea
    s.bulbs.addEventListener("pointerover", function (e) {
      if (e.pointerType && e.pointerType !== "mouse") return;
      var b = e.target.closest && e.target.closest(".xb");
      if (!b || b.contains(e.relatedTarget) || b.classList.contains("swing")) return;
      swing(b, 0, Math.random() < 0.5 ? -1 : 1);
    });

    // Clic / toque: cambia de color y viaja una ola por la guirnalda
    s.bulbs.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".xb");
      if (!b) return;
      b._ci = (b._ci + 1) % COLORS.length;
      b.style.setProperty("--c", COLORS[b._ci]);
      b.classList.remove("pop");
      void b.offsetWidth;
      b.classList.add("pop");
      s.items.forEach(function (o) {
        var dist = Math.abs(o._idx - b._idx);
        if (dist > 7) return;
        swing(o, dist * 0.06, (o._idx % 2 ? -1 : 1) * (dist === 0 ? 1.2 : 1));
      });
    });

    s.bulbs.addEventListener("animationend", function (e) {
      var t = e.target;
      if (!t.classList || !t.classList.contains("xb")) return;
      if (e.animationName === "xmas-swing") t.classList.remove("swing");
      if (e.animationName === "xmas-flash") t.classList.remove("pop");
    });
  }

  function clear(s) {
    while (s.svg.firstChild) s.svg.removeChild(s.svg.firstChild);
    s.bulbs.innerHTML = "";
  }

  // Si cambia el ancho de la ventana, se recalculan (con pausa para no gastar)
  var timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      strings.forEach(function (s) {
        var w = Math.round(s.box.clientWidth || s.host.clientWidth);
        if (w && w !== s.width) { clear(s); build(s); }
      });
    }, 150);
  });

  create(document.querySelector(".site-header"), 0); // parte superior
  create(document.querySelector(".site-footer"), 2); // pie de página
})();
