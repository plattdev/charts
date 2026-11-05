/**
 * Architecture 3 — Interactive 3D Bubble Plot (Three.js)
 *
 * Axes:
 *   X = SDI score (0-100)  — red
 *   Y = WHR score (0-10)   — green
 *   Z = log₁₀(GDP per capita PPP) — blue  (adds analytical depth)
 *
 * Sphere radius ∝ √GDP  →  visual area ∝ GDP
 * Colour:  Plasma colourmap (dark purple → yellow) mapped to GDP
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ──────────────────── Constants ────────────────────

const PLASMA = [
  [0.0, 0x0d0887],
  [0.1, 0x3b049a],
  [0.2, 0x5b02a3],
  [0.3, 0x7e03a8],
  [0.4, 0x9a179b],
  [0.5, 0xb52f8c],
  [0.6, 0xcb4678],
  [0.7, 0xde5f65],
  [0.8, 0xeb7852],
  [0.9, 0xfbb32f],
  [1.0, 0xf0f921],
];

const SPHERE_SCALE = 0.006; // Radius multiplier for √GDP
const DEFAULT_OPACITY = 0.88;
const DIMMED_OPACITY = 0.08;
const HIGHLIGHT_OPACITY = 1.0;

// Scene extent: how far the data maps into 3D space
const RANGE_X = 20; // SDI 0-100 maps to 0..RANGE_X
const RANGE_Y = 12; // WHR 0-10  maps to 0..RANGE_Y
const RANGE_Z = 12; // log₁₀(GDP) maps to 0..RANGE_Z

// ──────────────────── Helpers ────────────────────

function normalizeText(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Interpolate the Plasma colourmap at t ∈ [0, 1] */
function samplePlasma(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < PLASMA.length - 1; i++) {
    const [t0, c0] = PLASMA[i];
    const [t1, c1] = PLASMA[i + 1];
    if (clamped >= t0 && clamped <= t1) {
      const f = (clamped - t0) / (t1 - t0);
      const color0 = new THREE.Color(c0);
      const color1 = new THREE.Color(c1);
      return color0.lerp(color1, f);
    }
  }
  return new THREE.Color(PLASMA[PLASMA.length - 1][1]);
}

/** Fetch countries data */
async function loadData() {
  try {
    const res = await fetch("./data/countries.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return new Promise((resolve, reject) => {
      if (Array.isArray(window.__COUNTRIES_FALLBACK__)) {
        resolve(window.__COUNTRIES_FALLBACK__);
        return;
      }
      const s = document.createElement("script");
      s.src = "./data/countries_fallback.js";
      s.onload = () =>
        Array.isArray(window.__COUNTRIES_FALLBACK__)
          ? resolve(window.__COUNTRIES_FALLBACK__)
          : reject(new Error("Fallback missing"));
      s.onerror = () => reject(new Error("Could not load data"));
      document.head.appendChild(s);
    });
  }
}

// ──────────────────── Scene Setup ────────────────────

