/**
 * Streamgraph Module (Swedish Municipal Waste Transition, 1975–2025):
 * Loads Avfall Sverige waste data from ./data/waste.json (with automatic file://
 * fallback via ./data/waste_fallback.js) and renders an interactive, colorblind-safe
 * SVG Streamgraph with Fritsch-Carlson monotone cubic interpolation.
 *
 * Modes:
 * - "stream": Classic symmetric silhouette streamgraph (centered baseline, default)
 * - "share":  100% normalized stacked stream showing exact percentage composition
 * - "area":   Zero-baseline stacked area for reading absolute total tonnage
 */

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Editorial, cohesive palette ordered bottom-to-top */
  const STREAMS = [
    {
      key: "landfill",
      label: "Landfill",
      color: "#D96B27",
      labelColor: "#ffffff",
    },
    {
      key: "energy_recovery",
      label: "Energy Recovery",
      color: "#F2C14E",
      labelColor: "#0f172a",
    },
    {
      key: "material_recycling",
      label: "Material Recycling",
      color: "#2A6F8E",
      labelColor: "#ffffff",
    },
    {
      key: "biological_treatment",
      label: "Biological Treatment",
      color: "#4A9B7F",
      labelColor: "#ffffff",
    },
    {
      key: "recycling_of_construction_material",
      label: "Construction Recycling",
      color: "#7B8FA1",
      labelColor: "#ffffff",
    },
    {
      key: "waste_prepared_for_reuse",
      label: "Prepared for Reuse",
      color: "#6D597A",
      labelColor: "#ffffff",
    },
  ];

  const MODE_CAPTIONS = {
    stream:
      "Symmetric streamgraph of Swedish municipal waste (1975–2025) in metric tonnes. Band thickness reflects annual volume; Landfill collapses from 62.3% (1975) to 1.5% (2025) as Energy Recovery, Material Recycling, and Biological Treatment expand.",
    share:
      "Normalized 100% share stream of Swedish municipal waste (1975–2025), highlighting the structural shift from 62.3% Landfill in 1975 to 98.5% recovery and recycling by 2025.",
    area:
      "Zero-baseline stacked area chart of Swedish municipal waste (1975–2025), showing total volume rising from 2.60M tonnes (1975) to 4.50M tonnes (2025) while landfill approaches zero.",
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function formatTonnes(val) {
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(2)}M t`;
    }
    return `${Math.round(val).toLocaleString("en-US")} t`;
  }

  function formatExactTonnes(val) {
    return `${Math.round(val).toLocaleString("en-US")} t`;
  }

  function formatPercent(part, total) {
    if (!total) return "0.0%";
    return `${((part / total) * 100).toFixed(1)}%`;
  }

  async function loadWasteData() {
    try {
      const response = await fetch("./data/waste.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      return new Promise((resolve, reject) => {
        if (window.__WASTE_FALLBACK__ && Array.isArray(window.__WASTE_FALLBACK__.records)) {
          resolve(window.__WASTE_FALLBACK__);
          return;
        }
        const script = document.createElement("script");
        script.src = "./data/waste_fallback.js";
        script.onload = () => {
          if (window.__WASTE_FALLBACK__ && Array.isArray(window.__WASTE_FALLBACK__.records)) {
            resolve(window.__WASTE_FALLBACK__);
          } else {
            reject(err);
          }
        };
        script.onerror = () => reject(err);
        document.head.appendChild(script);
      });
    }
  }

  /**
   * Compute Fritsch-Carlson monotone cubic Hermite tangents for points [{x, y}]
   * so curves flow organically without overshooting or creating negative loops.
   */
  function computeMonotoneTangents(pts) {
    const n = pts.length;
    if (n < 2) return new Array(n).fill(0);

    const dx = new Array(n - 1);
    const slope = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      slope[i] = dx[i] !== 0 ? (pts[i + 1].y - pts[i].y) / dx[i] : 0;
    }

    const m = new Array(n);
    m[0] = slope[0];
    m[n - 1] = slope[n - 2];

    for (let i = 1; i < n - 1; i++) {
      if (slope[i - 1] * slope[i] <= 0) {
        m[i] = 0;
      } else {
        const w1 = 2 * dx[i] + dx[i - 1];
        const w2 = dx[i] + 2 * dx[i - 1];
        m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
      }
    }

    return m;
  }

  /** Build an SVG cubic Bézier curve segment sequence along points (forward or reversed) */
  function buildSplineCommands(pts, moveFirst) {
    const n = pts.length;
    const m = computeMonotoneTangents(pts);
    let d = moveFirst ? `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}` : `L${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;

    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const h = (p1.x - p0.x) / 3;
      const cp1x = p0.x + h;
      const cp1y = p0.y + h * m[i];
      const cp2x = p1.x - h;
      const cp2y = p1.y - h * m[i + 1];
      d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
    }
    return d;
  }

  /** Build closed SVG path for a stream band between topPts (L->R) and bottomPts (L->R) */
  function buildStreamPath(topPts, bottomPts) {
    const topCmd = buildSplineCommands(topPts, true);
    const botRev = [...bottomPts].reverse();
    const botCmd = buildSplineCommands(botRev, false);
    return `${topCmd} ${botCmd} Z`;
  }

  function renderAccessibleTable(tbodyEl, records) {
    if (!tbodyEl) return;
    const frag = document.createDocumentFragment();
    const descRecords = [...records].reverse();

    for (const r of descRecords) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = String(r.year);
      tr.appendChild(th);

      const vals = [
        r.material_recycling || 0,
        r.biological_treatment || 0,
        r.energy_recovery || 0,
        r.landfill || 0,
        r.waste_prepared_for_reuse || 0,
        r.recycling_of_construction_material || 0,
        r.total || 0,
      ];

      for (const v of vals) {
        const td = document.createElement("td");
        td.textContent = v > 0 ? Math.round(v).toLocaleString("en-US") : "—";
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }

    tbodyEl.replaceChildren(frag);
  }

  async function initStreamgraph() {
    const plotEl = document.getElementById("streamgraph-plot");
    if (!plotEl) return;

    const modeInputs = document.querySelectorAll('input[name="stream-mode"]');
    const captionEl = document.getElementById("streamgraph-caption");
    const statusEl = document.getElementById("streamgraph-status");
    const tbodyEl = document.getElementById("streamgraph-table-body");

    const dataset = await loadWasteData();
    const records = [...dataset.records].sort((a, b) => a.year - b.year);

    renderAccessibleTable(tbodyEl, records);

    const state = {
      mode: "stream", // "stream" | "share" | "area"
      hoveredKey: null,
      activeIndex: null,
    };

    const minYear = records[0].year;
    const maxYear = records[records.length - 1].year;
    const maxTotal = Math.max(...records.map((r) => r.total || 0));

    function computeStacks(mode) {
      // Returns per-stream arrays of { year, y0, y1, val, total }
      const stacks = STREAMS.map((s) => ({ stream: s, points: [] }));

      for (const rec of records) {
        const total = rec.total || STREAMS.reduce((acc, s) => acc + (rec[s.key] || 0), 0);
        const norm = mode === "share" ? (total > 0 ? 100 / total : 0) : 1;
        const scaledTotal = total * norm;
        const baseline = mode === "stream" ? -scaledTotal / 2 : 0;

        let cursor = baseline;
        STREAMS.forEach((s, idx) => {
          const rawVal = rec[s.key] || 0;
          const v = rawVal * norm;
          stacks[idx].points.push({
            year: rec.year,
            y0: cursor,
            y1: cursor + v,
            val: rawVal,
            total,
          });
          cursor += v;
        });
      }

      return stacks;
    }

    function render() {
      const { mode } = state;
      const stacks = computeStacks(mode);

      const width = 940;
      const height = 430;
      const padLeft = mode === "stream" ? 26 : 58;
      const padRight = 26;
      const padTop = 24;
      const padBottom = 42;
      const plotW = width - padLeft - padRight;
      const plotH = height - padTop - padBottom;

      const xScale = (yr) => padLeft + ((yr - minYear) / (maxYear - minYear)) * plotW;

      let yMin, yMax;
      if (mode === "stream") {
        const half = (maxTotal * 1.06) / 2;
        yMin = -half;
        yMax = half;
      } else if (mode === "share") {
        yMin = 0;
        yMax = 100;
      } else {
        yMin = 0;
        yMax = Math.ceil(maxTotal / 1_000_000) * 1_000_000;
      }

      const yScale = (val) => padTop + ((yMax - val) / (yMax - yMin)) * plotH;

      const wrapper = document.createElement("div");
      wrapper.className = "streamgraph-wrapper";

      const svg = svgEl("svg", {
        viewBox: `0 0 ${width} ${height}`,
        class: "streamgraph-svg",
        role: "img",
        "aria-label": `Streamgraph of Swedish municipal waste treatment from ${minYear} to ${maxYear} across 6 pathways.`,
      });

      // Vertical year gridlines & x-axis ticks (every 5 years)
      const gridGroup = svgEl("g", { class: "stream-grid" });
      for (let yr = 1975; yr <= 2025; yr += 5) {
        const x = xScale(yr);
        gridGroup.appendChild(
          svgEl("line", {
            x1: x,
            x2: x,
            y1: padTop,
            y2: height - padBottom,
            stroke: "rgba(148, 163, 184, 0.22)",
            "stroke-width": 1,
          })
        );
        const tick = svgEl("text", {
          x,
          y: height - padBottom + 22,
          "text-anchor": yr === 1975 ? "start" : yr === 2025 ? "end" : "middle",
          class: "stream-axis-label",
        });
        tick.textContent = String(yr);
        gridGroup.appendChild(tick);
      }

      // Horizontal reference ticks for 100% Share and Stacked Area modes
      if (mode === "share") {
        for (const pct of [0, 25, 50, 75, 100]) {
          const y = yScale(pct);
          gridGroup.appendChild(
            svgEl("line", {
              x1: padLeft,
              x2: width - padRight,
              y1: y,
              y2: y,
              stroke: "rgba(148, 163, 184, 0.22)",
              "stroke-width": 1,
            })
          );
          const lbl = svgEl("text", {
            x: padLeft - 10,
            y: y + 4,
            "text-anchor": "end",
            class: "stream-axis-label",
          });
          lbl.textContent = `${pct}%`;
          gridGroup.appendChild(lbl);
        }
      } else if (mode === "area") {
        for (let m = 0; m <= yMax / 1_000_000; m += 1) {
          const y = yScale(m * 1_000_000);
          gridGroup.appendChild(
            svgEl("line", {
              x1: padLeft,
              x2: width - padRight,
              y1: y,
              y2: y,
              stroke: "rgba(148, 163, 184, 0.22)",
              "stroke-width": 1,
            })
          );
          const lbl = svgEl("text", {
            x: padLeft - 10,
            y: y + 4,
            "text-anchor": "end",
            class: "stream-axis-label",
          });
          lbl.textContent = m === 0 ? "0" : `${m}M t`;
          gridGroup.appendChild(lbl);
        }
      } else {
        // Subtle center axis line for symmetric streamgraph
        const yMid = yScale(0);
        gridGroup.appendChild(
          svgEl("line", {
            x1: padLeft,
            x2: width - padRight,
            y1: yMid,
            y2: yMid,
            stroke: "rgba(148, 163, 184, 0.25)",
            "stroke-width": 1,
            "stroke-dasharray": "3 4",
          })
        );
      }
      svg.appendChild(gridGroup);

      // Stream layers
      const layersGroup = svgEl("g", { class: "stream-layers" });
      const labelsGroup = svgEl("g", { class: "stream-inline-labels", "pointer-events": "none" });
      const pathEls = new Map();

      stacks.forEach(({ stream, points }) => {
        const topPts = points.map((p) => ({ x: xScale(p.year), y: yScale(p.y1) }));
        const botPts = points.map((p) => ({ x: xScale(p.year), y: yScale(p.y0) }));
        const d = buildStreamPath(topPts, botPts);

        const path = svgEl("path", {
          d,
          fill: stream.color,
          "fill-opacity": 0.9,
          stroke: "#ffffff",
          "stroke-width": 0.85,
          "stroke-opacity": 0.65,
          class: "stream-band",
          "data-key": stream.key,
        });

        layersGroup.appendChild(path);
        pathEls.set(stream.key, path);

        // Place direct inline label at the widest point of major streams (>= 26px tall)
        let bestIdx = 0;
        let bestThickPx = 0;
        points.forEach((p, idx) => {
          const thickPx = Math.abs(yScale(p.y0) - yScale(p.y1));
          // Keep label slightly away from extreme edges
          const edgePenalty = p.year < 1979 || p.year > 2021 ? 0.65 : 1;
          if (thickPx * edgePenalty > bestThickPx) {
            bestThickPx = thickPx * edgePenalty;
            bestIdx = idx;
          }
        });

        const bestPt = points[bestIdx];
        const actualThickPx = Math.abs(yScale(bestPt.y0) - yScale(bestPt.y1));
        if (actualThickPx >= 28) {
          const cx = xScale(bestPt.year);
          const cy = (yScale(bestPt.y0) + yScale(bestPt.y1)) / 2 + 4;
          const lbl = svgEl("text", {
            x: cx,
            y: cy,
            "text-anchor": "middle",
            fill: stream.labelColor,
            class: "stream-band-label",
          });
          lbl.textContent = stream.label;
          labelsGroup.appendChild(lbl);
        }
      });

      svg.appendChild(layersGroup);
      svg.appendChild(labelsGroup);

      // Crosshair vertical guide line
      const crosshair = svgEl("line", {
        x1: padLeft,
        x2: padLeft,
        y1: padTop,
        y2: height - padBottom,
        stroke: "#0f172a",
        "stroke-width": 1.3,
        "stroke-dasharray": "3 3",
        opacity: 0,
        "pointer-events": "none",
      });
      svg.appendChild(crosshair);

      // Interactive overlay for smooth mouse/touch scrubbing
      const overlay = svgEl("rect", {
        x: padLeft,
        y: padTop,
        width: plotW,
        height: plotH,
        fill: "transparent",
        class: "stream-overlay",
      });
      svg.appendChild(overlay);

      // Floating tooltip element (crisp dark text on white)
      const tooltip = document.createElement("div");
      tooltip.className = "stream-tooltip";
      tooltip.hidden = true;

      function applyHighlight(key) {
        state.hoveredKey = key;
        pathEls.forEach((el, k) => {
          if (!key) {
            el.setAttribute("fill-opacity", "0.9");
          } else {
            el.setAttribute("fill-opacity", k === key ? "0.98" : "0.24");
          }
        });
        legendItems.forEach((btn, k) => {
          btn.classList.toggle("is-dimmed", Boolean(key && k !== key));
          btn.classList.toggle("is-active", k === key);
        });
      }

      function updateScrubber(clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        const svgX = ((clientX - rect.left) / rect.width) * width;
        const clampedX = Math.max(padLeft, Math.min(width - padRight, svgX));
        const yearFloat = minYear + ((clampedX - padLeft) / plotW) * (maxYear - minYear);

        // Snap to nearest record
        let nearestIdx = 0;
        let minDist = Infinity;
        records.forEach((r, i) => {
          const d = Math.abs(r.year - yearFloat);
          if (d < minDist) {
            minDist = d;
            nearestIdx = i;
          }
        });

        const rec = records[nearestIdx];
        const snapX = xScale(rec.year);
        crosshair.setAttribute("x1", snapX.toFixed(2));
        crosshair.setAttribute("x2", snapX.toFixed(2));
        crosshair.setAttribute("opacity", "0.85");

        // Build clean, concise tooltip rows (active pathways only, sorted top-to-bottom)
        const total = rec.total || 0;
        const activeRows = [...STREAMS]
          .reverse()
          .map((s) => ({ stream: s, val: rec[s.key] || 0 }))
          .filter((item) => item.val > 0);

        tooltip.innerHTML =
          `<div class="stream-tooltip-head"><strong>${rec.year}</strong><span>${formatTonnes(total)}</span></div>` +
          `<ul class="stream-tooltip-list">` +
          activeRows
            .map(
              ({ stream, val }) =>
                `<li><span class="stream-tooltip-dot" style="background:${stream.color}"></span>` +
                `<span class="stream-tooltip-name">${stream.label}</span>` +
                `<span class="stream-tooltip-val">${formatPercent(val, total)} · ${formatTonnes(val)}</span></li>`
            )
            .join("") +
          `</ul>`;
        tooltip.hidden = false;

        // Position tooltip cleanly inside wrapper without clipping right edge
        const wrapRect = wrapper.getBoundingClientRect();
        const relX = clientX - wrapRect.left;
        const relY = clientY - wrapRect.top;
        const tipW = tooltip.offsetWidth || 230;
        const placeLeft = relX + tipW + 24 > wrapRect.width;
        tooltip.style.left = `${placeLeft ? Math.max(8, relX - tipW - 16) : relX + 16}px`;
        tooltip.style.top = `${Math.max(8, Math.min(wrapRect.height - 160, relY - 24))}px`;

        // Detect which stream band the pointer is over
        const svgY = ((clientY - rect.top) / rect.height) * height;
        let hitKey = null;
        for (const st of stacks) {
          const pt = st.points[nearestIdx];
          const topY = yScale(pt.y1);
          const botY = yScale(pt.y0);
          if (svgY >= topY && svgY <= botY && pt.val > 0) {
            hitKey = st.stream.key;
            break;
          }
        }
        applyHighlight(hitKey);
      }

      overlay.addEventListener("mousemove", (e) => updateScrubber(e.clientX, e.clientY));
      overlay.addEventListener("mouseleave", () => {
        crosshair.setAttribute("opacity", "0");
        tooltip.hidden = true;
        applyHighlight(null);
      });
      overlay.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches[0]) {
            updateScrubber(e.touches[0].clientX, e.touches[0].clientY);
          }
        },
        { passive: true }
      );

      // Clean interactive legend below SVG
      const legend = document.createElement("div");
      legend.className = "stream-legend";
      const legendItems = new Map();

      [...STREAMS].reverse().forEach((s) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stream-legend-item";
        btn.innerHTML = `<span class="stream-legend-swatch" style="background:${s.color}" aria-hidden="true"></span><span>${s.label}</span>`;
        btn.addEventListener("mouseenter", () => applyHighlight(s.key));
        btn.addEventListener("mouseleave", () => applyHighlight(null));
        btn.addEventListener("focus", () => applyHighlight(s.key));
        btn.addEventListener("blur", () => applyHighlight(null));
        legend.appendChild(btn);
        legendItems.set(s.key, btn);
      });

      wrapper.append(svg, tooltip, legend);
      plotEl.replaceChildren(wrapper);

      if (captionEl) {
        captionEl.textContent = MODE_CAPTIONS[mode];
      }
      if (statusEl) {
        statusEl.textContent = `Showing Swedish municipal waste transition (1975–2025) in ${mode} mode.`;
      }
    }

    render();

    modeInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.mode = e.target.value;
          render();
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", initStreamgraph);
})();
