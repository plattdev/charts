"""Cleans the WHO Healthy Life Expectancy (HALE) CSV (2000-2016) and exports
data/hale.json and data/hale_fallback.js grouped by official WHO regions."""

import csv
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "HALE" / "hale_who_2000_2016.csv"

WHO_REGION_NAMES = (
    "Europe",
    "Western Pacific",
    "Americas",
    "Eastern Mediterranean",
    "South-East Asia",
    "Africa",
)

# Official WHO regional classification for all 183 member states in the dataset
COUNTRY_TO_WHO_REGION: dict[str, str] = {
    # Africa (47)
    "Algeria": "Africa",
    "Angola": "Africa",
    "Benin": "Africa",
    "Botswana": "Africa",
    "Burkina Faso": "Africa",
    "Burundi": "Africa",
    "Cabo Verde": "Africa",
    "Cameroon": "Africa",
    "Central African Republic": "Africa",
    "Chad": "Africa",
    "Comoros": "Africa",
    "Congo": "Africa",
    "Côte d'Ivoire": "Africa",
    "Democratic Republic of the Congo": "Africa",
    "Equatorial Guinea": "Africa",
    "Eritrea": "Africa",
    "Eswatini": "Africa",
    "Ethiopia": "Africa",
    "Gabon": "Africa",
    "Gambia": "Africa",
    "Ghana": "Africa",
    "Guinea": "Africa",
    "Guinea-Bissau": "Africa",
    "Kenya": "Africa",
    "Lesotho": "Africa",
    "Liberia": "Africa",
    "Madagascar": "Africa",
    "Malawi": "Africa",
    "Mali": "Africa",
    "Mauritania": "Africa",
    "Mauritius": "Africa",
    "Mozambique": "Africa",
    "Namibia": "Africa",
    "Niger": "Africa",
    "Nigeria": "Africa",
    "Rwanda": "Africa",
    "Sao Tome & Principe": "Africa",
    "Senegal": "Africa",
    "Seychelles": "Africa",
    "Sierra Leone": "Africa",
    "South Africa": "Africa",
    "South Sudan": "Africa",
    "Togo": "Africa",
    "Uganda": "Africa",
    "United Republic of Tanzania": "Africa",
    "Zambia": "Africa",
    "Zimbabwe": "Africa",
    # Americas (33)
    "Antigua & Barbuda": "Americas",
    "Argentina": "Americas",
    "Bahamas": "Americas",
    "Barbados": "Americas",
    "Belize": "Americas",
    "Bolivia (Plurinational State of)": "Americas",
    "Brazil": "Americas",
    "Canada": "Americas",
    "Chile": "Americas",
    "Colombia": "Americas",
    "Costa Rica": "Americas",
    "Cuba": "Americas",
    "Dominican Republic": "Americas",
    "Ecuador": "Americas",
    "El Salvador": "Americas",
    "Grenada": "Americas",
    "Guatemala": "Americas",
    "Guyana": "Americas",
    "Haiti": "Americas",
    "Honduras": "Americas",
    "Jamaica": "Americas",
    "Mexico": "Americas",
    "Nicaragua": "Americas",
    "Panama": "Americas",
    "Paraguay": "Americas",
    "Peru": "Americas",
    "Saint Lucia": "Americas",
    "Saint Vincent & the Grenadines": "Americas",
    "Suriname": "Americas",
    "Trinidad & Tobago": "Americas",
    "United States of America": "Americas",
    "Uruguay": "Americas",
    "Venezuela (Bolivarian Republic of)": "Americas",
    # Eastern Mediterranean (21)
    "Afghanistan": "Eastern Mediterranean",
    "Bahrain": "Eastern Mediterranean",
    "Djibouti": "Eastern Mediterranean",
    "Egypt": "Eastern Mediterranean",
    "Iran (Islamic Republic of)": "Eastern Mediterranean",
    "Iraq": "Eastern Mediterranean",
    "Jordan": "Eastern Mediterranean",
    "Kuwait": "Eastern Mediterranean",
    "Lebanon": "Eastern Mediterranean",
    "Libya": "Eastern Mediterranean",
    "Morocco": "Eastern Mediterranean",
    "Oman": "Eastern Mediterranean",
    "Pakistan": "Eastern Mediterranean",
    "Qatar": "Eastern Mediterranean",
    "Saudi Arabia": "Eastern Mediterranean",
    "Somalia": "Eastern Mediterranean",
    "Sudan": "Eastern Mediterranean",
    "Syrian Arab Republic": "Eastern Mediterranean",
    "Tunisia": "Eastern Mediterranean",
    "United Arab Emirates": "Eastern Mediterranean",
    "Yemen": "Eastern Mediterranean",
    # Europe (50)
    "Albania": "Europe",
    "Armenia": "Europe",
    "Austria": "Europe",
    "Azerbaijan": "Europe",
    "Belarus": "Europe",
    "Belgium": "Europe",
    "Bosnia & Herzegovina": "Europe",
    "Bulgaria": "Europe",
    "Croatia": "Europe",
    "Cyprus": "Europe",
    "Czechia": "Europe",
    "Denmark": "Europe",
    "Estonia": "Europe",
    "Finland": "Europe",
    "France": "Europe",
    "Georgia": "Europe",
    "Germany": "Europe",
    "Greece": "Europe",
    "Hungary": "Europe",
    "Iceland": "Europe",
    "Ireland": "Europe",
    "Israel": "Europe",
    "Italy": "Europe",
    "Kazakhstan": "Europe",
    "Kyrgyzstan": "Europe",
    "Latvia": "Europe",
    "Lithuania": "Europe",
    "Luxembourg": "Europe",
    "Malta": "Europe",
    "Montenegro": "Europe",
    "Netherlands": "Europe",
    "Norway": "Europe",
    "Poland": "Europe",
    "Portugal": "Europe",
    "Republic of Moldova": "Europe",
    "Romania": "Europe",
    "Russian Federation": "Europe",
    "Serbia": "Europe",
    "Slovakia": "Europe",
    "Slovenia": "Europe",
    "Spain": "Europe",
    "Sweden": "Europe",
    "Switzerland": "Europe",
    "Tajikistan": "Europe",
    "The former Yugoslav republic of Macedonia": "Europe",
    "Turkey": "Europe",
    "Turkmenistan": "Europe",
    "Ukraine": "Europe",
    "United Kingdom of Great Britain & Northern Ireland": "Europe",
    "Uzbekistan": "Europe",
    # South-East Asia (11)
    "Bangladesh": "South-East Asia",
    "Bhutan": "South-East Asia",
    "Democratic People's Republic of Korea": "South-East Asia",
    "India": "South-East Asia",
    "Indonesia": "South-East Asia",
    "Maldives": "South-East Asia",
    "Myanmar": "South-East Asia",
    "Nepal": "South-East Asia",
    "Sri Lanka": "South-East Asia",
    "Thailand": "South-East Asia",
    "Timor-Leste": "South-East Asia",
    # Western Pacific (21)
    "Australia": "Western Pacific",
    "Brunei Darussalam": "Western Pacific",
    "Cambodia": "Western Pacific",
    "China": "Western Pacific",
    "Fiji": "Western Pacific",
    "Japan": "Western Pacific",
    "Kiribati": "Western Pacific",
    "Lao People's Democratic Republic": "Western Pacific",
    "Malaysia": "Western Pacific",
    "Micronesia (Federated States of)": "Western Pacific",
    "Mongolia": "Western Pacific",
    "New Zealand": "Western Pacific",
    "Papua New Guinea": "Western Pacific",
    "Philippines": "Western Pacific",
    "Republic of Korea": "Western Pacific",
    "Samoa": "Western Pacific",
    "Singapore": "Western Pacific",
    "Solomon Islands": "Western Pacific",
    "Tonga": "Western Pacific",
    "Vanuatu": "Western Pacific",
    "Viet Nam": "Western Pacific",
}


