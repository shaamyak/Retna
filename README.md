# GlaucoMap — Glaucoma Progression Decision-Support System

> **YODHA 2.0 Healthcare Track** — Decision-support prototype. Not a diagnostic device.

GlaucoMap is a web application for glaucoma progression analysis, providing AI-assisted risk stratification, 24-month forecasts, and clinical evidence breakdowns for both dataset patients (from a real research cohort) and manually entered cases.

---

## ⚠️ Disclaimer

This is a **decision-support prototype only**. It does not diagnose glaucoma. Every risk output requires review by a qualified ophthalmologist. Never make clinical decisions based solely on this tool.

---

## Quick Start

### Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173

### Python Pipeline (required for dataset patients)

```bash
pip install pandas numpy openpyxl scikit-learn matplotlib
python pipeline/prepare.py   # → public/data/patients.json
python pipeline/train.py     # → public/data/model.json (with OOF probabilities)
```

The app runs without the pipeline (using placeholder data), but dataset patients will only appear after running it.

### Tests

```bash
npm test
```

---

## Dataset → App Mapping

### Source File
`data/raw/VF and clinical information.xlsx` — 2 sheets, 2-row multi-level header.

| Sheet | Rows | Description |
|-------|------|-------------|
| `Baseline` | see patients.json | One row per eye: demographics, IOP, CCT, RNFL sectors, progression flags, 61-point VF grid |
| `Follow-up` | see patients.json | One row per visit: IOP, 61-point VF grid, fundus photo filename |

### Key Derivations

| Derived Field | Source | Notes |
|---|---|---|
| **Mean Sensitivity (MS)** | 61-point VF grid | Mean of non-(-1) points. Value `-1` = masked/blind spot, excluded. |
| **VF Slope (dB/yr)** | MS across visits 1–3 | OLS regression. Used as the dataset's VF summary. |
| **Progression label** | PLR2 ∨ PLR3 ∨ MD flag | Binary flags in Baseline sheet. Count computed in app from patients.json. |
| **Derived Stage** | Baseline MS tercile | Labeled "approximate" in UI. Not a clinical diagnosis. |
| **Model Probability** | LR out-of-fold prediction | GroupKFold on Subject Number (subject-level leakage prevention). |

---

## Known Limitations

1. **No OCT images** — Dataset has RNFL numbers + fundus photo filenames (CFP) only. No B-scan, en-face, or RNFL map images. Place files in `/public/fundus/` to enable viewing.
2. **RNFL baseline only** — No longitudinal RNFL for dataset patients. Thinning rate requires 2+ RNFL visits (manual entry only).
3. **No MD/VFI** — Only raw 61-point grid. MS is derived and approximately comparable to MD, but not identical.
4. **No treatment data** — No medication or adherence history for dataset patients.
5. **No clinical stage** — Stage is approximate, derived from MS tercile.
6. **Class imbalance** — Positive rate computed live from patients.json. Models trained with class-weight correction. PR-AUC is more informative than ROC-AUC.
7. **Small N** — Total eyes and subjects computed from patients.json. AUC should be interpreted cautiously.
8. **ACG under-represented** — ACG count computed live from patients.json. Results primarily applicable to OAG.
9. **Label leakage prevention** — Features use visits 1–3 only. Progression flags were derived from full follow-up.

---

## Model Architecture

- **Algorithm:** Logistic Regression (browser inference) + Gradient Boosting (training metrics only)
- **Validation:** `GroupKFold(n_splits=5)` — both eyes of a subject always in the same fold
- **Class imbalance:** `compute_sample_weight("balanced", y)`
- **Features:** RNFL sectors (mean, S, I, N, T, I-S asymmetry, N-T asymmetry, min sector), CCT, age, IOP (mean, max, std), MS slope
- **Inference:** Logistic regression coefficients exported to `model.json`; sigmoid applied in browser. No server required.

### Reported Metrics (run `python pipeline/train.py` for real numbers)

