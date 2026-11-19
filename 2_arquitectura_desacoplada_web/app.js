/**
 * Architecture 2 Client Application:
 * Loads clean data from ./data/countries.json, renders the interactive Plotly bubble chart,
 * and supports comma-separated multi-country spotlight search with smart autocomplete.
 */

// Parámetros visuales optimizados para evitar sobreposición excesiva
const BUBBLE_SCALE = 0.095; // Punto 3: escala reducida para dejar espacio entre burbujas
const DEFAULT_OPACITY = 0.60; // Punto 2: opacidad reducida para distinguir acumulaciones y capas
const DIMMED_OPACITY = 0.12;
const HIGHLIGHT_OPACITY = 0.98;

/** Plasma colorscale from Method 1 (Plotly Express) */
const PLASMA_COLORSCALE = [
  [0.0, "#0d0887"],
  [0.1111111111111111, "#46039f"],
  [0.2222222222222222, "#7201a8"],
  [0.3333333333333333, "#9c179e"],
  [0.4444444444444444, "#bd3786"],
  [0.5555555555555556, "#d8576b"],
  [0.6666666666666666, "#ed7953"],
  [0.7777777777777778, "#fb9f3a"],
  [0.8888888888888888, "#fdca26"],
  [1.0, "#f0f921"],
];

