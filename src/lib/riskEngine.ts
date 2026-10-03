import type {
  DatasetPatient, ManualPatient, PatientAnalysis,
  EvidenceFactor, Alert, ScenarioForecast, ForecastPoint,
  RiskLevel, GlaucomaStage
} from '@/types'
import { RNFL_THRESHOLDS, IOP_THRESHOLDS, VF_THRESHOLDS, RNFL_THINNING_THRESHOLDS, ASYMMETRY_THRESHOLDS } from '@/config/alerts'
import { SCENARIOS, DEFAULT_SLOPES, IOP_SLOPE_ADJUSTMENT_PER_MMHG, TARGET_IOP_DEFAULT } from '@/config/scenarios'
import { linearRegression, sigmoid, mean, stdDev, max } from '@/lib/stats'

// ─── Logistic Regression Inference ───────────────────────────────────────────

interface ModelData {
  featureNames: string[]
  featureMeans: Record<string, number>
  featureStds: Record<string, number>
  coefficients: { intercept: number; features: Record<string, number> }
}

let _modelData: ModelData | null = null

export function setModelData(m: ModelData) {
  _modelData = m
}

function inferModelProbability(features: Record<string, number | null>): number | null {
  if (!_modelData) return null
  const { featureNames, featureMeans, featureStds, coefficients } = _modelData

  let logit = coefficients.intercept
  let hasEnoughFeatures = false

  for (const fname of featureNames) {
    const raw = features[fname]
    if (raw == null || isNaN(raw)) {
      // use mean (mean-imputation)
      const imputed = featureMeans[fname] ?? 0
      const std = featureStds[fname] ?? 1
      logit += coefficients.features[fname] * ((imputed - imputed) / (std || 1))
    } else {
      const m = featureMeans[fname] ?? 0
      const s = featureStds[fname] ?? 1
      logit += coefficients.features[fname] * ((raw - m) / (s || 1))
      hasEnoughFeatures = true
    }
  }

  return hasEnoughFeatures ? sigmoid(logit) : null
}

// ─── Dataset Patient Analysis ─────────────────────────────────────────────────

export function analyzeDatasetPatient(p: DatasetPatient, targetIOP: number = TARGET_IOP_DEFAULT, horizonMonths: number = 24): PatientAnalysis {
  const iopValues = p.visits.map(v => v.iop).filter((v): v is number => v != null)
  const msValues = p.visits.map(v => v.ms).filter((v): v is number => v != null)
  
  const meanIOP = mean(iopValues)
  const maxIOP = max(iopValues)
  const meanMS = mean(msValues)

  const features = {
    rnfl_mean: p.rnfl.mean,
    rnfl_inferior: p.rnfl.inferior,
    rnfl_superior: p.rnfl.superior,
    is_asymmetry: (p.rnfl.inferior != null && p.rnfl.superior != null)
      ? p.rnfl.inferior - p.rnfl.superior : null,
    nt_asymmetry: (p.rnfl.nasal != null && p.rnfl.temporal != null)
      ? p.rnfl.nasal - p.rnfl.temporal : null,
    cct: p.cct,
    age: p.age,
    iop_mean: meanIOP,
    iop_max: maxIOP,
    iop_std: stdDev(iopValues),
    ms_slope: p.msSlopeDbPerYear,
  }

  const modelProb = p.modelProbability ?? inferModelProbability(features)
  
  // Evidence factors
  const evidenceFactors: EvidenceFactor[] = buildEvidenceFactors({
    rnflMean: p.rnfl.mean,
    rnflInferior: p.rnfl.inferior,
    rnflSuperior: p.rnfl.superior,
    rnflNasal: p.rnfl.nasal,
    rnflTemporal: p.rnfl.temporal,
    meanIOP, maxIOP,
    targetIOP,
    vfSlope: p.msSlopeDbPerYear,
    vfLabel: 'MS (Mean Sensitivity)',
    meanMS,
    age: p.age,
    cct: p.cct,
    rnflThinningRate: null,
  })

  // Alerts
  const alerts: Alert[] = buildAlerts({
    rnflMean: p.rnfl.mean,
    iopValues,
    targetIOP,
    vfSlope: p.msSlopeDbPerYear,
    progressionFlags: p.progressionFlags,
    rnflThinningRate: null,
  })

  const riskLevel = computeRiskLevel(modelProb, evidenceFactors, alerts)
  const riskScore = computeRiskScore(modelProb, evidenceFactors, alerts)

  // Forecasts
  const vfForecast = buildVFForecast(p.msSlopeDbPerYear, meanMS, meanIOP, targetIOP, p.derivedStage, horizonMonths)
  const rnflForecast = buildRNFLForecast(null, p.rnfl.mean, p.derivedStage, horizonMonths)  // no thinning rate for dataset
  const iopForecast = buildIOPForecast(iopValues, horizonMonths)

  const aiSummary = buildAISummary({
    id: p.id, age: p.age, laterality: p.laterality,
    riskLevel, rnflMean: p.rnfl.mean, meanIOP, vfSlope: p.msSlopeDbPerYear,
    modelProb, progressed: p.progressionFlags.any, stage: p.derivedStage,
    source: 'dataset'
  })

  return {
    patientId: p.id,
    computedAt: new Date().toISOString(),
    riskLevel,
    riskScore,
    modelProbability: modelProb,
    evidenceFactors,
    alerts,
    vfForecast,
    rnflForecast,
    iopForecast,
    aiSummary,
    vfSlope: p.msSlopeDbPerYear,
    rnflThinningRate: null,
    meanIOP,
    maxIOP,
  }
}