| Metric | Description |
|--------|-------------|
| AUC-ROC | Area under ROC curve (OOF) |
| PR-AUC | Area under precision-recall curve (OOF) |
| Sens @ 80% Spec | Sensitivity at ≥80% specificity threshold |

---

## Manual Patient Entry

Use **"+ New Patient Case"** on the dashboard. The 7-step wizard collects:

1. **Patient Info:** name, age, sex, eye, stage, category, CCT, first visit date
2. **OCT Upload:** drag-and-drop, up to 3 images (B-scan, en-face, RNFL map) or generate placeholder
3. **RNFL Metrics:** average + sector values, multiple visits supported
4. **IOP Readings:** date + value pairs, editable target IOP
5. **Visual Field:** MD (dB) and VFI (%) per visit
6. **Treatment Notes:** medications, adherence, free-text
7. **Review & Analyse:** summary card → AI analysis → Patient Detail

**Validation:**
- Hard errors (block save): RNFL 20–200 µm, IOP 5–60 mmHg, MD −35 to +3 dB, VFI 0–100%, age 1–110
- Soft warnings (allow save): RNFL outside 40–120, IOP > 35, MD < −30
- Draft saving to localStorage: "Save & Continue Later" button

---

## Judge Demo Flow

### Path A — Dataset Patient

1. Dashboard → **Dataset Patients** tab
2. Sort: **Highest Risk First** (or filter "Critical")
3. Click a Critical/High-risk eye
4. View: RNFL panel, IOP chart, VF trend, 3D optic nerve, 24-month forecast, Evidence Breakdown, Validation (model vs recorded outcome)

### Path B — Manual Entry (live demo)

1. **"+ New Patient Case"**
2. Name: **Raj K.**, Age: 58, Eye: OD, Stage: Moderate
3. OCT: drag image or "Generate Placeholder"
4. RNFL: avg **72 µm**, inferior **65 µm**
5. IOP: **22, 24, 21 mmHg** across 3 visits
6. VF: MD **−4.2 dB**, VFI **89%**
7. Click **"Run AI Analysis"** → Patient Detail with predictions and alerts

---

## Project Structure

```
├── src/
│   ├── config/         # Alert thresholds and scenario multipliers
│   ├── lib/            # Risk engine, stats utilities
│   ├── store/          # Zustand store with localStorage persistence
│   ├── types/          # TypeScript domain types
│   ├── pages/          # Dashboard, PatientDetail, Wizard, etc.
│   ├── components/     # Layout, PatientCard, panels, charts
│   └── test/           # Unit tests (Vitest)
├── pipeline/
│   ├── prepare.py      # Excel → patients.json
│   └── train.py        # Model training → model.json
├── public/
│   ├── data/           # patients.json, model.json (committed placeholders)
│   └── fundus/         # (optional) fundus photo images
└── data/raw/           # Source Excel file
```

---

## Technology Stack

- **Frontend:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS v3
- **State:** Zustand with `persist` (localStorage)
- **Charts:** Recharts
- **3D:** Three.js via @react-three/fiber + @react-three/drei
- **Testing:** Vitest + @testing-library/react
- **Pipeline:** Python (pandas, numpy, openpyxl, scikit-learn)

---

## Scenario Forecast Assumptions

| Scenario | VF Multiplier | RNFL Multiplier | Basis |
|----------|--------------|-----------------|-------|
| Current Treatment | 1.0× | 1.0× | Observed slope |
| Intensified | 0.6× | 0.6× | ~35–50% risk reduction per 5 mmHg IOP drop (EMGT, OHTS) |
| Untreated | 1.65× | 1.5× | ~50–80% faster without treatment (CNTGS) |

IOP adjustment: ~10% slope change per 1 mmHg IOP change (OHTS trial data). Configurable in `/src/config/scenarios.ts`.

These are **modeling assumptions**, not clinical prescriptions.