/** Normalize strings for accent-insensitive and case-insensitive matching */
function normalizeText(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Fetch JSON data (with automatic fallback when opened locally via file://) */
async function loadCountriesData() {
  try {
    const response = await fetch("./data/countries.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    // Fallback for local double-click (file:// protocol blocks fetch due to CORS)
    return new Promise((resolve, reject) => {
      if (Array.isArray(window.__COUNTRIES_FALLBACK__)) {
        resolve(window.__COUNTRIES_FALLBACK__);
        return;
      }
      const script = document.createElement("script");
      script.src = "./data/countries_fallback.js";
      script.onload = () => {
        if (Array.isArray(window.__COUNTRIES_FALLBACK__)) {
          resolve(window.__COUNTRIES_FALLBACK__);
        } else {
          reject(err);
        }
      };
      script.onerror = () => reject(err);
      document.head.appendChild(script);
    });
  }
}

/** Update <datalist> options so native autocomplete works after commas */
function updateDatalistSuggestions(datalistEl, allCountries, rawValue) {
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

  // Ordenar alfabéticamente para facilitar la navegación en el autocompletado
  const sortedCountries = [...allCountries].sort((a, b) =>
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

/** Match comma-separated tokens against the country dataset */
function findMatchingIndices(countries, rawQuery) {
  const rawTokens = rawQuery
    .split(",")
    .map((t) => normalizeText(t))
    .filter(Boolean);

  if (rawTokens.length === 0) {
    return [];
  }

  const normalizedNames = countries.map((d) => normalizeText(d.country));
  const exactNameSet = new Set(normalizedNames);

  const matchedSet = new Set();

  for (const token of rawTokens) {
    const isExactCountryName = exactNameSet.has(token);
    normalizedNames.forEach((normName, idx) => {
      if (isExactCountryName) {
        if (normName === token) {
          matchedSet.add(idx);
        }
      } else if (normName.includes(token)) {
        matchedSet.add(idx);
      }
    });
  }

  return Array.from(matchedSet);
}

/** Initialize chart and interactive search controls */
async function initApp() {
  const plotEl = document.getElementById("bubble-plot");
  const formEl = document.getElementById("country-filter-form");
  const searchInput = document.getElementById("country-search");
  const datalistEl = document.getElementById("country-list");
  const clearBtn = document.getElementById("clear-search");
  const statusEl = document.getElementById("search-status");

  const data = await loadCountriesData();

  // Punto 1: Ordenar por PIB per cápita descendente para que las burbujas grandes
  // se dibujen primero al fondo y las pequeñas queden siempre visibles encima (Z-order).
  data.sort((a, b) => b.gdp_ppp - a.gdp_ppp);

  const trace = {
    x: data.map((d) => d.sdi),
    y: data.map((d) => d.whr),
    customdata: data.map((d) => [
      d.country,
      d.gdp_ppp.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      d.gdp_year,
      d.whr_rank,
    ]),
    mode: "markers",
    hovertemplate:
      "<b>%{customdata[0]}</b> (WHR Rank #%{customdata[3]})<br>" +
      "SDI Score: %{x:.2f} / 100<br>" +
      "Happiness (3-yr avg): %{y:.2f} / 10<br>" +
      "GDP per capita (PPP, %{customdata[2]}): $%{customdata[1]}" +
      "<extra></extra>",
    marker: {
      // Radius proportional to √GDP -> Visual area (πr²) proportional to GDP
      size: data.map((d) => d.sqrt_gdp * BUBBLE_SCALE),
      sizemode: "diameter",
      color: data.map((d) => d.gdp_ppp),
      colorscale: PLASMA_COLORSCALE,
      showscale: true,
      colorbar: {
        title: { text: "GDP per capita<br>PPP ($)", font: { size: 18 } },
        tickprefix: "$",
        tickfont: { size: 15 },
      },
      opacity: data.map(() => DEFAULT_OPACITY),
      line: {
        color: data.map(() => "#ffffff"),
        width: data.map(() => 1.5), // Punto 2: trazo blanco de 1.5px
      },
    },
  };

  const layout = {
    xaxis: {
      title: {
        text: "Sustainable Development Index Score (SDI_work, 0–100)",
        font: { size: 20 },
        standoff: 18,
      },
      tickfont: { size: 16 },
      zeroline: false,
    },
    yaxis: {
      title: {
        text: "World Happiness Score (3-Year Avg, 0–10)",
        font: { size: 20 },
        standoff: 18,
      },
      tickfont: { size: 16 },
      zeroline: false,
    },
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
    margin: { l: 80, r: 40, t: 30, b: 80 },
  };

  await Plotly.newPlot(plotEl, [trace], layout, {
    responsive: true,
    displaylogo: false,
  });

  function applySearch(rawQuery) {
    updateDatalistSuggestions(datalistEl, data, rawQuery);

    const hasNonEmptyToken = rawQuery
      .split(",")
      .some((t) => t.trim().length > 0);

    if (!hasNonEmptyToken) {
      Plotly.restyle(
        plotEl,
        {
          "marker.opacity": [data.map(() => DEFAULT_OPACITY)],
          "marker.line.width": [data.map(() => 1.5)],
          "marker.line.color": [data.map(() => "#ffffff")],
        },
        [0]
      );
      Plotly.relayout(plotEl, { annotations: [] });
      const counterEl = document.getElementById("country-counter");
      if (counterEl) {
        counterEl.textContent = `${data.length} countries`;
      }
      statusEl.textContent = "Showing all 140 countries.";
      return;
    }

    const matchedIndices = findMatchingIndices(data, rawQuery);
    const matchedSet = new Set(matchedIndices);
    const matchedCountries = matchedIndices.map((i) => data[i]);

    const opacities = [];
    const lineWidths = [];
    const lineColors = [];
    const annotations = [];

    data.forEach((item, idx) => {
      if (matchedSet.has(idx)) {
        opacities.push(HIGHLIGHT_OPACITY);
        lineWidths.push(3);
        lineColors.push("#0f172a");

        // Show callout labels when up to 15 countries are highlighted to avoid clutter
        if (matchedIndices.length <= 15) {
          annotations.push({
            x: item.sdi,
            y: item.whr,
            text: `<b>${item.country}</b>`,
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
            font: { family: '"National 2", "National", "Plus Jakarta Sans", sans-serif', size: 15, color: "#0f172a" },
          });
        }
      } else {
        opacities.push(DIMMED_OPACITY);
        lineWidths.push(1);
        lineColors.push("#ffffff");
      }
    });

    const counterEl = document.getElementById("country-counter");
    if (counterEl) {
      counterEl.textContent = `${matchedIndices.length} of ${data.length} countries`;
    }

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

    statusEl.textContent =
      matchedCountries.length === 0
        ? "No matching countries found."
        : `Highlighting ${matchedCountries.length} ${matchedCountries.length === 1 ? "country" : "countries"}.`;
  }

  // Initial autocomplete options and optional URL query parameter (?countries=...)
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get("countries") || "";
  if (initialQuery) {
    searchInput.value = initialQuery;
  }
  applySearch(initialQuery);

  // Event listeners
  searchInput.addEventListener("input", (e) => {
    applySearch(e.target.value);
  });

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    applySearch(searchInput.value);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    applySearch("");
    searchInput.focus();
  });
}

document.addEventListener("DOMContentLoaded", initApp);
