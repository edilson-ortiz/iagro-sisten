/* =========================================================
   AgroClima IA — Agente de clima para agricultores (simulación WhatsApp)
   - Clima real: Open-Meteo (sin API key) con respaldo de datos demo
   - Imágenes: Esri World Imagery + NASA GIBS (MODIS) + NDVI simulado
   - Persistencia: localStorage (perfil, lluvias, plan, alertas)
   ========================================================= */
(() => {
  "use strict";

  /* ---------------- Constantes ---------------- */
  const STORE_KEY = "agroclima.v1";
  const FREE_RAIN_LIMIT = 30;

  const PLANS = {
    free:    { name: "Gratis",        price: 0,     days: 3 },
    pro:     { name: "Pro Agricultor", price: 4.99,  days: 7 },
    empresa: { name: "Agro Empresa",   price: 19.99, days: 7 },
  };

  const CROPS = {
    maiz:       { label: "Maíz",       icon: "🌽", kc: 1.15, tBase: 10 },
    papa:       { label: "Papa",       icon: "🥔", kc: 1.10, tBase: 7 },
    cafe:       { label: "Café",       icon: "☕", kc: 0.95, tBase: 12 },
    arroz:      { label: "Arroz",      icon: "🌾", kc: 1.20, tBase: 12 },
    soya:       { label: "Soya",       icon: "🫘", kc: 1.00, tBase: 10 },
    trigo:      { label: "Trigo",      icon: "🌾", kc: 1.10, tBase: 4 },
    hortalizas: { label: "Hortalizas", icon: "🥬", kc: 1.00, tBase: 7 },
    frutales:   { label: "Frutales",   icon: "🍊", kc: 0.90, tBase: 7 },
    otro:       { label: "Otro cultivo", icon: "🌱", kc: 1.00, tBase: 8 },
  };

  const ALERT_TYPES = {
    helada:   { label: "Heladas",           desc: "Temperatura mínima ≤ 2 °C",       icon: "🥶" },
    lluvia:   { label: "Lluvia intensa",    desc: "≥ 20 mm en un día",                 icon: "🌧️" },
    viento:   { label: "Viento fuerte",     desc: "Ráfagas ≥ 50 km/h",                 icon: "💨" },
    calor:    { label: "Calor extremo",     desc: "Temperatura máxima ≥ 34 °C",        icon: "🔥" },
    tormenta: { label: "Tormentas/granizo", desc: "Actividad eléctrica o granizo",     icon: "⛈️" },
    uv:       { label: "Radiación UV",      desc: "Índice UV ≥ 11 (extremo)",          icon: "☀️" },
    resumen:  { label: "Resumen diario",    desc: "Pronóstico cada día a las 6:00 a. m.", icon: "📰" },
  };

  const WMO = {
    0: ["Despejado", "☀️"], 1: ["Mayormente despejado", "🌤️"], 2: ["Parcialmente nublado", "⛅"], 3: ["Nublado", "☁️"],
    45: ["Niebla", "🌫️"], 48: ["Niebla con escarcha", "🌫️"],
    51: ["Llovizna ligera", "🌦️"], 53: ["Llovizna", "🌦️"], 55: ["Llovizna densa", "🌧️"],
    56: ["Llovizna helada", "🌧️"], 57: ["Llovizna helada densa", "🌧️"],
    61: ["Lluvia ligera", "🌦️"], 63: ["Lluvia moderada", "🌧️"], 65: ["Lluvia fuerte", "🌧️"],
    66: ["Lluvia helada", "🌧️"], 67: ["Lluvia helada fuerte", "🌧️"],
    71: ["Nevada ligera", "🌨️"], 73: ["Nevada", "🌨️"], 75: ["Nevada fuerte", "❄️"], 77: ["Granos de nieve", "🌨️"],
    80: ["Chubascos ligeros", "🌦️"], 81: ["Chubascos", "🌧️"], 82: ["Chubascos violentos", "⛈️"],
    85: ["Chubascos de nieve", "🌨️"], 86: ["Chubascos de nieve fuertes", "❄️"],
    95: ["Tormenta eléctrica", "⛈️"], 96: ["Tormenta con granizo", "⛈️"], 99: ["Tormenta con granizo fuerte", "⛈️"],
  };
  const wmo = (c) => WMO[c] || ["—", "🌡️"];

  const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  /* ---------------- Estado + persistencia ---------------- */
  const defaultState = () => ({
    profile: null,          // { name, place, lat, lon, crop, hectares, lots: [] }
    plan: "free",
    trialEnds: null,
    alerts: { helada: true, lluvia: true, viento: true, calor: true, tormenta: true, uv: false, resumen: true },
    rain: [],               // { id, date: "YYYY-MM-DD", mm, lot, note }
    payments: [],
  });

  let state = load();
  let awaiting = null;      // paso de conversación pendiente
  let draft = {};           // datos temporales durante el registro
  const wxCache = new Map();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (_) { /* almacenamiento no disponible */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
  }
  function isPremium() {
    if (state.plan === "free") return false;
    if (state.trialEnds && Date.now() > state.trialEnds) {
      state.plan = "free"; state.trialEnds = null; save();
      return false;
    }
    return true;
  }

  /* ---------------- Utilidades ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const chat = $("#chat");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const pad = (n) => String(n).padStart(2, "0");
  const nowTime = () => { const d = new Date(); return `${d.getHours()}:${pad(d.getMinutes())}`; };
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
  const dayName = (iso, i) => {
    if (i === 0) return "Hoy";
    if (i === 1) return "Mañana";
    const [y, m, d] = iso.split("-").map(Number);
    return DAY_NAMES[new Date(y, m - 1, d).getDay()];
  };
  const r1 = (n) => Math.round(n * 10) / 10;
  const fmtNum = (n, d = 1) => Number(n).toLocaleString("es", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const uid = () => Math.random().toString(36).slice(2, 9);
  const firstName = () => (state.profile?.name || "").split(" ")[0] || "agricultor";
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const windDir = (deg) => ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(deg / 45) % 8];

  /* ---------------- Render de mensajes ---------------- */
  const TICKS = `<svg class="ticks read" viewBox="0 0 16 11"><path fill="currentColor" d="M11.1.6 4.9 7.7 2.3 5.2l-.9.9 3.5 3.4L12 1.4zM15 .6 8.8 7.7l-.7-.7-.9.9 1.6 1.6L15.9 1.4z"/></svg>`;
  let lastSide = null;

  function addRow(side, html, { wide = false } = {}) {
    const row = document.createElement("div");
    row.className = `row ${side}`;
    if (lastSide !== side) row.classList.add("tail", "gap");
    lastSide = side;
    const bubble = document.createElement("div");
    bubble.className = "bubble" + (wide ? " wide" : "");
    bubble.innerHTML = `${html}<span class="meta">${nowTime()}${side === "out" ? TICKS : ""}</span><div class="clear"></div>`;
    row.appendChild(bubble);
    chat.appendChild(row);
    scrollBottom();
    return bubble;
  }

  function addButtons(buttons) {
    if (!buttons || !buttons.length) return;
    const row = document.createElement("div");
    row.className = "row in";
    const group = document.createElement("div");
    group.className = "qr-group";
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qr";
      btn.innerHTML = esc(b.label);
      btn.addEventListener("click", () => {
        if (b.once !== false) { group.classList.add("used"); group.querySelectorAll("button").forEach((x) => (x.disabled = true)); }
        if (b.echo !== false) userSay(b.label);
        handleAction(b.action, b.data);
      });
      group.appendChild(btn);
    });
    row.appendChild(group);
    chat.appendChild(row);
    lastSide = "in";
    scrollBottom();
  }

  function userSay(text) {
    addRow("out", esc(text));
  }

  let typingRow = null;
  function showTyping() {
    setStatus("escribiendo…");
    if (typingRow) return;
    typingRow = document.createElement("div");
    typingRow.className = "row in" + (lastSide !== "in" ? " tail gap" : "");
    typingRow.innerHTML = `<div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
    chat.appendChild(typingRow);
    scrollBottom();
  }
  function hideTyping() {
    if (typingRow) { typingRow.remove(); typingRow = null; }
    setStatus("en línea");
  }

  let queue = Promise.resolve();
  /** Mensaje del bot con indicador "escribiendo". Encola para mantener el orden. */
  function bot(html, opts = {}) {
    queue = queue.then(async () => {
      showTyping();
      const len = typeof html === "string" ? html.replace(/<[^>]+>/g, "").length : 80;
      await sleep(opts.delay ?? Math.min(450 + len * 6, 1500));
      let content;
      try {
        content = typeof html === "function" ? await html() : html;
      } catch (err) {
        console.error(err);
        content = "😕 Tuve un problema procesando eso. Inténtalo de nuevo en un momento.";
      }
      hideTyping();
      const bubble = addRow("in", content, opts);
      if (opts.list) attachListButton(bubble, opts.list);
      if (opts.after) opts.after(bubble);
      addButtons(opts.buttons);
      notifyIfHidden(content);
    });
    return queue;
  }

  function attachListButton(bubble, list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-btn";
    btn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 6h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zm-4 5h2v2H3zm4 0h14v2H7z"/></svg>${esc(list.button)}`;
    btn.addEventListener("click", () => openList(list));
    bubble.appendChild(btn);
  }

  function setStatus(t) { $("#contactStatus").textContent = t; }

  /* Scroll + no leídos */
  let unread = 0;
  function nearBottom() { return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 140; }
  function scrollBottom(force = false) {
    if (force || nearBottom() || !chat.dataset.userScrolled) {
      requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
      unread = 0; updateBadge();
    } else {
      unread++; updateBadge();
    }
  }
  function updateBadge() {
    const b = $("#unreadBadge");
    b.hidden = unread === 0;
    b.textContent = unread;
  }
  chat.addEventListener("scroll", () => {
    const nb = nearBottom();
    chat.dataset.userScrolled = nb ? "" : "1";
    $("#scrollDown").classList.toggle("show", !nb);
    if (nb) { unread = 0; updateBadge(); }
  });
  $("#scrollDown").addEventListener("click", () => { chat.dataset.userScrolled = ""; scrollBottom(true); });

  /* ---------------- Push notification ---------------- */
  let pushTimer = null;
  function push(title, text, onClick) {
    const el = $("#push");
    $("#pushTitle").textContent = title;
    $("#pushText").textContent = text;
    el.classList.add("show");
    el.onclick = () => { el.classList.remove("show"); onClick && onClick(); };
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => el.classList.remove("show"), 5200);
  }
  function notifyIfHidden(html) {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("AgroClima IA", { body: String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 120) }); } catch (_) { /* ignorar */ }
    }
  }

  /* ---------------- Bottom sheet ---------------- */
  function openSheet(title, bodyHtml, onMount) {
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = bodyHtml;
    $("#sheet").classList.add("show");
    $("#sheetBackdrop").classList.add("show");
    onMount && onMount($("#sheetBody"));
  }
  function closeSheet() {
    $("#sheet").classList.remove("show");
    $("#sheetBackdrop").classList.remove("show");
  }
  $("#sheetClose").addEventListener("click", closeSheet);
  $("#sheetBackdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeDropdown(); } });

  function openList(list) {
    const html = list.sections.map((s) => `
      <div class="list-section">${esc(s.title)}</div>
      ${s.rows.map((r, i) => `
        <button class="list-item" type="button" data-action="${r.action}" data-label="${esc(r.title)}">
          <span class="li-ic">${r.icon || ""}</span>
          <span class="li-txt"><b>${esc(r.title)}</b>${r.desc ? `<small>${esc(r.desc)}</small>` : ""}</span>
          ${r.premium && !isPremium() ? `<span class="pill">PRO</span>` : ""}
        </button>`).join("")}`).join("");
    openSheet(list.title || "Menú", html, (body) => {
      body.querySelectorAll(".list-item").forEach((b) => b.addEventListener("click", () => {
        closeSheet();
        userSay(b.dataset.label);
        handleAction(b.dataset.action);
      }));
    });
  }

  /* ---------------- Menú principal ---------------- */
  const MAIN_MENU = {
    button: "Ver menú",
    title: "¿En qué te ayudo?",
    sections: [
      { title: "Clima", rows: [
        { icon: "🌤️", title: "Clima ahora", desc: "Condiciones actuales en tu campo", action: "now" },
        { icon: "🕐", title: "Próximas 24 horas", desc: "Lluvia y viento hora por hora", action: "hours" },
        { icon: "📅", title: "Pronóstico 7 días", desc: "Temperaturas y lluvia de la semana", action: "week" },
      ]},
      { title: "Alertas", rows: [
        { icon: "🚨", title: "Revisar alertas", desc: "Riesgos para los próximos días", action: "alerts" },
        { icon: "⚙️", title: "Configurar alertas", desc: "Elige qué avisos recibir", action: "alerts_config" },
      ]},
      { title: "Mi campo", rows: [
        { icon: "🌧️", title: "Registrar lluvia", desc: "Anota los mm de tu pluviómetro", action: "rain_add" },
        { icon: "📊", title: "Historial de lluvias", desc: "Totales, gráfico y comparación", action: "rain_history" },
        { icon: "🛰️", title: "Imágenes satelitales", desc: "Parcela, nubes y NDVI", action: "satellite", premium: false },
        { icon: "🧑‍🌾", title: "Consejos agronómicos", desc: "Fumigación, riego, siembra, plagas", action: "agro" },
      ]},
      { title: "Cuenta", rows: [
        { icon: "👤", title: "Mi perfil", desc: "Datos de tu campo", action: "profile" },
        { icon: "⭐", title: "Planes Premium", desc: "Desbloquea todas las funciones", action: "plans" },
      ]},
    ],
  };

  function showMenu(text) {
    bot(text || `¿Qué necesitas, ${esc(firstName())}? Toca <b>Ver menú</b> o escríbeme con tus palabras (por ejemplo: <i>"¿va a llover mañana?"</i> o <i>"llovió 15 mm"</i>).`, {
      list: MAIN_MENU,
      buttons: [
        { label: "🌤️ Clima ahora", action: "now" },
        { label: "🌧️ Registrar lluvia", action: "rain_add" },
        { label: "🛰️ Ver satélite", action: "satellite" },
      ],
    });
  }

  /* ---------------- Clima: Open-Meteo ---------------- */
  async function getWeather(lat, lon) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const hit = wxCache.get(key);
    if (hit && Date.now() - hit.t < 15 * 60 * 1000) return hit.data;

    const params = new URLSearchParams({
      latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7, past_days: 31, wind_speed_unit: "kmh",
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover",
      hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,soil_moisture_0_to_7cm",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,et0_fao_evapotranspiration,sunrise,sunset",
    });
    let data;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: ctrl.signal });
      clearTimeout(to);
      if (!res.ok) throw new Error(res.status);
      data = shapeWeather(await res.json(), false);
    } catch (_) {
      data = demoWeather(lat);
    }
    wxCache.set(key, { t: Date.now(), data });
    return data;
  }

  /** Separa pasado / futuro a partir del día de hoy local de la ubicación. */
  function shapeWeather(raw, demo) {
    const today = raw.current.time.slice(0, 10);
    const di = Math.max(0, raw.daily.time.indexOf(today));
    const hourKey = raw.current.time.slice(0, 13) + ":00";
    let hi = raw.hourly.time.indexOf(hourKey);
    if (hi < 0) hi = di * 24 + new Date().getHours();
    const sliceD = (a, b) => Object.fromEntries(Object.entries(raw.daily).map(([k, v]) => [k, v.slice(a, b)]));
    return {
      demo,
      current: raw.current,
      utcOffset: raw.utc_offset_seconds || 0,
      daily: sliceD(di, di + 7),
      past: sliceD(Math.max(0, di - 31), di),
      hourly: Object.fromEntries(Object.entries(raw.hourly).map(([k, v]) => [k, v.slice(hi, hi + 48)])),
    };
  }

  /** Datos de demostración plausibles (sin internet). Determinísticos por día. */
  function demoWeather(lat) {
    let seed = Math.floor(Date.now() / 864e5) + Math.round(Math.abs(lat) * 100);
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const base = 30 - Math.abs(lat) * 0.45;
    const now = new Date();
    const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], precipitation_probability_max: [],
      wind_speed_10m_max: [], wind_gusts_10m_max: [], uv_index_max: [], et0_fao_evapotranspiration: [], sunrise: [], sunset: [] };
    for (let i = -31; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const wet = rnd();
      const rain = wet > 0.62 ? r1((wet - 0.6) * 80) : 0;
      const code = rain > 15 ? (rnd() > .6 ? 95 : 63) : rain > 0 ? 61 : pick([0, 1, 2, 3]);
      const tmax = r1(base + (rnd() - 0.5) * 6 - (rain > 0 ? 2 : 0));
      daily.time.push(isoDate(d));
      daily.weather_code.push(code);
      daily.temperature_2m_max.push(tmax);
      daily.temperature_2m_min.push(r1(tmax - 8 - rnd() * 6));
      daily.precipitation_sum.push(rain);
      daily.precipitation_probability_max.push(rain > 0 ? Math.round(55 + rnd() * 40) : Math.round(rnd() * 25));
      daily.wind_speed_10m_max.push(r1(8 + rnd() * 20));
      daily.wind_gusts_10m_max.push(r1(18 + rnd() * 40));
      daily.uv_index_max.push(r1(5 + rnd() * 6));
      daily.et0_fao_evapotranspiration.push(r1(3 + rnd() * 2.5));
      daily.sunrise.push(`${isoDate(d)}T06:05`);
      daily.sunset.push(`${isoDate(d)}T18:12`);
    }
    const hourly = { time: [], temperature_2m: [], relative_humidity_2m: [], precipitation_probability: [], precipitation: [], weather_code: [], wind_speed_10m: [], soil_moisture_0_to_7cm: [] };
    const start = new Date(now); start.setMinutes(0, 0, 0); start.setDate(start.getDate() - 31); start.setHours(0);
    for (let h = 0; h < 38 * 24; h++) {
      const d = new Date(start.getTime() + h * 36e5);
      const di = Math.floor(h / 24);
      const hr = d.getHours();
      const tmin = daily.temperature_2m_min[di], tmax = daily.temperature_2m_max[di];
      const t = tmin + (tmax - tmin) * Math.max(0, Math.sin(((hr - 6) / 24) * Math.PI * 2) * 0.5 + 0.5) ** 1.3;
      const pp = daily.precipitation_probability_max[di];
      hourly.time.push(`${isoDate(d)}T${pad(hr)}:00`);
      hourly.temperature_2m.push(r1(t));
      hourly.relative_humidity_2m.push(Math.round(Math.min(98, 92 - (t - tmin) * 3 + rnd() * 6)));
      const p = hr > 12 && hr < 20 ? pp : Math.round(pp * 0.4);
      hourly.precipitation_probability.push(p);
      hourly.precipitation.push(p > 50 ? r1(daily.precipitation_sum[di] / 6) : 0);
      hourly.weather_code.push(p > 50 ? daily.weather_code[di] : hr > 18 || hr < 6 ? 1 : 2);
      hourly.wind_speed_10m.push(r1(4 + rnd() * daily.wind_speed_10m_max[di]));
      hourly.soil_moisture_0_to_7cm.push(r1(0.18 + rnd() * 0.15));
    }
    const ci = 31 * 24 + now.getHours();
    const raw = {
      current: {
        time: hourly.time[ci], temperature_2m: hourly.temperature_2m[ci], relative_humidity_2m: hourly.relative_humidity_2m[ci],
        apparent_temperature: r1(hourly.temperature_2m[ci] + 1.2), precipitation: hourly.precipitation[ci], weather_code: hourly.weather_code[ci],
        wind_speed_10m: hourly.wind_speed_10m[ci], wind_direction_10m: Math.round(rnd() * 360), wind_gusts_10m: r1(hourly.wind_speed_10m[ci] * 1.6),
        cloud_cover: Math.round(rnd() * 100),
      },
      daily, hourly,
    };
    return shapeWeather(raw, true);
  }

  async function geocode(name) {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=es&format=json`);
      const j = await res.json();
      if (!j.results || !j.results.length) return null;
      const r = j.results[0];
      return { place: [r.name, r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude };
    } catch (_) {
      return null;
    }
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`);
      const j = await res.json();
      return [j.locality || j.city, j.principalSubdivision, j.countryName].filter(Boolean).join(", ") || "Mi ubicación";
    } catch (_) {
      return "Mi ubicación";
    }
  }

  function demoNote(wx) {
    return wx.demo ? `<br><small style="color:var(--muted)">⚠️ Sin conexión al servicio meteorológico: mostrando datos de demostración.</small>` : "";
  }

  /* ---------------- Gráficos SVG (una serie) ---------------- */
  function barChart(values, labels, { unit = "mm", highlightLast = false, title = "" } = {}) {
    const W = 300, H = 120, padL = 8, padR = 8, padT = 16, padB = 18;
    const n = values.length;
    const max = Math.max(1, ...values);
    const slot = (W - padL - padR) / n;
    const bw = Math.max(4, Math.min(22, slot - 2));
    const ih = H - padT - padB;
    const maxIdx = values.indexOf(Math.max(...values));
    let bars = "";
    values.forEach((v, i) => {
      const h = v > 0 ? Math.max(3, (v / max) * ih) : 0;
      const x = padL + i * slot + (slot - bw) / 2;
      const y = padT + ih - h;
      const r = Math.min(4, bw / 2, h);
      const path = h > 0
        ? `M${x},${padT + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${padT + ih} Z`
        : "";
      const cls = highlightLast && i === n - 1 ? "bar hl" : "bar";
      bars += `<g><title>${esc(labels[i])}: ${fmtNum(v)} ${unit}</title>
        <rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${ih}"/>
        ${path ? `<path class="${cls}" d="${path}"/>` : ""}
        ${i === maxIdx && v > 0 ? `<text class="val-label" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${fmtNum(v)}</text>` : ""}
      </g>`;
    });
    const step = n > 8 ? Math.ceil(n / 6) : 1;
    let xl = "";
    labels.forEach((l, i) => {
      if (i % step === 0 || i === n - 1) xl += `<text class="axis-label" x="${padL + i * slot + slot / 2}" y="${H - 4}" text-anchor="middle">${esc(l)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
      <line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}"/>
      <line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${padT}" y2="${padT}" stroke-dasharray="2 3"/>
      <text class="axis-label" x="${W - padR}" y="${padT - 4}" text-anchor="end">${fmtNum(max)} ${unit}</text>
      ${bars}${xl}</svg>`;
  }

  /* ---------------- Funciones del agente ---------------- */
  function requireProfile() {
    if (state.profile) return true;
    startOnboarding();
    return false;
  }

  async function actionNow(loc = state.profile) {
    bot(async () => {
      const wx = await getWeather(loc.lat, loc.lon);
      const c = wx.current;
      const [desc, ic] = wmo(c.weather_code);
      const d = wx.daily;
      const analysis = aiSummary(wx);
      return `<div class="card">
          <div class="wx-now">
            <div class="wx-icon">${ic}</div>
            <div>
              <div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
              <div class="wx-desc">${desc} · Sensación ${Math.round(c.apparent_temperature)}°</div>
              <div class="wx-loc">📍 ${esc(loc.place)}</div>
            </div>
          </div>
          <div class="wx-grid">
            <div>Máx / Mín<b>${Math.round(d.temperature_2m_max[0])}° / ${Math.round(d.temperature_2m_min[0])}°</b></div>
            <div>Humedad<b>${c.relative_humidity_2m}%</b></div>
            <div>Lluvia hoy<b>${fmtNum(d.precipitation_sum[0])} mm</b></div>
            <div>Viento<b>${Math.round(c.wind_speed_10m)} km/h ${windDir(c.wind_direction_10m)}</b></div>
            <div>Ráfagas<b>${Math.round(c.wind_gusts_10m)} km/h</b></div>
            <div>Índice UV<b>${fmtNum(d.uv_index_max[0])}</b></div>
          </div>
        </div>
        <p>🤖 <b>Análisis IA:</b> ${analysis}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [
      { label: "🕐 Próximas 24 horas", action: "hours" },
      { label: "📅 Pronóstico 7 días", action: "week" },
      { label: "🚨 ¿Hay alertas?", action: "alerts" },
    ]});
  }

  function aiSummary(wx) {
    const d = wx.daily, h = wx.hourly, c = wx.current;
    const parts = [];
    const nextRain = h.precipitation_probability.slice(0, 24).findIndex((p) => p >= 60);
    if (nextRain === 0) parts.push("está lloviendo o lloverá en la próxima hora");
    else if (nextRain > 0) parts.push(`alta probabilidad de lluvia en ~${nextRain} h (${h.time[nextRain].slice(11, 16)})`);
    else parts.push("no se espera lluvia significativa en las próximas 24 h");
    if (d.temperature_2m_min[1] <= 2) parts.push(`⚠️ riesgo de helada mañana (${Math.round(d.temperature_2m_min[1])} °C)`);
    if (d.temperature_2m_max[0] >= 33) parts.push("calor intenso: evita labores entre 12:00 y 16:00");
    if (c.wind_speed_10m < 15 && nextRain !== 0) parts.push("viento adecuado para aplicar agroquímicos ahora");
    else if (c.wind_speed_10m >= 15) parts.push("viento alto: no fumigues por deriva");
    const week = d.precipitation_sum.reduce((a, b) => a + b, 0);
    parts.push(`acumulado previsto de la semana: ${fmtNum(week)} mm`);
    return parts.join("; ") + ".";
  }

  function actionHours() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const h = wx.hourly;
      let cells = "";
      for (let i = 0; i < 24; i++) {
        const [, ic] = wmo(h.weather_code[i]);
        cells += `<div class="hour">${i === 0 ? "Ahora" : h.time[i].slice(11, 16)}<span class="h-ic">${ic}</span><b>${Math.round(h.temperature_2m[i])}°</b><span class="h-pp">💧${h.precipitation_probability[i] ?? 0}%</span><br>💨${Math.round(h.wind_speed_10m[i])}</div>`;
      }
      const rains = h.precipitation.slice(0, 24);
      const labels = h.time.slice(0, 24).map((t) => t.slice(11, 13) + "h");
      const total = rains.reduce((a, b) => a + b, 0);
      return `<b>🕐 Próximas 24 horas</b> · ${esc(state.profile.place)}
        <div class="card"><div class="hours">${cells}</div></div>
        <div class="card"><div class="card-title">Lluvia prevista por hora (mm) · total ${fmtNum(total)} mm</div>${barChart(rains, labels, { title: "Lluvia por hora" })}</div>
        <p>Desliza las horas → 💧 probabilidad de lluvia · 💨 viento km/h.</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "🧑‍🌾 ¿Puedo fumigar?", action: "agro_spray" }, { label: "📅 Ver 7 días", action: "week" }] });
  }

  function actionWeek() {
    if (!requireProfile()) return;
    const days = isPremium() ? 7 : 3;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const d = wx.daily;
      const lo = Math.min(...d.temperature_2m_min.slice(0, days));
      const hi = Math.max(...d.temperature_2m_max.slice(0, days));
      const span = Math.max(1, hi - lo);
      let rows = "";
      for (let i = 0; i < days; i++) {
        const [desc, ic] = wmo(d.weather_code[i]);
        const a = ((d.temperature_2m_min[i] - lo) / span) * 100;
        const b = ((d.temperature_2m_max[i] - lo) / span) * 100;
        rows += `<div class="day" title="${desc}">
          <span class="d-name">${dayName(d.time[i], i)}</span>
          <span class="d-ic">${ic}</span>
          <span class="range"><span class="mn">${Math.round(d.temperature_2m_min[i])}°</span><span class="bar-track"><span class="bar-fill" style="left:${a}%;right:${100 - b}%"></span></span><span class="mx">${Math.round(d.temperature_2m_max[i])}°</span></span>
          <span class="d-rain">💧${d.precipitation_probability_max[i] ?? 0}%</span>
        </div>`;
      }
      const rain = d.precipitation_sum.slice(0, days);
      const labels = d.time.slice(0, days).map((t, i) => dayName(t, i));
      const total = rain.reduce((x, y) => x + y, 0);
      const wettest = rain.indexOf(Math.max(...rain));
      return `<b>📅 Pronóstico ${days} días</b> · ${esc(state.profile.place)}
        <div class="card"><div class="days">${rows}</div></div>
        <div class="card"><div class="card-title">Lluvia diaria prevista (mm) · total ${fmtNum(total)} mm</div>${barChart(rain, labels, { title: "Lluvia diaria" })}</div>
        <p>🤖 ${total < 1 ? "Semana seca: planifica riego y aprovecha para labores de campo." : `El día más lluvioso será <b>${labels[wettest]}</b> con ${fmtNum(rain[wettest])} mm. ${total > 40 ? "Revisa drenajes y evita aplicar fertilizante antes de esa fecha." : "Buena oportunidad para sembrar o fertilizar justo antes."}`}</p>
        ${!isPremium() ? `<p><span class="pill free">PLAN GRATIS</span> Ves 3 días. Con <b>Pro</b> ves 7 días, alertas automáticas y NDVI.</p>` : ""}${demoNote(wx)}`;
    }, { wide: true, buttons: isPremium()
      ? [{ label: "🚨 Revisar alertas", action: "alerts" }, { label: "🧑‍🌾 Consejos para mi cultivo", action: "agro" }]
      : [{ label: "⭐ Ver 7 días con Pro", action: "plans" }, { label: "🚨 Revisar alertas", action: "alerts" }] });
  }

  function computeAlerts(wx) {
    const d = wx.daily, list = [];
    for (let i = 0; i < 7; i++) {
      const when = `${dayName(d.time[i], i)} ${fmtDate(d.time[i])}`;
      const tmin = d.temperature_2m_min[i], tmax = d.temperature_2m_max[i];
      if (state.alerts.helada && tmin <= 2) list.push({ type: "helada", lvl: tmin <= -2 ? "crit" : tmin <= 0 ? "serious" : "warn", day: i,
        title: `Helada ${tmin <= 0 ? "" : "posible "}— ${when}`, text: `Mínima de ${fmtNum(tmin)} °C al amanecer. Riega la tarde anterior, cubre almácigos y evita podas.` });
      if (state.alerts.lluvia && d.precipitation_sum[i] >= 20) list.push({ type: "lluvia", lvl: d.precipitation_sum[i] >= 50 ? "crit" : "serious", day: i,
        title: `Lluvia intensa — ${when}`, text: `${fmtNum(d.precipitation_sum[i])} mm previstos. Limpia canales y posterga fertilización y fumigación.` });
      if (state.alerts.viento && d.wind_gusts_10m_max[i] >= 50) list.push({ type: "viento", lvl: d.wind_gusts_10m_max[i] >= 75 ? "crit" : "warn", day: i,
        title: `Viento fuerte — ${when}`, text: `Ráfagas de ${Math.round(d.wind_gusts_10m_max[i])} km/h. Asegura invernaderos y tutores; no apliques productos.` });
      if (state.alerts.calor && tmax >= 34) list.push({ type: "calor", lvl: tmax >= 38 ? "crit" : "serious", day: i,
        title: `Calor extremo — ${when}`, text: `Máxima de ${fmtNum(tmax)} °C. Riega temprano y protege al ganado y trabajadores.` });
      if (state.alerts.tormenta && [95, 96, 99].includes(d.weather_code[i])) list.push({ type: "tormenta", lvl: d.weather_code[i] >= 96 ? "crit" : "serious", day: i,
        title: `${d.weather_code[i] >= 96 ? "Tormenta con granizo" : "Tormenta eléctrica"} — ${when}`, text: "Evita trabajar en campo abierto. Revisa seguros agrícolas y mallas antigranizo." });
      if (state.alerts.uv && d.uv_index_max[i] >= 11) list.push({ type: "uv", lvl: "warn", day: i,
        title: `UV extremo — ${when}`, text: `Índice UV ${fmtNum(d.uv_index_max[i])}. Usa protección y evita exposición al mediodía.` });
    }
    return list;
  }

  const LVL_TXT = { warn: "Precaución", serious: "Peligro", crit: "Crítico", good: "Normal" };
  const alertHtml = (a) => `<div class="alert ${a.lvl === "warn" ? "" : a.lvl}">
      <div class="a-head">${ALERT_TYPES[a.type].icon} ${esc(a.title)}<span class="a-lvl">${LVL_TXT[a.lvl]}</span></div>
      <small>${esc(a.text)}</small></div>`;

  function actionAlerts() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const list = computeAlerts(wx);
      const active = Object.entries(state.alerts).filter(([, v]) => v).map(([k]) => ALERT_TYPES[k].icon).join(" ");
      if (!list.length) {
        return `<b>🚨 Alertas — próximos 7 días</b>
          <div class="alert good"><div class="a-head">✅ Sin riesgos climáticos<span class="a-lvl">Normal</span></div>
          <small>No detecto heladas, lluvias intensas, vientos fuertes ni calor extremo para ${esc(state.profile.place)}.</small></div>
          <p>Vigilando: ${active}</p>
          <p>${isPremium() ? "🔔 Te avisaré automáticamente si algo cambia." : "🔒 Con <b>Pro</b> te aviso automáticamente por WhatsApp apenas aparezca un riesgo."}</p>${demoNote(wx)}`;
      }
      return `<b>🚨 ${list.length} alerta${list.length > 1 ? "s" : ""} para tu campo</b>
        ${list.map(alertHtml).join("")}
        <p>Vigilando: ${active}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [
      { label: "⚙️ Configurar alertas", action: "alerts_config" },
      isPremium() ? { label: "🧑‍🌾 ¿Qué hago?", action: "agro" } : { label: "⭐ Activar alertas automáticas", action: "plans" },
    ]});
  }

  function actionAlertsConfig() {
    const rows = Object.entries(ALERT_TYPES).map(([k, a]) => `
      <div class="toggle-row">
        <span style="font-size:20px">${a.icon}</span>
        <span class="t-txt"><b>${a.label}</b><small>${a.desc}</small></span>
        <label class="switch"><input type="checkbox" data-k="${k}" ${state.alerts[k] ? "checked" : ""}><span class="slider"></span></label>
      </div>`).join("");
    openSheet("Configurar alertas", `${rows}
      <p style="font-size:12.5px;color:var(--muted)">${isPremium() ? "Recibirás avisos automáticos por WhatsApp." : "En el plan Gratis puedes consultar alertas; los avisos automáticos son de Pro."}</p>
      <button class="btn-block" id="saveAlerts" type="button">Guardar</button>`, (body) => {
      $("#saveAlerts", body).addEventListener("click", () => {
        body.querySelectorAll("input[data-k]").forEach((i) => (state.alerts[i.dataset.k] = i.checked));
        save(); closeSheet();
        const on = Object.entries(state.alerts).filter(([, v]) => v).map(([k]) => ALERT_TYPES[k].label);
        userSay("✅ Guardé mis preferencias de alertas");
        bot(`Listo 👌 Vigilaré: <b>${on.join(", ") || "ninguna"}</b>.${state.alerts.resumen && isPremium() ? "<br>📰 Recibirás el resumen diario a las 6:00 a. m." : ""}`, {
          buttons: [{ label: "🚨 Revisar alertas ahora", action: "alerts" }] });
      });
    });
  }

  /* ---------- Registro de lluvias ---------- */
  function actionRainAdd(prefill = {}) {
    if (!requireProfile()) return;
    if (!isPremium() && state.rain.length >= FREE_RAIN_LIMIT) {
      bot(`Llegaste al límite de <b>${FREE_RAIN_LIMIT} registros</b> del plan Gratis 📒. Con <b>Pro</b> tienes registros ilimitados, varios lotes y exportación a Excel.`, {
        buttons: [{ label: "⭐ Ver planes", action: "plans" }] });
      return;
    }
    const lots = state.profile.lots?.length ? state.profile.lots : ["Lote principal"];
    openSheet("🌧️ Registrar lluvia", `
      <form class="form" id="rainForm">
        <label>¿Cuántos milímetros marcó tu pluviómetro?
          <input name="mm" type="number" step="0.1" min="0" max="500" inputmode="decimal" required placeholder="Ej: 12.5" value="${prefill.mm ?? ""}">
        </label>
        <div class="mm-presets">${[2, 5, 10, 15, 20, 30, 50].map((v) => `<button type="button" data-v="${v}">${v} mm</button>`).join("")}</div>
        <div class="row2">
          <label>Fecha<input name="date" type="date" required max="${isoDate()}" value="${prefill.date || isoDate()}"></label>
          <label>Lote / parcela
            <input name="lot" list="lotsList" value="${esc(lots[0])}" maxlength="40">
            <datalist id="lotsList">${lots.map((l) => `<option value="${esc(l)}">`).join("")}</datalist>
          </label>
        </div>
        <label>Nota (opcional)<input name="note" maxlength="80" placeholder="Ej: con granizo, aguacero corto…"></label>
        <button class="btn-block" type="submit">Guardar registro</button>
      </form>`, (body) => {
      const f = $("#rainForm", body);
      body.querySelectorAll(".mm-presets button").forEach((b) => b.addEventListener("click", () => { f.mm.value = b.dataset.v; }));
      setTimeout(() => f.mm.focus(), 250);
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        const mm = parseFloat(String(f.mm.value).replace(",", "."));
        if (!(mm >= 0)) return;
        closeSheet();
        saveRain({ mm, date: f.date.value, lot: f.lot.value.trim() || "Lote principal", note: f.note.value.trim() });
      });
    });
  }

  function saveRain({ mm, date, lot = "Lote principal", note = "" }, echo = true) {
    const rec = { id: uid(), date, mm: r1(mm), lot, note };
    state.rain.push(rec);
    if (!state.profile.lots) state.profile.lots = [];
    if (!state.profile.lots.includes(lot)) state.profile.lots.push(lot);
    save();
    if (echo) userSay(`🌧️ Llovió ${fmtNum(mm)} mm el ${fmtDate(date)} en ${lot}${note ? ` (${note})` : ""}`);
    const month = date.slice(0, 7);
    const monthTotal = state.rain.filter((r) => r.date.startsWith(month)).reduce((a, r) => a + r.mm, 0);
    const litres = mm * 10000; // 1 mm = 10 000 L por hectárea
    let comment;
    if (mm >= 40) comment = "Fue un aguacero fuerte ⛈️. Revisa encharcamientos y erosión; espera a que el suelo drene antes de entrar con maquinaria.";
    else if (mm >= 15) comment = "Muy buena lluvia 💚. El suelo debería tener humedad suficiente para varios días: puedes suspender el riego.";
    else if (mm >= 5) comment = "Lluvia moderada. Ayuda, pero con la evapotranspiración actual quizá necesites riego complementario pronto.";
    else comment = "Lluvia ligera: moja la superficie pero casi no llega a las raíces.";
    bot(`✅ <b>Registro guardado</b>
      <div class="card"><div class="kv">
        <span>Fecha</span><span>${fmtDate(date)}</span>
        <span>Lote</span><span>${esc(lot)}</span>
        <span>Lluvia</span><span><b>${fmtNum(mm)} mm</b> ≈ ${fmtNum(litres, 0)} L/ha</span>
        <span>Total del mes</span><span><b>${fmtNum(monthTotal)} mm</b></span>
      </div></div>
      <p>🤖 ${comment}</p>`, { wide: true, buttons: [
        { label: "📊 Ver historial", action: "rain_history" },
        { label: "➕ Registrar otra", action: "rain_add" },
      ]});
  }

  function actionRainHistory() {
    if (!requireProfile()) return;
    if (!state.rain.length) {
      bot("Aún no tienes lluvias registradas 📒. Cada vez que llueva, escríbeme <i>\"llovió 12 mm\"</i> o usa el botón de abajo y yo llevo tu cuaderno de campo.", {
        buttons: [{ label: "🌧️ Registrar lluvia", action: "rain_add" }] });
      return;
    }
    bot(async () => {
      const recs = [...state.rain].sort((a, b) => b.date.localeCompare(a.date));
      const now = new Date();
      const thisMonth = isoDate(now).slice(0, 7);
      const year = String(now.getFullYear());
      const mTotal = recs.filter((r) => r.date.startsWith(thisMonth)).reduce((a, r) => a + r.mm, 0);
      const yTotal = recs.filter((r) => r.date.startsWith(year)).reduce((a, r) => a + r.mm, 0);
      // Últimos 6 meses
      const months = [], vals = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        months.push(MONTHS[d.getMonth()]);
        vals.push(r1(recs.filter((r) => r.date.startsWith(key)).reduce((a, r) => a + r.mm, 0)));
      }
      // Comparación con el modelo (últimos 30 días)
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
      const cut = isoDate(cutoff);
      const mine30 = recs.filter((r) => r.date >= cut).reduce((a, r) => a + r.mm, 0);
      const model30 = wx.past.precipitation_sum.slice(-30).reduce((a, b) => a + (b || 0), 0);
      const diff = mine30 - model30;
      const byLot = {};
      recs.forEach((r) => (byLot[r.lot] = (byLot[r.lot] || 0) + r.mm));
      const lotsHtml = Object.keys(byLot).length > 1
        ? `<div class="card"><div class="card-title">Por lote (histórico)</div><div class="rain-list">${Object.entries(byLot).map(([l, v]) => `<div><span>${esc(l)}</span><span class="mm">${fmtNum(v)} mm</span></div>`).join("")}</div></div>` : "";
      return `<b>📊 Tu cuaderno de lluvias</b>
        <div class="stat-row">
          <div class="stat"><b>${fmtNum(mTotal)}</b><small>mm este mes</small></div>
          <div class="stat"><b>${fmtNum(yTotal)}</b><small>mm en ${year}</small></div>
          <div class="stat"><b>${recs.length}</b><small>registros</small></div>
        </div>
        <div class="card"><div class="card-title">Lluvia registrada por mes (mm)</div>${barChart(vals, months, { highlightLast: true, title: "Lluvia por mes" })}</div>
        <div class="card"><div class="card-title">Últimos registros</div><div class="rain-list">
          ${recs.slice(0, 6).map((r) => `<div><span>${fmtDate(r.date)} · ${esc(r.lot)}${r.note ? ` · <i>${esc(r.note)}</i>` : ""}</span><span class="mm">${fmtNum(r.mm)} mm</span></div>`).join("")}
        </div></div>
        ${lotsHtml}
        <p>🛰️ <b>Tu pluviómetro vs. modelo satelital (30 días):</b> tú registraste <b>${fmtNum(mine30)} mm</b> y el modelo estima <b>${fmtNum(model30)} mm</b> para tu zona.
        ${Math.abs(diff) < 5 ? "¡Coinciden muy bien! 👍" : diff > 0 ? "Tu campo recibió más lluvia que el promedio de la zona (lluvias locales)." : "Quizá faltan registros, o tu campo recibió menos lluvia que la zona."}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [
      { label: "➕ Registrar lluvia", action: "rain_add" },
      { label: "📤 Exportar a Excel (CSV)", action: "export_csv" },
      { label: "↩️ Borrar último registro", action: "rain_undo" },
    ]});
  }

  function actionRainUndo() {
    if (!state.rain.length) return bot("No hay registros para borrar.");
    const last = state.rain.pop(); save();
    bot(`🗑️ Borré el registro del <b>${fmtDate(last.date)}</b> (${fmtNum(last.mm)} mm, ${esc(last.lot)}).`, {
      buttons: [{ label: "📊 Ver historial", action: "rain_history" }] });
  }

  function actionExportCsv() {
    if (!state.rain.length) return bot("Aún no tienes lluvias registradas para exportar.");
    if (!isPremium()) {
      return bot("📤 La exportación a Excel es una función <b>Pro</b>. Ideal para presentar a tu cooperativa, banco o aseguradora.", {
        buttons: [{ label: "⭐ Ver planes", action: "plans" }] });
    }
    const lines = [["fecha", "lote", "mm", "nota"], ...[...state.rain].sort((a, b) => a.date.localeCompare(b.date)).map((r) => [r.date, r.lot, r.mm, r.note])];
    const csv = "﻿" + lines.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `lluvias_${isoDate()}.csv` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    bot(`📄 <b>lluvias_${isoDate()}.csv</b><br><small style="color:var(--muted)">${state.rain.length} registros · listo para Excel</small>`);
  }

  /* ---------- Imágenes satelitales ---------- */
  function tileXY(lat, lon, z) {
    const n = 2 ** z;
    const x = ((lon + 180) / 360) * n;
    const rad = (lat * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    return { x, y };
  }

  const SAT_LAYERS = {
    rgb:  { label: "🌍 Color real", z: 16, premium: false,
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      badge: () => "Esri World Imagery · alta resolución" },
    modis: { label: "☁️ Nubes hoy", z: 8, premium: false,
      url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${gibsDate()}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`,
      badge: () => `NASA MODIS Terra · ${fmtDate(gibsDate())}` },
    ndvi: { label: "🌱 NDVI", z: 16, premium: true,
      url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
      badge: () => "Índice de vegetación (estimado)" },
  };
  function gibsDate() { const d = new Date(); d.setDate(d.getDate() - 1); return isoDate(d); }

  function metersPerPx(lat, z) { return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z; }

  function renderSat(container, layerKey) {
    const L = SAT_LAYERS[layerKey];
    const { lat, lon } = state.profile;
    const { x, y } = tileXY(lat, lon, L.z);
    const tx = Math.floor(x), ty = Math.floor(y);
    const view = $(".sat-view", container);
    const W = view.clientWidth || 280, H = view.clientHeight || 210;
    let imgs = "";
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      imgs += `<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${L.url(L.z, tx + i, ty + j)}" onerror="this.style.visibility='hidden'">`;
    }
    const px = 256 + (x - tx) * 256, py = 256 + (y - ty) * 256;
    const pinSize = Math.max(26, Math.min(110, (Math.sqrt((state.profile.hectares || 5) * 10000)) / metersPerPx(lat, L.z)));
    const scaleM = Math.round(metersPerPx(lat, L.z) * W);
    view.innerHTML = `<div class="sat-inner" style="left:${W / 2 - px}px;top:${H / 2 - py}px">${imgs}</div>
      ${layerKey === "ndvi" ? `<canvas class="sat-overlay" width="${W}" height="${H}"></canvas>` : ""}
      ${layerKey !== "modis" ? `<div class="sat-pin" style="width:${pinSize}px;height:${pinSize}px"></div>` : `<div class="sat-pin" style="width:14px;height:14px;border-radius:50%;border-style:solid"></div>`}
      <span class="sat-badge">${L.badge()}</span><span class="sat-scale">↔ ${scaleM >= 1000 ? fmtNum(scaleM / 1000) + " km" : scaleM + " m"}</span>`;
    $(".ndvi-legend", container).style.display = layerKey === "ndvi" ? "flex" : "none";
    if (layerKey === "ndvi") paintNdvi($("canvas", view), lat, lon);
  }

  /** NDVI simulado (ruido de valor suavizado). En producción: Sentinel-2 B8/B4. */
  function paintNdvi(cv, lat, lon) {
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height, cell = 6;
    let seed = Math.round(Math.abs(lat * 1000 + lon * 1000)) + Math.floor(Date.now() / 6048e5);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const gw = Math.ceil(W / 40) + 2, gh = Math.ceil(H / 40) + 2;
    const grid = Array.from({ length: gh }, () => Array.from({ length: gw }, () => rnd()));
    const smooth = (t) => t * t * (3 - 2 * t);
    const noise = (px, py) => {
      const gx = px / 40, gy = py / 40, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = smooth(gx - x0), fy = smooth(gy - y0);
      const a = grid[y0][x0], b = grid[y0][x0 + 1], c = grid[y0 + 1][x0], d = grid[y0 + 1][x0 + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const ramp = [[165, 0, 38], [244, 109, 67], [254, 224, 139], [166, 217, 106], [26, 152, 80], [0, 104, 55]];
    const color = (v) => {
      const t = Math.max(0, Math.min(1, v)) * (ramp.length - 1), i = Math.min(ramp.length - 2, Math.floor(t)), f = t - i;
      return ramp[i].map((c, k) => Math.round(c + (ramp[i + 1][k] - c) * f));
    };
    let sum = 0, n = 0;
    for (let py = 0; py < H; py += cell) for (let px = 0; px < W; px += cell) {
      const v = 0.25 + noise(px, py) * 0.7;
      sum += v; n++;
      const [r, g, b] = color(v);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(px, py, cell, cell);
    }
    cv.dataset.mean = (sum / n).toFixed(2);
  }

  function actionSatellite(layer = "rgb") {
    if (!requireProfile()) return;
    bot(`<b>🛰️ Imágenes satelitales de tu campo</b>
      <div class="card sat-card">
        <div class="sat-tabs">${Object.entries(SAT_LAYERS).map(([k, l]) => `<button type="button" data-l="${k}" class="${k === layer ? "on" : ""}">${l.label}${l.premium && !isPremium() ? " 🔒" : ""}</button>`).join("")}</div>
        <div class="sat-view"></div>
        <div class="ndvi-legend" style="display:none"><span>Suelo/estrés</span><span class="grad"></span><span>Vigoroso</span></div>
      </div>
      <p class="sat-caption"></p>`, {
      wide: true,
      after: (bubble) => {
        const card = $(".sat-card", bubble), cap = $(".sat-caption", bubble);
        const setLayer = (k) => {
          if (SAT_LAYERS[k].premium && !isPremium()) {
            userSay("🌱 Ver NDVI");
            bot("🔒 El <b>NDVI</b> (salud del cultivo por satélite) es una función <b>Pro</b>. Detecta zonas con estrés hídrico, plagas o falta de nutrientes antes de que se vean a simple vista.", {
              buttons: [{ label: "🎁 Probar Pro 7 días gratis", action: "trial" }, { label: "⭐ Ver planes", action: "plans" }] });
            return;
          }
          card.querySelectorAll(".sat-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.l === k));
          renderSat(card, k);
          cap.innerHTML = satCaption(k, card);
        };
        card.querySelectorAll(".sat-tabs button").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.l)));
        requestAnimationFrame(() => setLayer(SAT_LAYERS[layer].premium && !isPremium() ? "rgb" : layer));
      },
      buttons: [{ label: "🌱 Analizar salud del cultivo", action: "ndvi" }, { label: "🌤️ Clima ahora", action: "now" }],
    });
  }

  function satCaption(k, card) {
    const p = state.profile;
    if (k === "rgb") return `📍 ${esc(p.place)} · el recuadro marca aprox. tus <b>${fmtNum(p.hectares || 5)} ha</b>. Imagen de alta resolución (puede tener meses de antigüedad).`;
    if (k === "modis") return `☁️ Imagen del satélite <b>MODIS (NASA)</b> de ayer: muestra nubosidad y sistemas de lluvia sobre tu región (• = tu campo).`;
    const mean = Number($("canvas", card)?.dataset.mean || 0.6);
    const status = mean > 0.6 ? "vigoroso 💚" : mean > 0.45 ? "normal 🟡" : "con estrés 🟠";
    return `🌱 <b>NDVI promedio: ${mean.toFixed(2)}</b> — cultivo ${status}. Las zonas naranjas/rojas indican menor vigor: revísalas en campo (riego, plagas o nutrición). <small style="color:var(--muted)">Demo: valores estimados; en producción se calcula con Sentinel-2 cada 5 días.</small>`;
  }

  function actionNdvi() {
    if (!isPremium()) return actionSatellite("ndvi");
    actionSatellite("ndvi");
  }

  /* ---------- Consejos agronómicos ---------- */
  function actionAgro() {
    if (!requireProfile()) return;
    const crop = CROPS[state.profile.crop] || CROPS.otro;
    bot(`${crop.icon} Asesoría para tu <b>${crop.label}</b>. ¿Sobre qué quieres que analice el clima?`, {
      buttons: [
        { label: "💨 ¿Puedo fumigar?", action: "agro_spray" },
        { label: "💧 ¿Cuánto debo regar?", action: "agro_irrigation" },
        { label: "🌱 ¿Es buen momento para sembrar?", action: "agro_sow" },
      ],
      list: { button: "Más temas", title: "Consejos agronómicos", sections: [{ title: "Análisis", rows: [
        { icon: "🍄", title: "Riesgo de hongos", desc: "Según humedad y temperatura", action: "agro_fungus" },
        { icon: "🥶", title: "Riesgo de heladas", desc: "Próximas noches", action: "agro_frost" },
        { icon: "📈", title: "Grados día (desarrollo)", desc: "Acumulado de los últimos 30 días", action: "agro_gdd" },
      ]}]},
    });
  }

  function actionSpray() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const h = wx.hourly, windows = [];
      let cur = null;
      for (let i = 0; i < 48; i++) {
        const hr = Number(h.time[i].slice(11, 13));
        const ok = hr >= 6 && hr <= 18 && h.wind_speed_10m[i] >= 3 && h.wind_speed_10m[i] < 15 &&
          (h.precipitation_probability[i] ?? 0) < 30 && h.temperature_2m[i] >= 10 && h.temperature_2m[i] <= 28 && h.relative_humidity_2m[i] >= 45;
        const rainSoon = h.precipitation_probability.slice(i, i + 4).some((p) => p >= 50);
        if (ok && !rainSoon) { if (!cur) cur = { s: i, e: i }; else cur.e = i; }
        else if (cur) { windows.push(cur); cur = null; }
      }
      if (cur) windows.push(cur);
      const good = windows.filter((w) => w.e - w.s >= 1).slice(0, 3);
      const fmt = (i) => {
        const off = Math.round((Date.parse(h.time[i].slice(0, 10)) - Date.parse(h.time[0].slice(0, 10))) / 864e5);
        return `${dayName(h.time[i].slice(0, 10), off)} ${h.time[i].slice(11, 16)}`;
      };
      const nowOk = windows[0]?.s === 0;
      return `<b>💨 Ventanas de fumigación (48 h)</b>
        ${nowOk ? `<div class="alert good"><div class="a-head">✅ Puedes aplicar ahora<span class="a-lvl">Apto</span></div><small>Viento ${Math.round(h.wind_speed_10m[0])} km/h · Humedad ${h.relative_humidity_2m[0]}% · ${Math.round(h.temperature_2m[0])} °C</small></div>`
          : `<div class="alert serious"><div class="a-head">⛔ Ahora no es recomendable<span class="a-lvl">No apto</span></div><small>Viento ${Math.round(h.wind_speed_10m[0])} km/h · Lluvia ${h.precipitation_probability[0] ?? 0}% · ${Math.round(h.temperature_2m[0])} °C · HR ${h.relative_humidity_2m[0]}%</small></div>`}
        ${good.length ? `<div class="card"><div class="card-title">Mejores horarios</div><div class="rain-list">${good.map((w) => `<div><span>🟢 ${fmt(w.s)} → ${h.time[w.e].slice(11, 16)}</span><span>${w.e - w.s + 1} h</span></div>`).join("")}</div></div>`
          : `<p>No encontré ventanas seguras en las próximas 48 h 😕.</p>`}
        <p><small>Criterios: viento 3–15 km/h, sin lluvia en 4 h, 10–28 °C y humedad ≥ 45 % para reducir deriva y evaporación.</small></p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "💧 ¿Cuánto regar?", action: "agro_irrigation" }, { label: "📋 Menú", action: "menu" }] });
  }

  function actionIrrigation() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const crop = CROPS[state.profile.crop] || CROPS.otro;
      const d = wx.daily;
      const et0 = d.et0_fao_evapotranspiration.reduce((a, b) => a + (b || 0), 0);
      const etc = et0 * crop.kc;
      const rainF = d.precipitation_sum.reduce((a, b) => a + b, 0) * 0.8; // lluvia efectiva ≈ 80 %
      const recent = state.rain.filter((r) => r.date >= isoDate(new Date(Date.now() - 3 * 864e5))).reduce((a, r) => a + r.mm, 0);
      const deficit = Math.max(0, etc - rainF - recent * 0.5);
      const ha = state.profile.hectares || 1;
      const m3 = deficit * 10 * ha;
      const soil = wx.hourly.soil_moisture_0_to_7cm?.[0];
      return `<b>💧 Balance hídrico — próximos 7 días</b>
        <div class="card"><div class="kv">
          <span>Cultivo</span><span>${crop.icon} ${crop.label} (Kc ${crop.kc})</span>
          <span>Evapotranspiración</span><span>${fmtNum(etc)} mm</span>
          <span>Lluvia efectiva prevista</span><span>${fmtNum(rainF)} mm</span>
          ${recent ? `<span>Lluvia registrada (3 días)</span><span>${fmtNum(recent)} mm</span>` : ""}
          ${soil != null ? `<span>Humedad del suelo</span><span>${Math.round(soil * 100)} % vol.</span>` : ""}
          <span><b>Déficit</b></span><span><b>${fmtNum(deficit)} mm</b></span>
        </div></div>
        <p>🤖 ${deficit < 3 ? "No necesitas regar esta semana: la lluvia cubre la demanda del cultivo. 🎉"
          : `Recomiendo aplicar <b>${fmtNum(deficit)} mm</b> en la semana ≈ <b>${fmtNum(m3, 0)} m³</b> para tus ${fmtNum(ha)} ha. Divide en 2–3 riegos, preferiblemente temprano en la mañana.`}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "🌧️ Registrar lluvia", action: "rain_add" }, { label: "🧑‍🌾 Otros consejos", action: "agro" }] });
  }

  function actionSow() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const crop = CROPS[state.profile.crop] || CROPS.otro;
      const d = wx.daily;
      const soil = wx.hourly.soil_moisture_0_to_7cm?.[0] ?? 0.25;
      const minT = Math.min(...d.temperature_2m_min);
      const rain3 = d.precipitation_sum.slice(0, 3).reduce((a, b) => a + b, 0);
      const heavy = d.precipitation_sum.slice(0, 3).some((v) => v >= 30);
      const checks = [
        [soil >= 0.2, `Humedad del suelo ${Math.round(soil * 100)} % ${soil >= 0.2 ? "adecuada" : "baja"}`],
        [minT > crop.tBase - 2, `Mínimas de ${Math.round(minT)} °C (base del ${crop.label.toLowerCase()}: ${crop.tBase} °C)`],
        [!heavy, heavy ? "Lluvia fuerte en 3 días: riesgo de arrastre de semilla" : "Sin aguaceros fuertes los próximos 3 días"],
        [rain3 > 2 || soil >= 0.25, rain3 > 2 ? `Lluvia ligera prevista (${fmtNum(rain3)} mm) ayudará a la germinación` : "Sin lluvia: siembra con riego de asiento"],
      ];
      const score = checks.filter((c) => c[0]).length;
      return `<b>🌱 Condiciones de siembra — ${crop.icon} ${crop.label}</b>
        <div class="card">${checks.map(([ok, t]) => `<div style="padding:3px 0">${ok ? "✅" : "⚠️"} ${t}</div>`).join("")}</div>
        <p>🤖 Puntaje <b>${score}/4</b>: ${score >= 4 ? "¡Excelente momento para sembrar!" : score === 3 ? "Buen momento, con precaución." : "Recomiendo esperar unos días."}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "📅 Ver pronóstico", action: "week" }, { label: "🧑‍🌾 Otros consejos", action: "agro" }] });
  }

  function actionFungus() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const h = wx.hourly;
      let risky = 0;
      for (let i = 0; i < 48; i++) if (h.relative_humidity_2m[i] >= 90 && h.temperature_2m[i] >= 10 && h.temperature_2m[i] <= 25) risky++;
      const lvl = risky >= 18 ? ["crit", "Alto"] : risky >= 8 ? ["serious", "Moderado"] : ["good", "Bajo"];
      const crop = CROPS[state.profile.crop] || CROPS.otro;
      const disease = { papa: "tizón tardío (rancha)", cafe: "roya del café", maiz: "tizón foliar", arroz: "piricularia", trigo: "roya amarilla", soya: "roya asiática", hortalizas: "mildiu", frutales: "antracnosis" }[state.profile.crop] || "enfermedades fúngicas";
      return `<b>🍄 Riesgo de hongos — 48 h</b>
        <div class="alert ${lvl[0]}"><div class="a-head">${crop.icon} ${disease}<span class="a-lvl">${lvl[1]}</span></div>
        <small>${risky} horas con humedad ≥ 90 % y temperatura entre 10–25 °C (condición favorable a esporulación).</small></div>
        <p>🤖 ${lvl[1] === "Bajo" ? "Condiciones poco favorables para hongos. Mantén el monitoreo normal." : "Considera una aplicación preventiva en la próxima ventana de fumigación y revisa el envés de las hojas."}</p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "💨 ¿Cuándo fumigar?", action: "agro_spray" }] });
  }

  function actionFrost() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const d = wx.daily;
      const rows = d.time.map((t, i) => {
        const v = d.temperature_2m_min[i];
        const s = v <= 0 ? "🔴 Alto" : v <= 3 ? "🟠 Medio" : "🟢 Bajo";
        return `<div><span>${dayName(t, i)} ${fmtDate(t)}</span><span>${Math.round(v)} °C · ${s}</span></div>`;
      }).join("");
      return `<b>🥶 Riesgo de heladas — 7 noches</b><div class="card"><div class="rain-list">${rows}</div></div>
        <p><small>Las heladas suelen ser 2–3 °C más intensas a nivel del cultivo que a 2 m de altura, especialmente en noches despejadas y sin viento.</small></p>${demoNote(wx)}`;
    }, { wide: true, buttons: [{ label: "⚙️ Activar alerta de heladas", action: "alerts_config" }] });
  }

  function actionGdd() {
    if (!requireProfile()) return;
    bot(async () => {
      const wx = await getWeather(state.profile.lat, state.profile.lon);
      const crop = CROPS[state.profile.crop] || CROPS.otro;
      const p = wx.past;
      const gdd = p.time.map((_, i) => Math.max(0, (p.temperature_2m_max[i] + p.temperature_2m_min[i]) / 2 - crop.tBase));
      const total = gdd.reduce((a, b) => a + b, 0);
      const labels = p.time.map((t) => t.slice(8, 10));
      return `<b>📈 Grados día — ${crop.icon} ${crop.label}</b> (base ${crop.tBase} °C)
        <div class="stat-row"><div class="stat"><b>${fmtNum(total, 0)}</b><small>GDD 30 días</small></div><div class="stat"><b>${fmtNum(total / gdd.length)}</b><small>GDD/día</small></div><div class="stat"><b>${crop.tBase}°</b><small>T. base</small></div></div>
        <div class="card"><div class="card-title">Grados día diarios (°C·día)</div>${barChart(gdd.map(r1), labels, { unit: "°C·d", title: "Grados día" })}</div>
        <p>🤖 Los grados día miden el calor útil acumulado: sirven para predecir floración, cosecha y ciclos de plagas.</p>${demoNote(wx)}`;
    }, { wide: true });
  }

  /* ---------- Perfil ---------- */
  function actionProfile() {
    if (!requireProfile()) return;
    const p = state.profile, crop = CROPS[p.crop] || CROPS.otro;
    bot(`<b>👤 Mi perfil</b>
      <div class="loc-map"><img alt="Mapa satelital" src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${p.lon - 0.01},${p.lat - 0.006},${p.lon + 0.01},${p.lat + 0.006}&bboxSR=4326&size=400,260&format=jpg&f=image" onerror="this.remove()"><span class="pin">📍</span></div>
      <div class="kv">
        <span>Nombre</span><span>${esc(p.name)}</span>
        <span>Ubicación</span><span>${esc(p.place)}</span>
        <span>Coordenadas</span><span>${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</span>
        <span>Cultivo</span><span>${crop.icon} ${crop.label}</span>
        <span>Superficie</span><span>${fmtNum(p.hectares || 0)} ha</span>
        <span>Lotes</span><span>${esc((p.lots || ["Lote principal"]).join(", "))}</span>
        <span>Plan</span><span>${isPremium() ? `<span class="pill">${PLANS[state.plan].name}</span>${state.trialEnds ? ` <small>prueba hasta ${new Date(state.trialEnds).toLocaleDateString("es")}</small>` : ""}` : `<span class="pill free">Gratis</span>`}</span>
        <span>Lluvias</span><span>${state.rain.length} registros</span>
      </div>`, { wide: true, buttons: [
        { label: "📍 Cambiar ubicación", action: "change_location" },
        { label: "🌱 Cambiar cultivo", action: "change_crop" },
        { label: "⭐ Planes", action: "plans" },
      ]});
  }

  /* ---------- Planes / monetización ---------- */
  function actionPlans() {
    const cur = isPremium() ? state.plan : "free";
    bot(`<b>⭐ Planes AgroClima IA</b>
      <div class="plans">
        <div class="plan"><div class="p-head"><span class="p-name">Gratis</span><span class="p-price">$0</span></div>
          <ul><li>Clima actual y 24 horas</li><li>Pronóstico de 3 días</li><li>Consulta de alertas</li><li>Hasta ${FREE_RAIN_LIMIT} registros de lluvia</li><li>Imagen satelital color real</li></ul></div>
        <div class="plan best"><span class="p-tag">MÁS ELEGIDO</span><div class="p-head"><span class="p-name">Pro Agricultor</span><span class="p-price">$4.99<small>/mes</small></span></div>
          <ul><li>Pronóstico de 7 días</li><li>🔔 Alertas automáticas por WhatsApp</li><li>📰 Resumen diario 6:00 a. m.</li><li>🌱 NDVI: salud del cultivo por satélite</li><li>Lluvias ilimitadas + exportar a Excel</li></ul></div>
        <div class="plan"><div class="p-head"><span class="p-name">Agro Empresa</span><span class="p-price">$19.99<small>/mes</small></span></div>
          <ul><li>Todo Pro, hasta 20 lotes</li><li>5 usuarios (técnicos / encargados)</li><li>Reporte PDF mensual para bancos y seguros</li><li>Soporte agronómico prioritario</li></ul></div>
      </div>
      <p>Tu plan actual: <b>${PLANS[cur].name}</b></p>`, { wide: true, buttons: cur === "free" ? [
        { label: "🎁 Probar Pro 7 días gratis", action: "trial" },
        { label: "💳 Suscribirme a Pro", action: "buy", data: "pro" },
        { label: "🏢 Suscribirme a Empresa", action: "buy", data: "empresa" },
      ] : [{ label: "📋 Menú", action: "menu" }] });
  }

  function actionTrial() {
    if (state.trialUsed || state.payments.length) {
      return bot("Ya usaste tu prueba gratuita 🙏. Puedes suscribirte cuando quieras.", { buttons: [{ label: "💳 Suscribirme a Pro", action: "buy", data: "pro" }] });
    }
    state.plan = "pro"; state.trialEnds = Date.now() + 7 * 864e5; state.trialUsed = true; save();
    bot(`🎉 <b>¡Prueba Pro activada!</b> Tienes 7 días con todas las funciones: pronóstico de 7 días, alertas automáticas, NDVI y exportación.<br><small style="color:var(--muted)">Sin tarjeta. Al terminar vuelves al plan Gratis automáticamente.</small>`, {
      buttons: [{ label: "🌱 Ver NDVI de mi campo", action: "ndvi" }, { label: "📅 Pronóstico 7 días", action: "week" }] });
    scheduleAutoAlert(15000);
  }

  function actionBuy(planKey = "pro") {
    const plan = PLANS[planKey];
    openSheet("Confirmar suscripción", `
      <div class="pay-summary">
        <div><span>${plan.name} · mensual</span><span>$${plan.price.toFixed(2)}</span></div>
        <div style="color:var(--muted);font-size:12.5px"><span>Cancela cuando quieras</span><span></span></div>
        <div class="total"><span>Total hoy</span><span>$${plan.price.toFixed(2)} USD</span></div>
      </div>
      <div class="pay-methods">
        <label><input type="radio" name="pm" value="Tarjeta" checked> 💳 Tarjeta de crédito / débito</label>
        <label><input type="radio" name="pm" value="Billetera móvil"> 📱 Billetera móvil</label>
        <label><input type="radio" name="pm" value="PayPal"> 🅿️ PayPal</label>
        <label><input type="radio" name="pm" value="Transferencia"> 🏦 Transferencia bancaria</label>
      </div>
      <p style="font-size:12px;color:var(--muted)">Simulación: no se realiza ningún cobro real.</p>
      <button class="btn-block" id="payBtn" type="button">Pagar $${plan.price.toFixed(2)}</button>`, (body) => {
      const btn = $("#payBtn", body);
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> Procesando…`;
        await sleep(1600);
        const method = body.querySelector("input[name=pm]:checked").value;
        const ref = "AC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
        state.plan = planKey; state.trialEnds = null;
        state.payments.push({ ref, plan: planKey, amount: plan.price, method, date: new Date().toISOString() });
        save(); closeSheet();
        userSay(`💳 Pagué el plan ${plan.name}`);
        const renew = new Date(); renew.setMonth(renew.getMonth() + 1);
        bot(`✅ <b>¡Pago confirmado! Bienvenido a ${plan.name}</b> 🎉
          <div class="card receipt">
            <div><span>Comprobante</span><span>${ref}</span></div>
            <div><span>Plan</span><span>${plan.name}</span></div>
            <div><span>Método</span><span>${method}</span></div>
            <div><span>Monto</span><span>$${plan.price.toFixed(2)}</span></div>
            <div><span>Renueva</span><span>${renew.toLocaleDateString("es")}</span></div>
          </div>
          Ya tienes activadas las alertas automáticas 🔔 y el resumen diario.`, { wide: true, buttons: [
            { label: "🌱 Ver NDVI", action: "ndvi" }, { label: "📋 Menú", action: "menu" }] });
        scheduleAutoAlert(15000);
      });
    });
  }

  /* ---------- Alertas push automáticas ---------- */
  let autoTimer = null;
  function scheduleAutoAlert(ms = 30000) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => sendAutoAlert(), ms);
  }

  async function sendAutoAlert(manual = false) {
    clearTimeout(autoTimer);
    if (!state.profile) return;
    if (!isPremium() && !manual) return;
    const wx = await getWeather(state.profile.lat, state.profile.lon);
    const list = computeAlerts(wx).sort((a, b) => a.day - b.day);
    const d = wx.daily;
    let title, text, html;
    if (list.length) {
      const a = list[0];
      title = `${ALERT_TYPES[a.type].icon} Alerta: ${a.title}`;
      text = a.text;
      html = `🔔 <b>ALERTA AUTOMÁTICA</b>${alertHtml(a)}${list.length > 1 ? `<p>Y ${list.length - 1} alerta(s) más esta semana.</p>` : ""}`;
    } else {
      const [desc, ic] = wmo(d.weather_code[0]);
      title = `📰 Resumen del día · ${state.profile.place.split(",")[0]}`;
      text = `${ic} ${desc}. ${Math.round(d.temperature_2m_min[0])}°/${Math.round(d.temperature_2m_max[0])}°, lluvia ${d.precipitation_probability_max[0] ?? 0}%.`;
      const hr = new Date().getHours();
      html = `📰 <b>${hr < 12 ? "Buenos días" : hr < 19 ? "Buenas tardes" : "Buenas noches"}, ${esc(firstName())}.</b> Resumen para hoy en ${esc(state.profile.place.split(",")[0])}:
        <div class="card"><div class="kv">
          <span>Cielo</span><span>${ic} ${desc}</span>
          <span>Temperatura</span><span>${Math.round(d.temperature_2m_min[0])}° / ${Math.round(d.temperature_2m_max[0])}°</span>
          <span>Lluvia</span><span>${d.precipitation_probability_max[0] ?? 0}% · ${fmtNum(d.precipitation_sum[0])} mm</span>
          <span>Viento máx.</span><span>${Math.round(d.wind_speed_10m_max[0])} km/h</span>
        </div></div>✅ Sin alertas activas. ¡Buen día de trabajo! 🌾`;
    }
    push(title, text, () => { chat.dataset.userScrolled = ""; scrollBottom(true); });
    bot(html, { wide: true, delay: 300, buttons: [{ label: "🧑‍🌾 ¿Qué me recomiendas?", action: "agro" }, { label: "📅 Ver pronóstico", action: "week" }] });
  }

  /* ---------------- Onboarding ---------------- */
  function startOnboarding() {
    awaiting = "name";
    bot(`¡Hola! 👋🌾 Soy <b>AgroClima IA</b>, tu asistente experto en clima para el campo.`, { delay: 700 });
    bot(`Puedo ayudarte con:<br>🌦️ Pronósticos hora a hora y de 7 días<br>🚨 Alertas de helada, lluvia intensa y viento<br>🌧️ Tu registro de lluvias (pluviómetro digital)<br>🛰️ Imágenes satelitales de tu parcela<br>🧑‍🌾 Consejos de fumigación, riego y siembra`);
    bot(`Para empezar, <b>¿cómo te llamas?</b>`);
  }

  function askLocation() {
    awaiting = "location";
    bot(`Mucho gusto, <b>${esc(draft.name)}</b> 🤝. ¿Dónde está tu campo? Comparte tu ubicación o escribe el nombre del pueblo o ciudad más cercana.`, {
      buttons: [{ label: "📍 Enviar mi ubicación actual", action: "geo", once: false, echo: false }],
    });
  }

  function askCrop() {
    awaiting = "crop";
    bot("¿Qué cultivas principalmente? 🌱", {
      list: { button: "Elegir cultivo", title: "Tu cultivo principal", sections: [{ title: "Cultivos", rows:
        Object.entries(CROPS).map(([k, c]) => ({ icon: c.icon, title: c.label, action: `crop:${k}` })) }] },
      buttons: [{ label: "🌽 Maíz", action: "crop:maiz" }, { label: "🥔 Papa", action: "crop:papa" }, { label: "☕ Café", action: "crop:cafe" }],
    });
  }

  function setLocation(loc) {
    if (awaiting === "location") {
      draft = { ...draft, ...loc };
      bot(`📍 Ubicado en <b>${esc(loc.place)}</b>`, {
        after: (b) => b.insertAdjacentHTML("afterbegin", `<div class="loc-map"><img alt="" src="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${loc.lon - 0.02},${loc.lat - 0.012},${loc.lon + 0.02},${loc.lat + 0.012}&bboxSR=4326&size=400,260&format=jpg&f=image" onerror="this.remove()"><span class="pin">📍</span></div>`),
      });
      askCrop();
    } else {
      Object.assign(state.profile, loc); save(); awaiting = null;
      bot(`✅ Ubicación actualizada a <b>${esc(loc.place)}</b>.`, { buttons: [{ label: "🌤️ Clima ahora", action: "now" }] });
    }
  }

  function requestGeo() {
    if (!("geolocation" in navigator)) return bot("Tu dispositivo no permite compartir ubicación. Escribe el nombre de tu localidad 🙂");
    userSay("📍 Ubicación compartida");
    showTyping();
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const place = await reverseGeocode(lat, lon);
      hideTyping();
      setLocation({ lat, lon, place });
    }, () => {
      hideTyping();
      bot("No pude obtener tu ubicación 😕 (permiso denegado). Escribe el nombre de tu pueblo o ciudad, por ejemplo: <i>Cajamarca</i>.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  }

  function finishOnboarding() {
    state.profile = { name: draft.name, place: draft.place, lat: draft.lat, lon: draft.lon, crop: draft.crop, hectares: draft.hectares, lots: ["Lote principal"] };
    save(); awaiting = null;
    const crop = CROPS[draft.crop];
    bot(`🎉 ¡Listo, ${esc(firstName())}! Tu perfil quedó guardado:<br>📍 ${esc(draft.place)}<br>${crop.icon} ${crop.label} · ${fmtNum(draft.hectares || 0)} ha<br><br>Este es el clima de tu campo ahora mismo 👇`);
    actionNow();
    showMenu();
  }

  /* ---------------- Router de acciones ---------------- */
  function handleAction(action, data) {
    if (action?.startsWith("crop:")) return chooseCrop(action.slice(5));
    switch (action) {
      case "menu": return showMenu();
      case "now": return requireProfile() && actionNow();
      case "hours": return actionHours();
      case "week": return actionWeek();
      case "alerts": return actionAlerts();
      case "alerts_config": return actionAlertsConfig();
      case "rain_add": return actionRainAdd();
      case "rain_history": return actionRainHistory();
      case "rain_undo": return actionRainUndo();
      case "export_csv": return actionExportCsv();
      case "satellite": return actionSatellite();
      case "ndvi": return actionNdvi();
      case "agro": return actionAgro();
      case "agro_spray": return actionSpray();
      case "agro_irrigation": return actionIrrigation();
      case "agro_sow": return actionSow();
      case "agro_fungus": return actionFungus();
      case "agro_frost": return actionFrost();
      case "agro_gdd": return actionGdd();
      case "profile": return actionProfile();
      case "plans": return actionPlans();
      case "trial": return actionTrial();
      case "buy": return actionBuy(data);
      case "geo": return requestGeo();
      case "change_location":
        awaiting = "location_change";
        return bot("Escribe el nombre de la nueva localidad o comparte tu ubicación 📍", { buttons: [{ label: "📍 Enviar mi ubicación actual", action: "geo", echo: false }] });
      case "change_crop": awaiting = "crop_change"; return askCropChange();
      case "skip_ha": draft.hectares = 0; return finishOnboarding();
      case "simulate_alert": return state.profile ? sendAutoAlert(true) : startOnboarding();
    }
  }

  function askCropChange() {
    bot("¿Cuál es tu nuevo cultivo principal?", {
      list: { button: "Elegir cultivo", title: "Tu cultivo principal", sections: [{ title: "Cultivos", rows:
        Object.entries(CROPS).map(([k, c]) => ({ icon: c.icon, title: c.label, action: `crop:${k}` })) }] } });
  }

  function chooseCrop(key) {
    if (!CROPS[key]) return;
    if (awaiting === "crop") {
      draft.crop = key;
      awaiting = "hectares";
      bot(`${CROPS[key].icon} ¡Buen cultivo! ¿Cuántas <b>hectáreas</b> tienes aproximadamente? (escribe un número)`, {
        buttons: [{ label: "Prefiero no decirlo", action: "skip_ha" }] });
    } else if (state.profile) {
      state.profile.crop = key; save(); awaiting = null;
      bot(`✅ Cultivo actualizado a ${CROPS[key].icon} <b>${CROPS[key].label}</b>. Ajusté el coeficiente de riego y los riesgos de enfermedades.`);
    }
  }

  /* ---------------- Procesamiento de texto libre (NLU simple) ---------------- */
  async function handleText(raw) {
    const text = raw.trim();
    if (!text) return;
    userSay(text);
    const t = norm(text);

    // Pasos pendientes de conversación
    if (awaiting === "name") {
      const name = text.replace(/^(me llamo|soy|mi nombre es)\s+/i, "").slice(0, 40);
      draft.name = name.charAt(0).toUpperCase() + name.slice(1);
      return askLocation();
    }
    if (awaiting === "location" || awaiting === "location_change") {
      showTyping();
      const loc = await geocode(text);
      hideTyping();
      if (!loc) return bot(`No encontré <b>${esc(text)}</b> 🤔. Prueba con el nombre de la ciudad o provincia más cercana (ej. <i>Huancayo</i>, <i>Santa Cruz</i>, <i>Cuenca</i>).`);
      return setLocation(loc);
    }
    if (awaiting === "crop" || awaiting === "crop_change") {
      const key = Object.keys(CROPS).find((k) => t.includes(k) || t.includes(norm(CROPS[k].label)));
      if (key) return chooseCrop(key);
      if (awaiting === "crop") { draft.crop = "otro"; awaiting = "crop"; return chooseCrop("otro"); }
    }
    if (awaiting === "hectares") {
      const n = parseFloat(t.replace(",", "."));
      if (isNaN(n) || n < 0) return bot("Escribe solo un número, por ejemplo <b>5</b> o <b>2.5</b> 🙂");
      draft.hectares = n;
      return finishOnboarding();
    }

    if (!state.profile) return startOnboarding();

    // Registro rápido de lluvia: "llovió 12 mm", "cayeron 8,5 milímetros ayer"
    const mmMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(mm|milimetros?|ml)\b/);
    if (mmMatch && /(llov|lluvi|cayo|cayeron|registr|anot|pluvio|agua)/.test(t)) {
      const mm = parseFloat(mmMatch[1].replace(",", "."));
      let date = isoDate();
      if (/antier|anteayer/.test(t)) date = isoDate(new Date(Date.now() - 2 * 864e5));
      else if (/ayer|anoche/.test(t)) date = isoDate(new Date(Date.now() - 864e5));
      const lotMatch = text.match(/(?:en (?:el |la )?)(lote|parcela|potrero|chacra)\s+([\wáéíóúñ-]+)/i);
      const lot = lotMatch ? `${lotMatch[1][0].toUpperCase() + lotMatch[1].slice(1)} ${lotMatch[2]}` : (state.profile.lots?.[0] || "Lote principal");
      if (!isPremium() && state.rain.length >= FREE_RAIN_LIMIT) return actionRainAdd();
      return saveRain({ mm, date, lot }, false);
    }

    // Consulta en otra ciudad: "clima en Arequipa"
    const cityMatch = text.match(/(?:clima|tiempo|pron[oó]stico|temperatura)\s+(?:en|para)\s+(.+)/i);
    if (cityMatch && !/^(el |la |los |las )?(semana|ma[nñ]ana|hoy|dia|d[ií]as|tarde|noche|horas|finde|fin de semana|mi campo|mi chacra|mi finca)/i.test(cityMatch[1].trim())) {
      const name = cityMatch[1].replace(/[?¿!.]/g, "").trim();
      showTyping();
      const loc = await geocode(name);
      hideTyping();
      if (loc) return actionNow(loc);
      return bot(`No encontré <b>${esc(name)}</b> 🤔`);
    }

    const has = (...w) => w.some((x) => t.includes(x));
    if (has("hola", "buenas", "buenos dias", "buen dia", "hey", "saludos")) return showMenu(`¡Hola ${esc(firstName())}! 👋 ${pick(["¿Cómo amaneció el campo hoy?", "¿Cómo va la cosecha?", "¿Qué necesitas saber del clima?"])}`);
    if (has("gracias", "excelente", "genial", "perfecto")) return bot(pick(["¡Con gusto! 🌾 Aquí estoy cuando me necesites.", "¡Para eso estoy! 💚 Que tengas buena jornada.", "¡A la orden! 🙌"]), { buttons: [{ label: "📋 Menú", action: "menu" }] });
    if (has("menu", "opciones", "ayuda", "que puedes", "que sabes")) return showMenu();
    if (has("plan", "precio", "premium", "suscrib", "pagar", "cuanto cuesta") || /\bpro\b/.test(t)) return actionPlans();
    if (has("prueba")) return actionTrial();
    if (has("ndvi", "salud del cultivo", "vigor", "vegetacion")) return actionNdvi();
    if (has("satel", "imagen", "foto", "mapa", "nube")) return actionSatellite(has("nube") ? "modis" : "rgb");
    if (has("historial", "cuanto llovio", "mis lluvias", "registros", "acumulad", "total")) return actionRainHistory();
    if (has("registrar", "anotar", "pluviometro")) return actionRainAdd();
    if (has("exportar", "excel", "csv")) return actionExportCsv();
    if (has("fumig", "aplicar", "pulveriz", "asperj")) return actionSpray();
    if (has("regar", "riego", "agua necesita", "evapotrans")) return actionIrrigation();
    if (has("sembrar", "siembra", "plantar")) return actionSow();
    if (has("hongo", "enfermedad", "rancha", "roya", "tizon", "mildiu", "plaga")) return actionFungus();
    if (has("helada", "escarcha", "frio")) return actionFrost();
    if (has("grados dia", "gdd")) return actionGdd();
    if (has("configurar alerta", "notificacion", "avisos")) return actionAlertsConfig();
    if (has("alerta", "riesgo", "peligro", "granizo", "tormenta", "viento")) return actionAlerts();
    if (has("semana", "7 dias", "siete dias", "pronostico", "proximos dias")) return actionWeek();
    if (has("manana", "llover", "llueve", "lluvia", "horas", "hoy", "tarde", "noche")) return actionHours();
    if (has("clima", "tiempo", "temperatura", "calor", "ahora")) return actionNow();
    if (has("perfil", "mis datos", "mi cuenta")) return actionProfile();
    if (has("ubicacion", "cambiar lugar", "mudar")) return handleAction("change_location");
    if (has("cultivo")) return handleAction("change_crop");

    bot(`Mmm, no estoy seguro de haber entendido 🤔. Puedo responder sobre <b>clima, lluvias, alertas, satélite y consejos para tu cultivo</b>. Prueba con: <i>"¿va a llover mañana?"</i>, <i>"llovió 20 mm ayer"</i> o <i>"¿puedo fumigar?"</i>`, { list: MAIN_MENU });
  }

  /* ---------------- Eventos de UI ---------------- */
  const form = $("#composer"), input = $("#msgInput");
  input.addEventListener("input", () => form.classList.toggle("has-text", input.value.trim().length > 0));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    if (!v.trim()) {
      bot("🎙️ Las notas de voz estarán disponibles pronto. Por ahora escríbeme tu consulta 🙂");
      return;
    }
    input.value = "";
    form.classList.remove("has-text");
    chat.dataset.userScrolled = "";
    handleText(v);
  });

  $("#btnAttach").addEventListener("click", () => {
    openList({ title: "Enviar", sections: [{ title: "Adjuntar", rows: [
      { icon: "📍", title: "Ubicación", desc: "Actualiza la ubicación de tu campo", action: "change_location" },
      { icon: "🌧️", title: "Registro de lluvia", desc: "Pluviómetro digital", action: "rain_add" },
      { icon: "🛰️", title: "Imagen satelital", desc: "Ver mi parcela", action: "satellite" },
    ]}]});
  });
  $("#btnCamera").addEventListener("click", () => {
    if (!state.profile) return;
    awaiting = "location_change";
    requestGeo();
  });
  $("#btnEmoji").addEventListener("click", () => {
    const sug = ["¿Va a llover mañana?", "Llovió 15 mm ayer", "¿Puedo fumigar hoy?", "¿Cuánto debo regar?", "Pronóstico de la semana", "¿Hay riesgo de helada?", "Ver imagen satelital", "Clima en Lima"];
    openSheet("Preguntas frecuentes", `<div class="suggest-grid">${sug.map((s) => `<button type="button">${s}</button>`).join("")}</div>`, (body) => {
      body.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { closeSheet(); handleText(b.textContent); }));
    });
  });

  // Menú desplegable de la cabecera
  const dd = $("#dropdown"), btnMenu = $("#btnMenu");
  function closeDropdown() { dd.classList.remove("open"); btnMenu.setAttribute("aria-expanded", "false"); }
  btnMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    dd.classList.toggle("open");
    btnMenu.setAttribute("aria-expanded", dd.classList.contains("open"));
  });
  document.addEventListener("click", closeDropdown);
  dd.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    const a = b.dataset.action;
    closeDropdown();
    if (a === "toggle_theme") return toggleTheme();
    if (a === "reset") return resetAll(true);
    if (!state.profile && a !== "simulate_alert") return;
    handleAction(a);
  }));

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem(STORE_KEY + ".theme", root.dataset.theme); } catch (_) { /* ignorar */ }
  }
  try { const th = localStorage.getItem(STORE_KEY + ".theme"); if (th) document.documentElement.dataset.theme = th; } catch (_) { /* ignorar */ }

  function resetAll(confirmFirst) {
    if (confirmFirst && !confirm("¿Borrar tu perfil, registros de lluvia y plan? Esta acción no se puede deshacer.")) return;
    try { localStorage.removeItem(STORE_KEY); } catch (_) { /* ignorar */ }
    location.reload();
  }
  $("#btnResetDemo").addEventListener("click", () => resetAll(true));
  $("#btnFocusChat").addEventListener("click", () => { $("#phone").scrollIntoView({ behavior: "smooth", block: "center" }); input.focus(); });

  // Reloj de la barra de estado
  const tick = () => { $("#sbTime").textContent = nowTime(); };
  tick(); setInterval(tick, 20000);

  /* ---------------- Inicio ---------------- */
  setStatus("en línea");
  if (state.profile) {
    const h = new Date().getHours();
    const greet = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
    bot(`${greet}, <b>${esc(firstName())}</b> 👋🌾 Qué bueno verte de nuevo. Estoy vigilando el clima de <b>${esc(state.profile.place.split(",")[0])}</b>.`, { delay: 700 });
    showMenu();
    if (isPremium()) scheduleAutoAlert(25000);
  } else {
    startOnboarding();
  }
})();
