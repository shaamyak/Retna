import type { PatientAnalysis, EvidenceFactor } from '@/types'
import clsx from 'clsx'
import { ShieldCheck, ShieldAlert, ShieldOff, Minus, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

interface Props {
  analysis: PatientAnalysis
}

const contribStyles = {
  protective: { icon: ShieldCheck, cls: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/20', bar: 'bg-emerald-500' },
  neutral:    { icon: Minus,       cls: 'text-slate-400',   bg: 'bg-slate-800/40 border-white/[0.04]',      bar: 'bg-slate-600'  },
  concerning: { icon: ShieldAlert, cls: 'text-amber-400',   bg: 'bg-amber-900/20 border-amber-700/20',      bar: 'bg-amber-500'  },
  critical:   { icon: ShieldOff,   cls: 'text-red-400',     bg: 'bg-red-900/20 border-red-700/20',          bar: 'bg-red-500'    },
}

function FactorRow({ factor }: { factor: EvidenceFactor }) {
  const [expanded, setExpanded] = useState(false)
  const style = contribStyles[factor.contribution]
  const Icon = style.icon

  return (
    <div className={clsx('rounded-lg border p-2.5 cursor-pointer select-none', style.bg)}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-2">
        <Icon className={clsx('w-3.5 h-3.5 flex-shrink-0', style.cls)} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-slate-300 truncate">{factor.factor}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={clsx('text-xs font-mono font-bold', style.cls)}>
            {factor.value} <span className="text-slate-600 font-normal">{factor.unit}</span>
          </span>
          {expanded ? <ChevronUp className="w-3 h-3 text-slate-600" /> : <ChevronDown className="w-3 h-3 text-slate-600" />}
        </div>
      </div>
      {expanded && (
        <p className="text-[11px] text-slate-400 mt-2 ml-5 leading-relaxed">{factor.detail}</p>
      )}
    </div>
  )
}

export default function EvidenceBreakdown({ analysis }: Props) {
  const { evidenceFactors, riskLevel, riskScore, modelProbability } = analysis

  const counts = {
    critical: evidenceFactors.filter(f => f.contribution === 'critical').length,
    concerning: evidenceFactors.filter(f => f.contribution === 'concerning').length,
    neutral: evidenceFactors.filter(f => f.contribution === 'neutral').length,
    protective: evidenceFactors.filter(f => f.contribution === 'protective').length,
  }

  return (
    <div className="glass-card p-4">
      <h2 className="section-title mb-1">Evidence Breakdown</h2>
      <p className="text-[10px] text-slate-500 mb-3">
        Multiple lines of evidence contributing to the risk assessment. Click any row to expand.
      </p>

      {/* Risk score ring */}
      <div className="flex items-center gap-4 mb-4 p-3 rounded-xl bg-slate-800/40">
        <div className="relative w-14 h-14 flex-shrink-0">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <circle
              cx="28" cy="28" r="24" fill="none"
              stroke={riskLevel === 'Critical' ? '#ef4444' : riskLevel === 'High' ? '#f97316' : riskLevel === 'Moderate' ? '#f59e0b' : '#10b981'}
              strokeWidth="5"
              strokeDasharray={`${(riskScore / 100) * 150.8} 150.8`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold font-mono text-slate-100">{riskScore}</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className={clsx('text-base font-bold',
            riskLevel === 'Critical' ? 'text-red-400' :
            riskLevel === 'High' ? 'text-orange-400' :
            riskLevel === 'Moderate' ? 'text-amber-400' : 'text-emerald-400'
          )}>
            {riskLevel} Risk
          </div>
          {modelProbability != null && (
            <div className="text-xs text-slate-500 mt-0.5">
              Model: {(modelProbability * 100).toFixed(0)}% progression probability
            </div>
          )}
          <div className="text-[10px] text-slate-600 mt-1 flex gap-2 flex-wrap">
            {counts.critical > 0 && <span className="text-red-400">{counts.critical} critical</span>}
            {counts.concerning > 0 && <span className="text-amber-400">{counts.concerning} concerning</span>}
            {counts.neutral > 0 && <span className="text-slate-500">{counts.neutral} neutral</span>}
            {counts.protective > 0 && <span className="text-emerald-400">{counts.protective} protective</span>}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-hidden">
        {/* Show critical/concerning first */}
        {[...evidenceFactors]
          .sort((a, b) => {
            const order = { critical: 0, concerning: 1, neutral: 2, protective: 3 }
            return order[a.contribution] - order[b.contribution]
          })
          .map((f, i) => <FactorRow key={i} factor={f} />)}
      </div>
    </div>
  )
}
