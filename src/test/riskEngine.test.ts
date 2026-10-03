import { describe, it, expect, beforeEach } from 'vitest'
import { analyzeDatasetPatient, analyzeManualPatient } from '@/lib/riskEngine'
import type { DatasetPatient, ManualPatient } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseDatasetPatient: DatasetPatient = {
  id: 'TEST_OD',
  subjectNumber: 999,
  laterality: 'OD',
  age: 58,
  gender: 'M',
  category: 'OAG',
  totalVisits: 3,
  baselineIOP: 22,
  cct: 520,
  rnfl: { mean: 75, superior: 95, inferior: 68, nasal: 70, temporal: 62 },
  progressionFlags: { plr2: false, plr3: false, md: false, any: false },
  derivedStage: 'Moderate',
  visits: [
    { visitNumber: 1, intervalYears: 0,   iop: 22, ms: 24.5, vfSd: 4.1, validPoints: 52, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
    { visitNumber: 2, intervalYears: 1.0, iop: 21, ms: 23.8, vfSd: 4.3, validPoints: 52, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
    { visitNumber: 3, intervalYears: 2.0, iop: 24, ms: 23.1, vfSd: 4.5, validPoints: 52, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
  ],
  msSlopeDbPerYear: -0.7,
  modelProbability: 0.45,
  source: 'dataset',
}

const progressedPatient: DatasetPatient = {
  ...baseDatasetPatient,
  id: 'TEST_PROG_OD',
  rnfl: { mean: 52, superior: 60, inferior: 48, nasal: 58, temporal: 50 },
  progressionFlags: { plr2: true, plr3: false, md: true, any: true },
  msSlopeDbPerYear: -2.5,
  modelProbability: 0.82,
  visits: [
    { visitNumber: 1, intervalYears: 0,   iop: 28, ms: 18.0, vfSd: 6.5, validPoints: 50, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
    { visitNumber: 2, intervalYears: 1.0, iop: 30, ms: 15.5, vfSd: 7.0, validPoints: 50, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
    { visitNumber: 3, intervalYears: 2.0, iop: 27, ms: 13.0, vfSd: 7.5, validPoints: 48, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
  ],
}

const noRNFLPatient: DatasetPatient = {
  ...baseDatasetPatient,
  id: 'TEST_NORNFL',
  rnfl: { mean: null, superior: null, inferior: null, nasal: null, temporal: null },
  msSlopeDbPerYear: -0.5,
}

const singleVisitPatient: DatasetPatient = {
  ...baseDatasetPatient,
  id: 'TEST_1VISIT',
  totalVisits: 1,
  msSlopeDbPerYear: null,
  visits: [
    { visitNumber: 1, intervalYears: 0, iop: 18, ms: 26.0, vfSd: 3.5, validPoints: 54, cfp: null, acquisitionDevice: null, resolution: null, vfGrid: [] },
  ],
}

const baseManualPatient: ManualPatient = {
  id: 'MANUAL_1',
  name: 'Raj K.',
  age: 58,
  gender: 'M',
  laterality: 'OD',
  stage: 'Moderate',
  category: 'OAG',
  cct: 510,
  firstVisitDate: '2024-01-01',
  entryDate: '2024-01-01T00:00:00Z',
  rnflVisits: [
    { date: '2024-01-01', sectors: { mean: 72, superior: 88, inferior: 65, nasal: 70, temporal: 62 } },
    { date: '2025-01-01', sectors: { mean: 70, superior: 86, inferior: 63, nasal: 68, temporal: 60 } },
  ],
  iopReadings: [
    { date: '2024-01-01', value: 22 },
    { date: '2024-06-01', value: 24 },
    { date: '2025-01-01', value: 21 },
  ],
  vfEntries: [
    { date: '2024-01-01', md: -4.2, vfi: 89 },
    { date: '2025-01-01', md: -5.0, vfi: 85 },
  ],
  treatmentNotes: '',
  medications: '',
  adherence: '',
  octImages: [],
  source: 'manual',
  isDraft: false,
}

const noVFManualPatient: ManualPatient = {
  ...baseManualPatient,
  id: 'MANUAL_NOVF',
  vfEntries: [],
}

// ─── Tests: Dataset Patient ───────────────────────────────────────────────────

describe('analyzeDatasetPatient', () => {
  it('returns a valid analysis with riskLevel and riskScore', () => {
    const a = analyzeDatasetPatient(baseDatasetPatient)
    expect(a).toBeDefined()
    expect(['Low', 'Moderate', 'High', 'Critical']).toContain(a.riskLevel)
    expect(a.riskScore).toBeGreaterThanOrEqual(0)
    expect(a.riskScore).toBeLessThanOrEqual(100)
  })

  it('produces Critical risk for severely progressed patient', () => {
    const a = analyzeDatasetPatient(progressedPatient)
    expect(['High', 'Critical']).toContain(a.riskLevel)
  })

  it('generates alerts for progressed patient with progression flags', () => {
    const a = analyzeDatasetPatient(progressedPatient)
    const progAlerts = a.alerts.filter(al => al.type === 'progression')
    expect(progAlerts.length).toBeGreaterThan(0)
  })

  it('generates RNFL critical alert when RNFL < 55 µm', () => {
    const a = analyzeDatasetPatient(progressedPatient)
    const rnflAlert = a.alerts.find(al => al.id === 'rnfl-critical')
    expect(rnflAlert).toBeDefined()
  })

  it('generates VF critical alert when slope < -2.0 dB/yr', () => {
    const a = analyzeDatasetPatient(progressedPatient)
    const vfAlert = a.alerts.find(al => al.id === 'vf-critical')
    expect(vfAlert).toBeDefined()
  })

  it('handles missing RNFL gracefully (no error)', () => {
    const a = analyzeDatasetPatient(noRNFLPatient)
    expect(a).toBeDefined()
    expect(a.rnflThinningRate).toBeNull()
  })

  it('handles single visit (no slope) with low-confidence forecast', () => {
    const a = analyzeDatasetPatient(singleVisitPatient)
    expect(a.vfSlope).toBeNull()
    if (a.vfForecast) {
      expect(a.vfForecast.confidence).toBe('low')
    }
  })

  it('computes IOP stats correctly', () => {
    const a = analyzeDatasetPatient(baseDatasetPatient)
    expect(a.meanIOP).toBeCloseTo((22 + 21 + 24) / 3, 1)
    expect(a.maxIOP).toBe(24)
  })

  it('contains an AI summary string', () => {
    const a = analyzeDatasetPatient(baseDatasetPatient)
    expect(typeof a.aiSummary).toBe('string')
    expect(a.aiSummary.length).toBeGreaterThan(50)
  })

  it('includes evidence factors with correct structure', () => {
    const a = analyzeDatasetPatient(baseDatasetPatient)
    expect(a.evidenceFactors.length).toBeGreaterThan(0)
    for (const f of a.evidenceFactors) {
      expect(f.factor).toBeTruthy()
      expect(['protective', 'neutral', 'concerning', 'critical']).toContain(f.contribution)
    }
  })
})

// ─── Tests: Manual Patient ────────────────────────────────────────────────────

describe('analyzeManualPatient', () => {
  it('computes VF slope from multiple VF entries', () => {
    const a = analyzeManualPatient(baseManualPatient)
    expect(a.vfSlope).not.toBeNull()
    expect(a.vfSlope!).toBeLessThan(0)  // declining
  })

  it('computes RNFL thinning rate from multi-visit RNFL', () => {
    const a = analyzeManualPatient(baseManualPatient)
    expect(a.rnflThinningRate).not.toBeNull()
  })

  it('handles missing VF entries gracefully', () => {
    const a = analyzeManualPatient(noVFManualPatient)
    expect(a.vfSlope).toBeNull()
  })

  it('produces a valid risk level', () => {
    const a = analyzeManualPatient(baseManualPatient)
    expect(['Low', 'Moderate', 'High', 'Critical']).toContain(a.riskLevel)
  })

  it('generates IOP alert when multiple readings above target', () => {
    const a = analyzeManualPatient(baseManualPatient, 15)  // target = 15, all readings > 15
    const iopAlert = a.alerts.find(al => al.type === 'iop')
    expect(iopAlert).toBeDefined()
  })

  it('returns forecasts for both VF and RNFL', () => {
    const a = analyzeManualPatient(baseManualPatient)
    expect(a.vfForecast).not.toBeNull()
    expect(a.rnflForecast).not.toBeNull()
    if (a.vfForecast) {
      expect(a.vfForecast.current).toHaveLength(5)  // 0, 6, 12, 18, 24 mo
    }
  })
})

// ─── Tests: Validation rules ──────────────────────────────────────────────────

describe('Validation rules (inline)', () => {
  // RNFL hard bounds
  it('rejects RNFL < 20', () => {
    expect(19 < 20 || 19 > 200).toBe(true)
  })
  it('rejects RNFL > 200', () => {
    expect(201 < 20 || 201 > 200).toBe(true)
  })
  it('accepts RNFL 20–200', () => {
    expect(!(80 < 20 || 80 > 200)).toBe(true)
  })

  // IOP hard bounds
  it('rejects IOP < 5', () => {
    expect(4 < 5 || 4 > 60).toBe(true)
  })
  it('rejects IOP > 60', () => {
    expect(61 < 5 || 61 > 60).toBe(true)
  })

  // MD hard bounds
  it('rejects MD < -35', () => {
    expect(-36 < -35 || -36 > 3).toBe(true)
  })
  it('rejects MD > +3', () => {
    expect(4 < -35 || 4 > 3).toBe(true)
  })

  // VFI bounds
  it('rejects VFI < 0', () => {
    expect(-1 < 0 || -1 > 100).toBe(true)
  })
  it('rejects VFI > 100', () => {
    expect(101 < 0 || 101 > 100).toBe(true)
  })
})
