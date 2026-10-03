import type { DatasetPatient, ManualPatient, PatientAnalysis } from '@/types'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart
} from 'recharts'
import { IOP_THRESHOLDS } from '@/config/alerts'
import { useAppStore } from '@/store/appStore'
import { Droplets } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  patient: DatasetPatient | ManualPatient
  analysis: PatientAnalysis | null
}

export default function IOPPanel({ patient, analysis }: Props) {
  const { targetIOP, setTargetIOP } = useAppStore()
  const isDataset = patient.source === 'dataset'

  let data: { label: string; iop: number }[] = []

  if (isDataset) {
    const ds = patient as DatasetPatient
    data = ds.visits
      .filter(v => v.iop != null)
      .map(v => ({
        label: `V${v.visitNumber}`,
        iop: v.iop!
      }))
  } else {
    const mp = patient as ManualPatient
    data = mp.iopReadings.map((r, i) => ({
      label: r.date ? new Date(r.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `R${i+1}`,
      iop: r.value
    }))
  }

  const meanIOP = analysis?.meanIOP ?? null
  const maxIOP = analysis?.maxIOP ?? null

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title flex items-center gap-2">
          <Droplets className="w-5 h-5 text-brand-400" />
          IOP Over Time
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Target IOP:</span>
          <input
            id="target-iop-input"
            type="number"
            value={targetIOP}
            onChange={e => setTargetIOP(Number(e.target.value))}
            min={5} max={30}
            className="input-field w-16 text-center text-xs py-1"
          />
          <span className="text-xs text-slate-500">mmHg</span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-slate-500 text-sm">No IOP data available</div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis domain={[5, 40]} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
              />
              <ReferenceLine y={targetIOP} stroke="#22c55e" strokeDasharray="4 4" label={{ value: `Target ${targetIOP}`, position: 'right', fill: '#22c55e', fontSize: 9 }} />
              <ReferenceLine y={IOP_THRESHOLDS.ELEVATED} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '21', position: 'right', fill: '#f59e0b', fontSize: 9 }} />
              <Line
                type="monotone" dataKey="iop" stroke="#5896f8" strokeWidth={2}
                dot={{ r: 4, fill: '#5896f8', stroke: '#1d4fe5', strokeWidth: 2 }}
                name="IOP (mmHg)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="bg-slate-800/40 rounded-lg p-3 text-center">
          <div className="text-lg font-bold font-mono text-slate-200">
            {meanIOP != null ? meanIOP.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Mean (mmHg)</div>
        </div>
        <div className={clsx('bg-slate-800/40 rounded-lg p-3 text-center', maxIOP != null && maxIOP > IOP_THRESHOLDS.HIGH ? 'ring-1 ring-red-500/40' : '')}>
          <div className={clsx('text-lg font-bold font-mono', maxIOP != null && maxIOP > IOP_THRESHOLDS.ELEVATED ? 'text-amber-400' : 'text-slate-200')}>
            {maxIOP != null ? maxIOP.toFixed(0) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Peak (mmHg)</div>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-3 text-center">
          <div className={clsx('text-lg font-bold font-mono',
            data.filter(d => d.iop > targetIOP).length >= 2 ? 'text-orange-400' : 'text-slate-200'
          )}>
            {data.filter(d => d.iop > targetIOP).length}/{data.length}
          </div>
          <div className="text-[10px] text-slate-500">Above Target</div>
        </div>
      </div>
    </div>
  )
}
