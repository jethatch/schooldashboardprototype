/* School Travel Explorer (draft). Public data only; see About. All statistics are computed in the browser from
   block-level values and weights, the same way the report does; survey ranges for income groups come from the
   report's 200 reruns (data/summary.json) and exist for the study area and districts only. */
"use strict";

const $ = (id) => document.getElementById(id);
const D = {};                       // loaded data
const M = {};                       // measures cache by band
const S = { area: "Study area", sel: null, drawn: null, tract: null };
const GROUPS = ["All", "Hispanic", "White", "Black", "Asian", "Other", "Below 100%", "Below 185%", "Above 400%"];
const GLABEL = { All: "All", Hispanic: "Hispanic", White: "White", Black: "Black", Asian: "Asian", Other: "Other / multiracial",
  "Below 100%": "Below 100% poverty", "Below 185%": "Below 185% poverty", "Above 400%": "Above 400% poverty" };
const INCOME = new Set(["Below 100%", "Below 185%", "Above 400%"]);
const SETLABEL = { regular: "Regular district school", charter: "Charter", magnet: "Magnet", votech: "Vo-tech",
  program: "Choice program", anychoice: "Any choice option" };
const REPGRADE = { Elementary: 3, Middle: 7, High: 10 };
const TYPECOLOR = { Regular: "#9a9890", Charter: "#2a78d6", Magnet: "#eb6834", "Vo-Tech": "#1baf7a" };
const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const DIV = ["#1c5cab", "#6da7ec", "#e4e3df", "#f0a09f", "#c93a3a"];
const NOPEOPLE = "#bdbcb6";

const fmt1 = (v) => (v == null || isNaN(v) ? "–" : v.toFixed(1).replace("-", "−"));
const pct = (v) => (v == null || isNaN(v) ? "–" : `${Math.round(100 * v)}%`);
const num = (v) => (v == null ? "–" : Math.round(v).toLocaleString());

// ---------------------------------------------------------------------------------------------- data loading
async function getJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }
async function measures(band) {
  if (!M[band]) M[band] = await getJSON(`data/measures_${band.toLowerCase()}.json`);
  return M[band];
}

// ---------------------------------------------------------------------------------------------- current choices
const cur = () => ({ band: $("band").value, mode: $("mode").value, measure: $("measure").value, set: $("set").value,
  limit: +$("limit").value, pop: $("pop").value });

function setsFor(band, measure) {
  const m = M[band] && M[band].walk.sets ? Object.keys(M[band].walk.sets) : [];
  if (measure === "options") return m;
  return m.filter((s) => s !== "regular");
}
function syncControls() {
  const c = cur();
  const usesSet = ["nearest", "extra", "options"].includes(c.measure);
  $("setWrap").hidden = !usesSet;
  $("limitWrap").hidden = !["zoned", "nearest", "options"].includes(c.measure);
  if (usesSet) {
    const opts = setsFor(c.band, c.measure);
    const keep = opts.includes(c.set) ? c.set : (opts.includes("anychoice") ? "anychoice" : opts[0]);
    $("set").innerHTML = opts.map((s) => `<option value="${s}">${SETLABEL[s]}</option>`).join("");
    $("set").value = keep;
  }
}

// value array (floats, null) for the current measure
function values(c) {
  const m = M[c.band][c.mode];
  const sc = (a, k) => a.map((x) => (x == null ? null : x / k));
  switch (c.measure) {
    case "zoned": return sc(m.zoned, 10);
    case "detour": return sc(m.detour, 10);
    case "charters_5mi": return sc(m.charters_5mi, 10);
    case "nearest": return sc(m.sets[c.set].nearest, 10);
    case "extra": return sc(m.sets[c.set].extra, 10);
    case "options": return sc(m.sets[c.set][`n${c.limit}`], 10);
  }
}

