import type { DatasetPatient, ManualPatient } from '@/types'
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import clsx from 'clsx'
import { BarChart2 } from 'lucide-react'

interface Props {
  patient: DatasetPatient | ManualPatient
}

/** Render the 61-point VF grid as a heatmap (10×8 with masked points) */
function VFHeatmap({ grid }: { grid: (number | null)[] }) {
  const rows = 8
  const cols = 10

  // Standard 61-point HVF 24-2 layout (simplified: fill row-major)
  const cells = []
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = idx < grid.length ? grid[idx] : null
      const isMasked = val === null
      const pct = val != null ? Math.min(100, (val / 35) * 100) : 0

      cells.push(
        <div
          key={`${r}-${c}`}
          title={val != null ? `${val} dB` : 'Masked/BS'}
          className="w-6 h-6 rounded text-[8px] font-mono flex items-center justify-center"
          style={{
            background: isMasked
              ? 'rgba(255,255,255,0.04)'
              : `hsl(${pct * 1.2}, 70%, ${15 + pct * 0.35}%)`,
            color: isMasked ? '#374151' : val! < 10 ? '#fca5a5' : val! < 20 ? '#fde68a' : '#bbf7d0'
          }}
        >
          {isMasked ? '·' : val}
        </div>
      )
      idx++
    }
  }

  return (
    <div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
        {cells}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[9px] text-slate-600">
        <span>0 dB</span>
        <div className="flex-1 h-1.5 rounded-full bg-gradient-to-r from-red-900 via-amber-700 to-emerald-700" />
        <span>35 dB</span>
      </div>
    </div>
  )
}

export default function VFPanel({ patient }: Props) {
  const isDataset = patient.source === 'dataset'
  const [selectedVisit, setSelectedVisit] = useState(0)
  const [showGrid, setShowGrid] = useState(false)

  if (isDataset) {
    const ds = patient as DatasetPatient
    const visitsWithMS = ds.visits.filter(v => v.ms != null)
    const trendData = visitsWithMS.map(v => ({
      label: `V${v.visitNumber}`,
      ms: v.ms,
    }))

    const currentVisit = ds.visits[selectedVisit]
    const hasGrid = currentVisit?.vfGrid && currentVisit.vfGrid.length > 0

    return (
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-brand-400" />
            Visual Field (Mean Sensitivity)
          </h2>
          {hasGrid && (
            <button
              id="toggle-vf-grid-btn"
              onClick={() => setShowGrid(s => !s)}
              className="btn-ghost text-xs"
            >
              {showGrid ? 'Hide' : 'Show'} VF Grid
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-500 mb-3">
          MS = Mean Sensitivity (dB, non-masked points). Used as the dataset's VF summary.
          MS is approximately comparable to MD but not identical.
        </p>

        {trendData.length > 1 ? (
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
                />
                <Line type="monotone" dataKey="ms" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: '#a78bfa' }} name="MS (dB)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-xs text-slate-500 h-12 flex items-center">Only 1 visit with VF data.</div>
        )}

        {/* Visit selector for grid */}
        {hasGrid && showGrid && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-400">Visit:</span>
              <div className="flex gap-1">
                {ds.visits.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedVisit(i)}
                    className={clsx('px-2 py-0.5 rounded text-xs',
                      selectedVisit === i ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400'
                    )}
                  >
                    V{v.visitNumber}
                  </button>
                ))}
              </div>
            </div>
            <VFHeatmap grid={currentVisit.vfGrid} />
          </div>
        )}
      </div>
    )
  } else {
    // Manual patient — uses MD
    const mp = patient as ManualPatient
    const trendData = mp.vfEntries.map((e, i) => ({
      label: e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : `VF${i+1}`,
      md: e.md,
      vfi: e.vfi,
    }))

    return (
      <div className="glass-card p-5">
        <h2 className="section-title flex items-center gap-2 mb-3">
          <BarChart2 className="w-5 h-5 text-brand-400" />
          Visual Field (MD / VFI)
        </h2>
        {mp.vfEntries.length === 0 ? (
          <div className="text-xs text-slate-500">No visual field data entered.</div>
        ) : (
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis yAxisId="md" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis yAxisId="vfi" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                  itemStyle={{ color: '#f1f5f9', fontSize: 11 }}
                />
                <ReferenceLine yAxisId="md" y={0} stroke="rgba(255,255,255,0.2)" />
                <Line yAxisId="md" type="monotone" dataKey="md" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4 }} name="MD (dB)" />
                <Line yAxisId="vfi" type="monotone" dataKey="vfi" stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="VFI (%)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    )
  }
}
