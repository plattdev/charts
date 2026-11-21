/**
 * Beeswarm Plot Module:
 * Loads WHO Global Health Observatory Healthy Life Expectancy (HALE at birth, WHOSIS_000002)
 * data (2000–2023) from ./data/hale.json (with automatic file:// fallback),
 * computes collision-free beeswarm offsets per WHO region, and renders an
 * interactive Plotly beeswarm chart with metric, year (2000–2023), and sex
 * toggles, multi-country spotlight search, and an accessible data table.
 */

(() => {
  const BEESWARM_DEFAULT_OPACITY = 0.85;
  const BEESWARM_DIMMED_OPACITY = 0.14;
  const BEESWARM_HIGHLIGHT_OPACITY = 1.0;

  /** Okabe-Ito colorblind-safe palette mapped to the 6 official WHO regions */
  const REGION_COLORS = {
    "Western Pacific": "#0072B2",
    Europe: "#009E73",
    Americas: "#E69F00",
    "South-East Asia": "#CC79A7",
    "Eastern Mediterranean": "#56B4E9",
    Africa: "#D55E00",
  };

  const SEX_LABELS = {
    total: "Both Sexes",
    female: "Female",
    male: "Male",
  };

  function normalizeText(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  /** Fetch HALE JSON dataset (with local file:// fallback) */
  async function loadHaleData() {
    try {
      const response = await fetch("./data/hale.json");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      return new Promise((resolve, reject) => {
        if (window.__HALE_FALLBACK__ && Array.isArray(window.__HALE_FALLBACK__.countries)) {
          resolve(window.__HALE_FALLBACK__);
          return;
        }
        const script = document.createElement("script");
        script.src = "./data/hale_fallback.js";
        script.onload = () => {
          if (window.__HALE_FALLBACK__ && Array.isArray(window.__HALE_FALLBACK__.countries)) {
            resolve(window.__HALE_FALLBACK__);
          } else {
            reject(err);
          }
        };
        script.onerror = () => reject(err);
        document.head.appendChild(script);
      });
    }
  }

  /** Return numeric value for a record given sex ("total"|"female"|"male"), mode ("year"|"pct"), and yearIndex */
  function getMetricValue(record, sex, mode, yearIndex) {
    if (mode === "pct") {
      return record[`${sex}_pct`];
    }
    return record[sex][yearIndex];
  }

  function formatMetricValue(value, mode) {
    if (mode === "pct") {
      const sign = value > 0 ? "+" : "";
      return `${sign}${value.toFixed(1)}%`;
    }
    return `${value.toFixed(1)} yrs`;
  }

  /**
   * Exact greedy beeswarm vertical dodge (Wilkinson / circle-tangent packing).
   * Positions each point at the smallest |dy| that does not collide with
   * previously placed points in the same regional lane.
   */
  function computeLaneBeeswarm(items, getX, xMin, xMax, plotWidthPx, laneHeightPx, dotDiameterPx) {
    const xSpan = Math.max(xMax - xMin, 1e-6);
    const pxPerX = plotWidthPx / xSpan;
    const minDist = dotDiameterPx + 1.4;
    const minDistSq = (minDist - 0.05) * (minDist - 0.05);
    const maxOffsetPx = laneHeightPx * 0.41;

    const sorted = items
      .map((item, originalIndex) => ({
        item,
        originalIndex,
        xVal: getX(item),
        px: (getX(item) - xMin) * pxPerX,
      }))
      .sort((a, b) => a.px - b.px);

    const placed = [];

    for (const pt of sorted) {
      const neighbors = [];
      for (let i = placed.length - 1; i >= 0; i--) {
        const q = placed[i];
        if (pt.px - q.px >= minDist) {
          break;
        }
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
        if (Math.abs(cand) > maxOffsetPx) {
          continue;
        }
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

      // If lane is saturated in narrow viewports, clamp gracefully
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

  /** Update <datalist> options for comma-separated country search */
  function updateDatalistSuggestions(datalistEl, countries, rawValue) {
    const lastCommaIdx = rawValue.lastIndexOf(",");
    const hasComma = lastCommaIdx !== -1;

    const prefixTokens = hasComma
      ? rawValue
          .slice(0, lastCommaIdx)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const chosenNormalized = new Set(prefixTokens.map(normalizeText));
    const prefixText = prefixTokens.length > 0 ? `${prefixTokens.join(", ")}, ` : "";

    const sortedCountries = [...countries].sort((a, b) =>
      a.country.localeCompare(b.country)
    );

    const fragment = document.createDocumentFragment();
    for (const item of sortedCountries) {
      if (chosenNormalized.has(normalizeText(item.country))) {
        continue;
      }
      const option = document.createElement("option");
      option.value = `${prefixText}${item.country}`;
      fragment.appendChild(option);
    }

    datalistEl.replaceChildren(fragment);
  }

  /** Match comma-separated tokens against country names */
  function findMatchedCountryNames(countries, rawQuery) {
    const rawTokens = rawQuery
      .split(",")
      .map((t) => normalizeText(t))
      .filter(Boolean);

    if (rawTokens.length === 0) {
      return new Set();
    }

    const normalizedPairs = countries.map((d) => ({
      name: d.country,
      norm: normalizeText(d.country),
    }));
    const exactSet = new Set(normalizedPairs.map((p) => p.norm));
    const matched = new Set();

    for (const token of rawTokens) {
      const isExact = exactSet.has(token);
      for (const pair of normalizedPairs) {
        if (isExact ? pair.norm === token : pair.norm.includes(token)) {
          matched.add(pair.name);
        }
      }
    }

    return matched;
  }

  /** Populate semantic accessible HTML data table */
  function renderAccessibleTable(tbodyEl, dataset) {
    if (!tbodyEl) return;
    const fragment = document.createDocumentFragment();
    const lastIdx = dataset.years.length - 1;

    for (const row of dataset.countries) {
      const tr = document.createElement("tr");

      const thCountry = document.createElement("th");
      thCountry.scope = "row";
      thCountry.textContent = row.country;
      tr.appendChild(thCountry);

      const cells = [
        row.region,
        row.total[0].toFixed(1),
        row.total[lastIdx].toFixed(1),
        `${row.total_pct > 0 ? "+" : ""}${row.total_pct.toFixed(1)}%`,
        row.female[lastIdx].toFixed(1),
        row.male[lastIdx].toFixed(1),
      ];

      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }

      fragment.appendChild(tr);
    }

    tbodyEl.replaceChildren(fragment);
  }

  /** Populate Year <select> from latest (2021) down to earliest (2000) */
  function populateYearSelect(yearSelectEl, years) {
    if (!yearSelectEl) return;
    const frag = document.createDocumentFragment();
    const descYears = [...years].reverse();
    for (const y of descYears) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = y === descYears[0] ? `${y} (Latest)` : String(y);
      frag.appendChild(opt);
    }
    yearSelectEl.replaceChildren(frag);
    yearSelectEl.value = String(descYears[0]);
  }

  async function initBeeswarm() {
    const plotEl = document.getElementById("beeswarm-plot");
    if (!plotEl) return;

    const metricInputs = document.querySelectorAll('input[name="hale-metric"]');
    const sexInputs = document.querySelectorAll('input[name="hale-sex"]');
    const yearWrapEl = document.getElementById("beeswarm-year-group");
    const yearSelectEl = document.getElementById("beeswarm-year");
    const searchForm = document.getElementById("beeswarm-filter-form");
    const searchInput = document.getElementById("beeswarm-search");
    const datalistEl = document.getElementById("beeswarm-country-list");
    const clearBtn = document.getElementById("beeswarm-clear-search");
    const statusEl = document.getElementById("beeswarm-status");
    const captionEl = document.getElementById("beeswarm-caption");
    const tableBodyEl = document.getElementById("beeswarm-table-body");

    const dataset = await loadHaleData();
    const {
      years,
      countries,
      regions_order: regionsOrder,
      region_benchmarks: regionBenchmarks,
      global_benchmark: globalBenchmark,
    } = dataset;

    const firstYear = years[0];
    const lastYear = years[years.length - 1];

    populateYearSelect(yearSelectEl, years);
    renderAccessibleTable(tableBodyEl, dataset);
    updateDatalistSuggestions(datalistEl, countries, "");

    const state = {
      mode: "year", // "year" | "pct"
      year: lastYear,
      sex: "total", // "total" | "female" | "male"
      query: "",
    };

    /** Build and render Plotly beeswarm figure for current state & container width */
    function renderChart() {
      const { mode, year, sex, query } = state;
      const yearIndex = Math.max(0, years.indexOf(year));
      const sexLabel = SEX_LABELS[sex] || "Both Sexes";
      const isPercent = mode === "pct";

      if (yearWrapEl) {
        yearWrapEl.hidden = isPercent;
      }

      const metricLabel = isPercent
        ? `HALE % Change (${firstYear}–${lastYear})`
        : `Healthy Life Expectancy (${year})`;

      const axisTitle = isPercent
        ? `Percentage Change in Healthy Life Expectancy, ${firstYear}–${lastYear} (%)`
        : `Healthy Life Expectancy at Birth in ${year} (Years)`;

      // Compute global X range with comfortable padding
      const allVals = countries.map((d) => getMetricValue(d, sex, mode, yearIndex));
      const rawMin = Math.min(...allVals);
      const rawMax = Math.max(...allVals);
      const span = Math.max(rawMax - rawMin, 1);
      const xMin = rawMin - span * 0.06;
      const xMax = rawMax + span * 0.06;

      // Measure container for pixel-accurate beeswarm circle packing
      const isCompact = plotEl.clientWidth < 680;
      const marginLeft = isCompact ? 145 : 195;
      const marginRight = isCompact ? 20 : 36;
      const marginTop = 36;
      const marginBottom = 64;
      const totalHeight = isCompact ? 590 : 630;
      const innerWidth = Math.max(plotEl.clientWidth - marginLeft - marginRight, 260);
      const innerHeight = totalHeight - marginTop - marginBottom;
      const laneCount = regionsOrder.length;
      const laneHeightPx = innerHeight / (laneCount + 0.3);
      const dotDiameter = isCompact ? 7.5 : 9.0;

      const hasQuery = query.split(",").some((t) => t.trim().length > 0);
      const matchedNames = hasQuery ? findMatchedCountryNames(countries, query) : new Set();

      const traces = [];
      const calloutAnnotations = [];

      // Plot regions top-to-bottom (highest regional HALE at top -> Africa at bottom)
      const yTickVals = [];
      const yTickText = [];
      const laneShapes = [];
      const lastIdx = years.length - 1;

      regionsOrder.forEach((regionName, idx) => {
        const yCenter = laneCount - 1 - idx;
        const regionCountries = countries.filter((d) => d.region === regionName);
        const color = REGION_COLORS[regionName] || "#475569";

        yTickVals.push(yCenter);
        yTickText.push(
          `<b>${regionName}</b><br><span style="color:#94a3b8;font-size:12px">${regionCountries.length} countries</span>`
        );

        // Subtle horizontal lane baseline
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
            opacities.push(BEESWARM_DEFAULT_OPACITY);
            lineColors.push("#ffffff");
            lineWidths.push(1.2);
            sizes.push(dotDiameter);
          } else if (isMatched) {
            opacities.push(BEESWARM_HIGHLIGHT_OPACITY);
            lineColors.push("#0f172a");
            lineWidths.push(2.2);
            sizes.push(dotDiameter + 2.5);

            if (matchedNames.size <= 15) {
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
                font: {
                  family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
                  size: 13,
                  color: "#0f172a",
                },
              });
            }
          } else {
            opacities.push(BEESWARM_DIMMED_OPACITY);
            lineColors.push("#ffffff");
            lineWidths.push(0.8);
            sizes.push(dotDiameter);
          }
        });

        const displayIdx = isPercent ? lastIdx : yearIndex;
        const displayYear = years[displayIdx];

        traces.push({
          type: "scatter",
          mode: "markers",
          name: regionName,
          x: packed.map((p) => p.x),
          y: packed.map((p) => yCenter + p.yOffset),
          customdata: packed.map(({ item }) => [
            item.country,
            item.region,
            formatMetricValue(getMetricValue(item, sex, mode, yearIndex), mode),
            item.total[displayIdx].toFixed(1),
            item.female[displayIdx].toFixed(1),
            item.male[displayIdx].toFixed(1),
            `${item[sex][0].toFixed(1)} → ${item[sex][lastIdx].toFixed(1)} yrs (${item[`${sex}_pct`] > 0 ? "+" : ""}${item[`${sex}_pct`].toFixed(1)}%)`,
          ]),
          hovertemplate: "<b>%{customdata[0]}</b><br>%{customdata[2]}<extra></extra>",
          marker: {
            color,
            size: sizes,
            opacity: opacities,
            line: {
              color: lineColors,
              width: lineWidths,
            },
          },
          showlegend: false,
        });
      });

      // Official WHO Regional Averages (diamond markers)
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
        name: "WHO Region Average",
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

      // Vertical dashed reference line for WHO Global average
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
          y: 1.035,
          xref: "x",
          yref: "paper",
          text: `Global Avg: <b>${formatMetricValue(globalVal, mode)}</b>`,
          showarrow: false,
          xanchor: "center",
          yanchor: "bottom",
          font: {
            family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
            size: 13,
            color: "#64748b",
          },
        });
      }

      // Zero line when showing percentage change (highlights negative changes)
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
          title: {
            text: `${axisTitle} — ${sexLabel}`,
            standoff: 16,
            font: { size: 14 },
          },
          tickfont: { size: 13 },
          range: [xMin, xMax],
          ticksuffix: isPercent ? "%" : "",
          zeroline: false,
          gridcolor: "rgba(148, 163, 184, 0.16)",
        },
        yaxis: {
          tickmode: "array",
          tickvals: yTickVals,
          ticktext: yTickText,
          tickfont: { size: 13 },
          range: [-0.62, laneCount - 0.38],
          showgrid: false,
          zeroline: false,
          fixedrange: true,
        },
        shapes: laneShapes,
        annotations,
        font: {
          family: '"National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
          size: 14,
          color: "#0f172a",
        },
        hoverlabel: {
          bgcolor: "#ffffff",
          bordercolor: "#cbd5e1",
          font: {
            family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
            size: 13.5,
            color: "#0f172a",
          },
        },
        hovermode: "closest",
        template: "plotly_white",
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: marginLeft, r: marginRight, t: marginTop, b: marginBottom },
      };

      Plotly.react(plotEl, traces, layout, {
        responsive: true,
        displaylogo: false,
      });

      // Update accessible aria-label, figcaption, and polite live region
      const globalSummary =
        globalVal !== null ? ` WHO Global average is ${formatMetricValue(globalVal, mode)}.` : "";
      plotEl.setAttribute(
        "aria-label",
        `Beeswarm plot of ${sexLabel} ${metricLabel} for ${countries.length} countries and territories grouped into 6 WHO regions.${globalSummary}`
      );

      if (captionEl) {
        captionEl.textContent = `Showing ${sexLabel.toLowerCase()} ${metricLabel.toLowerCase()} across ${countries.length} countries and territories grouped by official WHO region. Diamonds mark official WHO regional averages; the dotted line marks the WHO Global average (${globalVal !== null ? formatMetricValue(globalVal, mode) : "N/A"}).`;
      }

      if (statusEl) {
        if (hasQuery) {
          statusEl.textContent =
            matchedNames.size === 0
              ? `No matching countries found for "${query}".`
              : `Highlighting ${matchedNames.size} ${matchedNames.size === 1 ? "country" : "countries"} for ${sexLabel} ${metricLabel}.`;
        } else {
          statusEl.textContent = `Showing ${sexLabel} ${metricLabel} across all ${countries.length} countries and territories.`;
        }
      }
    }

    // Initial render
    renderChart();

    // Controls: metric, year, & sex
    metricInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.mode = e.target.value;
          renderChart();
        }
      });
    });

    if (yearSelectEl) {
      yearSelectEl.addEventListener("change", (e) => {
        state.year = Number(e.target.value);
        renderChart();
      });
    }

    sexInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.sex = e.target.value;
          renderChart();
        }
      });
    });

    // Search spotlight controls
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.query = e.target.value;
        updateDatalistSuggestions(datalistEl, countries, state.query);
        renderChart();
      });
    }

    if (searchForm) {
      searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        state.query = searchInput.value;
        renderChart();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.query = "";
        updateDatalistSuggestions(datalistEl, countries, "");
        renderChart();
        searchInput.focus();
      });
    }

    // Recompute exact beeswarm dodge cleanly on container resize
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