// ---------------------------------------------------------------------------------------------- colour scales
function scale(c) {
  const walk = c.mode === "walk";
  if (c.measure === "extra") {
    const b = walk ? [-10, -2, 2, 10] : [-5, -1, 1, 5];
    return { colors: DIV, breaks: b, labels: [`choice ${-b[0]}+ min closer`, `${-b[1]}–${-b[0]} min closer`, `within ${b[2]} min`,
      `${b[2]}–${b[3]} min farther`, `${b[3]}+ min farther`], title: "Extra minutes to reach the nearest " + SETLABEL[c.set].toLowerCase() };
  }
  let b, unit = " min", title;
  if (c.measure === "zoned" || c.measure === "nearest") {
    b = walk ? [10, 20, 30, 45, 60] : [5, 10, 15, 20, 30];
    title = c.measure === "zoned" ? "Minutes to the zoned school" : `Minutes to the nearest ${SETLABEL[c.set].toLowerCase()}`;
  } else if (c.measure === "detour") {
    b = walk ? [1, 5, 10, 20, 40] : [0.5, 1, 2, 5, 10];
    title = "Zoning detour (minutes past the nearest regular school in the district)";
  } else {
    b = [0.05, 1, 3, 6, 10]; unit = "";
    title = c.measure === "options" ? `${SETLABEL[c.set]} options within ${c.limit} min` : "Charters within the 5-mile preference radius";
  }
  const labels = c.measure === "options" || c.measure === "charters_5mi"
    ? ["none", "under 1", "1–3", "3–6", "6–10", "10 or more"]
    : [`under ${b[0]}${unit}`, ...b.slice(0, -1).map((x, i) => `${x}–${b[i + 1]}${unit}`), `${b[b.length - 1]}${unit} or more`];
  return { colors: SEQ, breaks: b, labels, title };
}
const classOf = (v, br) => { let i = 0; while (i < br.length && v >= br[i]) i++; return i; };

// ---------------------------------------------------------------------------------------------- map
let map, blockLayer, selLayer, drawLine, drawPts = [], drawing = false, vals = [], sc;
function style(f) {
  const i = f.properties.i, v = vals[i];
  const nobody = D.blocks.residents[i] === 0;
  const sel = S.sel && S.selSet.has(i);
  return { weight: sel ? 1.2 : 0.2, color: sel ? "#0b0b0b" : "#ffffff", opacity: sel ? 0.9 : 0.6,
    fillColor: v == null || nobody ? NOPEOPLE : sc.colors[classOf(v, sc.breaks)], fillOpacity: nobody ? 0.25 : 0.78 };
}
function legend() {
  const rows = sc.colors.slice(0, sc.labels.length).map((col, k) =>
    `<div class="row"><span class="sw" style="background:${col}"></span>${sc.labels[k]}</div>`).join("");
  $("legend").innerHTML = `<div class="t">${sc.title}</div>${rows}<div class="row"><span class="sw" style="background:${NOPEOPLE};opacity:.5"></span>no residents</div>`
    + (cur().measure === "zoned" || cur().measure === "nearest" || cur().measure === "extra"
      ? `<div class="note">Average over the band's grades. ${cur().mode === "walk" ? "Walking times are skewed by long walks." : ""}</div>` : "");
}
async function redraw() {
  const c = cur();
  await measures(c.band);
  syncControls();
  const c2 = cur();
  vals = values(c2); sc = scale(c2);
  blockLayer.setStyle(style);
  legend();
  panel();
}

