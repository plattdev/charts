/**
 * Ozone Hole Recovery — Minimalist Proportional Areas Module:
 * Loads NASA Ozone Watch (GSFC) data (1979–2025) from ./data/ozone.json
 * (with automatic file:// fallback) and renders a clean, borderless SVG
 * of center-aligned proportional semicircles in Traditional Japanese
 * Natural Blues (Dentōshoku).
 */

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Fixed area ceiling (2006 peak = 26.6M km²) so presets share an unwavering physical scale
  const SCALE_MAX_AREA = 26.6;
  const ANTARCTICA_AREA = 14.2;
  const BASELINE_1979_AREA = 0.1;

  const VIEW_W = 920;
  const VIEW_H = 492;
  const CX = 460;
  const CY = 246;
  const R_MAX = 188;

  // Traditional Japanese Natural Blue Palette (Nippon no Dentōshoku)
  const PALETTE = {
    leftFill: "url(#ozone-left-grad)",     // Kon-iro (Deep Natural Indigo, #1D3557)
    leftStroke: "#162A47",
    rightFill: "url(#ozone-right-grad)",   // Asagi-iro / Hanada-iro (#2E6280)
    rightStroke: "#255068",
    baselineFill: "#D6E6EE",               // Kamenozoki (Pale Indigo Sky)
    baselineStroke: "#1D3557",
    refDark: "#1D3557",
    refLight: "#FFFFFF",
    seam: "#F4F6F8",                       // Matches page surface for a clean carved split
    ink: "#0F172A",
  };

  /** Exact square-root scaling: area A = 0.5 * pi * r^2  =>  r proportional to sqrt(A) */
  function areaToRadius(area) {
    if (!Number.isFinite(area) || area <= 0) return 0;
    return R_MAX * Math.sqrt(area / SCALE_MAX_AREA);
  }

  function svgEl(tag, attrs = {}, text = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, val] of Object.entries(attrs)) {
      if (val !== undefined && val !== null) {
        el.setAttribute(key, String(val));
      }
    }
    if (text !== null) {
      el.textContent = text;
    }
    return el;
  }

  function formatArea(val) {
    return `${val.toFixed(1)}M km²`;
  }

  function formatDU(val) {
    return `${val.toFixed(1)} DU`;
  }

  /** Fetch NASA Ozone Watch dataset (with local file:// fallback) */
  async function loadOzoneData() {
    try {
      const response = await fetch("./data/ozone.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      return new Promise((resolve, reject) => {
        if (window.__OZONE_FALLBACK__ && Array.isArray(window.__OZONE_FALLBACK__.records)) {
          resolve(window.__OZONE_FALLBACK__);
          return;
        }
        const script = document.createElement("script");
        script.src = "./data/ozone_fallback.js";
        script.onload = () => {
          if (window.__OZONE_FALLBACK__ && Array.isArray(window.__OZONE_FALLBACK__.records)) {
            resolve(window.__OZONE_FALLBACK__);
          } else {
            reject(err);
          }
        };
        script.onerror = () => reject(err);
        document.head.appendChild(script);
      });
    }
  }

  function averageRange(records, startYear, endYear) {
    const subset = records.filter((r) => r.year >= startYear && r.year <= endYear);
    if (subset.length === 0) return { area: 0, min_ozone: 0 };
    const areaSum = subset.reduce((acc, r) => acc + r.area, 0);
    const duSum = subset.reduce((acc, r) => acc + r.min_ozone, 0);
    return {
      area: areaSum / subset.length,
      min_ozone: duSum / subset.length,
    };
  }

  function resolveComparison(records, mode, customLeftYear, customRightYear) {
    const byYear = new Map(records.map((r) => [r.year, r]));

    if (mode === "peak-vs-2025") {
      const peak = byYear.get(2006);
      const latest = byYear.get(2025);
      return {
        left: { title: "2006", area: peak.area, minOzone: peak.min_ozone },
        right: { title: "2025", area: latest.area, minOzone: latest.min_ozone },
      };
    }

    if (mode === "peak-vs-5yr") {
      const peak = byYear.get(2006);
      const avg5 = averageRange(records, 2021, 2025);
      return {
        left: { title: "2006", area: peak.area, minOzone: peak.min_ozone },
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

    const leftRec = byYear.get(Number(customLeftYear)) || byYear.get(2006);
    const rightRec = byYear.get(Number(customRightYear)) || byYear.get(2025);
    return {
      left: { title: String(leftRec.year), area: leftRec.area, minOzone: leftRec.min_ozone },
      right: { title: String(rightRec.year), area: rightRec.area, minOzone: rightRec.min_ozone },
    };
  }

  function semicirclePath(side, r) {
    if (r <= 0.1) return "";
    const topY = (CY - r).toFixed(2);
    const botY = (CY + r).toFixed(2);
    const rStr = r.toFixed(2);
    const sweep = side === "left" ? 0 : 1;
    return `M ${CX} ${topY} A ${rStr} ${rStr} 0 0 ${sweep} ${CX} ${botY} Z`;
  }

  /** Render clean, unboxed proportional semicircles SVG */
  function renderOzoneSvg(containerEl, comparison) {
    const { left, right } = comparison;
    const rL = areaToRadius(left.area);
    const rR = areaToRadius(right.area);
    const rMaxActive = Math.max(rL, rR);
    const rAntarctica = areaToRadius(ANTARCTICA_AREA);
    const rBase = areaToRadius(BASELINE_1979_AREA);

    const areaDelta = right.area - left.area;
    const pctDelta = left.area > 0 ? (areaDelta / left.area) * 100 : 0;
    const sign = areaDelta > 0 ? "+" : areaDelta < 0 ? "−" : "";
    const absDelta = Math.abs(areaDelta);
    const absPct = Math.abs(pctDelta);

    const svg = svgEl("svg", {
      class: "ozone-svg",
      viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
      role: "img",
      "aria-label": `Proportional area comparison of the Antarctic ozone hole: ${left.title} (${formatArea(left.area)}) on the left versus ${right.title} (${formatArea(right.area)}) on the right, a ${sign}${absPct.toFixed(1)}% area change.`,
    });

    const defs = svgEl("defs");

    const leftGrad = svgEl("radialGradient", {
      id: "ozone-left-grad",
      cx: "65%",
      cy: "45%",
      r: "75%",
    });
    leftGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#26466D" }));
    leftGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#1D3557" }));
    defs.appendChild(leftGrad);

    const rightGrad = svgEl("radialGradient", {
      id: "ozone-right-grad",
      cx: "35%",
      cy: "45%",
      r: "75%",
    });
    rightGrad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#3F7F99" }));
    rightGrad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#2E6280" }));
    defs.appendChild(rightGrad);

    const clipHalves = svgEl("clipPath", { id: "ozone-halves-clip" });
    if (rL > 0) clipHalves.appendChild(svgEl("path", { d: semicirclePath("left", rL) }));
    if (rR > 0) clipHalves.appendChild(svgEl("path", { d: semicirclePath("right", rR) }));
    defs.appendChild(clipHalves);

    svg.appendChild(defs);

    // 1. Antarctica reference ring (exterior pass — subtle dark indigo outside semicircles)
    svg.appendChild(
      svgEl("circle", {
        cx: CX,
        cy: CY,
        r: rAntarctica.toFixed(2),
        fill: "none",
        stroke: PALETTE.refDark,
        "stroke-width": "1.4",
        "stroke-dasharray": "5 5",
        opacity: "0.55",
      })
    );

    // 2. Left Semicircle (Before — Kon-iro Deep Indigo)
    const leftPath = svgEl("path", {
      class: "ozone-half ozone-half--left",
      d: semicirclePath("left", rL),
      fill: PALETTE.leftFill,
      stroke: PALETTE.leftStroke,
      "stroke-width": "1",
      tabindex: "0",
      role: "graphics-symbol",
      "aria-label": `${left.title}: ${formatArea(left.area)}, minimum ozone ${formatDU(left.minOzone)}`,
    });
    leftPath.appendChild(
      svgEl(
        "title",
        {},
        `${left.title}\nOzone Hole Area: ${formatArea(left.area)}\nMinimum Ozone: ${formatDU(left.minOzone)}`
      )
    );
    svg.appendChild(leftPath);

    // 3. Right Semicircle (Now — Asagi-iro Mineral Blue)
    const rightPath = svgEl("path", {
      class: "ozone-half ozone-half--right",
      d: semicirclePath("right", rR),
      fill: PALETTE.rightFill,
      stroke: PALETTE.rightStroke,
      "stroke-width": "1",
      tabindex: "0",
      role: "graphics-symbol",
      "aria-label": `${right.title}: ${formatArea(right.area)}, minimum ozone ${formatDU(right.minOzone)}`,
    });
    rightPath.appendChild(
      svgEl(
        "title",
        {},
        `${right.title}\nOzone Hole Area: ${formatArea(right.area)}\nMinimum Ozone: ${formatDU(right.minOzone)}`
      )
    );
    svg.appendChild(rightPath);

    // Clean vertical seam matching the page surface
    svg.appendChild(
      svgEl("line", {
        x1: CX,
        y1: (CY - rMaxActive - 1).toFixed(2),
        x2: CX,
        y2: (CY + rMaxActive + 1).toFixed(2),
        stroke: PALETTE.seam,
        "stroke-width": "2.5",
        "pointer-events": "none",
      })
    );

    // 4. Antarctica reference ring (interior pass — crisp white dashed line clipped to blues)
    svg.appendChild(
      svgEl("circle", {
        cx: CX,
        cy: CY,
        r: rAntarctica.toFixed(2),
        fill: "none",
        stroke: PALETTE.refLight,
        "stroke-width": "1.5",
        "stroke-dasharray": "5 5",
        opacity: "0.85",
        "clip-path": "url(#ozone-halves-clip)",
        "pointer-events": "none",
      })
    );

    // 5. 1979 pre-hole baseline center dot (0.1M km²)
    const baseDot = svgEl("circle", {
      cx: CX,
      cy: CY,
      r: rBase.toFixed(2),
      fill: PALETTE.baselineFill,
      stroke: PALETTE.baselineStroke,
      "stroke-width": "1.4",
      "stroke-dasharray": "2.5 2",
      class: "ozone-baseline-dot",
    });
    baseDot.appendChild(
      svgEl("title", {}, "1979 pre-hole baseline: 0.1M km² (225.0 DU)")
    );
    svg.appendChild(baseDot);

    // 6. Single clean top step callout showing the exact edge drop/rise
    if (Math.abs(rL - rR) >= 3) {
      const tallerSide = rL >= rR ? "left" : "right";
      const yOuter = CY - Math.max(rL, rR);
      const yInner = CY - Math.min(rL, rR);
      const yMid = (yOuter + yInner) / 2;
      const dir = tallerSide === "left" ? 1 : -1;
      const tickX = CX + dir * 10;
      const labelX = CX + dir * 24;

      svg.appendChild(
        svgEl("path", {
          d: `M ${(CX + dir * 2).toFixed(1)} ${yOuter.toFixed(1)} H ${tickX.toFixed(1)} V ${yInner.toFixed(1)} H ${(CX + dir * 2).toFixed(1)}`,
          fill: "none",
          stroke: PALETTE.ink,
          "stroke-width": "1.5",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })
      );

      const arrow = areaDelta < 0 ? "↓" : "↑";
      svg.appendChild(
        svgEl(
          "text",
          {
            x: labelX.toFixed(1),
            y: (yMid + 5).toFixed(1),
            "text-anchor": dir > 0 ? "start" : "end",
            class: "ozone-svg-step-label",
          },
          `${arrow} ${sign}${absPct.toFixed(1)}% (${sign}${absDelta.toFixed(1)}M km²)`
        )
      );
    }

    // 7. Clean, unboxed exterior typography flanking each semicircle
    const leftX = CX - R_MAX - 42;
    const rightX = CX + R_MAX + 42;

    svg.appendChild(
      svgEl("text", { x: leftX, y: CY - 14, "text-anchor": "end", class: "ozone-svg-period" }, left.title)
    );
    svg.appendChild(
      svgEl("text", { x: leftX, y: CY + 18, "text-anchor": "end", class: "ozone-svg-area ozone-svg-area--left" }, formatArea(left.area))
    );
    svg.appendChild(
      svgEl("text", { x: leftX, y: CY + 40, "text-anchor": "end", class: "ozone-svg-du" }, `${formatDU(left.minOzone)} min. ozone`)
    );

    svg.appendChild(
      svgEl("text", { x: rightX, y: CY - 14, "text-anchor": "start", class: "ozone-svg-period" }, right.title)
    );
    svg.appendChild(
      svgEl("text", { x: rightX, y: CY + 18, "text-anchor": "start", class: "ozone-svg-area ozone-svg-area--right" }, formatArea(right.area))
    );
    svg.appendChild(
      svgEl("text", { x: rightX, y: CY + 40, "text-anchor": "start", class: "ozone-svg-du" }, `${formatDU(right.minOzone)} min. ozone`)
    );

    // 8. Quiet inline legend at bottom (zero crossing leader lines)
    const legendY = VIEW_H - 18;
    const legendGroup = svgEl("g", { class: "ozone-svg-legend" });

    // Antarctica dashed swatch
    legendGroup.appendChild(
      svgEl("circle", {
        cx: CX - 196,
        cy: legendY - 4,
        r: "6.5",
        fill: "none",
        stroke: PALETTE.refDark,
        "stroke-width": "1.5",
        "stroke-dasharray": "3 2.5",
      })
    );
    legendGroup.appendChild(
      svgEl(
        "text",
        { x: CX - 182, y: legendY, "text-anchor": "start", class: "ozone-svg-legend-text" },
        "Antarctica scale (14.2M km²)"
      )
    );

    // 1979 baseline dot swatch
    legendGroup.appendChild(
      svgEl("circle", {
        cx: CX + 34,
        cy: legendY - 4,
        r: "5.5",
        fill: PALETTE.baselineFill,
        stroke: PALETTE.baselineStroke,
        "stroke-width": "1.3",
        "stroke-dasharray": "2 1.5",
      })
    );
    legendGroup.appendChild(
      svgEl(
        "text",
        { x: CX + 48, y: legendY, "text-anchor": "start", class: "ozone-svg-legend-text" },
        "1979 pre-hole baseline (0.1M km²)"
      )
    );

    svg.appendChild(legendGroup);

    containerEl.replaceChildren(svg);
  }

  /** Populate semantic accessible HTML table (newest year first) */
  function renderOzoneTable(tbodyEl, records) {
    if (!tbodyEl) return;
    const fragment = document.createDocumentFragment();
    const sortedDesc = [...records].sort((a, b) => b.year - a.year);

    for (const r of sortedDesc) {
      const tr = document.createElement("tr");

      const thYear = document.createElement("th");
      thYear.scope = "row";
      thYear.textContent = String(r.year);
      tr.appendChild(thYear);

      const tdArea = document.createElement("td");
      tdArea.textContent = r.area.toFixed(1);
      tr.appendChild(tdArea);

      const tdDu = document.createElement("td");
      tdDu.textContent = r.min_ozone.toFixed(1);
      tr.appendChild(tdDu);

      const tdPeakPct = document.createElement("td");
      tdPeakPct.textContent = `${((r.area / SCALE_MAX_AREA) * 100).toFixed(1)}%`;
      tr.appendChild(tdPeakPct);

      fragment.appendChild(tr);
    }

    tbodyEl.replaceChildren(fragment);
  }

  function populateYearSelects(leftSelect, rightSelect, records) {
    if (!leftSelect || !rightSelect) return;
    const sortedDesc = [...records].sort((a, b) => b.year - a.year);

    const buildOptions = (selectedYear) => {
      const frag = document.createDocumentFragment();
      for (const r of sortedDesc) {
        const opt = document.createElement("option");
        opt.value = String(r.year);
        opt.textContent = `${r.year} (${r.area.toFixed(1)}M km²)`;
        if (r.year === selectedYear) opt.selected = true;
        frag.appendChild(opt);
      }
      return frag;
    };

    leftSelect.replaceChildren(buildOptions(2006));
    rightSelect.replaceChildren(buildOptions(2025));
  }

  async function initOzoneChart() {
    const plotEl = document.getElementById("ozone-plot");
    if (!plotEl) return;

    const captionEl = document.getElementById("ozone-caption");
    const statusEl = document.getElementById("ozone-status");
    const tableBodyEl = document.getElementById("ozone-table-body");
    const modeInputs = document.querySelectorAll('input[name="ozone-mode"]');
    const customWrapEl = document.getElementById("ozone-custom-years");
    const leftSelect = document.getElementById("ozone-left-year");
    const rightSelect = document.getElementById("ozone-right-year");

    const dataset = await loadOzoneData();
    const { records } = dataset;

    populateYearSelects(leftSelect, rightSelect, records);
    renderOzoneTable(tableBodyEl, records);

    let currentMode = "peak-vs-2025";

    function updateView(announce = false) {
      if (customWrapEl) {
        customWrapEl.hidden = currentMode !== "custom";
      }

      const comparison = resolveComparison(
        records,
        currentMode,
        leftSelect ? leftSelect.value : 2006,
        rightSelect ? rightSelect.value : 2025
      );

      renderOzoneSvg(plotEl, comparison);

      const delta = comparison.right.area - comparison.left.area;
      const pct = comparison.left.area > 0 ? (delta / comparison.left.area) * 100 : 0;

      if (captionEl) {
        captionEl.textContent = `Center-aligned semicircles scaled strictly by area (r ∝ √area) comparing ${comparison.left.title} (${formatArea(comparison.left.area)}) against ${comparison.right.title} (${formatArea(comparison.right.area)}). Dashed ring: Antarctica (14.2M km²). Center dot: 1979 pre-hole baseline (0.1M km²).`;
      }

      if (announce && statusEl) {
        statusEl.textContent = `Showing ${comparison.left.title} (${formatArea(comparison.left.area)}) versus ${comparison.right.title} (${formatArea(comparison.right.area)}), a ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% area difference.`;
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

    if (leftSelect) {
      leftSelect.addEventListener("change", () => updateView(true));
    }
    if (rightSelect) {
      rightSelect.addEventListener("change", () => updateView(true));
    }
  }

  document.addEventListener("DOMContentLoaded", initOzoneChart);
})();
