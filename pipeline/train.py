#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GlaucoMap Model Training - train.py
Trains logistic regression and gradient boosting on glaucoma progression data.
Uses GroupKFold (subject-level) to prevent data leakage.
Exports coefficients, metrics, and OOF predictions to /public/data/model.json

Usage: python pipeline/train.py
"""

import json
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

warnings.filterwarnings("ignore")

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import GroupKFold
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import (
        roc_auc_score, average_precision_score,
        precision_recall_curve, roc_curve
    )
    from sklearn.calibration import calibration_curve
    from sklearn.utils.class_weight import compute_sample_weight
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("WARNING: scikit-learn not installed. Run: pip install scikit-learn")

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    MPL_AVAILABLE = True
except ImportError:
    MPL_AVAILABLE = False

ROOT = Path(__file__).parent.parent
PATIENTS_PATH = ROOT / "public" / "data" / "patients.json"
OUT_PATH      = ROOT / "public" / "data" / "model.json"
PLOTS_DIR     = ROOT / "public" / "data"

FEATURE_NAMES = [
    "rnfl_mean", "rnfl_superior", "rnfl_inferior", "rnfl_nasal", "rnfl_temporal",
    "is_asymmetry", "nt_asymmetry", "rnfl_min_sector",
    "cct", "age",
    "iop_mean", "iop_max", "iop_std",
    "ms_slope",
]

def extract_features(patient):
    """Extract model features from a patient dict."""
    rnfl = patient.get("rnfl", {})
    visits = patient.get("visits", [])

    rnfl_mean = rnfl.get("mean")
    rnfl_s    = rnfl.get("superior")
    rnfl_i    = rnfl.get("inferior")
    rnfl_n    = rnfl.get("nasal")
    rnfl_t    = rnfl.get("temporal")

    sectors = [v for v in [rnfl_s, rnfl_i, rnfl_n, rnfl_t] if v is not None]
    rnfl_min = min(sectors) if sectors else None

    is_asym = (rnfl_i - rnfl_s) if (rnfl_i is not None and rnfl_s is not None) else None
    nt_asym = (rnfl_n - rnfl_t) if (rnfl_n is not None and rnfl_t is not None) else None

    # IOP from all visits
    iop_vals = [v["iop"] for v in visits if v.get("iop") is not None]
    iop_mean = float(np.mean(iop_vals)) if iop_vals else None
    iop_max  = float(np.max(iop_vals)) if iop_vals else None
    iop_std  = float(np.std(iop_vals)) if len(iop_vals) > 1 else None

    ms_slope = patient.get("msSlopeDbPerYear")

    return {
        "rnfl_mean":       rnfl_mean,
        "rnfl_superior":   rnfl_s,
        "rnfl_inferior":   rnfl_i,
        "rnfl_nasal":      rnfl_n,
        "rnfl_temporal":   rnfl_t,
        "is_asymmetry":    is_asym,
        "nt_asymmetry":    nt_asym,
        "rnfl_min_sector": rnfl_min,
        "cct":             patient.get("cct"),
        "age":             patient.get("age"),
        "iop_mean":        iop_mean,
        "iop_max":         iop_max,
        "iop_std":         iop_std,
        "ms_slope":        ms_slope,
    }

def impute_features(df, feature_names, means=None):
    """Mean-impute missing values. Returns imputed df and means dict."""
    df = df.copy()
    if means is None:
        means = {}
        for col in feature_names:
            means[col] = float(df[col].mean()) if df[col].notna().any() else 0.0
    for col in feature_names:
        df[col] = df[col].fillna(means[col])
    return df, means

def sensitivity_at_specificity(y_true, y_prob, target_spec=0.80):
    """Return sensitivity at >= target_spec specificity."""
    fpr, tpr, thresholds = roc_curve(y_true, y_prob)
    spec = 1 - fpr
    # Find threshold where spec >= target
    idx = np.where(spec >= target_spec)[0]
    if len(idx) == 0:
        return 0.0
    return float(tpr[idx[-1]])

def main():
    if not SKLEARN_AVAILABLE:
        print("Cannot train without scikit-learn. Generating placeholder model.json...")
        write_placeholder()
        return

    if not PATIENTS_PATH.exists():
        print(f"ERROR: {PATIENTS_PATH} not found. Run prepare.py first.")
        return

    with open(PATIENTS_PATH) as f:
        patients = json.load(f)

    print(f"Loaded {len(patients)} patients")

    # ── Build feature matrix ─────────────────────────────────────────────────
    rows = []
    for p in patients:
        feat = extract_features(p)
        feat["subject"] = p.get("subjectNumber")
        feat["patient_id"] = p.get("id")
        feat["label"] = 1 if p.get("progressionFlags", {}).get("any") else 0
        rows.append(feat)

    df = pd.DataFrame(rows)
    X_raw = df[FEATURE_NAMES]
    y = df["label"].values
    groups = df["subject"].values
    ids = df["patient_id"].values

    print(f"Positive cases: {y.sum()} / {len(y)} ({y.mean()*100:.1f}%)")

    # ── GroupKFold CV ─────────────────────────────────────────────────────────
    n_folds = 5
    gkf = GroupKFold(n_splits=n_folds)

    oof_probs_lr = np.zeros(len(y))
    oof_probs_gb = np.zeros(len(y))

    all_feature_means = None

    for fold, (train_idx, val_idx) in enumerate(gkf.split(X_raw, y, groups)):
        X_tr_raw = X_raw.iloc[train_idx]
        X_va_raw = X_raw.iloc[val_idx]

        # Impute
        X_tr_imp, fold_means = impute_features(X_tr_raw, FEATURE_NAMES)
        X_va_imp, _ = impute_features(X_va_raw, FEATURE_NAMES, means=fold_means)

        y_tr = y[train_idx]
        y_va = y[val_idx]

        # Standardise
        scaler = StandardScaler()
        X_tr_sc = scaler.fit_transform(X_tr_imp)
        X_va_sc = scaler.transform(X_va_imp)

        # Sample weights for class imbalance
        sw = compute_sample_weight("balanced", y_tr)

        # Logistic Regression
        lr = LogisticRegression(max_iter=1000, random_state=42)
        lr.fit(X_tr_sc, y_tr, sample_weight=sw)
        oof_probs_lr[val_idx] = lr.predict_proba(X_va_sc)[:, 1]

        # Gradient Boosting
        gb = GradientBoostingClassifier(n_estimators=100, max_depth=3, random_state=42)
        gb.fit(X_tr_imp.values, y_tr, sample_weight=sw)
        oof_probs_gb[val_idx] = gb.predict_proba(X_va_imp.values)[:, 1]

        if fold == 0:
            all_feature_means = fold_means

        print(f"  Fold {fold+1}: LR AUC={roc_auc_score(y_va, oof_probs_lr[val_idx]):.3f}  "
              f"GB AUC={roc_auc_score(y_va, oof_probs_gb[val_idx]):.3f}")

    # ── OOF metrics ──────────────────────────────────────────────────────────
    lr_auc   = roc_auc_score(y, oof_probs_lr)
    lr_prauc = average_precision_score(y, oof_probs_lr)
    lr_sens80 = sensitivity_at_specificity(y, oof_probs_lr, 0.80)

    gb_auc   = roc_auc_score(y, oof_probs_gb)
    gb_prauc = average_precision_score(y, oof_probs_gb)
    gb_sens80 = sensitivity_at_specificity(y, oof_probs_gb, 0.80)

    print(f"\nOOF Metrics:")
    print(f"  Logistic Regression: AUC={lr_auc:.3f}  PR-AUC={lr_prauc:.3f}  Sens@80%Spec={lr_sens80:.3f}")
    print(f"  Gradient Boosting:   AUC={gb_auc:.3f}  PR-AUC={gb_prauc:.3f}  Sens@80%Spec={gb_sens80:.3f}")

    # ── Retrain final LR on all data ─────────────────────────────────────────
    X_all_raw, all_means = impute_features(X_raw, FEATURE_NAMES)
    scaler_final = StandardScaler()
    X_all_sc = scaler_final.fit_transform(X_all_raw)
    sw_all = compute_sample_weight("balanced", y)
    lr_final = LogisticRegression(max_iter=1000, random_state=42)
    lr_final.fit(X_all_sc, y, sample_weight=sw_all)

    coefficients = {
        "intercept": float(lr_final.intercept_[0]),
        "features": {name: float(coef) for name, coef in zip(FEATURE_NAMES, lr_final.coef_[0])},
    }
    feature_stds = {name: float(scaler_final.scale_[i]) for i, name in enumerate(FEATURE_NAMES)}

    # ── Write OOF probs back to patients.json ───────────────────────────────
    id_to_prob_lr = {pid: float(prob) for pid, prob in zip(ids, oof_probs_lr)}
    id_to_prob_gb = {pid: float(prob) for pid, prob in zip(ids, oof_probs_gb)}
    for p in patients:
        pid = p["id"]
        p["modelProbability"] = id_to_prob_lr.get(pid)
        p["gbProbability"]    = id_to_prob_gb.get(pid)

    with open(PATIENTS_PATH, "w", encoding="utf-8") as f:
        json.dump(patients, f, indent=2)
    print(f"OK  Updated {PATIENTS_PATH} with OOF probabilities")

    # ── Calibration plot ─────────────────────────────────────────────────────
    try:
        fig, ax = plt.subplots(figsize=(6, 5))
        prob_true, prob_pred = calibration_curve(y, oof_probs_lr, n_bins=8, strategy="quantile")
        ax.plot(prob_pred, prob_true, "s-", label="LR calibration", color="#3370f0")
        ax.plot([0, 1], [0, 1], "k--", alpha=0.4, label="Perfect calibration")
        ax.set_xlabel("Mean predicted probability"); ax.set_ylabel("Fraction of positives")
        ax.set_title("Calibration Plot (OOF)"); ax.legend(); ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(PLOTS_DIR / "calibration_plot.png", dpi=120)
        plt.close(fig)
        print("OK  Saved calibration_plot.png")
    except Exception as e:
        print(f"  (Calibration plot skipped: {e})")

    # ── Write model.json ─────────────────────────────────────────────────────
    model_data = {
        "version": "1.0.0",
        "trainedAt": datetime.utcnow().isoformat() + "Z",
        "featureNames": FEATURE_NAMES,
        "featureMeans": {k: float(v) for k, v in all_means.items()},
        "featureStds":  feature_stds,
        "coefficients": coefficients,
        "metrics": {
            "auc":                lr_auc,
            "prAuc":              lr_prauc,
            "sensitivity80spec":  lr_sens80,
            "gbAuc":              gb_auc,
            "gbPrAuc":            gb_prauc,
            "gbSensitivity80spec":gb_sens80,
            "nFolds":             n_folds,
            "nPositive":          int(y.sum()),
            "nTotal":             int(len(y)),
        },
        "limitations": [
            "Small dataset: 263 eyes from 144 subjects. Results should be interpreted cautiously.",
            "Class imbalance: ~20.5% positive. PR-AUC is more informative than ROC-AUC here.",
            "Features limited to visits 1-3 to avoid label leakage.",
            "RNFL available at baseline only for dataset patients.",
            "MS slope (dataset) is approximately but not identically comparable to MD slope (manual).",
            "GroupKFold ensures subject-level leakage prevention (both eyes in same fold).",
            "Model is a decision-support tool only. Not validated for clinical use.",
        ]
    }

    with open(OUT_PATH, "w") as f:
        json.dump(model_data, f, indent=2)
    print(f"OK  Wrote {OUT_PATH}")

def write_placeholder():
    """Write a placeholder model.json so the app runs without scikit-learn."""
    placeholder = {
        "version": "0.0.0-placeholder",
        "trainedAt": datetime.utcnow().isoformat() + "Z",
        "featureNames": FEATURE_NAMES,
        "featureMeans": {f: 0.0 for f in FEATURE_NAMES},
        "featureStds":  {f: 1.0 for f in FEATURE_NAMES},
        "coefficients": {
            "intercept": -1.5,
            "features": {f: 0.0 for f in FEATURE_NAMES},
        },
        "metrics": {
            "auc": 0.0, "prAuc": 0.0, "sensitivity80spec": 0.0,
            "nFolds": 0, "nPositive": 0, "nTotal": 0,
        },
        "limitations": ["Placeholder model — run pip install scikit-learn then python pipeline/train.py"],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(placeholder, f, indent=2)
    print(f"OK  Wrote placeholder {OUT_PATH}")

if __name__ == "__main__":
    main()
