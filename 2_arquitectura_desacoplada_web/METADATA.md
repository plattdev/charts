# Data Methodology & Visualization Metadata

## Project Overview
**Core Research Question:** *Which countries are highly efficient at converting their economic resources into actual human well-being and environmental/social sustainability, and which wealthy nations are underperforming?*

This interactive bubble chart cross-references three foundational dimensions of global development across **140 countries**:
1. **Sustainability Achievement (X-Axis):** Sustainable Development Report Overall Score (`SDI_work`).
2. **Subjective Well-Being (Y-Axis):** World Happiness Report Life Evaluation Score (`WHR`).
3. **Economic Output / Wealth Volume (Bubble Area & Color):** GDP per capita, PPP (`constant 2021 international $`).

---

## Variable Definitions & Methodological Justification

### 1. X-Axis: Sustainable Development Index (`Overall_Score`)
* **Metric:** `Overall_Score` (normalized on a `0–100` scale).
* **Definition:** Measures a country's total progress toward achieving all **17 UN Sustainable Development Goals (SDGs)**. A score of 100 indicates that all SDGs have been achieved.
* **Why this metric:** It serves as the primary headline indicator of the *Sustainable Development Report*, capturing social, institutional, and environmental performance in a single standardized metric.
* **Source:** [Sustainable Development Report 2026 – Data Explorer & Downloads](https://dashboards.sdgindex.org/downloads/)

### 2. Y-Axis: World Happiness Index (`Life evaluation, 3-year average`)
* **Metric:** Cantril Ladder Life Evaluation Score (`0–10` scale), calculated as a **3-year rolling average** (e.g., 2022–2024 for the 2025 report).
* **Definition:** Respondents evaluate their current life on a ladder from `0` (worst possible life) to `10` (best possible life).
* **Why the 3-year average:** Following the official *World Happiness Report* methodology, countries are ranked using their three-year average life evaluation score because the larger combined sample size reduces year-to-year sampling noise and yields significantly more precise national estimates.
* **Source:** [World Happiness Report – Data Sharing](https://www.worldhappiness.report/data-sharing/)

### 3. Bubble Size & Color: GDP per Capita, PPP (`constant 2021 international $`)
* **Metric:** Gross Domestic Product per capita adjusted for Purchasing Power Parity (PPP) in constant 2021 international dollars (using the **most recent available year** per country in the 1990–2025 series).
* **Why GDP per capita, PPP (constant 2021 international $) instead of nominal GDP?**
  1. **Alignment with the World Happiness Report:** The official statistical appendix of the *World Happiness Report* explicitly uses PPP-adjusted GDP per capita at constant international prices as its baseline economic predictor of well-being.
  2. **Cost-of-Living Adjustment (PPP):** Purchasing Power Parity is essential when comparing human well-being across borders, as $1 USD does not buy the same basket of goods and services in every country due to local cost-of-living differences.
  3. **Inflation Removal (Constant 2021 Prices):** Anchoring values to a constant base year (2021) removes distortions caused by inflation and currency fluctuations, ensuring fair and homogeneous cross-country comparisons.
* **Source:** [World Bank – GDP per capita](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD)

---

## Visual Encoding Best Practices

| Visual Channel | Variable | Encoding Rule & Perceptual Rationale |
| :--- | :--- | :--- |
| **Horizontal Position (X)** | `Overall_Score` (SDG Index) | Linear scale (`0–100`). High-precision spatial encoding for comparing sustainability performance. |
| **Vertical Position (Y)** | `Life evaluation (3-yr avg)` | Linear scale (`0–10`). Pairs with X to reveal the efficiency frontier (high happiness + high sustainability). |
| **Bubble Area** | `GDP per capita, PPP` | **Radius $\propto \sqrt{\text{GDP}}$** (`sizemode: 'area'`). Human vision perceives 2D circle size by **area** ($\pi r^2$), not radius. Scaling the radius by the square root of GDP prevents wealthy nations from visually distorting the chart. |
| **Bubble Color** | `GDP per capita, PPP` | **`Plasma` perceptually uniform colormap** (dark purple/lilac for low GDP $\rightarrow$ bright yellow for high GDP). Reinforces wealth differences even when bubbles overlap. |
| **Interactive Search / Focus** | `Country Name` | Selecting a country keeps it at full opacity (`0.95`) with a dark halo and text label while dimming ("shadowing") all context bubbles to `0.12` opacity (Focus + Context pattern). |

