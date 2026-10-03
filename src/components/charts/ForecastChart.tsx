import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, ComposedChart
} from 'recharts'
import type { ScenarioForecast } from '@/types'
import { SCENARIOS } from '@/config/scenarios'

interface Props {
  data: ScenarioForecast
  yLabel: string
}

export default function ForecastChart({ data, yLabel }: Props) {
  // Merge all scenarios into one dataset
  const merged = data.current.map((pt, i) => {
    return {
      label: pt.label,
      current: pt.value,
      currentLower: pt.lower,
      currentUpper: pt.upper,
      // Recharts Area filling between lower and upper requires an array:
      currentArea: [pt.lower, pt.upper],
      intensified: data.intensified[i]?.value,
      untreated: data.untreated[i]?.value,
      untreatedArea: data.untreated[i] ? [data.untreated[i].lower, data.untreated[i].upper] : null,
    }
  })

  const allValues = merged.flatMap(d => [
    d.currentArea?.[0], d.currentArea?.[1],
    d.untreatedArea?.[0], d.untreatedArea?.[1],
    d.intensified
  ]).filter((v): v is number => v != null && !isNaN(v))

  if (allValues.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500 border border-white/5 rounded-xl bg-slate-900/30">
        Data unavailable or invalid for this projection.
      </div>
    )
  }

  const minV = Math.min(...allValues)
  const maxV = Math.max(...allValues)
  
  if (minV === maxV) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500 border border-white/5 rounded-xl bg-slate-900/30">
        Projection is flat ({minV} {yLabel}). No change predicted based on current inputs.
      </div>
    )
  }

  const yMin = Math.floor(minV - 2)
  const yMax = Math.ceil(maxV + 2)

  const CustomTooltip = ({ active, payload, label }: any) => {
    // filter out Area payloads
    if (!active || !payload?.length) return null
    const validPayloads = payload.filter((p: any) => typeof p.value === 'number')
    if (validPayloads.length === 0) return null
    return (
      <div className="bg-slate-800 border border-white/10 rounded-lg p-3 text-xs shadow-xl z-50">
        <div className="font-medium text-slate-200 mb-2">{label}</div>
        {validPayloads.map((p: any) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="font-mono text-slate-200">{p.value?.toFixed(1)} {yLabel}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="untreatedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5896f8" stopOpacity={0.1} />
              <stop offset="95%" stopColor="#5896f8" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
          />
          {/* Untreated band */}
          <Area
            type="monotone" dataKey="untreatedArea" stroke="none"
            fill="url(#untreatedGrad)" legendType="none" name="Untreated Range"
          />
          {/* Current band */}
          <Area
            type="monotone" dataKey="currentArea" stroke="none"
            fill="url(#currentGrad)" legendType="none" name="Current Range"
          />
          <Line
            type="monotone" dataKey="untreated" name="Untreated"
            stroke={SCENARIOS.untreated.colorHex} strokeWidth={2.5}
            strokeDasharray="4 4" dot={false}
          />
          <Line
            type="monotone" dataKey="current" name="Current Treatment"
            stroke={SCENARIOS.current.colorHex} strokeWidth={2.5}
            dot={{ r: 3, fill: SCENARIOS.current.colorHex }}
          />
          <Line
            type="monotone" dataKey="intensified" name="Intensified"
            stroke={SCENARIOS.intensified.colorHex} strokeWidth={2.5}
            strokeDasharray="6 2" dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
