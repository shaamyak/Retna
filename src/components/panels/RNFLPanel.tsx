import type { DatasetPatient, ManualPatient } from '@/types'
import { RNFL_THRESHOLDS } from '@/config/alerts'
import clsx from 'clsx'
import { Activity } from 'lucide-react'

interface Props {
  patient: DatasetPatient | ManualPatient
}

const NORMATIVE_SECTORS = {
  mean: { lower: 80, upper: 100, label: 'Mean' },
  superior: { lower: 97, upper: 130, label: 'Superior' },
  inferior: { lower: 102, upper: 138, label: 'Inferior' },
  nasal: { lower: 64, upper: 84, label: 'Nasal' },
  temporal: { lower: 57, upper: 76, label: 'Temporal' },
}

function SectorBar({ label, value, normLower, normUpper }: {
  label: string; value: number | null; normLower: number; normUpper: number
}) {
  const maxVal = normUpper * 1.3
  const pct = value != null ? Math.min(100, (value / maxVal) * 100) : 0
  const normLowerPct = (normLower / maxVal) * 100
  const normUpperPct = (normUpper / maxVal) * 100

  const color = value == null ? 'bg-slate-600'
    : value < RNFL_THRESHOLDS.CRITICAL ? 'bg-red-600'
    : value < RNFL_THRESHOLDS.ALERT ? 'bg-red-400'
    : value < RNFL_THRESHOLDS.WATCH ? 'bg-amber-400'
    : 'bg-emerald-400'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={clsx('font-mono font-medium',
          value == null ? 'text-slate-600' :
          value < RNFL_THRESHOLDS.ALERT ? 'text-red-400' :
          value < RNFL_THRESHOLDS.WATCH ? 'text-amber-400' : 'text-emerald-400'
        )}>
          {value != null ? `${value.toFixed(0)} µm` : '—'}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full relative">
        {/* Normative band */}
        <div
          className="absolute h-full bg-emerald-900/30 rounded-full"
          style={{ left: `${normLowerPct}%`, width: `${normUpperPct - normLowerPct}%` }}
        />
        {/* Value bar */}
        <div
          className={clsx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex text-[9px] text-slate-600">
        <span style={{ marginLeft: `${normLowerPct}%` }}>{normLower}</span>
        <span className="ml-auto" style={{ marginRight: `${100 - normUpperPct}%` }}>{normUpper}</span>
      </div>
    </div>
  )
}

export default function RNFLPanel({ patient }: Props) {
  const isDataset = patient.source === 'dataset'
  const sectors = isDataset
    ? (patient as DatasetPatient).rnfl
    : (() => {
        const mp = patient as ManualPatient
        return mp.rnflVisits.length > 0
          ? mp.rnflVisits[mp.rnflVisits.length - 1].sectors
          : { mean: null, superior: null, inferior: null, nasal: null, temporal: null }
      })()

  const isAsymmetric = sectors.inferior != null && sectors.superior != null
    && (sectors.inferior / sectors.superior) < 0.8

  return (
    <div className="glass-card p-5">
      <h2 className="section-title flex items-center gap-2 mb-1">
        <Activity className="w-5 h-5 text-brand-400" />
        RNFL Thickness
      </h2>
      <p className="text-[10px] text-slate-500 mb-4">
        {isDataset
          ? 'Baseline OCT measurement only. No longitudinal RNFL data in dataset.'
          : 'Most recent RNFL visit shown. Green band = approximate normative range.'}
      </p>

      <div className="space-y-3">
        {Object.entries(NORMATIVE_SECTORS).map(([key, norm]) => (
          <SectorBar
            key={key}
            label={norm.label}
            value={sectors[key as keyof typeof sectors]}
            normLower={norm.lower}
            normUpper={norm.upper}
          />
        ))}
      </div>

      {isAsymmetric && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300">
          ⚠ I/S asymmetry detected ({sectors.inferior?.toFixed(0)}µm / {sectors.superior?.toFixed(0)}µm). 
          Inferior thinning relative to superior is a glaucoma indicator.
        </div>
      )}

      {isDataset && (
        <p className="text-[10px] text-slate-600 mt-3">
          Normative hints: approximate lower/upper bounds. Values vary by instrument, age, and axial length.
        </p>
      )}
    </div>
  )
}
