/**
 * Sankey Diagram Module (2-Stage Swedish Municipal Waste Flow, 1975–2025):
 * Loads Avfall Sverige waste data from ./data/waste.json (with file:// fallback)
 * and renders a clean 2-stage Plotly Sankey diagram with a Traditional Japanese
 * Natural Pigment (Dentōshoku) palette.
 *
 * Supports temporal grouping by:
 * - "lustros": 5-year periods (annual average rate, zero spaghetti, default)
 * - "milestones": benchmark sample years spaced every 5 years (11 years)
 * - "all": full raw yearly series (36 years)
 */

(() => {
  /**
   * Traditional Japanese Natural Pigment Palette (Nippon no Dentōshoku):
   * Muted mineral & botanical dyes aligned top-to-bottom from newest streams to landfill.
   */
  const STREAMS = [
    {
      key: "waste_prepared_for_reuse",
      label: "Prepared for Reuse",
      // Ai-iro / Ruri-kon (Natural Indigo)
      nodeColor: "#3E5C76",
      linkColor: "rgba(62, 92, 118, 0.45)",
    },
    {
      key: "recycling_of_construction_material",
      label: "Construction Material Recycling",
      // Sabiasagi / Seiji (Patina Celadon)
      nodeColor: "#5B8280",
      linkColor: "rgba(91, 130, 128, 0.36)",
    },
    {
      key: "biological_treatment",
      label: "Biological Treatment",
      // Uguisu-iro / Matcha (Moss Green)
      nodeColor: "#7A8B52",
      linkColor: "rgba(122, 139, 82, 0.30)",
    },
    {
      key: "energy_recovery",
      label: "Energy Recovery",
      // Kaki-iro / Bengara (Persimmon Terracotta)
      nodeColor: "#C16644",
      linkColor: "rgba(193, 102, 68, 0.25)",
    },
    {
      key: "material_recycling",
      label: "Material Recycling",
      // Kitsurubami / Kuchinashi (Warm Natural Ochre)
      nodeColor: "#C59B4E",
      linkColor: "rgba(197, 155, 78, 0.28)",
    },
    {
      key: "landfill",
      label: "Landfill",
      // Sunezumi / Sumi-nezumi (Warm Charcoal Ash)
      nodeColor: "#6D6A64",
      linkColor: "rgba(109, 106, 100, 0.30)",
    },
  ];

  /** 10 lustros (5-year periods) covering 50 years of Swedish waste transition */
  const LUSTROS_CONFIG = [
    { id: "2020-2025", label: "2020–2025", minYear: 2020, maxYear: 2025 },
    { id: "2015-2019", label: "2015–2019", minYear: 2015, maxYear: 2019 },
    { id: "2010-2014", label: "2010–2014", minYear: 2010, maxYear: 2014 },
    { id: "2005-2009", label: "2005–2009", minYear: 2005, maxYear: 2009 },
    { id: "2000-2004", label: "2000–2004", minYear: 2000, maxYear: 2004 },
    { id: "1995-1999", label: "1995–1999", minYear: 1995, maxYear: 1999 },
    { id: "1990-1994", label: "1990–1994", minYear: 1990, maxYear: 1994 },
    { id: "1985-1989", label: "1985–1989", minYear: 1985, maxYear: 1989 },
    { id: "1980-1984", label: "1980–1984", minYear: 1980, maxYear: 1984 },
    { id: "1975-1979", label: "1975–1979", minYear: 1975, maxYear: 1979 },
  ];

  const MILESTONE_YEARS = [2025, 2020, 2015, 2010, 2005, 2000, 1995, 1990, 1985, 1980, 1975];

  const CAPTIONS = {
    lustros:
      "Ten 5-year periods (1975–2025) ordered chronologically from newest (2020–2025, top) to oldest (1975–1979, bottom) showing average annual metric tonnes.",
    milestones:
      "Eleven benchmark milestone years spaced every 5 years (1975–2025) ordered from newest (2025, top) to oldest (1975, bottom) in metric tonnes.",
    all:
      "All 36 complete annual records (1975–2025) flowing into each treatment pathway in metric tonnes.",
  };

  function formatTonnes(val) {
    return `${Math.round(val).toLocaleString("en-US")} t`;
  }

  function formatPercent(part, total) {
    if (!total) return "0.0%";
    return `${((part / total) * 100).toFixed(1)}%`;
  }

  /** Smooth Sumi-e ink gradient: deep Sumi (#2B2926) at top -> warm Hai-iro (#A6A095) at bottom */
  function getYearSumiColor(index, totalCount) {
    const t = totalCount <= 1 ? 0 : index / (totalCount - 1);
    const start = [43, 41, 38];   // #2B2926 (Sumi-iro)
    const end = [166, 160, 149];  // #A6A095 (Hai-iro)
    const r = Math.round(start[0] + (end[0] - start[0]) * t);
    const g = Math.round(start[1] + (end[1] - start[1]) * t);
    const b = Math.round(start[2] + (end[2] - start[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /** Compute strictly ordered normalized Y-centers in (0.015, 0.985) so Plotly preserves top-to-bottom order */
  function computeProportionalYCenters(values, { gap = 0.006, minHeight = 0.012 } = {}) {
    const count = values.length;
    if (count === 0) return [];
    if (count === 1) return [0.5];

    const startY = 0.015;
    const spanY = 0.97;
    const totalGap = gap * (count - 1);
    const usable = Math.max(spanY - totalGap, 0.1);
    const sum = values.reduce((acc, v) => acc + v, 0) || 1;

    const rawHeights = values.map((v) => Math.max(minHeight, (v / sum) * usable));
    const rawTotal = rawHeights.reduce((acc, h) => acc + h, 0);
    const scale = usable / rawTotal;
    const heights = rawHeights.map((h) => h * scale);

    const centers = [];
    let cursor = startY;
    for (let i = 0; i < count; i++) {
      centers.push(Number((cursor + heights[i] / 2).toFixed(4)));
      cursor += heights[i] + gap;
    }
    return centers;
  }

  /** Aggregate records into lustros computing annual averages per treatment stream */
  function computeLustroItems(records) {
    return LUSTROS_CONFIG.map((lustro) => {
      const matches = records.filter(
        (r) => r.year >= lustro.minYear && r.year <= lustro.maxYear
      );
      const count = matches.length || 1;
      const row = {
        label: lustro.label,
        yearCount: matches.length,
        years: matches.map((r) => r.year),
      };
      let totalSum = 0;
      for (const s of STREAMS) {
        const streamSum = matches.reduce((acc, r) => acc + (r[s.key] || 0), 0);
        const avg = Math.round(streamSum / count);
        row[s.key] = avg;
        totalSum += avg;
      }
      row.total = totalSum;
      return row;
    });
  }

  /** Fetch Waste JSON dataset (with local file:// fallback) */
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

  /** Build 2-stage Sankey graph definition depending on selected grouping mode */
  function buildSankeyGraph(mode, records) {
    let leftItems = [];
    let isLustroMode = mode === "lustros";

    if (isLustroMode) {
      leftItems = computeLustroItems(records);
    } else if (mode === "milestones") {
      const recMap = new Map(records.map((r) => [r.year, r]));
      leftItems = MILESTONE_YEARS.map((y) => recMap.get(y)).filter(Boolean);
    } else {
      // all 36 records descending
      leftItems = [...records].sort((a, b) => b.year - a.year);
    }

    const leftTotals = leftItems.map((item) =>
      STREAMS.reduce((acc, s) => acc + (item[s.key] || 0), 0)
    );

    const leftYGap = isLustroMode ? 0.016 : mode === "milestones" ? 0.014 : 0.0055;
    const leftMinH = isLustroMode ? 0.032 : mode === "milestones" ? 0.030 : 0.014;

    const leftY = computeProportionalYCenters(leftTotals, {
      gap: leftYGap,
      minHeight: leftMinH,
    });

    const activeStreams = STREAMS.map((s) => ({
      ...s,
      total: leftItems.reduce((acc, item) => acc + (item[s.key] || 0), 0),
    })).filter((s) => s.total > 0);

    const streamY = computeProportionalYCenters(
      activeStreams.map((s) => s.total),
      { gap: 0.032, minHeight: 0.028 }
    );

    const nodes = [];
    const nodeColors = [];
    const nodeX = [];
    const nodeY = [];
    const nodeCustom = [];

    const leftIndices = {};
    leftItems.forEach((item, idx) => {
      const key = isLustroMode ? item.label : String(item.year);
      leftIndices[key] = nodes.length;
      nodes.push(key);
      nodeColors.push(getYearSumiColor(idx, leftItems.length));
      nodeX.push(0.008);
      nodeY.push(leftY[idx]);

      if (isLustroMode) {
        nodeCustom.push(
          `${item.label}: ${formatTonnes(item.total)} / year (avg of ${item.yearCount} ${item.yearCount === 1 ? "year" : "years"})`
        );
      } else {
        nodeCustom.push(`${item.year}: ${formatTonnes(item.total)} total municipal waste`);
      }
    });

    const streamIndices = {};
    activeStreams.forEach((s, idx) => {
      streamIndices[s.key] = nodes.length;
      nodes.push(s.label);
      nodeColors.push(s.nodeColor);
      nodeX.push(0.992);
      nodeY.push(streamY[idx]);
      nodeCustom.push(`${s.label}: ${formatTonnes(s.total)} total in this view`);
    });

    const sources = [];
    const targets = [];
    const values = [];
    const linkColors = [];
    const linkCustom = [];

    leftItems.forEach((item, itemIdx) => {
      const key = isLustroMode ? item.label : String(item.year);
      const total = leftTotals[itemIdx];

      for (const s of activeStreams) {
        const val = item[s.key] || 0;
        if (val <= 0) continue;
        sources.push(leftIndices[key]);
        targets.push(streamIndices[s.key]);
        values.push(val);
        linkColors.push(s.linkColor);

        if (isLustroMode) {
          linkCustom.push(
            `<b>${key} → ${s.label}</b><br>${formatTonnes(val)} / year (${formatPercent(val, total)} of period)`
          );
        } else {
          linkCustom.push(
            `<b>${key} → ${s.label}</b><br>${formatTonnes(val)} (${formatPercent(val, total)} of ${key})`
          );
        }
      }
    });

    return {
      nodes,
      nodeColors,
      nodeX,
      nodeY,
      nodeCustom,
      sources,
      targets,
      values,
      linkColors,
      linkCustom,
    };
  }

  /** Populate accessible HTML table matching the selected temporal grouping */
  function renderAccessibleWasteTable(tbodyEl, captionEl, firstThEl, mode, records) {
    if (!tbodyEl) return;

    let items = [];
    const isLustroMode = mode === "lustros";

    if (isLustroMode) {
      items = computeLustroItems(records);
      if (captionEl) {
        captionEl.textContent =
          "Swedish municipal waste average annual treatment volumes in tonnes per 5-year period (1975–2025) (Source: Avfall Sverige).";
      }
      if (firstThEl) {
        firstThEl.textContent = "5-Year Period";
      }
    } else if (mode === "milestones") {
      const recMap = new Map(records.map((r) => [r.year, r]));
      items = MILESTONE_YEARS.map((y) => recMap.get(y)).filter(Boolean);
      if (captionEl) {
        captionEl.textContent =
          "Swedish municipal waste treatment volumes in tonnes for 5-year benchmark milestone years (1975–2025) (Source: Avfall Sverige).";
      }
      if (firstThEl) {
        firstThEl.textContent = "Milestone Year";
      }
    } else {
      items = [...records].sort((a, b) => b.year - a.year);
      if (captionEl) {
        captionEl.textContent =
          "Swedish municipal waste treatment volumes in tonnes from 2025 down to 1975 by treatment category (Source: Avfall Sverige).";
      }
      if (firstThEl) {
        firstThEl.textContent = "Year";
      }
    }

    const fragment = document.createDocumentFragment();

    for (const r of items) {
      const tr = document.createElement("tr");

      const thRow = document.createElement("th");
      thRow.scope = "row";
      thRow.textContent = isLustroMode ? r.label : String(r.year);
      tr.appendChild(thRow);

      const cols = [
        r.material_recycling,
        r.biological_treatment,
        r.energy_recovery,
        r.landfill,
        r.waste_prepared_for_reuse,
        r.recycling_of_construction_material,
        r.total,
      ];

      for (const val of cols) {
        const td = document.createElement("td");
        td.textContent = val > 0 ? val.toLocaleString("en-US") : "—";
        tr.appendChild(td);
      }

      fragment.appendChild(tr);
    }

    tbodyEl.replaceChildren(fragment);
  }

  async function initSankey() {
    const plotEl = document.getElementById("sankey-plot");
    if (!plotEl) return;

    const tableBodyEl = document.getElementById("sankey-table-body");
    const tableCaptionEl = document.getElementById("waste-table-caption");
    const firstThEl = document.getElementById("waste-table-th-year");
    const captionEl = document.getElementById("sankey-caption");
    const groupingInputs = document.querySelectorAll('input[name="sankey-grouping"]');

    const dataset = await loadWasteData();
    const { records } = dataset;

    let currentMode = "lustros";

    function updateView() {
      const graph = buildSankeyGraph(currentMode, records);
      const isCompact = plotEl.clientWidth < 680;
      const isAllMode = currentMode === "all";

      // Height: compact 620px for lustros / milestones (no spaghetti), 1040px only for all 36 years
      const plotHeight = isAllMode
        ? isCompact
          ? 860
          : 1040
        : isCompact
        ? 580
        : 640;

      plotEl.style.minHeight = `${plotHeight}px`;

      const trace = {
        type: "sankey",
        orientation: "h",
        arrangement: "perpendicular",
        valueformat: ",.0f",
        valuesuffix: currentMode === "lustros" ? " t/yr" : " t",
        node: {
          pad: isAllMode ? 6 : 14,
          thickness: isCompact ? 16 : 22,
          line: {
            color: "rgba(255, 255, 255, 0.90)",
            width: 1.2,
          },
          label: graph.nodes,
          color: graph.nodeColors,
          x: graph.nodeX,
          y: graph.nodeY,
          customdata: graph.nodeCustom,
          hovertemplate: "<b>%{customdata}</b><extra></extra>",
        },
        link: {
          source: graph.sources,
          target: graph.targets,
          value: graph.values,
          color: graph.linkColors,
          customdata: graph.linkCustom,
          hovertemplate: "%{customdata}<extra></extra>",
        },
      };

      const layout = {
        height: plotHeight,
        font: {
          family: '"National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
          size: isCompact ? 12 : 14,
          color: "#1e1d1a",
        },
        hoverlabel: {
          font: {
            family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
            size: 14.5,
          },
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: {
          l: isCompact ? 8 : 16,
          r: isCompact ? 8 : 16,
          t: 16,
          b: 16,
        },
      };

      Plotly.react(plotEl, [trace], layout, {
        responsive: true,
        displaylogo: false,
      });

      renderAccessibleWasteTable(tableBodyEl, tableCaptionEl, firstThEl, currentMode, records);

      if (captionEl && CAPTIONS[currentMode]) {
        captionEl.textContent = CAPTIONS[currentMode];
      }
    }

    // Set initial view
    updateView();

    // Grouping toggle change listener
    groupingInputs.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        if (e.target.checked) {
          currentMode = e.target.value;
          updateView();
        }
      });
    });

    let resizeTimer = null;
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateView, 120);
      });
      observer.observe(plotEl);
    }
  }

  document.addEventListener("DOMContentLoaded", initSankey);
})();
