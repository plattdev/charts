"""
Arquitectura 1 (Simple Monolítica):
Script en Python que procesa los CSV y genera un único archivo 'index.html'
autocontenido listo para publicar en el portfolio.
"""

import numpy as np
import pandas as pd
import plotly.express as px

# 1. Cargar los 3 archivos CSV (separados por ';')
sdi = pd.read_csv("data/SDI/SDI_2026_work.csv", sep=";")
whr = pd.read_csv("data/WHR/WHR_2026_work.csv", sep=";", decimal=",")
gdp = pd.read_csv("data/GDP/GDP_2026_work.csv", sep=";")

# 2. Tomar el PIB per cápita del año MÁS RECIENTE disponible (entre 1990 y 2025)
year_cols = [str(y) for y in range(1990, 2026) if str(y) in gdp.columns]
gdp_years = gdp[year_cols].apply(pd.to_numeric, errors="coerce")

# Último valor no nulo por fila y el año al que corresponde
gdp["GDP_per_capita"] = gdp_years.ffill(axis=1).iloc[:, -1]
gdp["GDP_Year"] = (
    gdp_years.iloc[:, ::-1]
    .notna()
    .idxmax(axis=1)
    .where(gdp["GDP_per_capita"].notna(), other="")
)

# 3. Unir SDI y GDP usando el código ISO de 3 letras (coincidencia exacta)
df = pd.merge(
    sdi[["Country", "Name", "Overall_Score"]],
    gdp[["Country Code", "GDP_per_capita", "GDP_Year"]],
    left_on="Country",
    right_on="Country Code",
)

# 4. Homologar nombres de países que difieren entre WHR y SDI/Banco Mundial
mapeo_nombres = {
    "Viet Nam": "Vietnam",
    "Republic of Korea": "Korea, Rep.",
    "Republic of Moldova": "Moldova",
    "Slovakia": "Slovak Republic",
    "Kyrgyzstan": "Kyrgyz Republic",
    "Venezuela": "Venezuela, RB",
    "Iran": "Iran, Islamic Rep.",
    "Côte d’Ivoire": "Cote d'Ivoire",
    "Congo": "Congo, Rep.",
    "DR Congo": "Congo, Dem. Rep.",
    "Gambia": "Gambia, The",
    "Egypt": "Egypt, Arab Rep.",
    "Yemen": "Yemen, Rep.",
}
whr["Name_clean"] = whr["Country name"].replace(mapeo_nombres)

# 5. Unir con WHR y limpiar filas con datos faltantes
df = pd.merge(
    df,
    whr[["Name_clean", "Country name", "Rank", "Life evaluation (3-year average)"]],
    left_on="Name",
    right_on="Name_clean",
).dropna(subset=["Overall_Score", "Life evaluation (3-year average)", "GDP_per_capita"])

# Punto 1: Ordenar por PIB per cápita descendente para que las burbujas grandes
# se dibujen primero al fondo y las pequeñas queden siempre visibles encima (Z-order).
df = df.sort_values("GDP_per_capita", ascending=False).reset_index(drop=True)
df = df.rename(columns={
    "Country name": "Country_Label",
    "Overall_Score": "SDI_work",
    "Life evaluation (3-year average)": "WHR",
})

# Raíz cuadrada del PIB per cápita (radio ∝ √GDP -> área ∝ volumen de riqueza)
df["sqrt_GDP"] = np.sqrt(df["GDP_per_capita"])

# 6. Crear el Bubble Plot interactivo con Plotly Express
fig = px.scatter(
    df,
    x="SDI_work",
    y="WHR",
    size="GDP_per_capita",
    color="GDP_per_capita",
    hover_name="Country_Label",
    custom_data=["Country_Label", "GDP_per_capita", "GDP_Year", "Rank"],
    color_continuous_scale="Plasma",  # De lila oscuro (GDP bajo) a amarillo (GDP alto)
    size_max=38,  # Punto 3: Reducir escala máxima para evitar solapamiento excesivo
    labels={
        "SDI_work": "Sustainable Development Index Score",
        "WHR": "World Happiness Score (3-Year Avg)",
        "GDP_per_capita": "GDP",
    },
    template="plotly_white",
)

