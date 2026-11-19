/**
 * Beeswarm Plot Module:
 * Loads WHO Healthy Life Expectancy (HALE) data from ./data/hale.json
 * (with automatic file:// fallback), computes collision-free beeswarm offsets
 * per WHO region, and renders an interactive Plotly beeswarm chart with
 * metric/sex toggles, multi-country spotlight search, and an accessible data table.
 */

(() => {
  const BEESWARM_DEFAULT_OPACITY = 0.82;
  const BEESWARM_DIMMED_OPACITY = 0.14;
  const BEESWARM_HIGHLIGHT_OPACITY = 1.0;

  /** Colorblind-safe editorial palette mapped to the 6 official WHO regions */
  const REGION_COLORS = {
    Europe: "#3b5bdb",
    "Western Pacific": "#0ca678",
    Americas: "#e8590c",
    "Eastern Mediterranean": "#862e9c",
    "South-East Asia": "#d6336c",
    Africa: "#0b7285",
  };

  const METRIC_CONFIG = {
    "2016": {
      label: "Healthy Life Expectancy (2016)",
      axisTitle: "Healthy Life Expectancy at Birth in 2016 (Years)",
      unit: " yrs",
      suffix: " years",
      isPercent: false,
    },
    "2000": {
      label: "Healthy Life Expectancy (2000)",
      axisTitle: "Healthy Life Expectancy at Birth in 2000 (Years)",
      unit: " yrs",
      suffix: " years",
      isPercent: false,
    },
    pct: {
      label: "HALE % Change (2000–2016)",
      axisTitle: "Percentage Change in Healthy Life Expectancy, 2000–2016 (%)",
      unit: "%",
      suffix: "%",
      isPercent: true,
    },
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

  /** Return numeric value for a given record, sex ("female"|"male"), and metric ("2016"|"2000"|"pct") */
  function getMetricValue(record, sex, metric) {
    return record[`${sex}_${metric}`];
  }

  function formatMetricValue(value, metric) {
    if (metric === "pct") {
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

    for (const row of dataset.countries) {
      const tr = document.createElement("tr");

      const thCountry = document.createElement("th");
      thCountry.scope = "row";
      thCountry.textContent = row.country;
      tr.appendChild(thCountry);

      const cells = [
        row.region,
        row.female_2000.toFixed(1),
        row.female_2016.toFixed(1),
        `${row.female_pct > 0 ? "+" : ""}${row.female_pct.toFixed(2)}%`,
        row.male_2000.toFixed(1),
        row.male_2016.toFixed(1),
        `${row.male_pct > 0 ? "+" : ""}${row.male_pct.toFixed(2)}%`,
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

  async function initBeeswarm() {
    const plotEl = document.getElementById("beeswarm-plot");
    if (!plotEl) return;

    const metricInputs = document.querySelectorAll('input[name="hale-metric"]');
    const sexInputs = document.querySelectorAll('input[name="hale-sex"]');
    const searchForm = document.getElementById("beeswarm-filter-form");
    const searchInput = document.getElementById("beeswarm-search");
    const datalistEl = document.getElementById("beeswarm-country-list");
    const clearBtn = document.getElementById("beeswarm-clear-search");
    const statusEl = document.getElementById("beeswarm-status");
    const captionEl = document.getElementById("beeswarm-caption");
    const tableBodyEl = document.getElementById("beeswarm-table-body");

    const dataset = await loadHaleData();
    const { countries, regions_order: regionsOrder, region_benchmarks: regionBenchmarks, global_benchmark: globalBenchmark } = dataset;

    renderAccessibleTable(tableBodyEl, dataset);
    updateDatalistSuggestions(datalistEl, countries, "");

    const state = {
      metric: "2016",
      sex: "female",
      query: "",
    };

    /** Build and render Plotly beeswarm figure for current state & container width */
    function renderChart() {
      const { metric, sex, query } = state;
      const cfg = METRIC_CONFIG[metric];
      const sexLabel = sex === "female" ? "Female" : "Male";

      // Compute global X range with comfortable padding
      const allVals = countries.map((d) => getMetricValue(d, sex, metric));
      const rawMin = Math.min(...allVals);
      const rawMax = Math.max(...allVals);
      const span = Math.max(rawMax - rawMin, 1);
      const xMin = rawMin - span * 0.06;
      const xMax = rawMax + span * 0.06;

      // Measure container for pixel-accurate beeswarm circle packing
      const isCompact = plotEl.clientWidth < 680;
      const marginLeft = isCompact ? 155 : 230;
      const marginRight = isCompact ? 20 : 40;
      const marginTop = 44;
      const marginBottom = 76;
      const totalHeight = isCompact ? 640 : 680;
      const innerWidth = Math.max(plotEl.clientWidth - marginLeft - marginRight, 260);
      const innerHeight = totalHeight - marginTop - marginBottom;
      const laneCount = regionsOrder.length;
      const laneHeightPx = innerHeight / (laneCount + 0.3);
      const dotDiameter = isCompact ? 7.5 : 9.5;

      const hasQuery = query.split(",").some((t) => t.trim().length > 0);
      const matchedNames = hasQuery ? findMatchedCountryNames(countries, query) : new Set();

      const traces = [];
      const calloutAnnotations = [];

      // Plot regions top-to-bottom (Europe at top -> y = 5, Africa at bottom -> y = 0)
      const yTickVals = [];
      const yTickText = [];
      const laneShapes = [];

      regionsOrder.forEach((regionName, idx) => {
        const yCenter = laneCount - 1 - idx;
        const regionCountries = countries.filter((d) => d.region === regionName);
        const color = REGION_COLORS[regionName] || "#475569";

        yTickVals.push(yCenter);
        yTickText.push(`<b>${regionName}</b><br><span style="color:#64748b;font-size:14px">n = ${regionCountries.length}</span>`);

        // Subtle horizontal lane baseline
        laneShapes.push({
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          yref: "y",
          y0: yCenter,
          y1: yCenter,
          line: { color: "rgba(148, 163, 184, 0.35)", width: 1 },
          layer: "below",
        });

        const packed = computeLaneBeeswarm(
          regionCountries,
          (d) => getMetricValue(d, sex, metric),
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
            lineWidths.push(2.4);
            sizes.push(dotDiameter + 2.5);

            if (matchedNames.size <= 15) {
              calloutAnnotations.push({
                x,
                y: yCenter + yOffset,
                text: `<b>${item.country}</b> (${formatMetricValue(x, metric)})`,
                showarrow: true,
                arrowhead: 2,
                arrowsize: 0.9,
                arrowwidth: 1.4,
                arrowcolor: "#0f172a",
                ax: 0,
                ay: -28,
                bgcolor: "rgba(255, 255, 255, 0.95)",
                bordercolor: "#0f172a",
                borderwidth: 1.1,
                borderpad: 4,
                font: {
                  family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
                  size: 15,
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

        traces.push({
          type: "scatter",
          mode: "markers",
          name: regionName,
          x: packed.map((p) => p.x),
          y: packed.map((p) => yCenter + p.yOffset),
          customdata: packed.map(({ item }) => [
            item.country,
            item.region,
            formatMetricValue(getMetricValue(item, sex, metric), metric),
            item.female_2016.toFixed(1),
            item.female_2000.toFixed(1),
            `${item.female_pct > 0 ? "+" : ""}${item.female_pct.toFixed(2)}%`,
            item.male_2016.toFixed(1),
            item.male_2000.toFixed(1),
            `${item.male_pct > 0 ? "+" : ""}${item.male_pct.toFixed(2)}%`,
          ]),
          hovertemplate:
            "<b>%{customdata[0]}</b> · %{customdata[1]}<br>" +
            `<b>${sexLabel} ${cfg.label}:</b> %{customdata[2]}<br>` +
            "Female: %{customdata[3]} yrs (2016) · %{customdata[4]} yrs (2000) · %{customdata[5]}<br>" +
            "Male: %{customdata[6]} yrs (2016) · %{customdata[7]} yrs (2000) · %{customdata[8]}" +
            "<extra></extra>",
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
        const val = getMetricValue(bench, sex, metric);
        benchX.push(val);
        benchY.push(laneCount - 1 - idx);
        benchCustom.push([regionName, formatMetricValue(val, metric)]);
      });

      traces.push({
        type: "scatter",
        mode: "markers",
        name: "WHO Region Average",
        x: benchX,
        y: benchY,
        customdata: benchCustom,
        hovertemplate:
          "<b>%{customdata[0]} — Official WHO Regional Average</b><br>" +
          `${sexLabel} ${cfg.label}: %{customdata[1]}<extra></extra>`,
        marker: {
          symbol: "diamond",
          size: 10.5,
          color: "#0f172a",
          opacity: hasQuery ? 0.35 : 0.92,
          line: { color: "#ffffff", width: 1.8 },
        },
        showlegend: false,
      });

      // Vertical dashed reference line for (WHO) Global average
      const globalVal = globalBenchmark ? getMetricValue(globalBenchmark, sex, metric) : null;
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
          line: { color: "#334155", width: 1.5, dash: "dot" },
          layer: "above",
        });

        annotations.push({
          x: globalVal,
          y: 1.045,
          xref: "x",
          yref: "paper",
          text: `<b>WHO Global avg: ${formatMetricValue(globalVal, metric)}</b>`,
          showarrow: false,
          xanchor: "center",
          yanchor: "bottom",
          bgcolor: "rgba(244, 246, 248, 0.92)",
          bordercolor: "#cbd5e1",
          borderwidth: 1,
          borderpad: 5,
          font: {
            family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
            size: 14.5,
            color: "#0f172a",
          },
        });
      }

      // Zero line when showing percentage change (highlights negative outliers like Syria)
      if (cfg.isPercent) {
        laneShapes.push({
          type: "line",
          xref: "x",
          x0: 0,
          x1: 0,
          yref: "paper",
          y0: 0,
          y1: 1,
          line: { color: "rgba(220, 38, 38, 0.45)", width: 1.4, dash: "solid" },
          layer: "below",
        });
      }

      const layout = {
        height: totalHeight,
        xaxis: {
          title: {
            text: `${cfg.axisTitle} — ${sexLabel}`,
            standoff: 18,
            font: { size: 20 },
          },
          tickfont: { size: 16 },
          range: [xMin, xMax],
          ticksuffix: cfg.isPercent ? "%" : "",
          zeroline: false,
          gridcolor: "rgba(148, 163, 184, 0.22)",
        },
        yaxis: {
          tickmode: "array",
          tickvals: yTickVals,
          ticktext: yTickText,
          tickfont: { size: 16 },
          range: [-0.62, laneCount - 0.38],
          showgrid: false,
          zeroline: false,
          fixedrange: true,
        },
        shapes: laneShapes,
        annotations,
        font: {
          family: '"National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
          size: 17,
          color: "#0f172a",
        },
        hoverlabel: {
          font: {
            family: '"National 2", "National", "Plus Jakarta Sans", sans-serif',
            size: 15,
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
        globalVal !== null ? ` WHO Global average is ${formatMetricValue(globalVal, metric)}.` : "";
      plotEl.setAttribute(
        "aria-label",
        `Beeswarm plot of ${sexLabel} ${cfg.label} for ${countries.length} countries grouped into 6 WHO regions.${globalSummary}`
      );

      if (captionEl) {
        captionEl.textContent = `Showing ${sexLabel.toLowerCase()} ${cfg.label.toLowerCase()} across ${countries.length} WHO member states grouped by official WHO region. Black diamonds mark each official WHO regional average; the dotted line marks the WHO Global average (${globalVal !== null ? formatMetricValue(globalVal, metric) : "N/A"}).`;
      }

      if (statusEl) {
        if (hasQuery) {
          statusEl.textContent =
            matchedNames.size === 0
              ? `No matching countries found for "${query}".`
              : `Highlighting ${matchedNames.size} ${matchedNames.size === 1 ? "country" : "countries"} for ${sexLabel} ${cfg.label}.`;
        } else {
          statusEl.textContent = `Showing ${sexLabel} ${cfg.label} across all ${countries.length} countries.`;
        }
      }
    }

    // Initial render
    renderChart();

    // Controls: metric & sex radios
    metricInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        if (e.target.checked) {
          state.metric = e.target.value;
          renderChart();
        }
      });
    });

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
