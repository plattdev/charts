"""Cleans the WHO Data.who.int Healthy Life Expectancy (HALE at birth) CSV
(C64284D_ALL_LATEST.csv, 2000-2021) and exports data/hale.json and
data/hale_fallback.js grouped by official WHO regions."""

import csv
import json
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CSV_PATH = DATA_DIR / "HALE" / "C64284D_ALL_LATEST.csv"

# Ordered highest-to-lowest by 2021 WHO regional HALE (Both Sexes)
WHO_REGION_NAMES = (
    "Western Pacific",
    "Europe",
    "Americas",
    "South-East Asia",
    "Eastern Mediterranean",
    "Africa",
)

# Official WHO regional classification for all 185 countries & territories in C64284D_ALL_LATEST.csv
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
    "Sao Tome and Principe": "Africa",
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
    # Americas (34, including Puerto Rico)
    "Antigua and Barbuda": "Americas",
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
    "Puerto Rico": "Americas",
    "Saint Lucia": "Americas",
    "Saint Vincent and the Grenadines": "Americas",
    "Suriname": "Americas",
    "Trinidad and Tobago": "Americas",
    "United States of America": "Americas",
    "Uruguay": "Americas",
    "Venezuela (Bolivarian Republic of)": "Americas",
    # Eastern Mediterranean (22, including occupied Palestinian territory)
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
    "occupied Palestinian territory, including east Jerusalem": "Eastern Mediterranean",
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
    "Bosnia and Herzegovina": "Europe",
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
    "Netherlands (Kingdom of the)": "Europe",
    "North Macedonia": "Europe",
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
    "Türkiye": "Europe",
    "Turkmenistan": "Europe",
    "Ukraine": "Europe",
    "United Kingdom of Great Britain and Northern Ireland": "Europe",
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

ENTITY_GEO_TYPES = {
    "COUNTRY",
    "NATIONAL LIBERATION MOVEMENT",
    "ORGANIZED, UNINCORPORATED TERRITORY",
}

SEX_MAP = {
    "TOTAL": "total",
    "FEMALE": "female",
    "MALE": "male",
}


def compute_series_block(series_by_sex: dict[str, dict[int, float]], years: list[int]) -> dict:
    """Build ordered yearly value arrays and 2000->latest % change per sex."""
    block: dict = {}
    first_year = years[0]
    last_year = years[-1]

    for sex_key in ("total", "female", "male"):
        ymap = series_by_sex[sex_key]
        vals = [round(ymap[y], 2) for y in years]
        v_start = ymap[first_year]
        v_end = ymap[last_year]
        pct = round(((v_end - v_start) / v_start) * 100.0, 2) if v_start else 0.0
        block[sex_key] = vals
        block[f"{sex_key}_pct"] = pct

    return block


def build_hale_dataset() -> dict:
    years_set: set[int] = set()
    global_raw: dict[str, dict[int, float]] = defaultdict(dict)
    region_raw: dict[str, dict[str, dict[int, float]]] = defaultdict(lambda: defaultdict(dict))
    country_raw: dict[str, dict[str, dict[int, float]]] = defaultdict(lambda: defaultdict(dict))
    unmapped: set[str] = set()

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            geo_type = row["DIM_GEO_CODE_TYPE"].strip()
            geo_name = row["GEO_NAME_SHORT"].strip()
            sex_code = row["DIM_SEX"].strip()
            if sex_code not in SEX_MAP:
                continue

            year = int(row["DIM_TIME"].strip())
            val = float(row["AMOUNT_N"].strip())
            sex_key = SEX_MAP[sex_code]
            years_set.add(year)

            if geo_type == "GLOBAL":
                global_raw[sex_key][year] = val
            elif geo_type == "WHOREGION":
                region_raw[geo_name][sex_key][year] = val
            elif geo_type in ENTITY_GEO_TYPES:
                if geo_name not in COUNTRY_TO_WHO_REGION:
                    unmapped.add(geo_name)
                    continue
                country_raw[geo_name][sex_key][year] = val

    if unmapped:
        raise ValueError(f"Unmapped countries/territories found: {sorted(unmapped)}")

    years = sorted(years_set)

    global_benchmark = {
        "name": "WHO Global",
        **compute_series_block(global_raw, years),
    }

    region_benchmarks = {
        region: {
            "region": region,
            **compute_series_block(region_raw[region], years),
        }
        for region in WHO_REGION_NAMES
    }

    countries = [
        {
            "country": name,
            "region": COUNTRY_TO_WHO_REGION[name],
            **compute_series_block(series_by_sex, years),
        }
        for name, series_by_sex in country_raw.items()
    ]
    countries.sort(key=lambda d: (WHO_REGION_NAMES.index(d["region"]), d["country"]))

    return {
        "source": "World Health Organization (WHO) — data.who.int (WHOSIS_000002)",
        "source_url": "https://data.who.int/indicators/i/C64284D",
        "csv_url": "https://srhdpeuwpubsa.blob.core.windows.net/whdh/DATADOT/INDICATOR/C64284D_ALL_LATEST.csv",
        "years": years,
        "regions_order": list(WHO_REGION_NAMES),
        "global_benchmark": global_benchmark,
        "region_benchmarks": region_benchmarks,
        "countries": countries,
    }


def main() -> None:
    dataset = build_hale_dataset()

    json_path = DATA_DIR / "hale.json"
    json_path.write_text(
        json.dumps(dataset, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    fallback_js_path = DATA_DIR / "hale_fallback.js"
    fallback_js_path.write_text(
        f"window.__HALE_FALLBACK__ = {json.dumps(dataset, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )

    print(
        f"Exported {len(dataset['countries'])} countries/territories across "
        f"{len(dataset['regions_order'])} WHO regions ({dataset['years'][0]}–{dataset['years'][-1]}) "
        f"to {json_path.relative_to(BASE_DIR)} ({json_path.stat().st_size / 1024:.1f} KB)"
    )


if __name__ == "__main__":
    main()
