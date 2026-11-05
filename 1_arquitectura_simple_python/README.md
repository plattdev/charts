# Arquitectura 1: Monolítica en Python (Exportación Estática)

Esta versión utiliza un único script en Python (`generate_plot.py`) que procesa los archivos CSV originales y compila directamente un archivo `index.html` autocontenido.

## Estructura de esta carpeta
```
1_arquitectura_simple_python/
├── data/
│   ├── GDP/GDP_2026_work.csv
│   ├── SDI/SDI_2026_work.csv
│   └── WHR/WHR_2026_work.csv
├── generate_plot.py     # Script principal en Python
├── index.html           # Gráfico generado con Plotly.js (autocontenido)
├── METADATA.md          # Metodología y justificación de variables
└── README.md
```

## Cómo ejecutar o actualizar
1. Instala las dependencias si no las tienes:
   ```bash
   pip install pandas plotly numpy
   ```
2. Ejecuta el script:
   ```bash
   python3 generate_plot.py
   ```
3. Abre `index.html` con doble clic en tu navegador.

