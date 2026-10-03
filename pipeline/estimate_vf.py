#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GlaucoMap VF Estimator Pipeline - estimate_vf.py

Reads Baseline sheet, trains Ridge Regression models that predict:
  - MD_est (mean deviation, dB)  from RNFL + IOP + age [+ sectors + CCT]
  - VFI_est (visual field index, %) from the same features

Writes /public/data/estimator.json with:
  - Per-point reference values (90th pct across all eyes)
  - Full model  (rnfl_mean, rnfl_s, rnfl_i, rnfl_n, rnfl_t, iop, age, cct)
  - Fallback model (rnfl_mean, iop, age)  — used when sectors / CCT missing
  - GroupKFold R² and MAE for both targets and both models
  - Data clip ranges for MD_est and VFI_est

Usage: python pipeline/estimate_vf.py
"""

import json
import sys
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler

ROOT       = Path(__file__).parent.parent
EXCEL_PATH = ROOT / "data" / "raw" / "VF and clinical information.xlsx"
OUT_PATH   = ROOT / "public" / "data" / "estimator.json"

VF_COUNT = 61


# ── Helpers ────────────────────────────────────────────────────────────────────

def flatten_headers(df: pd.DataFrame) -> pd.DataFrame:
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
    cols = list(df.columns)
    cols_lower = {c.lower(): c for c in cols}
    for cand in candidates:
        if cand in cols:
            return cand
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    for cand in candidates:
        for col in cols:
            if cand.lower() in col.lower():
                return col
    return None


def vf_cols_for(df: pd.DataFrame) -> list:
    result = []
    for i in range(VF_COUNT):
        for name in [f"VF_{i}", str(i)]:
            if name in df.columns:
                result.append(name)
                break
    return result


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


def get_vf_values(row, cols: list) -> list[float | None]:
    """Return list of valid (non -1, non NaN) VF values per point (None = masked)."""
    vals = []
    for c in cols:
        try:
            v = float(row[c])
            vals.append(None if np.isnan(v) or v == -1.0 else v)
        except (TypeError, ValueError, KeyError):
            vals.append(None)
    while len(vals) < VF_COUNT:
        vals.append(None)
    return vals[:VF_COUNT]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not EXCEL_PATH.exists():
        print(f"ERROR: Excel not found at {EXCEL_PATH}")
        sys.exit(1)

    print(f"Reading {EXCEL_PATH} ...")
    baseline = flatten_headers(
        pd.read_excel(EXCEL_PATH, sheet_name="Baseline", header=[0, 1])
    )
    print(f"  Baseline: {len(baseline)} rows")

    def bc(c): return find_col(baseline, c)

    subj_c    = bc(["Subject Number", "Subject_Number"])
    age_c     = bc(["Age"])
    iop_c     = bc(["IOP"])
    cct_c     = bc(["CCT"])
    rnfl_mean_c = bc(["OCT RNFL thickness_Mean", "Mean", "RNFL_Mean"])
    rnfl_s_c    = bc(["OCT RNFL thickness_S", "S", "Superior"])
    rnfl_i_c    = bc(["OCT RNFL thickness_I", "I", "Inferior"])
    rnfl_n_c    = bc(["OCT RNFL thickness_N", "N", "Nasal"])
    rnfl_t_c    = bc(["OCT RNFL thickness_T", "T", "Temporal"])

    vfb = vf_cols_for(baseline)
    print(f"  VF cols: {len(vfb)}")

    if len(vfb) < VF_COUNT:
        print(f"WARNING: Found only {len(vfb)} VF columns (expected {VF_COUNT})")

    # ── 1. Build per-point reference values (90th pct) ────────────────────────
    # Shape: (n_eyes, n_vf_points)
    all_grids = []
    subjects  = []
    rows_data = []

    for _, row in baseline.iterrows():
        s = safe_int(row.get(subj_c)) if subj_c else None
        if s is None:
            continue
        grid = get_vf_values(row, vfb)
        all_grids.append(grid)
        subjects.append(s)
        rows_data.append(row)

    n_eyes = len(all_grids)
    print(f"  Eyes with subject number: {n_eyes}")

    # Reference = 90th percentile per VF point, ignoring None
    reference = []
    for pt_idx in range(VF_COUNT):
        vals = [g[pt_idx] for g in all_grids if g[pt_idx] is not None]
        ref = float(np.percentile(vals, 90)) if vals else 0.0
        reference.append(ref)

    ref_mean = float(np.mean(reference))
    print(f"  Reference mean (avg of 90th pcts): {ref_mean:.2f} dB")

    # ── 2. Compute MS, MD_est, VFI_est per eye ────────────────────────────────
    records = []
    for grid, row in zip(all_grids, rows_data):
        valid = [g for g in grid if g is not None]
        if not valid:
            continue

        ms = float(np.mean(valid))

        # MD_est = mean of (point - reference), over valid points
        deviations = [grid[i] - reference[i] for i in range(VF_COUNT) if grid[i] is not None]
        md_est = float(np.mean(deviations)) if deviations else None

        # VFI_est = 100 × clip(MS / ref_mean, 0, 1)
        vfi_est = float(np.clip(ms / ref_mean, 0.0, 1.0) * 100.0) if ref_mean > 0 else None

        rnfl_mean = safe_float(row.get(rnfl_mean_c)) if rnfl_mean_c else None
        rnfl_s    = safe_float(row.get(rnfl_s_c)) if rnfl_s_c else None
        rnfl_i    = safe_float(row.get(rnfl_i_c)) if rnfl_i_c else None
        rnfl_n    = safe_float(row.get(rnfl_n_c)) if rnfl_n_c else None
        rnfl_t    = safe_float(row.get(rnfl_t_c)) if rnfl_t_c else None
        iop       = safe_float(row.get(iop_c)) if iop_c else None
        age       = safe_float(row.get(age_c)) if age_c else None
        cct       = safe_float(row.get(cct_c)) if cct_c else None

        subj = safe_int(row.get(subj_c)) if subj_c else 0

        if md_est is None or vfi_est is None or rnfl_mean is None or iop is None or age is None:
            continue

        records.append({
            "subject": subj,
            "rnfl_mean": rnfl_mean,
            "rnfl_s": rnfl_s,
            "rnfl_i": rnfl_i,
            "rnfl_n": rnfl_n,
            "rnfl_t": rnfl_t,
            "iop": iop,
            "age": age,
            "cct": cct,
            "md_est": md_est,
            "vfi_est": vfi_est,
        })

    df = pd.DataFrame(records)
    print(f"  Eyes with full data: {len(df)}")

    md_min,  md_max  = float(df["md_est"].min()),  float(df["md_est"].max())
    vfi_min, vfi_max = float(df["vfi_est"].min()), float(df["vfi_est"].max())
    print(f"  MD_est  range: {md_min:.2f} – {md_max:.2f} dB")
    print(f"  VFI_est range: {vfi_min:.2f} – {vfi_max:.2f} %")

    groups = df["subject"].values
    Y = df[["md_est", "vfi_est"]].values

    # ── 3. Full model: rnfl_mean, S, I, N, T, iop, age, cct ─────────────────
    FULL_FEATS = ["rnfl_mean", "rnfl_s", "rnfl_i", "rnfl_n", "rnfl_t", "iop", "age", "cct"]
    # Mean-impute missing sectors / CCT with column mean
    df_full = df[FULL_FEATS].copy()
    feat_means_full = df_full.mean()
    df_full = df_full.fillna(feat_means_full)
    X_full = df_full.values

    full_model, full_metrics, full_scaler = train_ridge(X_full, Y, groups, "Full")

    # ── 4. Fallback model: rnfl_mean, iop, age ───────────────────────────────
    FALL_FEATS = ["rnfl_mean", "iop", "age"]
    X_fall = df[FALL_FEATS].values  # these are always present (filtered above)

    fall_model, fall_metrics, fall_scaler = train_ridge(X_fall, Y, groups, "Fallback")

    # ── 5. Serialize ──────────────────────────────────────────────────────────
    def model_to_dict(model: Ridge, scaler: StandardScaler, feat_names: list,
                      feat_means_dict: dict) -> dict:
        coefs = model.coef_  # shape (2, n_feats)
        return {
            "features": feat_names,
            "featureMeans": feat_means_dict,
            "featureStds": {f: float(s) for f, s in zip(feat_names, scaler.scale_)},
            "coefficients": {
                "md_est": {"intercept": float(model.intercept_[0]),
                           "weights": {f: float(coefs[0][i]) for i, f in enumerate(feat_names)}},
                "vfi_est": {"intercept": float(model.intercept_[1]),
                            "weights": {f: float(coefs[1][i]) for i, f in enumerate(feat_names)}},
            },
        }

    full_means = {f: float(feat_means_full[f]) for f in FULL_FEATS}
    fall_means = {f: float(df[f].mean()) for f in FALL_FEATS}

    result = {
        "version": "1.0",
        "trainedAt": pd.Timestamp.now().isoformat(),
        "reference": reference,           # list of 61 floats (90th pct per point)
        "refMean": ref_mean,               # mean of reference values
        "clipRange": {
            "md": [md_min, md_max],
            "vfi": [vfi_min, vfi_max],
        },
        "fullModel": model_to_dict(full_model, full_scaler, FULL_FEATS, full_means),
        "fallbackModel": model_to_dict(fall_model, fall_scaler, FALL_FEATS, fall_means),
        "metrics": {
            "full": full_metrics,
            "fallback": fall_metrics,
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    print(f"\nOK  Wrote {OUT_PATH}")


def train_ridge(X, Y, groups, label: str):
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = Ridge(alpha=1.0)
    model.fit(X_scaled, Y)

    # GroupKFold CV metrics
    gkf = GroupKFold(n_splits=5)
    md_maes, md_r2s, vfi_maes, vfi_r2s = [], [], [], []
    for train_idx, val_idx in gkf.split(X_scaled, Y, groups):
        m = Ridge(alpha=1.0)
        m.fit(X_scaled[train_idx], Y[train_idx])
        pred = m.predict(X_scaled[val_idx])
        md_maes.append(mean_absolute_error(Y[val_idx, 0], pred[:, 0]))
        md_r2s.append(r2_score(Y[val_idx, 0], pred[:, 0]))
        vfi_maes.append(mean_absolute_error(Y[val_idx, 1], pred[:, 1]))
        vfi_r2s.append(r2_score(Y[val_idx, 1], pred[:, 1]))

    metrics = {
        "md_r2":   round(float(np.mean(md_r2s)),   3),
        "md_mae":  round(float(np.mean(md_maes)),  2),
        "vfi_r2":  round(float(np.mean(vfi_r2s)),  3),
        "vfi_mae": round(float(np.mean(vfi_maes)), 2),
        "nFolds":  5,
    }
    print(f"\n  [{label}] CV  MD  R²={metrics['md_r2']:.3f}  MAE={metrics['md_mae']:.2f} dB")
    print(f"  [{label}] CV  VFI R²={metrics['vfi_r2']:.3f}  MAE={metrics['vfi_mae']:.2f} %")

    return model, metrics, scaler


if __name__ == "__main__":
    main()
