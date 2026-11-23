#!/usr/bin/env python3
"""
Build IDMC GIDD Internal Displacement 3-Stage Sankey dataset
(Cause -> Hazard Type -> Geographical Region) from the disaggregated GeoJSON.

Filters strictly to Internal Displacements (flows, excluding year-end IDPs stocks),
fills Conflict hazard blanks with "Conflict & Violence", keeps the 5 major disaster
hazards (Flood, Storm, Drought, Wildfire, Earthquake) and groups long-tail hazards
into "Other Disasters".
"""

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

SOURCE_PATH = Path("/Users/nbm/Downloads/IDMC_GIDD_Internal_Displacement_Disaggregated.geojson")
OUT_DIR = Path(__file__).resolve().parent / "data"

TOP_HAZARDS = ["Flood", "Storm", "Drought", "Wildfire", "Earthquake"]


def normalize_hazard(raw_hazard: str) -> str:
    h = (raw_hazard or "").strip()
    if not h:
        return "Other Disasters"
    hl = h.lower()
    if "flood" in hl:
        return "Flood"
    if "storm" in hl or "cyclone" in hl or "hurricane" in hl or "typhoon" in hl or "tornado" in hl:
        return "Storm"
    if "drought" in hl:
        return "Drought"
    if "wildfire" in hl or "fire" in hl:
        return "Wildfire"
    if "earthquake" in hl or "seismic" in hl or "tsunami" in hl:
        return "Earthquake"
    return "Other Disasters"