fig.update_traces(
    hovertemplate=(
        "<b>%{customdata[0]}</b> (WHR Rank #%{customdata[3]})<br>"
        "SDI Score: %{x:.2f} / 100<br>"
        "Happiness (3-yr avg): %{y:.2f} / 10<br>"
        "GDP per capita (PPP, %{customdata[2]}): $%{customdata[1]:,.0f}"
        "<extra></extra>"
    ),
    # Punto 2: Opacidad a 0.60 y borde blanco de 1.5px para máxima legibilidad en solapamientos
    marker=dict(opacity=0.60, line=dict(width=1.5, color="white")),
)

fig.update_layout(
    height=680,
    font=dict(family='"National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif', size=13.5, color="#0f172a"),
    margin=dict(l=55, r=40, t=25, b=55),
    paper_bgcolor="rgba(0,0,0,0)",
    plot_bgcolor="rgba(0,0,0,0)",
)

# 7. Generar HTML con buscador de países (highlight + shadow) y sección de Metadata/Fuentes
plot_div = fig.to_html(
    include_plotlyjs="cdn",
    full_html=False,
    div_id="bubble-plot",
    config={"responsive": True, "displaylogo": False},
)

options_html = "\n".join(
    f'<option value="{c}"></option>' for c in sorted(df["Country_Label"].tolist())
)

