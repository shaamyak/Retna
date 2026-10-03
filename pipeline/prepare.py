#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GlaucoMap Data Pipeline - prepare.py
Reads VF_and_clinical_information.xlsx, computes per-visit MS/VF-SD,
and outputs public/data/patients.json

Usage:  python pipeline/prepare.py
"""

import json
import sys
import numpy as np
import pandas as pd
from pathlib import Path

ROOT       = Path(__file__).parent.parent
EXCEL_PATH = ROOT / "data" / "raw" / "VF and clinical information.xlsx"
OUT_PATH   = ROOT / "public" / "data" / "patients.json"

# VF columns: the sheets label them VF_0 … VF_60
VF_PREFIX = "VF_"
VF_COUNT  = 61


# ── Utility functions ──────────────────────────────────────────────────────────

def flatten_headers(df: pd.DataFrame) -> pd.DataFrame:
    """Collapse two-row multi-level header into single underscore-joined strings."""
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = [
            "_".join(
                str(c).strip()
                for c in col
                if str(c).strip() not in ("", "nan", "Unnamed")
                   and not str(c).startswith("Unnamed")
            )
            for col in df.columns
        ]
    return df


def find_col(df: pd.DataFrame, candidates: list) -> str | None:
    """Return the first matching column name (exact then partial, case-insensitive)."""
    cols = list(df.columns)
    cols_lower = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand in cols:
            return cand
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    # Partial match
    for cand in candidates:
        for col in cols:
            if cand.lower() in col.lower():
                return col
    return None


def vf_cols_for(df: pd.DataFrame) -> list:
    """Return ordered list of VF column names (VF_0 … VF_60) present in df."""
    result = []
    for i in range(VF_COUNT):
        # Accept both 'VF_0' and plain '0'
        for name in [f"VF_{i}", str(i)]:
            if name in df.columns:
                result.append(name)
                break
    return result


def compute_ms(row, cols: list):
    """Mean Sensitivity from VF grid, excluding -1 (masked/BS). Returns (ms, sd, count)."""
    vals = []
    for c in cols:
        try:
            v = float(row[c])
            if not np.isnan(v) and v != -1.0:
                vals.append(v)
        except (TypeError, ValueError, KeyError):
            pass
    if not vals:
        return None, None, 0
    return float(np.mean(vals)), float(np.std(vals)) if len(vals) > 1 else 0.0, len(vals)


def vf_grid(row, cols: list) -> list:
    """Return 61-element list; None where -1 or missing."""
    grid = []
    for c in cols:
        try:
            v = float(row[c])
            grid.append(None if np.isnan(v) or v == -1.0 else v)
        except (TypeError, ValueError, KeyError):
            grid.append(None)
    # Pad to 61 if shorter
    while len(grid) < VF_COUNT:
        grid.append(None)
    return grid[:VF_COUNT]


def ols_slope(xs: list, ys: list) -> float | None:
    """OLS slope; None if fewer than 2 valid paired points."""
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pairs) < 2:
        return None
    xa = np.array([p[0] for p in pairs], dtype=float)
    ya = np.array([p[1] for p in pairs], dtype=float)
    n = len(xa)
    denom = n * (xa * xa).sum() - xa.sum() ** 2
    if abs(denom) < 1e-10:
        return None
    return float((n * (xa * ya).sum() - xa.sum() * ya.sum()) / denom)


def safe_float(v) -> float | None:
    try:
        f = float(v)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def safe_int(v) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def derive_stage(ms: float | None) -> str | None:
    """Approximate stage from baseline MS tercile. Labeled 'approximate' in the UI."""
    if ms is None:
        return None
    if ms >= 28:
        return "Suspect"
    elif ms >= 22:
        return "Early"
    elif ms >= 15:
        return "Moderate"
    else:
        return "Advanced"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not EXCEL_PATH.exists():
        print(f"ERROR: Excel file not found at {EXCEL_PATH}")
        print("Place the file at:  data/raw/VF and clinical information.xlsx")
        sys.exit(1)

    print(f"Reading {EXCEL_PATH} ...")

    # ── Baseline sheet ────────────────────────────────────────────────────────
    baseline = flatten_headers(
        pd.read_excel(EXCEL_PATH, sheet_name="Baseline", header=[0, 1])
    )
    print(f"  Baseline : {len(baseline)} rows  |  first cols: {list(baseline.columns[:8])}")

    # ── Follow-up sheet ───────────────────────────────────────────────────────
    followup = flatten_headers(
        pd.read_excel(EXCEL_PATH, sheet_name="Follow-up", header=[0, 1])
    )
    print(f"  Follow-up: {len(followup)} rows  |  first cols: {list(followup.columns[:8])}")

    # ── Locate columns (Baseline) ─────────────────────────────────────────────
    def bc(c): return find_col(baseline, c)

    subj_b   = bc(["Subject Number", "Subject_Number"])
    lat_b    = bc(["Laterality"])
    age_c    = bc(["Age"])
    gender_c = bc(["Gender", "Sex"])
    iop_b    = bc(["IOP"])
    cct_c    = bc(["CCT"])
    tv_c     = bc(["Total Visits", "Total_Visits"])
    plr2_c   = bc(["PLR2"])
    plr3_c   = bc(["PLR3"])
    md_c     = bc(["MD"])          # progression flag, NOT a dB value
    cat_c    = bc(["Category of Glaucoma", "Category"])
    rnfl_mean_c = bc(["OCT RNFL thickness_Mean", "Mean", "RNFL_Mean"])
    rnfl_s_c    = bc(["OCT RNFL thickness_S", "S", "Superior"])
    rnfl_n_c    = bc(["OCT RNFL thickness_N", "N", "Nasal"])
    rnfl_i_c    = bc(["OCT RNFL thickness_I", "I", "Inferior"])
    rnfl_t_c    = bc(["OCT RNFL thickness_T", "T", "Temporal"])
    cfp_b    = bc(["Corresponding CFP", "CFP"])
    acq_b    = bc(["Acquisition Device"])
    res_b    = bc(["Resolusion", "Resolution"])

    # ── Locate columns (Follow-up) ────────────────────────────────────────────
    def fc(c): return find_col(followup, c)

    subj_f   = fc(["Subject Number", "Subject_Number"])
    lat_f    = fc(["Laterality"])
    visit_f  = fc(["Visit Number", "Visit_Number"])
    intv_f   = fc(["Interval Years", "Interval_Years", "Interval"])
    iop_f    = fc(["IOP"])
    cfp_f    = fc(["Corresponding CFP", "CFP"])
    acq_f    = fc(["Acquisition Device"])
    res_f    = fc(["Resolusion", "Resolution"])

    vfb = vf_cols_for(baseline)
    vff = vf_cols_for(followup)
    print(f"  Baseline VF cols : {len(vfb)}  (e.g. {vfb[:3] if vfb else 'none'})")
    print(f"  Follow-up VF cols: {len(vff)}  (e.g. {vff[:3] if vff else 'none'})")
    print(f"  Key baseline cols: subj={subj_b}, lat={lat_b}, iop={iop_b}, "
          f"rnfl_mean={rnfl_mean_c}, plr2={plr2_c}, plr3={plr3_c}, md={md_c}")

    # ── Index follow-up rows by (subject, laterality) ─────────────────────────
    fu_groups: dict[tuple, list] = {}
    for _, row in followup.iterrows():
        s = safe_int(row.get(subj_f)) if subj_f else None
        l = str(row.get(lat_f, "")).strip().upper() if lat_f else None
        if s is None or l not in ("OD", "OS"):
            continue
        fu_groups.setdefault((s, l), []).append(row)

    # ── Build patient records ─────────────────────────────────────────────────
    patients = []

    for _, brow in baseline.iterrows():
        subj = safe_int(brow.get(subj_b)) if subj_b else None
        lat  = str(brow.get(lat_b, "")).strip().upper() if lat_b else None
        if subj is None or lat not in ("OD", "OS"):
            continue

        pid = f"{subj}_{lat}"

        age    = safe_int(brow.get(age_c)) if age_c else None
        gender = str(brow.get(gender_c, "M")).strip().upper()[:1] if gender_c else "M"
        if gender not in ("M", "F"):
            gender = "M"

        b_iop = safe_float(brow.get(iop_b)) if iop_b else None
        cct   = safe_float(brow.get(cct_c)) if cct_c else None
        tv    = safe_int(brow.get(tv_c)) if tv_c else None

        plr2    = bool(safe_int(brow.get(plr2_c)) == 1) if plr2_c else False
        plr3    = bool(safe_int(brow.get(plr3_c)) == 1) if plr3_c else False
        md_flag = bool(safe_int(brow.get(md_c)) == 1) if md_c else False

        cat_raw = str(brow.get(cat_c, "OAG")).strip() if cat_c else "OAG"
        category = "ACG" if "ACG" in cat_raw.upper() else "OAG"

        rnfl_mean = safe_float(brow.get(rnfl_mean_c)) if rnfl_mean_c else None
        rnfl_s    = safe_float(brow.get(rnfl_s_c)) if rnfl_s_c else None
        rnfl_n    = safe_float(brow.get(rnfl_n_c)) if rnfl_n_c else None
        rnfl_i    = safe_float(brow.get(rnfl_i_c)) if rnfl_i_c else None
        rnfl_t    = safe_float(brow.get(rnfl_t_c)) if rnfl_t_c else None

        cfp_val  = str(brow.get(cfp_b, "")).strip() if cfp_b else ""
        acq_val  = str(brow.get(acq_b, "")).strip() if acq_b else ""
        res_val  = str(brow.get(res_b, "")).strip() if res_b else ""

        b_ms, b_sd, b_pts = compute_ms(brow, vfb)
        b_grid = vf_grid(brow, vfb)

        # Baseline = visit 1
        visit1 = {
            "visitNumber": 1,
            "intervalYears": 0.0,
            "iop": b_iop,
            "ms": b_ms,
            "vfSd": b_sd,
            "validPoints": b_pts,
            "cfp": cfp_val or None,
            "acquisitionDevice": acq_val or None,
            "resolution": res_val or None,
            "vfGrid": b_grid,
        }

        # Follow-up visits
        fu_rows = fu_groups.get((subj, lat), [])
        fu_visit_nums = {safe_int(r.get(visit_f)) for r in fu_rows if visit_f}

        visits = [] if 1 in fu_visit_nums else [visit1]

        for frow in sorted(fu_rows, key=lambda r: safe_int(r.get(visit_f)) or 999):
            vnum = safe_int(frow.get(visit_f)) if visit_f else None
            intv = safe_float(frow.get(intv_f)) if intv_f else 0.0
            i_iop = safe_float(frow.get(iop_f)) if iop_f else None
            f_cfp = str(frow.get(cfp_f, "")).strip() if cfp_f else ""
            f_acq = str(frow.get(acq_f, "")).strip() if acq_f else ""
            f_res = str(frow.get(res_f, "")).strip() if res_f else ""
            f_ms, f_sd, f_pts = compute_ms(frow, vff)
            f_grid = vf_grid(frow, vff)

            visits.append({
                "visitNumber": vnum,
                "intervalYears": intv or 0.0,
                "iop": i_iop,
                "ms": f_ms,
                "vfSd": f_sd,
                "validPoints": f_pts,
                "cfp": f_cfp or None,
                "acquisitionDevice": f_acq or None,
                "resolution": f_res or None,
                "vfGrid": f_grid,
            })

        visits.sort(key=lambda v: v["visitNumber"] or 999)

        # MS slope from visits 1-3 only (anti-leakage)
        first3 = [v for v in visits if (v["visitNumber"] or 0) <= 3 and v["ms"] is not None]
        ms_slope = ols_slope(
            [v["intervalYears"] for v in first3],
            [v["ms"] for v in first3],
        )

        patients.append({
            "id": pid,
            "subjectNumber": subj,
            "laterality": lat,
            "age": age,
            "gender": gender,
            "category": category,
            "totalVisits": tv or len(visits),
            "baselineIOP": b_iop,
            "cct": cct,
            "rnfl": {
                "mean": rnfl_mean,
                "superior": rnfl_s,
                "inferior": rnfl_i,
                "nasal": rnfl_n,
                "temporal": rnfl_t,
            },
            "progressionFlags": {
                "plr2": plr2,
                "plr3": plr3,
                "md": md_flag,
                "any": plr2 or plr3 or md_flag,
            },
            "derivedStage": derive_stage(b_ms),
            "visits": visits,
            "msSlopeDbPerYear": ms_slope,
            "modelProbability": None,   # filled by train.py
            "source": "dataset",
        })

    # ── Summary ───────────────────────────────────────────────────────────────
    n = len(patients)
    n_prog  = sum(1 for p in patients if p["progressionFlags"]["any"])
    n_rnfl  = sum(1 for p in patients if p["rnfl"]["mean"] is not None)
    n_slope = sum(1 for p in patients if p["msSlopeDbPerYear"] is not None)
    print(f"\nBuilt {n} patient records")
    print(f"  Progressed    : {n_prog} ({n_prog/n*100:.1f}%)")
    print(f"  With RNFL mean: {n_rnfl}")
    print(f"  With MS slope : {n_slope}")

    # ── Write ─────────────────────────────────────────────────────────────────
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(patients, fh, indent=2)
    print(f"\nOK  Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
