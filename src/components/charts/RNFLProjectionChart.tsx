import { useState, useMemo } from 'react'
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, ComposedChart, ReferenceLine
} from 'recharts'
import { SCENARIOS, RNFL_PROJECTION_CONFIG } from '@/config/scenarios'

interface Props {
  baselineRnfl: number | null
  currentIop: number | null
  targetIop: number
  measuredSlope: number | null
}

function generateRnflProjection(
  baseline: number,
  currentIop: number,
  targetIop: number,
  measuredSlope: number | null,
  horizonMonths: number,
  isDelta: boolean
) {
  const { base_rate, reference_IOP, k, floor, untreated_offset, confidence_band } = RNFL_PROJECTION_CONFIG

  const iopScenarios = {
    current: currentIop,
    intensified: targetIop,
    untreated: currentIop + untreated_offset
  }

  // Calculate modeled loss per year
  const getModeledLoss = (iop: number) => {
    return Math.max(0, base_rate * (1 + k * (iop - reference_IOP) / reference_IOP))
  }

  const lossCurrent = getModeledLoss(iopScenarios.current)
  
  let slopeCurrent = -lossCurrent
  let slopeIntensified = -getModeledLoss(iopScenarios.intensified)
  let slopeUntreated = -getModeledLoss(iopScenarios.untreated)
  let slopeSource = 'Assumed slope'

  if (measuredSlope != null && Math.abs(lossCurrent) > 0.001) {
    slopeCurrent = measuredSlope
    slopeIntensified = measuredSlope * (getModeledLoss(iopScenarios.intensified) / lossCurrent)
    slopeUntreated = measuredSlope * (getModeledLoss(iopScenarios.untreated) / lossCurrent)
    slopeSource = 'Measured slope'
  }

  const ticks = horizonMonths === 24 ? [0, 6, 12, 18, 24] 
              : horizonMonths === 60 ? [0, 12, 24, 36, 48, 60]
              : [0, 24, 48, 72, 96, 120]

  const data = ticks.map(mo => {
    const label = mo === 0 ? 'Now' : `+${mo}mo`
    const yr = mo / 12
    
    let c = baseline + slopeCurrent * yr
    let i = baseline + slopeIntensified * yr
    let u = baseline + slopeUntreated * yr

    if (baseline >= floor) {
      c = Math.max(floor, c)
      i = Math.max(floor, i)
      u = Math.max(floor, u)
    } else {
      c = Math.max(baseline, c)
      i = Math.max(baseline, i)
      u = Math.max(baseline, u)
    }

    if (isDelta) {
      c -= baseline
      i -= baseline
      u -= baseline
    }

    return {
      label,
      yr,
      current: c,
      currentArea: [c - confidence_band, c + confidence_band],
      intensified: i,
      intensifiedArea: [i - confidence_band, i + confidence_band],
      untreated: u,
      untreatedArea: [u - confidence_band, u + confidence_band]
    }
  })

  return { data, slopeCurrent, slopeIntensified, slopeUntreated, slopeSource }
}

