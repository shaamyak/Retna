import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import { MessageSquare, Send, ChevronRight, Lightbulb } from 'lucide-react'

const QUICK_PROMPTS = [
  'Show me the highest-risk patient in the dataset',
  'Which patients have RNFL below 70 µm?',
  'What does the VF slope mean?',
  'Explain the I/S asymmetry finding',
  'What is the difference between MS and MD?',
  'How are the 24-month forecasts calculated?',
  'What does the model AUC mean?',
]

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface DatasetContext {
  nPatients: number
  nProgressed: number
  rnflMean: string
  rnflMin: string
  rnflMax: string
  progPct: string
}

function getResponse(query: string, context: DatasetContext): string {
  const q = query.toLowerCase()

  if (q.includes('highest risk') || q.includes('high risk patient')) {
    return `To find the highest-risk patients, go to the Dashboard and click "Dataset Patients" tab. Use the sort dropdown to select "Highest Risk First" — the Critical and High risk patients will appear at the top. You can also filter to "Critical" risk only using the risk level dropdown.`
  }
  if (q.includes('rnfl below 70') || q.includes('thin rnfl')) {
    const rangeStr = context.rnflMean !== '—'
      ? ` (mean ${context.rnflMean} µm, range ${context.rnflMin}–${context.rnflMax} µm in the dataset)`
      : ''
    return `On the Dashboard, set the sort to "Thinnest RNFL First". Eyes with RNFL < 70 µm are flagged with an orange/red alert badge. The RNFL threshold levels are: Watch < 80 µm · Alert < 70 µm · Critical < 55 µm. In the dataset, many eyes fall below 80 µm${rangeStr}.`
  }
  if (q.includes('vf slope') || q.includes('visual field slope')) {
    return `The VF slope (dB/year) measures the rate of visual field change over time using Ordinary Least Squares regression. For dataset patients, it's computed from Mean Sensitivity (MS) across visits 1–3. For manual patients, it uses MD (Mean Deviation). A slope of −1.0 dB/yr is concerning; −2.0 dB/yr is critical. The dataset's MS slope is not identical to MD slope but is approximately comparable — this is stated in the app UI.`
  }
  if (q.includes('asymmetry') || q.includes('i/s') || q.includes('inferior')) {
    return `Inferior/Superior (I/S) asymmetry is the ratio of inferior RNFL to superior RNFL. Normally, inferior and superior sectors should be roughly symmetric (ratio ≥ 0.8). Glaucoma preferentially damages inferior RNFL fibers, causing asymmetric thinning. A low I/S ratio (< 0.8) is a clinically recognized glaucoma indicator. Nasal/Temporal (N/T) asymmetry > 1.5 is also tracked.`
  }
  if (q.includes('ms') && q.includes('md')) {
    return `Mean Sensitivity (MS) is the average dB value across all non-masked VF points (excluding -1 values representing blind spot or masked points) from the 61-point grid in this dataset. MD (Mean Deviation) is a clinical summary computed by comparing to age-matched normative values. They are approximately comparable for tracking change over time, but MS will typically be higher than MD. GlaucoMap labels which metric it uses for each patient and notes this approximation in the UI.`
  }
  if (q.includes('forecast') || q.includes('24-month') || q.includes('prediction')) {
    return `The 24-month forecasts use OLS linear regression on available visit data to compute a slope (dB/yr for VF, µm/yr for RNFL). Three scenarios are shown:\n• Current Treatment: slope × 1.0\n• Intensified: slope × 0.6 (based on ~35–50% slower progression with ~5 mmHg IOP reduction, from EMGT/OHTS)\n• Untreated: slope × 1.65 (50–80% faster without treatment, from CNTGS)\nWith only 1 visit, stage-based default slopes are used and labeled "low confidence". Confidence bands are ±1.96 SE.`
  }
  if (q.includes('auc') || q.includes('model metrics')) {
    const pctStr = context.progPct !== '—' ? `${context.progPct}%` : '~20%'
    return `AUC-ROC (Area Under ROC Curve) measures how well the model distinguishes progressors from non-progressors across all thresholds. AUC = 0.5 is random; 1.0 is perfect. PR-AUC (Precision-Recall AUC) is more meaningful with class imbalance (${pctStr} positive). Both metrics are honest out-of-fold estimates from GroupKFold cross-validation, where both eyes of a subject are always in the same fold to prevent data leakage.`
  }

  return `I can help you understand GlaucoMap's features and dataset. This AI companion uses template-based responses — no external LLM. Try one of the quick prompts below, or ask about: risk levels, RNFL sectors, IOP targets, VF slope, dataset limitations, or forecast methodology.\n\nDataset: ${context.nPatients} eyes · ${context.nProgressed} progressed (${((context.nProgressed / Math.max(1, context.nPatients)) * 100).toFixed(0)}%)`
}

export default function AICompanion() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m the GlaucoMap AI Companion. I can explain clinical findings, dataset methodology, and model decisions. Ask me anything about the app or glaucoma progression analysis.\n\n⚠️ This companion uses template-based responses from structured clinical data — no external AI is used. Nothing here is clinical advice.'
    }
  ])
  const [input, setInput] = useState('')
  const { datasetPatients } = useAppStore()
  const navigate = useNavigate()

  // Compute all context stats live from loaded data
  const rnflValues = datasetPatients.map(p => p.rnfl.mean).filter((v): v is number => v != null)
  const nProgressed = datasetPatients.filter(p => p.progressionFlags.any).length
  const nPatients = datasetPatients.length

  const context: DatasetContext = {
    nPatients,
    nProgressed,
    rnflMean: rnflValues.length ? (rnflValues.reduce((a, b) => a + b, 0) / rnflValues.length).toFixed(0) : '—',
    rnflMin:  rnflValues.length ? Math.min(...rnflValues).toFixed(0) : '—',
    rnflMax:  rnflValues.length ? Math.max(...rnflValues).toFixed(0) : '—',
    progPct:  nPatients > 0 ? ((nProgressed / nPatients) * 100).toFixed(1) : '—',
  }

  const send = (text?: string) => {
    const q = text || input.trim()
    if (!q) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: q }]
    setMessages(newMessages)
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', content: getResponse(q, context) }])
    }, 400)
  }

  return (
    <div className="min-h-full flex flex-col pb-0">
      <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-400" />
          AI Companion
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Template-based clinical Q&A — no external AI</p>
      </div>

      <div className="flex-1 px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
              m.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-sm'
                : 'glass-card text-slate-300 rounded-bl-sm'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
      </div>

      {/* Quick prompts */}
      <div className="px-6 py-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
          <Lightbulb className="w-3.5 h-3.5" />
          Quick questions:
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p}
              onClick={() => send(p)}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-800/60 border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-brand-500/30 transition-all"
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            id="ai-companion-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about the dataset, findings, or methodology..."
            className="input-field flex-1"
          />
          <button id="ai-send-btn" onClick={() => send()} className="btn-primary px-3">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