html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Which countries convert their economic resources into actual human well-being and sustainability?</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-page: #ffffff;
            --surface-gray: #f4f6f8;
            --text: #0f172a;
            --text-secondary: #475569;
            --muted: #64748b;
            --border: #cbd5e1;
            --border-subtle: #e2e8f0;
            --accent: #4f46e5;
            --accent-soft: rgba(79, 70, 229, 0.1);
        }}
        *, *::before, *::after {{
            box-sizing: border-box;
        }}
        body {{
            font-family: "National 2", "National", "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-page);
            color: var(--text);
            margin: 0;
            padding: 0;
            line-height: 1.6;
            min-height: 100vh;
        }}
        /* Columna central de 1500px con bordes laterales sinusoidales en la misma dirección (longitud de onda de 720px) */
        .container {{
            width: 100%;
            max-width: 1500px;
            margin: 0 auto;
            min-height: 100vh;
            padding: 40px 56px 64px;
            background-image:
                url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2050%20720%22%20width%3D%2250%22%20height%3D%22720%22%3E%3Cpath%20d%3D%22M%2025%2C0%20C%2045%2C108%2045%2C252%2025%2C360%20C%205%2C468%205%2C612%2025%2C720%20L%2050%2C720%20L%2050%2C0%20Z%22%20fill%3D%22%23f4f6f8%22/%3E%3C/svg%3E"),
                url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2050%20720%22%20width%3D%2250%22%20height%3D%22720%22%3E%3Cpath%20d%3D%22M%2025%2C0%20C%2045%2C108%2045%2C252%2025%2C360%20C%205%2C468%205%2C612%2025%2C720%20L%200%2C720%20L%200%2C0%20Z%22%20fill%3D%22%23f4f6f8%22/%3E%3C/svg%3E"),
                linear-gradient(var(--surface-gray), var(--surface-gray));
            background-repeat: repeat-y, repeat-y, no-repeat;
            background-position: left top, right top, center top;
            background-size: 50px 720px, 50px 720px, calc(100% - 98px) 100%;
        }}
        /* En smartphone: solo fondo gris uniforme sin la figura sinusoidal */
        @media (max-width: 768px) {{
            body {{
                background-color: var(--surface-gray);
            }}
            .container {{
                padding: 24px 16px 48px;
                background-image: none;
                background-color: var(--surface-gray);
            }}
        }}

        /* Cabecera y jerarquía tipográfica editorial con National */
        .page-header {{
            margin-bottom: 20px;
        }}
        .page-title {{
            font-family: "National 2", "National", "Plus Jakarta Sans", system-ui, sans-serif;
            font-size: clamp(2.2rem, 3.4vw, 3.35rem);
            font-weight: 800;
            letter-spacing: -0.035em;
            line-height: 1.12;
            color: var(--text);
            margin: 0 0 18px 0;
            max-width: 1300px;
            text-wrap: balance;
        }}
        .header-subbar {{
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 28px;
            flex-wrap: wrap;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--border-subtle);
        }}
        .page-subtitle {{
            flex: 1 1 380px;
            margin: 0;
            color: var(--text-secondary);
            font-size: 1.05rem;
            line-height: 1.55;
        }}
        .page-subtitle strong {{
            color: var(--text);
            font-weight: 600;
        }}

        /* Contenedor UX/UI del buscador: colocado debajo del título a la derecha */
        .search-spotlight-box {{
            flex: 0 1 450px;
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }}
        .search-input-group {{
            position: relative;
            display: flex;
            align-items: center;
            background: #ffffff;
            border: 1px solid var(--border);
            border-radius: 6px;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }}
        .search-input-group:focus-within {{
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.14);
        }}
        .search-icon-slot {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding-left: 13px;
            color: var(--muted);
            pointer-events: none;
        }}
        .search-input {{
            flex: 1;
            min-height: 44px;
            border: none;
            background: transparent;
            padding: 8px 12px;
            font-family: inherit;
            font-size: 0.95rem;
            color: var(--text);
            outline: none;
        }}
        .search-input::placeholder {{
            color: var(--muted);
            opacity: 0.85;
        }}
        .btn-reset {{
            background: transparent;
            border: none;
            color: var(--text-secondary);
            font-family: inherit;
            font-size: 0.82rem;
            font-weight: 600;
            padding: 6px 12px;
            margin-right: 6px;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.15s ease, color 0.15s ease;
        }}
        .btn-reset:hover {{
            background-color: #f1f5f9;
            color: var(--text);
        }}
        .search-meta {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            font-size: 0.8rem;
        }}
        .search-hint {{
            color: var(--muted);
        }}
        .country-counter {{
            color: var(--text-secondary);
            font-weight: 600;
            white-space: nowrap;
        }}
        .chips-row {{
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            min-height: 4px;
            margin-top: 2px;
        }}
        .chip {{
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 7px 2px 9px;
            background-color: var(--accent-soft);
            color: #312e81;
            border: 1px solid rgba(79, 70, 229, 0.25);
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 600;
        }}
        .chip-remove {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            padding: 0;
            border: 0;
            border-radius: 2px;
            background: transparent;
            color: #312e81;
            font-size: 0.95rem;
            line-height: 1;
            cursor: pointer;
        }}
        .chip-remove:hover {{
            background-color: rgba(79, 70, 229, 0.2);
        }}

        .viz-section {{
            margin-bottom: 36px;
        }}

        .methodology-section {{
            border-top: 1px solid var(--border-subtle);
            padding-top: 32px;
            margin-top: 24px;
        }}
        .methodology-section h3 {{
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--text);
        }}
        .methodology-lead {{
            margin-top: 0;
            color: var(--text-secondary);
            font-size: 0.98rem;
        }}
        .metadata-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 28px;
            margin-top: 24px;
        }}
        .meta-col h4 {{
            margin: 0 0 8px 0;
            font-size: 1rem;
            color: var(--text);
            font-weight: 700;
        }}
        .meta-col p {{
            margin: 0;
            font-size: 0.92rem;
            color: var(--text-secondary);
            line-height: 1.55;
        }}
        .sources-list {{
            margin-top: 32px;
            padding-top: 16px;
            border-top: 1px solid var(--border-subtle);
            font-size: 0.88rem;
            color: var(--muted);
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            align-items: center;
        }}
        .sources-list a {{
            color: var(--accent);
            text-decoration: none;
            font-weight: 600;
        }}
        .sources-list a:hover {{
            text-decoration: underline;
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Cabecera con título destacado y buscador UX/UI alineado a la derecha -->
        <header class="page-header">
            <h1 class="page-title">Which countries convert their economic resources into actual human well-being and sustainability?</h1>
            <div class="header-subbar">
                <p class="page-subtitle">
                    Comparing 140 nations across <strong>Sustainable Development (SDI)</strong>, <strong>World Happiness (WHR)</strong>, and <strong>GDP per capita (PPP)</strong>.
                </p>
                <div class="search-spotlight-box">
                    <div class="search-input-group">
                        <span class="search-icon-slot" aria-hidden="true">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </span>
                        <input
                            id="country-search"
                            class="search-input"
                            type="search"
                            list="country-list"
                            placeholder="Search countries: Costa Rica, Finland..."
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <datalist id="country-list">
                            {options_html}
                        </datalist>
                        <button id="clear-search" class="btn-reset" type="button" aria-label="Reset spotlight filter">Reset</button>
                    </div>

                    <div id="active-chips" class="chips-row"></div>
                </div>
            </div>
        </header>

        <!-- Visualización Bubble Plot -->
        <section class="viz-section">
            {plot_div}
        </section>

        <!-- Metadata & Metodología en columnas limpias -->
        <section class="methodology-section">
            <h3>About This Visualization & Methodology</h3>
            <p class="methodology-lead">
                <strong>Core Question:</strong> Which countries are highly efficient at converting their economic resources into actual human well-being and sustainability, and which wealthy nations are underperforming?
            </p>

            <div class="metadata-grid">
                <div class="meta-col">
                    <h4>1. X-Axis: Sustainable Development (Overall Score)</h4>
                    <p>
                        Normalized score (<code>0–100</code>) measuring each country's overall achievement across all <strong>17 UN Sustainable Development Goals (SDGs)</strong>, serving as the headline metric of the <em>Sustainable Development Report</em>.
                    </p>
                </div>
                <div class="meta-col">
                    <h4>2. Y-Axis: World Happiness Index (3-Year Average)</h4>
                    <p>
                        National life evaluation score (<code>0–10</code>) averaged over the three preceding survey years (e.g., 2022–2024). Using a <strong>3-year rolling average</strong> provides a larger sample size for more stable and precise estimates.
                    </p>
                </div>
                <div class="meta-col">
                    <h4>3. Bubble Size & Color: GDP per Capita, PPP (Constant 2021 $)</h4>
                    <p>
                        Following the official <em>World Happiness Report</em> statistical appendix, wealth is measured via <strong>Purchasing Power Parity (PPP)</strong> at constant 2021 international dollars (using the latest available year). PPP accounts for local cost-of-living differences, while constant prices remove inflation distortion. Bubble radius scales with <code>√GDP</code> so visual area accurately reflects wealth volume.
                    </p>
                </div>
            </div>

            <div class="sources-list">
                <strong>Data Sources:</strong>
                <a href="https://data.worldbank.org/indicator/NY.GDP.PCAP.CD" target="_blank" rel="noopener noreferrer">World Bank (GDP per capita)</a>
                <span>•</span>
                <a href="https://dashboards.sdgindex.org/downloads/" target="_blank" rel="noopener noreferrer">Sustainable Development Report 2026 – Data Explorer & Downloads</a>
                <span>•</span>
                <a href="https://www.worldhappiness.report/data-sharing/" target="_blank" rel="noopener noreferrer">World Happiness Report – Data Sharing</a>
            </div>
        </section>
    </div>

    <script>
        (function() {{
            const plotEl = document.getElementById('bubble-plot');
            const searchInput = document.getElementById('country-search');
            const clearBtn = document.getElementById('clear-search');
            const counterEl = document.getElementById('country-counter');
            const chipsEl = document.getElementById('active-chips');

            function renderChips(tokens) {{
                chipsEl.innerHTML = '';
                tokens.forEach(token => {{
                    const chip = document.createElement('span');
                    chip.className = 'chip';
                    chip.innerHTML = `${{token}} <button type="button" class="chip-remove" aria-label="Remove ${{token}}">×</button>`;
                    chip.querySelector('.chip-remove').addEventListener('click', () => {{
                        const remaining = searchInput.value
                            .split(',')
                            .map(t => t.trim())
                            .filter(t => t.toLowerCase() !== token.toLowerCase());
                        searchInput.value = remaining.join(', ');
                        updateHighlight(searchInput.value);
                    }});
                    chipsEl.appendChild(chip);
                }});
            }}

            function updateHighlight(query) {{
                const tokens = query.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
                const trace = plotEl.data[0];
                const countries = trace.customdata.map(d => d[0]);
                const xVals = trace.x;
                const yVals = trace.y;

                if (tokens.length === 0) {{
                    Plotly.restyle(plotEl, {{
                        'marker.opacity': [countries.map(() => 0.60)],
                        'marker.line.width': [countries.map(() => 1.5)],
                        'marker.line.color': [countries.map(() => 'white')]
                    }}, [0]);
                    Plotly.relayout(plotEl, {{ annotations: [] }});
                    counterEl.textContent = `${{countries.length}} countries`;
                    chipsEl.innerHTML = '';
                    return;
                }}

                renderChips(tokens);

                const opacities = [];
                const lineWidths = [];
                const lineColors = [];
                const annotations = [];
                let matchCount = 0;

                countries.forEach((name, idx) => {{
                    const lowerName = name.toLowerCase();
                    const isMatch = tokens.some(tok => lowerName.includes(tok));
                    if (isMatch) {{
                        matchCount++;
                        opacities.push(0.98);
                        lineWidths.push(3);
                        lineColors.push('#0f172a');
                        if (matchCount <= 15) {{
                            annotations.push({{
                                x: xVals[idx],
                                y: yVals[idx],
                                text: `<b>${{name}}</b>`,
                                showarrow: true,
                                arrowhead: 2,
                                arrowsize: 1,
                                arrowwidth: 1.5,
                                arrowcolor: '#0f172a',
                                ax: 0,
                                ay: -32,
                                bgcolor: 'rgba(255, 255, 255, 0.95)',
                                bordercolor: '#0f172a',
                                borderwidth: 1.2,
                                borderpad: 4,
                                font: {{ family: '"National 2", "National", "Plus Jakarta Sans", sans-serif', size: 12, color: '#0f172a' }}
                            }});
                        }}
                    }} else {{
                        opacities.push(0.12);
                        lineWidths.push(1);
                        lineColors.push('white');
                    }}
                }});

                counterEl.textContent = `${{matchCount}} of ${{countries.length}} countries`;

                Plotly.restyle(plotEl, {{
                    'marker.opacity': [opacities],
                    'marker.line.width': [lineWidths],
                    'marker.line.color': [lineColors]
                }}, [0]);

                Plotly.relayout(plotEl, {{ annotations: annotations }});
            }}

            searchInput.addEventListener('input', (e) => updateHighlight(e.target.value));
            clearBtn.addEventListener('click', () => {{
                searchInput.value = '';
                updateHighlight('');
                searchInput.focus();
            }});
        }})();
    </script>
</body>
</html>
"""

with open("index.html", "w", encoding="utf-8") as f:
    f.write(html_template)

print(f"Gráfica generada con éxito en index.html ({len(df)} países incluidos).")