export default function RNFLProjectionChart({ baselineRnfl, currentIop, targetIop, measuredSlope }: Props) {
  const [horizon, setHorizon] = useState<24 | 60 | 120>(24)
  const [isDelta, setIsDelta] = useState(false)

  if (baselineRnfl == null || currentIop == null) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500 border border-white/5 rounded-xl bg-slate-900/30">
        Baseline RNFL and mean IOP required for projection.
      </div>
    )
  }

  const { data, slopeCurrent, slopeIntensified, slopeUntreated, slopeSource } = useMemo(() => {
    return generateRnflProjection(baselineRnfl, currentIop, targetIop, measuredSlope, horizon, isDelta)
  }, [baselineRnfl, currentIop, targetIop, measuredSlope, horizon, isDelta])

  const allValues = data.flatMap(d => [d.currentArea[0], d.untreatedArea[0], d.intensifiedArea[0], d.currentArea[1], d.untreatedArea[1], d.intensifiedArea[1]])
  const minV = Math.min(...allValues)

  let yMin = Math.floor(minV) - 5
  let yMax = Math.ceil(isDelta ? 0 : baselineRnfl) + 5
  if (yMax - yMin < 10) yMin = yMax - 10

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const validPayloads = payload.filter((p: any) => typeof p.value === 'number')
    if (validPayloads.length === 0) return null
    return (
      <div className="bg-slate-800 border border-white/10 rounded-lg p-3 text-xs shadow-xl z-50">
        <div className="font-medium text-slate-200 mb-2">{label}</div>
        {validPayloads.map((p: any) => {
          const val = p.value
          const diff = isDelta ? val : val - baselineRnfl
          const sign = diff > 0 ? '+' : ''
          return (
            <div key={p.name} className="flex justify-between gap-4">
              <span style={{ color: p.color }}>{p.name}</span>
              <span className="font-mono text-slate-200">
                {val.toFixed(1)} {isDelta ? '' : 'µm'} ({sign}{diff.toFixed(1)} µm)
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const finalC = data[data.length - 1].current.toFixed(1)
  const finalI = data[data.length - 1].intensified.toFixed(1)
  const finalU = data[data.length - 1].untreated.toFixed(1)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-2">
          {[24, 60, 120].map(mo => (
            <button
              key={mo}
              onClick={() => setHorizon(mo as 24|60|120)}
              className={`px-2 py-1 rounded transition-colors ${horizon === mo ? 'bg-brand-500/20 text-brand-300' : 'text-slate-400 hover:bg-slate-800'}`}
            >
              {mo} months
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors">
          <input 
            type="checkbox" 
            checked={isDelta} 
            onChange={(e) => setIsDelta(e.target.checked)}
            className="accent-brand-500"
          />
          Change from baseline (ΔRNFL µm)
        </label>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="rnflUntreatedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="rnflCurrentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5896f8" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#5896f8" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="rnflIntensifiedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis domain={[yMin, yMax]} tick={{ fontSize: 10, fill: '#64748b' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
              formatter={(value) => <span style={{ color: '#94a3b8' }}>{value}</span>}
            />
            
            {/* Bands */}
            <Area type="monotone" dataKey="untreatedArea" stroke="none" fill="url(#rnflUntreatedGrad)" legendType="none" name="Untreated Band" />
            <Area type="monotone" dataKey="currentArea" stroke="none" fill="url(#rnflCurrentGrad)" legendType="none" name="Current Band" />
            <Area type="monotone" dataKey="intensifiedArea" stroke="none" fill="url(#rnflIntensifiedGrad)" legendType="none" name="Intensified Band" />
            
            {/* Lines */}
            <Line
              type="monotone" dataKey="untreated" name={`Untreated (${slopeUntreated.toFixed(1)} µm/yr) → ${finalU}`}
              stroke={SCENARIOS.untreated.colorHex} strokeWidth={2.5}
              strokeDasharray="4 4" dot={false}
            />
            <Line
              type="monotone" dataKey="current" name={`Current (${slopeCurrent.toFixed(1)} µm/yr) → ${finalC}`}
              stroke={SCENARIOS.current.colorHex} strokeWidth={2.5}
              dot={{ r: 3, fill: SCENARIOS.current.colorHex }}
            />
            <Line
              type="monotone" dataKey="intensified" name={`Intensified (${slopeIntensified.toFixed(1)} µm/yr) → ${finalI}`}
              stroke={SCENARIOS.intensified.colorHex} strokeWidth={2.5}
              strokeDasharray="6 2" dot={false}
            />

            {!isDelta && <ReferenceLine y={RNFL_PROJECTION_CONFIG.floor} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" label={{ position: 'insideBottomLeft', value: 'OCT floor effect', fill: '#94a3b8', fontSize: 10 }} />}
            {!isDelta && <ReferenceLine y={RNFL_PROJECTION_CONFIG.concern_threshold} stroke="rgba(239,68,68,0.3)" strokeDasharray="3 3" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-2">
        <p className="text-[10px] text-slate-500">
          Illustrative projection based on population-average progression rates ({slopeSource}); not a clinical prediction.
          Y-axis is zoomed to show differences. {horizon >= 60 && 'Long-range extrapolation, low confidence.'}
        </p>
      </div>
    </div>
  )
}