async function init() {
  const data = await loadData();

  // Pre-compute data ranges for normalisation
  const gdpValues = data.map((d) => d.gdp_ppp);
  const gdpMin = Math.min(...gdpValues);
  const gdpMax = Math.max(...gdpValues);
  const logGdpMin = Math.log10(gdpMin);
  const logGdpMax = Math.log10(gdpMax);

  // ── Renderer ──
  const container = document.getElementById("scene-container");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b0e17, 1);
  container.appendChild(renderer.domElement);

  // ── Scene ──
  const scene = new THREE.Scene();

  // ── Camera ──
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(RANGE_X * 0.9, RANGE_Y * 0.7, RANGE_Z * 1.6);

  // ── Controls ──
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(RANGE_X / 2, RANGE_Y / 2, RANGE_Z / 2);
  controls.minDistance = 5;
  controls.maxDistance = 80;

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(15, 20, 10);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0x9ab4ff, 0.3);
  fillLight.position.set(-10, -5, 15);
  scene.add(fillLight);

  // ── Grid & Axes ──
  buildAxes(scene);

  // ── Spheres ──
  const sharedGeometry = new THREE.SphereGeometry(1, 28, 20);
  const spheres = [];
  const sphereGroup = new THREE.Group();

  for (const item of data) {
    const t = (item.gdp_ppp - gdpMin) / (gdpMax - gdpMin || 1);
    const color = samplePlasma(t);

    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.25,
      metalness: 0.05,
      clearcoat: 0.3,
      clearcoatRoughness: 0.4,
      transparent: true,
      opacity: DEFAULT_OPACITY,
    });

    const radius = Math.sqrt(item.gdp_ppp) * SPHERE_SCALE;

    const mesh = new THREE.Mesh(sharedGeometry, material);
    mesh.scale.setScalar(Math.max(radius, 0.08));

    // Map data to 3D coordinates
    const x = (item.sdi / 100) * RANGE_X;
    const y = (item.whr / 10) * RANGE_Y;
    const logGdp = Math.log10(item.gdp_ppp);
    const z = ((logGdp - logGdpMin) / (logGdpMax - logGdpMin)) * RANGE_Z;

    mesh.position.set(x, y, z);
    mesh.userData = item;

    sphereGroup.add(mesh);
    spheres.push(mesh);
  }

  scene.add(sphereGroup);

  // ── Raycaster for hover ──
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-999, -999);
  const tooltipEl = document.getElementById("tooltip");
  let hoveredMesh = null;

  renderer.domElement.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(spheres, false);

    if (hits.length > 0 && hits[0].object !== hoveredMesh) {
      hoveredMesh = hits[0].object;
      const d = hoveredMesh.userData;
      tooltipEl.innerHTML = `
        <div class="tooltip-title">${d.country} <span style="color:var(--text-muted);font-size:0.78rem;">#${d.whr_rank}</span></div>
        <div class="tooltip-row"><strong>SDI:</strong> ${d.sdi.toFixed(2)} / 100</div>
        <div class="tooltip-row"><strong>Happiness:</strong> ${d.whr.toFixed(2)} / 10</div>
        <div class="tooltip-row"><strong>GDP (PPP, ${d.gdp_year}):</strong> $${d.gdp_ppp.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
      `;
      tooltipEl.classList.add("visible");
    } else if (hits.length === 0) {
      hoveredMesh = null;
      tooltipEl.classList.remove("visible");
    }

    if (hoveredMesh) {
      tooltipEl.style.left = `${e.clientX + 16}px`;
      tooltipEl.style.top = `${e.clientY - 12}px`;
    }
  });

  // ── Search / Highlight ──
  setupSearch(data, spheres);

  // ── Resize ──
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Animate ──
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  animate();
}

// ──────────────────── 3D Axes & Labels ────────────────────

function buildAxes(scene) {
  const axisMat = (hex) =>
    new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.55 });

  // Axis lines (from origin to extent)
  const axes = [
    { from: [0, 0, 0], to: [RANGE_X, 0, 0], color: 0xff6b6b },
    { from: [0, 0, 0], to: [0, RANGE_Y, 0], color: 0x69db7c },
    { from: [0, 0, 0], to: [0, 0, RANGE_Z], color: 0x74c0fc },
  ];

  for (const { from, to, color } of axes) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
    scene.add(new THREE.Line(geo, axisMat(color)));
  }

  // Grid lines on floor (Y = 0 plane)
  const gridMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.06,
  });

  const gridLines = 10;
  for (let i = 0; i <= gridLines; i++) {
    const fx = (i / gridLines) * RANGE_X;
    const fz = (i / gridLines) * RANGE_Z;

    // Lines parallel to Z
    const geoZ = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fx, 0, 0),
      new THREE.Vector3(fx, 0, RANGE_Z),
    ]);
    scene.add(new THREE.Line(geoZ, gridMat));

    // Lines parallel to X
    const geoX = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, fz),
      new THREE.Vector3(RANGE_X, 0, fz),
    ]);
    scene.add(new THREE.Line(geoX, gridMat));
  }

  // Tick labels using sprites
  const createLabel = (text, pos, color = 0xcccccc, size = 0.42) => {
    const canvas = document.createElement("canvas");
    const w = 256;
    const h = 64;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 36px system-ui, sans-serif";
    ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(...pos);
    sprite.scale.set(size * (w / h), size, 1);
    scene.add(sprite);
  };

  // X-axis ticks (SDI 0, 20, 40, 60, 80, 100)
  for (let v = 0; v <= 100; v += 20) {
    const x = (v / 100) * RANGE_X;
    createLabel(String(v), [x, -0.6, -0.4], 0xff6b6b, 0.38);
  }
  createLabel("SDI Score →", [RANGE_X / 2, -1.3, -0.5], 0xff6b6b, 0.55);

  // Y-axis ticks (WHR 0, 2, 4, 6, 8, 10)
  for (let v = 0; v <= 10; v += 2) {
    const y = (v / 10) * RANGE_Y;
    createLabel(String(v), [-0.7, y, -0.3], 0x69db7c, 0.38);
  }
  createLabel("Happiness ↑", [-1.5, RANGE_Y / 2, -0.3], 0x69db7c, 0.55);

  // Z-axis label
  createLabel("log₁₀(GDP) →", [0, -1.3, RANGE_Z / 2], 0x74c0fc, 0.55);
}

