/**
 * ============================================================================
 * ChartKit — Shared Reusable Visualization Core (Nov 2026 Best Practices)
 * ============================================================================
 * Zero-dependency utility library shared by all 6 chart templates:
 *   - scatter.js      (Plotly Bubble Scatter + multi-item spotlight)
 *   - beeswarm.js     (Plotly Circle-Packed Beeswarm + regional benchmarks)
 *   - streamgraph.js  (SVG Monotone Cubic Streamgraph / 100% Share / Area)
 *   - ozone.js        (SVG Area-Proportional Semicircles)
 *   - waffle.js       (SVG 10x10 Multi-Scenario Waffle Grids)
 *   - sankey.js       (SVG 3-Stage Barycenter-Ordered Sankey Diagram)
 *
 * Works seamlessly over HTTP(S) and when opened directly via file://
 * (automatically falling back to <script> data bundles without CORS errors).
 * ============================================================================
 */

(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const FONT_STACK =
    '"National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const INT_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const scriptLoadCache = new Map();

  /**
   * Curated colorblind-safe palettes (deuteranopia, protanopia, tritanopia verified).
   * Reuse these constants in any chart's TEMPLATE CONFIG block.
   */
  const PALETTES = Object.freeze({
    okabeIto: Object.freeze({
      blue: "#0072B2",
      bluishGreen: "#009E73",
      orange: "#E69F00",
      reddishPurple: "#CC79A7",
      skyBlue: "#56B4E9",
      vermillion: "#D55E00",
    }),
    editorialFlow: Object.freeze({
      terracotta: "#B84A39",
      steelBlue: "#2A6F8E",
      deepTeal: "#2B8270",
      plumSlate: "#7B6D8D",
      ochreOrange: "#D97724",
      warmAmber: "#D49B2A",
      coolSlate: "#7B8FA1",
      inkSlate: "#334155",
    }),
    warmSequential: Object.freeze(["#E69F00", "#D55E00", "#9E2A2B"]),
    japaneseBlue: Object.freeze({
      deepIndigo: "#1D3557",
      mineralBlue: "#2E6280",
      paleSky: "#D6E6EE",
    }),
    plasma: Object.freeze([
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
    ]),
  });

  /**
   * XSS-safe HTML element builder.
   * Replaces unsafe innerHTML interpolation across all chart modules.
   */
  function el(tag, attrs = null, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val === undefined || val === null || val === false) continue;
        if (key === "className") {
          node.className = String(val);
        } else if (key === "style" && typeof val === "object") {
          Object.assign(node.style, val);
        } else if (key === "dataset" && typeof val === "object") {
          Object.assign(node.dataset, val);
        } else if (key === "textContent") {
          node.textContent = String(val);
        } else if (val === true) {
          node.setAttribute(key, "");
        } else {
          node.setAttribute(key, String(val));
        }
      }
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  /** SVG element factory with optional text content. */
  function svgEl(tag, attrs = null, text = null) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val !== undefined && val !== null) {
          node.setAttribute(key, String(val));
        }
      }
    }
    if (text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  /**
   * Unified JSON loader with automatic local file:// <script> fallback.
   * Deduplicates fallback script injection if called multiple times.
   */
  async function loadJson({ url, fallbackUrl, fallbackKey, validate = Boolean }) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} (${url})`);
      }
      const data = await response.json();
      if (!validate(data)) {
        throw new Error(`Invalid dataset schema in ${url}`);
      }
      return data;
    } catch (fetchErr) {
      if (!fallbackUrl || !fallbackKey) {
        throw fetchErr;
      }

      if (validate(globalThis[fallbackKey])) {
        return globalThis[fallbackKey];
      }

      if (!scriptLoadCache.has(fallbackUrl)) {
        const promise = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = fallbackUrl;
          script.onload = () => {
            if (validate(globalThis[fallbackKey])) {
              resolve(globalThis[fallbackKey]);
            } else {
              reject(fetchErr);
            }
          };
          script.onerror = () => reject(fetchErr);
          document.head.appendChild(script);
        });
        scriptLoadCache.set(fallbackUrl, promise);
      }

      return scriptLoadCache.get(fallbackUrl);
    }
  }

  /** Render an accessible, consistently styled error message inside a chart container. */
  function renderError(containerEl, message, detailCode = null) {
    if (!containerEl) return;
    const parts = [message];
    if (detailCode) {
      parts.push(" ", el("code", null, detailCode));
    }
    containerEl.replaceChildren(
      el("p", { className: "chart-error", role: "alert" }, ...parts)
    );
  }

  /**
   * Populate an accessible HTML <tbody> cleanly using DocumentFragment.
   * @param {HTMLElement|null} tbodyEl
   * @param {Array<Array<string|number>>} rows
   * @param {{ firstColHeader?: boolean }} [options]
   */
  function renderTableRows(tbodyEl, rows, { firstColHeader = true } = {}) {
    if (!tbodyEl) return;
    const frag = document.createDocumentFragment();

    for (const cells of rows) {
      const tr = document.createElement("tr");
      cells.forEach((value, idx) => {
        const cell =
          idx === 0 && firstColHeader
            ? el("th", { scope: "row" }, String(value))
            : el("td", null, String(value));
        tr.appendChild(cell);
      });
      frag.appendChild(tr);
    }

    tbodyEl.replaceChildren(frag);
  }

  /** Accent- and case-insensitive text normalization for search matching. */
  function normalizeText(str) {
    return String(str ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  /**
   * Update a native <datalist> for comma-separated multi-item spotlight search.
   * Works with any entity list (countries, products, companies, cities).
   */
  function updateMultiAutocomplete(datalistEl, names, rawValue) {
    if (!datalistEl) return;
    const lastCommaIdx = rawValue.lastIndexOf(",");
    const prefixTokens =
      lastCommaIdx !== -1
        ? rawValue
            .slice(0, lastCommaIdx)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    const chosenNormalized = new Set(prefixTokens.map(normalizeText));
    const prefixText = prefixTokens.length > 0 ? `${prefixTokens.join(", ")}, ` : "";
    const sortedNames = [...names].sort((a, b) => a.localeCompare(b));

    const frag = document.createDocumentFragment();
    for (const name of sortedNames) {
      if (chosenNormalized.has(normalizeText(name))) continue;
      frag.appendChild(el("option", { value: `${prefixText}${name}` }));
    }
    datalistEl.replaceChildren(frag);
  }

  /**
   * Match comma-separated query tokens against an array of records.
   * Exact matches take precedence over substring matches for each token.
   */
  function findMatchingIndices(items, getName, rawQuery) {
    const tokens = rawQuery
      .split(",")
      .map(normalizeText)
      .filter(Boolean);

    if (tokens.length === 0) return [];

    const normalizedNames = items.map((item) => normalizeText(getName(item)));
    const exactSet = new Set(normalizedNames);
    const matched = new Set();

    for (const token of tokens) {
      const isExact = exactSet.has(token);
      normalizedNames.forEach((norm, idx) => {
        if (isExact ? norm === token : norm.includes(token)) {
          matched.add(idx);
        }
      });
    }

    return Array.from(matched);
  }

  function formatCompact(val) {
    if (Math.abs(val) >= 1_000_000) {
      return `${(val / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(val) >= 1_000) {
      return `${INT_FORMATTER.format(Math.round(val / 1_000))}k`;
    }
    return INT_FORMATTER.format(Math.round(val));
  }

  function formatExact(val) {
    return INT_FORMATTER.format(Math.round(val));
  }

  function formatPct(part, total, decimals = 1) {
    if (!total) return `${(0).toFixed(decimals)}%`;
    return `${((part / total) * 100).toFixed(decimals)}%`;
  }

  globalThis.ChartKit = Object.freeze({
    FONT_STACK,
    PALETTES,
    el,
    svgEl,
    loadJson,
    renderError,
    renderTableRows,
    normalizeText,
    updateMultiAutocomplete,
    findMatchingIndices,
    formatCompact,
    formatExact,
    formatPct,
  });
})();
