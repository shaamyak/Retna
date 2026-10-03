// ─── Core Domain Types ───────────────────────────────────────────────────────

export type Eye = 'OD' | 'OS'
export type Gender = 'M' | 'F'
export type GlaucomaCategory = 'OAG' | 'ACG' | 'Other'
export type GlaucomaStage = 'Suspect' | 'Early' | 'Moderate' | 'Advanced'
export type PatientSource = 'dataset' | 'manual'
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical'

export interface RNFLSectors {
  mean: number | null
  superior: number | null
  inferior: number | null
  nasal: number | null
  temporal: number | null
}

/** One visit row from the follow-up sheet */
export interface VisitData {
  visitNumber: number
  intervalYears: number
  iop: number | null
  ms: number | null          // mean sensitivity (dB) from VF grid (non -1 points)
  vfSd: number | null        // VF standard deviation
  validPoints: number | null
  cfp: string | null         // fundus photo filename
  acquisitionDevice: string | null
  resolution: string | null
  vfGrid: (number | null)[]  // 61 points, null where original was -1 or missing
}

/** RNFL visit for manual patients (multi-visit capable) */
export interface RNFLVisit {
  date: string
  sectors: RNFLSectors
}

/** IOP reading for manual patients */
export interface IOPReading {
  date: string
  value: number
}

/** Visual field entry for manual patients */
export interface VFEntry {
  date: string
  md: number | null    // dB
  vfi: number | null   // %
}

/** Progression flags from dataset */
export interface ProgressionFlags {
  plr2: boolean
  plr3: boolean
  md: boolean  // "MD" flag column (binary, not dB value)
  any: boolean
}

// ─── Dataset Patient (read-only, from patients.json) ─────────────────────────

export interface DatasetPatient {
  id: string                  // e.g. "101_OD"
  subjectNumber: number
  laterality: Eye
  age: number
  gender: Gender
  category: GlaucomaCategory
  totalVisits: number
  baselineIOP: number | null
  cct: number | null          // µm
  rnfl: RNFLSectors           // baseline only
  progressionFlags: ProgressionFlags
  derivedStage: GlaucomaStage | null  // derived from MS terciles, labeled "approximate"
  visits: VisitData[]
  msSlopeDbPerYear: number | null     // OLS on visits 1-3
  modelProbability: number | null     // out-of-fold LR probability
  source: 'dataset'
}

// ─── Manual Patient ───────────────────────────────────────────────────────────

export interface ManualPatient {
  id: string                  // uuid
  name: string
  age: number
  gender: Gender
  laterality: Eye
  stage: GlaucomaStage
  category: GlaucomaCategory
  cct: number | null
  targetIOP?: number
  firstVisitDate: string
  entryDate: string           // when doctor entered this

  rnflVisits: RNFLVisit[]
  iopReadings: IOPReading[]
  vfEntries: VFEntry[]
  treatmentNotes: string
  medications: string
  adherence: string

  octImages: string[]         // data URLs (compressed)
  source: 'manual'
  isDraft: boolean
  isDemo?: boolean

  // Computed by runAnalysis
  analysis?: PatientAnalysis
}

// ─── Analysis Results ─────────────────────────────────────────────────────────

export interface EvidenceFactor {
  factor: string
  value: string
  unit: string
  contribution: 'protective' | 'neutral' | 'concerning' | 'critical'
  detail: string
}

export interface Alert {
  id: string
  type: 'rnfl' | 'iop' | 'vf' | 'progression' | 'asymmetry'
  severity: 'watch' | 'alert' | 'critical'
  title: string
  detail: string
  timestamp: string
}

export interface ForecastPoint {
  label: string              // e.g. "Now", "+6mo", "+12mo", "+18mo", "+24mo"
  value: number
  lower: number
  upper: number
}

export interface ScenarioForecast {
  current: ForecastPoint[]
  intensified: ForecastPoint[]
  untreated: ForecastPoint[]
  confidence: 'high' | 'medium' | 'low'
  confidenceNote: string
}

export interface PatientAnalysis {
  patientId: string
  computedAt: string
  riskLevel: RiskLevel
  riskScore: number          // 0-100
  modelProbability: number | null
  evidenceFactors: EvidenceFactor[]
  alerts: Alert[]
  vfForecast: ScenarioForecast | null
  rnflForecast: ScenarioForecast | null
  iopForecast: ScenarioForecast | null
  aiSummary: string
  vfSlope: number | null     // dB/yr
  rnflThinningRate: number | null  // µm/yr, manual multi-visit only
  meanIOP: number | null
  maxIOP: number | null
}

// ─── Model (loaded from model.json) ──────────────────────────────────────────

export interface ModelCoefficients {
  intercept: number
  features: Record<string, number>
}

export interface ModelMetrics {
  auc: number
  prAuc: number
  sensitivity80spec: number
  nFolds: number
  nPositive: number
  nTotal: number
}

export interface ModelData {
  version: string
  trainedAt: string
  featureNames: string[]
  featureMeans: Record<string, number>
  featureStds: Record<string, number>
  coefficients: ModelCoefficients
  metrics: ModelMetrics
  limitations: string[]
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export interface FilterState {
  search: string
  laterality: Eye | 'Both'
  riskLevel: RiskLevel | 'All'
  sortBy: 'recent' | 'risk-desc' | 'age-desc' | 'iop-desc' | 'rnfl-asc'
}
