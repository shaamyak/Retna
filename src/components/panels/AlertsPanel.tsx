import type { Alert } from '@/types'
import clsx from 'clsx'
import { AlertTriangle, AlertCircle, Eye, TrendingDown, Activity, Bell } from 'lucide-react'

interface Props {
  alerts: Alert[]
}

const severityStyles = {
  critical: { bg: 'bg-red-900/30 border-red-700/40', icon: 'text-red-400', label: 'CRITICAL' },
  alert:    { bg: 'bg-amber-900/30 border-amber-700/30', icon: 'text-amber-400', label: 'ALERT' },
  watch:    { bg: 'bg-blue-900/20 border-blue-700/20', icon: 'text-blue-400', label: 'WATCH' },
}

const typeIcons = {
  rnfl:        Activity,
  iop:         Eye,
  vf:          TrendingDown,
  progression: AlertCircle,
  asymmetry:   AlertTriangle,
}

export default function AlertsPanel({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="glass-card p-4">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-brand-400" />
          Clinical Alerts
        </h2>
        <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-700/20 rounded-xl p-3">
          <Eye className="w-4 h-4" />
          No active alerts for this patient.
        </div>
      </div>
    )
  }

  const sorted = [...alerts].sort((a, b) => {
    const order = { critical: 0, alert: 1, watch: 2 }
    return order[a.severity] - order[b.severity]
  })

  return (
    <div className="glass-card p-4">
      <h2 className="section-title mb-3 flex items-center gap-2">
        <Bell className="w-4 h-4 text-brand-400" />
        Clinical Alerts
        <span className="ml-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {alerts.filter(a => a.severity === 'critical').length || alerts.length}
        </span>
      </h2>
      <div className="space-y-2">
        {sorted.map(alert => {
          const style = severityStyles[alert.severity]
          const Icon = typeIcons[alert.type] ?? AlertTriangle
          return (
            <div key={alert.id} className={clsx('rounded-xl border p-3', style.bg)}>
              <div className="flex items-start gap-2">
                <Icon className={clsx('w-4 h-4 flex-shrink-0 mt-0.5', style.icon)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={clsx('text-[9px] font-bold uppercase tracking-wider', style.icon)}>
                      {style.label}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200">{alert.title}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{alert.detail}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
