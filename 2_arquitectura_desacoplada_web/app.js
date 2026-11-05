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

/** Render removable country badges below the search bar */
function renderChips(chipsContainer, matchedCountries, onRemoveCountry) {
  chipsContainer.replaceChildren();

  if (matchedCountries.length === 0) {
    return;
  }

  if (matchedCountries.length > 12) {
    const summary = document.createElement("span");
    summary.className = "chip chip-summary";
    summary.textContent = `${matchedCountries.length} countries highlighted — keep typing or add commas`;
    chipsContainer.appendChild(summary);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of matchedCountries) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item.country;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chip-remove";
    removeBtn.setAttribute("aria-label", `Remove ${item.country}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => onRemoveCountry(item.country));

    chip.appendChild(removeBtn);
    fragment.appendChild(chip);
  }

  chipsContainer.appendChild(fragment);
}

/** Initialize chart and interactive search controls */
async function initApp() {
  const plotEl = document.getElementById("bubble-plot");
  const formEl = document.getElementById("country-filter-form");
  const searchInput = document.getElementById("country-search");
  const datalistEl = document.getElementById("country-list");
  const clearBtn = document.getElementById("clear-search");
  const chipsContainer = document.getElementById("active-chips");
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
      colorscale: "Plasma",
      showscale: true,
      colorbar: {
        title: { text: "GDP per capita<br>PPP ($)" },
        tickprefix: "$",
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
      title: { text: "Sustainable Development Index Score (SDI_work, 0–100)" },
      zeroline: false,
    },
    yaxis: {
      title: { text: "World Happiness Score (3-Year Avg, 0–10)" },
      zeroline: false,
    },
    font: {
      family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      size: 13.5,
      color: "#0f172a",
    },
    hovermode: "closest",
    template: "plotly_white",
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 55, r: 30, t: 25, b: 55 },
  };

  await Plotly.newPlot(plotEl, [trace], layout, {
    responsive: true,
    displaylogo: false,
  });

  function removeCountryFromQuery(countryToRemove) {
    const removeIdx = data.findIndex((d) => d.country === countryToRemove);
    const remainingTokens = searchInput.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => {
        if (!t) return false;
        const tokenMatches = findMatchingIndices(data, t);
        // Remove token if it uniquely matched the removed country (or exact match)
        if (tokenMatches.length === 1 && tokenMatches[0] === removeIdx) {
          return false;
        }
        return normalizeText(t) !== normalizeText(countryToRemove);
      });

    searchInput.value = remainingTokens.join(", ");
    applySearch(searchInput.value);
    searchInput.focus();
  }

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
      renderChips(chipsContainer, [], removeCountryFromQuery);
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
        lineWidths.push(2.8);
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
            font: { size: 12, color: "#0f172a" },
          });
        }
      } else {
        opacities.push(DIMMED_OPACITY);
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

    renderChips(chipsContainer, matchedCountries, removeCountryFromQuery);
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
