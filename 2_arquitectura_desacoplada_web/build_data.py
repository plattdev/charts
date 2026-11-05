"""Cleans and merges CSV sources into data/countries.json
Solo lee los 3 CSV, toma el último año disponible de PIB (1990–2025), 
calcula sqrt_gdp y exporta un JSON limpio."""

import json
from pathlib import Path
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def build_dataset() -> list[dict]:
    # 1. Read raw CSV files
    sdi = pd.read_csv(DATA_DIR / "SDI" / "SDI_2026_work.csv", sep=";")
    whr = pd.read_csv(DATA_DIR / "WHR" / "WHR_2026_work.csv", sep=";", decimal=",")
    gdp = pd.read_csv(DATA_DIR / "GDP" / "GDP_2026_work.csv", sep=";")

    # 2. Extract the most recent available GDP per capita (PPP) across 1990-2025
    year_cols = [str(y) for y in range(1990, 2026) if str(y) in gdp.columns]
    gdp_years = gdp[year_cols].apply(pd.to_numeric, errors="coerce")

    gdp["gdp_ppp"] = gdp_years.ffill(axis=1).iloc[:, -1]
    gdp["gdp_year"] = (
        gdp_years.iloc[:, ::-1]
        .notna()
        .idxmax(axis=1)
        .where(gdp["gdp_ppp"].notna(), other="")
    )

    # 3. Merge SDI and GDP via exact 3-letter ISO code
    merged = pd.merge(
        sdi[["Country", "Name", "Overall_Score"]],
        gdp[["Country Code", "gdp_ppp", "gdp_year"]],
        left_on="Country",
        right_on="Country Code",
    )

    # 4. Harmonize country names between WHR and SDI / World Bank
    name_mapping = {
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
    whr["Name_clean"] = whr["Country name"].replace(name_mapping)

    # 5. Merge with WHR and drop incomplete records
    df = pd.merge(
        merged,
        whr[["Name_clean", "Country name", "Rank", "Life evaluation (3-year average)"]],
        left_on="Name",
        right_on="Name_clean",
    ).dropna(subset=["Overall_Score", "Life evaluation (3-year average)", "gdp_ppp"])

    df = (
        df.rename(columns={
            "Country name": "country_label",
            "Life evaluation (3-year average)": "whr_score",
        })
        .sort_values("country_label")
        .reset_index(drop=True)
    )

    # 6. Build clean JSON records
    records = []
    for row in df.itertuples(index=False):
        gdp_val = float(row.gdp_ppp)
        records.append({
            "iso3": str(row.Country),
            "country": str(row.country_label),
            "sdi": round(float(row.Overall_Score), 3),
            "whr": round(float(row.whr_score), 3),
            "whr_rank": int(row.Rank),
            "gdp_ppp": round(gdp_val, 2),
            "gdp_year": int(row.gdp_year),
            "sqrt_gdp": round(float(np.sqrt(gdp_val)), 4),
        })

    return records


def main() -> None:
    records = build_dataset()

    json_path = DATA_DIR / "countries.json"
    json_payload = json.dumps(records, ensure_ascii=False, indent=2)
    json_path.write_text(json_payload, encoding="utf-8")

    # Optional local file:// fallback (when opening index.html without a local HTTP server)
    fallback_js_path = DATA_DIR / "countries_fallback.js"
    fallback_js_path.write_text(
        f"window.__COUNTRIES_FALLBACK__ = {json.dumps(records, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    print(f"Exported {len(records)} countries to {json_path.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
