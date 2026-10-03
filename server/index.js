// server/index.js — GlaucoMap backend API server
// Runs on port 3001; Vite dev server proxies /api/* here.
// The API key for the vision model lives ONLY in .env — never sent to the browser.

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { extractRnflRouter } from './extractRnfl.js'

const PORT = process.env.API_PORT || 3001
const app  = express()

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json({ limit: '20mb' }))

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// RNFL extraction
app.use('/api', extractRnflRouter)

// Never log images or extracted text to stdout in production
app.listen(PORT, () => {
  console.log(`GlaucoMap API server listening on http://localhost:${PORT}`)
  if (!process.env.OPENAI_API_KEY) {
    console.warn('  OPENAI_API_KEY not set — /api/extract-rnfl will return 503')
  }
})
