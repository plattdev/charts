/**
 * ============================================================================
 * TEMPLATE 2 — Collision-Free Grouped Beeswarm Plot (Plotly + Circle Packing)
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export JSON following this schema (see build_hale_data.py):
 *        {
 *          "years": [2000, ..., 2023],
 *          "regions_order": ["Western Pacific", "Europe", ...],
 *          "countries": [
 *            {
 *              "country": "Japan",
 *              "region": "Western Pacific",
 *              "total": [72.1, ..., 74.1], "total_pct": 2.8,
 *              "female": [...],            "female_pct": 2.5,
 *              "male": [...],              "male_pct": 3.1
 *            }
 *          ],
 *          "region_benchmarks": { "Europe": { "total": [...], "total_pct": ... } },
 *          "global_benchmark":  { "total": [...], "total_pct": ... }
 *        }
 *   2. Update CONFIG below (data paths, group colors, series labels, axis titles).
 *   3. Copy <section id="beeswarm"> from index.html.
 * ============================================================================
 */

(() => {
  "use strict";

  const {
    FONT_STACK,
    PALETTES,
    el,
    loadJson,
    renderError,
    renderTableRows,
    updateMultiAutocomplete,
    findMatchingIndices,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/hale.json",
      fallbackUrl: "./data/hale_fallback.js",
      fallbackKey: "__HALE_FALLBACK__",
      validate: (d) => Boolean(d && Array.isArray(d.countries) && Array.isArray(d.years)),
    },
    ids: {
      plot: "beeswarm-plot",
      yearGroup: "beeswarm-year-group",
      yearSelect: "beeswarm-year",
      searchForm: "beeswarm-filter-form",
      searchInput: "beeswarm-search",
      datalist: "beeswarm-country-list",
      clearBtn: "beeswarm-clear-search",
      status: "beeswarm-status",
      caption: "beeswarm-caption",
      tableBody: "beeswarm-table-body",
      metricRadioName: "hale-metric",
      sexRadioName: "hale-sex",
    },
    /** Okabe-Ito colorblind-safe palette mapped to each horizontal lane group */
    groupColors: {
      "Western Pacific": PALETTES.okabeIto.blue,
      Europe: PALETTES.okabeIto.bluishGreen,
      Americas: PALETTES.okabeIto.orange,
      "South-East Asia": PALETTES.okabeIto.reddishPurple,
      "Eastern Mediterranean": PALETTES.okabeIto.skyBlue,
      Africa: PALETTES.okabeIto.vermillion,
    },
    seriesLabels: {
      total: "Both Sexes",
      female: "Female",
      male: "Male",
    },
    unitSuffix: "yrs",
    style: {
      defaultOpacity: 0.85,
      dimmedOpacity: 0.14,
      highlightOpacity: 1.0,
      maxCalloutLabels: 15,
    },
  };

  function getMetricValue(record, series, mode, yearIndex) {
    return mode === "pct" ? record[`${series}_pct`] : record[series][yearIndex];
  }

  function formatMetricValue(value, mode) {
    if (mode === "pct") {
      return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
    }
    return `${value.toFixed(1)} ${CONFIG.unitSuffix}`;
  }

  /**
   * Exact greedy beeswarm vertical dodge (Wilkinson / circle-tangent packing).
   * Positions each point at the smallest |dy| that does not collide with
   * previously placed points in the same horizontal lane.
   */
  function computeLaneBeeswarm(items, getX, xMin, xMax, plotWidthPx, laneHeightPx, dotDiameterPx) {
    const xSpan = Math.max(xMax - xMin, 1e-6);
    const pxPerX = plotWidthPx / xSpan;
    const minDist = dotDiameterPx + 1.4;
    const minDistSq = (minDist - 0.05) * (minDist - 0.05);
    const maxOffsetPx = laneHeightPx * 0.41;

    const sorted = items
      .map((item) => ({
        item,
        xVal: getX(item),
        px: (getX(item) - xMin) * pxPerX,
      }))
      .sort((a, b) => a.px - b.px);

    const placed = [];

    for (const pt of sorted) {
      const neighbors = [];
      for (let i = placed.length - 1; i >= 0; i--) {
        const q = placed[i];
        if (pt.px - q.px >= minDist) break;
        neighbors.push(q);
      }

      if (neighbors.length === 0) {
        placed.push({ ...pt, py: 0 });
        continue;
      }

      const candidates = [0];
      for (const q of neighbors) {
        const dx = pt.px - q.px;
        const dySq = minDist * minDist - dx * dx;
        if (dySq > 0) {
          const dy = Math.sqrt(dySq) + 0.02;
          candidates.push(q.py + dy, q.py - dy);
        }
      }
      candidates.sort((a, b) => Math.abs(a) - Math.abs(b));

      let chosenPy = null;
      for (const cand of candidates) {
        if (Math.abs(cand) > maxOffsetPx) continue;
        let collides = false;
        for (const q of neighbors) {
          const dx = pt.px - q.px;
          const dy = cand - q.py;
          if (dx * dx + dy * dy < minDistSq) {
            collides = true;
            break;
          }
        }
        if (!collides) {
          chosenPy = cand;
          break;
        }
      }

      if (chosenPy === null) {
        chosenPy = Math.max(-maxOffsetPx, Math.min(maxOffsetPx, candidates[0] || 0));
      }
      placed.push({ ...pt, py: chosenPy });
    }

    return placed.map((p) => ({
      item: p.item,
      x: p.xVal,
      yOffset: p.py / laneHeightPx,
    }));
  }

  function populateYearSelect(yearSelectEl, years) {
    if (!yearSelectEl) return;
    const frag = document.createDocumentFragment();
    const descYears = [...years].reverse();
    for (const y of descYears) {
      frag.appendChild(el("option", { value: y }, y === descYears[0] ? `${y} (Latest)` : String(y)));
    }
    yearSelectEl.replaceChildren(frag);
    yearSelectEl.value = String(descYears[0]);
  }

  async function initBeeswarm() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const metricInputs = document.querySelectorAll(`input[name="${CONFIG.ids.metricRadioName}"]`);
    const sexInputs = document.querySelectorAll(`input[name="${CONFIG.ids.sexRadioName}"]`);
    const yearWrapEl = document.getElementById(CONFIG.ids.yearGroup);
    const yearSelectEl = document.getElementById(CONFIG.ids.yearSelect);
    const searchForm = document.getElementById(CONFIG.ids.searchForm);
    const searchInput = document.getElementById(CONFIG.ids.searchInput);
    const datalistEl = document.getElementById(CONFIG.ids.datalist);
    const clearBtn = document.getElementById(CONFIG.ids.clearBtn);
    const statusEl = document.getElementById(CONFIG.ids.status);
    const captionEl = document.getElementById(CONFIG.ids.caption);
    const tableBodyEl = document.getElementById(CONFIG.ids.tableBody);

    let dataset;
    try {
      dataset = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load beeswarm dataset. Please check", CONFIG.data.url);
      console.error("Beeswarm load error:", err);
      return;
    }

    const {
      years,
      countries,
      regions_order: regionsOrder,
      region_benchmarks: regionBenchmarks,
      global_benchmark: globalBenchmark,
    } = dataset;

    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const lastIdx = years.length - 1;
    const allNames = countries.map((d) => d.country);

    populateYearSelect(yearSelectEl, years);
    if (tableBodyEl) {
      renderTableRows(
        tableBodyEl,
        countries.map((row) => [
          row.country,
          row.region,
          row.total[0].toFixed(1),
          row.total[lastIdx].toFixed(1),
          `${row.total_pct > 0 ? "+" : ""}${row.total_pct.toFixed(1)}%`,
          row.female[lastIdx].toFixed(1),
          row.male[lastIdx].toFixed(1),
        ])
      );
    }
    updateMultiAutocomplete(datalistEl, allNames, "");

    const state = {
      mode: "year",
      year: lastYear,
      sex: "total",
      query: "",
    };

    function renderChart() {
      const { mode, year, sex, query } = state;
      const yearIndex = Math.max(0, years.indexOf(year));
      const sexLabel = CONFIG.seriesLabels[sex] || "Both Sexes";
      const isPercent = mode === "pct";

      if (yearWrapEl) yearWrapEl.hidden = isPercent;

      const metricLabel = isPercent
        ? `HALE % Change (${firstYear}–${lastYear})`
        : `Healthy Life Expectancy (${year})`;

      const axisTitle = isPercent
        ? `Percentage Change in Healthy Life Expectancy, ${firstYear}–${lastYear} (%)`
        : `Healthy Life Expectancy at Birth in ${year} (Years)`;

      const allVals = countries.map((d) => getMetricValue(d, sex, mode, yearIndex));
      const rawMin = Math.min(...allVals);
      const rawMax = Math.max(...allVals);
      const span = Math.max(rawMax - rawMin, 1);
      const xMin = rawMin - span * 0.06;
      const xMax = rawMax + span * 0.06;

      const isCompact = plotEl.clientWidth < 680;
      const marginLeft = isCompact ? 145 : 195;
      const marginRight = isCompact ? 20 : 36;
      const marginTop = 38;
      const marginBottom = 56;
      const measuredHeight = Math.round(plotEl.clientHeight);
      const totalHeight =
        measuredHeight >= 360
          ? Math.min(measuredHeight, 600)
          : isCompact
            ? 520
            : 560;
      const innerWidth = Math.max(plotEl.clientWidth - marginLeft - marginRight, 260);
      const innerHeight = totalHeight - marginTop - marginBottom;
      const laneCount = regionsOrder.length;
      const laneHeightPx = innerHeight / (laneCount + 0.3);
      const dotDiameter = isCompact ? 7.5 : 9.0;

      const hasQuery = query.split(",").some((t) => t.trim().length > 0);
      const matchedNames = new Set(
        hasQuery
          ? findMatchingIndices(countries, (d) => d.country, query).map((i) => countries[i].country)
          : []
      );

      const traces = [];
      const calloutAnnotations = [];
      const yTickVals = [];
      const yTickText = [];
      const laneShapes = [];

      regionsOrder.forEach((regionName, idx) => {
        const yCenter = laneCount - 1 - idx;
        const regionCountries = countries.filter((d) => d.region === regionName);
        const color = CONFIG.groupColors[regionName] || "#475569";

        yTickVals.push(yCenter);
        yTickText.push(
          `<b>${regionName}</b><br><span style="color:#94a3b8;font-size:12px">${regionCountries.length} countries</span>`
        );

        laneShapes.push({
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          yref: "y",
          y0: yCenter,
          y1: yCenter,
          line: { color: "rgba(203, 213, 225, 0.45)", width: 1 },
          layer: "below",
        });

        const packed = computeLaneBeeswarm(
          regionCountries,
          (d) => getMetricValue(d, sex, mode, yearIndex),
          xMin,
          xMax,
          innerWidth,
          laneHeightPx,
          dotDiameter
        );

        const opacities = [];
        const lineColors = [];
        const lineWidths = [];
        const sizes = [];

        packed.forEach(({ item, x, yOffset }) => {
          const isMatched = matchedNames.has(item.country);
          if (!hasQuery) {
            opacities.push(CONFIG.style.defaultOpacity);
            lineColors.push("#ffffff");
            lineWidths.push(1.2);
            sizes.push(dotDiameter);
          } else if (isMatched) {
            opacities.push(CONFIG.style.highlightOpacity);
            lineColors.push("#0f172a");
            lineWidths.push(2.2);
            sizes.push(dotDiameter + 2.5);

            if (matchedNames.size <= CONFIG.style.maxCalloutLabels) {
              calloutAnnotations.push({
                x,
                y: yCenter + yOffset,
                text: `<b>${item.country}</b> (${formatMetricValue(x, mode)})`,
                showarrow: true,
                arrowhead: 2,
                arrowsize: 0.8,
                arrowwidth: 1.2,
                arrowcolor: "#0f172a",
                ax: 0,
                ay: -24,
                bgcolor: "rgba(255, 255, 255, 0.95)",
                bordercolor: "#334155",
                borderwidth: 1,
                borderpad: 3,
                font: { family: FONT_STACK, size: 14.3, color: "#0f172a" },
              });
            }
          } else {
            opacities.push(CONFIG.style.dimmedOpacity);
            lineColors.push("#ffffff");
            lineWidths.push(0.8);
            sizes.push(dotDiameter);
          }
        });

        traces.push({
          type: "scatter",
          mode: "markers",
          name: regionName,
          x: packed.map((p) => p.x),
          y: packed.map((p) => yCenter + p.yOffset),
          customdata: packed.map(({ item }) => [
            item.country,
            formatMetricValue(getMetricValue(item, sex, mode, yearIndex), mode),
          ]),
          hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[1]}<extra></extra>",
          marker: {
            color,
            size: sizes,
            opacity: opacities,
            line: { color: lineColors, width: lineWidths },
          },
          showlegend: false,
        });
      });

      // Regional aggregate diamonds
      const benchX = [];
      const benchY = [];
      const benchCustom = [];
      regionsOrder.forEach((regionName, idx) => {
        const bench = regionBenchmarks[regionName];
        if (!bench) return;
        const val = getMetricValue(bench, sex, mode, yearIndex);
        benchX.push(val);
        benchY.push(laneCount - 1 - idx);
        benchCustom.push([regionName, formatMetricValue(val, mode)]);
      });

      traces.push({
        type: "scatter",
        mode: "markers",
        name: "Regional Average",
        x: benchX,
        y: benchY,
        customdata: benchCustom,
        hovertemplate: "<b>%{customdata[0]} (Avg)</b><br>%{customdata[1]}<extra></extra>",
        marker: {
          symbol: "diamond",
          size: 8.5,
          color: "#334155",
          opacity: hasQuery ? 0.3 : 0.88,
          line: { color: "#ffffff", width: 1.4 },
        },
        showlegend: false,
      });

      const globalVal = globalBenchmark ? getMetricValue(globalBenchmark, sex, mode, yearIndex) : null;
      const annotations = [...calloutAnnotations];

      if (globalVal !== null) {
        laneShapes.push({
          type: "line",
          xref: "x",
          x0: globalVal,
          x1: globalVal,
          yref: "paper",
          y0: 0,
          y1: 1,
          line: { color: "rgba(100, 116, 139, 0.55)", width: 1.2, dash: "dot" },
          layer: "below",
        });

        annotations.push({
          x: globalVal,
          y: 1.01,
          xref: "x",
          yref: "paper",
          text: `Global Avg: <b>${formatMetricValue(globalVal, mode)}</b>`,
          showarrow: false,
          xanchor: "center",
          yanchor: "bottom",
          font: { family: FONT_STACK, size: 14.3, color: "#64748b" },
        });
      }

      if (isPercent) {
        laneShapes.push({
          type: "line",
          xref: "x",
          x0: 0,
          x1: 0,
          yref: "paper",
          y0: 0,
          y1: 1,
          line: { color: "rgba(220, 38, 38, 0.35)", width: 1.2, dash: "solid" },
          layer: "below",
        });
      }

      const layout = {
        height: totalHeight,
        xaxis: {
          title: { text: `${axisTitle} — ${sexLabel}`, standoff: 16, font: { size: 15.3 } },
          tickfont: { size: 14.3 },
          range: [xMin, xMax],
          ticksuffix: isPercent ? "%" : "",
          zeroline: false,
          gridcolor: "rgba(148, 163, 184, 0.16)",
        },
        yaxis: {
          tickmode: "array",
          tickvals: yTickVals,
          ticktext: yTickText,
          tickfont: { size: 14.3 },
          range: [-0.62, laneCount - 0.38],
          showgrid: false,
          zeroline: false,
          fixedrange: true,
        },
        shapes: laneShapes,
        annotations,
        font: { family: FONT_STACK, size: 15.3, color: "#0f172a" },
        hoverlabel: {
          bgcolor: "#ffffff",
          bordercolor: "#cbd5e1",
          font: { family: FONT_STACK, size: 14.8, color: "#0f172a" },
        },
        hovermode: "closest",
        template: "plotly_white",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: marginLeft, r: marginRight, t: marginTop, b: marginBottom },
      };

      Plotly.react(plotEl, traces, layout, { responsive: true, displaylogo: false });

      const globalSummary =
        globalVal !== null ? ` WHO Global average is ${formatMetricValue(globalVal, mode)}.` : "";
      plotEl.setAttribute(
        "aria-label",
        `Beeswarm plot of ${sexLabel} ${metricLabel} for ${countries.length} countries and territories grouped into ${regionsOrder.length} WHO regions.${globalSummary}`
      );

      if (captionEl) {
        captionEl.textContent = `Showing ${sexLabel.toLowerCase()} ${metricLabel.toLowerCase()} across ${countries.length} countries and territories grouped by official WHO region. Diamonds mark official WHO regional averages; the dotted line marks the WHO Global average (${globalVal !== null ? formatMetricValue(globalVal, mode) : "N/A"}).`;
      }

      if (statusEl) {
        statusEl.textContent = hasQuery
          ? matchedNames.size === 0
            ? `No matching countries found for "${query}".`
            : `Highlighting ${matchedNames.size} ${matchedNames.size === 1 ? "country" : "countries"} for ${sexLabel} ${metricLabel}.`
          : `Showing ${sexLabel} ${metricLabel} across all ${countries.length} countries and territories.`;
      }
    }

    renderChart();

    metricInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.mode = e.target.value;
          renderChart();
        }
      });
    });

    yearSelectEl?.addEventListener("change", (e) => {
      state.year = Number(e.target.value);
      renderChart();
    });

    sexInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.sex = e.target.value;
          renderChart();
        }
      });
    });

    searchInput?.addEventListener("input", (e) => {
      state.query = e.target.value;
      updateMultiAutocomplete(datalistEl, allNames, state.query);
      renderChart();
    });

    searchForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      state.query = searchInput ? searchInput.value : "";
      renderChart();
    });

    clearBtn?.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      state.query = "";
      updateMultiAutocomplete(datalistEl, allNames, "");
      renderChart();
      searchInput.focus();
    });

    let resizeTimer = null;
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderChart, 120);
      });
      observer.observe(plotEl);
    }
  }

  document.addEventListener("DOMContentLoaded", initBeeswarm);
})();