// ─── Manual Patient Analysis ──────────────────────────────────────────────────

export function analyzeManualPatient(p: ManualPatient, targetIOP: number = TARGET_IOP_DEFAULT, horizonMonths: number = 24): PatientAnalysis {
  const iopValues = p.iopReadings.map(r => r.value)
  const meanIOP = mean(iopValues)
  const maxIOP = max(iopValues)

  // VF slope from MD values
  let vfSlope: number | null = null
  if (p.vfEntries.length >= 2) {
    const sorted = [...p.vfEntries].sort((a, b) => a.date.localeCompare(b.date))
    const xs: number[] = []
    const ys: number[] = []
    for (const e of sorted) {
      if (e.md != null) {
        const yearOffset = (new Date(e.date).getTime() - new Date(sorted[0].date).getTime()) / (365.25 * 24 * 3600 * 1000)
        xs.push(yearOffset)
        ys.push(e.md)
      }
    }
    if (xs.length >= 2) {
      const reg = linearRegression(xs, ys)
      if (reg) vfSlope = reg.slope
    }
  }

  // RNFL thinning rate
  let rnflThinningRate: number | null = null
  let latestRNFL = p.rnflVisits.length > 0 ? p.rnflVisits[p.rnflVisits.length - 1].sectors : null
  if (p.rnflVisits.length >= 2) {
    const sorted = [...p.rnflVisits].sort((a, b) => a.date.localeCompare(b.date))
    const xs: number[] = []
    const ys: number[] = []
    for (const v of sorted) {
      if (v.sectors.mean != null) {
        const yearOffset = (new Date(v.date).getTime() - new Date(sorted[0].date).getTime()) / (365.25 * 24 * 3600 * 1000)
        xs.push(yearOffset)
        ys.push(v.sectors.mean)
      }
    }
    if (xs.length >= 2) {
      const reg = linearRegression(xs, ys)
      if (reg) rnflThinningRate = reg.slope
    }
  }

  const rnflMean = latestRNFL?.mean ?? null
  const rnflInf  = latestRNFL?.inferior ?? null
  const rnflSup  = latestRNFL?.superior ?? null
  const rnflNas  = latestRNFL?.nasal ?? null
  const rnflTem  = latestRNFL?.temporal ?? null

  const lastVF = p.vfEntries.length > 0 ? p.vfEntries[p.vfEntries.length - 1] : null
  const meanMS: number | null = null  // manual uses MD, not MS

  const features = {
    rnfl_mean: rnflMean, rnfl_inferior: rnflInf, rnfl_superior: rnflSup,
    is_asymmetry: rnflInf != null && rnflSup != null ? rnflInf - rnflSup : null,
    nt_asymmetry: rnflNas != null && rnflTem != null ? rnflNas - rnflTem : null,
    cct: p.cct, age: p.age,
    iop_mean: meanIOP, iop_max: maxIOP, iop_std: stdDev(iopValues),
    ms_slope: vfSlope,
  }

  const modelProb = inferModelProbability(features)

  const evidenceFactors = buildEvidenceFactors({
    rnflMean, rnflInferior: rnflInf, rnflSuperior: rnflSup,
    rnflNasal: rnflNas, rnflTemporal: rnflTem,
    meanIOP, maxIOP, targetIOP,
    vfSlope, vfLabel: 'MD',
    meanMS: lastVF?.md ?? null,
    age: p.age, cct: p.cct, rnflThinningRate,
  })

  const alerts = buildAlerts({
    rnflMean, iopValues, targetIOP, vfSlope,
    progressionFlags: null, rnflThinningRate,
  })

  const riskLevel = computeRiskLevel(modelProb, evidenceFactors, alerts)
  const riskScore = computeRiskScore(modelProb, evidenceFactors, alerts)

  const vfForecast = buildVFForecast(vfSlope, lastVF?.md ?? null, meanIOP, targetIOP, p.stage, horizonMonths)
  const rnflForecast = buildRNFLForecast(rnflThinningRate, rnflMean, p.stage, horizonMonths)
  const iopForecast = buildIOPForecast(iopValues, horizonMonths)

  const aiSummary = buildAISummary({
    id: p.name, age: p.age, laterality: p.laterality,
    riskLevel, rnflMean, meanIOP, vfSlope,
    modelProb, progressed: false, stage: p.stage,
    source: 'manual'
  })

  return {
    patientId: p.id,
    computedAt: new Date().toISOString(),
    riskLevel, riskScore, modelProbability: modelProb,
    evidenceFactors, alerts, vfForecast, rnflForecast, iopForecast,
    aiSummary, vfSlope, rnflThinningRate, meanIOP, maxIOP,
  }
}

