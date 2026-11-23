/**
 * ============================================================================
 * TEMPLATE 4 — Center-Aligned Area-Proportional Semicircles (SVG)
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export JSON following this schema:
 *        {
 *          "records": [
 *            { "year": 1979, "area": 0.1, "min_ozone": 225.0 },
 *            { "year": 2006, "area": 26.6, "min_ozone": 97.4 },
 *            { "year": 2025, "area": 18.7, "min_ozone": 152.1 }
 *          ]
 *        }
 *   2. Update CONFIG below (data paths, max area ceiling, reference benchmarks,
 *      preset comparisons, and unit labels).
 *   3. Copy <section id="ozone"> from index.html.
 * ============================================================================
 */

(() => {
  "use strict";

  const {
    PALETTES,
    el,
    svgEl,
    loadJson,
    renderError,
    renderTableRows,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/ozone.json",
      fallbackUrl: "./data/ozone_fallback.js",
      fallbackKey: "__OZONE_FALLBACK__",
      validate: (d) => Boolean(d && Array.isArray(d.records) && d.records.length > 0),
    },
    ids: {
      plot: "ozone-plot",
      caption: "ozone-caption",
      status: "ozone-status",
      tableBody: "ozone-table-body",
      customWrap: "ozone-custom-years",
      leftSelect: "ozone-left-year",
      rightSelect: "ozone-right-year",
      modeRadioName: "ozone-mode",
    },
    scale: {
      maxArea: 26.6,         // Fixed ceiling so presets share one physical scale
      referenceArea: 14.2,   // Dashed reference ring (Antarctica)
      referenceLabel: "Antarctica scale (14.2M km²)",
      baselineArea: 0.1,     // Center reference dot (1979 pre-hole baseline)
      baselineLabel: "1979 pre-hole baseline (0.1M km²)",
      defaultLeftYear: 2006,
      defaultRightYear: 2025,
    },
    layout: {
      viewWidth: 920,
      viewHeight: 492,
      cx: 460,
      cy: 246,
      rMax: 188,
    },
    palette: {
      leftGrad: ["#26466D", PALETTES.japaneseBlue.deepIndigo],
      leftStroke: "#162A47",
      rightGrad: ["#3F7F99", PALETTES.japaneseBlue.mineralBlue],
      rightStroke: "#255068",
      baselineFill: PALETTES.japaneseBlue.paleSky,
      baselineStroke: PALETTES.japaneseBlue.deepIndigo,
      refDark: PALETTES.japaneseBlue.deepIndigo,
      refLight: "#FFFFFF",
      seam: "#F4F6F8",
      ink: "#0F172A",
    },
    formatArea: (val) => `${val.toFixed(1)}M km²`,
    formatSecondary: (val) => `${val.toFixed(1)} DU`,
  };

  /** Exact square-root scaling: A = 0.5 * pi * r^2 => r proportional to sqrt(A). */
  function areaToRadius(area) {
    if (!Number.isFinite(area) || area <= 0) return 0;
    return CONFIG.layout.rMax * Math.sqrt(area / CONFIG.scale.maxArea);
  }

  function averageRange(records, startYear, endYear) {
    const subset = records.filter((r) => r.year >= startYear && r.year <= endYear);
    if (subset.length === 0) return { area: 0, min_ozone: 0 };
    return {
      area: subset.reduce((acc, r) => acc + r.area, 0) / subset.length,
      min_ozone: subset.reduce((acc, r) => acc + r.min_ozone, 0) / subset.length,
    };
  }

  function resolveComparison(records, mode, customLeftYear, customRightYear) {
    const byYear = new Map(records.map((r) => [r.year, r]));
    const { defaultLeftYear, defaultRightYear } = CONFIG.scale;

    if (mode === "peak-vs-2025") {
      const left = byYear.get(defaultLeftYear);
      const right = byYear.get(defaultRightYear);
      return {
        left: { title: String(defaultLeftYear), area: left.area, minOzone: left.min_ozone },
        right: { title: String(defaultRightYear), area: right.area, minOzone: right.min_ozone },
      };
    }

    if (mode === "peak-vs-5yr") {
      const left = byYear.get(defaultLeftYear);
      const avg5 = averageRange(records, 2021, 2025);
      return {
        left: { title: String(defaultLeftYear), area: left.area, minOzone: left.min_ozone },
        right: { title: "2021–2025", area: avg5.area, minOzone: avg5.min_ozone },
      };
    }

    if (mode === "decades") {
      const avg2000s = averageRange(records, 2000, 2009);
      const avgRecent = averageRange(records, 2016, 2025);
      return {
        left: { title: "2000–2009", area: avg2000s.area, minOzone: avg2000s.min_ozone },
        right: { title: "2016–2025", area: avgRecent.area, minOzone: avgRecent.min_ozone },
      };
    }

    const leftRec = byYear.get(Number(customLeftYear)) || byYear.get(defaultLeftYear);
    const rightRec = byYear.get(Number(customRightYear)) || byYear.get(defaultRightYear);
    return {
      left: { title: String(leftRec.year), area: leftRec.area, minOzone: leftRec.min_ozone },
      right: { title: String(rightRec.year), area: rightRec.area, minOzone: rightRec.min_ozone },
    };
  }

  function semicirclePath(side, r) {
    if (r <= 0.1) return "";
    const { cx, cy } = CONFIG.layout;
    const sweep = side === "left" ? 0 : 1;
    return `M ${cx} ${(cy - r).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${cx} ${(cy + r).toFixed(2)} Z`;
  }

  function renderOzoneSvg(containerEl, comparison) {
    const { left, right } = comparison;
    const { viewWidth, viewHeight, cx, cy, rMax } = CONFIG.layout;
    const { palette, scale, formatArea, formatSecondary } = CONFIG;

    const rL = areaToRadius(left.area);
    const rR = areaToRadius(right.area);
    const rMaxActive = Math.max(rL, rR);
    const rRef = areaToRadius(scale.referenceArea);
    const rBase = areaToRadius(scale.baselineArea);

    const areaDelta = right.area - left.area;
    const pctDelta = left.area > 0 ? (areaDelta / left.area) * 100 : 0;
    const sign = areaDelta > 0 ? "+" : areaDelta < 0 ? "−" : "";
    const absDelta = Math.abs(areaDelta);
    const absPct = Math.abs(pctDelta);

    const svg = svgEl("svg", {
      class: "ozone-svg",
      viewBox: `0 0 ${viewWidth} ${viewHeight}`,
      role: "img",
      "aria-label": `Proportional area comparison: ${left.title} (${formatArea(left.area)}) on the left versus ${right.title} (${formatArea(right.area)}) on the right, a ${sign}${absPct.toFixed(1)}% area change.`,
    });

    const defs = svgEl("defs");

    const leftGrad = svgEl("radialGradient", { id: "ozone-left-grad", cx: "65%", cy: "45%", r: "75%" });
    leftGrad.append(
      svgEl("stop", { offset: "0%", "stop-color": palette.leftGrad[0] }),
      svgEl("stop", { offset: "100%", "stop-color": palette.leftGrad[1] })
    );

    const rightGrad = svgEl("radialGradient", { id: "ozone-right-grad", cx: "35%", cy: "45%", r: "75%" });
    rightGrad.append(
      svgEl("stop", { offset: "0%", "stop-color": palette.rightGrad[0] }),
      svgEl("stop", { offset: "100%", "stop-color": palette.rightGrad[1] })
    );

    const clipHalves = svgEl("clipPath", { id: "ozone-halves-clip" });
    if (rL > 0) clipHalves.appendChild(svgEl("path", { d: semicirclePath("left", rL) }));
    if (rR > 0) clipHalves.appendChild(svgEl("path", { d: semicirclePath("right", rR) }));

    defs.append(leftGrad, rightGrad, clipHalves);
    svg.appendChild(defs);

    // Reference ring exterior pass
    svg.appendChild(
      svgEl("circle", {
        cx,
        cy,
        r: rRef.toFixed(2),
        fill: "none",
        stroke: palette.refDark,
        "stroke-width": "1.4",
        "stroke-dasharray": "5 5",
        opacity: "0.55",
      })
    );

    // Left & right proportional semicircles
    const leftPath = svgEl("path", {
      class: "ozone-half ozone-half--left",
      d: semicirclePath("left", rL),
      fill: "url(#ozone-left-grad)",
      stroke: palette.leftStroke,
      "stroke-width": "1",
      tabindex: "0",
      role: "graphics-symbol",
      "aria-label": `${left.title}: ${formatArea(left.area)}, minimum ozone ${formatSecondary(left.minOzone)}`,
    });
    const rightPath = svgEl("path", {
      class: "ozone-half ozone-half--right",
      d: semicirclePath("right", rR),
      fill: "url(#ozone-right-grad)",
      stroke: palette.rightStroke,
      "stroke-width": "1",
      tabindex: "0",
      role: "graphics-symbol",
      "aria-label": `${right.title}: ${formatArea(right.area)}, minimum ozone ${formatSecondary(right.minOzone)}`,
    });

    svg.append(
      leftPath,
      rightPath,
      svgEl("line", {
        x1: cx,
        y1: (cy - rMaxActive - 1).toFixed(2),
        x2: cx,
        y2: (cy + rMaxActive + 1).toFixed(2),
        stroke: palette.seam,
        "stroke-width": "2.5",
        "pointer-events": "none",
      }),
      svgEl("circle", {
        cx,
        cy,
        r: rRef.toFixed(2),
        fill: "none",
        stroke: palette.refLight,
        "stroke-width": "1.5",
        "stroke-dasharray": "5 5",
        opacity: "0.85",
        "clip-path": "url(#ozone-halves-clip)",
        "pointer-events": "none",
      }),
      svgEl("circle", {
        cx,
        cy,
        r: rBase.toFixed(2),
        fill: palette.baselineFill,
        stroke: palette.baselineStroke,
        "stroke-width": "1.4",
        "stroke-dasharray": "2.5 2",
      })
    );

    // Step delta callout
    if (Math.abs(rL - rR) >= 3) {
      const yOuter = cy - Math.max(rL, rR);
      const yInner = cy - Math.min(rL, rR);
      const yMid = (yOuter + yInner) / 2;
      const dir = rL >= rR ? 1 : -1;
      const tickX = cx + dir * 10;
      const labelX = cx + dir * 24;

      svg.append(
        svgEl("path", {
          d: `M ${(cx + dir * 2).toFixed(1)} ${yOuter.toFixed(1)} H ${tickX.toFixed(1)} V ${yInner.toFixed(1)} H ${(cx + dir * 2).toFixed(1)}`,
          fill: "none",
          stroke: palette.ink,
          "stroke-width": "1.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
        svgEl(
          "text",
          {
            x: labelX.toFixed(1),
            y: (yMid + 5).toFixed(1),
            "text-anchor": dir > 0 ? "start" : "end",
            class: "ozone-svg-step-label",
          },
          `${areaDelta < 0 ? "↓" : "↑"} ${sign}${absPct.toFixed(1)}% (${sign}${absDelta.toFixed(1)}M km²)`
        )
      );
    }

    // Flanking typography
    const leftX = cx - rMax - 42;
    const rightX = cx + rMax + 42;
    svg.append(
      svgEl("text", { x: leftX, y: cy - 14, "text-anchor": "end", class: "ozone-svg-period" }, left.title),
      svgEl("text", { x: leftX, y: cy + 18, "text-anchor": "end", class: "ozone-svg-area ozone-svg-area--left" }, formatArea(left.area)),
      svgEl("text", { x: leftX, y: cy + 40, "text-anchor": "end", class: "ozone-svg-du" }, `${formatSecondary(left.minOzone)} min. ozone`),
      svgEl("text", { x: rightX, y: cy - 14, "text-anchor": "start", class: "ozone-svg-period" }, right.title),
      svgEl("text", { x: rightX, y: cy + 18, "text-anchor": "start", class: "ozone-svg-area ozone-svg-area--right" }, formatArea(right.area)),
      svgEl("text", { x: rightX, y: cy + 40, "text-anchor": "start", class: "ozone-svg-du" }, `${formatSecondary(right.minOzone)} min. ozone`)
    );

    // Bottom inline legend
    const legendY = viewHeight - 18;
    const legendGroup = svgEl("g");
    legendGroup.append(
      svgEl("circle", { cx: cx - 196, cy: legendY - 4, r: "6.5", fill: "none", stroke: palette.refDark, "stroke-width": "1.5", "stroke-dasharray": "3 2.5" }),
      svgEl("text", { x: cx - 182, y: legendY, "text-anchor": "start", class: "ozone-svg-legend-text" }, scale.referenceLabel),
      svgEl("circle", { cx: cx + 34, cy: legendY - 4, r: "5.5", fill: palette.baselineFill, stroke: palette.baselineStroke, "stroke-width": "1.3", "stroke-dasharray": "2 1.5" }),
      svgEl("text", { x: cx + 48, y: legendY, "text-anchor": "start", class: "ozone-svg-legend-text" }, scale.baselineLabel)
    );
    svg.appendChild(legendGroup);

    containerEl.replaceChildren(svg);
  }

  function populateYearSelects(leftSelect, rightSelect, records) {
    if (!leftSelect || !rightSelect) return;
    const sortedDesc = [...records].sort((a, b) => b.year - a.year);
    const buildOptions = (selectedYear) => {
      const frag = document.createDocumentFragment();
      for (const r of sortedDesc) {
        frag.appendChild(
          el("option", { value: r.year, selected: r.year === selectedYear }, `${r.year} (${CONFIG.formatArea(r.area)})`)
        );
      }
      return frag;
    };
    leftSelect.replaceChildren(buildOptions(CONFIG.scale.defaultLeftYear));
    rightSelect.replaceChildren(buildOptions(CONFIG.scale.defaultRightYear));
  }

  async function initOzoneChart() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const captionEl = document.getElementById(CONFIG.ids.caption);
    const statusEl = document.getElementById(CONFIG.ids.status);
    const tableBodyEl = document.getElementById(CONFIG.ids.tableBody);
    const modeInputs = document.querySelectorAll(`input[name="${CONFIG.ids.modeRadioName}"]`);
    const customWrapEl = document.getElementById(CONFIG.ids.customWrap);
    const leftSelect = document.getElementById(CONFIG.ids.leftSelect);
    const rightSelect = document.getElementById(CONFIG.ids.rightSelect);

    let dataset;
    try {
      dataset = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load proportional areas dataset. Please check", CONFIG.data.url);
      console.error("Ozone load error:", err);
      return;
    }

    const { records } = dataset;
    populateYearSelects(leftSelect, rightSelect, records);

    renderTableRows(
      tableBodyEl,
      [...records]
        .sort((a, b) => b.year - a.year)
        .map((r) => [
          r.year,
          r.area.toFixed(1),
          r.min_ozone.toFixed(1),
          `${((r.area / CONFIG.scale.maxArea) * 100).toFixed(1)}%`,
        ])
    );

    let currentMode = "peak-vs-2025";

    function updateView(announce = false) {
      if (customWrapEl) customWrapEl.hidden = currentMode !== "custom";

      const comparison = resolveComparison(
        records,
        currentMode,
        leftSelect?.value ?? CONFIG.scale.defaultLeftYear,
        rightSelect?.value ?? CONFIG.scale.defaultRightYear
      );

      renderOzoneSvg(plotEl, comparison);

      const delta = comparison.right.area - comparison.left.area;
      const pct = comparison.left.area > 0 ? (delta / comparison.left.area) * 100 : 0;

      if (captionEl) {
        captionEl.textContent = `Center-aligned semicircles scaled strictly by area (r ∝ √area) comparing ${comparison.left.title} (${CONFIG.formatArea(comparison.left.area)}) against ${comparison.right.title} (${CONFIG.formatArea(comparison.right.area)}). Dashed ring: ${CONFIG.scale.referenceLabel}. Center dot: ${CONFIG.scale.baselineLabel}.`;
      }
      if (announce && statusEl) {
        statusEl.textContent = `Showing ${comparison.left.title} (${CONFIG.formatArea(comparison.left.area)}) versus ${comparison.right.title} (${CONFIG.formatArea(comparison.right.area)}), a ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% area difference.`;
      }
    }

    updateView(false);

    modeInputs.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          currentMode = e.target.value;
          updateView(true);
        }
      });
    });

    leftSelect?.addEventListener("change", () => updateView(true));
    rightSelect?.addEventListener("change", () => updateView(true));
  }

  document.addEventListener("DOMContentLoaded", initOzoneChart);
})();
