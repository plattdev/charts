# Happy GDP SDI — Visualización de Desarrollo Sostenible, Felicidad y Riqueza

Este proyecto compara la eficiencia con la que 140 naciones convierten sus recursos económicos (**PIB per cápita PPA**) en bienestar humano (**Índice de Felicidad - WHR**) y sostenibilidad (**Índice de Desarrollo Sostenible - SDI**).

El repositorio está organizado en **tres arquitecturas independientes** para facilitar su estudio y desarrollo:

---

## Carpetas de las tres arquitecturas

### 📁 [`1_arquitectura_simple_python/`](./1_arquitectura_simple_python/)
* **Enfoque:** Monolítico en Python.
* **Componente clave:** `generate_plot.py` lee los CSV y compila directamente `index.html`.
* **Ideal para:** Gráficos estáticos rápidos donde quieres trabajar únicamente desde un script de Python y exportar un único archivo HTML para tu portfolio.

### 📁 [`2_arquitectura_desacoplada_web/`](./2_arquitectura_desacoplada_web/)
* **Enfoque:** Desacoplado (Python ETL + Frontend Web Modular).
* **Componentes clave:**
  - `build_data.py`: Genera `data/countries.json` (25 KB).
  - `index.html` + `styles.css` + `app.js`: Interfaz web moderna con Plotly.js, búsqueda múltiple de países separados por comas y chips interactivos.
* **Ideal para:** Portfolios web modernos, integración con frameworks o evolución futura.

### 📁 [`3_arquitectura_3d_threejs/`](./3_arquitectura_3d_threejs/)
* **Enfoque:** Visualización 3D WebGL (Three.js).
* **Componentes clave:**
  - `build_data.py`: Mismo pipeline ETL que la Arquitectura 2.
  - `scene.js`: Escena Three.js con esferas PBR, iluminación de estudio, ejes 3D y controles orbitales.
  - `index.html` + `styles.css`: Interfaz dark-mode inmersiva con tooltip en hover y búsqueda por comas.
* **Eje Z:** Añade `log₁₀(GDP per capita, PPP)` como tercera dimensión espacial, permitiendo explorar visualmente la relación tridimensional entre sostenibilidad, felicidad y riqueza.
* **Ideal para:** Portfolios de alto impacto visual, narrativas interactivas y futura extensión con animaciones cinemáticas.

---

## Documentación metodológica
Para consultar la justificación estadística de cada variable, fórmulas y fuentes oficiales, revisa el archivo `METADATA.md` incluido en cada carpeta de arquitectura.

