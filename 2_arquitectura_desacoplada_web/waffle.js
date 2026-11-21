/**
 * Waffle Chart Module:
 * Loads World Resources Institute (WRI) City-Scale Climate Hazard Indicators
 * (996 cities >500k residents across +1.5°C, +2.0°C, and +3.0°C warming)
 * from ./data/hazards.json (with automatic file:// fallback) and renders
 * 3 side-by-side 10 × 10 SVG waffle grids (1 square = 1% of major cities
 * exceeding each extreme risk threshold).
 */

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  /** Colorblind-safe sequential warm ramp (distinct hue + luminance steps) */
  const SCENARIO_META = [
    {
      key: "1.5C",
      label: "+1.5°C",
      sublabel: "Paris target",
      color: "#E69F00",
      textColor: "#B45309",
    },
    {
      key: "2.0C",
      label: "+2.0°C",
      sublabel: "Upper limit",
      color: "#D55E00",
      textColor: "#C2410C",
    },
    {
      key: "3.0C",
      label: "+3.0°C",
      sublabel: "High warming",
      color: "#9E2A2B",
      textColor: "#9E2A2B",
    },
  ];

  const EMPTY_CELL_COLOR = "#E2E8F0";

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  async function loadHazardsData() {
    try {
      const response = await fetch("./data/hazards.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      return new Promise((resolve, reject) => {
        if (window.__HAZARDS_FALLBACK__ && Array.isArray(window.__HAZARDS_FALLBACK__.hazards)) {
          resolve(window.__HAZARDS_FALLBACK__);
          return;
        }
        const script = document.createElement("script");
        script.src = "./data/hazards_fallback.js";
        script.onload = () => {
          if (window.__HAZARDS_FALLBACK__ && Array.isArray(window.__HAZARDS_FALLBACK__.hazards)) {
            resolve(window.__HAZARDS_FALLBACK__);
          } else {
            reject(err);
          }
        };
        script.onerror = () => reject(err);
        document.head.appendChild(script);
      });
    }
  }

  function formatPop(millions) {
    if (millions >= 1000) {
      return `${(millions / 1000).toFixed(2)}B people`;
    }
    return `${Math.round(millions).toLocaleString("en-US")}M people`;
  }

  /**
   * Build a crisp 10 × 10 SVG waffle grid filled bottom-to-top, left-to-right.
   * Each square represents 1% of cities exceeding the extreme hazard threshold.
   */
  function buildWaffleSvg(filledCells, fillColor, ariaLabel) {
    const cols = 10;
    const rows = 10;
    const cellSize = 18;
    const gap = 4;
    const totalSize = cols * cellSize + (cols - 1) * gap; // 216px

    const svg = svgEl("svg", {
      viewBox: `0 0 ${totalSize} ${totalSize}`,
      class: "waffle-svg",
      role: "img",
      "aria-label": ariaLabel,
    });

    const title = svgEl("title");
    title.textContent = ariaLabel;
    svg.appendChild(title);

    // Fill bottom-to-top (row 9 down to 0), left-to-right (col 0 to 9)
    let index = 0;
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = 0; c < cols; c++) {
        index += 1;
        const isFilled = index <= filledCells;
        const rect = svgEl("rect", {
          x: c * (cellSize + gap),
          y: r * (cellSize + gap),
          width: cellSize,
          height: cellSize,
          fill: isFilled ? fillColor : EMPTY_CELL_COLOR,
          class: isFilled ? "waffle-cell waffle-cell--filled" : "waffle-cell",
        });
        svg.appendChild(rect);
      }
    }

    return svg;
  }

  function renderAccessibleTable(tbodyEl, hazards) {
    if (!tbodyEl) return;
    const frag = document.createDocumentFragment();

    for (const h of hazards) {
      const s15 = h.scenarios["1.5C"];
      const s20 = h.scenarios["2.0C"];
      const s30 = h.scenarios["3.0C"];
      const delta = s30.pct - s15.pct;
      const sign = delta > 0 ? "+" : "";

      const tr = document.createElement("tr");

      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = h.label;
      tr.appendChild(th);

      const cells = [
        h.threshold_label,
        `${s15.pct.toFixed(1)}% (${s15.cities})`,
        `${s20.pct.toFixed(1)}% (${s20.cities})`,
        `${s30.pct.toFixed(1)}% (${s30.cities})`,
        `${sign}${delta.toFixed(1)} pp`,
      ];

      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }

      frag.appendChild(tr);
    }

    tbodyEl.replaceChildren(frag);
  }

  async function initWaffle() {
    const plotEl = document.getElementById("waffle-plot");
    if (!plotEl) return;

    const selectEl = document.getElementById("waffle-hazard-select");
    const thresholdNoteEl = document.getElementById("waffle-threshold-note");
    const captionEl = document.getElementById("waffle-caption");
    const statusEl = document.getElementById("waffle-status");
    const tbodyEl = document.getElementById("waffle-table-body");

    const dataset = await loadHazardsData();
    const { hazards } = dataset;

    if (selectEl) {
      const frag = document.createDocumentFragment();
      for (const h of hazards) {
        const opt = document.createElement("option");
        opt.value = h.id;
        opt.textContent = `${h.label} (${h.category})`;
        frag.appendChild(opt);
      }
      selectEl.replaceChildren(frag);
      selectEl.value = hazards[0].id;
    }

    renderAccessibleTable(tbodyEl, hazards);

    function renderHazard(hazardId) {
      const hazard = hazards.find((h) => h.id === hazardId) || hazards[0];
      const s15 = hazard.scenarios["1.5C"];
      const s20 = hazard.scenarios["2.0C"];
      const s30 = hazard.scenarios["3.0C"];

      if (thresholdNoteEl) {
        thresholdNoteEl.textContent = `Extreme threshold: ${hazard.threshold_label}`;
      }

      const row = document.createElement("div");
      row.className = "waffle-row";

      SCENARIO_META.forEach((meta, idx) => {
        const sc = hazard.scenarios[meta.key];
        const panel = document.createElement("div");
        panel.className = "waffle-panel";

        const header = document.createElement("div");
        header.className = "waffle-panel-header";

        const scenarioTag = document.createElement("div");
        scenarioTag.className = "waffle-scenario-tag";
        scenarioTag.textContent = `${meta.label} warming`;

        const pctValue = document.createElement("div");
        pctValue.className = "waffle-pct";
        pctValue.style.color = meta.textColor;
        pctValue.textContent = `${sc.cells}%`;

        const detail = document.createElement("div");
        detail.className = "waffle-detail";
        detail.textContent = `${sc.cities} of ${sc.valid_cities} cities · ${formatPop(sc.pop_millions)}`;

        header.append(scenarioTag, pctValue, detail);

        const ariaLabel = `${meta.label} global warming: ${sc.pct.toFixed(1)}% (${sc.cities} of ${sc.valid_cities} major cities, ${formatPop(sc.pop_millions)}) exceed ${hazard.threshold_label}.`;
        const svg = buildWaffleSvg(sc.cells, meta.color, ariaLabel);

        panel.append(header, svg);
        row.appendChild(panel);

        if (idx < SCENARIO_META.length - 1) {
          const arrow = document.createElement("div");
          arrow.className = "waffle-arrow";
          arrow.setAttribute("aria-hidden", "true");
          arrow.textContent = "→";
          row.appendChild(arrow);
        }
      });

      const deltaPp = s30.pct - s15.pct;
      const deltaSign = deltaPp > 0 ? "+" : "";
      const footer = document.createElement("div");
      footer.className = "waffle-legend";
      footer.innerHTML =
        `<span class="waffle-legend-item"><span class="waffle-swatch" style="background:#D55E00" aria-hidden="true"></span>1 square = 1% of cities exceeding threshold</span>` +
        `<span class="waffle-legend-item"><span class="waffle-swatch" style="background:${EMPTY_CELL_COLOR}" aria-hidden="true"></span>Below threshold</span>` +
        `<span class="waffle-legend-delta">+1.5°C → +3.0°C: <strong>${deltaSign}${deltaPp.toFixed(1)} pp</strong> (${s15.cities} → ${s30.cities} cities)</span>`;

      plotEl.replaceChildren(row, footer);

      if (captionEl) {
        captionEl.textContent = `${hazard.label} (${hazard.threshold_label}): rises from ${s15.pct.toFixed(1)}% of major cities at +1.5°C (${s15.cities} cities) to ${s20.pct.toFixed(1)}% at +2.0°C (${s20.cities} cities) and ${s30.pct.toFixed(1)}% at +3.0°C (${s30.cities} cities).`;
      }

      if (statusEl) {
        statusEl.textContent = `Updated waffle chart to ${hazard.label}: ${s15.cells}% at +1.5°C, ${s20.cells}% at +2.0°C, and ${s30.cells}% at +3.0°C.`;
      }
    }

    renderHazard(hazards[0].id);

    if (selectEl) {
      selectEl.addEventListener("change", (e) => {
        renderHazard(e.target.value);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initWaffle);
})();