def main():
    print(f"Loading {SOURCE_PATH} ...")
    with SOURCE_PATH.open("r", encoding="utf-8") as fh:
        data = json.load(fh)

    features = data.get("features", [])
    print(f"Total features: {len(features):,}")

    # Inspect categories and disaster property keys
    categories = Counter()
    causes = Counter()
    disaster_sample = None
    for feat in features:
        p = feat.get("properties", {})
        categories[p.get("Figure category")] += 1
        causes[p.get("Figure cause")] += 1
        if disaster_sample is None and str(p.get("Figure cause") or "").lower() == "disaster" and p.get("Year") == 2025:
            disaster_sample = p

    print("Figure categories:", categories.most_common())
    print("Figure causes:", causes.most_common())
    if disaster_sample:
        print("Sample 2025 Disaster keys:", list(disaster_sample.keys()))
        print(
            "Sample 2025 Disaster hazard fields:",
            {k: v for k, v in disaster_sample.items() if "hazard" in k.lower() or "trigger" in k.lower() or "figure" in k.lower() or "cause" in k.lower()},
        )

    target_years = [2020, 2021, 2022, 2023, 2024, 2025]
    by_year = {
        y: {
            "total": 0,
            "events": 0,
            "s1_to_s2": defaultdict(int),
            "s2_to_s3": defaultdict(int),
            "raw_hazards": defaultdict(int),
            "other_breakdown": defaultdict(int),
        }
        for y in target_years
    }

    for feat in features:
        p = feat.get("properties", {})
        year = p.get("Year")
        if year not in by_year:
            continue

        # Strictly use Internal Displacements (flows), not year-end IDPs stock
        fig_cat = str(p.get("Figure category") or "").strip().lower()
        if "internal displacement" not in fig_cat:
            continue

        raw_fig = p.get("Total figures")
        if raw_fig is None:
            raw_fig = p.get("Reported figures")
        if raw_fig is None:
            continue
        try:
            fig = int(round(float(raw_fig)))
        except (ValueError, TypeError):
            continue
        if fig <= 0:
            continue

        raw_cause = str(p.get("Figure cause") or p.get("Event cause") or "").strip()
        if "conflict" in raw_cause.lower():
            cause = "Conflict"
        elif "disaster" in raw_cause.lower():
            cause = "Disaster"
        else:
            continue

        # Extract hazard type for Disaster rows; fill Conflict rows with "Conflict & Violence"
        raw_hazard = (
            p.get("Hazard Type")
            or p.get("Hazard type")
            or p.get("Hazard Sub Type")
            or p.get("Event main trigger")
            or ""
        )
        raw_hazard_str = str(raw_hazard).strip()

        if cause == "Conflict":
            hazard = "Conflict & Violence"
        else:
            hazard = normalize_hazard(raw_hazard_str)
            if hazard == "Other Disasters":
                by_year[year]["other_breakdown"][raw_hazard_str or "Unspecified"] += fig

        region = str(p.get("Geographical region") or "Unknown Region").strip()

        b = by_year[year]
        b["total"] += fig
        b["events"] += 1
        b["s1_to_s2"][(cause, hazard)] += fig
        b["s2_to_s3"][(hazard, region)] += fig
        b["raw_hazards"][raw_hazard_str or "(empty)"] += fig

    records = {}
    for year in target_years:
        b = by_year[year]
        if b["total"] == 0:
            continue

        cause_totals = defaultdict(int)
        hazard_totals = defaultdict(int)
        region_totals = defaultdict(int)
        for (c, h), v in b["s1_to_s2"].items():
            cause_totals[c] += v
            hazard_totals[h] += v
        for (h, r), v in b["s2_to_s3"].items():
            region_totals[r] += v

        records[str(year)] = {
            "year": year,
            "total": b["total"],
            "events": b["events"],
            "causes": [
                {"name": name, "value": val}
                for name, val in sorted(cause_totals.items(), key=lambda x: -x[1])
            ],
            "hazards": [
                {"name": name, "value": val}
                for name, val in sorted(hazard_totals.items(), key=lambda x: -x[1])
            ],
            "regions": [
                {"name": name, "value": val}
                for name, val in sorted(region_totals.items(), key=lambda x: -x[1])
            ],
            "links_12": [
                {"source": c, "target": h, "value": v}
                for (c, h), v in sorted(b["s1_to_s2"].items(), key=lambda x: -x[1])
            ],
            "links_23": [
                {"source": h, "target": r, "value": v}
                for (h, r), v in sorted(b["s2_to_s3"].items(), key=lambda x: -x[1])
            ],
            "other_disasters_breakdown": [
                {"name": name, "value": val}
                for name, val in sorted(b["other_breakdown"].items(), key=lambda x: -x[1])[:8]
            ],
        }

        print(f"\n=== YEAR {year}: {b['total']:,} internal displacements ({b['events']:,} records) ===")
        print("  Causes:", dict(cause_totals))
        print("  Hazards:", dict(sorted(hazard_totals.items(), key=lambda x: -x[1])))
        print("  Regions:", dict(sorted(region_totals.items(), key=lambda x: -x[1])))
        if year == 2025:
            print("  2025 Other Disasters breakdown:", dict(sorted(b["other_breakdown"].items(), key=lambda x: -x[1])))

    if not records:
        print("ERROR: No records extracted!", file=sys.stderr)
        sys.exit(1)

    payload = {
        "source": {
            "name": "Internal Displacement Monitoring Centre (IDMC) — Global Internal Displacement Database (GIDD)",
            "url": "https://www.internal-displacement.org/database/displacement-data/",
            "metric": "Internal Displacements (flows)",
            "license": "CC BY-NC 4.0",
        },
        "default_year": 2025 if "2025" in records else max(int(y) for y in records),
        "years": sorted(int(y) for y in records),
        "by_year": records,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / "idmc_sankey.json"
    js_path = OUT_DIR / "idmc_sankey_fallback.js"

    json_text = json.dumps(payload, indent=2, ensure_ascii=False)
    json_path.write_text(json_text + "\n", encoding="utf-8")
    js_path.write_text(f"window.__IDMC_SANKEY_FALLBACK__ = {json_text};\n", encoding="utf-8")
    print(f"\nWrote {json_path} ({len(json_text):,} bytes) and {js_path}")


if __name__ == "__main__":
    main()
