/**
 * Scenario configuration for 24-month forecasts.
 * Values are slope multipliers applied to the baseline progression rate.
 * Source: Approximately 10% risk change per 1 mmHg IOP change (OHTS, EGPS trials).
 * IMPORTANT: These are modeling assumptions, not clinical prescriptions.
 */

export interface ScenarioConfig {
  label: string
  description: string
  vfSlopeMultiplier: number
  rnflSlopeMultiplier: number
  iopReductionMmHg: number
  colorClass: string
  colorHex: string
}

export const SCENARIOS: Record<'current' | 'intensified' | 'untreated', ScenarioConfig> = {
  current: {
    label: 'Current Treatment',
    description: 'Progression continues at current observed rate',
    vfSlopeMultiplier: 1.0,
    rnflSlopeMultiplier: 1.0,
    iopReductionMmHg: 0,
    colorClass: 'text-brand-400',
    colorHex: '#5896f8',
  },
  intensified: {
    label: 'Intensified Treatment',
    description: 'IOP lowered ~5 mmHg → ~35–50% slower progression (per EMGT/OHTS)',
    vfSlopeMultiplier: 0.6,
    rnflSlopeMultiplier: 0.6,
    iopReductionMmHg: 5,
    colorClass: 'text-emerald-400',
    colorHex: '#10b981',
  },
  untreated: {
    label: 'Untreated / Escalating',
    description: 'Progression ~50–80% faster without treatment (per CNTGS)',
    vfSlopeMultiplier: 1.65,
    rnflSlopeMultiplier: 1.5,
    iopReductionMmHg: -3,
    colorClass: 'text-red-400',
    colorHex: '#ef4444',
  },
}

/** Default slope estimates by stage (dB/yr for VF, µm/yr for RNFL) when < 2 visits */
export const DEFAULT_SLOPES = {
  Suspect:  { vf: -0.3, rnfl: -0.5 },
  Early:    { vf: -0.5, rnfl: -1.0 },
  Moderate: { vf: -1.0, rnfl: -1.5 },
  Advanced: { vf: -1.8, rnfl: -2.0 },
} as const

/** IOP adjustment to slope: % change per mmHg IOP change (from OHTS) */
export const IOP_SLOPE_ADJUSTMENT_PER_MMHG = 0.10  // 10% per mmHg

export const TARGET_IOP_DEFAULT = 15  // mmHg

export const RNFL_PROJECTION_CONFIG = {
  base_rate: 0.5,
  reference_IOP: 15,
  k: 3.5,
  floor: 50,
  concern_threshold: 60,
  untreated_offset: 7,
  confidence_band: 3,
}
