/**
 * Alert thresholds for GlaucoMap.
 * All values from published normative data (Spectralis OCT, Zeiss Cirrus) 
 * and clinical guidelines (EGS, AAO PPP).
 */

export const RNFL_THRESHOLDS = {
  WATCH:    80,   // µm — below this, monitor more closely
  ALERT:    70,   // µm — below normative 1% limit for most instruments
  CRITICAL: 55,   // µm — severe thinning
  NORMATIVE_LOWER: 80,  // approximate lower bound of normal
  NORMATIVE_UPPER: 100, // approximate upper bound of normal
} as const

export const IOP_THRESHOLDS = {
  TARGET_DEFAULT: 15,   // mmHg — editable per patient
  ELEVATED:       21,   // mmHg — standard definition of OHT
  HIGH:           26,   // mmHg — markedly elevated
  CRITICAL:       35,   // mmHg — very high, urgent
  VISITS_ABOVE_TARGET: 2,  // number of visits above target to trigger alert
} as const

export const VF_THRESHOLDS = {
  SLOPE_CONCERNING:  -1.0,  // dB/yr
  SLOPE_CRITICAL:    -2.0,  // dB/yr
  MS_NORMAL_LOWER:   25.0,  // dB mean sensitivity (approx)
  MD_SUSPECT:        -2.0,  // dB
  MD_MODERATE:       -6.0,  // dB
  MD_ADVANCED:      -12.0,  // dB
} as const

export const ASYMMETRY_THRESHOLDS = {
  IS_RATIO_NORMAL_LOWER: 0.8,   // inferior/superior ratio — below is suspicious
  NT_RATIO_NORMAL_UPPER: 1.5,   // nasal/temporal — above is suspicious
  SECTOR_DIFF_CONCERN:   15,    // µm difference between IS sectors
} as const

export const RNFL_THINNING_THRESHOLDS = {
  CONCERNING: -1.5,  // µm/yr
  CRITICAL:   -2.5,  // µm/yr
} as const
