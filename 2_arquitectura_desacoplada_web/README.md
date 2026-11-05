# Arquitectura 2: Desacoplada (Python ETL + Frontend Modular)

Esta versión desacopla el procesamiento de datos del frontend:
- **Backend / ETL:** Python (`build_data.py`) limpia los 3 CSVs y genera un archivo ligero `data/countries.json` (25 KB).
- **Frontend:** Estructura modular estándar (`index.html`, `styles.css`, `app.js`) que carga el JSON y renderiza el Bubble Plot con búsqueda múltiple por comas.

## Estructura de esta carpeta
```
2_arquitectura_desacoplada_web/
├── data/
│   ├── GDP/GDP_2026_work.csv
│   ├── SDI/SDI_2026_work.csv
│   ├── WHR/WHR_2026_work.csv
│   ├── countries.json           # Datos limpios en formato JSON (25 KB)
│   └── countries_fallback.js    # Respaldo automático para apertura local file://
├── build_data.py                # Pipeline ETL en Python
├── index.html                   # HTML semántico y accesible (~120 líneas)
├── styles.css                   # Hoja de estilos con variables CSS
├── app.js                       # Lógica JS: Plotly, búsqueda múltiple y chips
├── METADATA.md                  # Metodología y justificación de variables
└── README.md
```

## Características especiales de esta versión
- **Búsqueda múltiple:** Permite escribir varios países separados por comas (ej. `Costa Rica, Finland, Spain`).
- **Autocompletado dinámico:** Sugiere países incluso después de escribir comas.
- **Chips interactivos:** Permite eliminar países destacados con un clic.
- **Preparado para 3D:** El archivo `data/countries.json` está listo para ser consumido en el futuro por una escena WebGL/Three.js sin alterar el pipeline.

## Cómo ejecutar o actualizar
1. Si actualizas los CSVs, regenera el JSON:
   ```bash
   python3 build_data.py
   ```
2. Para probar en local con servidor (recomendado):
   ```bash
   python3 -m http.server 8000
   ```
   Y abre `http://localhost:8000` en tu navegador.
   *(También funciona abriendo `index.html` directamente).*

