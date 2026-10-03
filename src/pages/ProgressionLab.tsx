import { useState } from 'react'
import { useAppStore } from '@/store/appStore'
import { SCENARIOS, DEFAULT_SLOPES } from '@/config/scenarios'
import { FlaskConical, Info } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend
} from 'recharts'
import clsx from 'clsx'
import type { GlaucomaStage } from '@/types'

const stages: GlaucomaStage[] = ['Suspect', 'Early', 'Moderate', 'Advanced']

function buildScenarioData(
  baseline: number,
  slope: number,
  multipliers: { current: number; intensified: number; untreated: number }
) {
  return [0, 6, 12, 18, 24].map(mo => {
    const yr = mo / 12
    return {
      label: mo === 0 ? 'Now' : `+${mo}mo`,
      current:     +(baseline + slope * yr * multipliers.current).toFixed(2),
      intensified: +(baseline + slope * yr * multipliers.intensified).toFixed(2),
      untreated:   +(baseline + slope * yr * multipliers.untreated).toFixed(2),
    }
  })
}

export default function ProgressionLab() {
  const { datasetPatients, analysisCache } = useAppStore()

  // Compute distribution stats live from loaded data — never hardcoded
  const rnflValues = datasetPatients.map(p => p.rnfl.mean).filter((v): v is number => v != null)
  const rnflMin    = rnflValues.length ? Math.min(...rnflValues).toFixed(0) : '—'
  const rnflMax    = rnflValues.length ? Math.max(...rnflValues).toFixed(0) : '—'
  const rnflMean   = rnflValues.length
    ? (rnflValues.reduce((a, b) => a + b, 0) / rnflValues.length).toFixed(0)
    : '—'
  const nTotal     = datasetPatients.length
  const nProgressed = datasetPatients.filter(p => p.progressionFlags.any).length
  const nPLR2       = datasetPatients.filter(p => p.progressionFlags.plr2).length
  const nPLR3       = datasetPatients.filter(p => p.progressionFlags.plr3).length
  const nMD         = datasetPatients.filter(p => p.progressionFlags.md).length
  const progPct     = nTotal > 0 ? ((nProgressed / nTotal) * 100).toFixed(1) : '—'
  const [stage, setStage] = useState<GlaucomaStage>('Moderate')
  const [baselineVF, setBaselineVF] = useState(-4)
  const [baselineRNFL, setBaselineRNFL] = useState(72)
  const [customVFSlope, setCustomVFSlope] = useState<number | ''>('')
  const [customRNFLSlope, setCustomRNFLSlope] = useState<number | ''>('')
  const [iopReduction, setIopReduction] = useState(5)

  const defaultSlopes = DEFAULT_SLOPES[stage]
  const vfSlope = customVFSlope !== '' ? Number(customVFSlope) : defaultSlopes.vf
  const rnflSlope = customRNFLSlope !== '' ? Number(customRNFLSlope) : defaultSlopes.rnfl

  // IOP adjustment on intensified scenario
  const iopAdjFactor = 1 - (iopReduction * 0.10)  // 10% per mmHg

  const vfData = buildScenarioData(baselineVF, vfSlope, {
    current: SCENARIOS.current.vfSlopeMultiplier,
    intensified: SCENARIOS.intensified.vfSlopeMultiplier * iopAdjFactor,
    untreated: SCENARIOS.untreated.vfSlopeMultiplier,
  })

  const rnflData = buildScenarioData(baselineRNFL, rnflSlope, {
    current: SCENARIOS.current.rnflSlopeMultiplier,
    intensified: SCENARIOS.intensified.rnflSlopeMultiplier * iopAdjFactor,
    untreated: SCENARIOS.untreated.rnflSlopeMultiplier,
  })

  return (
    <div className="min-h-full pb-12">
      <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/[0.06] px-6 py-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-brand-400" />
          Progression Lab
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Interactive scenario modelling — adjust parameters and see 24-month projections
        </p>
      </div>

      <div className="px-6 py-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="glass-card p-5 space-y-5">
          <h2 className="section-title">Parameters</h2>

          <div className="px-3 py-2.5 rounded-xl bg-amber-900/20 border border-amber-700/30 flex gap-2 items-start">
            <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300/80 leading-relaxed">
              Scenario multipliers are modeling assumptions derived from published trial literature
              (OHTS, EMGT, CNTGS). ~10% risk change per 1 mmHg IOP change. Not a clinical prescription.
            </p>
          </div>

          <div>
            <label className="label mb-1.5 block">Disease Stage</label>
            <div className="grid grid-cols-2 gap-1.5">
              {stages.map(s => (
                <button
                  key={s}
                  id={`stage-btn-${s.toLowerCase()}`}
                  onClick={() => setStage(s)}
                  className={clsx('py-2 rounded-lg text-xs font-medium transition-all',
                    stage === s ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <SliderField
            id="baseline-vf"
            label={`Baseline VF (MD/MS)`}
            value={baselineVF}
            min={-35} max={3} step={0.5}
            unit="dB"
            onChange={setBaselineVF}
          />
          <SliderField
            id="baseline-rnfl"
            label="Baseline RNFL"
            value={baselineRNFL}
            min={40} max={130} step={1}
            unit="µm"
            onChange={setBaselineRNFL}
          />

          <div>
            <label className="label mb-1.5 block">
              VF Slope (leave blank to use stage default: {defaultSlopes.vf} dB/yr)
            </label>
            <input
              id="custom-vf-slope"
              type="number"
              placeholder={`${defaultSlopes.vf}`}
              value={customVFSlope}
              onChange={e => setCustomVFSlope(e.target.value === '' ? '' : Number(e.target.value))}
              step={0.1}
              className="input-field"
            />
          </div>

          <div>
            <label className="label mb-1.5 block">
              RNFL Slope (leave blank: {defaultSlopes.rnfl} µm/yr)
            </label>
            <input
              id="custom-rnfl-slope"
              type="number"
              placeholder={`${defaultSlopes.rnfl}`}
              value={customRNFLSlope}
              onChange={e => setCustomRNFLSlope(e.target.value === '' ? '' : Number(e.target.value))}
              step={0.1}
              className="input-field"
            />
          </div>

          <SliderField
            id="iop-reduction"
            label="IOP reduction for intensified scenario"
            value={iopReduction}
            min={1} max={15} step={1}
            unit="mmHg"
            onChange={setIopReduction}
          />

          <div className="text-xs text-slate-500 space-y-1 border-t border-white/[0.06] pt-3">
            <p><span className="text-blue-400">●</span> Current: {SCENARIOS.current.vfSlopeMultiplier}× slope</p>
            <p><span className="text-emerald-400">●</span> Intensified: {(SCENARIOS.intensified.vfSlopeMultiplier * iopAdjFactor).toFixed(2)}× slope (after IOP adj.)</p>
            <p><span className="text-red-400">●</span> Untreated: {SCENARIOS.untreated.vfSlopeMultiplier}× slope</p>
          </div>
        </div>

        {/* Charts */}
        <div className="xl:col-span-2 space-y-6">
          <ChartCard title="Visual Field Projection (dB)" data={vfData} yLabel="dB" />
          <ChartCard title="RNFL Thickness Projection (µm)" data={rnflData} yLabel="µm" refLine={70} refLabel="Alert" />

          <div className="glass-card p-5">
            <h2 className="section-title mb-3">Dataset Distribution</h2>
            <p className="text-xs text-slate-500 mb-4">
              Where does this virtual patient sit relative to the {nTotal > 0 ? nTotal : '…'} dataset eyes?
            </p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="label mb-1">Dataset RNFL Mean Distribution</div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>Min: {rnflMin} µm · Max: {rnflMax} µm · Mean: {rnflMean} µm</div>
                  <div className={clsx(baselineRNFL < 70 ? 'text-red-400' : 'text-emerald-400')}>
                    Your value ({baselineRNFL} µm) is {baselineRNFL < 70 ? 'below alert threshold' : 'within typical range'}
                  </div>
                </div>
              </div>
              <div>
                <div className="label mb-1">Progressed Eyes in Dataset</div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  {nTotal > 0
                    ? <div>{nProgressed} of {nTotal} eyes ({progPct}%) progressed by any criterion</div>
                    : <div className="text-slate-500">Run pipeline to load dataset.</div>
                  }
                  {nTotal > 0 && <div className="text-slate-500">PLR2: {nPLR2} · PLR3: {nPLR3} · MD flag: {nMD}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SliderField({ id, label, value, min, max, step, unit, onChange }: {
  id: string; label: string; value: number; min: number; max: number
  step: number; unit: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <label className="label" htmlFor={id}>{label}</label>
        <span className="text-xs font-mono text-slate-300">{value} {unit}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-brand-500 cursor-pointer"
      />
    </div>
  )
}

function ChartCard({ title, data, yLabel, refLine, refLabel }: {
  title: string; data: any[]; yLabel: string; refLine?: number; refLabel?: string
}) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} itemStyle={{ color: '#f1f5f9', fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>} />
            {refLine != null && <ReferenceLine y={refLine} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: refLabel, position: 'right', fill: '#f59e0b', fontSize: 9 }} />}
            <Line type="monotone" dataKey="untreated" name="Untreated" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="current" name="Current" stroke="#5896f8" strokeWidth={2} dot={{ r: 3, fill: '#5896f8' }} />
            <Line type="monotone" dataKey="intensified" name="Intensified" stroke="#10b981" strokeWidth={1.5} strokeDasharray="6 2" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
