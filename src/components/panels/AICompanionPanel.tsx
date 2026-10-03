import type { PatientAnalysis, DatasetPatient, ManualPatient } from '@/types'
import { MessageSquare, Copy, CheckCircle } from 'lucide-react'
import { useState } from 'react'

interface Props {
  analysis: PatientAnalysis
  patient: DatasetPatient | ManualPatient
}

export default function AICompanionPanel({ analysis, patient }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(analysis.aiSummary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-brand-400" />
          AI Companion Summary
        </h2>
        <button onClick={copy} className="btn-ghost text-xs">
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="bg-slate-800/40 rounded-xl p-3 text-xs text-slate-300 leading-relaxed border border-white/[0.05]">
        {analysis.aiSummary}
      </div>

      <div className="mt-3 px-3 py-2 rounded-lg bg-slate-800/30 border border-white/[0.04]">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          ℹ️ This summary is generated from structured clinical data using rule-based templates.
          No external AI or LLM is used. It does not constitute a clinical diagnosis.
          All treatment decisions must be made by a qualified ophthalmologist.
        </p>
      </div>
    </div>
  )
}
