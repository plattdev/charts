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
        "SDI_work": "Sustainable Development Index Score (SDI_work, 0–100)",
        "WHR": "World Happiness Score (3-Year Avg, 0–10)",
        "GDP_per_capita": "GDP per capita, PPP ($)",
    },
    title="<b>Sustainability (SDI) vs. Happiness (WHR) & Economic Wealth (GDP per Capita, PPP)</b>",
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
    font=dict(family="system-ui, -apple-system, sans-serif", size=14),
    title_x=0.5,
    margin=dict(l=50, r=50, t=70, b=50),
)

# 7. Generar HTML con buscador de países (highlight + shadow) y sección de Metadata/Fuentes
plot_div = fig.to_html(
    include_plotlyjs="cdn",
    full_html=False,
    div_id="bubble-plot",
    config={"responsive": True},
)

options_html = "\n".join(
    f'<option value="{c}"></option>' for c in sorted(df["Country_Label"].tolist())
)

html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SDI vs. Happiness (WHR) & GDP per Capita - Simple Architecture</title>
    <style>
        :root {{
            --bg: #f8fafc;
            --card: #ffffff;
            --text: #1e293b;
            --muted: #64748b;
            --border: #e2e8f0;
            --accent: #6366f1;
        }}
        body {{
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 24px 16px;
            line-height: 1.6;
        }}
        .container {{
            max-width: 1150px;
            margin: 0 auto;
        }}
        .card {{
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 14px;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
            padding: 20px 24px;
            margin-bottom: 24px;
        }}
        .search-bar {{
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-bottom: 8px;
        }}
        .search-bar label {{
            font-weight: 600;
            font-size: 0.95rem;
        }}
        .search-input {{
            padding: 8px 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            font-size: 0.95rem;
            min-width: 260px;
            outline: none;
            transition: border-color 0.15s, box-shadow 0.15s;
        }}
        .search-input:focus {{
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }}
        .btn-clear {{
            padding: 8px 14px;
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            color: var(--text);
        }}
        .btn-clear:hover {{
            background: #e2e8f0;
        }}
        .search-hint {{
            font-size: 0.85rem;
            color: var(--muted);
        }}
        .metadata-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 18px;
            margin-top: 14px;
        }}
        .meta-box {{
            background: #f8fafc;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 14px 16px;
        }}
        .meta-box h4 {{
            margin: 0 0 6px 0;
            font-size: 0.98rem;
            color: #0f172a;
        }}
        .meta-box p {{
            margin: 0;
            font-size: 0.88rem;
            color: #334155;
        }}
        .sources-list {{
            margin-top: 16px;
            padding-top: 14px;
            border-top: 1px solid var(--border);
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
            font-weight: 500;
        }}
        .sources-list a:hover {{
            text-decoration: underline;
        }}
    </style>
</head>
<body>
    <div class="container">
        <!-- Contenedor principal del gráfico y buscador -->
        <div class="card">
            <div class="search-bar">
                <label for="country-search">🔍 Highlight Country:</label>
                <input
                    id="country-search"
                    class="search-input"
                    type="text"
                    list="country-list"
                    placeholder="Type a country (e.g., Costa Rica, Finland, Spain)..."
                    autocomplete="off"
                />
                <datalist id="country-list">
                    {options_html}
                </datalist>
                <button id="clear-search" class="btn-clear" type="button">Reset View</button>
                <span class="search-hint">Select or type to spotlight a country and dim the rest.</span>
            </div>

            {plot_div}
        </div>

        <!-- Metadata & Methodology Card (English) -->
        <div class="card">
            <h3 style="margin-top: 0; margin-bottom: 6px;">About This Visualization & Methodology</h3>
            <p style="margin-top: 0; color: #475569; font-size: 0.94rem;">
                <strong>Core Question:</strong> Which countries are highly efficient at converting their economic resources into actual human well-being and sustainability, and which wealthy nations are underperforming?
            </p>

            <div class="metadata-grid">
                <div class="meta-box">
                    <h4>1. X-Axis: Sustainable Development (Overall Score)</h4>
                    <p>
                        Normalized score (<code>0–100</code>) measuring each country's overall achievement across all <strong>17 UN Sustainable Development Goals (SDGs)</strong>, serving as the headline metric of the <em>Sustainable Development Report</em>.
                    </p>
                </div>
                <div class="meta-box">
                    <h4>2. Y-Axis: World Happiness Index (3-Year Average)</h4>
                    <p>
                        National life evaluation score (<code>0–10</code>) averaged over the three preceding survey years (e.g., 2022–2024). Using a <strong>3-year rolling average</strong> provides a larger sample size for more stable and precise estimates.
                    </p>
                </div>
                <div class="meta-box">
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
        </div>
    </div>

    <script>
        (function() {{
            const plotEl = document.getElementById('bubble-plot');
            const searchInput = document.getElementById('country-search');
            const clearBtn = document.getElementById('clear-search');

            function updateHighlight(query) {{
                const q = query.trim().toLowerCase();
                const trace = plotEl.data[0];
                const countries = trace.customdata.map(d => d[0]);
                const xVals = trace.x;
                const yVals = trace.y;

                if (!q) {{
                    Plotly.restyle(plotEl, {{
                        'marker.opacity': [countries.map(() => 0.60)],
                        'marker.line.width': [countries.map(() => 1.5)],
                        'marker.line.color': [countries.map(() => 'white')]
                    }}, [0]);
                    Plotly.relayout(plotEl, {{ annotations: [] }});
                    return;
                }}

                const opacities = [];
                const lineWidths = [];
                const lineColors = [];
                const annotations = [];

                countries.forEach((name, idx) => {{
                    const isMatch = name.toLowerCase().includes(q);
                    if (isMatch) {{
                        opacities.push(0.98);
                        lineWidths.push(3);
                        lineColors.push('#0f172a');
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
                            ay: -34,
                            bgcolor: 'rgba(255, 255, 255, 0.92)',
                            bordercolor: '#0f172a',
                            borderwidth: 1.2,
                            borderpad: 4,
                            font: {{ size: 12, color: '#0f172a' }}
                        }});
                    }} else {{
                        opacities.push(0.12);
                        lineWidths.push(1);
                        lineColors.push('white');
                    }}
                }});

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

