/**
 * ============================================================================
 * TEMPLATE 1 — Interactive Bubble Scatter Plot (Plotly + Multi-Item Spotlight)
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export an array of objects to JSON following this schema:
 *        [
 *          {
 *            "country": "Costa Rica",   // Entity label (CONFIG.fields.label)
 *            "sdi": 76.2,               // X-axis numeric value (CONFIG.fields.x)
 *            "whr": 6.95,               // Y-axis numeric value (CONFIG.fields.y)
 *            "gdp_ppp": 25800,          // Bubble area + color value (CONFIG.fields.size)
 *            "sqrt_gdp": 160.6,         // Optional precomputed sqrt(size); computed automatically if omitted
 *            "gdp_year": 2024,          // Extra hover metadata
 *            "whr_rank": 12             // Extra hover metadata
 *          }
 *        ]
 *   2. Update CONFIG below (data paths, field keys, axis titles, and hover template).
 *   3. Copy the <section id="scatter"> block from index.html and keep matching IDs.
 * ============================================================================
 */

(() => {
  "use strict";

  const {
    FONT_STACK,
    PALETTES,
    loadJson,
    renderError,
    updateMultiAutocomplete,
    findMatchingIndices,
    formatExact,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/countries.json",
      fallbackUrl: "./data/countries_fallback.js",
      fallbackKey: "__COUNTRIES_FALLBACK__",
      validate: Array.isArray,
    },
    ids: {
      plot: "bubble-plot",
      form: "country-filter-form",
      input: "country-search",
      datalist: "country-list",
      clearBtn: "clear-search",
      status: "search-status",
    },
    fields: {
      label: "country",
      x: "sdi",
      y: "whr",
      size: "gdp_ppp",
      sqrtSize: "sqrt_gdp",
    },
    entityName: { singular: "country", plural: "countries" },
    urlParam: "countries",
    axes: {
      xTitle: "Sustainable Development Index Score",
      yTitle: "World Happiness Score (3-Year Average)",
      colorbarTitle: "GDP per capita<br>PPP ($)",
      colorbarPrefix: "$",
    },
    style: {
      bubbleScale: 0.095,
      defaultOpacity: 0.6,
      dimmedOpacity: 0.12,
      highlightOpacity: 0.98,
      maxCalloutLabels: 15,
      colorscale: PALETTES.plasma,
    },
    /** Customize tooltip fields and hover HTML for your dataset */
    buildCustomData: (d) => [
      d.country,
      formatExact(d.gdp_ppp),
      d.gdp_year,
      d.whr_rank,
    ],
    hoverTemplate:
      "<b>%{customdata[0]}</b> (World Happiness Rank #%{customdata[3]})<br>" +
      "SDI Score: %{x:.2f} / 100<br>" +
      "Happiness (3-yr avg): %{y:.2f} / 10<br>" +
      "GDP per capita (PPP, %{customdata[2]}): $%{customdata[1]}" +
      "<extra></extra>",
  };

  async function initScatter() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const formEl = document.getElementById(CONFIG.ids.form);
    const searchInput = document.getElementById(CONFIG.ids.input);
    const datalistEl = document.getElementById(CONFIG.ids.datalist);
    const clearBtn = document.getElementById(CONFIG.ids.clearBtn);
    const statusEl = document.getElementById(CONFIG.ids.status);

    let data;
    try {
      data = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load scatter plot dataset. Please check", CONFIG.data.url);
      console.error("Scatter load error:", err);
      return;
    }

    const { fields, style, axes, entityName } = CONFIG;

    // Sort largest bubbles first so smaller bubbles always render on top (Z-order)
    const sorted = [...data].sort((a, b) => b[fields.size] - a[fields.size]);
    const allNames = sorted.map((d) => d[fields.label]);

    const trace = {
      x: sorted.map((d) => d[fields.x]),
      y: sorted.map((d) => d[fields.y]),
      customdata: sorted.map(CONFIG.buildCustomData),
      mode: "markers",
      hovertemplate: CONFIG.hoverTemplate,
      marker: {
        // Diameter proportional to sqrt(size) => visual area (pi * r^2) proportional to value
        size: sorted.map((d) => (d[fields.sqrtSize] ?? Math.sqrt(Math.max(0, d[fields.size]))) * style.bubbleScale),
        sizemode: "diameter",
        color: sorted.map((d) => d[fields.size]),
        colorscale: style.colorscale,
        showscale: true,
        colorbar: {
          title: { text: axes.colorbarTitle, font: { size: 18 } },
          tickprefix: axes.colorbarPrefix,
          tickfont: { size: 15 },
        },
        opacity: sorted.map(() => style.defaultOpacity),
        line: {
          color: sorted.map(() => "#ffffff"),
          width: sorted.map(() => 1.5),
        },
      },
    };

    const layout = {
      xaxis: {
        title: { text: axes.xTitle, font: { size: 20 }, standoff: 18 },
        tickfont: { size: 16 },
        zeroline: false,
      },
      yaxis: {
        title: { text: axes.yTitle, font: { size: 20 }, standoff: 18 },
        tickfont: { size: 16 },
        zeroline: false,
      },
      font: { family: FONT_STACK, size: 17, color: "#0f172a" },
      hoverlabel: { font: { family: FONT_STACK, size: 15 } },
      hovermode: "closest",
      template: "plotly_white",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 80, r: 40, t: 30, b: 80 },
    };

    await Plotly.newPlot(plotEl, [trace], layout, {
      responsive: true,
      displaylogo: false,
    });

    function applySearch(rawQuery) {
      updateMultiAutocomplete(datalistEl, allNames, rawQuery);

      const hasToken = rawQuery.split(",").some((t) => t.trim().length > 0);
      if (!hasToken) {
        Plotly.restyle(
          plotEl,
          {
            "marker.opacity": [sorted.map(() => style.defaultOpacity)],
            "marker.line.width": [sorted.map(() => 1.5)],
            "marker.line.color": [sorted.map(() => "#ffffff")],
          },
          [0]
        );
        Plotly.relayout(plotEl, { annotations: [] });
        if (statusEl) {
          statusEl.textContent = `Showing all ${sorted.length} ${entityName.plural}.`;
        }
        return;
      }

      const matchedIndices = findMatchingIndices(sorted, (d) => d[fields.label], rawQuery);
      const matchedSet = new Set(matchedIndices);
      const opacities = [];
      const lineWidths = [];
      const lineColors = [];
      const annotations = [];

      sorted.forEach((item, idx) => {
        if (matchedSet.has(idx)) {
          opacities.push(style.highlightOpacity);
          lineWidths.push(3);
          lineColors.push("#0f172a");

          if (matchedIndices.length <= style.maxCalloutLabels) {
            annotations.push({
              x: item[fields.x],
              y: item[fields.y],
              text: `<b>${item[fields.label]}</b>`,
              showarrow: true,
              arrowhead: 2,
              arrowsize: 1,
              arrowwidth: 1.5,
              arrowcolor: "#0f172a",
              ax: 0,
              ay: -30,
              bgcolor: "rgba(255, 255, 255, 0.94)",
              bordercolor: "#0f172a",
              borderwidth: 1.2,
              borderpad: 4,
              font: { family: FONT_STACK, size: 15, color: "#0f172a" },
            });
          }
        } else {
          opacities.push(style.dimmedOpacity);
          lineWidths.push(1);
          lineColors.push("#ffffff");
        }
      });

      Plotly.restyle(
        plotEl,
        {
          "marker.opacity": [opacities],
          "marker.line.width": [lineWidths],
          "marker.line.color": [lineColors],
        },
        [0]
      );
      Plotly.relayout(plotEl, { annotations });

      if (statusEl) {
        const count = matchedIndices.length;
        statusEl.textContent =
          count === 0
            ? `No matching ${entityName.plural} found.`
            : `Highlighting ${count} ${count === 1 ? entityName.singular : entityName.plural}.`;
      }
    }

    const initialQuery = new URLSearchParams(window.location.search).get(CONFIG.urlParam) || "";
    if (searchInput && initialQuery) {
      searchInput.value = initialQuery;
    }
    applySearch(initialQuery);

    searchInput?.addEventListener("input", (e) => applySearch(e.target.value));
    formEl?.addEventListener("submit", (e) => {
      e.preventDefault();
      applySearch(searchInput ? searchInput.value : "");
    });
    clearBtn?.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      applySearch("");
      searchInput.focus();
    });
  }

  document.addEventListener("DOMContentLoaded", initScatter);
})();
