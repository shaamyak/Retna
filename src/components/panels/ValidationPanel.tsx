import type { DatasetPatient, PatientAnalysis } from '@/types'
import { CheckCircle, XCircle, Minus, Info } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  patient: DatasetPatient
  analysis: PatientAnalysis
}

export default function ValidationPanel({ patient, analysis }: Props) {
  const { progressionFlags } = patient
  const modelProb = analysis.modelProbability

  const recorded = progressionFlags.any
  const predicted = modelProb != null ? modelProb > 0.5 : null

  const agreement =
    predicted === null ? 'unknown' :
    predicted === recorded ? 'agree' : 'disagree'

  const agreementStyle = {
    agree: { cls: 'bg-emerald-900/20 border-emerald-700/30 text-emerald-300', icon: CheckCircle, label: 'Model & Outcome Agree' },
    disagree: { cls: 'bg-amber-900/20 border-amber-700/30 text-amber-300', icon: XCircle, label: 'Model & Outcome Disagree' },
    unknown: { cls: 'bg-slate-800/40 border-white/[0.06] text-slate-400', icon: Minus, label: 'Model Probability Not Available' },
  }[agreement]

  const Icon = agreementStyle.icon

  const flagLabels = [
    { label: 'PLR2', active: progressionFlags.plr2 },
    { label: 'PLR3', active: progressionFlags.plr3 },
    { label: 'MD Flag', active: progressionFlags.md },
  ]

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Info className="w-4 h-4 text-brand-400" />
        <h2 className="section-title">Retrospective Validation</h2>
      </div>
      <p className="text-[10px] text-slate-500 mb-4">
        Out-of-fold model prediction (GroupKFold, subject-level) vs. recorded clinical progression outcome.
        Disagreements are equally informative — they reveal model limitations and borderline cases.
      </p>

      <div className={clsx('rounded-xl border p-4 flex items-center gap-3 mb-4', agreementStyle.cls)}>
        <Icon className="w-5 h-5 flex-shrink-0" />
        <div>
          <div className="font-semibold text-sm">{agreementStyle.label}</div>
          <div className="text-xs mt-0.5 opacity-80">
            Model: {modelProb != null ? `${(modelProb * 100).toFixed(0)}% progression probability` : 'Not available'} ·
            {' '}Threshold: 50%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Recorded outcome */}
        <div className="bg-slate-800/40 rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Recorded Outcome</div>
          <div className={clsx('text-sm font-bold', recorded ? 'text-red-400' : 'text-emerald-400')}>
            {recorded ? 'Progressed' : 'Stable'}
          </div>
          <div className="mt-2 space-y-1">
            {flagLabels.map(f => (
              <div key={f.label} className="flex items-center gap-2 text-xs">
                <span className={clsx('w-2 h-2 rounded-full', f.active ? 'bg-red-500' : 'bg-slate-700')} />
                <span className={f.active ? 'text-slate-300' : 'text-slate-600'}>{f.label}</span>
                <span className={f.active ? 'text-red-400' : 'text-slate-600'}>{f.active ? '✓' : '–'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model prediction */}
        <div className="bg-slate-800/40 rounded-xl p-3">
          <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">Model Prediction</div>
          {modelProb != null ? (
            <>
              <div className={clsx('text-sm font-bold', modelProb > 0.5 ? 'text-red-400' : 'text-emerald-400')}>
                {modelProb > 0.5 ? 'Progressed' : 'Stable'}
              </div>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Probability</span>
                  <span className="font-mono">{(modelProb * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full">
                  <div
                    className={clsx('h-full rounded-full', modelProb > 0.5 ? 'bg-red-500' : 'bg-emerald-500')}
                    style={{ width: `${modelProb * 100}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500">
              Run pipeline to compute out-of-fold predictions.
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-600 mt-3">
        Logistic regression trained with GroupKFold CV (subject-level grouping). Features: RNFL sectors, IOP, MS slope, CCT, age.
        Class imbalance handled with sample weights. Progression defined as PLR2 ∨ PLR3 ∨ MD flag positive.
      </p>
    </div>
  )
}
