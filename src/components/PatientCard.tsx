import { useNavigate } from 'react-router-dom'
import type { ManualPatient, PatientAnalysis, RiskLevel } from '@/types'
import clsx from 'clsx'
import { AlertTriangle, ChevronRight, Trash2 } from 'lucide-react'

interface Props {
  patient: ManualPatient
  analysis?: PatientAnalysis
  isSelectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  onDelete?: () => void
}

const riskColors: Record<RiskLevel, string> = {
  Low:      'badge-low',
  Moderate: 'badge-moderate',
  High:     'badge-high',
  Critical: 'badge-critical',
}

const riskBorder: Record<RiskLevel, string> = {
  Low:      'border-emerald-500/10',
  Moderate: 'border-amber-500/20',
  High:     'border-orange-500/30',
  Critical: 'border-red-500/40 glow-danger',
}

export default function PatientCard({ patient, analysis, isSelectionMode, isSelected, onToggleSelect, onDelete }: Props) {
  const navigate = useNavigate()
  const riskLevel = analysis?.riskLevel ?? 'Low'

  // Most recent RNFL mean value the doctor entered
  const rnflMean = patient.rnflVisits.length > 0
    ? patient.rnflVisits[patient.rnflVisits.length - 1].sectors.mean
    : null

  // Mean IOP from analysis (computed from entered readings)
  const iop = analysis?.meanIOP

  // VF slope from analysis, or fall back to showing last MD entry
  const vfSlopeDisplay = analysis?.vfSlope != null
    ? { value: analysis.vfSlope.toFixed(1), unit: 'dB/yr', label: 'VF Slope' }
    : patient.vfEntries.length > 0 && patient.vfEntries[patient.vfEntries.length - 1].md != null
      ? { value: patient.vfEntries[patient.vfEntries.length - 1].md!.toFixed(1), unit: 'dB', label: 'Last MD' }
      : null

  return (
    <div
      id={`patient-card-${patient.id}`}
      onClick={(e) => {
        if (isSelectionMode) {
          onToggleSelect?.()
        } else {
          navigate(`/patient/${patient.id}`)
        }
      }}
      className={clsx(
        'glass-card-hover cursor-pointer p-4 border transition-all duration-200 relative',
        riskBorder[riskLevel],
        isSelectionMode && isSelected && 'ring-2 ring-brand-500'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-semibold text-slate-100 text-sm flex items-center gap-1">
            {isSelectionMode && (
              <input 
                type="checkbox" 
                checked={isSelected} 
                onChange={() => {}} 
                className="w-4 h-4 mr-2 accent-brand-500" 
              />
            )}
            {patient.name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-1">
            <span>{patient.laterality} · {patient.stage} · {patient.category}</span>
            {patient.isDemo && (
              <span className="badge bg-fuchsia-900/30 text-fuchsia-300 border-fuchsia-700/30 text-[9px] py-0 px-1.5 uppercase tracking-wide">
                Demo
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isSelectionMode && onDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded transition-colors"
              title="Delete patient"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <span className={clsx('badge', riskColors[riskLevel])}>
            {riskLevel}
          </span>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MetricMini
          label="RNFL"
          value={rnflMean != null ? `${rnflMean.toFixed(0)}` : '—'}
          unit="µm"
          warn={rnflMean != null && rnflMean < 70}
          critical={rnflMean != null && rnflMean < 55}
        />
        <MetricMini
          label="Mean IOP"
          value={iop != null ? `${iop.toFixed(0)}` : '—'}
          unit="mmHg"
          warn={iop != null && iop > 21}
          critical={iop != null && iop > 30}
        />
        <MetricMini
          label={vfSlopeDisplay?.label ?? 'VF'}
          value={vfSlopeDisplay?.value ?? '—'}
          unit={vfSlopeDisplay?.unit ?? ''}
          warn={analysis?.vfSlope != null && analysis.vfSlope < -1}
          critical={analysis?.vfSlope != null && analysis.vfSlope < -2}
        />
      </div>

      {/* Demographics */}
      <div className="text-xs text-slate-500 flex items-center gap-3 mb-3">
        <span>Age {patient.age}</span>
        <span>{patient.gender === 'M' ? 'Male' : 'Female'}</span>
        <span>{patient.laterality === 'OD' ? 'Right Eye' : 'Left Eye'}</span>
      </div>

      {/* Alerts preview */}
      {analysis && analysis.alerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {analysis.alerts.slice(0, 2).map(alert => (
            <div
              key={alert.id}
              className={clsx('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
                alert.severity === 'critical' ? 'bg-red-900/40 text-red-300' :
                alert.severity === 'alert' ? 'bg-amber-900/40 text-amber-300' :
                'bg-slate-800 text-slate-400'
              )}
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {alert.title}
            </div>
          ))}
          {analysis.alerts.length > 2 && (
            <span className="text-[10px] text-slate-500">+{analysis.alerts.length - 2} more</span>
          )}
        </div>
      )}

      {/* Risk bar */}
      {analysis && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Risk Score</span>
            <span className="font-mono">{analysis.riskScore}/100</span>
          </div>
          <div className="h-1 rounded-full bg-slate-800">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                riskLevel === 'Critical' ? 'bg-red-500' :
                riskLevel === 'High' ? 'bg-orange-500' :
                riskLevel === 'Moderate' ? 'bg-amber-400' : 'bg-emerald-500'
              )}
              style={{ width: `${analysis.riskScore}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer arrow */}
      <div className="flex justify-end mt-3">
        <ChevronRight className="w-4 h-4 text-slate-600" />
      </div>
    </div>
  )
}

function MetricMini({ label, value, unit, warn, critical }: {
  label: string; value: string; unit: string; warn?: boolean; critical?: boolean
}) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-2 text-center">
      <div className={clsx(
        'text-sm font-bold font-mono',
        critical ? 'text-red-400' : warn ? 'text-amber-400' : 'text-slate-200'
      )}>
        {value}
        {unit && <span className="text-[9px] font-normal text-slate-500 ml-0.5">{unit}</span>}
      </div>
      <div className="text-[9px] text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
