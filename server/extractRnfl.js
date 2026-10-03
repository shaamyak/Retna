// server/extractRnfl.js — RNFL extraction endpoint
// Receives a base64-encoded image, calls a vision model, returns structured data.
// The API key is read from process.env — it never touches the browser.

import { Router } from 'express'
import OpenAI from 'openai'

export const extractRnflRouter = Router()

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a medical image data extractor. You receive an OCT (optical coherence tomography) RNFL (retinal nerve fiber layer) thickness report image.

YOUR ONLY JOB: Read the printed numbers from the report and return them as JSON. You MUST follow these rules strictly:

1. Only read numbers that are CLEARLY AND UNAMBIGUOUSLY printed on the image.
2. NEVER estimate, guess, interpolate or calculate values from visual patterns.
3. Return null for any value that is not clearly readable.
4. NEVER return the patient's name, ID, date of birth, or any personal identifier.
5. Only extract: average RNFL thickness (µm), superior quadrant (µm), nasal quadrant (µm), inferior quadrant (µm), temporal quadrant (µm), eye (OD or OS), and device name.
6. For each numeric value, assign confidence: "high" (clearly printed, easy to read), "medium" (printed but small or slightly unclear), "low" (barely visible, hard to read).
7. If the image does not appear to be an RNFL thickness report (e.g. it is a B-scan, fundus photo, or unrelated image), set foundReport to false and all values to null.

Return ONLY this JSON structure, no other text:
{
  "foundReport": true or false,
  "average":   { "value": number or null, "confidence": "high"|"medium"|"low"|null },
  "superior":  { "value": number or null, "confidence": "high"|"medium"|"low"|null },
  "inferior":  { "value": number or null, "confidence": "high"|"medium"|"low"|null },
  "nasal":     { "value": number or null, "confidence": "high"|"medium"|"low"|null },
  "temporal":  { "value": number or null, "confidence": "high"|"medium"|"low"|null },
  "eye":       { "value": "OD"|"OS"|null, "confidence": "high"|"medium"|"low"|null },
  "device":    { "value": string or null, "confidence": "high"|"medium"|"low"|null }
}`

// ── Schema validation ─────────────────────────────────────────────────────────
const CONFIDENCE_VALS = new Set(['high', 'medium', 'low', null])

function validateExtractionResponse(data) {
  if (typeof data !== 'object' || data === null) return false
  if (typeof data.foundReport !== 'boolean') return false

  const numericFields = ['average', 'superior', 'inferior', 'nasal', 'temporal']
  for (const f of numericFields) {
    const field = data[f]
    if (!field || typeof field !== 'object') return false
    if (field.value !== null && typeof field.value !== 'number') return false
    if (!CONFIDENCE_VALS.has(field.confidence)) return false
    // Sanity range check — RNFL must be 20–200 µm if present
    if (field.value !== null && (field.value < 20 || field.value > 200)) return false
  }

  // Eye
  const eye = data.eye
  if (!eye || typeof eye !== 'object') return false
  if (eye.value !== null && eye.value !== 'OD' && eye.value !== 'OS') return false

  // Device — just check it's a string or null
  const dev = data.device
  if (!dev || typeof dev !== 'object') return false
  if (dev.value !== null && typeof dev.value !== 'string') return false

  return true
}

// ── Endpoint ──────────────────────────────────────────────────────────────────
extractRnflRouter.post('/extract-rnfl', async (req, res) => {
  // Check API key
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'sk-...' || apiKey.includes('...')) {
    return res.status(503).json({
      error: 'API key is missing in .env',
      code: 'NO_API_KEY',
    })
  }

  const { imageDataUrl } = req.body
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return res.status(400).json({ error: 'imageDataUrl is required', code: 'MISSING_IMAGE' })
  }

  // Strip the data: prefix to get the raw base64
  const base64Match = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!base64Match) {
    return res.status(400).json({ error: 'Invalid image format', code: 'INVALID_IMAGE' })
  }
  const mimeType = base64Match[1]
  const base64Data = base64Match[2]

  // Image size guard (10MB limit on base64)
  if (base64Data.length > 14_000_000) {
    return res.status(413).json({ error: 'Image too large (max ~10 MB)', code: 'IMAGE_TOO_LARGE' })
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini'

    const completion = await openai.chat.completions.create({
      model,
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the RNFL thickness values from this OCT report image. Return only JSON.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim() ?? ''

    // Extract JSON from response (model may wrap in markdown code fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[extract-rnfl] Model returned no JSON:', raw.slice(0, 200))
      return res.status(502).json({
        error: 'Vision model did not return valid JSON.',
        code: 'PARSE_ERROR',
      })
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      return res.status(502).json({ error: 'Failed to parse model response as JSON.', code: 'PARSE_ERROR' })
    }

    if (!validateExtractionResponse(parsed)) {
      console.error('[extract-rnfl] Schema validation failed:', JSON.stringify(parsed).slice(0, 300))
      return res.status(502).json({
        error: 'Vision model response did not match expected schema.',
        code: 'SCHEMA_ERROR',
      })
    }

    // Do NOT log the parsed result (contains PHI-adjacent data)
    // Only log anonymised summary
    console.log(`[extract-rnfl] OK foundReport=${parsed.foundReport}`)

    return res.json({ ok: true, data: parsed })
  } catch (err) {
    const msg = err?.message ?? String(err)
    const safeMsg = msg.replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED]')
    console.error('[extract-rnfl] API error:', safeMsg.slice(0, 200))

    if (msg.includes('401') || msg.includes('403') || msg.includes('Incorrect API key')) {
      return res.status(502).json({ error: 'The provider rejected the API key', code: 'AUTH_ERROR' })
    }
    if (msg.includes('429') || msg.includes('quota')) {
      return res.status(502).json({ error: 'Rate limit reached, try again shortly', code: 'QUOTA_ERROR' })
    }
    return res.status(502).json({ error: 'Could not read this image', code: 'API_ERROR' })
  }
})