// ---------------------------------------------------------------------------------------------- hover
function tipHTML(i) {
  const c = cur(), m = M[c.band][c.mode], b = D.blocks, t = D.tracts[b.tract[i]];
  const sch = (k) => (k == null ? "–" : D.schools[k].name);
  const w = (g) => b.weights[c.pop][g][i] / 10;
  let h = `<h3>Block ${b.geoid[i]}</h3><div><span class="k">District:</span> ${b.districts[b.district[i]]}`
    + ` · <span class="k">Tract:</span> ${t.id.slice(5)}${t.place ? " (" + t.place + ")" : ""}</div>`
    + `<div><span class="k">Residents:</span> ${num(b.residents[i])} · <span class="k">children in households:</span> ~${num(b.weights.children.All[i] / 10)} (block counts are approximate)</div>`
    + `<div class="sep"></div><div><span class="k">Zoned school (grade ${REPGRADE[c.band]}):</span> ${sch(m.zoned_school[i])}</div>`
    + `<div><span class="k">${c.mode === "walk" ? "Walk" : "Drive"} to zoned school:</span> ${fmt1(m.zoned[i] / 10)} min · <span class="k">detour:</span> ${fmt1(m.detour[i] / 10)} min</div>`;
  if (["nearest", "extra", "options"].includes(c.measure)) {
    const s = m.sets[c.set];
    h += `<div class="sep"></div><div><span class="k">Nearest ${SETLABEL[c.set].toLowerCase()}:</span> ${sch(s.school[i])}</div>`
      + `<div>${fmt1(s.nearest[i] / 10)} min · <span class="k">extra vs zoned:</span> ${fmt1(s.extra[i] / 10)} min · <span class="k">options within ${c.limit} min:</span> ${fmt1(s[`n${c.limit}`][i] / 10)}</div>`;
    if (s.out_district[i] > 0) h += `<div class="k">Nearest is outside the block's district${s.out_study[i] > 0 ? ", and outside the four districts" : ""}.</div>`;
  }
  h += `<div><span class="k">Charters within 5 miles:</span> ${fmt1(m.charters_5mi[i] / 10)}</div>`;
  const r = t.child_rates;
  h += `<div class="sep"></div><div class="k">Tract income (children; tract figures, not this block):</div>`
    + `<div>below 100%: ${pct(r.lt100)} · below 185%: ${pct(r.lt185)} · above 400%: ${pct(r.gt400)}</div>`;
  const flags = [b.road_points[i] && "times start from points along the block's roads", b.large[i] && "large block (over 1 km²)",
    b.gq[i] && "has group quarters (left out of counts)", b.zone_other_district[i] && "zoned to a school in another district"].filter(Boolean);
  if (flags.length) h += `<div class="sep"></div><div class="k">${flags.join("; ")}</div>`;
  return h;
}

// ---------------------------------------------------------------------------------------------- selection
function setSelection(name, idx) {
  S.area = name; S.sel = idx; S.selSet = new Set(idx || []);
  const opts = ["Study area", ...D.blocks.districts];
  if (S.tract) opts.push(`Tract ${S.tract}`);
  if (S.drawn) opts.push("Drawn region");
  $("area").innerHTML = opts.map((o) => `<option${o === name ? " selected" : ""}>${o}</option>`).join("");
  blockLayer.setStyle(style);
  panel();
}
function areaIndices(name) {
  const b = D.blocks, n = b.geoid.length;
  if (name === "Study area") return null;
  if (D.blocks.districts.includes(name)) { const d = b.districts.indexOf(name); return [...Array(n).keys()].filter((i) => b.district[i] === d); }
  if (name.startsWith("Tract ")) { const t = b.tracts.indexOf(S.tract); return [...Array(n).keys()].filter((i) => b.tract[i] === t); }
  if (name === "Drawn region") return S.drawn;
  return null;
}
function inPoly(pt, poly) {         // ray casting on [lat, lng]
  let ins = false;
  for (let a = 0, z = poly.length - 1; a < poly.length; z = a++) {
    const [ya, xa] = poly[a], [yz, xz] = poly[z];
    if ((ya > pt[0]) !== (yz > pt[0]) && pt[1] < ((xz - xa) * (pt[0] - ya)) / (yz - ya) + xa) ins = !ins;
  }
  return ins;
}
function startDraw() {
  drawing = true; drawPts = []; $("drawBtn").classList.add("active"); $("drawHint").hidden = false;
  map.doubleClickZoom.disable(); map.getContainer().style.cursor = "crosshair";
  if (drawLine) map.removeLayer(drawLine);
  drawLine = L.polyline([], { color: "#0b0b0b", weight: 2, dashArray: "4 4" }).addTo(map);
}
function finishDraw() {
  drawing = false; $("drawBtn").classList.remove("active"); $("drawHint").hidden = true;
  map.getContainer().style.cursor = ""; setTimeout(() => map.doubleClickZoom.enable(), 300);
  if (drawPts.length < 3) { map.removeLayer(drawLine); return; }
  drawLine.setLatLngs([...drawPts, drawPts[0]]);
  const poly = drawPts.map((p) => [p.lat, p.lng]);
  S.drawn = D.centroids.map((c, i) => (inPoly(c, poly) ? i : -1)).filter((i) => i >= 0);
  setSelection("Drawn region", S.drawn);
}

