/**
 * ============================================================================
 * TEMPLATE 3 — SVG Monotone Cubic Streamgraph / 100% Share / Stacked Area
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export JSON following this schema (see build_waste_data.py):
 *        {
 *          "records": [
 *            {
 *              "year": 1975,
 *              "landfill": 1620000,
 *              "energy_recovery": 780000,
 *              "material_recycling": 150000,
 *              "total": 2600000
 *            }
 *          ]
 *        }
 *   2. Update CONFIG below (data paths, series definitions bottom-to-top,
 *      axis tick step, value formatter, and mode captions).
 *   3. Copy <section id="streamgraph"> from index.html.
 * ============================================================================
 */

(() => {
  "use strict";

  const {
    el,
    svgEl,
    loadJson,
    renderError,
    renderTableRows,
    formatExact,
    formatPct,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/waste.json",
      fallbackUrl: "./data/waste_fallback.js",
      fallbackKey: "__WASTE_FALLBACK__",
      validate: (d) => Boolean(d && Array.isArray(d.records) && d.records.length > 0),
    },
    ids: {
      plot: "streamgraph-plot",
      caption: "streamgraph-caption",
      status: "streamgraph-status",
      tableBody: "streamgraph-table-body",
      modeRadioName: "stream-mode",
    },
    /** Series ordered bottom-to-top; colorblind-safe editorial palette */
    series: [
      { key: "landfill", label: "Landfill", color: "#D96B27", labelColor: "#ffffff" },
      { key: "energy_recovery", label: "Energy Recovery", color: "#F2C14E", labelColor: "#0f172a" },
      { key: "material_recycling", label: "Material Recycling", color: "#2A6F8E", labelColor: "#ffffff" },
      { key: "biological_treatment", label: "Biological Treatment", color: "#4A9B7F", labelColor: "#ffffff" },
      { key: "recycling_of_construction_material", label: "Construction Recycling", color: "#7B8FA1", labelColor: "#ffffff" },
      { key: "waste_prepared_for_reuse", label: "Prepared for Reuse", color: "#6D597A", labelColor: "#ffffff" },
    ],
    /** Table column keys matching <thead> order in index.html */
    tableColumns: [
      "material_recycling",
      "biological_treatment",
      "energy_recovery",
      "landfill",
      "waste_prepared_for_reuse",
      "recycling_of_construction_material",
      "total",
    ],
    tickStepYears: 5,
    captions: {
      stream:
        "Symmetric streamgraph of Swedish municipal waste (1975–2025) in metric tonnes. Band thickness reflects annual volume; Landfill collapses from 62.3% (1975) to 1.5% (2025) as Energy Recovery, Material Recycling, and Biological Treatment expand.",
      share:
        "Normalized 100% share stream of Swedish municipal waste (1975–2025), highlighting the structural shift from 62.3% Landfill in 1975 to 98.5% recovery and recycling by 2025.",
      area:
        "Zero-baseline stacked area chart of Swedish municipal waste (1975–2025), showing total volume rising from 2.60M tonnes (1975) to 4.50M tonnes (2025) while landfill approaches zero.",
    },
    formatValue: (val) =>
      val >= 1_000_000 ? `${(val / 1_000_000).toFixed(2)}M t` : `${formatExact(val)} t`,
    formatAxisUnit: (millions) => (millions === 0 ? "0" : `${millions}M t`),
  };

  /** Fritsch-Carlson monotone cubic Hermite tangents (prevents spline overshoot). */
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

  function buildSplineCommands(pts, moveFirst) {
    const m = computeMonotoneTangents(pts);
    let d = moveFirst
      ? `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
      : `L${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const h = (p1.x - p0.x) / 3;
      d += ` C${(p0.x + h).toFixed(2)},${(p0.y + h * m[i]).toFixed(2)} ${(p1.x - h).toFixed(2)},${(p1.y - h * m[i + 1]).toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`;
    }
    return d;
  }

  function buildStreamPath(topPts, bottomPts) {
    return `${buildSplineCommands(topPts, true)} ${buildSplineCommands([...bottomPts].reverse(), false)} Z`;
  }

  async function initStreamgraph() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const modeInputs = document.querySelectorAll(`input[name="${CONFIG.ids.modeRadioName}"]`);
    const captionEl = document.getElementById(CONFIG.ids.caption);
    const statusEl = document.getElementById(CONFIG.ids.status);
    const tbodyEl = document.getElementById(CONFIG.ids.tableBody);

    let dataset;
    try {
      dataset = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load streamgraph dataset. Please check", CONFIG.data.url);
      console.error("Streamgraph load error:", err);
      return;
    }

    const records = [...dataset.records].sort((a, b) => a.year - b.year);
    const minYear = records[0].year;
    const maxYear = records[records.length - 1].year;
    const maxTotal = Math.max(...records.map((r) => r.total || 0));

    if (tbodyEl) {
      renderTableRows(
        tbodyEl,
        [...records].reverse().map((r) => [
          r.year,
          ...CONFIG.tableColumns.map((col) => ((r[col] || 0) > 0 ? formatExact(r[col]) : "—")),
        ])
      );
    }

    const state = { mode: "stream" };

    function computeStacks(mode) {
      const stacks = CONFIG.series.map((s) => ({ stream: s, points: [] }));
      for (const rec of records) {
        const total = rec.total || CONFIG.series.reduce((acc, s) => acc + (rec[s.key] || 0), 0);
        const norm = mode === "share" ? (total > 0 ? 100 / total : 0) : 1;
        let cursor = mode === "stream" ? -(total * norm) / 2 : 0;

        CONFIG.series.forEach((s, idx) => {
          const rawVal = rec[s.key] || 0;
          const v = rawVal * norm;
          stacks[idx].points.push({ year: rec.year, y0: cursor, y1: cursor + v, val: rawVal, total });
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

      let yMin;
      let yMax;
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

      const wrapper = el("div", { className: "streamgraph-wrapper" });
      const svg = svgEl("svg", {
        viewBox: `0 0 ${width} ${height}`,
        class: "streamgraph-svg",
        role: "img",
        "aria-label": `Streamgraph from ${minYear} to ${maxYear} across ${CONFIG.series.length} categories.`,
      });

      const gridGroup = svgEl("g");
      for (let yr = minYear; yr <= maxYear; yr += CONFIG.tickStepYears) {
        const x = xScale(yr);
        gridGroup.append(
          svgEl("line", {
            x1: x,
            x2: x,
            y1: padTop,
            y2: height - padBottom,
            stroke: "rgba(148, 163, 184, 0.22)",
            "stroke-width": 1,
          }),
          svgEl(
            "text",
            {
              x,
              y: height - padBottom + 22,
              "text-anchor": yr === minYear ? "start" : yr === maxYear ? "end" : "middle",
              class: "stream-axis-label",
            },
            yr
          )
        );
      }

      if (mode === "share") {
        for (const pct of [0, 25, 50, 75, 100]) {
          const y = yScale(pct);
          gridGroup.append(
            svgEl("line", { x1: padLeft, x2: width - padRight, y1: y, y2: y, stroke: "rgba(148, 163, 184, 0.22)", "stroke-width": 1 }),
            svgEl("text", { x: padLeft - 10, y: y + 4, "text-anchor": "end", class: "stream-axis-label" }, `${pct}%`)
          );
        }
      } else if (mode === "area") {
        for (let m = 0; m <= yMax / 1_000_000; m += 1) {
          const y = yScale(m * 1_000_000);
          gridGroup.append(
            svgEl("line", { x1: padLeft, x2: width - padRight, y1: y, y2: y, stroke: "rgba(148, 163, 184, 0.22)", "stroke-width": 1 }),
            svgEl("text", { x: padLeft - 10, y: y + 4, "text-anchor": "end", class: "stream-axis-label" }, CONFIG.formatAxisUnit(m))
          );
        }
      } else {
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

      const layersGroup = svgEl("g");
      const labelsGroup = svgEl("g", { "pointer-events": "none" });
      const pathEls = new Map();

      stacks.forEach(({ stream, points }) => {
        const topPts = points.map((p) => ({ x: xScale(p.year), y: yScale(p.y1) }));
        const botPts = points.map((p) => ({ x: xScale(p.year), y: yScale(p.y0) }));
        const path = svgEl("path", {
          d: buildStreamPath(topPts, botPts),
          fill: stream.color,
          "fill-opacity": 0.9,
          stroke: "#ffffff",
          "stroke-width": 0.85,
          "stroke-opacity": 0.65,
          class: "stream-band",
        });

        layersGroup.appendChild(path);
        pathEls.set(stream.key, path);

        let bestIdx = 0;
        let bestScore = 0;
        points.forEach((p, idx) => {
          const thickPx = Math.abs(yScale(p.y0) - yScale(p.y1));
          const edgePenalty = p.year < minYear + 4 || p.year > maxYear - 4 ? 0.65 : 1;
          if (thickPx * edgePenalty > bestScore) {
            bestScore = thickPx * edgePenalty;
            bestIdx = idx;
          }
        });

        const bestPt = points[bestIdx];
        if (Math.abs(yScale(bestPt.y0) - yScale(bestPt.y1)) >= 28) {
          labelsGroup.appendChild(
            svgEl(
              "text",
              {
                x: xScale(bestPt.year),
                y: (yScale(bestPt.y0) + yScale(bestPt.y1)) / 2 + 4,
                "text-anchor": "middle",
                fill: stream.labelColor,
                class: "stream-band-label",
              },
              stream.label
            )
          );
        }
      });

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

      const overlay = svgEl("rect", {
        x: padLeft,
        y: padTop,
        width: plotW,
        height: plotH,
        fill: "transparent",
        class: "stream-overlay",
      });

      svg.append(layersGroup, labelsGroup, crosshair, overlay);

      const tooltip = el("div", { className: "chart-tooltip stream-tooltip", hidden: true });
      const legend = el("div", { className: "stream-legend" });
      const legendItems = new Map();

      function applyHighlight(key) {
        pathEls.forEach((pathEl, k) => {
          pathEl.setAttribute("fill-opacity", !key ? "0.9" : k === key ? "0.98" : "0.24");
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

        const total = rec.total || 0;
        const activeRows = [...CONFIG.series]
          .reverse()
          .map((s) => ({ stream: s, val: rec[s.key] || 0 }))
          .filter((item) => item.val > 0);

        tooltip.replaceChildren(
          el(
            "div",
            { className: "stream-tooltip-head" },
            el("strong", null, rec.year),
            el("span", null, CONFIG.formatValue(total))
          ),
          el(
            "ul",
            { className: "stream-tooltip-list" },
            activeRows.map(({ stream, val }) =>
              el(
                "li",
                null,
                el("span", { className: "stream-tooltip-dot", style: { backgroundColor: stream.color } }),
                el("span", { className: "stream-tooltip-name" }, stream.label),
                el("span", { className: "stream-tooltip-val" }, `${formatPct(val, total)} · ${CONFIG.formatValue(val)}`)
              )
            )
          )
        );
        tooltip.hidden = false;

        const wrapRect = wrapper.getBoundingClientRect();
        const relX = clientX - wrapRect.left;
        const relY = clientY - wrapRect.top;
        const tipW = tooltip.offsetWidth || 230;
        tooltip.style.left = `${relX + tipW + 24 > wrapRect.width ? Math.max(8, relX - tipW - 16) : relX + 16}px`;
        tooltip.style.top = `${Math.max(8, Math.min(wrapRect.height - 160, relY - 24))}px`;

        const svgY = ((clientY - rect.top) / rect.height) * height;
        let hitKey = null;
        for (const st of stacks) {
          const pt = st.points[nearestIdx];
          if (svgY >= yScale(pt.y1) && svgY <= yScale(pt.y0) && pt.val > 0) {
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
          if (e.touches[0]) updateScrubber(e.touches[0].clientX, e.touches[0].clientY);
        },
        { passive: true }
      );

      [...CONFIG.series].reverse().forEach((s) => {
        const btn = el(
          "button",
          { type: "button", className: "stream-legend-item" },
          el("span", { className: "stream-legend-swatch", style: { backgroundColor: s.color }, "aria-hidden": "true" }),
          el("span", null, s.label)
        );
        btn.addEventListener("mouseenter", () => applyHighlight(s.key));
        btn.addEventListener("mouseleave", () => applyHighlight(null));
        btn.addEventListener("focus", () => applyHighlight(s.key));
        btn.addEventListener("blur", () => applyHighlight(null));
        legend.appendChild(btn);
        legendItems.set(s.key, btn);
      });

      wrapper.append(svg, tooltip, legend);
      plotEl.replaceChildren(wrapper);

      if (captionEl) captionEl.textContent = CONFIG.captions[mode];
      if (statusEl) statusEl.textContent = `Showing streamgraph (${minYear}–${maxYear}) in ${mode} mode.`;
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
