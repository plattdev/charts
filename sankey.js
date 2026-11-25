/**
 * ============================================================================
 * TEMPLATE 6 — 3-Stage Barycenter-Ordered SVG Sankey Diagram
 * ============================================================================
 * HOW TO REUSE WITH YOUR OWN DATA:
 *   1. Export JSON following this schema (see build_idmc_data.py for an example):
 *        {
 *          "default_year": 2025,
 *          "by_year": {
 *            "2025": {
 *              "year": 2025,
 *              "total": 62348479,
 *              "events": 16911,
 *              "causes":   [{ "name": "Conflict", "value": 32436993 }, ...],
 *              "hazards":  [{ "name": "Storm", "value": 17883611 }, ...],
 *              "regions":  [{ "name": "East Asia and Pacific", "value": 19649827 }, ...],
 *              "links_12": [{ "source": "Disaster", "target": "Storm", "value": 17883611 }, ...],
 *              "links_23": [{ "source": "Storm", "target": "East Asia and Pacific", "value": 13800000 }, ...]
 *            }
 *          }
 *        }
 *   2. Update CONFIG below (data paths, stage headers, node colors, and unit label).
 *   3. Copy <section id="sankey"> from index.html.
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
    formatCompact,
    formatExact,
    formatPct,
  } = globalThis.ChartKit;

  // --------------------------------------------------------------------------
  // TEMPLATE CONFIG — Replace these values for your next dataset
  // --------------------------------------------------------------------------
  const CONFIG = {
    data: {
      url: "./data/idmc_sankey.json",
      fallbackUrl: "./data/idmc_sankey_fallback.js",
      fallbackKey: "__IDMC_SANKEY_FALLBACK__",
      validate: (d) => Boolean(d && d.by_year && typeof d.by_year === "object"),
    },
    ids: {
      plot: "sankey-plot",
      status: "sankey-status",
      tableBody: "sankey-table-body",
      tableCaption: "sankey-table-caption",
      yearRadioName: "sankey-year",
    },
    layout: {
      viewWidth: 1280,
      viewHeight: 760,
      topY: 62,
      plotHeight: 660,
      nodeWidth: 22,
      minNodeHeight: 8,
      xStage1: 200,
      xStage2: 590,
      xStage3: 974,
      gaps: { stage1: 56, stage2: 26, stage3: 26 },
      labelMinSpacing: { stage1: 60, stage2: 44, stage3: 44 },
    },
    stageHeaders: [
      "1. PRIMARY CAUSE",
      "2. HAZARD / TRIGGER",
      "3. GEOGRAPHICAL REGION",
    ],
    /** Fixed Stage 1 order keeps top-to-top flows crossing-free into Stage 2 */
    stage1Order: ["Conflict", "Disaster"],
    pinTopStage2: "Conflict & Violence",
    pinBottomStage2: "Other Disasters",
    unitLabel: "displacements",
    /** Colorblind-safe editorial palette (Stage 2 trigger hues; neutral slate for Stage 3) */
    colors: {
      Conflict: PALETTES.editorialFlow.terracotta,
      Disaster: PALETTES.editorialFlow.steelBlue,
      "Conflict & Violence": PALETTES.editorialFlow.terracotta,
      Storm: PALETTES.editorialFlow.steelBlue,
      Flood: PALETTES.editorialFlow.deepTeal,
      Earthquake: PALETTES.editorialFlow.plumSlate,
      Wildfire: PALETTES.editorialFlow.ochreOrange,
      Drought: PALETTES.editorialFlow.warmAmber,
      "Other Disasters": PALETTES.editorialFlow.coolSlate,
      Region: PALETTES.editorialFlow.inkSlate,
    },
  };

  function getColor(name) {
    return CONFIG.colors[name] || CONFIG.colors.Region;
  }

  function ribbonPath(x0, y0Top, y0Bot, x1, y1Top, y1Bot) {
    const cx = (x0 + x1) / 2;
    return [
      `M ${x0.toFixed(2)},${y0Top.toFixed(2)}`,
      `C ${cx.toFixed(2)},${y0Top.toFixed(2)} ${cx.toFixed(2)},${y1Top.toFixed(2)} ${x1.toFixed(2)},${y1Top.toFixed(2)}`,
      `L ${x1.toFixed(2)},${y1Bot.toFixed(2)}`,
      `C ${cx.toFixed(2)},${y1Bot.toFixed(2)} ${cx.toFixed(2)},${y0Bot.toFixed(2)} ${x0.toFixed(2)},${y0Bot.toFixed(2)}`,
      "Z",
    ].join(" ");
  }

  /** Lay out one vertical column with exact proportional heights and a small clickability floor. */
  function layoutColumn(items, totalValue, gapPx) {
    const { topY, plotHeight, minNodeHeight } = CONFIG.layout;
    if (items.length === 0) return [];

    const usableH = plotHeight - gapPx * (items.length - 1);
    const clamped = items.map((item) => Math.max(minNodeHeight, (item.value / totalValue) * usableH));
    const scale = usableH / clamped.reduce((acc, h) => acc + h, 0);

    let y = topY;
    return items.map((item, idx) => {
      const h = clamped[idx] * scale;
      const node = { ...item, y, h, midY: y + h / 2 };
      y += h + gapPx;
      return node;
    });
  }

  /** Greedy vertical label collision solver so adjacent small (<1%) nodes stay legible. */
  function resolveLabelPositions(nodes, minSpacing, minY, maxY) {
    const ys = nodes.map((n) => n.midY);
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] - ys[i - 1] < minSpacing) ys[i] = ys[i - 1] + minSpacing;
    }
    if (ys.length > 0 && ys[ys.length - 1] > maxY) {
      ys[ys.length - 1] = maxY;
      for (let i = ys.length - 2; i >= 0; i--) {
        if (ys[i + 1] - ys[i] < minSpacing) ys[i] = ys[i + 1] - minSpacing;
      }
    }
    if (ys.length > 0 && ys[0] < minY) {
      ys[0] = minY;
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] - ys[i - 1] < minSpacing) ys[i] = ys[i - 1] + minSpacing;
      }
    }
    return ys;
  }

  function populateTable(tbodyEl, yearData) {
    if (!tbodyEl) return;
    const causeByHazard = new Map(yearData.links_12.map((l) => [l.target, l.source]));
    const topRegionByHazard = new Map();

    for (const l of yearData.links_23) {
      const cur = topRegionByHazard.get(l.source);
      if (!cur || l.value > cur.value) {
        topRegionByHazard.set(l.source, { region: l.target, value: l.value });
      }
    }

    const rows = [...yearData.hazards]
      .sort((a, b) => b.value - a.value)
      .map((h) => {
        const topReg = topRegionByHazard.get(h.name);
        return [
          causeByHazard.get(h.name) || "Disaster",
          h.name,
          formatExact(h.value),
          formatPct(h.value, yearData.total),
          topReg ? `${topReg.region} (${formatCompact(topReg.value)})` : "—",
        ];
      });

    renderTableRows(tbodyEl, rows, { firstColHeader: false });
  }

  async function initSankey() {
    const plotEl = document.getElementById(CONFIG.ids.plot);
    if (!plotEl) return;

    const statusEl = document.getElementById(CONFIG.ids.status);
    const tableBody = document.getElementById(CONFIG.ids.tableBody);
    const tableCaption = document.getElementById(CONFIG.ids.tableCaption);
    const yearInputs = Array.from(document.querySelectorAll(`input[name="${CONFIG.ids.yearRadioName}"]`));

    let dataset;
    try {
      dataset = await loadJson(CONFIG.data);
    } catch (err) {
      renderError(plotEl, "Unable to load Sankey dataset. Please check", CONFIG.data.url);
      console.error("Sankey load error:", err);
      return;
    }

    const L = CONFIG.layout;
    let lockedSelection = null;

    function render(year) {
      const yearData = dataset.by_year[String(year)] || dataset.by_year[String(dataset.default_year)];
      if (!yearData) return;

      lockedSelection = null;
      const total = yearData.total;

      populateTable(tableBody, yearData);
      if (tableCaption) {
        tableCaption.textContent = `Global internal displacements (flows) in ${yearData.year} by primary cause, hazard subcategory, and leading affected region (Total: ${formatExact(total)} ${CONFIG.unitLabel} across ${formatExact(yearData.events)} records; Source: IDMC GIDD).`;
      }

      const causesOrdered = [...yearData.causes].sort(
        (a, b) => CONFIG.stage1Order.indexOf(a.name) - CONFIG.stage1Order.indexOf(b.name)
      );

      const hazardsOrdered = [...yearData.hazards].sort((a, b) => {
        if (a.name === CONFIG.pinTopStage2) return -1;
        if (b.name === CONFIG.pinTopStage2) return 1;
        if (a.name === CONFIG.pinBottomStage2) return 1;
        if (b.name === CONFIG.pinBottomStage2) return -1;
        return b.value - a.value;
      });

      const s1Nodes = layoutColumn(causesOrdered, total, L.gaps.stage1);
      const s2Nodes = layoutColumn(hazardsOrdered, total, L.gaps.stage2);
      const s2Map = new Map(s2Nodes.map((n) => [n.name, n]));

      // Order Stage 3 regions by weighted Stage 2 barycenter to minimize ribbon crossings
      const regionBary = new Map();
      for (const r of yearData.regions) {
        let weightedSum = 0;
        let weightTotal = 0;
        for (const l of yearData.links_23) {
          if (l.target === r.name) {
            const src = s2Map.get(l.source);
            if (src) {
              weightedSum += src.midY * l.value;
              weightTotal += l.value;
            }
          }
        }
        regionBary.set(r.name, weightTotal > 0 ? weightedSum / weightTotal : 0);
      }

      const regionsOrdered = [...yearData.regions].sort(
        (a, b) => (regionBary.get(a.name) || 0) - (regionBary.get(b.name) || 0)
      );
      const s3Nodes = layoutColumn(regionsOrdered, total, L.gaps.stage3);

      const s1Map = new Map(s1Nodes.map((n) => [n.name, n]));
      const s3Map = new Map(s3Nodes.map((n) => [n.name, n]));

      // Build Stage 1 -> Stage 2 ribbons
      const s1Cursor = new Map(s1Nodes.map((n) => [n.name, n.y]));
      const s2InCursor = new Map(s2Nodes.map((n) => [n.name, n.y]));
      const links12Sorted = [...yearData.links_12].sort((a, b) => {
        const dy = s1Map.get(a.source).y - s1Map.get(b.source).y;
        return dy !== 0 ? dy : s2Map.get(a.target).y - s2Map.get(b.target).y;
      });

      const ribbons12 = links12Sorted.map((l, idx) => {
        const src = s1Map.get(l.source);
        const tgt = s2Map.get(l.target);
        const hSrc = (l.value / src.value) * src.h;
        const hTgt = (l.value / tgt.value) * tgt.h;
        const y0 = s1Cursor.get(l.source);
        const y1 = s2InCursor.get(l.target);
        s1Cursor.set(l.source, y0 + hSrc);
        s2InCursor.set(l.target, y1 + hTgt);
        return {
          id: `r12-${idx}`,
          source: l.source,
          target: l.target,
          cause: l.source,
          hazard: l.target,
          region: null,
          value: l.value,
          color: getColor(l.target),
          d: ribbonPath(L.xStage1 + L.nodeWidth, y0, y0 + hSrc, L.xStage2, y1, y1 + hTgt),
        };
      });

      // Build Stage 2 -> Stage 3 ribbons with aligned incoming offsets
      const s2OutCursor = new Map(s2Nodes.map((n) => [n.name, n.y]));
      const links23Sorted = [...yearData.links_23].sort((a, b) => {
        const dy = s2Map.get(a.source).y - s2Map.get(b.source).y;
        return dy !== 0 ? dy : s3Map.get(a.target).y - s3Map.get(b.target).y;
      });

      const incomingByRegion = new Map(s3Nodes.map((n) => [n.name, []]));
      for (const l of links23Sorted) incomingByRegion.get(l.target).push(l);

      const tgtOffsets = new Map();
      for (const [regName, list] of incomingByRegion.entries()) {
        const tgt = s3Map.get(regName);
        list.sort((a, b) => s2Map.get(a.source).y - s2Map.get(b.source).y);
        let cur = tgt.y;
        for (const l of list) {
          const hTgt = (l.value / tgt.value) * tgt.h;
          tgtOffsets.set(`${l.source}__${l.target}`, { y1: cur, hTgt });
          cur += hTgt;
        }
      }

      const causeByHazard = new Map(yearData.links_12.map((l) => [l.target, l.source]));
      const ribbons23 = links23Sorted.map((l, idx) => {
        const src = s2Map.get(l.source);
        const hSrc = (l.value / src.value) * src.h;
        const y0 = s2OutCursor.get(l.source);
        s2OutCursor.set(l.source, y0 + hSrc);
        const { y1, hTgt } = tgtOffsets.get(`${l.source}__${l.target}`);
        return {
          id: `r23-${idx}`,
          source: l.source,
          target: l.target,
          cause: causeByHazard.get(l.source) || "Disaster",
          hazard: l.source,
          region: l.target,
          value: l.value,
          color: getColor(l.source),
          d: ribbonPath(L.xStage2 + L.nodeWidth, y0, y0 + hSrc, L.xStage3, y1, y1 + hTgt),
        };
      });

      const conflictVal = s1Map.get("Conflict")?.value || 0;
      const disasterVal = s1Map.get("Disaster")?.value || 0;

      const svg = svgEl("svg", {
        viewBox: `0 0 ${L.viewWidth} ${L.viewHeight}`,
        class: "sankey-svg",
        role: "img",
        "aria-label": `3-stage Sankey diagram of ${formatExact(total)} global internal ${CONFIG.unitLabel} in ${yearData.year}: ${formatPct(conflictVal, total)} from Conflict and ${formatPct(disasterVal, total)} from Disasters flowing through hazard subcategories into ${s3Nodes.length} world regions.`,
      });

      const headerSpecs = [
        { x: L.xStage1 + L.nodeWidth, anchor: "end", text: CONFIG.stageHeaders[0] },
        { x: L.xStage2 + L.nodeWidth / 2, anchor: "middle", text: CONFIG.stageHeaders[1] },
        { x: L.xStage3, anchor: "start", text: CONFIG.stageHeaders[2] },
      ];
      for (const h of headerSpecs) {
        svg.appendChild(
          svgEl("text", { x: h.x, y: 28, "text-anchor": h.anchor, class: "sankey-col-kicker" }, h.text)
        );
      }

      const ribbonsLayer = svgEl("g");
      const nodesLayer = svgEl("g");
      const labelsLayer = svgEl("g");
      svg.append(ribbonsLayer, nodesLayer, labelsLayer);

      const tooltipEl = el("div", { className: "chart-tooltip sankey-tooltip", hidden: true });
      const ribbonEls = new Map();
      const nodeEls = [];

      function positionTooltip(event) {
        if (!event || tooltipEl.hidden) return;
        const rect = plotEl.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const pad = 14;
        const tipW = tooltipEl.offsetWidth || 240;
        const left = x + pad + tipW > rect.width ? Math.max(8, x - tipW - pad) : x + pad;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${Math.max(8, y - 16)}px`;
      }

      function renderTooltipContent(selection) {
        const dotColor = getColor(selection.colorKey || selection.name);
        const bodyNodes = [
          el("strong", null, formatExact(selection.value)),
          ` ${CONFIG.unitLabel} (${formatPct(selection.value, total)})`,
        ];
        if (selection.subtext) {
          bodyNodes.push(el("br"), el("span", { className: "sankey-tooltip-sub" }, selection.subtext));
        }
        tooltipEl.replaceChildren(
          el(
            "div",
            { className: "sankey-tooltip-title" },
            el("span", { className: "sankey-tooltip-dot", style: { backgroundColor: dotColor } }),
            selection.badge
          ),
          el("div", { className: "sankey-tooltip-body" }, ...bodyNodes)
        );
      }

      function applyHighlight(selection, event = null) {
        if (!selection) {
          svg.classList.remove("sankey-has-active");
          for (const pathEl of ribbonEls.values()) pathEl.classList.remove("is-highlighted");
          for (const nodeEl of nodeEls) nodeEl.classList.remove("is-highlighted");
          tooltipEl.hidden = true;
          return;
        }

        svg.classList.add("sankey-has-active");
        const activeCauses = new Set();
        const activeHazards = new Set();
        const activeRegions = new Set();

        for (const r of [...ribbons12, ...ribbons23]) {
          const match =
            (selection.type === "cause" && r.cause === selection.name) ||
            (selection.type === "hazard" && r.hazard === selection.name) ||
            (selection.type === "region" && r.region === selection.name) ||
            (selection.type === "ribbon" && r.id === selection.id);

          ribbonEls.get(r.id)?.classList.toggle("is-highlighted", match);
          if (match) {
            activeCauses.add(r.cause);
            activeHazards.add(r.hazard);
            if (r.region) activeRegions.add(r.region);
          }
        }

        if (selection.type === "region") {
          for (const r of ribbons12) {
            if (activeHazards.has(r.hazard)) {
              ribbonEls.get(r.id)?.classList.add("is-highlighted");
              activeCauses.add(r.cause);
            }
          }
        }

        for (const nodeEl of nodeEls) {
          const { type, name } = nodeEl.dataset;
          const isActive =
            (type === "cause" && activeCauses.has(name)) ||
            (type === "hazard" && activeHazards.has(name)) ||
            (type === "region" && activeRegions.has(name));
          nodeEl.classList.toggle("is-highlighted", isActive);
        }

        if (event) {
          renderTooltipContent(selection);
          tooltipEl.hidden = false;
          positionTooltip(event);
        }
      }

      function bindInteractiveEvents(targetEl, selection) {
        targetEl.addEventListener("mouseenter", (e) => {
          if (!lockedSelection) applyHighlight(selection, e);
        });
        targetEl.addEventListener("mousemove", (e) => {
          if (!lockedSelection) positionTooltip(e);
        });
        targetEl.addEventListener("mouseleave", () => {
          if (!lockedSelection) applyHighlight(null);
        });
        targetEl.addEventListener("focus", () => applyHighlight(selection));
        targetEl.addEventListener("blur", () => {
          if (!lockedSelection) applyHighlight(null);
        });
        targetEl.addEventListener("click", (e) => {
          lockedSelection = lockedSelection?.id === selection.id ? null : selection;
          applyHighlight(lockedSelection, lockedSelection ? e : null);
        });
        targetEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            lockedSelection = lockedSelection?.id === selection.id ? null : selection;
            applyHighlight(lockedSelection);
          } else if (e.key === "Escape") {
            lockedSelection = null;
            applyHighlight(null);
          }
        });
      }

      for (const r of [...ribbons12, ...ribbons23]) {
        const path = svgEl("path", {
          d: r.d,
          fill: r.color,
          class: "sankey-flow",
          tabindex: "0",
          role: "button",
          "aria-label": `${r.source} to ${r.target}: ${formatExact(r.value)} internal ${CONFIG.unitLabel} (${formatPct(r.value, total)})`,
        });
        bindInteractiveEvents(path, {
          type: "ribbon",
          id: r.id,
          name: r.source,
          colorKey: r.hazard,
          badge: `${r.source} → ${r.target}`,
          value: r.value,
          subtext: null,
        });
        ribbonsLayer.appendChild(path);
        ribbonEls.set(r.id, path);
      }

      function renderColumnNodes(nodes, x, type, labelConfig) {
        const labelYs = resolveLabelPositions(
          nodes,
          labelConfig.minSpacing,
          L.topY + 8,
          L.topY + L.plotHeight - 8
        );

        nodes.forEach((n, idx) => {
          const fill = type === "region" ? CONFIG.colors.Region : getColor(n.name);
          const group = svgEl("g", {
            class: "sankey-node-group",
            "data-type": type,
            "data-name": n.name,
            tabindex: "0",
            role: "button",
            "aria-label": `${n.name}: ${formatExact(n.value)} internal ${CONFIG.unitLabel} (${formatPct(n.value, total)})`,
          });

          group.appendChild(
            svgEl("rect", {
              x,
              y: n.y,
              width: L.nodeWidth,
              height: n.h,
              rx: 2,
              fill,
              class: "sankey-node-rect",
            })
          );

          let subtext = null;
          if (type === "hazard" && n.name === CONFIG.pinBottomStage2 && yearData.other_disasters_breakdown?.length) {
            subtext = yearData.other_disasters_breakdown
              .slice(0, 3)
              .map((d) => `${d.name} (${formatCompact(d.value)})`)
              .join(", ");
          } else if (type === "region") {
            const top = yearData.links_23
              .filter((l) => l.target === n.name)
              .sort((a, b) => b.value - a.value)[0];
            if (top) {
              subtext = `Main driver: ${top.source} (${formatPct(top.value, n.value)})`;
            }
          }

          const selection = {
            type,
            id: `${type}:${n.name}`,
            name: n.name,
            colorKey: type === "region" ? "Region" : n.name,
            badge: n.name,
            value: n.value,
            subtext,
          };

          const labelY = labelYs[idx];
          const labelGroup = svgEl("g", {
            class: "sankey-node-label-wrap",
            "data-type": type,
            "data-name": n.name,
          });

          if (Math.abs(labelY - n.midY) > 8) {
            const xEdge = labelConfig.anchor === "end" ? x - 3 : x + L.nodeWidth + 3;
            const xTextEdge = labelConfig.anchor === "end" ? labelConfig.labelX + 5 : labelConfig.labelX - 5;
            labelGroup.appendChild(
              svgEl("path", {
                d: `M ${xEdge},${n.midY.toFixed(1)} L ${((xEdge + xTextEdge) / 2).toFixed(1)},${labelY.toFixed(1)} L ${xTextEdge},${labelY.toFixed(1)}`,
                fill: "none",
                stroke: "#94A3B8",
                "stroke-width": 1.1,
              })
            );
          }

          const titleClass = labelConfig.halo ? "sankey-idmc-title sankey-idmc-halo" : "sankey-idmc-title";
          const metaClass = labelConfig.halo ? "sankey-idmc-meta sankey-idmc-halo" : "sankey-idmc-meta";

          labelGroup.append(
            svgEl("text", { x: labelConfig.labelX, y: labelY - 2, "text-anchor": labelConfig.anchor, class: titleClass }, n.name),
            svgEl("text", { x: labelConfig.labelX, y: labelY + 16, "text-anchor": labelConfig.anchor, class: metaClass }, `${formatCompact(n.value)} · ${formatPct(n.value, total)}`)
          );

          bindInteractiveEvents(group, selection);
          bindInteractiveEvents(labelGroup, selection);

          nodesLayer.appendChild(group);
          labelsLayer.appendChild(labelGroup);
          nodeEls.push(group, labelGroup);
        });
      }

      renderColumnNodes(s1Nodes, L.xStage1, "cause", {
        labelX: L.xStage1 - 16,
        anchor: "end",
        minSpacing: L.labelMinSpacing.stage1,
        halo: false,
      });
      renderColumnNodes(s2Nodes, L.xStage2, "hazard", {
        labelX: L.xStage2 - 14,
        anchor: "end",
        minSpacing: L.labelMinSpacing.stage2,
        halo: true,
      });
      renderColumnNodes(s3Nodes, L.xStage3, "region", {
        labelX: L.xStage3 + L.nodeWidth + 16,
        anchor: "start",
        minSpacing: L.labelMinSpacing.stage3,
        halo: false,
      });

      plotEl.replaceChildren(svg, tooltipEl);

      if (statusEl) {
        statusEl.textContent = `Updated Sankey plot to ${yearData.year}: ${formatCompact(total)} internal ${CONFIG.unitLabel} (${formatPct(conflictVal, total)} conflict, ${formatPct(disasterVal, total)} disasters).`;
      }
    }

    yearInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) render(Number(input.value));
      });
    });

    const checked = yearInputs.find((i) => i.checked);
    render(checked ? Number(checked.value) : dataset.default_year);
  }

  document.addEventListener("DOMContentLoaded", initSankey);
})();