// ─── Evidence Factors ─────────────────────────────────────────────────────────

interface EvidenceInputs {
  rnflMean: number | null
  rnflInferior: number | null
  rnflSuperior: number | null
  rnflNasal: number | null
  rnflTemporal: number | null
  meanIOP: number | null
  maxIOP: number | null
  targetIOP: number
  vfSlope: number | null
  vfLabel: string
  meanMS: number | null
  age: number
  cct: number | null
  rnflThinningRate: number | null
}

function buildEvidenceFactors(inputs: EvidenceInputs): EvidenceFactor[] {
  const factors: EvidenceFactor[] = []
  const { rnflMean, rnflInferior, rnflSuperior, rnflNasal, rnflTemporal,
    meanIOP, maxIOP, targetIOP, vfSlope, vfLabel, meanMS,
    age, cct, rnflThinningRate } = inputs

  // RNFL Mean
  if (rnflMean != null) {
    let contribution: EvidenceFactor['contribution'] = 'protective'
    let detail = ''
    if (rnflMean < RNFL_THRESHOLDS.CRITICAL) { contribution = 'critical'; detail = 'Severely thinned (<55 µm). Strong indicator of advanced damage.' }
    else if (rnflMean < RNFL_THRESHOLDS.ALERT) { contribution = 'critical'; detail = 'Below alert threshold (<70 µm). Significant thinning.' }
    else if (rnflMean < RNFL_THRESHOLDS.WATCH) { contribution = 'concerning'; detail = 'Below watch threshold (<80 µm). Monitor closely.' }
    else if (rnflMean < RNFL_THRESHOLDS.NORMATIVE_UPPER) { contribution = 'neutral'; detail = 'Within borderline range (80–100 µm).' }
    else { contribution = 'protective'; detail = 'Normal range (≥100 µm).' }
    factors.push({ factor: 'RNFL Mean Thickness', value: rnflMean.toFixed(1), unit: 'µm', contribution, detail })
  }

  // Inferior RNFL
  if (rnflInferior != null) {
    const contribution = rnflInferior < 65 ? 'critical' : rnflInferior < 80 ? 'concerning' : 'neutral'
    factors.push({
      factor: 'RNFL Inferior Sector', value: rnflInferior.toFixed(1), unit: 'µm', contribution,
      detail: 'Inferior sector is most vulnerable to glaucoma damage.'
    })
  }

  // IS Asymmetry
  if (rnflInferior != null && rnflSuperior != null) {
    const isRatio = rnflInferior / rnflSuperior
    const contribution = isRatio < ASYMMETRY_THRESHOLDS.IS_RATIO_NORMAL_LOWER ? 'concerning' : 'neutral'
    factors.push({
      factor: 'Inferior/Superior Asymmetry', value: isRatio.toFixed(2), unit: 'ratio', contribution,
      detail: `I/S ratio ${isRatio.toFixed(2)} (normal ≥ 0.8). ${contribution === 'concerning' ? 'Asymmetric thinning is a glaucoma indicator.' : 'Within normal range.'}`
    })
  }

  // NT Asymmetry
  if (rnflNasal != null && rnflTemporal != null) {
    const ntRatio = rnflNasal / rnflTemporal
    const contribution = ntRatio > ASYMMETRY_THRESHOLDS.NT_RATIO_NORMAL_UPPER ? 'concerning' : 'neutral'
    factors.push({
      factor: 'Nasal/Temporal Asymmetry', value: ntRatio.toFixed(2), unit: 'ratio', contribution,
      detail: `N/T ratio ${ntRatio.toFixed(2)} (normal ≤ 1.5).`
    })
  }

  // RNFL Thinning Rate (manual only)
  if (rnflThinningRate != null) {
    const contribution = rnflThinningRate < RNFL_THINNING_THRESHOLDS.CRITICAL ? 'critical'
      : rnflThinningRate < RNFL_THINNING_THRESHOLDS.CONCERNING ? 'concerning' : 'neutral'
    factors.push({
      factor: 'RNFL Thinning Rate', value: rnflThinningRate.toFixed(2), unit: 'µm/yr', contribution,
      detail: `Longitudinal thinning ${rnflThinningRate.toFixed(2)} µm/yr (concerning < −1.5 µm/yr).`
    })
  }

  // IOP
  if (meanIOP != null) {
    const contribution = meanIOP > IOP_THRESHOLDS.HIGH ? 'critical'
      : meanIOP > targetIOP + 5 ? 'concerning'
      : meanIOP > targetIOP ? 'neutral' : 'protective'
    factors.push({
      factor: 'Mean IOP', value: meanIOP.toFixed(1), unit: 'mmHg', contribution,
      detail: `Mean IOP ${meanIOP.toFixed(1)} mmHg vs. target ${targetIOP} mmHg.`
    })
  }
  if (maxIOP != null) {
    const contribution = maxIOP > IOP_THRESHOLDS.HIGH ? 'critical' : maxIOP > IOP_THRESHOLDS.ELEVATED ? 'concerning' : 'neutral'
    factors.push({
      factor: 'Peak IOP', value: maxIOP.toFixed(0), unit: 'mmHg', contribution,
      detail: `Peak IOP recorded. Sustained elevation increases progression risk.`
    })
  }

  // VF Slope
  if (vfSlope != null) {
    const contribution = vfSlope < VF_THRESHOLDS.SLOPE_CRITICAL ? 'critical'
      : vfSlope < VF_THRESHOLDS.SLOPE_CONCERNING ? 'concerning' : 'neutral'
    factors.push({
      factor: `VF Slope (${vfLabel})`, value: vfSlope.toFixed(2), unit: 'dB/yr', contribution,
      detail: `${vfSlope < VF_THRESHOLDS.SLOPE_CRITICAL ? 'Critical' : vfSlope < VF_THRESHOLDS.SLOPE_CONCERNING ? 'Concerning' : 'Stable'} rate of visual field loss. Threshold: −1.0 (concerning), −2.0 (critical) dB/yr.`
    })
  }

  // Age
  const ageContrib = age >= 70 ? 'concerning' : age >= 55 ? 'neutral' : 'protective'
  factors.push({
    factor: 'Age', value: age.toString(), unit: 'years', contribution: ageContrib,
    detail: `Age is an independent risk factor for glaucoma and progression.`
  })

  // CCT
  if (cct != null) {
    const contribution = cct < 480 ? 'critical' : cct < 520 ? 'concerning' : cct > 580 ? 'protective' : 'neutral'
    factors.push({
      factor: 'CCT', value: cct.toString(), unit: 'µm', contribution,
      detail: `Central corneal thickness ${cct} µm. Thin CCT (<520 µm) is a risk factor for progression.`
    })
  }

  return factors
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

interface AlertInputs {
  rnflMean: number | null
  iopValues: number[]
  targetIOP: number
  vfSlope: number | null
  progressionFlags: { plr2: boolean; plr3: boolean; md: boolean; any: boolean } | null
  rnflThinningRate: number | null
}

function buildAlerts(inputs: AlertInputs): Alert[] {
  const alerts: Alert[] = []
  const ts = new Date().toISOString()
  const { rnflMean, iopValues, targetIOP, vfSlope, progressionFlags, rnflThinningRate } = inputs

  if (rnflMean != null) {
    if (rnflMean < RNFL_THRESHOLDS.CRITICAL) {
      alerts.push({ id: 'rnfl-critical', type: 'rnfl', severity: 'critical',
        title: 'Critical RNFL Thinning', detail: `RNFL mean ${rnflMean.toFixed(1)} µm is below the critical threshold (${RNFL_THRESHOLDS.CRITICAL} µm). Urgent review recommended.`, timestamp: ts })
    } else if (rnflMean < RNFL_THRESHOLDS.ALERT) {
      alerts.push({ id: 'rnfl-alert', type: 'rnfl', severity: 'alert',
        title: 'RNFL Below Alert Threshold', detail: `RNFL mean ${rnflMean.toFixed(1)} µm is below ${RNFL_THRESHOLDS.ALERT} µm. Increased monitoring required.`, timestamp: ts })
    } else if (rnflMean < RNFL_THRESHOLDS.WATCH) {
      alerts.push({ id: 'rnfl-watch', type: 'rnfl', severity: 'watch',
        title: 'RNFL Below Watch Level', detail: `RNFL mean ${rnflMean.toFixed(1)} µm is below ${RNFL_THRESHOLDS.WATCH} µm. Monitor more closely.`, timestamp: ts })
    }
  }

  const visitsAboveTarget = iopValues.filter(v => v > targetIOP).length
  if (visitsAboveTarget >= IOP_THRESHOLDS.VISITS_ABOVE_TARGET) {
    const severity = iopValues.some(v => v > IOP_THRESHOLDS.HIGH) ? 'critical' : 'alert'
    alerts.push({ id: 'iop-elevated', type: 'iop', severity,
      title: `IOP Above Target on ${visitsAboveTarget} Visit${visitsAboveTarget > 1 ? 's' : ''}`,
      detail: `IOP exceeded target (${targetIOP} mmHg) on ${visitsAboveTarget} visits. Review treatment adherence.`, timestamp: ts })
  }

  if (vfSlope != null) {
    if (vfSlope < VF_THRESHOLDS.SLOPE_CRITICAL) {
      alerts.push({ id: 'vf-critical', type: 'vf', severity: 'critical',
        title: 'Rapid Visual Field Decline', detail: `VF declining at ${vfSlope.toFixed(2)} dB/yr (critical threshold: ${VF_THRESHOLDS.SLOPE_CRITICAL} dB/yr). Urgent intervention warranted.`, timestamp: ts })
    } else if (vfSlope < VF_THRESHOLDS.SLOPE_CONCERNING) {
      alerts.push({ id: 'vf-concerning', type: 'vf', severity: 'alert',
        title: 'Concerning Visual Field Decline', detail: `VF declining at ${vfSlope.toFixed(2)} dB/yr (threshold: ${VF_THRESHOLDS.SLOPE_CONCERNING} dB/yr). Consider treatment escalation.`, timestamp: ts })
    }
  }

  if (rnflThinningRate != null && rnflThinningRate < RNFL_THINNING_THRESHOLDS.CRITICAL) {
    alerts.push({ id: 'rnfl-rate', type: 'rnfl', severity: 'critical',
      title: 'Rapid RNFL Thinning', detail: `Thinning rate ${rnflThinningRate.toFixed(2)} µm/yr exceeds critical threshold.`, timestamp: ts })
  }

  if (progressionFlags) {
    if (progressionFlags.plr2) alerts.push({ id: 'prog-plr2', type: 'progression', severity: 'alert',
      title: 'Progression Recorded (PLR2)', detail: 'Pointwise Linear Regression (PLR2) flagged progression in this eye.', timestamp: ts })
    if (progressionFlags.plr3) alerts.push({ id: 'prog-plr3', type: 'progression', severity: 'alert',
      title: 'Progression Recorded (PLR3)', detail: 'Pointwise Linear Regression (PLR3) flagged progression in this eye.', timestamp: ts })
    if (progressionFlags.md)   alerts.push({ id: 'prog-md', type: 'progression', severity: 'alert',
      title: 'Progression Recorded (MD Flag)', detail: 'MD-based progression flag is positive for this eye.', timestamp: ts })
  }

  return alerts
}

// ─── Risk Level ───────────────────────────────────────────────────────────────

function computeRiskLevel(
  modelProb: number | null,
  factors: EvidenceFactor[],
  alerts: Alert[]
): RiskLevel {
  const critAlerts = alerts.filter(a => a.severity === 'critical').length
  const alertCount = alerts.filter(a => a.severity === 'alert').length
  const critFactors = factors.filter(f => f.contribution === 'critical').length
  const concernFactors = factors.filter(f => f.contribution === 'concerning').length

  if (critAlerts >= 2 || critFactors >= 2 || (modelProb != null && modelProb > 0.75)) return 'Critical'
  if (critAlerts >= 1 || alertCount >= 2 || critFactors >= 1 || (modelProb != null && modelProb > 0.5)) return 'High'
  if (alertCount >= 1 || concernFactors >= 2 || (modelProb != null && modelProb > 0.3)) return 'Moderate'
  return 'Low'
}

function computeRiskScore(
  modelProb: number | null,
  factors: EvidenceFactor[],
  alerts: Alert[]
): number {
  let score = 0
  if (modelProb != null) score += modelProb * 60
  score += factors.filter(f => f.contribution === 'critical').length * 15
  score += factors.filter(f => f.contribution === 'concerning').length * 7
  score += alerts.filter(a => a.severity === 'critical').length * 20
  score += alerts.filter(a => a.severity === 'alert').length * 10
  return Math.min(100, Math.round(score))
}

// ─── Forecasts ────────────────────────────────────────────────────────────────

function buildForecastPoints(
  baseline: number,
  slope: number,
  stderr: number = Math.abs(slope) * 0.3,
  horizonMonths: number = 24
): ForecastPoint[] {
  const horizons = horizonMonths === 24 ? [0, 6, 12, 18, 24] 
                 : horizonMonths === 60 ? [0, 12, 24, 36, 48, 60]
                 : [0, 24, 48, 72, 96, 120]
                 
  return horizons.map(mo => {
    const yr = mo / 12
    const value = baseline + slope * yr
    const band = stderr * yr
    return {
      label: mo === 0 ? 'Now' : `+${mo}mo`,
      value: Math.round(value * 10) / 10,
      lower: Math.round((value - 1.96 * band) * 10) / 10,
      upper: Math.round((value + 1.96 * band) * 10) / 10,
    }
  })
}

function buildVFForecast(
  slope: number | null,
  baselineMS: number | null,
  meanIOP: number | null,
  targetIOP: number,
  stage: GlaucomaStage | null,
  horizonMonths: number = 24
): ScenarioForecast | null {
  const baseline = baselineMS ?? -5
  let useSlope = slope
  let confidence: ScenarioForecast['confidence'] = 'high'
  let confidenceNote = ''

  if (useSlope == null) {
    const stageDefault = DEFAULT_SLOPES[stage ?? 'Moderate']
    useSlope = stageDefault.vf
    confidence = 'low'
    confidenceNote = 'Only 1 visit available. Slope estimated from stage-based defaults. Low confidence.'
  } else if (Math.abs(useSlope) < 0.01) {
    confidence = 'medium'
    confidenceNote = 'Minimal slope detected. Confidence is moderate.'
  }

  const iopAdj = meanIOP != null && meanIOP > targetIOP
    ? (meanIOP - targetIOP) * IOP_SLOPE_ADJUSTMENT_PER_MMHG
    : 0

  const stderr = Math.abs(useSlope) * 0.3 + 0.2
  return {
    current: buildForecastPoints(baseline, useSlope, stderr, horizonMonths),
    intensified: buildForecastPoints(baseline, useSlope * SCENARIOS.intensified.vfSlopeMultiplier, stderr, horizonMonths),
    untreated: buildForecastPoints(baseline, useSlope * SCENARIOS.untreated.vfSlopeMultiplier, stderr, horizonMonths),
    confidence, confidenceNote,
  }
}

function buildRNFLForecast(
  thinningRate: number | null,
  baselineRNFL: number | null,
  stage: GlaucomaStage | null,
  horizonMonths: number = 24
): ScenarioForecast | null {
  if (baselineRNFL == null) return null
  let useRate = thinningRate
  let confidence: ScenarioForecast['confidence'] = 'high'
  let confidenceNote = ''

  if (useRate == null) {
    useRate = DEFAULT_SLOPES[stage ?? 'Moderate'].rnfl
    confidence = 'low'
    confidenceNote = 'RNFL thinning rate not available (baseline only or single RNFL visit). Estimated from stage defaults.'
  }

  const stderr = Math.abs(useRate) * 0.25 + 0.15
  return {
    current: buildForecastPoints(baselineRNFL, useRate, stderr, horizonMonths),
    intensified: buildForecastPoints(baselineRNFL, useRate * SCENARIOS.intensified.rnflSlopeMultiplier, stderr, horizonMonths),
    untreated: buildForecastPoints(baselineRNFL, useRate * SCENARIOS.untreated.rnflSlopeMultiplier, stderr, horizonMonths),
    confidence, confidenceNote,
  }
}

function buildIOPForecast(iopValues: number[], horizonMonths: number = 24): ScenarioForecast | null {
  if (iopValues.length === 0) return null
  const baselineIOP = iopValues[iopValues.length - 1]
  const trend = iopValues.length >= 2
    ? linearRegression(iopValues.map((_, i) => i / 12), iopValues)?.slope ?? 0
    : 0
  return {
    current: buildForecastPoints(baselineIOP, trend, 1.5, horizonMonths),
    intensified: buildForecastPoints(baselineIOP - SCENARIOS.intensified.iopReductionMmHg, trend * 0.5, 1.5, horizonMonths),
    untreated: buildForecastPoints(baselineIOP + Math.abs(SCENARIOS.untreated.iopReductionMmHg), trend * 1.5, 2.0, horizonMonths),
    confidence: iopValues.length >= 3 ? 'high' : 'medium',
    confidenceNote: iopValues.length < 3 ? 'Fewer than 3 IOP readings. Trend estimate may be unreliable.' : '',
  }
}

// ─── AI Summary Template ──────────────────────────────────────────────────────

function buildAISummary(params: {
  id: string; age: number; laterality: string; riskLevel: RiskLevel
  rnflMean: number | null; meanIOP: number | null; vfSlope: number | null
  modelProb: number | null; progressed: boolean; stage: GlaucomaStage | null
  source: 'dataset' | 'manual'
}): string {
  const { id, age, laterality, riskLevel, rnflMean, meanIOP, vfSlope, modelProb, progressed, stage, source } = params

  const rnflText = rnflMean != null
    ? `RNFL averaging ${rnflMean.toFixed(1)} µm`
    : 'RNFL data not available'
  const iopText = meanIOP != null ? `mean IOP of ${meanIOP.toFixed(1)} mmHg` : 'IOP data limited'
  const vfText = vfSlope != null
    ? `visual field declining at ${Math.abs(vfSlope).toFixed(2)} dB/yr ${vfSlope < 0 ? '(worsening)' : '(improving)'}`
    : 'insufficient VF data for slope'
  const probText = modelProb != null ? `Model probability: ${(modelProb * 100).toFixed(0)}%.` : ''
  const progText = progressed ? ' Progression has been recorded by clinical criteria.' : ''
  const stageText = stage ? ` Approximate stage: ${stage}.` : ''

  return `Patient ${id}, age ${age}, ${laterality} eye${source === 'dataset' ? ' (dataset)' : ' (manually entered)'}. ` +
    `Risk assessment: ${riskLevel}.${stageText} ` +
    `Key findings: ${rnflText} with ${iopText}, ${vfText}. ` +
    `${probText}${progText} ` +
    `This is a decision-support summary generated from structured clinical data. ` +
    `Clinical judgment must guide all treatment decisions.`
}