// ---------------------------------------------------------------------------------------------- statistics
function wstats(idx, v, w, extra) {
  // weighted mean, median and optional share function over blocks idx
  let sw = 0, sv = 0; const pts = [];
  for (const i of idx) { const x = v[i], wt = w[i]; if (x == null || !(wt > 0)) continue; sw += wt; sv += wt * x; pts.push([x, wt]); }
  if (!(sw > 0)) return { n: 0 };
  pts.sort((a, b) => a[0] - b[0]);
  let acc = 0, med = pts[pts.length - 1][0];
  for (const [x, wt] of pts) { acc += wt; if (acc >= sw / 2) { med = x; break; } }
  const out = { n: sw, mean: sv / sw, median: med };
  for (const [k, f] of Object.entries(extra || {})) {
    let s = 0; for (const i of idx) { const x = v[i], wt = w[i]; if (x == null || !(wt > 0)) continue; s += wt * f(i, x); } out[k] = s / sw;
  }
  return out;
}
function tier(gap, kind, mode) {
  if (gap == null || isNaN(gap)) return null;
  const g = Math.abs(kind === "share" ? 100 * gap : gap);
  const cuts = kind === "share" ? [5, 10] : mode === "walk" ? [5, 10] : [5, 10, 20];
  const names = ["notable", "large", "very large"];
  let t = null; cuts.forEach((cu, k) => { if (g >= cu) t = names[k]; });
  return t;
}
function key(c, group, table, set, v, stat) {
  return `${S.area}|${c.pop}|${group}|${table}|${c.band}|${c.mode}|${set}|${v}|${stat}`;
}
function panel() {
  const c = cur(), b = D.blocks, n = b.geoid.length;
  const idx = S.sel || [...Array(n).keys()];
  const preset = S.area === "Study area" || D.blocks.districts.includes(S.area);
  // area info
  const res = idx.reduce((s, i) => s + b.residents[i], 0);
  const kids = idx.reduce((s, i) => s + b.weights.children.All[i] / 10, 0);
  const flags = [];
  if (res < 500) flags.push(`<span class="flag warn">fewer than 500 residents: treat with caution</span>`);
  if (S.area.startsWith("Tract ")) { const t = D.tracts[b.tracts.indexOf(S.tract)];
    if (t.partly_outside) flags.push(`<span class="flag warn">tract is partly outside the four districts</span>`);
    if (t.place) flags.push(`<span class="flag">${t.place}</span>`); }
  if (!preset) flags.push(`<span class="flag">no survey ranges for this area</span>`);
  $("areaInfo").innerHTML = `${num(idx.length)} blocks · ${num(res)} residents · ~${num(kids)} children in households<br>${flags.join("")}`;

  const v = values(c);
  const m = M[c.band][c.mode];
  const set = ["nearest", "extra", "options"].includes(c.measure) ? c.set : c.measure === "charters_5mi" ? "charter" : "zoned";
  let cols, table, mainVar, extra = {};
  if (c.measure === "zoned") { table = "A1"; mainVar = "minutes"; cols = [["mean", "Average", "min"], ["median", "Median", "min"], [`share_within_${c.limit}`, `Within ${c.limit} min`, "share"]];
    extra[`share_within_${c.limit}`] = (i, x) => (x <= c.limit ? 1 : 0); }
  if (c.measure === "detour") { table = "A1"; mainVar = "detour"; cols = [["mean", "Average", "min"], ["median", "Median", "min"]]; }
  if (c.measure === "nearest") { table = "A2"; mainVar = "minutes"; cols = [["mean", "Average", "min"], ["median", "Median", "min"],
    [`share_within_${c.limit}`, `Within ${c.limit} min`, "share"], ["share_outside_district", "Nearest in another district", "share"]];
    extra[`share_within_${c.limit}`] = (i, x) => (x <= c.limit ? 1 : 0); extra.share_outside_district = (i) => m.sets[c.set].out_district[i] / 100; }
  if (c.measure === "extra") { table = "A2"; mainVar = "extra"; cols = [["mean", "Average", "min"], ["median", "Median", "min"],
    ["share_choice_closer", "Choice is closer", "share"], ["share_outside_district", "Nearest in another district", "share"]];
    extra.share_choice_closer = (i, x) => (x < 0 ? 1 : 0); extra.share_outside_district = (i) => m.sets[c.set].out_district[i] / 100; }
  if (c.measure === "options") { table = "A3"; mainVar = "options"; cols = [[`mean_within_${c.limit}`, "Average number", "count"], [`share_none_within_${c.limit}`, "None in reach", "share"]];
    extra[`share_none_within_${c.limit}`] = (i, x) => (x === 0 ? 1 : 0); }
  if (c.measure === "charters_5mi") { table = "A3"; mainVar = "charters_5mi"; cols = [["mean", "Average number", "count"]]; }
  const sumVar = (stat) => (stat === "share_outside_district" ? "nearest" : mainVar);

  const st = Object.fromEntries(GROUPS.map((g) => [g, wstats(idx, v, b.weights[c.pop][g].map((x) => x / 10), extra)]));
  const all = st.All;
  const valOf = (s, stat) => (stat.startsWith("mean") ? s.mean : stat === "median" ? s.median : s[stat]);
  let html = `<thead><tr><th>Group</th><th>${c.pop === "children" ? "Children" : "Residents"}</th>${cols.map((k) => `<th>${k[1]}</th>`).join("")}<th>Gap vs all</th></tr></thead><tbody>`;
  for (const g of GROUPS) {
    const s = st[g];
    html += `<tr${g === "Hispanic" || g === "Below 100%" ? ' class="sep"' : ""}><td>${GLABEL[g]}</td><td>${s.n ? num(s.n) : "–"}</td>`;
    let gapCell = "";
    cols.forEach(([stat, , kind], k) => {
      const x = s.n ? valOf(s, stat) : null;
      const r = preset && INCOME.has(g) && stat !== "median" ? D.summary[key(c, g, table, set, sumVar(stat), stat)] : null;
      const gap = g === "All" || !s.n ? null : x - valOf(all, stat);
      const tr = kind === "count" ? null : tier(gap, kind, c.mode);
      const ok = tr && (!INCOME.has(g) || (r && (r[2] > 0 || r[3] < 0)));
      const show = kind === "share" ? pct(x) : fmt1(x);
      const rng = r ? `<span class="rng">(${kind === "share" ? pct(r[0]) : fmt1(r[0])} to ${kind === "share" ? pct(r[1]) : fmt1(r[1])})</span>` : "";
      html += `<td class="${ok ? "callout" : ""}">${show}${rng}</td>`;
      if (k === 0) gapCell = gap == null ? "" : `<td class="${ok ? "callout" : ""}">${kind === "share" ? `${(100 * gap).toFixed(0).replace("-", "−")} pts` : fmt1(gap)}${ok ? ` · ${tr}` : ""}</td>`;
    });
    html += (gapCell || "<td></td>") + "</tr>";
  }
  $("stats").innerHTML = html + "</tbody>";
  const what = { zoned: "Travel to the zoned school", detour: "Zoning detour", nearest: `Travel to the nearest ${SETLABEL[c.set].toLowerCase()}`,
    extra: `Extra minutes to reach the nearest ${SETLABEL[c.set].toLowerCase()}`, options: `${SETLABEL[c.set]} options within ${c.limit} minutes`,
    charters_5mi: "Charters within the 5-mile preference radius" }[c.measure];
  $("panelTitle").textContent = `${what}: ${c.band.toLowerCase()}, ${c.mode === "walk" ? "walking" : "driving"} · ${S.area}`;
  $("panelNote").textContent = c.measure === "extra" ? "Negative = the choice option is closer than the zoned school."
    : c.measure === "detour" ? "Extra time to the zoned school compared with the nearest regular school in the same district. Zero = the zoned school is the nearest."
    : c.mode === "walk" && ["zoned", "nearest"].includes(c.measure) ? "Walking times are skewed by long walks: read the median and the share within the limit beside the average." : "";
}

