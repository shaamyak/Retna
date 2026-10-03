/**
 * src/lib/rnflExtractor.ts
 *
 * Client-side logic for RNFL extraction:
 *  - Sends the image to /api/extract-rnfl (proxied to the Express server)
 *  - Validates the response schema
 *  - Runs consistency checks (config-driven thresholds)
 *  - Never sends the API key — it lives only in server/.env
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface ExtractionField<T> {
  value: T | null
  confidence: Confidence | null
}

export interface ExtractionData {
  foundReport: boolean
  average:  ExtractionField<number>
  superior: ExtractionField<number>
  inferior: ExtractionField<number>
  nasal:    ExtractionField<number>
  temporal: ExtractionField<number>
  eye:      ExtractionField<'OD' | 'OS'>
  device:   ExtractionField<string>
}

export interface ExtractionResult {
  ok: true
  data: ExtractionData
  warnings: string[]  // consistency warnings (amber)
  errors: string[]    // hard errors (block submit)
}

export interface ExtractionError {
  ok: false
  code: string
  message: string
}

// ── Config-driven thresholds ──────────────────────────────────────────────────

/** Max allowed µm difference between average and mean-of-quadrants */
const QUAD_AVG_TOLERANCE_UM = 5

/** Hard bounds for any RNFL value (also validated server-side) */
const RNFL_MIN_UM = 20
const RNFL_MAX_UM = 200

// ── Schema validator ──────────────────────────────────────────────────────────

const VALID_CONF = new Set<string | null>(['high', 'medium', 'low', null])

function isValidField(f: unknown, checkFn: (v: unknown) => boolean): boolean {
  if (!f || typeof f !== 'object') return false
  const field = f as Record<string, unknown>
  if (!VALID_CONF.has(field.confidence as string | null)) return false
  if (field.value !== null && !checkFn(field.value)) return false
  return true
}

function isNumericRNFL(v: unknown): boolean {
  return typeof v === 'number' && v >= RNFL_MIN_UM && v <= RNFL_MAX_UM
}

function validateSchema(raw: unknown): raw is ExtractionData {
  if (!raw || typeof raw !== 'object') return false
  const d = raw as Record<string, unknown>
  if (typeof d.foundReport !== 'boolean') return false
  const numFields = ['average', 'superior', 'inferior', 'nasal', 'temporal'] as const
  for (const f of numFields) {
    if (!isValidField(d[f], isNumericRNFL)) return false
  }
  if (!isValidField(d.eye, v => v === 'OD' || v === 'OS')) return false
  if (!isValidField(d.device, v => typeof v === 'string')) return false
  return true
}

// ── Consistency checks ────────────────────────────────────────────────────────

export function runConsistencyChecks(
  data: ExtractionData,
  selectedEye: 'OD' | 'OS' | ''
): { warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []

  const { average, superior, inferior, nasal, temporal } = data
  const quads = [superior.value, inferior.value, nasal.value, temporal.value].filter(
    (v): v is number => v !== null
  )

  // 1. Average vs mean-of-quadrants
  if (average.value !== null && quads.length === 4) {
    const quadMean = quads.reduce((s, v) => s + v, 0) / 4
    if (Math.abs(average.value - quadMean) > QUAD_AVG_TOLERANCE_UM) {
      warnings.push(
        `Average (${average.value} µm) differs from mean of quadrants (${quadMean.toFixed(1)} µm) ` +
        `by ${Math.abs(average.value - quadMean).toFixed(1)} µm. Please verify.`
      )
    }
  }

  // 2. Eye mismatch
  if (data.eye.value && selectedEye && data.eye.value !== selectedEye) {
    warnings.push(
      `Report shows ${data.eye.value} but you selected ${selectedEye}. ` +
      `Please confirm the correct eye.`
    )
  }

  // 3. Hard range errors (already filtered server-side, but check editable fields too)
  const allNumeric: Array<[string, number | null]> = [
    ['Average', average.value],
    ['Superior', superior.value],
    ['Inferior', inferior.value],
    ['Nasal', nasal.value],
    ['Temporal', temporal.value],
  ]
  for (const [label, val] of allNumeric) {
    if (val !== null && (val < RNFL_MIN_UM || val > RNFL_MAX_UM)) {
      errors.push(`${label} ${val} µm is outside the valid range (${RNFL_MIN_UM}–${RNFL_MAX_UM} µm).`)
    }
  }

  return { warnings, errors }
}

// ── API call ──────────────────────────────────────────────────────────────────

export async function extractRNFL(
  imageDataUrl: string,
  selectedEye: 'OD' | 'OS' | ''
): Promise<ExtractionResult | ExtractionError> {
  let response: Response
  try {
    response = await fetch('/api/extract-rnfl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
    })
  } catch (networkErr) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the extraction server. Is "npm run server" running? You can type RNFL values manually.',
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return {
      ok: false,
      code: 'PARSE_ERROR',
      message: 'Server returned an unexpected response. You can type RNFL values manually.',
    }
  }

  if (!response.ok) {
    const errBody = body as Record<string, string>
    return {
      ok: false,
      code: errBody?.code ?? 'API_ERROR',
      message: errBody?.error ?? 'Extraction failed. You can type RNFL values manually.',
    }
  }

  const successBody = body as { ok: boolean; data: unknown }
  if (!validateSchema(successBody?.data)) {
    return {
      ok: false,
      code: 'SCHEMA_ERROR',
      message: 'The server returned unexpected data. You can type RNFL values manually.',
    }
  }

  const data = successBody.data as ExtractionData
  const { warnings, errors } = runConsistencyChecks(data, selectedEye)

  return { ok: true, data, warnings, errors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Whether a field needs verification (null, low-confidence, or has a range error) */
export function needsVerification(field: ExtractionField<unknown>): boolean {
  return field.value === null || field.confidence === 'low'
}

/** Whether the overall extraction requires a verification checkbox */
export function requiresVerificationCheckbox(data: ExtractionData): boolean {
  const fields = [data.average, data.superior, data.inferior, data.nasal, data.temporal]
  return fields.some(f => needsVerification(f))
}
