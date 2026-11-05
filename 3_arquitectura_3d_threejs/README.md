# Arquitectura 3: Visualización 3D Interactiva (Three.js + WebGL)

Escena 3D completa donde cada país flota como una esfera translúcida con materiales físicos (PBR), iluminación de estudio y controles de cámara orbital.

## ¿Qué añade la tercera dimensión?

A diferencia de las arquitecturas 1 y 2 (donde las burbujas codifican el PIB solo con tamaño y color), aquí el **eje Z = log₁₀(GDP per capita, PPP)** convierte la riqueza en una dimensión espacial real, permitiendo explorar visualmente la relación tridimensional entre sostenibilidad, felicidad y riqueza:

| Eje | Variable | Color del eje |
|-----|----------|---------------|
| **X** | SDI Score (0–100) | 🔴 Rojo |
| **Y** | WHR Score (0–10) | 🟢 Verde |
| **Z** | log₁₀(GDP per capita, PPP) | 🔵 Azul |

## Estructura
```
3_arquitectura_3d_threejs/
├── data/
│   ├── GDP/, SDI/, WHR/        # CSV originales
│   ├── countries.json           # Datos limpios
│   └── countries_fallback.js    # Respaldo para file://
├── build_data.py                # Pipeline ETL en Python
├── index.html                   # HTML semántico (~95 líneas)
├── styles.css                   # Estilos dark-mode con variables CSS
├── scene.js                     # Escena Three.js (ES Module)
├── METADATA.md                  # Documentación metodológica
└── README.md
```

## Características
- **Materiales PBR:** Esferas con `MeshPhysicalMaterial` (roughness, clearcoat) e iluminación de 3 puntos.
- **Paleta Plasma:** Color interpolado de lila oscuro (GDP bajo) a amarillo brillante (GDP alto).
- **Controles orbitales:** Click izquierdo = rotar · Click derecho = desplazar · Scroll = zoom.
- **Hover con tooltip:** Al pasar el ratón sobre una esfera se muestran los datos detallados del país.
- **Búsqueda multi-país con comas:** Idéntica funcionalidad que la Arquitectura 2, pero el spotlight reduce la opacidad de las esferas en 3D.
- **Ejes y etiquetas como sprites:** Texto renderizado en canvas 2D y proyectado como sprites 3D que siempre miran a la cámara.
- **URL Shareable:** `?countries=Spain,Finland` carga directamente con esos países destacados.

## Cómo ejecutar
1. Si cambias los CSV, regenera el JSON:
   ```bash
   python3 build_data.py
   ```
2. Abre con servidor local (**obligatorio** para módulos ES y fetch):
   ```bash
   python3 -m http.server 8000
   ```
   Abre `http://localhost:8000` en tu navegador.

> **Nota:** A diferencia de las otras arquitecturas, esta requiere servidor local porque Three.js se importa como módulo ES (`import ... from "three"`).