def parse_pct(raw: str) -> float:
    return round(float(raw.strip().rstrip("%")), 2)


def parse_num(raw: str) -> float:
    return round(float(raw.strip()), 2)


def build_hale_dataset() -> dict:
    countries: list[dict] = []
    region_benchmarks: dict[str, dict] = {}
    global_benchmark: dict | None = None
    unmapped: list[str] = []

    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.reader(f))[3:]

    for row in rows:
        if not row or not row[0].strip():
            continue
        name = row[0].strip()

        # Filter out the stray header row present in the source sheet
        if name == "WHO region":
            continue

        metrics = {
            "male_pct": parse_pct(row[1]),
            "male_2016": parse_num(row[2]),
            "male_2000": parse_num(row[3]),
            "female_pct": parse_pct(row[4]),
            "female_2016": parse_num(row[5]),
            "female_2000": parse_num(row[6]),
        }

        if name == "(WHO) Global":
            global_benchmark = {"name": "WHO Global", **metrics}
            continue

        if name in WHO_REGION_NAMES:
            region_benchmarks[name] = {"region": name, **metrics}
            continue

        region = COUNTRY_TO_WHO_REGION.get(name)
        if region is None:
            unmapped.append(name)
            continue

        countries.append({
            "country": name,
            "region": region,
            **metrics,
        })

    if unmapped:
        raise ValueError(f"Unmapped countries found: {unmapped}")

    countries.sort(key=lambda d: (WHO_REGION_NAMES.index(d["region"]), d["country"]))

    return {
        "source": "World Health Organization (WHO) — Global Health Observatory",
        "source_url": "http://apps.who.int/gho/data/view.main.HALEXv?lang=en",
        "regions_order": list(WHO_REGION_NAMES),
        "global_benchmark": global_benchmark,
        "region_benchmarks": region_benchmarks,
        "countries": countries,
    }


def main() -> None:
    dataset = build_hale_dataset()

    json_path = DATA_DIR / "hale.json"
    json_path.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    fallback_js_path = DATA_DIR / "hale_fallback.js"
    fallback_js_path.write_text(
        f"window.__HALE_FALLBACK__ = {json.dumps(dataset, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    print(
        f"Exported {len(dataset['countries'])} countries across "
        f"{len(dataset['regions_order'])} WHO regions to {json_path.relative_to(BASE_DIR)}"
    )


if __name__ == "__main__":
    main()