// ──────────────────── Search System ────────────────────

function setupSearch(data, spheres) {
  const searchInput = document.getElementById("country-search");
  const datalistEl = document.getElementById("country-list");
  const formEl = document.getElementById("country-filter-form");
  const clearBtn = document.getElementById("clear-search");
  const chipsEl = document.getElementById("active-chips");

  // Populate datalist
  updateDatalist(datalistEl, data, "");

  function findMatches(rawQuery) {
    const tokens = rawQuery
      .split(",")
      .map((t) => normalizeText(t))
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const normNames = data.map((d) => normalizeText(d.country));
    const exactSet = new Set(normNames);
    const matched = new Set();

    for (const tok of tokens) {
      const isExact = exactSet.has(tok);
      normNames.forEach((name, idx) => {
        if (isExact ? name === tok : name.includes(tok)) {
          matched.add(idx);
        }
      });
    }
    return Array.from(matched);
  }

  function applySearch(raw) {
    updateDatalist(datalistEl, data, raw);

    const hasToken = raw.split(",").some((t) => t.trim().length > 0);
    const matchedIdx = hasToken ? findMatches(raw) : [];
    const matchedSet = new Set(matchedIdx);
    const isActive = hasToken && matchedIdx.length > 0;

    spheres.forEach((mesh, i) => {
      if (!isActive) {
        mesh.material.opacity = DEFAULT_OPACITY;
        mesh.renderOrder = 0;
      } else if (matchedSet.has(i)) {
        mesh.material.opacity = HIGHLIGHT_OPACITY;
        mesh.renderOrder = 1;
      } else {
        mesh.material.opacity = DIMMED_OPACITY;
        mesh.renderOrder = 0;
      }
    });

    renderChips(
      chipsEl,
      matchedIdx.map((i) => data[i]),
      removeCountry
    );
  }

  function removeCountry(country) {
    const normRemove = normalizeText(country);
    const remaining = searchInput.value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && normalizeText(t) !== normRemove);
    searchInput.value = remaining.join(", ");
    applySearch(searchInput.value);
    searchInput.focus();
  }

  searchInput.addEventListener("input", (e) => applySearch(e.target.value));
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    applySearch(searchInput.value);
  });
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    applySearch("");
    searchInput.focus();
  });

  // URL parameter support
  const urlQ = new URLSearchParams(window.location.search).get("countries");
  if (urlQ) {
    searchInput.value = urlQ;
    applySearch(urlQ);
  }
}

function updateDatalist(datalistEl, data, rawValue) {
  const lastComma = rawValue.lastIndexOf(",");
  const chosen =
    lastComma !== -1
      ? new Set(
          rawValue
            .slice(0, lastComma)
            .split(",")
            .map((t) => normalizeText(t))
            .filter(Boolean)
        )
      : new Set();

  const prefix =
    lastComma !== -1
      ? rawValue
          .slice(0, lastComma)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .join(", ") + ", "
      : "";

  const frag = document.createDocumentFragment();
  for (const item of data) {
    if (chosen.has(normalizeText(item.country))) continue;
    const opt = document.createElement("option");
    opt.value = prefix + item.country;
    frag.appendChild(opt);
  }
  datalistEl.replaceChildren(frag);
}

function renderChips(container, items, onRemove) {
  container.replaceChildren();
  if (items.length === 0) return;

  if (items.length > 12) {
    const span = document.createElement("span");
    span.className = "chip chip-summary";
    span.textContent = `${items.length} countries highlighted`;
    container.appendChild(span);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item.country;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-remove";
    btn.setAttribute("aria-label", `Remove ${item.country}`);
    btn.textContent = "×";
    btn.addEventListener("click", () => onRemove(item.country));

    chip.appendChild(btn);
    frag.appendChild(chip);
  }
  container.appendChild(frag);
}

// ──────────────────── Boot ────────────────────

init();

