"""Cleans the Avfall Sverige Swedish Waste Management CSV (1975-2025) and exports
data/waste.json and data/waste_fallback.js for the interactive Streamgraph."""

import csv
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "WASTE" / "sweden_waste_1975_2025.csv"


def parse_int(raw: str) -> int:
    cleaned = raw.strip().replace(",", "")
    return int(cleaned) if cleaned else 0


def build_waste_dataset() -> dict:
    records: list[dict] = []

    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            year = int(row["Year"].strip())
            material_recycling = parse_int(row["material_recycling"])
            biological_treatment = parse_int(row["biological_treatment"])
            energy_recovery = parse_int(row["energy_recovery"])
            landfill = parse_int(row["landfill"])
            prepared_for_reuse = parse_int(row["waste_prepared_for_reuse"])
            construction_recycling = parse_int(row["recycling_of_construction_material"])
            reported_total = parse_int(row["TOTAL"])

            records.append({
                "year": year,
                "material_recycling": material_recycling,
                "biological_treatment": biological_treatment,
                "energy_recovery": energy_recovery,
                "landfill": landfill,
                "waste_prepared_for_reuse": prepared_for_reuse,
                "recycling_of_construction_material": construction_recycling,
                "total": reported_total,
                "source": row["source"].strip(),
                "url": row["URL"].strip(),
            })

    records.sort(key=lambda r: r["year"])

    return {
        "title": "Swedish Municipal Waste Treatment (1975–2025)",
        "unit": "tonnes",
        "source": "Avfall Sverige (Swedish Waste Management)",
        "sources": [
            {
                "label": "Avfall Sverige — Swedish Waste Management (In English)",
                "url": "https://www.avfallsverige.se/in-english/",
            },
            {
                "label": "Swedish Waste Management 2024 Report (PDF)",
                "url": "https://www.avfallsverige.se/media/ca2fijue/swedish-waste-management-2024.pdf",
            },
            {
                "label": "Avfallstrenden 2024 (PDF)",
                "url": "https://www.avfallsverige.se/media/bigjrvsu/avfallstrenden_a4_2024.pdf",
            },
        ],
        "records": records,
    }


def main() -> None:
    dataset = build_waste_dataset()

    json_path = DATA_DIR / "waste.json"
    json_path.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    fallback_js_path = DATA_DIR / "waste_fallback.js"
    fallback_js_path.write_text(
        f"window.__WASTE_FALLBACK__ = {json.dumps(dataset, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    print(
        f"Exported {len(dataset['records'])} yearly waste records "
        f"({dataset['records'][0]['year']}–{dataset['records'][-1]['year']}) "
        f"to {json_path.relative_to(BASE_DIR)}"
    )


if __name__ == "__main__":
    main()