// ---------------------------------------------------------------------------------------------- start
(async function init() {
  try {
    [D.blocks, D.shapes, D.schools, D.tracts, D.summary, D.meta, D.districts] = await Promise.all(
      ["blocks.json", "blocks.geojson", "schools.json", "tracts.json", "summary.json", "meta.json", "districts.geojson"].map((f) => getJSON(`data/${f}`)));
  } catch (e) { $("panelTitle").textContent = "Could not load the data: " + e.message; return; }
  $("built").textContent = D.meta.built;
  await measures($("band").value);
  map = L.map("map", { preferCanvas: true, renderer: L.canvas({ tolerance: 2 }), zoomSnap: 0.25 });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, opacity: 0.55 }).addTo(map);
  D.centroids = new Array(D.blocks.geoid.length);
  for (const f of D.shapes.features) {
    const ring = f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
    let y = 0, x = 0; for (const p of ring) { x += p[0]; y += p[1]; }
    D.centroids[f.properties.i] = [y / ring.length, x / ring.length];
  }
  syncControls();
  vals = []; sc = scale(cur());
  // one shared canvas for blocks and school markers: separate canvases would stack, and the top one would take
  // every mouse event
  blockLayer = L.geoJSON(D.shapes, { style }).addTo(map);
  L.geoJSON(D.districts, { style: { color: "#0b0b0b", weight: 1.6, fill: false }, interactive: false }).addTo(map);
  map.fitBounds(blockLayer.getBounds(), { padding: [10, 10] });

  const icons = {};
  const schoolLayers = {};
  for (const s of D.schools) {
    if (s.type === "Special program") continue;
    const t = s.type === "Vo-Tech" ? "Vo-Tech" : s.type;
    const mk = L.circleMarker([s.lat, s.lon], { radius: t === "Regular" ? 3.5 : 5.5, color: s.program ? "#0b0b0b" : "#ffffff",
      weight: s.program ? 1.8 : 1, fillColor: TYPECOLOR[t] || "#9a9890", fillOpacity: 1 })
      .bindTooltip(`<strong>${s.name}</strong><br>${t}${s.program ? " · " + s.program : ""}<br>Grades ${s.grades} · ${s.district}<br>${s.address}`);
    (schoolLayers[t] = schoolLayers[t] || L.layerGroup()).addLayer(mk);
  }
  const named = { Regular: "Regular schools (ringed: choice program)", Charter: "Charters", Magnet: "Magnets", "Vo-Tech": "Vo-tech" };
  const overlays = {};
  for (const [t, lg] of Object.entries(schoolLayers)) { lg.addTo(map); overlays[named[t] || t] = lg; }
  L.control.layers(null, overlays, { collapsed: true, position: "topright" }).addTo(map);

  const tip = $("tip");
  blockLayer.on("mousemove", (e) => { if (drawing) return; tip.innerHTML = tipHTML(e.layer.feature.properties.i); tip.hidden = false;
    const x = e.originalEvent.clientX, y = e.originalEvent.clientY, wd = tip.offsetWidth, ht = tip.offsetHeight;
    tip.style.left = `${Math.min(x + 14, innerWidth - wd - 8)}px`; tip.style.top = `${Math.min(y + 14, innerHeight - ht - 8)}px`; });
  blockLayer.on("mouseout", () => { tip.hidden = true; });
  blockLayer.on("click", (e) => { if (drawing) return; S.tract = D.blocks.tracts[D.blocks.tract[e.layer.feature.properties.i]];
    setSelection(`Tract ${S.tract}`, areaIndices(`Tract ${S.tract}`)); });
  map.on("click", (e) => { if (!drawing) return; drawPts.push(e.latlng); drawLine.setLatLngs(drawPts); });
  map.on("dblclick", () => { if (drawing) finishDraw(); });
  $("drawBtn").onclick = () => (drawing ? finishDraw() : startDraw());
  $("clearBtn").onclick = () => { if (drawLine) map.removeLayer(drawLine); S.drawn = null; S.tract = null; setSelection("Study area", null); };
  $("area").onchange = () => setSelection($("area").value, areaIndices($("area").value));
  for (const id of ["band", "mode", "measure", "set", "limit", "pop"]) $(id).onchange = redraw;
  $("aboutBtn").onclick = () => $("about").showModal();
  setSelection("Study area", null);
  await redraw();
})();
