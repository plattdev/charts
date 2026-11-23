/**
 * ============================================================================
 * TEMPLATE 5 — Multi-Scenario 10x10 SVG Waffle Chart
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export JSON with this schema:
 *        {
 *          "hazards": [
 *            {
 *              "id": "extreme_heat",
 *              "label": "Extreme Heat Days",
 *              "category": "Heat",
 *              "threshold_label": ">= 60 days/yr above local 95th percentile",
 *              "scenarios": {
 *                "1.5C": { "pct": 6.0, "cells": 6, "cities": 60, "valid_cities": 996, "pop_millions": 140 },
 *                "2.0C": { "pct": 14.9, "cells": 15, "cities": 148, "valid_cities": 996, "pop_millions": 340 },
 *                "3.0C": { "pct": 45.4, "cells": 45, "cities": 452, "valid_cities": 996, "pop_millions": 1020 }
 *              }
 *            }
 *          ]
 *        }
 *   2. Update CONFIG below (data paths, scenario keys/labels, colors, and unit text).
 *   3. Copy <section id="waffle"> from index.html.
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
    formatExact,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/hazards.json",
      fallbackUrl: "./data/hazards_fallback.js",
      fallbackKey: "__HAZARDS_FALLBACK__",
      validate: (d) => Boolean(d && Array.isArray(d.hazards) && d.hazards.length > 0),
    },
    ids: {
      plot: "waffle-plot",
      select: "waffle-hazard-select",
      thresholdNote: "waffle-threshold-note",
      caption: "waffle-caption",
      status: "waffle-status",
      tableBody: "waffle-table-body",
    },
    grid: {
      cols: 10,
      rows: 10,
      cellSize: 18,
      gap: 4,
      emptyColor: "#E2E8F0",
    },
    /** Colorblind-safe sequential warm ramp (distinct hue + luminance steps) */
    scenarios: [
      { key: "1.5C", label: "+1.5°C", color: PALETTES.warmSequential[0], textColor: "#B45309" },
      { key: "2.0C", label: "+2.0°C", color: PALETTES.warmSequential[1], textColor: "#C2410C" },
      { key: "3.0C", label: "+3.0°C", color: PALETTES.warmSequential[2], textColor: "#9E2A2B" },
    ],
  };

  function formatPopulation(millions) {
    if (millions >= 1000) {
      return `${(millions / 1000).toFixed(2)}B people`;
    }
    return `${formatExact(millions)}M people`;
  }

  /** Build a crisp 10x10 SVG waffle grid filled bottom-to-top, left-to-right. */
  function buildWaffleSvg(filledCells, fillColor, ariaLabel) {
    const { cols, rows, cellSize, gap, emptyColor } = CONFIG.grid;
    const totalSize = cols * cellSize + (cols - 1) * gap;

    const svg = svgEl("svg", {
      viewBox: `0 0 ${totalSize} ${totalSize}`,
      class: "waffle-svg",
      role: "img",
      "aria-label": ariaLabel,
    });

    let index = 0;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        index += 1;
        const isFilled = index <= filledCells;
        svg.appendChild(
          svgEl("rect", {
            x: c * (cellSize + gap),
            y: r * (cellSize + gap),
            width: cellSize,
            height: cellSize,
            fill: isFilled ? fillColor : emptyColor,
            class: "waffle-cell",
          })
        );
      }
    }

    return svg;
  }

  async function initWaffle() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const selectEl = document.getElementById(CONFIG.ids.select);
    const thresholdNoteEl = document.getElementById(CONFIG.ids.thresholdNote);
    const captionEl = document.getElementById(CONFIG.ids.caption);
    const statusEl = document.getElementById(CONFIG.ids.status);
    const tbodyEl = document.getElementById(CONFIG.ids.tableBody);

    let dataset;
    try {
      dataset = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load waffle chart dataset. Please check", CONFIG.data.url);
      console.error("Waffle load error:", err);
      return;
    }

    const { hazards } = dataset;
    const [firstSc, midSc, lastSc] = CONFIG.scenarios;

    if (selectEl) {
      const frag = document.createDocumentFragment();
      for (const h of hazards) {
        frag.appendChild(el("option", { value: h.id }, `${h.label} (${h.category})`));
      }
      selectEl.replaceChildren(frag);
      selectEl.value = hazards[0].id;
    }

    renderTableRows(
      tbodyEl,
      hazards.map((h) => {
        const s1 = h.scenarios[firstSc.key];
        const s2 = h.scenarios[midSc.key];
        const s3 = h.scenarios[lastSc.key];
        const delta = s3.pct - s1.pct;
        return [
          h.label,
          h.threshold_label,
          `${s1.pct.toFixed(1)}% (${s1.cities})`,
          `${s2.pct.toFixed(1)}% (${s2.cities})`,
          `${s3.pct.toFixed(1)}% (${s3.cities})`,
          `${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`,
        ];
      })
    );

    function renderHazard(hazardId) {
      const hazard = hazards.find((h) => h.id === hazardId) || hazards[0];
      const s1 = hazard.scenarios[firstSc.key];
      const s2 = hazard.scenarios[midSc.key];
      const s3 = hazard.scenarios[lastSc.key];

      if (thresholdNoteEl) {
        thresholdNoteEl.textContent = `Extreme threshold: ${hazard.threshold_label}`;
      }

      const row = el("div", { className: "waffle-row" });

      CONFIG.scenarios.forEach((meta, idx) => {
        const sc = hazard.scenarios[meta.key];
        const ariaLabel = `${meta.label} global warming: ${sc.pct.toFixed(1)}% (${sc.cities} of ${sc.valid_cities} major cities, ${formatPopulation(sc.pop_millions)}) exceed ${hazard.threshold_label}.`;

        const panel = el(
          "div",
          { className: "waffle-panel" },
          el(
            "div",
            { className: "waffle-panel-header" },
            el("div", { className: "waffle-scenario-tag" }, `${meta.label} warming`),
            el("div", { className: "waffle-pct", style: { color: meta.textColor } }, `${sc.cells}%`),
            el("div", { className: "waffle-detail" }, `${sc.cities} of ${sc.valid_cities} cities · ${formatPopulation(sc.pop_millions)}`)
          ),
          buildWaffleSvg(sc.cells, meta.color, ariaLabel)
        );
        row.appendChild(panel);

        if (idx < CONFIG.scenarios.length - 1) {
          row.appendChild(el("div", { className: "waffle-arrow", "aria-hidden": "true" }, "→"));
        }
      });

      const deltaPp = s3.pct - s1.pct;
      const deltaSign = deltaPp > 0 ? "+" : "";

      const footer = el(
        "div",
        { className: "waffle-legend" },
        el(
          "span",
          { className: "waffle-legend-item" },
          el("span", { className: "waffle-swatch", style: { backgroundColor: midSc.color }, "aria-hidden": "true" }),
          "1 square = 1% of cities exceeding threshold"
        ),
        el(
          "span",
          { className: "waffle-legend-item" },
          el("span", { className: "waffle-swatch", style: { backgroundColor: CONFIG.grid.emptyColor }, "aria-hidden": "true" }),
          "Below threshold"
        ),
        el(
          "span",
          { className: "waffle-legend-delta" },
          `${firstSc.label} → ${lastSc.label}: `,
          el("strong", null, `${deltaSign}${deltaPp.toFixed(1)} pp`),
          ` (${s1.cities} → ${s3.cities} cities)`
        )
      );

      plotEl.replaceChildren(row, footer);

      if (captionEl) {
        captionEl.textContent = `${hazard.label} (${hazard.threshold_label}): rises from ${s1.pct.toFixed(1)}% of major cities at ${firstSc.label} (${s1.cities} cities) to ${s2.pct.toFixed(1)}% at ${midSc.label} (${s2.cities} cities) and ${s3.pct.toFixed(1)}% at ${lastSc.label} (${s3.cities} cities).`;
      }
      if (statusEl) {
        statusEl.textContent = `Updated waffle chart to ${hazard.label}: ${s1.cells}% at ${firstSc.label}, ${s2.cells}% at ${midSc.label}, and ${s3.cells}% at ${lastSc.label}.`;
      }
    }

    renderHazard(hazards[0].id);
    selectEl?.addEventListener("change", (e) => renderHazard(e.target.value));
  }

  document.addEventListener("DOMContentLoaded", initWaffle);
})();
